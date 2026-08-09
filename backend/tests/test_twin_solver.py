# -*- coding: utf-8 -*-
"""
tests/test_twin_solver.py — Vérifie backend/twin_solver.py (Phase 1 de la
feuille de route "Jumeau numérique réel" : contraintes XPBD Néo-Hookéennes
sur maillage volumique).

Le point le plus important ici n'est PAS "le code ne plante pas" mais que les
gradients analytiques des contraintes (dérivés à la main dans twin_solver.py)
correspondent VRAIMENT à la dérivée de la contrainte — vérifié par différences
finies, indépendamment de toute intuition physique. Sans ce test, une erreur
de signe ou de facteur dans la dérivation serait invisible (le solveur
« marcherait » quand même, juste avec une physique fausse).

Lancer : cd backend && pytest tests/test_twin_solver.py -v
"""
import numpy as np
import pytest

from mesh_export import mask_to_tetmesh
from twin_solver import (
    TwinSolverState,
    deformation_gradient,
    deviatoric_constraint,
    hydrostatic_constraint,
    precompute_tet_mesh,
    solve,
    stiffness_from_shear_kpa,
)


def _random_nondegenerate_tet(rng: np.random.Generator) -> np.ndarray:
    """4 points non coplanaires (volume garanti > un seuil raisonnable)."""
    while True:
        pts = rng.uniform(-2.0, 2.0, size=(4, 3))
        vol = np.abs(np.dot(pts[1] - pts[0], np.cross(pts[2] - pts[0], pts[3] - pts[0]))) / 6.0
        if vol > 0.2:
            return pts


def _cube_tetmesh(half_side=6):
    mask = np.zeros((20, 20, 20), dtype=bool)
    mask[10 - half_side:10 + half_side, 10 - half_side:10 + half_side, 10 - half_side:10 + half_side] = True
    result = mask_to_tetmesh(mask, spacing=(1.0, 1.0, 1.0), max_interior_points=200)
    return precompute_tet_mesh(result["nodes"], result["tets"])


# ---------------------------------------------------------------------------
# Gradient de déformation
# ---------------------------------------------------------------------------

def test_deformation_gradient_identity_at_rest():
    rng = np.random.default_rng(1)
    rest = _random_nondegenerate_tet(rng)
    tets = np.array([[0, 1, 2, 3]])
    mesh = precompute_tet_mesh(rest, tets)

    F = deformation_gradient(rest, tets, mesh.dm_inv)
    assert np.allclose(F[0], np.eye(3), atol=1e-8)


def test_deformation_gradient_matches_known_affine_map():
    rng = np.random.default_rng(2)
    rest = _random_nondegenerate_tet(rng)
    tets = np.array([[0, 1, 2, 3]])
    mesh = precompute_tet_mesh(rest, tets)

    A = rng.uniform(-1.5, 1.5, size=(3, 3)) + 2 * np.eye(3)  # bien conditionnée
    translation = rng.uniform(-5, 5, size=3)
    deformed = rest @ A.T + translation

    F = deformation_gradient(deformed, tets, mesh.dm_inv)
    assert np.allclose(F[0], A, atol=1e-6)


# ---------------------------------------------------------------------------
# Gradients analytiques des contraintes vs différences finies (LE test qui
# prouve que la physique est correctement dérivée, pas juste plausible)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("seed", [10, 11, 12, 13, 14])
def test_constraint_gradients_match_finite_differences(seed):
    rng = np.random.default_rng(seed)
    rest = _random_nondegenerate_tet(rng)
    tets = np.array([[0, 1, 2, 3]])
    mesh = precompute_tet_mesh(rest, tets)

    # Positions déformées aléatoires (pas au repos, sinon certains termes s'annulent).
    deformed = rest + rng.uniform(-0.8, 0.8, size=(4, 3))

    eps = 1e-6
    for constraint_fn in (deviatoric_constraint, hydrostatic_constraint):
        F = deformation_gradient(deformed, tets, mesh.dm_inv)
        _, analytic_grads = constraint_fn(F, mesh.dm_inv)

        numeric_grad = np.zeros((4, 3))
        for node in range(4):
            for axis in range(3):
                plus, minus = deformed.copy(), deformed.copy()
                plus[node, axis] += eps
                minus[node, axis] -= eps
                C_plus, _ = constraint_fn(deformation_gradient(plus, tets, mesh.dm_inv), mesh.dm_inv)
                C_minus, _ = constraint_fn(deformation_gradient(minus, tets, mesh.dm_inv), mesh.dm_inv)
                numeric_grad[node, axis] = (C_plus[0] - C_minus[0]) / (2 * eps)

        assert np.allclose(analytic_grads[0], numeric_grad, atol=1e-4), (
            f"{constraint_fn.__name__} (seed={seed}): gradient analytique != différences finies"
        )


# ---------------------------------------------------------------------------
# Rigidité relative (stiffness_from_shear_kpa)
# ---------------------------------------------------------------------------

def test_stiffness_from_shear_kpa_monotonic_and_bounded():
    values = [stiffness_from_shear_kpa(k) for k in (0.5, 2.0, 5.0, 20.0, 200.0, 2000.0)]
    assert all(0.0 < v <= 0.95 for v in values)
    assert values == sorted(values)  # strictement croissant avec la rigidité tissulaire


