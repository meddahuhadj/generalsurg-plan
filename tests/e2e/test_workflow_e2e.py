# -*- coding: utf-8 -*-
"""Tests E2E Playwright du workflow « 3 clics » contre un backend FastAPI RÉEL.

Contrairement à test_app_e2e.py (mode démo, aucun backend), ce fichier prouve le
parcours de planification réelle de bout en bout, navigateur + backend réel
(fixture ``backend_url`` dans conftest.py) :

  1. Zero-touch (J-1) : un DICOM synthétique est uploadé via l'API réelle
     (POST /dicom/upload). Le serveur lit les voxels, extrait les structures
     (heuristique HU), simule la marge par défaut 10 mm et passe le run en
     ``ready_for_review`` — sans aucune action du chirurgien.
  2. Aperçu (clic 1) : le chirurgien se connecte via le portail d'auth réel puis
     ouvre le module Workflow 3-Clics : structures réelles (badge « Voxels DICOM
     réels »), volume réséqué simulé, garde-fou conforme.
  3. Ajustement (clic 2) : la marge est glissée à 20 mm — recalcul instantané
     (dilation euclidienne réelle), le volume réséqué augmente et le garde-fou
     passe en WARN (chevauchement risque > 30 %).
  4. Validation (clic 3) + exports : plan validé (bandeau « Validé par dr.hadj »),
     DICOM SR exporté, PDF téléchargé (en-tête %PDF vérifié).

Le DICOM synthétique (coupe 96×96, espacement 1 mm) encode deux structures
distantes de 30 mm : la cible (HU 600) et un risque (HU 120) — assez proche pour
être capturé par une marge de 20 mm (chevauchement ~47 % → WARN) mais pas par la
marge de 10 mm (chevauchement 0 % → OK). Les seuils sont donc reproductibles.

Lancement :
    .venv\\Scripts\\python.exe -m pytest tests/e2e/test_workflow_e2e.py -q
"""

import json
import re
import time
import urllib.request
import uuid

import numpy as np
import pytest

from conftest import assert_clean_console, select_module

pytest.importorskip("pydicom")

PATIENT_ID = "40521-CAT"
USERNAME, PASSWORD = "dr.hadj", "changeme"


# ---------------------------------------------------------------------------
# DICOM synthétique : cible + risque séparés de 30 mm (déterminisme des seuils)
# ---------------------------------------------------------------------------
def _synthetic_slice():
    """Coupe 96×96 : cible (30,48, r=10, HU 600) + risque (60,48, r=8, HU 120), HU -1000 ailleurs."""
    y, x = np.mgrid[:96, :96]
    vol = np.full((96, 96), -1000, dtype=np.int16)
    vol[(x - 30) ** 2 + (y - 48) ** 2 <= 10 ** 2] = 600
    vol[(x - 60) ** 2 + (y - 48) ** 2 <= 8 ** 2] = 120
    return vol


def _write_dicom(path):
    import pydicom
    from pydicom.dataset import Dataset, FileMetaDataset
    from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian

    vol = _synthetic_slice()
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = CTImageStorage
    meta.MediaStorageSOPInstanceUID = pydicom.uid.generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = Dataset()
    ds.file_meta = meta
    ds.SOPClassUID = CTImageStorage
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.StudyInstanceUID = pydicom.uid.generate_uid()
    ds.SeriesInstanceUID = pydicom.uid.generate_uid()
    ds.PatientID = PATIENT_ID
    ds.Modality = "CT"
    ds.Rows, ds.Columns = 96, 96
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.PixelRepresentation = 1
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelSpacing = ["1.0", "1.0"]
    ds.SliceThickness = "1.0"
    ds.ImagePositionPatient = ["0.0", "0.0", "0.0"]
    ds.RescaleIntercept = "0"
    ds.RescaleSlope = "1"
    ds.PixelData = vol.tobytes()
    pydicom.dcmwrite(path, ds, enforce_file_format=True)


# ---------------------------------------------------------------------------
# Appels API directs (préparation en tâche de fond côté serveur)
# ---------------------------------------------------------------------------
def _api(backend_url, token, method, path, body=None):
    req = urllib.request.Request(backend_url + path, method=method)
    req.add_header("Authorization", "Bearer " + token)
    if body is not None:
        data = json.dumps(body).encode()
        req.data = data
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode()
    return json.loads(raw) if raw else None


