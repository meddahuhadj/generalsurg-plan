# -*- coding: utf-8 -*-
"""
routers/volumetrie.py — Calcul de volumétrie générique (organe/lésion/résection).

Endpoint exposé :
    GET /patients/{patient_id}/volumetrie

Note : ce module portait autrefois un bloc de calcul FLR/TLV (Future Liver
Remnant) spécifique à la chirurgie hépato-bilio-pancréatique (`specialty ==
"hbp"`), une notion propre à l'hépatectomie sans équivalent clinique établi
en ophtalmologie (aucune des 3 spécialités actuelles — cataracte, glaucome,
rétine — n'a de concept de « volume d'organe restant fonctionnel » comparable
à un parenchyme hépatique réséqué). Ce bloc est devenu du code mort depuis que
`Specialty` (backend/specialties.py) n'accepte plus "hbp" — Pydantic rejette
la valeur avant même d'atteindre cette route — et a donc été retiré plutôt que
laissé inaccessible. Les champs `tlv_ml`/`tv_ml`/`flr_pct`/`flr_threshold_pct`/
`flr_safe`/`flr_bw_pct`/`bsa_m2` de VolumetrieResponse restent dans le schéma
(Optional, toujours `null` désormais) pour ne pas casser un client qui les
lirait encore, mais plus aucune route ne les remplit.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

import models
from db import get_db
from deps import get_current_user, write_audit
from schemas import VolumetrieResponse

router = APIRouter(tags=["volumetrie"])

# Volume procédural par défaut (globe oculaire adulte ≈ 6.5 mL) quand aucun
# segment "organe" n'a été tracé — identique pour les 3 spécialités, qui
# opèrent toutes sur le même organe (contrairement à l'ancienne liste par
# spécialité de chirurgie générale, où chaque organe différait).
_DEFAULT_ORGAN_VOLUME_ML = 6.5


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
        organe_vol = _DEFAULT_ORGAN_VOLUME_ML
    if lesion_vol == 0:
        lesion_vol = 0.4

    resected = organe_vol * 0.55 + margin_cm * 0.1
    remnant_pct = round((organe_vol - resected) / organe_vol * 100, 1)

    result = {
        "patient_id": patient_id, "specialty": p.specialty,
        "organ_volume_ml": round(organe_vol, 2), "lesion_volume_ml": round(lesion_vol, 2),
        "ratio_lesion_organe_pct": round(lesion_vol / organe_vol * 100, 1),
        "volume_resection_ml": round(resected, 2), "remnant_pct": remnant_pct, "margin_cm": margin_cm,
    }

    db.add(models.VolumetrieResult(
        id=str(uuid.uuid4()), patient_id=patient_id, organ_volume_ml=result["organ_volume_ml"],
        lesion_volume_ml=result["lesion_volume_ml"], ratio_lesion_organe_pct=result["ratio_lesion_organe_pct"],
        volume_resection_ml=result["volume_resection_ml"], remnant_pct=remnant_pct, margin_cm=margin_cm,
    ))
    write_audit(db, request, "Calcul volumétrie", "volumetrie", user=current, patient_id=patient_id)
    return result