def test_stiffness_from_shear_kpa_rejects_non_positive():
    with pytest.raises(ValueError):
        stiffness_from_shear_kpa(0.0)


# ---------------------------------------------------------------------------
# Comportement physique du solveur (sanity checks, pas une validation clinique)
# ---------------------------------------------------------------------------

def _pin_and_grab(mesh, pin_axis_max: float, grab_axis_min: float, displacement: np.ndarray):
    nodes = mesh.rest_nodes
    pinned = nodes[:, 0] <= pin_axis_max
    candidates = np.where(nodes[:, 0] >= grab_axis_min)[0]
    grab_idx = int(candidates[np.argmax(nodes[candidates, 0])])  # nœud le plus excentré
    state = TwinSolverState(
        positions=nodes.copy(), pinned=pinned,
        grabbed={grab_idx: nodes[grab_idx] + displacement},
    )
    return state, grab_idx


def test_stiffer_tissue_propagates_grab_further_through_free_body():
    """Intuition mécanique correcte (vérifiée ci-dessous, PAS "rigide = bouge
    moins") : un tissu MOU absorbe la déformation localement près du point
    saisi et laisse le reste du corps libre presque immobile (comme saisir un
    coin de gelée : le reste ne suit pas) — déplacement moyen des nœuds libres
    FAIBLE. Un tissu RIGIDE transmet le mouvement de façon beaucoup plus
    cohérente à travers tout le corps libre (comme saisir un coin d'un bloc de
    caoutchouc dur : le corps entier est entraîné) — déplacement moyen des
    nœuds libres ÉLEVÉ. C'est la direction opposée à une première intuition
    naïve ("rigide = bouge moins"), qui confond rigidité et amplitude de
    déplacement local plutôt que de propagation à travers le corps."""
    mesh = _cube_tetmesh()
    displacement = np.array([3.0, 0.0, 0.0])

    liver_stiffness = stiffness_from_shear_kpa(5.0)     # foie sain (atlas)
    vessel_stiffness = stiffness_from_shear_kpa(200.0)  # paroi vasculaire (atlas)
    assert liver_stiffness < vessel_stiffness

    results = {}
    for label, dev_k in (("liver", liver_stiffness), ("vessel", vessel_stiffness)):
        state, grab_idx = _pin_and_grab(mesh, pin_axis_max=4.0, grab_axis_min=15.0, displacement=displacement)
        final = solve(mesh, state, dev_stiffness=dev_k, hyd_stiffness=0.3, iterations=25)
        free = ~state.pinned
        free[grab_idx] = False
        results[label] = float(np.linalg.norm(final[free] - mesh.rest_nodes[free], axis=1).mean())

    assert results["vessel"] > results["liver"], (
        f"Un tissu plus rigide (paroi vasculaire) devrait transmettre le déplacement du point "
        f"saisi plus largement au reste du corps libre que le foie sain, "
        f"obtenu: vessel={results['vessel']:.4f} <= liver={results['liver']:.4f}"
    )


def test_higher_hydrostatic_stiffness_reduces_per_tet_volume_violation():
    """Métrique importante : la violation MOYENNE PAR TÉTRAÈDRE |det(F)-1|,
    pas la somme signée des volumes sur tout le maillage — cette dernière peut
    dissimuler une vraie violation si des tétraèdres sur- et sous-évaluent leur
    volume en se compensant. Avec la moyenne par tétraèdre, la relation avec
    la rigidité hydrostatique est monotone et nette (vérifié en développant ce
    module : ~0.0033 à hyd=0.05 contre ~0.0013 à hyd=0.9, sur ce maillage)."""
    mesh = _cube_tetmesh()
    displacement = np.array([1.2, 0.3, -0.3])

    mean_violation = {}
    for label, hyd_k in (("low_hyd", 0.05), ("high_hyd", 0.9)):
        state, grab_idx = _pin_and_grab(mesh, pin_axis_max=4.0, grab_axis_min=15.0, displacement=displacement)
        final = solve(mesh, state, dev_stiffness=0.4, hyd_stiffness=hyd_k, iterations=30)
        F_final = deformation_gradient(final, mesh.tets, mesh.dm_inv)
        mean_violation[label] = float(np.abs(np.linalg.det(F_final) - 1.0).mean())

    assert mean_violation["high_hyd"] < mean_violation["low_hyd"], (
        f"Une rigidité hydrostatique élevée devrait réduire la violation moyenne par tétraèdre "
        f"de det(F)=1, obtenu: high_hyd={mean_violation['high_hyd']:.5f} >= "
        f"low_hyd={mean_violation['low_hyd']:.5f}"
    )
    # Ordre de grandeur absolu : quasi-incompressible, pas juste "meilleur qu'un pire cas".
    assert mean_violation["high_hyd"] < 0.05


def test_solve_rejects_out_of_range_stiffness():
    mesh = _cube_tetmesh()
    state = TwinSolverState(positions=mesh.rest_nodes.copy(),
                             pinned=np.zeros(len(mesh.rest_nodes), dtype=bool))
    with pytest.raises(ValueError):
        solve(mesh, state, dev_stiffness=1.5, hyd_stiffness=0.5, iterations=1)
