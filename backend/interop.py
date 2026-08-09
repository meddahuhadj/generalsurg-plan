# -*- coding: utf-8 -*-
"""
interop.py — Export HL7 FHIR R4 et HL7 v2.x pour interopérabilité DPI/RIS/HIS
================================================================================
Construit à la main (pas de dépendance à `fhir.resources`, dont les modèles
Pydantic v1/v2 changent souvent de version et cassent silencieusement) : les
dictionnaires ci-dessous respectent la structure FHIR R4 telle que publiée sur
https://hl7.org/fhir/R4/ pour les ressources Patient, ImagingStudy,
DiagnosticReport et Observation.

Portée honnête :
  - Ceci est de l'EXPORT (lecture de nos données -> FHIR/HL7), pas un serveur
    FHIR complet (pas de _search, pas de persistance FHIR, pas de validation
    contre un profil national comme les profils FHIR France/ANS).
  - HL7 v2 : un seul type de message est généré (ORU^R01, compte-rendu
    d'observation) car c'est le format le plus couramment consommé par les
    DPI/HIS français pour recevoir un résultat structuré. ADT (mouvements
    patients) et ORM (demandes d'examen) ne sont pas couverts.
  - Encodage HL7 v2 : séparateurs standards (|^~\\&), segments terminés par \\r.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# FHIR R4
# ---------------------------------------------------------------------------
def fhir_patient(p) -> Dict[str, Any]:
    """p : models.Patient"""
    return {
        "resourceType": "Patient",
        "id": p.id,
        "identifier": [{"system": "urn:orlsurgplan3d:patient-id", "value": p.id}],
        "name": [{"text": p.nom}],
        "gender": {"M": "male", "F": "female"}.get(p.sexe, "unknown"),
        "extension": [
            {"url": "urn:orlsurgplan3d:age-years", "valueInteger": p.age},
        ],
    }


def fhir_imaging_study(p, dicom_series: List) -> Dict[str, Any]:
    """dicom_series : liste de models.DicomSeries pour ce patient. Une ressource
    ImagingStudy par study_uid distinct (regroupe les séries)."""
    by_study: Dict[str, List] = {}
    for s in dicom_series:
        by_study.setdefault(s.study_uid, []).append(s)

    bundle_entries = []
    for study_uid, series_list in by_study.items():
        series_entries = []
        for i, s in enumerate(series_list, start=1):
            series_entries.append({
                "uid": s.series_uid,
                "number": i,
                "modality": {"code": s.modality, "system": "http://dicom.nema.org/resources/ontology/DCM"},
                "description": s.filename or s.modality,
                "numberOfInstances": s.num_slices or 0,
                "started": s.imported_at.isoformat() if s.imported_at else None,
            })
        bundle_entries.append({
            "resource": {
                "resourceType": "ImagingStudy",
                "id": study_uid,
                "status": "available",
                "subject": {"reference": f"Patient/{p.id}"},
                "identifier": [{"system": "urn:dicom:uid", "value": f"urn:oid:{study_uid}"}],
                "numberOfSeries": len(series_entries),
                "numberOfInstances": sum(e["numberOfInstances"] for e in series_entries),
                "series": series_entries,
            }
        })

    return {
        "resourceType": "Bundle",
        "type": "searchset",
        "total": len(bundle_entries),
        "entry": bundle_entries,
    }


def fhir_diagnostic_report(p, volumetrie: Optional[dict], segments: List) -> Dict[str, Any]:
    """Construit un DiagnosticReport (compte-rendu de planification chirurgicale)
    avec un Observation par mesure de volumétrie et par segment anatomique."""
    now = datetime.now(UTC).isoformat() + "Z"
    observations = []

    def obs(code_text: str, value: Optional[float], unit: str, obs_id: str) -> Dict[str, Any]:
        return {
            "resourceType": "Observation",
            "id": obs_id,
            "status": "final",
            "code": {"text": code_text},
            "subject": {"reference": f"Patient/{p.id}"},
            "effectiveDateTime": now,
            "valueQuantity": {"value": value, "unit": unit, "system": "http://unitsofmeasure.org", "code": unit},
        }

    if volumetrie:
        mapping = [
            ("Volume organe", "organ_volume_ml", "mL"),
            ("Volume lésion", "lesion_volume_ml", "mL"),
            ("Volume de résection prévu", "volume_resection_ml", "mL"),
            ("Pourcentage de parenchyme restant (FLR)", "remnant_pct", "%"),
        ]
        for i, (label, key, unit) in enumerate(mapping):
            if volumetrie.get(key) is not None:
                observations.append(obs(label, volumetrie[key], unit, f"vol-{i}"))

    for i, s in enumerate(segments):
        observations.append(obs(f"Segment anatomique : {s.label or s.type}", s.volume_ml, "mL", f"seg-{i}"))

    report_id = f"report-{p.id}-{int(datetime.now(UTC).timestamp())}"
    return {
        "resourceType": "Bundle",
        "type": "collection",
        "entry": [
            {"resource": {
                "resourceType": "DiagnosticReport",
                "id": report_id,
                "status": "final",
                "code": {"text": f"Rapport de planification chirurgicale — {p.specialty}"},
                "subject": {"reference": f"Patient/{p.id}"},
                "effectiveDateTime": now,
                "issued": now,
                "performer": [{"display": p.chirurgien}],
                "result": [{"reference": f"Observation/{o['id']}"} for o in observations],
            }},
            *[{"resource": o} for o in observations],
        ],
    }


# ---------------------------------------------------------------------------
# HL7 v2.x — ORU^R01 (compte-rendu d'observation structuré)
# ---------------------------------------------------------------------------
def _hl7_ts(dt: Optional[datetime] = None) -> str:
    return (dt or datetime.now(UTC)).strftime("%Y%m%d%H%M%S")


def _hl7_escape(text: str) -> str:
    return (text or "").replace("|", "\\F\\").replace("^", "\\S\\").replace("~", "\\R\\").replace("\r", " ").replace("\n", " ")


def _hl7_pid(p, sex: str) -> str:
    """Segment PID commun aux 3 types de message — centralisé pour éviter
    qu'un bug de construction (comme le caractère parasite en PID-7, trouvé
    et corrigé pendant cette session) ne doive être corrigé à 3 endroits."""
    return f"PID|1||{p.id}||{_hl7_escape(p.nom)}|||{sex}|||||||||||"


def hl7_oru_r01(p, volumetrie: Optional[dict], segments: List, sender_app: str = "ORLSurgPlan3D",
                 sender_facility: str = "ORLSurgPlan3D", message_control_id: Optional[str] = None) -> str:
    """Génère un message HL7 v2.5 ORU^R01 texte (segments MSH/PID/OBR/OBX)
    transportant les résultats de planification chirurgicale, destiné à être
    envoyé à un moteur d'interface HL7 (Mirth, Ensemble, etc.) qui l'insérera
    dans le DPI de l'établissement."""
    msg_id = message_control_id or f"GSP{int(datetime.now(UTC).timestamp())}"
    ts = _hl7_ts()
    sex = {"M": "M", "F": "F"}.get(p.sexe, "U")

    segs = [
        f"MSH|^~\\&|{sender_app}|{sender_facility}|DPI|HOPITAL|{ts}||ORU^R01|{msg_id}|P|2.5",
        _hl7_pid(p, sex),
        f"OBR|1|{msg_id}||PLAN-CHIR^Planification chirurgicale^L|||{ts}||||||||||{_hl7_escape(p.chirurgien)}||||||{ts}|||F",
    ]

    obx_i = 1
    if volumetrie:
        mapping = [
            ("Volume organe (mL)", "organ_volume_ml"),
            ("Volume lésion (mL)", "lesion_volume_ml"),
            ("Volume de résection prévu (mL)", "volume_resection_ml"),
            ("Parenchyme restant (%)", "remnant_pct"),
        ]
        for label, key in mapping:
            if volumetrie.get(key) is not None:
                segs.append(f"OBX|{obx_i}|NM|{label}||{volumetrie[key]}||||||F")
                obx_i += 1

    for s in segments:
        segs.append(f"OBX|{obx_i}|NM|{_hl7_escape(s.label or s.type)} (mL)||{s.volume_ml}||||||F")
        obx_i += 1

    return "\r".join(segs) + "\r"


