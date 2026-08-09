# -*- coding: utf-8 -*-
"""
tests/test_tetmesh.py — Vérifie mask_to_tetmesh() (backend/mesh_export.py),
première brique de la feuille de route "Jumeau numérique réel" (tétraédrisation,
préalable à tout calcul Mooney-Rivlin/XPBD). Volumes vérifiés contre des formes
synthétiques dont le volume analytique est connu (pas besoin de vraie
segmentation ni de TotalSegmentator).

Lancer : cd backend && pytest tests/test_tetmesh.py -v
"""
import numpy as np
import pytest

pytest.importorskip("scipy")

from mesh_export import mask_to_tetmesh


def _sphere_mask(shape=(40, 40, 40), radius=15.0):
    zz, yy, xx = np.indices(shape)
    center = np.array(shape) / 2.0
    dist = np.sqrt((zz - center[0]) ** 2 + (yy - center[1]) ** 2 + (xx - center[2]) ** 2)
    return dist <= radius


def _cube_mask(shape=(30, 30, 30), half_side=10):
    mask = np.zeros(shape, dtype=bool)
    c = np.array(shape) // 2
    mask[c[0] - half_side:c[0] + half_side,
         c[1] - half_side:c[1] + half_side,
         c[2] - half_side:c[2] + half_side] = True
    return mask


def _recompute_tet_volumes(nodes: np.ndarray, tets: np.ndarray) -> np.ndarray:
    a, b, c, d = (nodes[tets[:, i]] for i in range(4))
    return np.abs(np.einsum("ij,ij->i", a - d, np.cross(b - d, c - d))) / 6.0


def test_tetmesh_sphere_volume_matches_analytical():
    radius = 15.0
    mask = _sphere_mask(radius=radius)
    result = mask_to_tetmesh(mask, spacing=(1.0, 1.0, 1.0))

    expected_ml = (4 / 3) * np.pi * radius ** 3 / 1000.0
    assert result["volume_ml"] == pytest.approx(expected_ml, rel=0.15)
    assert result["num_tets"] > 0
    assert result["nodes"].shape[1] == 3
    assert result["tets"].shape[1] == 4
    assert result["num_nodes"] == len(result["nodes"])
    assert result["num_tets"] == len(result["tets"])


def test_tetmesh_cube_volume_matches_analytical():
    half_side = 10
    mask = _cube_mask(half_side=half_side)
    result = mask_to_tetmesh(mask, spacing=(1.0, 1.0, 1.0))

    expected_ml = (2 * half_side) ** 3 / 1000.0
    assert result["volume_ml"] == pytest.approx(expected_ml, rel=0.1)


def test_tetmesh_no_degenerate_tets():
    mask = _sphere_mask()
    result = mask_to_tetmesh(mask, spacing=(1.0, 1.0, 1.0))
    volumes = _recompute_tet_volumes(result["nodes"], result["tets"])
    assert np.all(volumes > 1e-9)


def test_tetmesh_tets_stay_inside_mask_bounding_box():
    radius = 15.0
    mask = _sphere_mask(shape=(40, 40, 40), radius=radius)
    result = mask_to_tetmesh(mask, spacing=(1.0, 1.0, 1.0))
    center = np.array([20.0, 20.0, 20.0])
    centroids = result["nodes"][result["tets"]].mean(axis=1)
    # Une marge de 2mm absorbe l'approximation "en escalier" de la voxelisation.
    assert np.all(np.linalg.norm(centroids - center, axis=1) <= radius + 2.0)


def test_tetmesh_respects_anisotropic_spacing():
    radius = 12.0
    mask = _sphere_mask(shape=(40, 40, 40), radius=radius)
    result = mask_to_tetmesh(mask, spacing=(2.0, 1.0, 1.0))
    # Sphère "étirée" en Z par le spacing anisotrope -> ellipsoïde de demi-axes
    # (radius*2, radius, radius).
    expected_ml = (4 / 3) * np.pi * (radius * 2.0) * radius * radius / 1000.0
    assert result["volume_ml"] == pytest.approx(expected_ml, rel=0.2)


def test_tetmesh_empty_mask_raises():
    mask = np.zeros((10, 10, 10), dtype=bool)
    with pytest.raises(ValueError):
        mask_to_tetmesh(mask, spacing=(1.0, 1.0, 1.0))


def test_tetmesh_too_small_mask_raises():
    mask = np.ones((1, 10, 10), dtype=bool)
    with pytest.raises(ValueError):
        mask_to_tetmesh(mask, spacing=(1.0, 1.0, 1.0))
