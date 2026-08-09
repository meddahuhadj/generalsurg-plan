# -*- coding: utf-8 -*-
"""
compliance_status.py — Statut réglementaire réel (prototype non certifié).
===================================================================================
⚠️ Endpoint HONNÊTE : cette plateforme n'a fait l'objet d'AUCUNE certification CE
MDR 2017/745, d'AUCUNE soumission FDA 510(k), et d'AUCUN audit HIPAA/RGPD formel.
C'est un prototype logiciel. Toute valeur affirmant le contraire
("CERTIFIED_COMPLIANT", "SUBMITTED_AND_VALIDATED", faux numéros 510(k) de
dispositifs tiers) serait fabriquée — ne jamais présenter cette sortie comme
preuve de conformité réglementaire à un tiers (auditeur, DPO, hôpital, patient).

Ce statut est exposé côté serveur pour les contrôles d'infrastructure ; côté
utilisateur, la mention "Prototype non certifié" en pied de page suffit (voir
frontend) — aucune modale de conformité n'est proposée tant que la
certification n'est pas obtenue.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from db import get_db

router = APIRouter(prefix="/api/v2/compliance", tags=["compliance-status"])


@router.get("/mdr-fda-status")
async def get_mdr_fda_compliance_dashboard(db: Session = Depends(get_db)):
    """
    Retourne l'état RÉEL de conformité réglementaire de cette plateforme.

    ⚠️ Ce logiciel n'est PAS certifié et n'est pas destiné à un usage clinique
    dans sa version actuelle. Voir le disclaimer en pied de page.
    """
    total_logs = 0
    audit_table_available = True
    try:
        res = db.execute(text("SELECT COUNT(*) FROM audit_logs")).fetchone()
        if res:
            total_logs = res[0]
    except Exception:  # noqa: BLE001
        audit_table_available = False

    return {
        "platform_name": "ORLSurgPlan3D",
        "version": "2.4.0 (prototype, non certifié)",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "disclaimer": "PROTOTYPE NON CERTIFIÉ — pas destiné à un usage clinique réel.",
        "regulatory_certifications": {
            "eu_mdr_2017_745": {
                "status": "NOT_CERTIFIED",
                "note": "Aucune évaluation de conformité MDR 2017/745 menée. Aucun organisme "
                        "notifié impliqué. Classification MDR réelle (probable Classe IIb/III "
                        "pour navigation chirurgicale) à déterminer formellement avec un "
                        "consultant en affaires réglementaires avant tout usage clinique.",
            },
            "us_fda_510k": {
                "status": "NOT_SUBMITTED",
                "note": "Aucune soumission FDA 510(k) déposée.",
            },
            "hipaa_and_gdpr_privacy": {
                "status": "NOT_AUDITED",
                "note": "Le chiffrement dépend de la configuration réelle de déploiement — "
                        "non garanti par le code applicatif lui-même. Aucun audit HIPAA/RGPD "
                        "formel réalisé.",
            },
        },
        "cryptographic_audit_trail": {
            "hashing_algorithm": "SHA-256 (intégrité technique par entrée, pas de chaînage vérifié)",
            "total_logged_events": total_logs,
            "audit_table_available": audit_table_available,
            "note": "Ce compteur reflète le contenu réel de audit_logs ; il ne constitue pas "
                    "une preuve de conformité.",
        },
    }