def hl7_adt_a08(p, sender_app: str = "ORLSurgPlan3D", sender_facility: str = "ORLSurgPlan3D",
                 message_control_id: Optional[str] = None) -> str:
    """Génère un message HL7 v2.5 ADT^A08 (« Update Patient Information »),
    envoyé quand une fiche patient est créée ou modifiée dans l'application,
    pour synchroniser les données démographiques vers le DPI/HIS. Choix de
    A08 plutôt que A01 (admission) : cette application planifie l'acte, elle
    ne gère pas les mouvements d'hospitalisation (l'ADT d'admission réelle
    reste piloté par le HIS de l'établissement)."""
    msg_id = message_control_id or f"GSP{int(datetime.now(UTC).timestamp())}"
    ts = _hl7_ts()
    sex = {"M": "M", "F": "F"}.get(p.sexe, "U")
    segs = [
        f"MSH|^~\\&|{sender_app}|{sender_facility}|DPI|HOPITAL|{ts}||ADT^A08|{msg_id}|P|2.5",
        f"EVN|A08|{ts}",
        _hl7_pid(p, sex),
        # PV1-2 "O" = patient ambulatoire/externe (planification, pas une
        # hospitalisation en cours) ; PV1-7 = médecin traitant/référent.
        f"PV1|1|O|||||{_hl7_escape(p.chirurgien)}",
    ]
    return "\r".join(segs) + "\r"


def hl7_orm_o01(p, procedure_label: str, sender_app: str = "ORLSurgPlan3D",
                 sender_facility: str = "ORLSurgPlan3D", message_control_id: Optional[str] = None,
                 order_control_id: Optional[str] = None) -> str:
    """Génère un message HL7 v2.5 ORM^O01 (demande d'examen/intervention),
    typiquement pour transmettre une demande d'intervention chirurgicale
    planifiée vers le système de programmation opératoire (RIS/HIS)."""
    msg_id = message_control_id or f"GSP{int(datetime.now(UTC).timestamp())}"
    ts = _hl7_ts()
    sex = {"M": "M", "F": "F"}.get(p.sexe, "U")
    order_id = order_control_id or msg_id
    segs = [
        f"MSH|^~\\&|{sender_app}|{sender_facility}|RIS|HOPITAL|{ts}||ORM^O01|{msg_id}|P|2.5",
        _hl7_pid(p, sex),
        # ORC-1 "NW" = nouvelle demande (New order).
        f"ORC|NW|{order_id}||||||{ts}|||{_hl7_escape(p.chirurgien)}",
        f"OBR|1|{order_id}||CHIR^{_hl7_escape(procedure_label)}^L|||{ts}||||||||||{_hl7_escape(p.chirurgien)}",
    ]
    return "\r".join(segs) + "\r"
