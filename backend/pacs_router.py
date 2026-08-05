# -*- coding: utf-8 -*-
"""
pacs_router.py — Endpoints PACS (DICOMweb) + export FHIR R4 / HL7 v2
========================================================================
Priorité 4 de la feuille de route (voir README) :
    Connecteurs DICOM/PACS (QIDO-RS/WADO-RS) + HL7 FHIR (lecture PACS, écriture DPI)

Endpoints exposés (tous authentifiés JWT, tous audités) :
    GET  /pacs/capabilities
    GET  /pacs/studies
    GET  /pacs/studies/{study_uid}/series
    GET  /pacs/studies/{study_uid}/series/{series_uid}/instances
    POST /pacs/import                                     (WADO-RS -> DicomSeries locale)
    GET  /fhir/Patient/{patient_id}
    GET  /fhir/ImagingStudy/{patient_id}
    GET  /fhir/DiagnosticReport/{patient_id}
    GET  /hl7/oru/{patient_id}
"""

from __future__ import annotations

import hashlib
import logging
import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

import models
import interop
import pacs_client
import resilience
import pacs_dimse
import mllp_client
import pydicom
from db import get_db
from deps import get_current_user, write_audit as _audit

router = APIRouter(tags=["pacs-fhir-hl7"])
logger = logging.getLogger("ophtalmosurg.pacs")

# Même dossier et même variable d'environnement que routers/dicom.py
# (DICOM_STORAGE_DIR) — sauvegarde réelle des pixels rapatriés depuis un PACS,
# pour qu'une série importée puisse ensuite être envoyée en segmentation sans
# re-upload manuel.
DICOM_STORAGE_DIR = Path(os.getenv("DICOM_STORAGE_DIR", "./storage/dicom_series")).resolve()
DICOM_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# get_current_user et l'audit trail (_audit = deps.write_audit) viennent
# désormais de deps.py, module neutre qui n'importe jamais main.py — avant,
# ce router en gardait sa propre copie ("dupliquée volontairement... pour
# éviter tout import circulaire"), désormais inutile.


def _get_patient_or_404(db: Session, patient_id: str) -> models.Patient:
    p = db.get(models.Patient, patient_id)
    if not p:
        raise HTTPException(404, "Patient introuvable.")
    return p


def _save_datasets_to_disk(local_series_id: str, datasets: list) -> Path:
    """Sauvegarde une liste de pydicom.Dataset sur disque sous
    DICOM_STORAGE_DIR/{local_series_id}/NNNN.dcm — condition nécessaire pour
    qu'une série importée (PACS ou upload) puisse ensuite être envoyée en
    segmentation via POST /segmentation/from-series/{id} sans re-upload."""
    series_dir = DICOM_STORAGE_DIR / local_series_id
    series_dir.mkdir(parents=True, exist_ok=True)
    for i, ds in enumerate(datasets):
        out_path = series_dir / f"{i:04d}.dcm"
        try:
            pydicom.dcmwrite(str(out_path), ds, enforce_file_format=True)
        except Exception:
            # Certains datasets DIMSE reçus via C-STORE n'ont pas toujours un
            # file_meta complet (transfer syntax implicite côté PACS distant) ;
            # on retente sans forcer le format Part 10 plutôt que de perdre
            # l'instance entière pour un détail d'en-tête.
            pydicom.dcmwrite(str(out_path), ds, enforce_file_format=False)
    return series_dir


def _auto_workflow_hook(db: Session, patient_id: str, series_id: str, modality: str, dicom_dir: Path) -> None:
    """Zero-touch : prépare le workflow « 3 clics » à l'arrivée d'une série
    importée depuis le PACS (WADO-RS ou DIMSE). Non-fatal en cas d'erreur."""
    try:
        import workflow_service
        p = db.get(models.Patient, patient_id)
        specialty = getattr(p, "specialty", None) if p is not None else None
        workflow_service.auto_trigger_for_series(patient_id, series_id, modality, dicom_dir, specialty)
    except Exception:  # noqa: BLE001
        logger.warning("Déclenchement automatique du workflow impossible pour la série %s.", series_id, exc_info=True)


