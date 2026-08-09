# -*- coding: utf-8 -*-
"""
routers/dicom.py — Import DICOM (upload manuel) + pont vers la segmentation IA réelle.

Endpoints exposés :
    POST /dicom/upload
    GET  /dicom/{patient_id}
    POST /segmentation/from-series/{series_id}

Charge aussi segmentation_service.py (pipeline réel TotalSegmentator) dans son
propre try/except : `REAL_SEGMENTATION_AVAILABLE` et `segmentation_service`
sont exposés comme attributs de ce module pour que main.py puisse monter
/meshes en statique et inclure segmentation_service.router (app.mount() et
un second app.include_router() sont des opérations de l'objet FastAPI `app`,
pas d'un APIRouter — main.py reste donc responsable de ce câblage final).
"""

import hashlib
import logging
import os
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

import models
import resilience
from db import get_db
from deps import get_current_user, write_audit
from schemas import DicomMetadata, DicomUploadResponse, SegmentationStartResponse

router = APIRouter(tags=["dicom"])
logger = logging.getLogger("orlsurgplan3d.dicom")

# Dossier où sont réellement sauvegardés les fichiers .dcm des séries
# importées (upload manuel, PACS DICOMweb, PACS DIMSE). Jusqu'à cette session,
# seules les MÉTADONNÉES étaient enregistrées en base (DicomSeries) : les
# pixels étaient jetés après calcul du hash/de la taille, rendant impossible
# d'envoyer une série déjà importée vers la segmentation sans la re-uploader
# manuellement. Indépendant de la disponibilité de TotalSegmentator : la
# sauvegarde des pixels a de la valeur même sans pipeline de segmentation
# installé (visualisation future, ré-export, etc.).
DICOM_STORAGE_DIR = Path(os.getenv("DICOM_STORAGE_DIR", "./storage/dicom_series")).resolve()
DICOM_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Fonctionne même sans TotalSegmentator installé (l'erreur est renvoyée proprement
# dans le statut du job) ; nécessite scikit-image + trimesh pour l'export de maillage.
try:
    import segmentation_service
    segmentation_service.MESH_STORAGE.mkdir(parents=True, exist_ok=True)
    REAL_SEGMENTATION_AVAILABLE = True
except Exception as e:  # noqa: BLE001
    logger.warning("Pipeline de segmentation réelle non chargé: %s. "
                   "Aucune route /segmentation/* disponible tant que segmentation_service.py "
                   "n'est pas importable — vérifier requirements-segmentation.txt.", e)
    segmentation_service = None
    REAL_SEGMENTATION_AVAILABLE = False


@router.post("/dicom/upload", response_model=DicomUploadResponse)
async def upload_dicom(patient_id: str, study_uid: str, modality: str = "CT", slice_thickness_mm: float = 1.0,
                        file: UploadFile = File(...), request: Request = None,
                        current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.get(models.Patient, patient_id):
        raise HTTPException(404, "Patient introuvable.")
    content = await file.read()
    sha = hashlib.sha256(content).hexdigest()[:16]
    series_uid = str(uuid.uuid4())

    # Sauvegarde réelle des pixels (bug corrigé : jusqu'ici `content` n'était
    # utilisé que pour le hash/la taille, puis jeté — rendant impossible tout
    # usage ultérieur, y compris la segmentation, sans re-upload manuel).
    series_dir = DICOM_STORAGE_DIR / series_uid
    series_dir.mkdir(parents=True, exist_ok=True)
    dest_path = series_dir / (file.filename or "uploaded.dcm")
    with open(dest_path, "wb") as f:
        f.write(content)

    rec = models.DicomSeries(
        id=series_uid, patient_id=patient_id, study_uid=study_uid, series_uid=series_uid,
        modality=modality, slice_thickness_mm=slice_thickness_mm, rows=512, cols=512,
        num_slices=max(1, len(content) // (512 * 512 * 2)), sha256=sha, size_bytes=len(content),
        filename=file.filename or "uploaded.dcm", local_path=str(series_dir),
    )
    db.add(rec)
    db.commit()
    write_audit(db, request, "Import DICOM", "dicom", user=current, patient_id=patient_id,
                metadata={"series_uid": series_uid, "modality": modality})
    return {"series_uid": series_uid, "sha256": sha}


@router.get("/dicom/{patient_id}", response_model=List[DicomMetadata])
async def list_dicom(patient_id: str, current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.DicomSeries).filter(models.DicomSeries.patient_id == patient_id).all()


@router.post("/segmentation/from-series/{series_id}", status_code=202, response_model=SegmentationStartResponse)
async def segment_from_existing_series(series_id: str, request: Request,
                                        current: models.User = Depends(get_current_user),
                                        db: Session = Depends(get_db)):
    """Démarre une segmentation IA réelle à partir d'une série DICOM DÉJÀ
    IMPORTÉE (upload manuel, PACS DICOMweb ou DIMSE) — sans avoir à
    re-sélectionner les fichiers depuis l'ordinateur. C'est le pont qui
    manquait entre l'import PACS/DICOM et le viewer 3D : avant cette
    session, aucune série importée n'était réellement sauvegardée sur
    disque, donc aucune ne pouvait être segmentée sans re-upload."""
    # Rate limiting : opération GPU lourde, 5 req/min/IP max.
    client_ip = request.client.host if request.client else "unknown"
    resilience.SEGMENTATION_RATE_LIMITER.check(client_ip)

    if not REAL_SEGMENTATION_AVAILABLE:
        raise HTTPException(503, "Pipeline de segmentation réelle non disponible côté serveur "
                                  "(TotalSegmentator/dicom2nifti non installés).")
    series = db.get(models.DicomSeries, series_id)
    if not series:
        raise HTTPException(404, "Série DICOM introuvable.")
    if not series.local_path:
        raise HTTPException(
            400,
            "Cette série n'a pas de pixels sauvegardés sur disque (importée avant la correction "
            "de ce bug, ou import incomplet). Réimportez-la (upload manuel ou PACS) pour pouvoir "
            "la segmenter directement depuis cet endpoint."
        )
    local_dir = Path(series.local_path)
    if not local_dir.is_dir():
        raise HTTPException(410, f"Le dossier local de cette série n'existe plus sur ce serveur ({local_dir}).")

    try:
        job_id = segmentation_service.start_job_from_dicom_dir(local_dir, series.patient_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except RuntimeError as e:
        # dicom2nifti absent, ou conversion DICOM->NIfTI impossible (série
        # invalide/incomplète) — cas normal et attendu si le pipeline de
        # segmentation réelle n'est pas installé sur ce serveur, pas une
        # panne inattendue : ne doit jamais remonter en 500 brut.
        raise HTTPException(503, str(e)) from e

    write_audit(db, request, "Segmentation IA depuis série importée", "segmentation", user=current,
                patient_id=series.patient_id, metadata={"series_id": series_id, "job_id": job_id})
    return {"job_id": job_id, "status": "pending"}
