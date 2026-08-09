# -*- coding: utf-8 -*-
"""
hl7_anesthesia_service.py — Prototype de monitoring anesthésie, données SIMULÉES (Jalon M11)
====================================================================================================
⚠️ AVERTISSEMENT HONNÊTE : `/hemodynamics/{twin_id}` NE se connecte à AUCUN respirateur ni moniteur
d'anesthésie réel. Les constantes vitales renvoyées sont générées par des fonctions sinus/cosinus
paramétriques, pas acquises depuis un appareil. Les noms de moniteurs (Dräger Perseus A500, Mindray
BeneVision N20) apparaissaient précédemment comme si les données en provenaient réellement — ce n'est
pas le cas, ils ont été retirés du payload de vitals pour éviter toute confusion.
`/simulate-clamping` reste un outil d'aide à la décision à base de règles simples (seuils fixes par
spécialité), utile comme aide-mémoire mais non validé cliniquement comme dispositif de décision.

Fonctionnalités (état réel) :
    1. Génération de constantes vitales SIMULÉES (sinus/cosinus), pas d'acquisition IEEE 11073 réelle.
    2. Règles heuristiques simples de tolérance à l'ischémie chaude, pas un modèle physiologique validé.
    3. Alertes basées sur des seuils fixes codés en dur.
    4. Sceau cryptographique SHA-256 dans `audit_logs` (intégrité technique réelle).
"""

from __future__ import annotations

import hashlib
import json
import math
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from db import get_db
from logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v2/or-monitor", tags=["or-anesthesia-monitoring"])

# ---------------------------------------------------------------------------
# Modèles Pydantic pour la simulation hémodynamique et le clampage
# ---------------------------------------------------------------------------

class SimulateClampingRequest(BaseModel):
    twin_id: str = Field(..., description="ID du jumeau numérique ou de la session peropératoire")
    vessel_name: str = Field("Pédicule vasculaire du lambeau libre (anastomose microchirurgicale)", description="Nom du vaisseau clampé")
    clamping_duration_min: float = Field(18.0, description="Durée de clampage ischémique prévisible (en minutes)")
    specialty: str = Field("cervicofacial", description="Spécialité chirurgicale active")
    patient_asa_score: int = Field(2, description="Score ASA d'anesthésie (1 à 5)")

# ---------------------------------------------------------------------------
# Endpoints d'acquisition hémodynamique et d'alerte de clampage
# ---------------------------------------------------------------------------

@router.get("/hemodynamics/{twin_id}")
async def get_live_hemodynamic_monitor(twin_id: str, phase_t: Optional[float] = None):
    """
    ⚠️ Données SIMULÉES : aucune connexion à un respirateur ou moniteur d'anesthésie réel.
    Génère une variation sinus/cosinus paramétrique autour de valeurs de repos plausibles.
    """
    t = phase_t if phase_t is not None else time.time()

    # Fonctions sinus/cosinus paramétriques — PAS des mesures physiologiques réelles
    sys_bp = round(118.0 + 4.0 * math.sin(t * 0.2), 1)
    dia_bp = round(76.0 + 2.5 * math.sin(t * 0.2 - 0.5), 1)
    map_bp = round((sys_bp + 2.0 * dia_bp) / 3.0, 1)
    heart_rate = round(72.0 + 3.0 * math.cos(t * 0.3), 1)
    spo2 = round(99.0 - 0.4 * abs(math.sin(t * 0.1)), 1)
    etco2 = round(34.5 + 1.2 * math.sin(t * 0.25), 1)
    bis_index = round(44.0 + 2.0 * math.cos(t * 0.15), 1) # 40-60 = plage "anesthésie chirurgicale" affichée à titre illustratif

    now_utc = datetime.now(timezone.utc).isoformat()

    return {
        "twin_id": twin_id,
        "timestamp_utc": now_utc,
        "data_source": "SIMULATED_WAVEFORM",
        "note": "Constantes vitales générées par formule (sinus/cosinus), non acquises depuis un "
                "appareil réel. Ne jamais utiliser pour une décision clinique.",
        "vitals": {
            "arterial_pressure_sys_dia_val": f"{int(sys_bp)}/{int(dia_bp)} mmHg",
            "mean_arterial_pressure_map": map_bp,
            "heart_rate_bpm": heart_rate,
            "spo2_percent": spo2,
            "end_tidal_co2_mmhg": etco2,
            "bispectral_index_bis": bis_index,
            "temperature_esophageal_c": 36.4
        },
        "anesthesia_depth_status": "SIMULATED_VALUE (BIS 40-60 plage illustrative)",
        "hemodynamic_stability_index": "SIMULATED_VALUE"
    }

