# -*- coding: utf-8 -*-
"""
test_segments_volumetrie_interop.py — Segments, volumétrie, export FHIR/HL7, PACS
====================================================================================
Complète tests/test_auth_patients_dicom.py (auth/patients/DICOM) avec les
routes qui consomment ces mêmes patients : segments anatomiques, calcul de
volumétrie, et l'interop externe (FHIR R4, HL7 v2, capacités PACS) — aucune
de ces routes n'avait de test avant cette session.

Pas de vrai PACS DICOMweb disponible dans cet environnement : les tests PACS
se limitent donc à /pacs/capabilities (qui répond honnêtement même sans PACS
configuré, par construction — voir backend/pacs_client.py) plutôt qu'à une
recherche/import réel.
"""

import uuid

import pytest


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _register_and_login(client, *, password: str = "TestPass123") -> tuple[str, dict]:
    username = _unique("user")
    r = client.post("/auth/register", json={"username": username, "password": password, "full_name": "Test User"})
    assert r.status_code == 200, r.text
    r = client.post("/auth/token", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return username, {"Authorization": f"Bearer {r.json()['access_token']}"}


def _patient_payload(patient_id: str, specialty: str = "laryngologie") -> dict:
    return {
        "id": patient_id, "nom": "Test Patient", "age": 55, "sexe": "F",
        "poids_kg": 68.0, "taille_cm": 165.0, "diagnostic": "Test diagnostic",
        "chirurgien": "Dr. Test", "specialty": specialty, "urgence": "vert",
    }


def _create_patient(client, headers, specialty: str = "laryngologie") -> str:
    patient_id = _unique("pat")
    r = client.post("/patients", json=_patient_payload(patient_id, specialty), headers=headers)
    assert r.status_code == 201, r.text
    return patient_id


def _segment_payload(seg_id: str, seg_type: str = "organe", volume_ml: float = 1200.0) -> dict:
    return {"id": seg_id, "type": seg_type, "volume_ml": volume_ml, "label": "Larynx", "color_hex": "#ff0000"}


# ---------------------------------------------------------------------------
# Segments
# ---------------------------------------------------------------------------
def test_segment_create_list_delete(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    seg_id = _unique("seg")

    created = client.post(f"/patients/{patient_id}/segments", json=_segment_payload(seg_id), headers=headers)
    assert created.status_code == 201, created.text
    assert created.json()["patient_id"] == patient_id

    listed = client.get(f"/patients/{patient_id}/segments", headers=headers)
    assert listed.status_code == 200
    assert any(s["id"] == seg_id for s in listed.json())

    deleted = client.delete(f"/patients/{patient_id}/segments/{seg_id}", headers=headers)
    assert deleted.status_code == 200

    listed_after = client.get(f"/patients/{patient_id}/segments", headers=headers)
    assert all(s["id"] != seg_id for s in listed_after.json())


def test_segment_create_on_unknown_patient_returns_404(client):
    _, headers = _register_and_login(client)
    r = client.post(f"/patients/{_unique('ghost')}/segments", json=_segment_payload(_unique("seg")), headers=headers)
    assert r.status_code == 404


def test_segment_delete_unknown_returns_404(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    r = client.delete(f"/patients/{patient_id}/segments/{_unique('ghost-seg')}", headers=headers)
    assert r.status_code == 404


def test_segments_require_authentication(client):
    r = client.get(f"/patients/{_unique('pat')}/segments")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Volumétrie
# ---------------------------------------------------------------------------
def test_volumetrie_without_segments_uses_specialty_defaults(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers, specialty="rhinologie")

    r = client.get(f"/patients/{patient_id}/volumetrie", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["patient_id"] == patient_id
    assert data["organ_volume_ml"] == 40.0  # défaut anatomique rhinologie (DEFAULT_ORGAN_VOLUME_ML)


def test_volumetrie_reflects_real_segments_when_present(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers, specialty="laryngologie")
    client.post(f"/patients/{patient_id}/segments",
                json=_segment_payload(_unique("organe"), "organe", 1000.0), headers=headers)
    client.post(f"/patients/{patient_id}/segments",
                json=_segment_payload(_unique("lesion"), "lesion", 50.0), headers=headers)

    r = client.get(f"/patients/{patient_id}/volumetrie", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["organ_volume_ml"] == 1000.0
    assert data["lesion_volume_ml"] == 50.0


def test_volumetrie_unknown_patient_returns_404(client):
    _, headers = _register_and_login(client)
    r = client.get(f"/patients/{_unique('ghost')}/volumetrie", headers=headers)
    assert r.status_code == 404


def test_volumetrie_requires_authentication(client):
    r = client.get(f"/patients/{_unique('pat')}/volumetrie")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# PACS — capacités (honnête même sans PACS configuré)
# ---------------------------------------------------------------------------
def test_pacs_capabilities_is_honest_when_unconfigured(client):
    _, headers = _register_and_login(client)
    r = client.get("/pacs/capabilities", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "pacs_configured_server_side" in data
    assert "dicomweb_client_installed" in data
    assert "dimse_classic" in data


def test_pacs_capabilities_requires_authentication(client):
    r = client.get("/pacs/capabilities")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Export FHIR R4
# ---------------------------------------------------------------------------
def test_fhir_patient_export(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)

    r = client.get(f"/fhir/Patient/{patient_id}", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["resourceType"] == "Patient"
    assert data["id"] == patient_id
    assert data["gender"] == "female"  # sexe="F" dans _patient_payload


def test_fhir_patient_export_unknown_patient_404(client):
    _, headers = _register_and_login(client)
    r = client.get(f"/fhir/Patient/{_unique('ghost')}", headers=headers)
    assert r.status_code == 404


def test_fhir_imaging_study_export_empty_without_dicom(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    r = client.get(f"/fhir/ImagingStudy/{patient_id}", headers=headers)
    assert r.status_code == 200


def test_fhir_diagnostic_report_export(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    r = client.get(f"/fhir/DiagnosticReport/{patient_id}", headers=headers)
    assert r.status_code == 200
    data = r.json()
    # Bundle FHIR contenant un DiagnosticReport + une Observation par mesure
    # de volumétrie/segment (voir backend/interop.py:fhir_diagnostic_report).
    assert data["resourceType"] == "Bundle"
    resource_types = {entry["resource"]["resourceType"] for entry in data["entry"]}
    assert "DiagnosticReport" in resource_types


def test_fhir_endpoints_require_authentication(client):
    patient_id = _unique("pat")
    assert client.get(f"/fhir/Patient/{patient_id}").status_code == 401
    assert client.get(f"/fhir/ImagingStudy/{patient_id}").status_code == 401
    assert client.get(f"/fhir/DiagnosticReport/{patient_id}").status_code == 401


# ---------------------------------------------------------------------------
# Export HL7 v2
# ---------------------------------------------------------------------------
def test_hl7_oru_export_is_plaintext_hl7(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)

    r = client.get(f"/hl7/oru/{patient_id}", headers=headers)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/hl7-v2")
    assert r.text.startswith("MSH|")
    assert "ORU" in r.text
    assert f"PID|" in r.text


def test_hl7_adt_export_is_plaintext_hl7(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    r = client.get(f"/hl7/adt/{patient_id}", headers=headers)
    assert r.status_code == 200
    assert r.text.startswith("MSH|")
    assert "ADT" in r.text


def test_hl7_export_unknown_patient_404(client):
    _, headers = _register_and_login(client)
    r = client.get(f"/hl7/oru/{_unique('ghost')}", headers=headers)
    assert r.status_code == 404


def test_hl7_export_requires_authentication(client):
    r = client.get(f"/hl7/oru/{_unique('pat')}")
    assert r.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
