# -*- coding: utf-8 -*-
"""
tests/test_registration.py — Vérifie backend/registration.py (ICP rigide +
FFD B-spline non-rigide), qui remplace le stub "not_implemented" de
backend/biomechanics_engine.py:/elastic-registration.

Deux types de vérification :
  1. Correction mathématique des briques de base (poids B-spline : partition
     de l'unité + valeurs connues ; ICP : retrouve une transformation rigide
     CONNUE appliquée à un nuage de points).
  2. Comportement attendu du recalage complet : sur une déformation non-rigide
     synthétique connue, l'étape FFD doit réduire significativement l'erreur
     résiduelle que l'ICP seul (rigide) ne peut pas corriger.

Lancer : cd backend && pytest tests/test_registration.py -v
"""
import numpy as np
import pytest
from scipy.spatial.transform import Rotation

from registration import (
    FfdGrid,
    _cubic_bspline_weights,
    bspline_ffd_register,
    rigid_icp,
)


# ---------------------------------------------------------------------------
# Poids B-spline cubique
# ---------------------------------------------------------------------------

def test_bspline_weights_partition_of_unity():
    t = np.linspace(0.0, 0.999, 50)
    weights = _cubic_bspline_weights(t)
    assert np.allclose(weights.sum(axis=1), 1.0, atol=1e-10)


def test_bspline_weights_known_value_at_zero():
    w = _cubic_bspline_weights(np.array([0.0]))[0]
    assert np.allclose(w, [1 / 6, 4 / 6, 1 / 6, 0.0])


def test_bspline_weights_known_value_near_one():
    w = _cubic_bspline_weights(np.array([1.0]))[0]
    assert np.allclose(w, [0.0, 1 / 6, 4 / 6, 1 / 6])


# ---------------------------------------------------------------------------
# ICP rigide
# ---------------------------------------------------------------------------

def _random_point_cloud(n=200, seed=0):
    rng = np.random.default_rng(seed)
    return rng.uniform(-20, 20, size=(n, 3))


def test_rigid_icp_recovers_known_rotation_and_translation():
    rng = np.random.default_rng(1)
    target = _random_point_cloud(n=300, seed=1)
    true_R = Rotation.from_euler("xyz", [12, -8, 20], degrees=True).as_matrix()
    true_t = np.array([5.0, -3.0, 2.0])
    source = (np.linalg.inv(true_R) @ (target - true_t).T).T  # source -> (R,t) -> target

    result = rigid_icp(source, target, max_iterations=100, tolerance=1e-10)

    assert result.converged
    assert np.allclose(result.rotation, true_R, atol=1e-3)
    assert np.allclose(result.translation, true_t, atol=1e-2)
    assert result.rms_history[-1] < 1e-3


def test_rigid_icp_aligned_source_matches_target():
    target = _random_point_cloud(n=150, seed=2)
    true_R = Rotation.from_euler("xyz", [5, 15, -10], degrees=True).as_matrix()
    true_t = np.array([-2.0, 1.0, 4.0])
    source = (np.linalg.inv(true_R) @ (target - true_t).T).T

    result = rigid_icp(source, target)
    assert np.allclose(result.aligned_source, target, atol=1e-2)


def test_rigid_icp_rejects_empty_input():
    with pytest.raises(ValueError):
        rigid_icp(np.zeros((0, 3)), _random_point_cloud(10))


# ---------------------------------------------------------------------------
# FFD non-rigide
# ---------------------------------------------------------------------------

def test_ffd_grid_zero_displacement_is_identity():
    grid = FfdGrid(origin=np.zeros(3), spacing=np.full(3, 2.0),
                    displacement=np.zeros((8, 8, 8, 3)))
    points = np.array([[3.3, 4.1, 5.9], [0.5, 0.5, 0.5]])
    assert np.allclose(grid.deform_points(points), points)


def _bulge_deform(points: np.ndarray, amplitude=4.0, wavelength=15.0) -> np.ndarray:
    """Déformation non-rigide synthétique connue (bombement sinusoïdal selon
    z, fonction de x) — pas un mouvement rigide, l'ICP seul ne peut pas
    l'expliquer, ce qui est exactement le point de ce test."""
    out = points.copy()
    out[:, 2] += amplitude * np.sin(points[:, 0] / wavelength * np.pi)
    return out


def test_ffd_reduces_residual_error_beyond_rigid_icp_alone():
    rng = np.random.default_rng(3)
    source = rng.uniform(-20, 20, size=(400, 3))
    target = _bulge_deform(source)  # même nuage, déformation non-rigide connue

    rigid_result = rigid_icp(source, target, max_iterations=50)
    rigid_only_rms = rigid_result.rms_history[-1]

    ffd_result = bspline_ffd_register(rigid_result.aligned_source, target,
                                       grid_spacing_mm=8.0, iterations=20, smoothing=0.3)
    ffd_rms = ffd_result.rms_history[-1]

    assert ffd_rms < rigid_only_rms * 0.5, (
        f"Le FFD devrait réduire nettement l'erreur résiduelle non-rigide que l'ICP seul "
        f"ne peut pas corriger : rigide seul={rigid_only_rms:.3f}mm, après FFD={ffd_rms:.3f}mm"
    )


def test_ffd_register_rejects_empty_input():
    with pytest.raises(ValueError):
        bspline_ffd_register(np.zeros((0, 3)), _random_point_cloud(10), grid_spacing_mm=5.0)


def test_ffd_register_rejects_non_positive_spacing():
    source = _random_point_cloud(10, seed=4)
    with pytest.raises(ValueError):
        bspline_ffd_register(source, source.copy(), grid_spacing_mm=0.0)
