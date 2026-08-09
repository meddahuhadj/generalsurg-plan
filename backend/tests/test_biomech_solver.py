# -*- coding: utf-8 -*-
"""Tests du solveur hyperélastique (biomech_solver.py) — vérifient :
   1. Les dérivées de l'énergie (Mooney-Rivlin, Ogden, Néo-Hookéen) contre les
      différences finies (exactitude des gradients nodaux).
   2. La non-négativité / le zéro unique de l'énergie à F=I.
   3. Le pipeline complet : tétraédrisation → coupe → FLR → relaxation →
      export GLB, sur un organe de synthèse."""

import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import biomech_solver as bs  # noqa: E402

MODELS = [
    ("mooney_rivlin", {"C10_kpa": 3.0, "C01_kpa": 0.5, "D1": 5.0}),
    ("ogden", {"mu": [2.0, 0.4], "alpha": [4.0, 1.5], "D1": 5.0}),
    ("neo_hookean", {"C10_kpa": 2.0, "C01_kpa": 0.0, "D1": 0.0}),
]


@pytest.fixture(scope="module")
def small_mesh():
    """Petit maillage tétraédrique non dégénéré (8 sommets + 2 intérieurs)."""
    nodes = np.array([[x, y, z] for x in (0, 1) for y in (0, 1) for z in (0, 1)],
                     dtype=float)
    nodes = np.vstack([nodes, [[0.5, 0.5, 0.5], [0.2, 0.8, 0.4]]])
    from scipy.spatial import Delaunay
    tets = Delaunay(nodes).simplices
    invB = np.linalg.inv(np.stack(
        [nodes[tets[:, i]] - nodes[tets[:, 0]] for i in (1, 2, 3)], axis=-1))
    vols = bs.tet_volumes(nodes, tets)
    return nodes, tets, invB, vols


@pytest.mark.parametrize("model,params", MODELS)
def test_energy_zero_and_positive_at_identity(model, params):
    F = np.eye(3)
    w = bs.energy_density(F, model, params)
    assert abs(w) < 1e-9, "W(F=I) doit être nul."
    rng = np.random.default_rng(0)
    for _ in range(50):
        F = np.eye(3) + rng.uniform(-0.2, 0.2, (3, 3))
        assert bs.energy_density(F, model, params) >= -1e-9


@pytest.mark.parametrize("model,params", MODELS)
def test_gradient_matches_finite_differences(small_mesh, model, params):
    nodes, tets, invB, vols = small_mesh
    rng = np.random.default_rng(1)
    cur = nodes + rng.uniform(-0.02, 0.02, nodes.shape)
    g = bs.nodal_energy_gradient(cur, nodes, tets, invB, vols, model, params)

    def E(x):
        return bs.total_strain_energy(x, nodes, tets, invB, vols, model, params)

    h = 1e-7
    max_err = 0.0
    for k in range(len(nodes)):
        for c in range(3):
            xp = cur.copy()
            xm = cur.copy()
            xp[k, c] += h
            xm[k, c] -= h
            max_err = max(max_err, abs((E(xp) - E(xm)) / (2 * h) - g[k, c]))
    assert max_err < 1e-3, f"Erreur de gradient {model} : {max_err}"


def test_batch_matches_scalar_energy(small_mesh):
    nodes, tets, invB, vols = small_mesh
    cur = nodes + 0.01
    Fs = bs.element_deformation_gradients(cur, nodes, tets, invB)
    batch = bs.energy_density_batch(Fs, "mooney_rivlin",
                                    {"C10_kpa": 3.0, "C01_kpa": 0.5, "D1": 5.0})
    scalar = np.array([bs.energy_density(F, "mooney_rivlin",
                                         {"C10_kpa": 3.0, "C01_kpa": 0.5, "D1": 5.0})
                       for F in Fs])
    assert np.abs(batch - scalar).max() < 1e-9


def test_tetmesh_build_and_split_volumes(tmp_path):
    import trimesh
    glb = tmp_path / "organ.glb"
    trimesh.creation.icosphere(subdivisions=2, radius=50.0).export(str(glb))
    tet = bs.build_tetmesh_from_glb(glb, max_interior_points=200)
    assert tet["num_tets"] > 0 and tet["volume_ml"] > 0
    split = bs.split_tetmesh_by_plane(tet, np.array([0.0, 0.0, 0.0]),
                                      np.array([1.0, 0.0, 0.0]))
    assert split["remnant"] is not None and split["resected"] is not None
    total = split["remnant"]["volume_ml"] + split["resected"]["volume_ml"]
    assert abs(total - tet["volume_ml"]) < 5.0, "Volumes conservés après coupe"


def test_simulate_post_resection_end_to_end(tmp_path):
    import trimesh
    glb = tmp_path / "liver_demo.glb"
    trimesh.creation.icosphere(subdivisions=2, radius=50.0).export(str(glb))
    params = {"C10_kpa": 2.5, "C01_kpa": 0.0}
    result = bs.simulate_post_resection(
        str(glb), np.array([0.0, 0.0, 0.0]), np.array([1.0, 0.0, 0.0]),
        params, model="mooney_rivlin", max_displacement_mm=1.5)
    assert result["status"] == "ok"
    assert result["converged"]
    assert 0 < result["flr_pct"] < 100
    assert result["strain_energy_relaxation_pct"] > 0
    # Maillage déformé écrit sur disque
    assert os.path.exists(tmp_path / "biomech" /
                          os.path.basename(result["deformed_mesh_url"]))


def test_surface_min_distance_to_plane(tmp_path):
    import trimesh
    glb = tmp_path / "organ.glb"
    trimesh.creation.icosphere(subdivisions=1, radius=50.0).export(str(glb))
    d = bs.surface_min_distance_to_plane(glb, np.array([0.0, 0.0, 0.0]),
                                         np.array([1.0, 0.0, 0.0]))
    assert d >= 0 and d < 5.0  # le plan passe par le centre de la sphère
