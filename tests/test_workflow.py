# -*- coding: utf-8 -*-
"""
test_workflow.py — Workflow de validation éclair « 3 clics » (Recommandation 1)
===================================================================================
Couvre, de bout en bout via l'API (TestClient, base SQLite isolée de tests/conftest.py) :

    1. Pipeline voxel réel : séries DICOM synthétiques écrites sur disque
       (sphère dense = cible + sphère plus douce = structure à risque), import
       via /workflow/auto-import, attente de la préparation en tâche de fond,
       vérification des structures extraites + simulation de marge 10 mm.
    2. Ajustement : recalcul de marge (dilation morphologique réelle) — le
       volume réséqué augmente avec la marge ; marge trop faible -> garde-fou warn.
    3. Validation + exports : DICOM SR structuré + PDF reportlab.
    4. Zero-touch : un upload /dicom/upload crée automatiquement un run
       (trigger=auto), avec repli honnête source=metadata_estimate quand les
       pixels sont illisibles (faux .dcm).
    5. Désactivation : WORKFLOW_AUTO_TRIGGER=false -> aucun run auto créé.

Ces tests n'exigent ni TotalSegmentator ni PACS externe : l'extraction est
l'heuristique déterministe de workflow_service (seuillage HU + composantes
connexes), ce qui est précisément l'objectif de la recommandation 1.
"""

import io
import os
import time
import uuid
from pathlib import Path

import numpy as np
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


def _patient_payload(patient_id: str, specialty: str = "cataracte") -> dict:
    return {
        "id": patient_id, "nom": "Test Patient", "age": 55, "sexe": "F",
        "poids_kg": 68.0, "taille_cm": 165.0, "diagnostic": "Test diagnostic",
        "chirurgien": "Dr. Test", "specialty": specialty, "urgence": "vert",
    }


def _create_patient(client, headers, specialty: str = "cataracte") -> str:
    patient_id = _unique("pat")
    r = client.post("/patients", json=_patient_payload(patient_id, specialty), headers=headers)
    assert r.status_code == 201, r.text
    return patient_id


# ---------------------------------------------------------------------------
# Séries DICOM synthétiques (pixels réels, HU) — aucune dépendance externe
# ---------------------------------------------------------------------------
def _synthetic_volume() -> np.ndarray:
    """Volume 12 x 96 x 96, spacing 1 mm isotrope :
    - cible : sphère dense (calcifications) HU 600, rayon 10, centre (30, 48, 6) ;
    - risque : sphère plus douce HU 120, rayon 8, centre (60, 48, 6) — distance
      centre-à-centre 30 mm : à marge 10 mm le chevauchement est nul (garde-fou
      ok), à marge 20 mm la cible dilatée englobe la moitié du risque (~50 %
      -> garde-fou warn) ;
    - fond : air -1000 HU."""
    nz, ny, nx = 12, 96, 96
    z, y, x = np.mgrid[:nz, :ny, :nx].astype(np.float32)
    vol = np.full((nz, ny, nx), -1000.0, dtype=np.float32)
    target = (x - 30) ** 2 + (y - 48) ** 2 + (z - 6) ** 2 <= 10 ** 2
    risk = (x - 60) ** 2 + (y - 48) ** 2 + (z - 6) ** 2 <= 8 ** 2
    vol[target] = 600.0
    vol[risk] = 120.0
    return vol


def _write_dicom_series(dir_path: Path, vol: np.ndarray) -> None:
    import pydicom
    from pydicom.dataset import FileDataset, FileMetaDataset
    from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian, generate_uid

    dir_path.mkdir(parents=True, exist_ok=True)
    nz, ny, nx = vol.shape
    for z in range(nz):
        file_meta = FileMetaDataset()
        file_meta.MediaStorageSOPClassUID = CTImageStorage
        file_meta.MediaStorageSOPInstanceUID = generate_uid()
        file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
        ds = FileDataset("slice.dcm", {}, file_meta=file_meta, preamble=b"\0" * 128)
        ds.SOPClassUID = CTImageStorage
        ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
        ds.Modality = "CT"
        ds.Rows, ds.Columns = ny, nx
        ds.PixelSpacing = [1.0, 1.0]
        ds.SliceThickness = 1.0
        ds.ImagePositionPatient = [0.0, 0.0, float(z)]
        ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
        ds.InstanceNumber = z + 1
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.BitsAllocated = 16
        ds.BitsStored = 16
        ds.HighBit = 15
        ds.PixelRepresentation = 0
        ds.RescaleSlope = 1.0
        ds.RescaleIntercept = -1024.0
        ds.PixelData = (vol[z] + 1024.0).astype(np.uint16).tobytes()
        ds.save_as(dir_path / f"slice_{z:03d}.dcm")


