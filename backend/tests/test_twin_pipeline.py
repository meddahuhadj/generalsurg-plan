# -*- coding: utf-8 -*-
"""
tests/test_twin_pipeline.py — Vérifie backend/twin_pipeline.py, qui relie la
segmentation IA réelle (segmentation_service.py) au solveur biomécanique
(twin_solver.py) : Phase 0b/1b de la feuille de route "Jumeau numérique réel".

Aucun vrai TotalSegmentator n'est nécessaire ici : on fabrique un NIfTI
synthétique (une sphère labellisée) et on simule un job de segmentation
"terminé" directement dans `segmentation_service._JOBS`, exactement comme le
ferait un vrai pipeline une fois l'inférence achevée (voir
`segmentation_service._maybe_build_mesh`, qui peuple `label_sources` de la
même façon).

Lancer : cd backend && pytest tests/test_twin_pipeline.py -v
"""
from pathlib import Path

import numpy as np
import pytest

nib = pytest.importorskip("nibabel")

import segmentation_service as seg
import twin_pipeline


def _make_synthetic_liver_job(tmp_path: Path, radius: float = 12.0, spacing=(1.5, 1.5, 1.5)) -> tuple[str, str]:
    """Fabrique un NIfTI synthétique (sphère labellisée, label=1) et l'enregistre
    comme job de segmentation 'terminé' — reproduit la structure de
    `_JOBS[job_id]` que produirait un vrai job HBP (voir
    segmentation_service._run_liver_job / _maybe_build_mesh)."""
    shape = (40, 40, 40)
    zz, yy, xx = np.indices(shape)
    center = np.array(shape) / 2.0
    dist = np.sqrt((zz - center[0]) ** 2 + (yy - center[1]) ** 2 + (xx - center[2]) ** 2)
    data = (dist <= radius).astype(np.float32)  # label 1 = "liver_total"

    affine = np.diag([*spacing, 1.0])
    nifti_path = tmp_path / "total.nii.gz"
    nib.save(nib.Nifti1Image(data, affine), str(nifti_path))

    job_id = "test_job_" + tmp_path.name
    seg._JOBS[job_id] = {
        "status": "done",
        "progress": "Terminé.",
        "result": {"liver_total_ml": 0.0},
        "error": None,
        "label_sources": {"liver_total": {"nifti_path": str(nifti_path), "label_value": 1}},
    }
    return job_id, "liver_total"


@pytest.fixture(autouse=True)
def _cleanup_jobs():
    yield
    seg._JOBS.clear()


def test_build_tetmesh_for_structure_matches_analytical_volume(tmp_path):
    job_id, structure = _make_synthetic_liver_job(tmp_path, radius=12.0, spacing=(1.5, 1.5, 1.5))

    info = twin_pipeline.build_tetmesh_for_structure(job_id, structure)

    expected_ml = (4 / 3) * np.pi * (12.0 * 1.5) ** 3 / 1000.0
    assert info["volume_ml"] == pytest.approx(expected_ml, rel=0.2)
    assert info["num_tets"] > 0
    assert Path(info["path"]).is_file()


def test_load_tetmesh_roundtrips_after_build(tmp_path):
    job_id, structure = _make_synthetic_liver_job(tmp_path)
    info = twin_pipeline.build_tetmesh_for_structure(job_id, structure)

    mesh = twin_pipeline.load_tetmesh(job_id, structure)

    assert mesh.rest_nodes.shape[1] == 3
    assert mesh.tets.shape[1] == 4
    assert len(mesh.tets) == info["num_tets"]
    assert float(mesh.rest_volume.sum()) == pytest.approx(info["volume_ml"] * 1000.0, rel=1e-6)


def test_load_tetmesh_missing_raises_file_not_found(tmp_path):
    job_id, structure = _make_synthetic_liver_job(tmp_path)
    # Pas de build_tetmesh_for_structure appelé : rien n'a encore été construit.
    with pytest.raises(FileNotFoundError):
        twin_pipeline.load_tetmesh(job_id, structure)


def test_build_tetmesh_unknown_job_raises_key_error():
    with pytest.raises(KeyError):
        twin_pipeline.build_tetmesh_for_structure("does-not-exist", "liver_total")


def test_build_tetmesh_unknown_structure_raises_key_error(tmp_path):
    job_id, _structure = _make_synthetic_liver_job(tmp_path)
    with pytest.raises(KeyError):
        twin_pipeline.build_tetmesh_for_structure(job_id, "not_a_real_structure")


def test_build_tetmesh_job_not_done_raises_value_error(tmp_path):
    job_id, structure = _make_synthetic_liver_job(tmp_path)
    seg._JOBS[job_id]["status"] = "running"
    with pytest.raises(ValueError):
        twin_pipeline.build_tetmesh_for_structure(job_id, structure)


def test_build_tetmesh_missing_nifti_file_raises_file_not_found(tmp_path):
    job_id, structure = _make_synthetic_liver_job(tmp_path)
    Path(seg._JOBS[job_id]["label_sources"][structure]["nifti_path"]).unlink()
    with pytest.raises(FileNotFoundError):
        twin_pipeline.build_tetmesh_for_structure(job_id, structure)
