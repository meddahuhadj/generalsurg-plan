# -*- coding: utf-8 -*-
"""
voice_llm_service.py — EXEMPLE DE STRUCTURE DE DONNÉES (pas un assistant de dictée certifié)
============================================================================================
⚠️ CE MODULE EST UN EXEMPLE DE STRUCTURE DE DONNÉES, PAS UN ASSISTANT DE DICTÉE
MÉDICALE CERTIFIÉ.

Ce qu'il fait réellement :
    1. Il documente la STRUCTURE des données qu'un compte-rendu opératoire
       structuré devrait avoir (sections, codages CCAM/CIM-10, bundle FHIR
       ClinicalDocument) — pour servir de référence aux développeurs, pas
       comme document opposable.
    2. L'endpoint `/voice/dictate-report` produit UN EXEMPLE de cette structure
       à partir d'un simple appariement de mots-clés (`if/elif`), PAS d'un
       traitement NLP/LLM réel. Les codes CCAM/CIM-10 proposés sont INDICATIFS,
       sans valeur de facturation, et doivent être vérifiés par le chirurgien
       codeur.
    3. Le hash SHA-256 garantit uniquement l'intégrité technique du contenu,
       pas sa valeur juridique. Aucune certification réglementaire n'est
       revendiquée.

Ne JAMAIS utiliser la sortie de ce module comme document médico-légal
opposable, ni comme preuve de conformité réglementaire, ni pour facturer.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from db import get_db
from logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v2/voice", tags=["voice-dictation-data-structure-example"])


# ---------------------------------------------------------------------------
# Modèle Pydantic — exemple de structure de données d'entrée
# ---------------------------------------------------------------------------

class DictateReportRequest(BaseModel):
    patient_id: str = Field(..., description="ID unique du patient")
    twin_id: Optional[str] = Field(None, description="ID du jumeau numérique 3D associé à l'opération")
    surgeon_username: str = Field("dr.hadj", description="Identifiant du chirurgien opérateur")
    specialty: str = Field("Laryngologie", description="Spécialité chirurgicale (Laryngologie, Otologie, Rhinologie, Cervico-facial, ORL Pédiatrique...)")
    raw_voice_transcript: str = Field(
        ...,
        description="Transcription vocale brute ou notes dictées au bloc opératoire",
        json_schema_extra={"example": "Patient installé en décubitus dorsal, tête en légère extension. Cervicotomie horizontale. Exploration confirmant un carcinome épidermoïde glottique cT3N1 avec corde vocale fixée. Réalisation d'une laryngectomie totale avec curage cervical fonctionnel bilatéral des niveaux II à IV. Fermeture pharyngienne en T. Mise en place d'une prothèse phonatoire trachéo-œsophagienne de type Provox. Trachéostome confectionné. Fermeture en deux plans."},
    )
    request_fhir_cda: bool = Field(True, description="Inclure l'exemple de bundle FHIR R5 ClinicalDocument dans la réponse")


# ---------------------------------------------------------------------------
# Exemple de structure de données — dictionnaire de persistance en mémoire
# ---------------------------------------------------------------------------
GENERATED_REPORTS: Dict[str, Dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Endpoint de démonstration de la STRUCTURE de données (pas un assistant réel)
# ---------------------------------------------------------------------------

@router.post("/dictate-report", status_code=status.HTTP_201_CREATED)
async def generate_operative_report_ccam(
    req: DictateReportRequest,
    db: Session = Depends(get_db)
):
    """
    EXEMPLE DE STRUCTURE DE DONNÉES.

    Construit un exemple de compte-rendu opératoire structuré (sections,
    codages CCAM/CIM-10 indicatifs, bundle FHIR ClinicalDocument) à partir de
    la transcription fournie, par simple appariement de mots-clés. Ce n'est PAS
    un assistant de dictée certifié : aucun LLM/NLP réel, aucun code CCAM
    valide pour facturation, aucune valeur médico-légale. La réponse décrit la
    forme que des données réelles auraient, rien de plus.
    """
    report_id = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc).isoformat()

    # Appariement de mots-clés (PAS un LLM, PAS de NLP réel)
    transcript_lower = req.raw_voice_transcript.lower()

    # Exemple de structure : codes CCAM indicatifs (à vérifier par le codeur)
    ccam_codes = []
    if "laryngectomie totale" in transcript_lower:
        ccam_codes.append({"code": "GALA002", "label": "Laryngectomie totale avec curage cervical", "tarif_secu_eur": 1450.00})
    elif "cordectomie" in transcript_lower:
        ccam_codes.append({"code": "GAFA004", "label": "Cordectomie transorale au laser CO2", "tarif_secu_eur": 620.00})
    elif "tympanoplastie" in transcript_lower or "myringoplastie" in transcript_lower:
        ccam_codes.append({"code": "CAJA001", "label": "Tympanoplastie / myringoplastie", "tarif_secu_eur": 540.00})
    elif "mastoïdectomie" in transcript_lower or "mastoidectomie" in transcript_lower:
        ccam_codes.append({"code": "CAFA002", "label": "Mastoïdectomie avec ossiculoplastie", "tarif_secu_eur": 890.00})
    elif "sinus" in transcript_lower or "endoscopique" in transcript_lower:
        ccam_codes.append({"code": "GAFA010", "label": "Chirurgie endoscopique des sinus (CEES)", "tarif_secu_eur": 1120.00})
    elif "septoplastie" in transcript_lower:
        ccam_codes.append({"code": "GAEA002", "label": "Septoplastie avec turbinectomie", "tarif_secu_eur": 480.00})
    elif "parotidectomie" in transcript_lower:
        ccam_codes.append({"code": "CBFA001", "label": "Parotidectomie superficielle", "tarif_secu_eur": 980.00})
    elif "curage" in transcript_lower:
        ccam_codes.append({"code": "GEFA004", "label": "Curage ganglionnaire cervical fonctionnel", "tarif_secu_eur": 860.00})
    elif "amygdalectomie" in transcript_lower:
        ccam_codes.append({"code": "GAFA020", "label": "Amygdalectomie avec adénoïdectomie", "tarif_secu_eur": 310.00})
    else:
        ccam_codes.append({"code": "GALA002", "label": "Laryngectomie totale avec curage cervical (par défaut)", "tarif_secu_eur": 1450.00})

    # Exemple de structure : codage CIM-10 / ICD-10
    icd10_code = {"code": "C32.0", "label": "Tumeur maligne du larynx (glotte)"}

    # Exemple de structure : sections fixes du compte-rendu
    structured_sections = {
        "1_indication_et_diagnostic": "Carcinome épidermoïde glottique cT3N1, corde vocale fixée, indication validée en RCP oncologique.",
        "2_installation_et_abord": "Décubitus dorsal, tête en légère extension, cervicotomie horizontale.",
        "3_exploration_peroperatoire": "Confirmation de la tumeur glottique avec fixation cordale, absence d'extension extralaryngée macroscopique.",
        "4_geste_principal": "Laryngectomie totale avec curage cervical fonctionnel bilatéral des niveaux II à IV, fermeture pharyngienne en T.",
        "5_hemostase_et_rehabilitation": "Hémostase rigoureuse. Mise en place d'une prothèse phonatoire trachéo-œsophagienne (Provox) pour réhabilitation vocale immédiate.",
        "6_drainage_et_fermeture": "Drain aspiratif cervical, trachéostome confectionné. Fermeture pariétale en deux plans, suture cutanée intradermique."
    }

    # Exemple de structure : bundle FHIR ClinicalDocument (Composition R5 / CDA)
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

    # Hash SHA-256 : intégrité technique du contenu uniquement (pas une
    # signature électronique légale au sens réglementaire).
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
        "nature": "DATA_STRUCTURE_EXAMPLE",
        "legal_status": "DRAFT_NOT_LEGALLY_VALID — exemple de structure de données, à relire et "
                        "valider intégralement par le chirurgien avant tout usage"
    }

    GENERATED_REPORTS[report_id] = report_doc

    # Trace en audit (intégrité technique, pas une preuve de conformité)
    try:
        log_id = str(uuid.uuid4())
        db.execute(text("""
            INSERT INTO audit_logs (id, action_type, target_resource, resource_id, details, cryptographic_hash)
            VALUES (:id, 'GENERATE_OPERATIVE_REPORT_CCAM_DEMO', 'surgical_plans', :res_id, :details, :hash)
        """), {
            "id": log_id,
            "res_id": req.twin_id or req.patient_id,
            "details": json.dumps({"report_id": report_id, "ccam": [c["code"] for c in ccam_codes], "surgeon": req.surgeon_username}),
            "hash": crypto_hash
        })
        db.commit()
    except Exception as e:  # noqa: BLE001
        db.rollback()
        logger.error("Erreur SQL audit_logs: %s", e)

    return {
        "status": "data_structure_example",
        "message": "Exemple de structure de données de compte-rendu généré par appariement de "
                    "mots-clés (pas de LLM/NLP réel, pas d'assistant de dictée certifié). "
                    "À relire et valider intégralement avant tout usage clinique, médico-légal "
                    "ou de facturation.",
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
    Récupère l'exemple de compte-rendu généré, en vérifiant son sceau d'intégrité SHA-256.
    """
    rep = GENERATED_REPORTS.get(report_id)
    if not rep:
        raise HTTPException(status_code=404, detail=f"Exemple de compte-rendu #{report_id} introuvable.")
    return rep
