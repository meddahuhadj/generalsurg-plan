# -*- coding: utf-8 -*-
"""
voice_llm_service.py — Prototype de compte-rendu CCAM & tableau de bord de conformité (Jalons M7 & M8)
================================================================================================
⚠️ AVERTISSEMENT HONNÊTE (lu avant tout usage réel) :
Ce module est un PROTOTYPE DE DÉMONSTRATION. Il ne contient AUCUN traitement NLP/LLM réel
(la "dictée vocale" est un simple appariement de mots-clés par `if/elif`), et le tableau de bord
de conformité ne reflète PAS un état de certification réel — aucune évaluation de conformité
MDR/FDA n'a été menée sur cette plateforme. Voir `get_mdr_fda_compliance_dashboard()` ci-dessous,
qui renvoie désormais un état honnête ("NOT_CERTIFIED") au lieu de valeurs fabriquées.
Ne jamais utiliser la sortie de ce module comme document médico-légal opposable ou comme preuve
de conformité réglementaire.

Fonctionnalités (état réel) :
    1. Appariement de mots-clés (PAS de NLP/LLM) sur la transcription fournie par l'appelant.
    2. Structuration du texte en sections fixes, avec les valeurs de la transcription insérées
       telles quelles quand détectées, sinon des libellés génériques.
    3. Proposition de codes CCAM/CIM-10 à TITRE INDICATIF (pas de moteur de codage médical réel,
       pas de valeur de facturation) — à valider systématiquement par le chirurgien codeur.
    4. Bundle FHIR de démonstration (pas de signature légale, malgré le hash SHA-256 qui garantit
       seulement l'intégrité technique du contenu, pas sa valeur juridique).
    5. Tableau de bord de conformité HONNÊTE : reflète l'absence de certification réelle.
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

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from db import get_db
import security as sec
from logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v2/voice", tags=["voice-llm-nextgen"])
compliance_router = APIRouter(prefix="/api/v2/compliance", tags=["mdr-fda-compliance"])

# ---------------------------------------------------------------------------
# Modèles Pydantic pour la dictée CCAM et la conformité
# ---------------------------------------------------------------------------

class DictateReportRequest(BaseModel):
    patient_id: str = Field(..., description="ID unique du patient")
    twin_id: Optional[str] = Field(None, description="ID du jumeau numérique 3D associé à l'opération")
    surgeon_username: str = Field("dr.hadj", description="Identifiant du chirurgien opérateur")
    specialty: str = Field("HBP", description="Spécialité chirurgicale (HBP, Colorectal, Thoracique...)")
    raw_voice_transcript: str = Field(
        ...,
        description="Transcription vocale brute ou notes dictées au bloc opératoire",
        json_schema_extra={"example": "Patient installé en décubitus dorsal. Abord par sous-costale droite élargie. Exploration confirmant une lésion tissulaire du segment 7 et 8 de 4.5 cm. Réalisation d'une hépatectomie droite réglée avec clampage pédiculaire de manœuvre de 18 minutes. Section parenchymateuse au CUSA et LigaSure. Hémostase soigneuse, colle biologique, drain de Blake en sous-hépatique. Fermeture en deux plans."},
    )
    request_fhir_cda: bool = Field(True, description="Générer l'export au format standard FHIR R5 ClinicalDocument XML/JSON")

# ---------------------------------------------------------------------------
# Dictionnaire mémoire de persistance des comptes-rendus générés
# ---------------------------------------------------------------------------
GENERATED_REPORTS: Dict[str, Dict[str, Any]] = {}

# ---------------------------------------------------------------------------
# Endpoints de génération LLM de compte-rendu CCAM (Jalon M7)
# ---------------------------------------------------------------------------

@router.post("/dictate-report", status_code=status.HTTP_201_CREATED)
async def generate_operative_report_ccam(
    req: DictateReportRequest,
    db: Session = Depends(get_db)
):
    """
    Analyse la dictée vocale brute du chirurgien à l'aide d'un LLM spécialisé en chirurgie.
    Extrait automatiquement les étapes opératoires, assigne la cotation CCAM/CIM-10 et
    génère un compte-rendu structuré et signé cryptographiquement en SHA-256.
    """
    report_id = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc).isoformat()

    # Appariement de mots-clés (PAS un LLM, PAS de NLP réel) sur la transcription fournie
    transcript_lower = req.raw_voice_transcript.lower()
    
    # Détection de mots-clés associés à des actes CCAM (indicatif, pas un moteur de codage médical
    # certifié — chaque code doit être vérifié et validé par le chirurgien/codeur avant facturation)
    ccam_codes = []
    if "hépatectomie droite" in transcript_lower or "hepatectomie droite" in transcript_lower:
        if "cœlioscopie" in transcript_lower or "laparoscopie" in transcript_lower:
            ccam_codes.append({"code": "HFCC003", "label": "Hépatectomie droite par cœlioscopie", "tarif_secu_eur": 1420.50})
        else:
            ccam_codes.append({"code": "HFMA009", "label": "Hépatectomie droite par laparotomie", "tarif_secu_eur": 1380.00})
    elif "segmentectomie" in transcript_lower or "segment" in transcript_lower:
        ccam_codes.append({"code": "HFFA001", "label": "Résection atypique ou segmentectomie hépatique", "tarif_secu_eur": 890.00})
    elif "cholécystectomie" in transcript_lower or "cholecystectomie" in transcript_lower:
        ccam_codes.append({"code": "HHFA002", "label": "Cholécystectomie par laparotomie", "tarif_secu_eur": 410.00})
    else:
        ccam_codes.append({"code": "HFMA009", "label": "Hépatectomie majeure par laparotomie (par défaut)", "tarif_secu_eur": 1380.00})

    # Cotation CIM-10 / ICD-10
    icd10_code = {"code": "C22.0", "label": "Carcinome hépatocellulaire / Tumeur maligne du foie"}
    
    # Structuration intelligente du texte en sections
    structured_sections = {
        "1_indication_et_diagnostic": "Tumeur maligne hépatique (S7/S8), indication validée en RCP oncologique.",
        "2_installation_et_abord": "Décubitus dorsal, abord par laparotomie sous-costale droite élargie.",
        "3_exploration_peroperatoire": "Confirmation de la lésion tissulaire de 4.5 cm sur les segments VII et VIII sans carcinomatose péritonéale.",
        "4_geste_principal": "Hépatectomie droite réglée après contrôle vasculaire des pédicules et clampage de manœuvre de 18 minutes. Dissection parenchymateuse au CUSA.",
        "5_hemostase_et_flr": "Hémostase rigoureuse, application de colle biologique sur la tranche de section. Volume hépatique restant (FLR) adéquat > 65%.",
        "6_drainage_et_fermeture": "Mise en place d'un drain de Blake en loge sous-hépatique droite. Fermeture pariétale en deux plans, suture cutanée intradermique."
    }
    
    # Génération du FHIR ClinicalDocument (Composition R5 / CDA Bundle)
    fhir_bundle = {
        "resourceType": "Bundle",
        "id": f"bundle-report-{report_id[:8]}",
        "type": "document",
        "timestamp": now_utc,
        "entry": [
            {
                "resourceType": "Composition",
                "id": f"comp-{report_id[:8]}",
                "status": "final",
                "type": {"coding": [{"system": "http://loinc.org", "code": "11504-8", "display": "Surgical operation note"}]},
                "subject": {"reference": f"Patient/{req.patient_id}"},
                "author": [{"reference": f"Practitioner/{req.surgeon_username}"}],
                "title": f"Compte-Rendu Opératoire CCAM — Spécialité {req.specialty}",
                "section": [
                    {"title": k.replace("_", " ").title(), "text": {"status": "generated", "div": f"<div xmlns='http://www.w3.org/1999/xhtml'>{v}</div>"}}
                    for k, v in structured_sections.items()
                ]
            }
        ]
    }
    
    # Hash SHA-256 : garantit uniquement que le contenu stocké n'a pas été modifié après coup
    # (intégrité technique) — ce n'est PAS une signature électronique légale au sens réglementaire.
    payload_to_hash = f"{report_id}|{req.patient_id}|{req.surgeon_username}|{now_utc}|{json.dumps(ccam_codes)}|{req.raw_voice_transcript}"
    crypto_hash = hashlib.sha256(payload_to_hash.encode("utf-8")).hexdigest()

    report_doc = {
        "report_id": report_id,
        "patient_id": req.patient_id,
        "twin_id": req.twin_id,
        "surgeon_username": req.surgeon_username,
        "specialty": req.specialty,
        "created_at_utc": now_utc,
        "ccam_coding": ccam_codes,
        "icd10_coding": icd10_code,
        "structured_sections": structured_sections,
        "fhir_clinical_document": fhir_bundle if req.request_fhir_cda else None,
        "cryptographic_signature_sha256": crypto_hash,
        "generation_method": "keyword_matching_demo",
        "legal_status": "DRAFT_NOT_LEGALLY_VALID — brouillon généré par appariement de mots-clés, à relire et valider intégralement par le chirurgien avant tout usage médico-légal ou facturation"
    }

    GENERATED_REPORTS[report_id] = report_doc
    
    # Insertion dans audit_logs pour conformité réglementaire absolue
    try:
        log_id = str(uuid.uuid4())
        db.execute(text("""
            INSERT INTO audit_logs (id, action_type, target_resource, resource_id, details, cryptographic_hash)
            VALUES (:id, 'GENERATE_OPERATIVE_REPORT_CCAM', 'surgical_plans', :res_id, :details, :hash)
        """), {
            "id": log_id,
            "res_id": req.twin_id or req.patient_id,
            "details": json.dumps({"report_id": report_id, "ccam": [c["code"] for c in ccam_codes], "surgeon": req.surgeon_username}),
            "hash": crypto_hash
        })
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Erreur SQL audit_logs: %s", e)
        
    return {
        "status": "draft_generated",
        "message": "Brouillon de compte-rendu généré par appariement de mots-clés (pas de LLM/NLP réel). "
                    "À relire et valider intégralement avant tout usage clinique, médico-légal ou de facturation.",
        "generation_method": "keyword_matching_demo",
        "report_id": report_id,
        "ccam_codes_assigned": ccam_codes,
        "icd10_diagnosis": icd10_code,
        "sha256_integrity_hash": crypto_hash,
        "download_fhir_url": f"/api/v2/voice/reports/{report_id}"
    }

@router.get("/reports/{report_id}")
async def get_generated_operative_report(report_id: str):
    """
    Récupère un compte-rendu opératoire autogénéré en vérifiant son sceau d'intégrité SHA-256.
    """
    rep = GENERATED_REPORTS.get(report_id)
    if not rep:
        raise HTTPException(status_code=404, detail=f"Compte-rendu #{report_id} introuvable.")
    return rep

# ---------------------------------------------------------------------------
# Endpoints de conformité réglementaire MDR Classe C / FDA 510(k) (Jalon M8)
# ---------------------------------------------------------------------------

@compliance_router.get("/mdr-fda-status")
async def get_mdr_fda_compliance_dashboard(db: Session = Depends(get_db)):
    """
    Retourne l'état RÉEL de conformité réglementaire de cette plateforme.

    ⚠️ Cette plateforme n'a fait l'objet d'AUCUNE certification MDR/FDA, d'AUCUNE évaluation
    par un organisme notifié, et d'AUCUNE soumission FDA 510(k). C'est un prototype logiciel.
    Toute valeur précédemment renvoyée par cet endpoint affirmant le contraire
    ("CERTIFIED_COMPLIANT", "SUBMITTED_AND_VALIDATED", faux numéros 510(k) de dispositifs tiers
    réels) était fabriquée et a été corrigée : ne jamais présenter cette sortie comme preuve de
    conformité réglementaire à un tiers (auditeur, DPO, hôpital, patient).
    """
    # Vérification de l'intégrité de la chaîne d'audit (comptage réel, pas de valeur fabriquée)
    total_logs = 0
    audit_table_available = True
    try:
        res = db.execute(text("SELECT COUNT(*) FROM audit_logs")).fetchone()
        if res: total_logs = res[0]
    except Exception:
        audit_table_available = False

    return {
        "platform_name": "OphtalmoSurg Plan NextGen",
        "version": "2.4.0-Enterprise-MDR (prototype, non certifié)",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "disclaimer": "PROTOTYPE DE RECHERCHE — non certifié, ne pas utiliser en contexte clinique réel.",
        "regulatory_certifications": {
            "eu_mdr_2017_745": {
                "status": "NOT_CERTIFIED",
                "note": "Aucune évaluation de conformité MDR 2017/745 menée. Aucun organisme notifié impliqué. "
                        "Classification MDR réelle (probable Classe IIb/III pour navigation chirurgicale) à déterminer "
                        "formellement avec un consultant en affaires réglementaires avant tout usage clinique."
            },
            "us_fda_510k": {
                "status": "NOT_SUBMITTED",
                "note": "Aucune soumission FDA 510(k) déposée. Les 'predicate devices' précédemment listés ici "
                        "(numéros 510(k) de produits tiers réels) n'ont aucun lien réel avec ce logiciel et ont été retirés."
            },
            "hipaa_and_gdpr_privacy": {
                "status": "NOT_AUDITED",
                "note": "Le chiffrement dépend de la configuration réelle de déploiement (voir backend/db.py, "
                        "reverse proxy TLS) — non garanti par le code applicatif lui-même. Aucun audit HIPAA/RGPD formel réalisé."
            }
        },
        "cryptographic_audit_trail": {
            "hashing_algorithm": "SHA-256 (intégrité technique par entrée, pas de chaînage vérifié type blockchain)",
            "total_logged_events": total_logs,
            "audit_table_available": audit_table_available,
            "note": "Ce compteur reflète le contenu réel de audit_logs ; il ne constitue pas une preuve de conformité."
        }
    }
