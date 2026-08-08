# -*- coding: utf-8 -*-
"""
test_surgical_planning.py — Planification chirurgicale (FLR + marge + FEM + CRUD + export)
============================================================================================
Teste la boucle Planification → FLR → Plan chirurgical rendue possible par le solveur
hyperélastique réel (`backend/biomech_solver.py`) et son router
(`backend/routers/surgical_planning.py`) :

    simulate (FLR + marge, sans persistance) → création de plan → sélection du plan
    chirurgical retenu → export PDF / DICOM SR.

Anatomie synthétique générée dans le test (icosphères trimesh écrites dans le
MESH_STORAGE isolé par tests/conftest.py) : ce ne sont PAS des données patient.
"""

import uuid

import pytest

import trimesh
import numpy as np


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


def _create_patient(client, headers) -> str:
    patient_id = _unique("pat")
    r = client.post("/patients", json=_patient_payload(patient_id), headers=headers)
    assert r.status_code == 201, r.text
    return patient_id


def _make_synthetic_anatomy(patient_id: str) -> dict:
    """Écrit un organe (icosphère r=50) + une lésion (sphère r=8 en z=+30) dans
    le MESH_STORAGE isolé et enregistre les segments. Le plan z=0 doit donner un
    FLR ≈ 50 % et une marge tumeur≈22 mm. Retourne {organ_url, lesion_url}."""
    from mesh_export import export_mesh_glb
    from segmentation_service import MESH_STORAGE

    out_dir = MESH_STORAGE / "test" / patient_id
    out_dir.mkdir(parents=True, exist_ok=True)

    organ = trimesh.creation.icosphere(subdivisions=2, radius=50.0)
    organ_path = export_mesh_glb(organ, out_dir / "organ_test.glb", color_rgba=(79, 195, 247, 200))

    tumor = trimesh.creation.icosphere(subdivisions=2, radius=8.0)
    tumor.apply_translation([0.0, 0.0, 30.0])
    tumor_path = export_mesh_glb(tumor, out_dir / "tumor_test.glb", color_rgba=(239, 68, 68, 220))

    return {
        "organ_url": f"/meshes/test/{patient_id}/organ_test.glb",
        "lesion_url": f"/meshes/test/{patient_id}/tumor_test.glb",
    }


def _attach_segments(client, headers, patient_id, urls: dict) -> None:
    def seg(seg_id: str, seg_type: str, volume_ml: float, url: str):
        r = client.post(f"/patients/{patient_id}/segments", headers=headers, json={
            "id": seg_id, "type": seg_type, "volume_ml": volume_ml,
            "label": seg_type, "color_hex": "#ff0000", "mesh_ref": url,
        })
        assert r.status_code == 201, r.text

    seg(_unique("organe"), "organe", 500.0, urls["organ_url"])
    seg(_unique("lesion"), "lesion", 2.0, urls["lesion_url"])


def _attach_critical_structure(client, headers, patient_id, *, seg_type: str, mesh_url: str,
                               label: str = "Structure critique test") -> str:
    """Attache directement un segment nerf/vaisseau (mesh déjà écrit sur disque) —
    contourne l'endpoint d'upload multipart pour les tests qui ne testent pas
    l'import lui-même (voir test_import_critical_structure_* pour ceux qui le testent)."""
    seg_id = _unique(seg_type)
    r = client.post(f"/patients/{patient_id}/segments", headers=headers, json={
        "id": seg_id, "type": seg_type, "volume_ml": 0.5,
        "label": label, "color_hex": "#ffd700", "mesh_ref": mesh_url,
    })
    assert r.status_code == 201, r.text
    return seg_id


# ---------------------------------------------------------------------------
# Simulation (FLR + marge) sans persistance
# ---------------------------------------------------------------------------

def test_simulate_requires_authentication(client):
    r = client.post(f"/api/v2/surgical-planning/patients/{_unique('pat')}/resection/simulate",
                    json={"plane_point": [0, 0, 0], "plane_normal": [0, 0, 1]})
    assert r.status_code == 401


def test_simulate_without_real_mesh_returns_honest_400(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    r = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/simulate",
                    json={"plane_point": [0, 0, 0], "plane_normal": [0, 0, 1], "run_fem": False},
                    headers=headers)
    assert r.status_code == 400
    assert "maillage" in r.json()["detail"].lower() or "segment" in r.json()["detail"].lower()