def _upload_dicom(backend_url, token, dcm_path):
    boundary = "----pytest%s" % uuid.uuid4().hex
    with open(dcm_path, "rb") as f:
        content = f.read()
    prefix = (
        "--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"synthetic.dcm\"\r\n"
        "Content-Type: application/dicom\r\n\r\n" % boundary
    ).encode()
    suffix = ("\r\n--%s--\r\n" % boundary).encode()
    url = backend_url + "/dicom/upload?patient_id=%s&study_uid=%s&modality=CT" % (PATIENT_ID, uuid.uuid4())
    req = urllib.request.Request(url, data=prefix + content + suffix, method="POST")
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "multipart/form-data; boundary=" + boundary)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def _wait_for_ready_run(backend_url, token, patient_id=PATIENT_ID, timeout=90):
    deadline = time.time() + timeout
    while time.time() < deadline:
        data = _api(backend_url, token, "GET", "/workflow/runs?patient_id=" + patient_id)
        for run in data.get("runs", []):
            if run["prep_status"] == "done":
                return run
            if run["prep_status"] == "error":
                pytest.fail("Préparation du run en erreur : %s" % run.get("prep_error"))
        time.sleep(1)
    pytest.fail("Aucun run prêt après %ds." % timeout)


def _volume_ml(app, selector):
    text = app.locator(selector).inner_text()
    m = re.search(r"([\d.]+)\s*mL", text)
    assert m, "Volume réséqué non trouvé dans : %r" % text
    return float(m.group(1))


def _login_via_gate(app, backend_url):
    """Branche la SPA sur le backend et se connecte via le portail d'auth réel."""
    app.evaluate("(u) => { state.settings.apiBase = u; showLoginGateIfNeeded(); }", backend_url)
    app.wait_for_selector("#login-gate", state="visible", timeout=5000)
    assert backend_url in app.locator("#login-gate-backend-url").inner_text()

    app.fill("#login-username", USERNAME)
    app.fill("#login-password", PASSWORD)
    app.click("#login-submit-btn")
    app.wait_for_function("() => isAuthenticated()", timeout=20000)
    token = app.evaluate("() => state.auth.token")
    assert token, "Le portail d'authentification doit fournir un jeton"
    return token


def _open_workflow_modal(app):
    app.locator('.top-nav button[data-view="workflow"]').click()
    app.wait_for_selector("#modal-workflow.open", timeout=5000)


# ---------------------------------------------------------------------------
# Scénario 1 — parcours réel complet (upload DICOM zero-touch -> 3 clics -> exports)
# ---------------------------------------------------------------------------
def test_three_click_workflow_end_to_end(app, tmp_path, backend_url):
    select_module(app, "Chirurgie de la Cataracte", "cataracte")
    token = _login_via_gate(app, backend_url)

    # Zero-touch : l'upload DICOM réel déclenche la préparation en tâche de fond.
    dcm_path = tmp_path / "synthetic.dcm"
    _write_dicom(str(dcm_path))
    _upload_dicom(backend_url, token, dcm_path)
    run = _wait_for_ready_run(backend_url, token)
    assert run["source"] == "dicom_voxels", "Les pixels réels doivent être lus"
    assert run["stage"] == "ready_for_review"
    assert run["safety_margin_mm"] == 10.0
    assert run["margin_simulation"]["guardrail"]["level"] == "ok", run["margin_simulation"]
    assert any(s["is_target"] for s in run["structures"])
    assert any(s["is_risk"] for s in run["structures"])

    # Aperçu (clic 1) : ouvrir le module, le run prêt est affiché.
    _open_workflow_modal(app)
    app.wait_for_function(
        "() => { const el = document.getElementById('wf3-preview'); "
        "return el && el.innerText.indexOf('Structures détectées') !== -1; }",
        timeout=20000,
    )
    preview = app.locator("#wf3-preview").inner_text()
    assert "Voxels DICOM réels" in preview, "Le badge source doit attester de la lecture des voxels"
    assert "Marge de sécurité : 10 mm" in preview
    assert "Conforme aux seuils" in preview, "Garde-fou OK attendu à 10 mm"
    assert "Chevauchement risque max 0.0%" in preview, preview
    vol10 = _volume_ml(app, "#wf3-resection")

    # 4. Ajustement (clic 2) : marge glissée à 20 mm -> recalcul instantané + garde-fou WARN.
    app.locator("#wf3-margin").evaluate(
        "el => { el.value = '20'; el.dispatchEvent(new Event('input')); }"
    )
    app.wait_for_function(
        "() => { const n = document.getElementById('notif'); "
        "return n && n.textContent.indexOf('Marge mise à jour') !== -1; }",
        timeout=15000,
    )
    app.wait_for_function(
        "() => { const el = document.getElementById('wf3-preview'); "
        "return el && el.innerText.indexOf('Seuil(s) dépassé(s)') !== -1; }",
        timeout=15000,
    )
    preview = app.locator("#wf3-preview").inner_text()
    assert "Marge de sécurité : 20 mm" in preview
    assert "Chevauchement risque max" in preview and "%" in preview
    vol20 = _volume_ml(app, "#wf3-resection")
    assert vol20 > vol10, "Une marge plus large doit augmenter le volume réséqué simulé"

    # 5. Validation (clic 3) : confirmation puis bandeau de validation signé.
    # (Playwright 1.62 n'expose plus l'API dialog : on neutralise window.confirm,
    # sinon le confirm() natif bloque l'action et le clic expire.)
    app.evaluate("() => { window.confirm = () => true; }")
    app.locator("#wf3-preview").get_by_text("Valider le plan", exact=True).click()
    app.wait_for_function(
        "() => { const el = document.getElementById('wf3-validated'); "
        "return el && el.textContent.indexOf('dr.hadj') !== -1; }",
        timeout=15000,
    )
    assert "Validé par" in app.locator("#wf3-validated").inner_text()

    # 6. Export DICOM SR -> notification d'export.
    app.get_by_text("Exporter DICOM SR", exact=True).click()
    app.wait_for_function(
        "() => { const n = document.getElementById('notif'); "
        "return n && n.textContent.indexOf('DICOM SR exporté') !== -1; }",
        timeout=15000,
    )

    # 7. Export PDF -> téléchargement réel dont l'en-tête confirme le format.
    with app.expect_download() as dl:
        app.get_by_text("Télécharger le PDF", exact=True).click()
    pdf = dl.value
    assert pdf.suggested_filename.startswith("plan_validation_"), pdf.suggested_filename
    assert pdf.suggested_filename.endswith(".pdf"), pdf.suggested_filename
    with open(pdf.path(), "rb") as f:
        assert f.read(5) == b"%PDF-", "Le fichier téléchargé doit être un PDF valide"

    assert_clean_console(app)


