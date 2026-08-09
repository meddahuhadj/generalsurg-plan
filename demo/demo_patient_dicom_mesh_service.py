# -*- coding: utf-8 -*-
"""
demo_patient_dicom_mesh_service.py — Exemple de démonstration (dossier demo/)
===================================================================================================
⚠️ AVERTISSEMENT HONNÊTE : ce module NE fait AUCUNE ingestion PACS réelle, AUCUNE segmentation
automatique réelle, et NE calcule AUCUN maillage 3D réel. C'est un dictionnaire codé en dur de
deux patients FICTIFS ("Sophie Martin", "Jean Dupont") dont les volumes, diagnostics et fichiers
.gltf référencés n'existent pas sur disque.

Ce module vit dans `demo/`, en dehors du chemin de l'API (`backend/`) : il illustre la STRUCTURE
des données qu'un vrai pipeline PACS → segmentation → maillage produirait, rien de plus. Il n'est
chargé que par la version "Recherche / Démo" du logiciel (flag `DEMO_MODE=true`) et JAMAIS par la
version "Clinique / Production" (`DEMO_MODE=false` ou `APP_MODE=clinical`).

Mention obligatoire : CE LOGICIEL N'EST PAS DESTINÉ À UN USAGE CLINIQUE — version de
démonstration. Les données ci-dessous sont fictives.

Pour une intégration PACS → segmentation → maillage réellement fonctionnelle, voir
`backend/pacs_router.py` / `backend/pacs_router_v2.py` (import DICOMweb/DIMSE réel) et
`backend/segmentation_service.py` (pipeline TotalSegmentator réel, avec échec propre si les
dépendances ne sont pas installées).
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# Le module vit hors de backend/ : on ajoute ce dossier au sys.path pour pouvoir
# réutiliser les helpers backend (db, logging) dans ce démo. Voir demo/__init__.py.
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from db import get_db
from logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v2/demo/patient-anatomy", tags=["demo-fictional-anatomy"])

# ---------------------------------------------------------------------------
# Modèles Pydantic
# ---------------------------------------------------------------------------

class IngestReconstructRequest(BaseModel):
    patient_id: str = Field(..., description="ID unique du patient (ex: PAT-2026-001)")
    pacs_study_uid: str = Field("1.2.840.113619.2.55.3.2831178355.892.1705829100.1", description="UID de l'étude DICOM (fictif, démonstration uniquement)")
    modality: str = Field("CT_ENHANCED_PORTAL_PHASE", description="Modalité d'imagerie médicale (CT ou MRI)")
    ai_segmentation_engine: str = Field("TOTAL_SEGMENTATOR_V2_3D_MONAI", description="Nom affiché à titre indicatif — aucun moteur IA n'est réellement exécuté ici")

# ---------------------------------------------------------------------------
# Données FICTIVES de démonstration (aucun patient réel, aucune imagerie réelle)
# ---------------------------------------------------------------------------

FICTIONAL_DEMO_ANATOMY_DB = {
    "PAT-2026-001": {
        "patient_name": "Sophie Martin (patient fictif de démonstration)",
        "age": 52,
        "pathology": "Carcinome Hépatocellulaire (CHC) Hilaire S4/S8 avec thrombus porte — scénario fictif",
        "dicom_metadata": {
            "pacs_ae_title": "DEMO_FICTIF",
            "study_instance_uid": "1.2.840.113619.2.55.3.2831178355.892.1705829100.1",
            "series_description": "CT ABDOMEN 4-PHASE (PORTAL VENOUS) — démonstration",
            "voxel_resolution_mm": [0.625, 0.625, 1.00],
            "slice_count": 482
        },
        "volumetric_analysis_ml": {
            "total_liver_volume_tlv": 1420.0,
            "tumor_volume_chc": 320.0,
            "resected_volume_s5_s8": 780.0,
            "future_liver_remnant_flr_s1_s2_s3_s4_s6_s7": 640.0,
            "flr_ratio_pct": 45.07,
            "portal_vein_diameter_mm": 14.2,
            "tumor_portal_contact_arc_deg": 185.0
        },
        "3d_mesh_manifest_gltf": [
            {"organ": "Liver_Parenchyma", "url": "/models/real_patient_001/liver_parenchyma.gltf", "vertices": 184500, "color": "#8b5cf6", "volume_ml": 1420.0},
            {"organ": "Tumor_Hilar_CHC", "url": "/models/real_patient_001/tumor_chc.gltf", "vertices": 42100, "color": "#ef4444", "volume_ml": 320.0},
            {"organ": "Portal_Vein_Tree", "url": "/models/real_patient_001/portal_vein.gltf", "vertices": 65200, "color": "#38bdf8", "volume_ml": 85.4},
            {"organ": "Hepatic_Artery_Tree", "url": "/models/real_patient_001/hepatic_artery.gltf", "vertices": 38900, "color": "#f43f5e", "volume_ml": 42.1},
            {"organ": "Hepatic_Veins_IVC", "url": "/models/real_patient_001/hepatic_veins.gltf", "vertices": 51000, "color": "#3b82f6", "volume_ml": 110.5},
            {"organ": "Gallbladder", "url": "/models/real_patient_001/gallbladder.gltf", "vertices": 12400, "color": "#10b981", "volume_ml": 45.0}
        ],
        "webgpu_raw_volume_buffer": "/volumes/real_patient_001/abdomen_portal_uint16_512x512x482.raw",
        "is_real_patient_anatomy": False,
        "status": "FICTIONAL_DEMO_DATA — patient et imagerie inventés, aucun fichier .gltf/.raw réel derrière ces URLs"
    },
    "PAT-2026-002": {
        "patient_name": "Jean Dupont (patient fictif de démonstration)",
        "age": 67,
        "pathology": "Métastases Colorectales Bilobaires (S2, S3, S7) — scénario fictif",
        "dicom_metadata": {
            "pacs_ae_title": "DEMO_FICTIF",
            "study_instance_uid": "1.2.840.113619.2.55.3.9982147721.401.1705831000.2",
            "series_description": "MRI LIVER PRIMOVIST 3D T1 GRE — démonstration",
            "voxel_resolution_mm": [0.80, 0.80, 1.20],
            "slice_count": 360
        },
        "volumetric_analysis_ml": {
            "total_liver_volume_tlv": 1580.0,
            "tumor_volume_chc": 190.0,
            "resected_volume_s5_s8": 520.0,
            "future_liver_remnant_flr_s1_s2_s3_s4_s6_s7": 1060.0,
            "flr_ratio_pct": 67.09,
            "portal_vein_diameter_mm": 12.8,
            "tumor_portal_contact_arc_deg": 0.0
        },
        "3d_mesh_manifest_gltf": [
            {"organ": "Liver_Parenchyma", "url": "/models/real_patient_002/liver_parenchyma.gltf", "vertices": 195000, "color": "#8b5cf6", "volume_ml": 1580.0},
            {"organ": "Tumor_Metastases", "url": "/models/real_patient_002/tumors_crc.gltf", "vertices": 38000, "color": "#ef4444", "volume_ml": 190.0},
            {"organ": "Portal_Vein_Tree", "url": "/models/real_patient_002/portal_vein.gltf", "vertices": 58000, "color": "#38bdf8", "volume_ml": 92.0}
        ],
        "webgpu_raw_volume_buffer": "/volumes/real_patient_002/liver_mri_uint16_512x512x360.raw",
        "is_real_patient_anatomy": False,
        "status": "FICTIONAL_DEMO_DATA — patient et imagerie inventés, aucun fichier .gltf/.raw réel derrière ces URLs"
    }
}

# ---------------------------------------------------------------------------
# Endpoints REST
# ---------------------------------------------------------------------------

@router.get("/status")
async def get_anatomy_pipeline_status():
    """
    État réel de ce module de démonstration : aucune ingestion PACS ni segmentation IA n'est
    réellement exécutée ici. Pour le pipeline réel, voir /segmentation/capabilities (main.py),
    qui détecte honnêtement les dépendances (TotalSegmentator, dicom2nifti) réellement installées.
    """
    return {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "module_status": "FICTIONAL_DEMO_ONLY",
        "note": "Ce module renvoie des données de patients fictifs codées en dur. Il ne doit jamais "
                "être présenté comme un flux clinique réel. Utiliser /segmentation/capabilities et "
                "/segmentation/auto (segmentation_service.py) pour le pipeline de segmentation réel.",
        "real_pipeline_capabilities_endpoint": "/segmentation/capabilities"
    }

@router.post("/ingest-and-reconstruct")
async def ingest_pacs_dicom_and_reconstruct_3d(
    req: IngestReconstructRequest,
    db: Session = Depends(get_db)
):
    """
    Démonstration uniquement : ne contacte aucun PACS et n'exécute aucune IA. Renvoie soit l'un des
    deux patients fictifs prédéfinis, soit un jeu de données générique clairement marqué comme fictif.
    """
    now_utc = datetime.now(timezone.utc).isoformat()
    reconstruct_id = str(uuid.uuid4())

    patient_data = FICTIONAL_DEMO_ANATOMY_DB.get(req.patient_id)
    if not patient_data:
        # Jeu de données générique, explicitement marqué comme fictif — PAS un vrai calcul
        patient_data = {
            "patient_name": f"Patient fictif de démonstration ({req.patient_id})",
            "age": 58,
            "pathology": "Scénario fictif générique — aucune donnée d'imagerie réelle",
            "dicom_metadata": {
                "pacs_ae_title": "DEMO_FICTIF",
                "study_instance_uid": req.pacs_study_uid,
                "series_description": f"DEMO GENERIQUE {req.modality}",
                "voxel_resolution_mm": [0.70, 0.70, 1.00],
                "slice_count": 400
            },
            "volumetric_analysis_ml": {
                "total_liver_volume_tlv": 1500.0,
                "tumor_volume_chc": 250.0,
                "resected_volume_s5_s8": 600.0,
                "future_liver_remnant_flr_s1_s2_s3_s4_s6_s7": 900.0,
                "flr_ratio_pct": 60.00,
                "portal_vein_diameter_mm": 13.5,
                "tumor_portal_contact_arc_deg": 45.0
            },
            "3d_mesh_manifest_gltf": [
                {"organ": "Liver_Parenchyma", "url": f"/models/{req.patient_id}/liver.gltf", "vertices": 180000, "color": "#8b5cf6", "volume_ml": 1500.0},
                {"organ": "Tumor_Lesion", "url": f"/models/{req.patient_id}/tumor.gltf", "vertices": 35000, "color": "#ef4444", "volume_ml": 250.0},
                {"organ": "Portal_Vein_Tree", "url": f"/models/{req.patient_id}/portal_vein.gltf", "vertices": 60000, "color": "#38bdf8", "volume_ml": 80.0}
            ],
            "webgpu_raw_volume_buffer": f"/volumes/{req.patient_id}/volume_uint16_512x512x400.raw",
            "is_real_patient_anatomy": False,
            "status": "FICTIONAL_DEMO_DATA — aucune donnée réelle pour ce patient_id"
        }

    payload_to_hash = f"{reconstruct_id}|{req.patient_id}|{req.pacs_study_uid}|{req.ai_segmentation_engine}|{now_utc}"
    crypto_hash = hashlib.sha256(payload_to_hash.encode("utf-8")).hexdigest()

    try:
        log_id = str(uuid.uuid4())
        db.execute(text("""
            INSERT INTO audit_logs (id, action_type, target_resource, resource_id, details, cryptographic_hash)
            VALUES (:id, 'FICTIONAL_DEMO_ANATOMY_REQUEST', 'digital_twins', :res_id, :details, :hash)
        """), {
            "id": log_id,
            "res_id": req.patient_id,
            "details": json.dumps({
                "study_uid": req.pacs_study_uid,
                "modality": req.modality,
                "note": "fictional_demo_data",
                "tlv_ml": patient_data["volumetric_analysis_ml"]["total_liver_volume_tlv"]
            }),
            "hash": crypto_hash
        })
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Erreur SQL audit_logs: %s", e)

    return {
        "reconstruction_event_id": reconstruct_id,
        "patient_id": req.patient_id,
        "patient_name": patient_data["patient_name"],
        "clinical_workflow": "FICTIONAL_DEMO_ONLY — aucune ingestion PACS ni segmentation IA réelle exécutée",
        "dicom_metadata": patient_data["dicom_metadata"],
        "ai_segmentation_results": {
            "engine_requested": req.ai_segmentation_engine,
            "note": "Aucun moteur IA n'a réellement tourné ; ces chiffres sont codés en dur.",
            "structures_segmented_count": len(patient_data["3d_mesh_manifest_gltf"])
        },
        "volumetric_analysis_ml": patient_data["volumetric_analysis_ml"],
        "3d_mesh_manifest_gltf": patient_data["3d_mesh_manifest_gltf"],
        "webgpu_raw_volume_buffer": patient_data["webgpu_raw_volume_buffer"],
        "is_real_patient_anatomy": False,
        "sha256_audit_seal": crypto_hash,
        "timestamp_utc": now_utc
    }

@router.get("/{patient_id}/mesh-manifest")
async def get_patient_3d_mesh_manifest(patient_id: str):
    """
    Renvoie le manifeste de maillages FICTIFS pour un des deux patients de démonstration connus.

    Important (correctif de sécurité patient) : contrairement à la version précédente de ce module,
    cet endpoint ne se replie plus silencieusement sur les données d'un AUTRE patient fictif si
    `patient_id` est inconnu — cela aurait pu faire croire qu'une anatomie appartient à un patient
    alors qu'elle appartient à un autre. Un `patient_id` inconnu renvoie désormais une erreur 404.
    """
    patient_data = FICTIONAL_DEMO_ANATOMY_DB.get(patient_id)
    if not patient_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Aucune donnée de démonstration fictive pour patient_id={patient_id!r}. "
                   f"Ce module ne contient que 2 patients fictifs prédéfinis (PAT-2026-001, PAT-2026-002) "
                   f"et ne doit pas être utilisé pour de vraies données patient."
        )

    return {
        "patient_id": patient_id,
        "patient_name": patient_data["patient_name"],
        "is_real_patient_anatomy": False,
        "workflow_mode": "FICTIONAL_DEMO_ONLY",
        "volumetric_summary_ml": patient_data["volumetric_analysis_ml"],
        "meshes": patient_data["3d_mesh_manifest_gltf"],
        "raw_volume": patient_data["webgpu_raw_volume_buffer"],
        "timestamp_utc": datetime.now(timezone.utc).isoformat()
    }