def test_simulate_computes_flr_and_tumor_margin(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    _attach_segments(client, headers, patient_id, _make_synthetic_anatomy(patient_id))

    r = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/simulate",
                    json={"plane_point": [0, 0, 0], "plane_normal": [0, 0, 1], "margin_mm": 5.0, "run_fem": False},
                    headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["patient_id"] == patient_id
    m = data["metrics"]
    assert m["total_volume_ml"] is not None and m["total_volume_ml"] > 0
    assert 30 < m["flr_pct"] < 70          # plan médian → ~50 % de FLR
    assert m["resected_volume_ml"] > 0
    assert m["margin_mm"] is not None and 15 < m["margin_mm"] < 25   # lésion à z=22
    assert m["margin_ok"] is True          # 5 mm demandés
    assert "warning" in data and data["warning"]


def test_simulate_rejects_plane_leaving_empty_remnant(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    _attach_segments(client, headers, patient_id, _make_synthetic_anatomy(patient_id))

    # Plan au-delà de l'organe : remnant (côté n·(x−p) > 0) vide → 400 explicite
    r = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/simulate",
                    json={"plane_point": [0, 0, 500], "plane_normal": [0, 0, 1], "run_fem": False},
                    headers=headers)
    assert r.status_code == 400


def test_simulate_with_fem_end_to_end(client):
    """Simulation complète : FLR + marge + relaxation hyperélastique Mooney-Rivlin
    + export du maillage déformé (URL /meshes/... servie par le mount statique)."""
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    _attach_segments(client, headers, patient_id, _make_synthetic_anatomy(patient_id))

    r = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/simulate",
                    json={"plane_point": [0, 0, 0], "plane_normal": [0, 0, 1],
                          "margin_mm": 5.0, "run_fem": True, "max_displacement_mm": 1.5},
                    headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    m = data["metrics"]
    assert m["strain_energy_relaxation_pct"] is not None
    assert m["strain_energy_relaxation_pct"] >= 95.0     # critère de convergence pragmatique
    assert m["peak_displacement_mm"] is not None
    assert m["converged"] is True
    assert data["deformed_mesh_url"] is not None
    assert data["deformed_mesh_url"].startswith("/meshes/")
    assert data["deformed_mesh_url"].endswith(".glb")


# ---------------------------------------------------------------------------
# CRUD des plans persistés
# ---------------------------------------------------------------------------

def test_plan_crud_and_select(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    _attach_segments(client, headers, patient_id, _make_synthetic_anatomy(patient_id))

    # Création (FEM off, rapide)
    created = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans",
                          json={"title": "Plan A", "plane_point": [0, 0, 0],
                                "plane_normal": [0, 0, 1], "margin_mm": 5.0, "run_fem": False},
                          headers=headers)
    assert created.status_code == 200, created.text
    plan = created.json()
    plan_id = plan["id"]
    assert plan["status"] == "DRAFT"
    assert plan["metrics"]["flr_pct"] is not None

    # Liste
    listed = client.get(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans", headers=headers)
    assert listed.status_code == 200
    assert any(p["id"] == plan_id for p in listed.json())

    # Lecture unitaire
    one = client.get(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans/{plan_id}", headers=headers)
    assert one.status_code == 200
    assert one.json()["title"] == "Plan A"

    # Sélection comme plan chirurgical retenu
    sel = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans/{plan_id}/select",
                      headers=headers)
    assert sel.status_code == 200
    assert sel.json()["status"] == "SELECTED"

    # Renommage
    upd = client.put(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans/{plan_id}",
                     json={"title": "Plan A (retenu)"}, headers=headers)
    assert upd.status_code == 200
    assert upd.json()["title"] == "Plan A (retenu)"

    # Suppression
    dele = client.delete(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans/{plan_id}",
                         headers=headers)
    assert dele.status_code == 204
    gone = client.get(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans/{plan_id}",
                      headers=headers)
    assert gone.status_code == 404


def test_selecting_one_plan_deselects_others(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    _attach_segments(client, headers, patient_id, _make_synthetic_anatomy(patient_id))

    ids = []
    for title in ("Plan A", "Plan B"):
        r = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans",
                        json={"title": title, "plane_point": [0, 0, 0],
                              "plane_normal": [0, 0, 1], "margin_mm": 5.0, "run_fem": False},
                        headers=headers)
        assert r.status_code == 200, r.text
        ids.append(r.json()["id"])

    client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans/{ids[0]}/select", headers=headers)
    client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans/{ids[1]}/select", headers=headers)

    listed = client.get(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans", headers=headers).json()
    by_id = {p["id"]: p["status"] for p in listed}
    assert by_id[ids[1]] == "SELECTED"
    assert by_id[ids[0]] == "DRAFT"


# ---------------------------------------------------------------------------
# Export PDF / DICOM SR
# ---------------------------------------------------------------------------

def test_plan_export_pdf_and_dicom_sr(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    _attach_segments(client, headers, patient_id, _make_synthetic_anatomy(patient_id))

    created = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans",
                          json={"title": "Plan export", "plane_point": [0, 0, 0],
                                "plane_normal": [0, 0, 1], "margin_mm": 5.0, "run_fem": False},
                          headers=headers)
    plan_id = created.json()["id"]

    pdf = client.get(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans/{plan_id}/export",
                     params={"format": "pdf"}, headers=headers)
    assert pdf.status_code == 200, pdf.text[:300]
    assert pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content.startswith(b"%PDF")

    sr = client.get(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans/{plan_id}/export",
                    params={"format": "dicom-sr"}, headers=headers)
    assert sr.status_code == 200, sr.text[:300]
    assert sr.headers["content-type"].startswith("application/dicom")
    assert sr.content.startswith(b"\x00\x01") or b"DICM" in sr.content[:200]

    bad = client.get(f"/api/v2/surgical-planning/patients/{patient_id}/resection/plans/{plan_id}/export",
                     params={"format": "xml"}, headers=headers)
    assert bad.status_code == 422


# ---------------------------------------------------------------------------
# Anatomie synthétique de démo (endpoint demo/) → mêmes règles que le réel
# ---------------------------------------------------------------------------

def test_demo_synthetic_organ_feeds_planning_pipeline(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)

    r = client.post("/api/v2/demo/synthetic-organ",
                    json={"patient_id": patient_id}, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["is_real_patient_anatomy"] is False
    assert data["organ"]["url"].endswith(".glb")
    assert data["lesion"]["url"].endswith(".glb")

    # La planification consomme ces segments comme n'importe quel maillage réel
    sim = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/simulate",
                      json={"plane_point": [0, 0, 0], "plane_normal": [0, 0, 1], "run_fem": False},
                      headers=headers)
    assert sim.status_code == 200, sim.text
    assert sim.json()["metrics"]["flr_pct"] is not None


# ---------------------------------------------------------------------------
# Marges aux structures critiques (nerf/vaisseau) — planification ORL
# ---------------------------------------------------------------------------

def _write_glb_bytes(mesh) -> bytes:
    """trimesh renvoie les octets directement quand aucun `file_obj`/chemin
    n'est fourni à `export()` — pratique pour construire un fichier à uploader
    en mémoire, sans passer par le disque."""
    return mesh.export(file_type="glb")


def test_simulate_includes_critical_structure_margin(client):
    """Un segment 'nerve' avec un maillage réel doit apparaître dans
    critical_structure_margins avec une distance plausible au plan de coupe —
    sans bloquer le calcul FLR/marge tumorale existant (non-régression)."""
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    _attach_segments(client, headers, patient_id, _make_synthetic_anatomy(patient_id))

    from mesh_export import export_mesh_glb
    from segmentation_service import MESH_STORAGE

    out_dir = MESH_STORAGE / "test" / patient_id
    nerve = trimesh.creation.icosphere(subdivisions=2, radius=3.0)
    nerve.apply_translation([0.0, 0.0, -15.0])   # côté remnant (n·(x−p) < 0), ~12 mm du plan z=0
    export_mesh_glb(nerve, out_dir / "nerve_test.glb", color_rgba=(255, 215, 0, 220))
    nerve_url = f"/meshes/test/{patient_id}/nerve_test.glb"
    _attach_critical_structure(client, headers, patient_id, seg_type="nerve", mesh_url=nerve_url,
                               label="Nerf facial (VII) — test")

    r = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/simulate",
                    json={"plane_point": [0, 0, 0], "plane_normal": [0, 0, 1],
                          "margin_mm": 5.0, "run_fem": False},
                    headers=headers)
    assert r.status_code == 200, r.text
    m = r.json()["metrics"]
    # Non-régression : le calcul FLR/marge tumorale existant reste inchangé
    assert 30 < m["flr_pct"] < 70
    crit = m["critical_structure_margins"]
    assert len(crit) == 1
    assert crit[0]["type"] == "nerve"
    assert crit[0]["label"] == "Nerf facial (VII) — test"
    assert 8 < crit[0]["margin_mm"] < 16


def test_simulate_without_critical_structures_returns_empty_list(client):
    """Patient sans nerf/vaisseau importé : liste vide, pas d'erreur (comportement
    par défaut historique préservé)."""
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    _attach_segments(client, headers, patient_id, _make_synthetic_anatomy(patient_id))

    r = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/simulate",
                    json={"plane_point": [0, 0, 0], "plane_normal": [0, 0, 1], "run_fem": False},
                    headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["metrics"]["critical_structure_margins"] == []


def test_fem_rejected_for_rigid_tissue(client):
    """La relaxation FEM hyperélastique doit être refusée (400 explicite) pour un
    tissu rigide (cartilage/os) — physiquement hors du domaine du solveur."""
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    _attach_segments(client, headers, patient_id, _make_synthetic_anatomy(patient_id))

    r = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/simulate",
                    json={"plane_point": [0, 0, 0], "plane_normal": [0, 0, 1],
                          "tissue_type": "cartilage_hyaline", "run_fem": True},
                    headers=headers)
    assert r.status_code == 400
    assert "rigid" in r.json()["detail"].lower() or "fem" in r.json()["detail"].lower()

    # Le même tissu SANS FEM (calcul géométrique seul) doit rester utilisable.
    r2 = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/simulate",
                     json={"plane_point": [0, 0, 0], "plane_normal": [0, 0, 1],
                           "tissue_type": "cartilage_hyaline", "run_fem": False},
                     headers=headers)
    assert r2.status_code == 200, r2.text
    assert r2.json()["metrics"]["flr_pct"] is not None


def test_fem_still_works_for_soft_tissue(client):
    """Non-régression : le garde-fou de rigidité (nouveau) ne bloque PAS le tissu
    mou par défaut (foie) — la FEM s'exécute toujours et produit des métriques.
    Ne teste pas la qualité de convergence elle-même (déjà couverte, et connue
    pour être proche du seuil pragmatique, par test_simulate_with_fem_end_to_end)."""
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    _attach_segments(client, headers, patient_id, _make_synthetic_anatomy(patient_id))

    r = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/simulate",
                    json={"plane_point": [0, 0, 0], "plane_normal": [0, 0, 1],
                          "tissue_type": "liver_parenchyma", "run_fem": True},
                    headers=headers)
    assert r.status_code == 200, r.text
    m = r.json()["metrics"]
    assert m["strain_energy_relaxation_pct"] is not None
    assert m["deformed_volume_ml"] is not None


# ---------------------------------------------------------------------------
# Import manuel de structures critiques (endpoint multipart)
# ---------------------------------------------------------------------------

def test_import_critical_structure_requires_authentication(client):
    patient_id = _unique("pat")
    r = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/critical-structures/import",
                    data={"structure_type": "nerve", "label": "Nerf test"},
                    files={"file": ("nerve.glb", b"not-a-real-glb", "model/gltf-binary")})
    assert r.status_code == 401


