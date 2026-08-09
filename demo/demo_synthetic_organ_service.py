# -*- coding: utf-8 -*-
"""
demo_synthetic_organ_service.py — Exemple de démonstration (dossier demo/)
===================================================================================================
⚠️ AVERTISSEMENT HONNÊTE : ce module génère une ANATOMIE SYNTHÉTIQUE PROCÉDURALE
(organe + lésion à base d'icosphères déformées) — ce ne sont PAS des données
patient réelles. Il n'est chargé que par la version "Recherche / Démo" du logiciel
(flag `DEMO_MODE=true`) et JAMAIS par la version "Clinique / Production".

Son but : permettre d'exercer le pipeline de planification réel
(`backend/routers/surgical_planning.py` + `backend/biomech_solver.py`) sans
TotalSegmentator ni DICOM. Le plan de coupe, le calcul de FLR, la marge
tumorale et la simulation post-résection fonctionnent exactement comme sur un
maillage segmenté réel : seuls les fichiers .glb écrits dans le MESH_STORAGE
sont synthétiques.

Mention obligatoire : CE LOGICIEL N'EST PAS DESTINÉ À UN USAGE CLINIQUE.
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional

# Le module vit hors de backend/ : on ajoute ce dossier au sys.path pour pouvoir
# réutiliser les helpers backend (db, MESH_STORAGE, export GLB). Voir demo/__init__.py.
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
from db import get_db
from logging_config import get_logger
from segmentation_service import MESH_STORAGE

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v2/demo/synthetic-organ", tags=["demo-fictional-anatomy"])


class SyntheticOrganRequest(BaseModel):
    patient_id: str = Field(..., description="ID du patient auquel attacher l'anatomie synthétique (doit exister)")
    organ_radius_mm: float = Field(85.0, ge=30.0, le=200.0, description="Rayon de base de l'organe (mm)")
    tumor_radius_mm: float = Field(9.0, ge=3.0, le=40.0, description="Rayon de la lésion synthétique (mm)")
    force_regenerate: bool = Field(True, description="Écrase les segments synthétiques existants du patient")


def _synthetic_pair(organ_radius_mm: float, tumor_radius_mm: float) -> Dict[str, object]:
    """Construit un couple organe/lésion procédural (icosphères déformées) et
    retourne les volumes en mL. Retourne les objets trimesh pour export."""
    import trimesh

    organ = trimesh.creation.icosphere(subdivisions=3, radius=float(organ_radius_mm))
    organ.apply_scale([1.0, 0.85, 0.6])  # forme "foie" grossière (allongée, aplatie)

    tumor = trimesh.creation.icosphere(subdivisions=2, radius=float(tumor_radius_mm))
    # Lésion placée à proximité de la surface, côté haut de l'organe (z > 0)
    tumor.apply_translation([0.0, organ_radius_mm * 0.25, organ_radius_mm * 0.55])

    return {
        "organ_mesh": organ,
        "tumor_mesh": tumor,
        "organ_volume_ml": round(float(organ.volume) / 1000.0, 1),
        "tumor_volume_ml": round(float(tumor.volume) / 1000.0, 1),
    }


@router.post("")
async def generate_synthetic_organ(req: SyntheticOrganRequest, db: Session = Depends(get_db)):
    """Génère une anatomie SYNTHÉTIQUE (organe + lésion) pour un patient existant,
    l'exporte en .glb dans le MESH_STORAGE et enregistre les segments. Permet
    d'exercer la planification de coupe (FLR + marge + FEM) sans imagerie réelle."""
    if not db.get(models.Patient, req.patient_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            f"Patient {req.patient_id!r} introuvable — créez-le d'abord via /patients.")

    try:
        pair = _synthetic_pair(req.organ_radius_mm, req.tumor_radius_mm)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Génération de l'anatomie synthétique impossible : {e}")

    out_dir = MESH_STORAGE / "demo" / req.patient_id
    out_dir.mkdir(parents=True, exist_ok=True)

    from mesh_export import export_mesh_glb

    organ_glb = export_mesh_glb(pair["organ_mesh"], out_dir / "liver_synthetic.glb",
                                color_rgba=(79, 195, 247, 200))
    tumor_glb = export_mesh_glb(pair["tumor_mesh"], out_dir / "tumor_synthetic.glb",
                                color_rgba=(239, 68, 68, 220))

    organ_url = f"/meshes/demo/{req.patient_id}/liver_synthetic.glb"
    tumor_url = f"/meshes/demo/{req.patient_id}/tumor_synthetic.glb"

    # Remplacement propre des éventuels segments synthétiques précédents
    if req.force_regenerate:
        for seg in db.query(models.Segment).filter(models.Segment.patient_id == req.patient_id).all():
            if seg.mesh_ref and "synthetic" in seg.mesh_ref:
                db.delete(seg)
        db.flush()

    def _segment(type_: str, volume_ml: float, label: str, color: str, mesh_ref: str) -> models.Segment:
        return models.Segment(
            id=str(uuid.uuid4()), patient_id=req.patient_id, type=type_, volume_ml=volume_ml,
            label=label, color_hex=color, mesh_ref=mesh_ref,
            metadata_json={"source": "synthetic_demo", "is_real_patient_anatomy": False},
        )

    db.add(_segment("organe", pair["organ_volume_ml"], "Foie synthétique (démo)", "#4fc3f7", organ_url))
    db.add(_segment("lesion", pair["tumor_volume_ml"], "Lésion synthétique (démo)", "#ef4444", tumor_url))
    db.commit()

    return {
        "patient_id": req.patient_id,
        "is_real_patient_anatomy": False,
        "workflow_mode": "FICTIONAL_DEMO_ONLY — anatomie procédurale synthétique, aucune donnée patient réelle",
        "organ": {"label": "Foie synthétique (démo)", "url": organ_url, "volume_ml": pair["organ_volume_ml"]},
        "lesion": {"label": "Lésion synthétique (démo)", "url": tumor_url, "volume_ml": pair["tumor_volume_ml"]},
        "planning_hint": {
            "texte": "Plan de coupe à exprimer dans le référentiel du maillage (mm). "
                     "Exemple de plan central : plane_point=[0,0,0], plane_normal=[0,0,1] → "
                     "le remnant est le côté z>0, FLR ≈ 50 %.",
            "organ_bounds_mm": {
                "x": [-req.organ_radius_mm, req.organ_radius_mm],
                "y": [-req.organ_radius_mm * 0.85, req.organ_radius_mm * 0.85],
                "z": [-req.organ_radius_mm * 0.6, req.organ_radius_mm * 0.6],
            },
        },
        "next_step": "POST /api/v2/surgical-planning/patients/{id}/resection/simulate "
                     "(ou la version /api/v1 pour la rétro-compatibilité).",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }
