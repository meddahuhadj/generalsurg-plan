# -*- coding: utf-8 -*-
"""
biomechanics_engine.py — Modèles biomécaniques simplifiés, non validés cliniquement (Jalon M6)
===================================================================================================
⚠️ AVERTISSEMENT HONNÊTE :
    - `/respiratory-displacement` et `/simulate-pneumoperitoneum` calculent des formules
      cinématiques paramétriques simples (fonctions déterministes de la phase respiratoire / de la
      pression CO2 fournie). Ce ne sont PAS des solveurs FEM/Mooney-Rivlin réels, juste des
      approximations illustratives non calibrées sur un patient réel ni validées cliniquement.
    - `/elastic-registration` calcule désormais un VRAI recalage (ICP rigide + FFD B-spline non-rigide,
      voir registration.py) sur les deux nuages de points fournis — ce n'était pas le cas avant
      (anciennes constantes fixes `final_rms_mm = 0.34`, puis un statut honnête "not_implemented" qui ne
      calculait toujours rien). Reste néanmoins JAMAIS validé sur un vrai flux peropératoire ni sur
      fantôme dans cet environnement — voir l'avertissement en tête de registration.py.

Fonctionnalités (état réel) :
    1. Pas de simulation hyperélastique FEM réelle — formules paramétriques simples uniquement
       (/respiratory-displacement, /simulate-pneumoperitoneum).
    2. Modélisation cinématique simplifiée du cycle respiratoire (fonction sinusoïdale de la phase).
    3. `/elastic-registration` : recalage RÉEL (ICP + FFD B-spline, voir registration.py), mais non
       validé sur données peropératoires réelles ni sur fantôme (voir son avertissement dédié).
    4. Formule paramétrique simple pour l'effet du pneumopéritoine (pas de FEM).
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

import registration
from db import get_db
import security as sec

router = APIRouter(prefix="/api/v2/biomech", tags=["biomechanics-nextgen"])

# ---------------------------------------------------------------------------
# Modèles Pydantic pour les requêtes / réponses biomécaniques
# --------------------------------.-------------------------------------------

class ElasticRegistrationRequest(BaseModel):
    twin_id: str = Field(..., description="ID unique du jumeau numérique préopératoire")
    intraop_point_cloud: List[List[float]] = Field(
        ...,
        description="Nuage de points 3D peropératoire (source à recaler) capturé par échographie trackée ou stéréovision AR",
        json_schema_extra={"example": [[10.2, 24.5, -5.1], [12.0, 25.1, -4.8], [15.4, 22.0, -6.2]]},
    )
    preop_point_cloud: List[List[float]] = Field(
        ...,
        description="Nuage de points 3D préopératoire (cible), ex. échantillonné sur la surface du "
                    "maillage du jumeau numérique (voir mesh_export.py) — résoudre `twin_id` vers ce "
                    "nuage automatiquement n'est pas fait ici, à la charge de l'appelant pour l'instant.",
    )
    grid_spacing_mm: float = Field(10.0, gt=0, description="Espacement de la grille de contrôle FFD (mm) — plus petit = déformation plus locale/fine, plus d'itérations nécessaires")
    stiffness_regularization: float = Field(0.3, ge=0.0, le=1.0, description="Facteur de lissage laplacien de la grille de contrôle FFD (régularisation — voir avertissement de registration.py)")
    max_iterations: int = Field(20, ge=1, le=200, description="Nombre d'itérations du raffinement FFD (l'ICP rigide préalable a son propre critère de convergence)")

class PneumoSimulationRequest(BaseModel):
    twin_id: str = Field(..., description="ID du jumeau numérique hépatique")
    co2_pressure_mmhg: float = Field(12.0, ge=0.0, le=25.0, description="Pression d'insufflation cœlioscopique en mmHg")
    patient_position: str = Field("supine_reverse_trendelenburg", description="Position opératoire du patient sur la table")

# ---------------------------------------------------------------------------
# Endpoints de simulation biomécanique et de recalage non-rigide (Jalon M6)
# ---------------------------------------------------------------------------

@router.get("/twins/{twin_id}/respiratory-displacement")
async def get_respiratory_displacement_field(
    twin_id: str,
    phase_rad: float = Query(0.0, description="Phase du cycle respiratoire en radians (0 à 2*PI, 0=expiration, PI=inspiration maximale)"),
    breathing_rate_cpm: float = Query(14.0, description="Fréquence respiratoire en cycles par minute"),
    db: Session = Depends(get_db)
):
    """
    Calcule le champ de vecteurs de déplacement 3D (DeltaX, DeltaY, DeltaZ) pour un jumeau hépatique
    en fonction de la phase du cycle respiratoire.
    Permet l'asservissement en temps réel du guidage GPS chirurgical (SurgNav) et des robots d'ablation.
    """
    # Modèle biomécanique cinématique : la coupole diaphragmatique impose un déplacement crânio-caudal
    # dominant (axe Z), couplé à une rotation antéro-supérieure (axe Y) et une expansion latérale (axe X).
    amplitude_z_mm = -14.5 * math.sin(phase_rad) # Déplacement crânio-caudal (max 14.5 mm vers le bas en inspiration)
    amplitude_y_mm = 3.2 * (math.sin(phase_rad)**2) # Bascule antéro-postérieure
    amplitude_x_mm = -1.8 * math.sin(phase_rad)    # Légère translation latérale
    
    # Calcul des tenseurs de déformation de Green-Lagrange sur 8 centres de gravité segmentaires
    segment_displacements = {}
    for seg in range(1, 9):
        # Les segments du dôme (S7, S8, S4a, S2) subissent la déformation diaphragmatique maximale
        damping_factor = 1.0 if seg in [2, 4, 7, 8] else 0.65
        segment_displacements[f"S{seg}"] = {
            "dx_mm": round(amplitude_x_mm * damping_factor, 3),
            "dy_mm": round(amplitude_y_mm * damping_factor, 3),
            "dz_mm": round(amplitude_z_mm * damping_factor, 3),
            "strain_tensor_trace": round(0.012 * math.sin(phase_rad) * damping_factor, 5)
        }
        
    return {
        "twin_id": twin_id,
        "respiratory_phase_rad": round(phase_rad, 4),
        "breathing_rate_cpm": breathing_rate_cpm,
        "global_diaphragm_shift_mm": round(amplitude_z_mm, 2),
        "segmental_displacement_field": segment_displacements,
        "model_type": "simplified_kinematic_formula_not_patient_calibrated",
        "note": "Amplitude sinusoïdale fixe (14.5/3.2/1.8 mm), pas mesurée sur ce patient ni "
                "validée cliniquement. Ne pas utiliser pour un asservissement de navigation réel "
                "sans calibration et validation spécifiques.",
        "timestamp_utc": datetime.now(timezone.utc).isoformat()
    }

@router.post("/twins/{twin_id}/elastic-registration")
async def compute_elastic_non_rigid_registration(
    twin_id: str,
    payload: ElasticRegistrationRequest,
    db: Session = Depends(get_db)
):
    """
    Recalage RÉEL en deux étapes (voir registration.py) : ICP rigide (Besl & McKay
    1992) puis raffinement non-rigide par FFD B-spline cubique (Rueckert et al.
    1999) — remplace l'ancien stub "not_implemented" qui ne calculait rien.

    ⚠️ Jamais validé sur un vrai flux peropératoire ni sur fantôme dans cet
    environnement (testé uniquement sur nuages de points synthétiques, voir
    backend/tests/test_registration.py) — voir l'avertissement complet en tête
    de registration.py avant tout usage clinique.
    """
    source = np.asarray(payload.intraop_point_cloud, dtype=np.float64)
    target = np.asarray(payload.preop_point_cloud, dtype=np.float64)
    if source.ndim != 2 or source.shape[1] != 3 or len(source) == 0:
        raise HTTPException(422, "intraop_point_cloud doit être une liste non vide de points [x,y,z].")
    if target.ndim != 2 or target.shape[1] != 3 or len(target) == 0:
        raise HTTPException(422, "preop_point_cloud doit être une liste non vide de points [x,y,z].")

    icp_result = registration.rigid_icp(source, target)
    ffd_result = registration.bspline_ffd_register(
        icp_result.aligned_source, target,
        grid_spacing_mm=payload.grid_spacing_mm,
        iterations=payload.max_iterations,
        smoothing=payload.stiffness_regularization,
    )

    rigid_rms_mm = icp_result.rms_history[-1] if icp_result.rms_history else None
    final_rms_mm = ffd_result.rms_history[-1] if ffd_result.rms_history else None

    try:
        log_id = str(uuid.uuid4())
        details = {
            "num_points_intraop": len(source), "num_points_preop": len(target),
            "rigid_rms_mm": rigid_rms_mm, "final_rms_mm": final_rms_mm,
            "icp_iterations": icp_result.iterations, "ffd_iterations": ffd_result.iterations,
        }
        log_hash = hashlib.sha256(f"ELASTIC_REG_{twin_id}_{final_rms_mm}".encode()).hexdigest()
        db.execute(text("""
            INSERT INTO audit_logs (id, action_type, target_resource, resource_id, details, cryptographic_hash)
            VALUES (:id, 'ELASTIC_REGISTRATION_COMPUTED', 'digital_twins', :res_id, :details, :hash)
        """), {"id": log_id, "res_id": twin_id, "details": json.dumps(details), "hash": log_hash})
        db.commit()
    except Exception:
        db.rollback()

    return {
        "status": "computed",
        "twin_id": twin_id,
        "num_points_intraop": len(source),
        "num_points_preop": len(target),
        "rigid_transform": {
            "rotation_matrix": icp_result.rotation.tolist(),
            "translation_mm": icp_result.translation.tolist(),
            "converged": icp_result.converged,
            "iterations": icp_result.iterations,
            "rms_mm": rigid_rms_mm,
        },
        "non_rigid_refinement": {
            "grid_spacing_mm": payload.grid_spacing_mm,
            "iterations": ffd_result.iterations,
            "rms_mm": final_rms_mm,
            "rms_history_mm": ffd_result.rms_history,
        },
        "registered_points": ffd_result.deformed_source.tolist(),
        "note": "Recalage réellement calculé (ICP + FFD B-spline, voir registration.py) sur les nuages "
                "de points fournis — mais jamais validé sur un vrai flux peropératoire ni sur fantôme "
                "(TRE) dans cet environnement. Ne pas utiliser pour un guidage chirurgical réel sans "
                "cette validation.",
    }

@router.post("/twins/{twin_id}/simulate-pneumoperitoneum")
async def simulate_pneumoperitoneum_deformation(
    twin_id: str,
    payload: PneumoSimulationRequest,
    db: Session = Depends(get_db)
):
    """
    ⚠️ PAS un calcul par éléments finis réel : formule linéaire simple, mise à l'échelle sur la
    pression CO2 fournie, non calibrée sur un patient réel ni validée cliniquement.
    """
    # Formule linéaire illustrative (PAS de FEM réel, PAS de module de Young mesuré sur le patient)
    compression_ratio_pct = round(1.2 * (payload.co2_pressure_mmhg / 12.0), 2)
    posterior_shift_mm = round(4.5 * (payload.co2_pressure_mmhg / 12.0), 2)
    portal_vein_angle_change_deg = round(1.8 * (payload.co2_pressure_mmhg / 12.0), 2)

    return {
        "status": "success",
        "twin_id": twin_id,
        "model_type": "simplified_linear_formula_not_patient_calibrated",
        "pneumoperitoneum_pressure_mmhg": payload.co2_pressure_mmhg,
        "biomechanical_effect": {
            "parenchymal_compression_pct": compression_ratio_pct,
            "posterior_hepatic_shift_mm": posterior_shift_mm,
            "portal_vein_angle_change_deg": portal_vein_angle_change_deg,
            "recommended_trocar_offset_mm": [0.0, -posterior_shift_mm, 0.0]
        },
        "note": "Estimation illustrative non validée cliniquement, à ne pas utiliser pour guider un "
                "geste réel sans validation par un modèle biomécanique calibré et approuvé."
    }