def test_import_critical_structure_end_to_end(client):
    """Upload multipart d'un vrai maillage .glb (segmenté 'manuellement' ici —
    une icosphère tient lieu de nerf dans ce test) → Segment créé, résolvable,
    et pris en compte immédiatement par le calcul de marge."""
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    _attach_segments(client, headers, patient_id, _make_synthetic_anatomy(patient_id))

    vessel_mesh = trimesh.creation.icosphere(subdivisions=1, radius=2.0)
    vessel_mesh.apply_translation([20.0, 0.0, -5.0])
    glb_bytes = _write_glb_bytes(vessel_mesh)

    r = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/critical-structures/import",
                    headers=headers,
                    data={"structure_type": "vessel", "label": "Veine jugulaire interne — test"},
                    files={"file": ("vessel.glb", glb_bytes, "model/gltf-binary")})
    assert r.status_code == 201, r.text
    seg = r.json()
    assert seg["type"] == "vessel"
    assert seg["patient_id"] == patient_id
    assert seg["mesh_ref"].startswith("/meshes/critical_structures/")

    # Apparaît bien dans la liste des segments du patient
    listed = client.get(f"/patients/{patient_id}/segments", headers=headers)
    assert any(s["id"] == seg["id"] for s in listed.json())

    # Et alimente immédiatement le calcul de marge
    sim = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/resection/simulate",
                      json={"plane_point": [0, 0, 0], "plane_normal": [0, 0, 1], "run_fem": False},
                      headers=headers)
    assert sim.status_code == 200, sim.text
    crit = sim.json()["metrics"]["critical_structure_margins"]
    assert any(c["segment_id"] == seg["id"] and c["type"] == "vessel" for c in crit)


def test_import_critical_structure_rejects_unsupported_format(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)

    r = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/critical-structures/import",
                    headers=headers,
                    data={"structure_type": "nerve", "label": "Nerf test"},
                    files={"file": ("nerve.txt", b"hello", "text/plain")})
    assert r.status_code == 400


def test_import_critical_structure_rejects_bad_structure_type(client):
    _, headers = _register_and_login(client)
    patient_id = _create_patient(client, headers)
    mesh = trimesh.creation.icosphere(subdivisions=1, radius=1.0)

    r = client.post(f"/api/v2/surgical-planning/patients/{patient_id}/critical-structures/import",
                    headers=headers,
                    data={"structure_type": "tumor", "label": "Pas une structure critique"},
                    files={"file": ("x.glb", _write_glb_bytes(mesh), "model/gltf-binary")})
    assert r.status_code == 422   # validation Form(pattern=...) → 422, pas 400


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
