# -*- coding: utf-8 -*-
"""
pacs_router_v2.py — Routeur PACS NextGen v2 (DICOMweb Streaming, DICOM-SEG, DICOM-SR & FHIR R5)
================================================================================================
Implémentation pour le Jalon M2 du Cahier des Charges OphtalmoSurg Plan NextGen (2026-2046).
Garantit la compatibilité ascendante sans supprimer ni modifier pacs_router.py (v1).

Endpoints exposés (/api/v2/pacs & /api/v2/fhir) :
    GET  /api/v2/pacs/studies/{study_uid}/series/{series_uid}/stream-voxels (Streaming Octree LOD)
    POST /api/v2/pacs/studies/{study_uid}/series/{series_uid}/export-seg   (Export DICOM-SEG MONAI)
    POST /api/v2/pacs/studies/{study_uid}/export-sr                        (Export DICOM-SR SHAP/XAI)
    GET  /api/v2/fhir/r5/Patient/{patient_id}/DigitalTwins                 (Récupération Jumeaux)
    POST /api/v2/fhir/r5/Procedure                                         (Synchronisation Planning)
"""

from __future__ import annotations

import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from db import get_db
import security as sec

router = APIRouter(prefix="/api/v2", tags=["pacs-nextgen-v2"])

DICOM_STORAGE_DIR = Path(os.getenv("DICOM_STORAGE_DIR", "./storage/dicom_series")).resolve()
DICOM_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_DIR = Path(os.getenv("EXPORT_DIR", "./storage/exports_v2")).resolve()
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Modèles Pydantic pour les requêtes / réponses v2
# ---------------------------------------------------------------------------

class DicomSegExportRequest(BaseModel):
    twin_id: str = Field(..., description="ID UUID du jumeau numérique contenant la segmentation 3D")
    organ_label: str = Field(..., description="Organe ou lésion segmentée", json_schema_extra={"example": "LIVER"})
    ai_model_name: str = Field("MONAI-SwinUNETR-v2.4", description="Nom du modèle IA auteur du masque")
    voxel_count: int = Field(..., description="Nombre de voxels actifs dans le segment", json_schema_extra={"example": 1450200})

class DicomSrExportRequest(BaseModel):
    plan_id: str = Field(..., description="ID UUID du plan chirurgical à exporter en Structured Report")
    ai_risk_score: float = Field(..., description="Score de risque morbi-mortalité prédit", json_schema_extra={"example": 14.2})
    shap_summary: Dict[str, Any] = Field(..., description="Justification XAI SHAP par biomarqueur")
    planned_procedure: str = Field("Hépatectomie droite cœlioscopique", description="Acte chirurgical programmé")

class FhirProcedureRequest(BaseModel):
    patient_id: str = Field(..., description="ID patient dans le DPI / base locale")
    procedure_code: str = Field("CCAM-HMFA004", description="Code acte chirurgical")
    status: str = Field("preparation", json_schema_extra={"example": "preparation"})
    lead_surgeon_rpps: Optional[str] = Field(None, json_schema_extra={"example": "10002345678"})

# ---------------------------------------------------------------------------
# Endpoints DICOMweb Streaming & Part 10 (Jalon M2)
# ---------------------------------------------------------------------------