def _pacs_config(qido_url: Optional[str], wado_url: Optional[str]) -> pacs_client.PacsConfig:
    try:
        return pacs_client.PacsConfig.resolve(qido_url, wado_url)
    except pacs_client.PacsConfigError as e:
        raise HTTPException(400, str(e)) from e


def _pacs_error(e: Exception):
    if isinstance(e, resilience.CircuitOpenError):
        raise HTTPException(503, str(e)) from e
    raise HTTPException(502, str(e)) from e


# ---------------------------------------------------------------------------
# PACS / DICOMweb
# ---------------------------------------------------------------------------
@router.get("/pacs/capabilities")
async def pacs_capabilities(current: models.User = Depends(get_current_user)):
    caps = pacs_client.capabilities()
    caps["dimse_classic"] = pacs_dimse.capabilities()
    return caps


@router.get("/pacs/studies")
async def pacs_search_studies(
    request: Request,
    patient_id: Optional[str] = None,
    patient_name: Optional[str] = None,
    study_date: Optional[str] = None,
    accession_number: Optional[str] = None,
    qido_url: Optional[str] = None,
    wado_url: Optional[str] = None,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """QIDO-RS : recherche d'études sur le PACS distant. Filtres standards DICOM
    (PatientID, PatientName, StudyDate au format DICOM AAAAMMJJ ou plage AAAAMMJJ-AAAAMMJJ)."""
    cfg = _pacs_config(qido_url, wado_url)
    filters = {"PatientID": patient_id, "PatientName": patient_name,
               "StudyDate": study_date, "AccessionNumber": accession_number}
    try:
        raw = await pacs_client.search_studies(cfg, **filters)
    except (pacs_client.PacsConnectionError, resilience.CircuitOpenError) as e:
        _pacs_error(e)
    results = [pacs_client.simplify_study(item) for item in raw]
    _audit(db, request, "Recherche PACS (QIDO-RS studies)", "pacs", current,
           metadata={"filters": {k: v for k, v in filters.items() if v}, "n_results": len(results)})
    return results


@router.get("/pacs/studies/{study_uid}/series")
async def pacs_search_series(study_uid: str, request: Request,
                              qido_url: Optional[str] = None, wado_url: Optional[str] = None,
                              current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    cfg = _pacs_config(qido_url, wado_url)
    try:
        raw = await pacs_client.search_series(cfg, study_uid)
    except (pacs_client.PacsConnectionError, resilience.CircuitOpenError) as e:
        _pacs_error(e)
    results = [pacs_client.simplify_series(item) for item in raw]
    _audit(db, request, "Recherche PACS (QIDO-RS series)", "pacs", current, metadata={"study_uid": study_uid})
    return results


@router.get("/pacs/studies/{study_uid}/series/{series_uid}/instances")
async def pacs_search_instances(study_uid: str, series_uid: str, request: Request,
                                 qido_url: Optional[str] = None, wado_url: Optional[str] = None,
                                 current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    cfg = _pacs_config(qido_url, wado_url)
    try:
        raw = await pacs_client.search_instances(cfg, study_uid, series_uid)
    except (pacs_client.PacsConnectionError, resilience.CircuitOpenError) as e:
        _pacs_error(e)
    results = [pacs_client.simplify_instance(item) for item in raw]
    _audit(db, request, "Recherche PACS (QIDO-RS instances)", "pacs", current,
           metadata={"study_uid": study_uid, "series_uid": series_uid})
    return results


from pydantic import BaseModel  # noqa: E402


class PacsImportBody(BaseModel):
    patient_id: str
    study_uid: str
    series_uid: str
    qido_url: Optional[str] = None
    wado_url: Optional[str] = None


@router.post("/pacs/import")
async def pacs_import_series(body: PacsImportBody, request: Request,
                              current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """WADO-RS : rapatrie une série complète depuis le PACS distant et l'enregistre
    comme DicomSeries locale (même table que l'import manuel de fichiers .dcm),
    afin qu'elle soit ensuite utilisable par les modules MPR/segmentation existants."""
    _get_patient_or_404(db, body.patient_id)
    cfg = _pacs_config(body.qido_url, body.wado_url)
    try:
        datasets = await pacs_client.retrieve_series(cfg, body.study_uid, body.series_uid)
    except (pacs_client.PacsConnectionError, resilience.CircuitOpenError) as e:
        _pacs_error(e)
    if not datasets:
        raise HTTPException(404, "Série vide ou introuvable sur le PACS distant.")

    first = datasets[0]
    modality = getattr(first, "Modality", "OT")
    rows = int(getattr(first, "Rows", 512) or 512)
    cols = int(getattr(first, "Columns", 512) or 512)
    slice_thickness = float(getattr(first, "SliceThickness", 1.0) or 1.0)
    total_bytes = sum(len(getattr(ds, "PixelData", b"") or b"") for ds in datasets)
    sha = hashlib.sha256(f"{body.study_uid}:{body.series_uid}:{len(datasets)}".encode()).hexdigest()[:16]

    local_series_id = str(uuid.uuid4())
    local_dir = _save_datasets_to_disk(local_series_id, datasets)
    db.add(models.DicomSeries(
        id=local_series_id, patient_id=body.patient_id, study_uid=body.study_uid,
        series_uid=body.series_uid, modality=str(modality), slice_thickness_mm=slice_thickness,
        rows=rows, cols=cols, num_slices=len(datasets), sha256=sha, size_bytes=total_bytes,
        filename=f"PACS:{cfg.qido_url}", local_path=str(local_dir),
    ))
    db.commit()
    _audit(db, request, "Import PACS (WADO-RS)", "pacs", current, patient_id=body.patient_id,
           niveau="ok", metadata={"study_uid": body.study_uid, "series_uid": body.series_uid,
                                   "n_instances": len(datasets)})
    _auto_workflow_hook(db, body.patient_id, local_series_id, str(modality), local_dir)
    return {"imported": True, "local_series_id": local_series_id, "num_instances": len(datasets),
            "modality": str(modality)}


# ---------------------------------------------------------------------------
# FHIR R4 (export — lecture PACS/DPI côté FHIR)
# ---------------------------------------------------------------------------
@router.get("/fhir/Patient/{patient_id}")
async def fhir_patient(patient_id: str, request: Request,
                        current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _get_patient_or_404(db, patient_id)
    _audit(db, request, "Export FHIR Patient", "fhir", current, patient_id=patient_id)
    return interop.fhir_patient(p)


@router.get("/fhir/ImagingStudy/{patient_id}")
async def fhir_imaging_study(patient_id: str, request: Request,
                              current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _get_patient_or_404(db, patient_id)
    series = db.query(models.DicomSeries).filter(models.DicomSeries.patient_id == patient_id).all()
    _audit(db, request, "Export FHIR ImagingStudy", "fhir", current, patient_id=patient_id)
    return interop.fhir_imaging_study(p, series)


@router.get("/fhir/DiagnosticReport/{patient_id}")
async def fhir_diagnostic_report(patient_id: str, request: Request,
                                  current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _get_patient_or_404(db, patient_id)
    segments = db.query(models.Segment).filter(models.Segment.patient_id == patient_id).all()
    last_vol = (db.query(models.VolumetrieResult)
                .filter(models.VolumetrieResult.patient_id == patient_id)
                .order_by(models.VolumetrieResult.computed_at.desc()).first())
    vol_dict = None
    if last_vol:
        vol_dict = {"organ_volume_ml": last_vol.organ_volume_ml, "lesion_volume_ml": last_vol.lesion_volume_ml,
                    "volume_resection_ml": last_vol.volume_resection_ml, "remnant_pct": last_vol.remnant_pct}
    _audit(db, request, "Export FHIR DiagnosticReport", "fhir", current, patient_id=patient_id)
    return interop.fhir_diagnostic_report(p, vol_dict, segments)


# ---------------------------------------------------------------------------
# HL7 v2 (écriture DPI)
# ---------------------------------------------------------------------------
@router.get("/hl7/oru/{patient_id}", response_class=PlainTextResponse)
async def hl7_oru(patient_id: str, request: Request,
                   current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _get_patient_or_404(db, patient_id)
    segments = db.query(models.Segment).filter(models.Segment.patient_id == patient_id).all()
    last_vol = (db.query(models.VolumetrieResult)
                .filter(models.VolumetrieResult.patient_id == patient_id)
                .order_by(models.VolumetrieResult.computed_at.desc()).first())
    vol_dict = None
    if last_vol:
        vol_dict = {"organ_volume_ml": last_vol.organ_volume_ml, "lesion_volume_ml": last_vol.lesion_volume_ml,
                    "volume_resection_ml": last_vol.volume_resection_ml, "remnant_pct": last_vol.remnant_pct}
    message = interop.hl7_oru_r01(p, vol_dict, segments)
    _audit(db, request, "Export HL7 v2 ORU^R01", "hl7", current, patient_id=patient_id, niveau="ok")
    return PlainTextResponse(content=message, media_type="application/hl7-v2")


@router.get("/hl7/adt/{patient_id}", response_class=PlainTextResponse)
async def hl7_adt(patient_id: str, request: Request,
                   current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """ADT^A08 — synchronisation des données démographiques du patient vers le DPI/HIS."""
    p = _get_patient_or_404(db, patient_id)
    message = interop.hl7_adt_a08(p)
    _audit(db, request, "Export HL7 v2 ADT^A08", "hl7", current, patient_id=patient_id, niveau="ok")
    return PlainTextResponse(content=message, media_type="application/hl7-v2")


@router.get("/hl7/orm/{patient_id}", response_class=PlainTextResponse)
async def hl7_orm(patient_id: str, request: Request, procedure: str = "Intervention chirurgicale",
                   current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """ORM^O01 — demande d'intervention transmise au RIS/HIS de programmation opératoire."""
    p = _get_patient_or_404(db, patient_id)
    message = interop.hl7_orm_o01(p, procedure)
    _audit(db, request, "Export HL7 v2 ORM^O01", "hl7", current, patient_id=patient_id, niveau="ok",
           metadata={"procedure": procedure})
    return PlainTextResponse(content=message, media_type="application/hl7-v2")


# ---------------------------------------------------------------------------
# Transport MLLP — envoi RÉEL des messages HL7 ci-dessus sur le réseau,
# plutôt que de se contenter de générer le texte pour un intégrateur tiers.
# ---------------------------------------------------------------------------
class MllpSendBody(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None


def _mllp_config(host, port) -> mllp_client.MllpConfig:
    try:
        return mllp_client.MllpConfig.resolve(host, port)
    except mllp_client.MllpError as e:
        raise HTTPException(400, str(e)) from e


async def _send_hl7_or_502(request: Request, db: Session, current: models.User, patient_id: str,
                            message_type: str, message: str, cfg: mllp_client.MllpConfig) -> dict:
    try:
        result = await resilience.call_with_resilience(
            lambda: run_in_threadpool(mllp_client.send_hl7_message, cfg, message),
            resilience.MLLP_BREAKER, max_attempts=1)
    except resilience.CircuitOpenError as e:
        raise HTTPException(503, str(e)) from e
    except mllp_client.MllpError as e:
        _audit(db, request, f"Échec envoi MLLP {message_type}", "hl7_mllp", current, patient_id=patient_id,
               niveau="error", metadata={"host": cfg.host, "port": cfg.port, "error": str(e)})
        raise HTTPException(502, str(e)) from e
    _audit(db, request, f"Envoi MLLP {message_type} réussi", "hl7_mllp", current, patient_id=patient_id,
           niveau="ok", metadata={"host": cfg.host, "port": cfg.port, "ack": result["ack_code"]})
    return result


@router.post("/hl7/adt/{patient_id}/send")
async def hl7_adt_send(patient_id: str, request: Request, body: MllpSendBody,
                        current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _get_patient_or_404(db, patient_id)
    message = interop.hl7_adt_a08(p)
    cfg = _mllp_config(body.host, body.port)
    return await _send_hl7_or_502(request, db, current, patient_id, "ADT^A08", message, cfg)


@router.post("/hl7/orm/{patient_id}/send")
async def hl7_orm_send(patient_id: str, request: Request, body: MllpSendBody,
                        procedure: str = "Intervention chirurgicale",
                        current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _get_patient_or_404(db, patient_id)
    message = interop.hl7_orm_o01(p, procedure)
    cfg = _mllp_config(body.host, body.port)
    return await _send_hl7_or_502(request, db, current, patient_id, "ORM^O01", message, cfg)


@router.post("/hl7/oru/{patient_id}/send")
async def hl7_oru_send(patient_id: str, request: Request, body: MllpSendBody,
                        current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _get_patient_or_404(db, patient_id)
    segments = db.query(models.Segment).filter(models.Segment.patient_id == patient_id).all()
    last_vol = (db.query(models.VolumetrieResult)
                .filter(models.VolumetrieResult.patient_id == patient_id)
                .order_by(models.VolumetrieResult.computed_at.desc()).first())
    vol_dict = None
    if last_vol:
        vol_dict = {"organ_volume_ml": last_vol.organ_volume_ml, "lesion_volume_ml": last_vol.lesion_volume_ml,
                    "volume_resection_ml": last_vol.volume_resection_ml, "remnant_pct": last_vol.remnant_pct}
    message = interop.hl7_oru_r01(p, vol_dict, segments)
    cfg = _mllp_config(body.host, body.port)
    return await _send_hl7_or_502(request, db, current, patient_id, "ORU^R01", message, cfg)


# ---------------------------------------------------------------------------
# DIMSE classique (C-FIND / C-GET) — pour les PACS n'exposant pas DICOMweb.
# ---------------------------------------------------------------------------
def _dimse_config(host, port, called_ae, calling_ae) -> pacs_dimse.DimseConfig:
    try:
        return pacs_dimse.DimseConfig.resolve(host, port, called_ae, calling_ae)
    except pacs_dimse.DimseConnectionError as e:
        raise HTTPException(400, str(e)) from e


def _dimse_error(e: Exception):
    if isinstance(e, resilience.CircuitOpenError):
        raise HTTPException(503, str(e)) from e
    raise HTTPException(502, str(e)) from e


@router.get("/pacs/dimse/studies")
async def dimse_search_studies(
    request: Request,
    patient_id: str = "", patient_name: str = "", study_date: str = "", accession_number: str = "",
    host: Optional[str] = None, port: Optional[int] = None,
    called_ae: Optional[str] = None, calling_ae: Optional[str] = None,
    current: models.User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """C-FIND niveau étude — pour un PACS n'exposant que le DIMSE classique
    (pas de DICOMweb). Voir /pacs/dimse/series et /pacs/dimse/import pour la suite."""
    cfg = _dimse_config(host, port, called_ae, calling_ae)
    try:
        results = await resilience.call_with_resilience(
            lambda: run_in_threadpool(pacs_dimse.find_studies, cfg, patient_id, patient_name,
                                       study_date, accession_number),
            resilience.DIMSE_BREAKER, max_attempts=1)
    except (pacs_dimse.DimseConnectionError, resilience.CircuitOpenError) as e:
        _dimse_error(e)
    _audit(db, request, "Recherche PACS (C-FIND DIMSE, étude)", "pacs_dimse", current,
           metadata={"host": cfg.host, "port": cfg.port, "n_results": len(results)})
    return results


@router.get("/pacs/dimse/studies/{study_uid}/series")
async def dimse_search_series(study_uid: str, request: Request,
                               host: Optional[str] = None, port: Optional[int] = None,
                               called_ae: Optional[str] = None, calling_ae: Optional[str] = None,
                               current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    cfg = _dimse_config(host, port, called_ae, calling_ae)
    try:
        results = await resilience.call_with_resilience(
            lambda: run_in_threadpool(pacs_dimse.find_series, cfg, study_uid),
            resilience.DIMSE_BREAKER, max_attempts=1)
    except (pacs_dimse.DimseConnectionError, resilience.CircuitOpenError) as e:
        _dimse_error(e)
    _audit(db, request, "Recherche PACS (C-FIND DIMSE, série)", "pacs_dimse", current,
           metadata={"study_uid": study_uid})
    return results


class DimseImportBody(BaseModel):
    patient_id: str
    study_uid: str
    series_uid: str
    host: Optional[str] = None
    port: Optional[int] = None
    called_ae: Optional[str] = None
    calling_ae: Optional[str] = None


@router.post("/pacs/dimse/import")
async def dimse_import_series(body: DimseImportBody, request: Request,
                               current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """C-GET : rapatrie une série depuis un PACS DIMSE classique (une seule
    association, pas de Storage SCP permanent nécessaire côté serveur — voir
    la docstring de pacs_dimse.get_series)."""
    _get_patient_or_404(db, body.patient_id)
    cfg = _dimse_config(body.host, body.port, body.called_ae, body.calling_ae)
    try:
        datasets = await resilience.call_with_resilience(
            lambda: run_in_threadpool(pacs_dimse.get_series, cfg, body.study_uid, body.series_uid),
            resilience.DIMSE_BREAKER, max_attempts=1)
    except (pacs_dimse.DimseConnectionError, resilience.CircuitOpenError) as e:
        _dimse_error(e)

    first = datasets[0]
    modality = getattr(first, "Modality", "OT")
    rows = int(getattr(first, "Rows", 512) or 512)
    cols = int(getattr(first, "Columns", 512) or 512)
    slice_thickness = float(getattr(first, "SliceThickness", 1.0) or 1.0)
    total_bytes = sum(len(getattr(ds, "PixelData", b"") or b"") for ds in datasets)
    sha = hashlib.sha256(f"{body.study_uid}:{body.series_uid}:{len(datasets)}:dimse".encode()).hexdigest()[:16]

    local_series_id = str(uuid.uuid4())
    local_dir = _save_datasets_to_disk(local_series_id, datasets)
    db.add(models.DicomSeries(
        id=local_series_id, patient_id=body.patient_id, study_uid=body.study_uid,
        series_uid=body.series_uid, modality=str(modality), slice_thickness_mm=slice_thickness,
        rows=rows, cols=cols, num_slices=len(datasets), sha256=sha, size_bytes=total_bytes,
        filename=f"PACS-DIMSE:{cfg.host}:{cfg.port}", local_path=str(local_dir),
    ))
    db.commit()
    _audit(db, request, "Import PACS (C-GET DIMSE)", "pacs_dimse", current, patient_id=body.patient_id,
           niveau="ok", metadata={"study_uid": body.study_uid, "series_uid": body.series_uid,
                                   "n_instances": len(datasets)})
    _auto_workflow_hook(db, body.patient_id, local_series_id, str(modality), local_dir)
    return {"imported": True, "local_series_id": local_series_id, "num_instances": len(datasets),
            "modality": str(modality)}
