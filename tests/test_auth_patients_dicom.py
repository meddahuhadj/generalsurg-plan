# -*- coding: utf-8 -*-
"""
test_auth_patients_dicom.py — Tests des chemins sensibles du backend
======================================================================
Couvre les zones à plus fort impact en cas de régression silencieuse :
authentification + 2FA (TOTP), limitation de débit sur /auth/token, journal
d'audit (écriture + RBAC admin/dpo), CRUD patients, et import DICOM.

Ces routes n'avaient auparavant aucun test (voir tests/test_compliance_fda_mdr.py,
qui ne couvre que les endpoints "NextGen" exploratoires) alors qu'elles portent
les données patients et les identifiants — ce sont celles où une régression
coûte le plus cher.

Utilise la fixture `client` (session-scoped, tests/conftest.py) : une base
SQLite temporaire dédiée, jamais backend/ophtalmosurg.db.
"""

import io
import uuid

import pyotp
import pytest


def _unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _register_and_login(client, *, password: str = "TestPass123") -> tuple[str, dict]:
    """Crée un utilisateur frais (rôle 'surgeon', sans 2FA) et renvoie
    (username, headers Authorization) pour les tests qui n'ont pas besoin
    des comptes de démo partagés dr.hadj/dr.benali."""
    username = _unique("user")
    r = client.post("/auth/register", json={"username": username, "password": password, "full_name": "Test User"})
    assert r.status_code == 200, r.text

    r = client.post("/auth/token", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return username, {"Authorization": f"Bearer {token}"}


def _demo_login(client, username: str, password: str = "changeme") -> dict:
    r = client.post("/auth/token", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---------------------------------------------------------------------------
# Auth — login, échecs, rate limiting
# ---------------------------------------------------------------------------
def test_register_then_login_returns_bearer_token(client):
    username, headers = _register_and_login(client)
    r = client.get("/patients", headers=headers)
    assert r.status_code == 200


def test_register_rejects_short_password(client):
    r = client.post("/auth/register", json={"username": _unique("short"), "password": "abc123"})
    assert r.status_code == 400


def test_register_rejects_duplicate_username(client):
    username, _ = _register_and_login(client)
    r = client.post("/auth/register", json={"username": username, "password": "AnotherPass123"})
    assert r.status_code == 400


def test_login_wrong_password_returns_401_and_is_written_to_audit(client):
    username, _ = _register_and_login(client)
    r = client.post("/auth/token", data={"username": username, "password": "not-the-right-password"})
    assert r.status_code == 401

    admin_headers = _demo_login(client, "dr.hadj")
    audit = client.get("/audit", params={"limit": 5}, headers=admin_headers)
    assert audit.status_code == 200
    actions = [entry["action"] for entry in audit.json()]
    assert "Échec de connexion" in actions


def test_login_unknown_user_returns_401_not_500(client):
    r = client.post("/auth/token", data={"username": _unique("ghost"), "password": "whatever123"})
    assert r.status_code == 401


def test_auth_rate_limiting_blocks_after_ten_attempts_per_minute(client):
    username, _ = _register_and_login(client)
    # _register_and_login a déjà consommé une tentative sur /auth/token (le
    # login réussi) : on repart d'un quota plein pour tester spécifiquement
    # le seuil des 10 tentatives/minute/IP.
    import resilience
    resilience.AUTH_RATE_LIMITER._hits.clear()
    for _ in range(10):
        r = client.post("/auth/token", data={"username": username, "password": "wrong-password"})
        assert r.status_code == 401
    r = client.post("/auth/token", data={"username": username, "password": "wrong-password"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers


# ---------------------------------------------------------------------------
# 2FA — enrôlement, login à deux temps, codes de secours, désactivation
# ---------------------------------------------------------------------------
def test_full_totp_2fa_enrollment_and_two_step_login(client):
    username, headers = _register_and_login(client, password="TotpPass123")

    setup = client.post("/auth/2fa/setup", headers=headers)
    assert setup.status_code == 200
    secret = setup.json()["secret"]

    code = pyotp.TOTP(secret).now()
    enable = client.post("/auth/2fa/enable", json={"code": code}, headers=headers)
    assert enable.status_code == 200
    recovery_codes = enable.json()["recovery_codes"]
    assert len(recovery_codes) == 8

    # Login mot de passe seul : ne doit plus renvoyer directement un token.
    step1 = client.post("/auth/token", data={"username": username, "password": "TotpPass123"})
    assert step1.status_code == 200
    body = step1.json()
    assert body["requires_2fa"] is True
    pre_auth_token = body["pre_auth_token"]

    step2 = client.post("/auth/2fa/verify", json={"pre_auth_token": pre_auth_token, "code": pyotp.TOTP(secret).now()})
    assert step2.status_code == 200
    final_token = step2.json()["access_token"]

    r = client.get("/patients", headers={"Authorization": f"Bearer {final_token}"})
    assert r.status_code == 200


def test_2fa_verify_rejects_invalid_code(client):
    username, headers = _register_and_login(client, password="TotpPass456")
    secret = client.post("/auth/2fa/setup", headers=headers).json()["secret"]
    client.post("/auth/2fa/enable", json={"code": pyotp.TOTP(secret).now()}, headers=headers)

    step1 = client.post("/auth/token", data={"username": username, "password": "TotpPass456"})
    pre_auth_token = step1.json()["pre_auth_token"]

    r = client.post("/auth/2fa/verify", json={"pre_auth_token": pre_auth_token, "code": "000000"})
    assert r.status_code == 401


def test_2fa_recovery_code_is_single_use(client):
    username, headers = _register_and_login(client, password="RecoveryPass789")
    secret = client.post("/auth/2fa/setup", headers=headers).json()["secret"]
    enable = client.post("/auth/2fa/enable", json={"code": pyotp.TOTP(secret).now()}, headers=headers)
    recovery_code = enable.json()["recovery_codes"][0]

    pre_auth_token = client.post(
        "/auth/token", data={"username": username, "password": "RecoveryPass789"}
    ).json()["pre_auth_token"]
    first_use = client.post("/auth/2fa/verify", json={"pre_auth_token": pre_auth_token, "code": recovery_code})
    assert first_use.status_code == 200

    pre_auth_token_2 = client.post(
        "/auth/token", data={"username": username, "password": "RecoveryPass789"}
    ).json()["pre_auth_token"]
    second_use = client.post("/auth/2fa/verify", json={"pre_auth_token": pre_auth_token_2, "code": recovery_code})
    assert second_use.status_code == 401


def test_2fa_disable_requires_valid_code_then_restores_single_step_login(client):
    username, headers = _register_and_login(client, password="DisablePass123")
    secret = client.post("/auth/2fa/setup", headers=headers).json()["secret"]
    client.post("/auth/2fa/enable", json={"code": pyotp.TOTP(secret).now()}, headers=headers)

    bad = client.post("/auth/2fa/disable", json={"code": "000000"}, headers=headers)
    assert bad.status_code == 400

    good = client.post("/auth/2fa/disable", json={"code": pyotp.TOTP(secret).now()}, headers=headers)
    assert good.status_code == 200
    assert good.json()["enabled"] is False

    r = client.post("/auth/token", data={"username": username, "password": "DisablePass123"})
    assert r.status_code == 200
    assert "access_token" in r.json()


# ---------------------------------------------------------------------------
# Journal d'audit — RBAC admin/dpo
# ---------------------------------------------------------------------------
def test_audit_endpoint_forbidden_for_non_admin_role(client):
    surgeon_headers = _demo_login(client, "dr.benali")
    r = client.get("/audit", headers=surgeon_headers)
    assert r.status_code == 403


def test_audit_endpoint_allowed_for_admin_role(client):
    admin_headers = _demo_login(client, "dr.hadj")
    r = client.get("/audit", params={"limit": 1}, headers=admin_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_audit_endpoint_requires_authentication(client):
    r = client.get("/audit")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Patients — CRUD, isolation, audit
# ---------------------------------------------------------------------------
def _patient_payload(patient_id: str) -> dict:
    return {
        "id": patient_id, "nom": "Test Patient", "age": 55, "sexe": "F",
        "poids_kg": 68.0, "taille_cm": 165.0, "diagnostic": "Test diagnostic",
        "chirurgien": "Dr. Test", "specialty": "cataracte", "urgence": "vert",
    }


def test_patients_endpoints_require_authentication(client):
    assert client.get("/patients").status_code == 401
    assert client.post("/patients", json=_patient_payload(_unique("pat"))).status_code == 401


def test_patient_full_crud_lifecycle(client):
    _, headers = _register_and_login(client)
    patient_id = _unique("pat")

    created = client.post("/patients", json=_patient_payload(patient_id), headers=headers)
    assert created.status_code == 201, created.text
    assert created.json()["id"] == patient_id

    fetched = client.get(f"/patients/{patient_id}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["nom"] == "Test Patient"

    updated = client.put(f"/patients/{patient_id}", json={"nom": "Nom Modifié"}, headers=headers)
    assert updated.status_code == 200
    assert updated.json()["nom"] == "Nom Modifié"

    deleted = client.delete(f"/patients/{patient_id}", headers=headers)
    assert deleted.status_code == 200

    gone = client.get(f"/patients/{patient_id}", headers=headers)
    assert gone.status_code == 404


def test_patient_duplicate_id_rejected(client):
    _, headers = _register_and_login(client)
    patient_id = _unique("pat")
    client.post("/patients", json=_patient_payload(patient_id), headers=headers)
    dup = client.post("/patients", json=_patient_payload(patient_id), headers=headers)
    assert dup.status_code == 400


def test_patient_not_found_returns_404(client):
    _, headers = _register_and_login(client)
    r = client.get(f"/patients/{_unique('missing')}", headers=headers)
    assert r.status_code == 404


def test_patient_creation_out_of_range_age_rejected_by_validation(client):
    _, headers = _register_and_login(client)
    payload = _patient_payload(_unique("pat"))
    payload["age"] = 999
    r = client.post("/patients", json=payload, headers=headers)
    assert r.status_code == 422


def test_patient_get_writes_audit_entry(client):
    _, headers = _register_and_login(client)
    patient_id = _unique("pat")
    client.post("/patients", json=_patient_payload(patient_id), headers=headers)
    client.get(f"/patients/{patient_id}", headers=headers)

    admin_headers = _demo_login(client, "dr.hadj")
    audit = client.get("/audit", params={"patient_id": patient_id}, headers=admin_headers)
    assert audit.status_code == 200
    actions = [entry["action"] for entry in audit.json()]
    assert "Création patient" in actions
    assert "Consultation dossier patient" in actions


# ---------------------------------------------------------------------------
# Import DICOM
# ---------------------------------------------------------------------------
def test_dicom_upload_then_list(client):
    _, headers = _register_and_login(client)
    patient_id = _unique("pat")
    client.post("/patients", json=_patient_payload(patient_id), headers=headers)

    fake_dicom_bytes = b"\x00" * 2048
    files = {"file": ("test.dcm", io.BytesIO(fake_dicom_bytes), "application/dicom")}
    params = {"patient_id": patient_id, "study_uid": _unique("study"), "modality": "CT"}
    uploaded = client.post("/dicom/upload", params=params, files=files, headers=headers)
    assert uploaded.status_code == 200, uploaded.text
    series_uid = uploaded.json()["series_uid"]
    assert len(uploaded.json()["sha256"]) == 16

    listed = client.get(f"/dicom/{patient_id}", headers=headers)
    assert listed.status_code == 200
    assert any(s["series_uid"] == series_uid for s in listed.json())


def test_dicom_upload_unknown_patient_returns_404(client):
    _, headers = _register_and_login(client)
    files = {"file": ("test.dcm", io.BytesIO(b"\x00" * 64), "application/dicom")}
    params = {"patient_id": _unique("ghost"), "study_uid": _unique("study")}
    r = client.post("/dicom/upload", params=params, files=files, headers=headers)
    assert r.status_code == 404


def test_dicom_upload_requires_authentication(client):
    files = {"file": ("test.dcm", io.BytesIO(b"\x00" * 64), "application/dicom")}
    params = {"patient_id": _unique("pat"), "study_uid": _unique("study")}
    r = client.post("/dicom/upload", params=params, files=files)
    assert r.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
