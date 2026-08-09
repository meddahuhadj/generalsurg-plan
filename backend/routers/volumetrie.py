# -*- coding: utf-8 -*-
"""
routers/volumetrie.py — Calcul de volumétrie (générique, spécialités ORL).

Endpoint exposé :
    GET /patients/{patient_id}/volumetrie
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

import models
from db import get_db
from deps import get_current_user, write_audit
from schemas import VolumetrieResponse

router = APIRouter(tags=["volumetrie"])

# Volumes anatomiques de référence (mL) par module ORL, utilisés quand aucun
# segment n'a encore été tracé sur le patient (miroir de `refML` côté frontend).
DEFAULT_ORGAN_VOLUME_ML = {
    "laryngologie": 15.0, "otologie": 2.0, "rhinologie": 40.0,
    "cervicofacial": 25.0, "pediatrique": 10.0, "anesthesie_reanimation": 500.0,
}


@router.get("/patients/{patient_id}/volumetrie", response_model=VolumetrieResponse)
async def get_volumetrie(patient_id: str, request: Request, margin_cm: float = 1.0,
                          current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.get(models.Patient, patient_id)
    if not p:
        raise HTTPException(404, "Patient introuvable.")
    segments = db.query(models.Segment).filter(models.Segment.patient_id == patient_id).all()
    organe_vol = sum(s.volume_ml for s in segments if s.type == "organe")
    lesion_vol = sum(s.volume_ml for s in segments if s.type == "lesion")

    if organe_vol == 0:
        organe_vol = DEFAULT_ORGAN_VOLUME_ML.get(p.specialty, 500.0)
    if lesion_vol == 0:
        lesion_vol = 20.0

    resected = organe_vol * 0.55 + margin_cm * 32
    remnant_pct = round((organe_vol - resected) / organe_vol * 100, 1)

    result = {
        "patient_id": patient_id, "specialty": p.specialty,
        "organ_volume_ml": round(organe_vol, 1), "lesion_volume_ml": round(lesion_vol, 1),
        "ratio_lesion_organe_pct": round(lesion_vol / organe_vol * 100, 1),
        "volume_resection_ml": round(resected), "remnant_pct": remnant_pct, "margin_cm": margin_cm,
    }

    db.add(models.VolumetrieResult(
        id=str(uuid.uuid4()), patient_id=patient_id, organ_volume_ml=result["organ_volume_ml"],
        lesion_volume_ml=result["lesion_volume_ml"], ratio_lesion_organe_pct=result["ratio_lesion_organe_pct"],
        volume_resection_ml=result["volume_resection_ml"], remnant_pct=remnant_pct, margin_cm=margin_cm,
    ))
    write_audit(db, request, "Calcul volumétrie", "volumetrie", user=current, patient_id=patient_id)
    return result