@router.post("/simulate-clamping")
async def simulate_vascular_clamping_hemodynamics(
    req: SimulateClampingRequest,
    db: Session = Depends(get_db)
):
    """
    Calcule l'impact hémodynamique immédiat et la tolérance à l'ischémie tissulaire lors d'un
    clampage vasculaire en chirurgie ORL (ex: clampage carotidien en exérèse tumorale cervicale
    avancée, ischémie du pédicule d'un lambeau libre microchirurgical de reconstruction).
    Génère des alertes prédictives pour l'anesthésiste et le chirurgien.
    """
    now_utc = datetime.now(timezone.utc).isoformat()
    event_id = str(uuid.uuid4())
    vessel_lower = req.vessel_name.lower()

    # Calcul de tolérance à l'ischémie (seuils très différents selon le type de vaisseau) :
    #   - clampage carotidien (résection tumorale cervicale) : tolérance cérébrale sans shunt ~3 min
    #   - ischémie de pédicule de lambeau libre microchirurgical : tolérance ~240 min (4h)
    #   - autre vaisseau cervico-facial (ex: veine jugulaire, branche artérielle accessoire) : 20 min par défaut
    if "carotid" in vessel_lower:
        max_tolerance_min = 3.0
    elif "lambeau" in vessel_lower or "libre" in vessel_lower or "microvasculaire" in vessel_lower or "microchirurgical" in vessel_lower:
        max_tolerance_min = 240.0
    else:
        max_tolerance_min = 20.0
    if req.patient_asa_score >= 3:
        max_tolerance_min *= 0.8 # Réduction de 20% si patient fragile (ASA 3/4)

    remaining_safe_time = round(max_tolerance_min - req.clamping_duration_min, 1)

    # Impact hémodynamique prédictif (Chute de la PAM, risque d'hypoperfusion cérébrale au clampage carotidien)
    delta_map_mmhg = -8.5 if "carotid" in vessel_lower else -5.0
    delta_co_percent = -14.2 if delta_map_mmhg < -7.0 else -8.0
    
    status_level = "OK"
    alert_msg = "Paramètres physiologiques dans les limites de tolérance ischémique."
    if remaining_safe_time < 5.0:
        status_level = "CRITICAL_ISCHEMIA_WARNING"
        alert_msg = f"⚠️ ALERTE CRITIQUE : Seuil d'ischémie chaude presque atteint (reste {remaining_safe_time} min) ! Préparez la reperfusion ou le déclampage intermittent."
    elif remaining_safe_time < 15.0:
        status_level = "WARNING_MODERATE_ISCHEMIA"
        alert_msg = f"🟡 ATTENTION : Clampage prolongé ({req.clamping_duration_min} min). Surveillance étroite de la PAM recommandée."
        
    # Recommandations d'anesthésie intelligentes
    recommendation = "Maintien de la normovolémie. Pas d'intervention vasoactive immédiate requise."
    if delta_map_mmhg < -7.0:
        recommendation = "Risque d'hypoperfusion cérébrale au clampage carotidien : surveillance EEG/NIRS, pré-remplissage vasculaire modéré ou micro-bolus d'éphédrine/noradrénaline conseillé par l'IA, envisager un shunt carotidien temporaire si mal tolérée."
        
    payload_to_hash = f"{event_id}|{req.twin_id}|{req.vessel_name}|{req.clamping_duration_min}|{status_level}|{now_utc}"
    crypto_hash = hashlib.sha256(payload_to_hash.encode("utf-8")).hexdigest()
    
    try:
        log_id = str(uuid.uuid4())
        db.execute(text("""
            INSERT INTO audit_logs (id, action_type, target_resource, resource_id, details, cryptographic_hash)
            VALUES (:id, 'SIMULATE_VASCULAR_CLAMPING_HL7', 'digital_twins', :res_id, :details, :hash)
        """), {
            "id": log_id,
            "res_id": req.twin_id,
            "details": json.dumps({"vessel": req.vessel_name, "duration": req.clamping_duration_min, "status": status_level}),
            "hash": crypto_hash
        })
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Erreur SQL audit_logs: %s", e)
        
    return {
        "event_id": event_id,
        "twin_id": req.twin_id,
        "vessel_clamped": req.vessel_name,
        "clamping_duration_min": req.clamping_duration_min,
        "max_ischemia_tolerance_min": max_tolerance_min,
        "remaining_safe_ischemia_min": remaining_safe_time,
        "hemodynamic_impact_prediction": {
            "map_drop_mmhg": delta_map_mmhg,
            "cardiac_output_drop_percent": delta_co_percent,
            "predicted_map_during_clamp": round(91.0 + delta_map_mmhg, 1)
        },
        "safety_alert": {
            "status": status_level,
            "message": alert_msg,
            "anesthesia_ai_recommendation": recommendation
        },
        "model_type": "rule_based_heuristic_fixed_thresholds_not_clinically_validated",
        "sha256_audit_hash": crypto_hash
    }