# ---------------------------------------------------------------------------
# Scénario 2 — fallback zéro-touch : déclenchement manuel depuis l'état vide de l'UI
# (aucune série importée pour un patient : le chirurgien clique « Déclencher la
# préparation » ; le run est créé en trigger=manuel et préparé par estimation des
# métadonnées — honnêtement étiquetée « Estimation métadonnées » — puis reste
# ajustable et validable.)
# ---------------------------------------------------------------------------
def test_workflow_manual_trigger_fallback(app, backend_url):
    # Patient Glaucome (52918-GLA) : seedé côté backend, sans aucun run ni série.
    select_module(app, "Chirurgie du Glaucome", "glaucome")
    token = _login_via_gate(app, backend_url)
    assert not _api(backend_url, token, "GET", "/workflow/runs?patient_id=52918-GLA")["runs"], (
        "Précondition : aucun run préexistant pour 52918-GLA"
    )

    # État vide dans l'UI : bouton de déclenchement manuel.
    _open_workflow_modal(app)
    app.wait_for_function(
        "() => { const el = document.getElementById('wf3-body'); "
        "return el && el.innerText.indexOf('Aucun run préparé') !== -1; }",
        timeout=15000,
    )
    assert "Déclencher la préparation" in app.locator("#wf3-body").inner_text()

    # Clic sur le bouton -> POST /workflow/auto-import -> run créé et préparé.
    app.get_by_text("Déclencher la préparation", exact=True).click()
    app.wait_for_function(
        "() => { const el = document.getElementById('wf3-preview'); "
        "return el && el.innerText.indexOf('Structures détectées') !== -1; }",
        timeout=30000,
    )

    body = app.locator("#modal-workflow").inner_text()
    assert "Run manuel" in body, "Le run doit être étiqueté trigger=manuel"
    preview = app.locator("#wf3-preview").inner_text()
    assert "Estimation métadonnées" in preview, (
        "Sans série lue, la source doit être honnêtement étiquetée « Estimation métadonnées »"
    )
    assert "Marge de sécurité : 10 mm" in preview

    # Le run reste ajustable et validable.
    app.locator("#wf3-margin").evaluate(
        "el => { el.value = '15'; el.dispatchEvent(new Event('input')); }"
    )
    app.wait_for_function(
        "() => { const n = document.getElementById('notif'); "
        "return n && n.textContent.indexOf('Marge mise à jour') !== -1; }",
        timeout=15000,
    )
    assert "Marge de sécurité : 15 mm" in app.locator("#wf3-preview").inner_text()

    app.evaluate("() => { window.confirm = () => true; }")
    app.locator("#wf3-preview").get_by_text("Valider le plan", exact=True).click()
    app.wait_for_function(
        "() => { const el = document.getElementById('wf3-validated'); "
        "return el && el.textContent.indexOf('dr.hadj') !== -1; }",
        timeout=15000,
    )

    run = _api(backend_url, token, "GET", "/workflow/runs?patient_id=52918-GLA")["runs"][0]
    assert run["trigger"] == "manual", run
    assert run["stage"] == "validated", run

    assert_clean_console(app)