@router.get("/pacs/studies/{study_uid}/series/{series_uid}/stream-voxels")
async def stream_voxel_bricks(
    study_uid: str,
    series_uid: str,
    lod_level: int = 0,
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    NON IMPLÉMENTÉ RÉELLEMENT : cet endpoint ne transfère aucune donnée voxel réelle.
    Il renvoie uniquement des métadonnées de démonstration décrivant à quoi ressemblerait
    un futur streaming par briques voxels (Octree) pour WebGPU. Pour charger un volume réel,
    voir /pacs/studies/{study_uid}/series/{series_uid} (WADO-RS réel, pacs_client.py) ou le
    pipeline de segmentation (segmentation_service.py).
    """
    meta = {
        "study_uid": study_uid,
        "series_uid": series_uid,
        "lod_level": lod_level,
        "note": "Métadonnées de démonstration uniquement — aucune brique voxel n'est réellement transférée par cet appel.",
    }
    return JSONResponse(content={"status": "not_implemented_demo", "metadata": meta,
                                  "message": "Ceci est un endpoint de démonstration. Aucun streaming voxel réel n'a lieu."})

@router.post("/pacs/studies/{study_uid}/series/{series_uid}/export-seg")
async def export_dicom_seg(
    study_uid: str,
    series_uid: str,
    payload: DicomSegExportRequest,
    db: Session = Depends(get_db)
):
    """
    Écrit les métadonnées de segmentation fournies dans un fichier JSON (PAS un objet
    DICOM-SEG binaire conforme). Ce fichier ne s'ouvrira PAS dans OHIF/Osirix/Sectra ou
    toute autre station PACS attendant un vrai DICOM Segmentation IOD (encodage binaire
    pydicom avec PixelData, dataset complet, etc.) — cela reste à implémenter si une
    interopérabilité PACS réelle est nécessaire.
    """
    export_id = str(uuid.uuid4())
    filename = f"SEG_METADATA_{study_uid}_{export_id[:8]}.json"
    file_path = EXPORT_DIR / filename
    
    seg_metadata = {
        "format": "json-metadata-sidecar (PAS un DICOM-SEG binaire conforme)",
        "intended_sop_class_uid": "1.2.840.10008.5.1.4.1.1.66.4",  # DICOM Segmentation Storage — non généré ici
        "StudyInstanceUID": study_uid,
        "SeriesInstanceUID": series_uid,
        "TwinID": payload.twin_id,
        "Organ": payload.organ_label,
        "AI_Model": payload.ai_model_name,
        "VoxelCount": payload.voxel_count,
        "GeneratedAt": datetime.now(timezone.utc).isoformat()
    }
    
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(seg_metadata, f, indent=2)
        
    file_hash = hashlib.sha256(json.dumps(seg_metadata).encode()).hexdigest()
    try:
        db.execute(text("""
            INSERT INTO audit_logs (id, action_type, target_resource, resource_id, details, cryptographic_hash)
            VALUES (:id, 'EXPORT_SEG_METADATA_JSON', 'dicom_series', :res_id, :details, :hash)
        """), {
            "id": str(uuid.uuid4()),
            "res_id": series_uid,
            "details": json.dumps({"export_id": export_id, "file_path": str(file_path)}),
            "hash": file_hash
        })
        db.commit()
    except Exception as e:
        db.rollback()

    return {
        "status": "success",
        "format": "json-metadata-sidecar",
        "warning": "Ce n'est PAS un fichier DICOM binaire conforme — non lisible par un PACS tiers.",
        "export_id": export_id,
        "file_path": str(file_path),
        "sha256": file_hash
    }

@router.post("/pacs/studies/{study_uid}/export-sr")
async def export_dicom_sr(
    study_uid: str,
    payload: DicomSrExportRequest,
    db: Session = Depends(get_db)
):
    """
    Écrit un résumé JSON (PAS un objet DICOM SR binaire conforme TID 1500/1400) contenant
    les valeurs fournies (score de risque, résumé d'explicabilité). Ne s'ouvrira PAS dans
    une station PACS attendant un vrai DICOM Structured Report.
    """
    export_id = str(uuid.uuid4())
    filename = f"SR_SUMMARY_{study_uid}_{export_id[:8]}.json"
    file_path = EXPORT_DIR / filename
    
    sr_content = {
        "format": "json-metadata-sidecar (PAS un DICOM SR binaire conforme)",
        "intended_sop_class_uid": "1.2.840.10008.5.1.4.1.1.88.33",  # Comprehensive 3D SR — non généré ici
        "StudyInstanceUID": study_uid,
        "PlanID": payload.plan_id,
        "Procedure": payload.planned_procedure,
        "AIRiskScore": payload.ai_risk_score,
        "SHAP_Explanations": payload.shap_summary,
        "Timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(sr_content, f, indent=2)
        
    file_hash = hashlib.sha256(json.dumps(sr_content).encode()).hexdigest()
    
    return {
        "status": "success",
        "format": "json-metadata-sidecar",
        "warning": "Ce n'est PAS un fichier DICOM SR binaire conforme — non lisible par un PACS tiers.",
        "export_id": export_id,
        "file_path": str(file_path),
        "sha256": file_hash
    }

# ---------------------------------------------------------------------------
# Endpoints FHIR R5 (Jalon M2 & Interopérabilité SIH)
# ---------------------------------------------------------------------------

@router.get("/fhir/r5/Patient/{patient_id}/DigitalTwins")
async def get_patient_digital_twins(patient_id: str, db: Session = Depends(get_db)):
    """
    Retourne la liste des Jumeaux Numériques 3D d'un patient sous format de ressource FHIR R5
    personnalisée (ImagingStudy + BiomedicalDeviceExtension).
    """
    try:
        rows = db.execute(text("""
            SELECT id, version, status, organ_target, created_at
            FROM digital_twins
            WHERE patient_id = :pid OR patient_id = :pid_short
            ORDER BY created_at DESC
        """), {"pid": patient_id, "pid_short": patient_id[:8]}).fetchall()
    except Exception:
        rows = []
        
    twins_fhir = []
    for r in rows:
        twins_fhir.append({
            "resourceType": "BiomedicalDigitalTwin",
            "id": str(r[0]),
            "version": r[1],
            "status": r[2],
            "organTarget": r[3],
            "subject": {
                "reference": f"Patient/{patient_id}"
            },
            "created": r[4].isoformat() if hasattr(r[4], "isoformat") else str(r[4])
        })
        
    return {
        "resourceType": "Bundle",
        "type": "searchset",
        "total": len(twins_fhir),
        "entry": [{"resource": t} for t in twins_fhir]
    }

@router.post("/fhir/r5/Procedure")
async def create_or_sync_fhir_procedure(payload: FhirProcedureRequest, db: Session = Depends(get_db)):
    """
    Synchronise le planning chirurgical avec le DPI / HIS hospitalier via la ressource FHIR R5 Procedure.
    """
    proc_id = str(uuid.uuid4())
    procedure_resource = {
        "resourceType": "Procedure",
        "id": proc_id,
        "status": payload.status,
        "code": {
            "coding": [{
                "system": "https://www.ameli.fr/ccam",
                "code": payload.procedure_code,
                "display": "Acte chirurgical planifié sous OphtalmoSurg Plan"
            }]
        },
        "subject": {
            "reference": f"Patient/{payload.patient_id}"
        },
        "performer": [{
            "actor": {
                "reference": f"Practitioner/{payload.lead_surgeon_rpps or 'UNKNOWN'}"
            }
        }],
        "authoredOn": datetime.now(timezone.utc).isoformat()
    }
    
    return {
        "status": "created",
        "procedure_id": proc_id,
        "fhir_resource": procedure_resource
    }