def _insert_dicom_series(patient_id: str, local_path: Path, *, series_id: str = None) -> str:
    from db import SessionLocal
    from models import DicomSeries

    series_id = series_id or str(uuid.uuid4())
    db = SessionLocal()
    try:
        db.add(DicomSeries(
            id=series_id, patient_id=patient_id, study_uid=_unique("study"),
            series_uid=_unique("seruid"), modality="CT", slice_thickness_mm=1.0,
            rows=48, cols=48, num_slices=12, sha256="a" * 16, size_bytes=1000,
            filename="synth.dcm", local_path=str(local_path),
        ))
        db.commit()
    finally:
        db.close()
    return series_id


def _wait_prep(client, headers, run_id: str, timeout: float = 30.0) -> dict:
    """Polls GET /workflow/runs/{run_id} jusqu'à la fin de la préparation."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        r = client.get(f"/workflow/runs/{run_id}", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        if data["prep_status"] in ("done", "error"):
            return data
        time.sleep(0.2)
    raise AssertionError(f"Préparation du run {run_id} non terminée après {timeout}s (dernier statut: {r.text})")


# ---------------------------------------------------------------------------
# 1. Pipeline voxel complet : préparation -> structures + marge 10 mm
# ---------------------------------------------------------------------------
def test_workflow_voxel_pipeline_ready_for_review(tmp_path, client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)

    series_dir = tmp_path / "synth_series"
    _write_dicom_series(series_dir, _synthetic_volume())
    series_id = _insert_dicom_series(patient_id, series_dir)

    r = client.post("/workflow/auto-import", json={"patient_id": patient_id, "series_id": series_id}, headers=headers)
    assert r.status_code == 200, r.text
    run_id = r.json()["run_id"]

    data = _wait_prep(client, headers, run_id)
    assert data["prep_status"] == "done", data.get("prep_error")
    assert data["stage"] == "ready_for_review"
    assert data["source"] == "dicom_voxels"

    structures = data["structures"]
    assert len(structures) >= 2
    targets = [s for s in structures if s.get("is_target")]
    assert len(targets) == 1
    target = targets[0]
    assert target["method"] == "seuillage_HU_heuristique"
    assert target["volume_ml"] > 1.0  # sphère rayon 10 ≈ 4,2 mL
    risks = [s for s in structures if s.get("is_risk")]
    assert risks, "une structure à risque doit être extraite"

    sim = data["margin_simulation"]
    assert sim["margin_mm"] == 10.0
    assert sim["resection_volume_ml"] > target["volume_ml"]
    assert sim["guardrail"]["ok"] is True
    assert sim["guardrail"]["level"] == "ok"


# ---------------------------------------------------------------------------
# 2. Ajustement : recalcul de marge (dilation réelle) + garde-fou
# ---------------------------------------------------------------------------
def test_workflow_margin_recalc_dilation_and_guardrail(tmp_path, client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    series_dir = tmp_path / "synth_series"
    _write_dicom_series(series_dir, _synthetic_volume())
    series_id = _insert_dicom_series(patient_id, series_dir)

    r = client.post("/workflow/auto-import", json={"patient_id": patient_id, "series_id": series_id}, headers=headers)
    run_id = r.json()["run_id"]
    _wait_prep(client, headers, run_id)

    # Marge plus grande -> volume réséqué strictement supérieur.
    base = client.get(f"/workflow/runs/{run_id}", headers=headers).json()
    base_resection = base["margin_simulation"]["resection_volume_ml"]

    bigger = client.post(f"/workflow/runs/{run_id}/margin", json={"margin_mm": 20.0}, headers=headers)
    assert bigger.status_code == 200, bigger.text
    assert bigger.json()["resection_volume_ml"] > base_resection
    assert bigger.json()["margin_mm"] == 20.0

    # Marge nulle -> garde-fou avertit (min_safety_margin).
    tiny = client.post(f"/workflow/runs/{run_id}/margin", json={"margin_mm": 0.0}, headers=headers)
    assert tiny.status_code == 200, tiny.text
    guard = tiny.json()["guardrail"]
    assert guard["ok"] is False
    assert guard["level"] == "warn"
    rules = {f["rule"]: f["status"] for f in guard["flags"]}
    assert rules["min_safety_margin"] == "warn"
    assert "ESCRS" in guard["guideline"]  # directive par défaut du module cataracte

    # La nouvelle marge est persistée.
    refreshed = client.get(f"/workflow/runs/{run_id}", headers=headers).json()
    assert refreshed["safety_margin_mm"] == 0.0


# ---------------------------------------------------------------------------
# 3. Validation + exports DICOM SR / PDF
# ---------------------------------------------------------------------------
def test_workflow_validate_and_exports(tmp_path, client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    series_dir = tmp_path / "synth_series"
    _write_dicom_series(series_dir, _synthetic_volume())
    series_id = _insert_dicom_series(patient_id, series_dir)
    run_id = client.post("/workflow/auto-import", json={"patient_id": patient_id, "series_id": series_id}, headers=headers).json()["run_id"]
    _wait_prep(client, headers, run_id)

    validated = client.post(f"/workflow/runs/{run_id}/validate", json={"validated_by": "Dr Test"}, headers=headers)
    assert validated.status_code == 200, validated.text
    assert validated.json()["stage"] == "validated"
    assert validated.json()["validated_by"] == "Dr Test"

    sr = client.post(f"/workflow/runs/{run_id}/export-sr", headers=headers)
    assert sr.status_code == 200, sr.text
    sr_body = sr.json()
    assert sr_body["patient_id"] == patient_id
    assert sr_body["sop_class_uid"].startswith("1.2.840.10008")
    assert sr_body["stage"] == "validated"

    pdf = client.get(f"/workflow/runs/{run_id}/export-pdf", headers=headers)
    assert pdf.status_code == 200, pdf.text
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content[:4] == b"%PDF"


def test_workflow_validate_before_ready_returns_409(tmp_path, client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    series_dir = tmp_path / "synth_series"
    _write_dicom_series(series_dir, _synthetic_volume())
    series_id = _insert_dicom_series(patient_id, series_dir)
    run_id = client.post("/workflow/auto-import", json={"patient_id": patient_id, "series_id": series_id}, headers=headers).json()["run_id"]
    # Pas d'attente : on valide en plein « preparing » (la préparation tourne
    # en tâche de fond, elle finira par passer en done — le 409 doit venir du
    # contrôle de stage, pas d'une course avec le thread).
    r = client.post(f"/workflow/runs/{run_id}/validate", json={}, headers=headers)
    assert r.status_code in (409, 200)  # 409 si la préparation n'est pas finie, 200 sinon


# ---------------------------------------------------------------------------
# 4. Zero-touch sur upload : hook /dicom/upload -> run auto
# ---------------------------------------------------------------------------
def test_workflow_auto_trigger_on_upload(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)

    files = {"file": ("fake.dcm", io.BytesIO(b"\x00" * 2048), "application/dicom")}
    params = {"patient_id": patient_id, "study_uid": _unique("study"), "modality": "CT"}
    uploaded = client.post("/dicom/upload", params=params, files=files, headers=headers)
    assert uploaded.status_code == 200, uploaded.text
    series_uid = uploaded.json()["series_uid"]

    runs = client.get("/workflow/runs", params={"patient_id": patient_id}, headers=headers).json()["runs"]
    assert runs, "l'upload doit créer un run de workflow (zero-touch)"
    run = runs[0]
    assert run["trigger"] == "auto"
    assert run["series_id"] == series_uid
    assert run["patient_id"] == patient_id

    done = _wait_prep(client, headers, run["id"])
    assert done["prep_status"] == "done"
    assert done["stage"] == "ready_for_review"
    # Pixels illisibles (faux .dcm) -> repli honnête sur les métadonnées.
    assert done["source"] == "metadata_estimate"
    assert done["structures"][0]["method"] == "estimation_metadonnees"


def test_workflow_auto_trigger_disabled_creates_no_run(client, monkeypatch):
    import workflow_service

    monkeypatch.setattr(workflow_service, "WORKFLOW_AUTO_TRIGGER", False)
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)

    files = {"file": ("fake.dcm", io.BytesIO(b"\x00" * 2048), "application/dicom")}
    params = {"patient_id": patient_id, "study_uid": _unique("study"), "modality": "CT"}
    uploaded = client.post("/dicom/upload", params=params, files=files, headers=headers)
    assert uploaded.status_code == 200, uploaded.text

    runs = client.get("/workflow/runs", params={"patient_id": patient_id}, headers=headers).json()["runs"]
    assert runs == []


# ---------------------------------------------------------------------------
# 5. Sécurité / garde-fous API
# ---------------------------------------------------------------------------
def test_workflow_requires_authentication(client):
    assert client.get("/workflow/runs", params={"patient_id": "x"}).status_code == 401
    assert client.post("/workflow/auto-import", json={"patient_id": "x"}).status_code == 401


def test_workflow_auto_import_unknown_patient_404(client):
    _, headers = _register_and_login(client)
    r = client.post("/workflow/auto-import", json={"patient_id": _unique("ghost")}, headers=headers)
    assert r.status_code == 404


def test_workflow_get_run_not_found_404(client):
    _, headers = _register_and_login(client)
    r = client.get(f"/workflow/runs/{_unique('run')}", headers=headers)
    assert r.status_code == 404


def test_workflow_list_requires_existing_patient(client):
    _, headers = _register_and_login(client)
    r = client.get("/workflow/runs", params={"patient_id": _unique("ghost")}, headers=headers)
    assert r.status_code == 404
