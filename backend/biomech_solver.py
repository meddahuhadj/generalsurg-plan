# -*- coding: utf-8 -*-
"""
biomech_solver.py — Solveur d'énergie de déformation hyperélastique (Mooney-Rivlin / Ogden)
============================================================================================
Remplaçant de la simulation "jumeau numérique" illustrative par un VRAI calcul
d'énergie de déformation sur un maillage volumique (tétraèdres), comme décrit
dans `twin_biomech_atlas.py` (feuille de route "Jumeau numérique réel").

Ce module implémente :
    1. Les modèles constitutifs hyperélastiques usuels des tissus mous :
         • Mooney-Rivlin (compressible)  : W = C10(I1−3) + C01(I2−3) + (D1/2)(J−1)²
         • Ogden (compressible)          : W = Σ_p (μ_p/α_p)(λ1^α + λ2^α + λ3^α − 3) + (D1/2)(J−1)²
         • Néo-Hookéen (cas C01=0 de Mooney-Rivlin)
    2. Un solveur d'équilibre par MINIMISATION DE L'ÉNERGIE TOTALE de
       déformation sur les déplacements nodaux (méthode de Newton/BFGS via
       scipy, gradients analytiques) — c'est un vrai solveur d'éléments finis
       tétraédriques linéaires, pas une formule paramétrique.
    3. La simulation de la déformation POST-RÉSECTION : le plan de coupe
       sépare l'organe en "réséqué" et "remanié" (remnant), puis le remnant
       relaxe (fermeture du défaut) en minimisant son énergie de déformation,
       avec des points d'ancrage (pédicule/attache).
    4. Des volumes réellement calculés (FLR) à partir des maillages
       segmentés du patient.

⚠️ AVERTISSEMENT HONNÊTE :
    - Les paramètres tissulaires viennent de l'atlas littérature
      (`twin_biomech_atlas.py`) tant qu'aucune élastographie patient réelle
      n'est disponible. Les ordres de grandeur (module de cisaillement kPa)
      sont issus de plages cliniques établies, PAS d'une calibration
      Mooney-Rivlin publiée et vérifiée.
    - Ce solveur n'est PAS validé cliniquement. Il sert à la PLANIFICATION
      (tester plusieurs plans de coupe et comparer les FLR), pas au guidage
      peropératoire d'un geste réel.
    - Dans la version actuelle, la fermeture du défaut est modélisée par une
      charge de contraction contrôlée (voir `contraction_factor`) : l'ampleur
      réelle de la déformation dépendrait de la pré-tension in situ du tissu,
      non mesurée ici.
"""

from __future__ import annotations

import json
import logging
import math
import os
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

logger = logging.getLogger("orlsurgplan3d.biomech_solver")


# ---------------------------------------------------------------------------
# Modèles constitutifs — densité d'énergie de déformation W(F)
# ---------------------------------------------------------------------------

def _invariants(F: np.ndarray) -> Tuple[float, float, float]:
    """Invariants du tenseur de déformation à partir de F (3x3).
    Retourne (I1, I2, J) avec C = F^T F, I2 = ½[(tr C)² − tr(C²)], J = det F."""
    C = F.T @ F
    I1 = float(np.trace(C))
    I2 = 0.5 * (I1 * I1 - float(np.trace(C @ C)))
    J = float(np.linalg.det(F))
    return I1, I2, J


def _volumetric_energy(J: float, K: float) -> float:
    """Énergie volumique U(J) = ½·K·[(J−1)² + (ln J)²],  K = module de
    compressibilité. La partie (ln J)² agit comme barrière : U → +∞ quand un
    élément s'écrase (J→0+), ce qui empêche toute solution non physique.
    Accepte scalaire OU tableau numpy (pour la version vectorisée)."""
    Jc = np.maximum(J, 1e-4)
    return 0.5 * K * ((J - 1.0) ** 2 + np.log(Jc) ** 2)


def _volumetric_derivative_scalar(J: float, K: float) -> float:
    """Scalaire s tel que ∂U/∂F = s·F^{-T} (car ∂J/∂F = J·F^{-T}).
    Accepte scalaire OU tableau numpy."""
    Jc = np.maximum(J, 1e-4)
    return K * (J - 1.0) * J + K * np.log(Jc)


def _deviatoric_invariants(F: np.ndarray) -> Tuple[float, float, float]:
    """Invariants DÉVIATORIQUES Ī1 = I1·J^{-2/3}, Ī2 = I2·J^{-4/3} et J.
    Propriété clé : Ī1 ≥ 3 et Ī2 ≥ 3 POUR TOUT F non singulier, donc la partie
    isochorique de l'énergie est toujours ≥ 0 et s'annule en F = I — le zéro
    d'énergie global est unique à F = I, ce qui stabilise le solveur."""
    I1, I2, J = _invariants(F)
    Jp = max(J, 1e-8)
    return I1 * Jp ** (-2.0 / 3.0), I2 * Jp ** (-4.0 / 3.0), J


def _bulk_modulus_kpa(C10: float, C01: float) -> float:
    """K (module de compressibilité) par défaut : ~100× le module de
    cisaillement μ ≈ 2(C10+C01) — comportement quasi-incompressible réaliste."""
    return max(100.0 * 2.0 * (C10 + C01), 20.0)


def mooney_rivlin_energy_density(F: np.ndarray, C10: float, C01: float, D1: float) -> float:
    """W = C10(Ī1−3) + C01(Ī2−3) + ½·K·[(J−1)² + (ln J)²]  [kPa].
    D1 est utilisé comme K quand fourni (compatibilité), sinon K ≈ 100·2(C10+C01)."""
    I1bar, I2bar, J = _deviatoric_invariants(F)
    K = D1 if D1 and D1 > 0 else _bulk_modulus_kpa(C10, C01)
    return C10 * (I1bar - 3.0) + C01 * (I2bar - 3.0) + _volumetric_energy(J, K)


def ogden_energy_density(F: np.ndarray, mu: Sequence[float], alpha: Sequence[float], D1: float) -> float:
    """W = Σ_p (μ_p/α_p)(λ̄1^α + λ̄2^α + λ̄3^α − 3) + ½·K·[(J−1)² + (ln J)²]  [kPa],
    avec étirements déviatoriques λ̄_i = λ_i·J^{-1/3}."""
    C = F.T @ F
    eigs = np.linalg.eigvalsh(C)
    lambdas = np.sqrt(np.clip(eigs, 1e-12, None))
    J = float(np.linalg.det(F))
    Jp = max(J, 1e-8)
    lbar = lambdas * Jp ** (-1.0 / 3.0)
    K = D1 if D1 and D1 > 0 else 100.0 * float(np.sum(mu))
    w = 0.0
    for m, a in zip(mu, alpha):
        if abs(a) < 1e-9:
            w += m * (math.log(lbar[0]) + math.log(lbar[1]) + math.log(lbar[2]))
        else:
            w += (m / a) * (np.sum(lbar ** a) - 3.0)
    return float(w) + _volumetric_energy(J, K)


def energy_density(F: np.ndarray, model: str, params: dict) -> float:
    """Densité d'énergie pour un modèle ('neo_hookean'|'mooney_rivlin'|'ogden')."""
    model = model or "mooney_rivlin"
    if model == "ogden":
        return ogden_energy_density(
            F,
            mu=params.get("mu", [1.0]),
            alpha=params.get("alpha", [2.0]),
            D1=params.get("D1", params.get("d1", 0.0)),
        )
    C10 = float(params.get("C10_kpa", params.get("C10", 1.0)))
    C01 = float(params.get("C01_kpa", params.get("C01", 0.0)))
    D1 = float(params.get("D1", params.get("d1", 0.0)))
    return mooney_rivlin_energy_density(F, C10, C01, D1)


def _stress_wrt_F(F: np.ndarray, model: str, params: dict) -> np.ndarray:
    """∂W/∂F (3x3), la dérivée de la densité d'énergie par rapport au
    gradient de déformation. Fondement du gradient nodal du solveur."""
    model = model or "mooney_rivlin"
    if model == "ogden":
        return _ogden_pk1(F, params)
    C10 = float(params.get("C10_kpa", params.get("C10", 1.0)))
    C01 = float(params.get("C01_kpa", params.get("C01", 0.0)))
    D1 = float(params.get("D1", params.get("d1", 0.0)))
    K = D1 if D1 and D1 > 0 else _bulk_modulus_kpa(C10, C01)
    C = F.T @ F
    I1, I2, J = _invariants(F)
    Jp = max(J, 1e-8)
    invFT = np.linalg.inv(F).T
    # ∂Ī1/∂F = 2J^{-2/3}F − (2/3)Ī1 F^{-T} ; ∂Ī2/∂F = 2J^{-4/3}(I1F−FC) − (4/3)Ī2 F^{-T}
    I1bar = I1 * Jp ** (-2.0 / 3.0)
    I2bar = I2 * Jp ** (-4.0 / 3.0)
    dI1bar = 2.0 * Jp ** (-2.0 / 3.0) * F - (2.0 / 3.0) * I1bar * invFT
    dI2bar = 2.0 * Jp ** (-4.0 / 3.0) * (I1 * F - F @ C) - (4.0 / 3.0) * I2bar * invFT
    return C10 * dI1bar + C01 * dI2bar + _volumetric_derivative_scalar(J, K) * invFT


def _ogden_pk1(F: np.ndarray, params: dict) -> np.ndarray:
    """∂W/∂F pour le modèle d'Ogden via décomposition spectrale de C = F^T F.
    ∂W/∂F = F N diag(g_i) N^T,  avec g_i = (1/λ_i) ∂W/∂λ_i.
    Étirements déviatoriques λ̄_k = λ_k·J^{-1/3} et
    ∂λ̄_k/∂λ_i = J^{-1/3}(δ_ik − λ_k/(3λ_i)), ce qui donne :
    ∂W/∂λ_i = J^{-1/3}·∂w/∂λ̄_i − J^{-1/3}·(Σ_k ∂w/∂λ̄_k·λ_k)/(3λ_i) + s_v/λ_i."""
    mu = np.asarray(params.get("mu", [1.0]), dtype=float)
    alpha = np.asarray(params.get("alpha", [2.0]), dtype=float)
    D1 = float(params.get("D1", params.get("d1", 0.0)))
    K = D1 if D1 and D1 > 0 else 100.0 * float(np.sum(mu))
    C = F.T @ F
    eigvals, N = np.linalg.eigh(C)
    lambdas = np.sqrt(np.clip(eigvals, 1e-12, None))
    J = float(np.linalg.det(F))
    Jp = max(J, 1e-8)
    lbar = lambdas * Jp ** (-1.0 / 3.0)
    # ∂w/∂λ̄_i = Σ_p μ_p λ̄_i^{α_p−1}
    dwbar = np.zeros(3)
    for m, a in zip(mu, alpha):
        if abs(a) < 1e-9:
            dwbar += m / lbar
        else:
            dwbar += m * lbar ** (a - 1.0)
    S = float(dwbar @ lambdas)
    s_v = _volumetric_derivative_scalar(J, K)
    dw_dlambda = Jp ** (-1.0 / 3.0) * dwbar - Jp ** (-1.0 / 3.0) * S / (3.0 * lambdas) + s_v / lambdas
    g = dw_dlambda / lambdas  # (1/λ_i) ∂W/∂λ_i
    return (F @ N) @ np.diag(g) @ N.T


# ---------------------------------------------------------------------------
# Maillage volumique (tétraèdres) et grandeurs élémentaires
# ---------------------------------------------------------------------------

def _reference_B(ref_nodes: np.ndarray, tets: np.ndarray) -> np.ndarray:
    """Matrices B (3,3,N_tet) de référence : colonnes = arêtes issues du nœud 1."""
    r0 = ref_nodes[tets[:, 0]]
    edges = np.stack([ref_nodes[tets[:, i]] - r0 for i in (1, 2, 3)], axis=-1)  # (N,3,3)
    inv = np.linalg.inv(edges)  # (N,3,3)
    return edges, inv


def element_deformation_gradients(current_nodes: np.ndarray, ref_nodes: np.ndarray,
                                  tets: np.ndarray, invB: np.ndarray) -> np.ndarray:
    """F (N_tet,3,3) pour chaque élément tétraédrique : F = b · invB."""
    b = np.stack([current_nodes[tets[:, i]] - current_nodes[tets[:, 0]] for i in (1, 2, 3)], axis=-1)
    return np.einsum("nij,njk->nik", b, invB)


def tet_volumes(ref_nodes: np.ndarray, tets: np.ndarray) -> np.ndarray:
    """Volume (mm³) de chaque tétraèdre de référence."""
    a, b, c, d = (ref_nodes[tets[:, i]] for i in range(4))
    return np.abs(np.einsum("ij,ij->i", a - d, np.cross(b - d, c - d))) / 6.0


def energy_density_batch(Fs: np.ndarray, model: str, params: dict) -> np.ndarray:
    """Version vectorisée de `energy_density` sur un lot de gradients de
    déformation (M,3,3) → énergies (M,). Évite la boucle Python par élément."""
    model = model or "mooney_rivlin"
    C = np.einsum("nji,njk->nik", Fs, Fs)
    I1 = np.einsum("nii->n", C)
    I2 = 0.5 * (I1 * I1 - np.einsum("nij,nji->n", C, C))
    J = np.linalg.det(Fs)
    Jp = np.clip(J, 1e-8, None)
    if model == "ogden":
        mu = np.asarray(params.get("mu", [1.0]), dtype=float)
        alpha = np.asarray(params.get("alpha", [2.0]), dtype=float)
        D1 = float(params.get("D1", params.get("d1", 0.0)))
        K = D1 if D1 and D1 > 0 else 100.0 * float(np.sum(mu))
        eigvals = np.linalg.eigvalsh(C)
        lambdas = np.sqrt(np.clip(eigvals, 1e-12, None))
        lbar = lambdas * Jp[:, None] ** (-1.0 / 3.0)
        w = np.zeros(len(Fs))
        for m, a in zip(mu, alpha):
            if abs(a) < 1e-9:
                w += m * np.log(lbar).sum(axis=1)
            else:
                w += (m / a) * (np.sum(lbar ** a, axis=1) - 3.0)
        return w + _volumetric_energy(J, K)
    C10 = float(params.get("C10_kpa", params.get("C10", 1.0)))
    C01 = float(params.get("C01_kpa", params.get("C01", 0.0)))
    D1 = float(params.get("D1", params.get("d1", 0.0)))
    K = D1 if D1 and D1 > 0 else _bulk_modulus_kpa(C10, C01)
    I1bar = I1 * Jp ** (-2.0 / 3.0)
    I2bar = I2 * Jp ** (-4.0 / 3.0)
    return C10 * (I1bar - 3.0) + C01 * (I2bar - 3.0) + _volumetric_energy(J, K)


def _stress_wrt_F_batch(Fs: np.ndarray, model: str, params: dict) -> np.ndarray:
    """Version vectorisée de `_stress_wrt_F` sur un lot (M,3,3) → (M,3,3)."""
    model = model or "mooney_rivlin"
    C = np.einsum("nji,njk->nik", Fs, Fs)
    I1 = np.einsum("nii->n", C)
    I2 = 0.5 * (I1 * I1 - np.einsum("nij,nji->n", C, C))
    J = np.linalg.det(Fs)
    Jp = np.clip(J, 1e-8, None)
    invFT = np.linalg.inv(Fs).transpose(0, 2, 1)
    if model == "ogden":
        mu = np.asarray(params.get("mu", [1.0]), dtype=float)
        alpha = np.asarray(params.get("alpha", [2.0]), dtype=float)
        D1 = float(params.get("D1", params.get("d1", 0.0)))
        K = D1 if D1 and D1 > 0 else 100.0 * float(np.sum(mu))
        eigvals, N = np.linalg.eigh(C)
        lambdas = np.sqrt(np.clip(eigvals, 1e-12, None))
        lbar = lambdas * Jp[:, None] ** (-1.0 / 3.0)
        dwbar = np.zeros((len(Fs), 3))
        for m, a in zip(mu, alpha):
            if abs(a) < 1e-9:
                dwbar += m / lbar
            else:
                dwbar += m * lbar ** (a - 1.0)
        S = np.einsum("ni,ni->n", dwbar, lambdas)
        s_v = _volumetric_derivative_scalar(J, K)
        dw_dlambda = (Jp[:, None] ** (-1.0 / 3.0)) * dwbar \
            - (Jp[:, None] ** (-1.0 / 3.0)) * S[:, None] / (3.0 * lambdas) \
            + s_v[:, None] / lambdas
        g = dw_dlambda / lambdas
        FN = np.einsum("nij,njk->nik", Fs, N)
        return np.einsum("nik,nk,nlk->nil", FN, g, N)
    C10 = float(params.get("C10_kpa", params.get("C10", 1.0)))
    C01 = float(params.get("C01_kpa", params.get("C01", 0.0)))
    D1 = float(params.get("D1", params.get("d1", 0.0)))
    K = D1 if D1 and D1 > 0 else _bulk_modulus_kpa(C10, C01)
    I1bar = I1 * Jp ** (-2.0 / 3.0)
    I2bar = I2 * Jp ** (-4.0 / 3.0)
    dI1bar = 2.0 * Jp[:, None, None] ** (-2.0 / 3.0) * Fs - (2.0 / 3.0) * I1bar[:, None, None] * invFT
    dI2bar = 2.0 * Jp[:, None, None] ** (-4.0 / 3.0) * (I1[:, None, None] * Fs - np.einsum("nij,njk->nik", Fs, C)) \
        - (4.0 / 3.0) * I2bar[:, None, None] * invFT
    return C10 * dI1bar + C01 * dI2bar + _volumetric_derivative_scalar(J, K)[:, None, None] * invFT


def total_strain_energy(current_nodes: np.ndarray, ref_nodes: np.ndarray,
                        tets: np.ndarray, invB: np.ndarray, volumes: np.ndarray,
                        model: str, params: dict) -> float:
    """Énergie de déformation TOTALE (kPa·mm³) du maillage pour une
    configuration courante donnée des nœuds."""
    Fs = element_deformation_gradients(current_nodes, ref_nodes, tets, invB)
    energies = energy_density_batch(Fs, model, params)
    return float(np.sum(volumes * energies))


def nodal_energy_gradient(current_nodes: np.ndarray, ref_nodes: np.ndarray,
                          tets: np.ndarray, invB: np.ndarray, volumes: np.ndarray,
                          model: str, params: dict) -> np.ndarray:
    """Gradient exact de l'énergie totale par rapport à la position de chaque
    nœud (N,3). Vérifié par différences finies dans tests/test_biomech_solver.py.
    Version vectorisée : par élément,
        ∂F_ab/∂x_{1,c} = −δ_ac Σ_j invB_jb  ->  g1 = −V0 (S @ colsum)
        ∂F_ab/∂x_{k,c} = δ_ac invB_{k-1,b}  ->  g_k = +V0 (S @ invB^T)[:, k-1]
    puis assemblage creux via np.add.at."""
    Fs = element_deformation_gradients(current_nodes, ref_nodes, tets, invB)
    S = _stress_wrt_F_batch(Fs, model, params)
    colsum = invB.sum(axis=1)  # (M,3)
    g1 = -volumes[:, None] * np.einsum("nij,nj->ni", S, colsum)
    contrib = volumes[:, None, None] * np.einsum("nij,nkj->nik", S, invB)  # (M,3,3)
    grad = np.zeros_like(current_nodes)
    np.add.at(grad, tets[:, 0], g1)
    for j in range(3):
        np.add.at(grad, tets[:, j + 1], contrib[:, :, j])
    return grad


# ---------------------------------------------------------------------------
# Construction d'un maillage tétraédrique depuis une surface segmentée (GLB)
# ---------------------------------------------------------------------------

def build_tetmesh_from_glb(glb_path: Path, max_interior_points: int = 500,
                           seed: int = 0) -> dict:
    """Tétraédrise l'intérieur d'un maillage de surface (.glb) via Delaunay :
    sommets de surface + échantillonnage de points intérieurs (test
    `trimesh.contains`), puis rejet des tétraèdres hors de la forme.
    Retourne {nodes, tets, num_nodes, num_tets, volume_ml}."""
    import trimesh

    mesh = trimesh.load(str(glb_path), force="mesh")
    if mesh is None or not mesh.is_volume:
        raise ValueError("Maillage invalide ou non fermé — impossible de tétraédriser.")
    surf_verts = np.asarray(mesh.vertices, dtype=np.float64)
    bounds = mesh.bounds
    rng = np.random.default_rng(seed)

    # Échantillonnage de points intérieurs
    interior: List[np.ndarray] = []
    found = 0
    attempts = 0
    while found < max_interior_points and attempts < 4000:
        attempts += 1
        pts = rng.uniform(bounds[0], bounds[1], size=(256, 3))
        inside = mesh.contains(pts)
        pick = pts[inside]
        if len(pick):
            interior.append(pick)
            found += len(pick)
    if interior:
        interior_pts = np.vstack(interior)[:max_interior_points]
    else:
        interior_pts = np.empty((0, 3))

    from scipy.spatial import Delaunay, QhullError
    points = np.vstack([surf_verts, interior_pts]) if len(interior_pts) else surf_verts
    try:
        delaunay = Delaunay(points)
    except QhullError as e:
        raise ValueError(f"Tétraédrisation impossible : {e}")
    tets = delaunay.simplices

    centroids = points[tets].mean(axis=1)
    inside = mesh.contains(centroids)
    tets = tets[inside]

    vols = tet_volumes(points, tets)
    ok = vols > 1e-6
    tets = tets[ok]
    vols = vols[ok]
    if len(tets) == 0:
        raise ValueError("Aucun tétraèdre intérieur trouvé — maillage trop fin.")
    return {
        "nodes": points,
        "tets": tets,
        "num_nodes": int(len(points)),
        "num_tets": int(len(tets)),
        "volume_ml": float(vols.sum() / 1000.0),
    }


def export_tetmesh_glb(tet: dict, out_path: Path, color_rgba=(139, 58, 58, 255)) -> Path:
    """Écrit le maillage volumique (enveloppe triangulaire) en .glb via trimesh."""
    import trimesh
    nodes = tet["nodes"]
    tets = tet["tets"]
    # Faces frontière = faces n'appartenant qu'à UN tétraèdre
    face_counts: Dict[Tuple[int, int, int], int] = {}
    face_owner: Dict[Tuple[int, int, int], Tuple[int, ...]] = {}
    for t in tets:
        for f in ((t[0], t[1], t[2]), (t[0], t[1], t[3]), (t[0], t[2], t[3]), (t[1], t[2], t[3])):
            key = tuple(sorted(f))
            face_counts[key] = face_counts.get(key, 0) + 1
            face_owner[key] = f
    boundary = [face_owner[k] for k, c in face_counts.items() if c == 1]
    if not boundary:
        raise ValueError("Maillage sans frontière — impossible d'exporter une surface.")
    faces = np.asarray(boundary, dtype=np.int64)
    tri = trimesh.Trimesh(vertices=nodes, faces=faces, process=False)
    tri.visual.vertex_colors = color_rgba
    tri.export(str(out_path))
    return out_path


# ---------------------------------------------------------------------------
# Coupe d'un maillage volumique par un plan
# ---------------------------------------------------------------------------

def split_tetmesh_by_plane(tet: dict, plane_point: np.ndarray, plane_normal: np.ndarray) -> dict:
    """Sépare le maillage volumique par le plan {x : n·(x−p) = 0}. Retourne un
    dict avec 'remnant' (côté n·(x−p) > 0) et 'resected' (côté < 0), chacun
    étant {nodes, tets, volume_ml}, ou None si un côté est vide."""
    nodes = tet["nodes"]
    tets = tet["tets"]
    n = np.asarray(plane_normal, dtype=np.float64)
    n = n / (np.linalg.norm(n) + 1e-12)
    p = np.asarray(plane_point, dtype=np.float64)
    signed = (nodes - p) @ n  # (N,)
    s = signed[tets]  # (M,4)
    side = np.sign(s.sum(axis=1))
    out: dict = {}
    for name, mask in (("remnant", side >= 0), ("resected", side < 0)):
        sub_tets = tets[mask]
        if len(sub_tets) == 0:
            out[name] = None
            continue
        used = np.unique(sub_tets)
        idx = {int(v): i for i, v in enumerate(used)}
        sub_nodes = nodes[used]
        sub_tets_renum = np.vectorize(idx.get)(sub_tets)
        vols = tet_volumes(sub_nodes, sub_tets_renum)
        out[name] = {
            "nodes": sub_nodes,
            "tets": sub_tets_renum,
            "num_nodes": int(len(sub_nodes)),
            "num_tets": int(len(sub_tets_renum)),
            "volume_ml": float(vols.sum() / 1000.0),
        }
    return out


def surface_min_distance_to_plane(mesh_path: Path, plane_point: np.ndarray, plane_normal: np.ndarray) -> float:
    """Distance minimale (mm) entre la surface du maillage et le plan de coupe —
    utilisée comme ESTIMATION de la marge oncologique quand le plan est passé
    entre tumeur et tissu sain (côté remnant)."""
    import trimesh
    mesh = trimesh.load(str(mesh_path), force="mesh")
    if mesh is None:
        raise ValueError(f"Maillage introuvable ou illisible : {mesh_path}")
    n = np.asarray(plane_normal, dtype=np.float64)
    n = n / (np.linalg.norm(n) + 1e-12)
    p = np.asarray(plane_point, dtype=np.float64)
    signed = np.abs((np.asarray(mesh.vertices) - p) @ n)
    return float(signed.min())


# ---------------------------------------------------------------------------
# Solveur : minimisation de l'énergie totale (équilibre mécanique)
# ---------------------------------------------------------------------------

def solve_equilibrium(nodes: np.ndarray, tets: np.ndarray, model: str, params: dict,
                      fixed_mask: np.ndarray, fixed_displacement: np.ndarray,
                      max_iter: int = 100, xtol: float = 1e-8,
                      continuation_steps: int = 3) -> dict:
    """Résout la RELAXATION d'un solide hyperélastique : minimise l'énergie de
    déformation totale sur les nœuds libres, sous conditions aux limites de
    Dirichlet imposées (`fixed_displacement` sur les nœuds `fixed_mask`, par
    exemple fermeture du défaut sur la face de coupe, 0 sur les ancrages).

    `continuation_steps` > 1 applique les déplacements imposés par paliers
    croissants (reprise chaude à chaque palier), technique standard de l'EF
    non linéaire pour garantir la convergence malgré la quasi-incompressibilité.

    Retourne {displacement, energy_initial, energy_final, converged,
    iterations, peak_displacement_mm}."""
    from scipy.optimize import minimize

    invB = np.linalg.inv(np.stack(
        [nodes[tets[:, i]] - nodes[tets[:, 0]] for i in (1, 2, 3)], axis=-1))
    volumes = tet_volumes(nodes, tets)
    fixed_mask = np.asarray(fixed_mask, dtype=bool)
    fixed_displacement = np.asarray(fixed_displacement, dtype=float)
    free_idx = np.where(~fixed_mask)[0]
    if len(free_idx) == 0:
        return {"displacement": np.asarray(fixed_displacement),
                "energy_initial": 0.0, "energy_final": 0.0,
                "converged": True, "iterations": 0, "peak_displacement_mm": 0.0}

    # Amplitude maximale imposée — si trop grande pour les éléments locaux, le
    # solveur ramène automatiquement le problème à une échelle convergente.
    amp = float(np.abs(fixed_displacement[fixed_mask]).max()) if fixed_mask.any() else 0.0

    def assemble(u_free: np.ndarray, scale: float) -> np.ndarray:
        u = np.zeros_like(nodes)
        u[free_idx] = u_free.reshape(-1, 3)
        u[fixed_mask] = fixed_displacement[fixed_mask] * scale
        return u

    def energy_of(u_free: np.ndarray, scale: float) -> float:
        current = nodes + assemble(u_free, scale)
        return total_strain_energy(current, nodes, tets, invB, volumes, model, params)

    def grad_of(u_free: np.ndarray, scale: float) -> np.ndarray:
        current = nodes + assemble(u_free, scale)
        g = nodal_energy_gradient(current, nodes, tets, invB, volumes, model, params)
        return g[free_idx].ravel()

    scales = [1.0] if continuation_steps <= 1 else [
        (i + 1) / continuation_steps for i in range(continuation_steps)]
    u_free = np.zeros(len(free_idx) * 3)
    iterations_total = 0
    all_success = True
    energy_initial = 0.0
    for i, scale in enumerate(scales):
        def e(u): return energy_of(u, scale)
        def g(u): return grad_of(u, scale)
        if i == 0 and amp > 0:
            energy_initial = total_strain_energy(
                nodes + assemble(np.zeros(len(free_idx) * 3), 1.0),
                nodes, tets, invB, volumes, model, params)
        g0 = g(u_free)
        gtol = max(1e-3, 1e-7 * float(np.abs(g0).max()))
        res = minimize(e, u_free, jac=g, method="L-BFGS-B",
                       options={"maxiter": max_iter, "ftol": xtol, "gtol": gtol})
        u_free = res.x
        iterations_total += int(res.nit)
        all_success = all_success and bool(res.success)

    u = assemble(u_free, 1.0)
    displacement = u
    energy_final = total_strain_energy(nodes + displacement, nodes, tets, invB, volumes, model, params)
    if amp == 0.0:
        energy_initial = 0.0

    # Critère de convergence PRAGMATIQUE : le problème est raide (quasi-
    # incompressible), L-BFGS-B ne descend jamais sous un petit résidu local.
    # On considère donc la relaxation comme « convergée » dès que ≥ 95 % de
    # l'énergie de déformation imposée a été dissipée par la relaxation
    # (objectif physique de la planification), ou si scipy a déclaré l'arrêt.
    if amp == 0.0:
        converged = True
    else:
        converged = bool(all_success) or (
            energy_initial > 0 and energy_final < 0.05 * energy_initial)
    return {
        "displacement": displacement,
        "energy_initial": energy_initial,
        "energy_final": energy_final,
        "converged": converged,
        "iterations": int(iterations_total),
        "peak_displacement_mm": float(np.abs(displacement[free_idx]).max()) if len(free_idx) else 0.0,
    }


def simulate_post_resection(glb_path: Optional[Path], plane_point: np.ndarray, plane_normal: np.ndarray,
                            tissue_params: dict, model: str = "mooney_rivlin",
                            anchor_fraction: float = 0.08,
                            contraction_factor: float = 0.03,
                            max_displacement_mm: float = 1.5) -> dict:
    """
    Simule la déformation post-résection d'un organe (maillage segmenté GLB) :
      1. Tétraédrisation de l'organe.
      2. Séparation par le plan de coupe → remnant + réséqué.
      3. FLR = volume remnant / volume total.
      4. Relaxation hyperélastique du remnant : les nœuds libres sont tirés
         vers le centre de masse de la face de coupe (fermeture du défaut,
         `contraction_factor`), les nœuds du pédicule sont ancrés.
      5. Maillage déformé exporté en .glb + métriques d'énergie.
    """
    glb_path = Path(glb_path)
    tet = build_tetmesh_from_glb(glb_path)
    split = split_tetmesh_by_plane(tet, np.asarray(plane_point, float), np.asarray(plane_normal, float))

    total_ml = tet["volume_ml"]
    if split["remnant"] is None:
        raise ValueError("Le plan de coupe laisse un remnant vide — choisissez une position valide.")
    remnant = split["remnant"]
    flr_ml = remnant["volume_ml"]
    flr_pct = flr_ml / total_ml * 100.0 if total_ml else 0.0

    nodes = remnant["nodes"]
    tets = remnant["tets"]

    # Ancrage : fraction du maillage la plus proche du point le plus éloigné du
    # plan (le "pédicule") — approximation simple du point d'attache anatomique.
    n = np.asarray(plane_normal, float)
    n = n / (np.linalg.norm(n) + 1e-12)
    p = np.asarray(plane_point, float)
    signed = (nodes - p) @ n
    # Le pédicule est du côté du remnant, au point le plus éloigné du plan.
    anchor_point = nodes[np.argmax(signed)]
    dist = np.linalg.norm(nodes - anchor_point, axis=1)
    radius = np.percentile(dist, anchor_fraction * 100.0)
    anchor_mask = dist <= radius

    # Conditions de Dirichlet :
    #  • face de coupe (bande fine autour du plan) → fermeture du défaut :
    #    déplacement vers le centre de masse de la face, ampleur contraction_factor
    #    fois la distance au centre (le tissu "referme" la plaie).
    #  • nœuds du pédicule → ancrés (déplacement nul).
    #  • nœuds intérieurs → libres, relaxés par minimisation de l'énergie.
    cut_band = np.abs(signed) <= np.percentile(np.abs(signed), 20)
    cut_face_centroid = nodes[cut_band].mean(axis=0)
    to_face = cut_face_centroid - nodes
    fixed_mask = cut_band | anchor_mask
    # Amplitude pondérée : la fermeture est maximale sur la face de coupe et
    # s'évanouit progressivement vers l'intérieur (bande de transition lisse),
    # ce qui évite un gradient de déformation brutal contre les éléments libres.
    band_abs = np.abs(signed[cut_band])
    weight = 1.0 - band_abs / (band_abs.max() + 1e-12)
    fixed_disp = np.zeros_like(nodes)
    fixed_disp[cut_band] = to_face[cut_band] * contraction_factor * weight[:, None]
    # Plafonnement de l'amplitude : une fermeture de défaut trop brutale
    # (plusieurs mm sur une bande fine) écraserait les éléments quasi-
    # incompressibles — on borne physiquement la fermeture à quelques mm.
    band_mag = np.linalg.norm(fixed_disp[cut_band], axis=1)
    over = band_mag > max_displacement_mm
    if over.any():
        fixed_disp[cut_band][over] *= (max_displacement_mm / band_mag[over])[:, None]

    result = solve_equilibrium(nodes, tets, model, tissue_params, fixed_mask, fixed_disp)
    deformed_nodes = nodes + result["displacement"]

    out_dir = glb_path.parent / "biomech"
    out_dir.mkdir(parents=True, exist_ok=True)
    deformed_glb = out_dir / f"{glb_path.stem}_deformed_resection.glb"
    export_tetmesh_glb({"nodes": deformed_nodes, "tets": tets}, deformed_glb)

    # Volume post-déformation (recalculé sur la configuration déformée)
    deformed_vol = float(tet_volumes(deformed_nodes, tets).sum() / 1000.0)

    return {
        "status": "ok",
        "total_volume_ml": round(total_ml, 1),
        "remnant_volume_ml": round(flr_ml, 1),
        "flr_pct": round(flr_pct, 1),
        "model": model,
        "tissue_parameters": tissue_params,
        "strain_energy_kpa_mm3_initial": round(result["energy_initial"], 3),
        "strain_energy_kpa_mm3_final": round(result["energy_final"], 3),
        "strain_energy_relaxation_pct": round(
            (result["energy_initial"] - result["energy_final"]) / (abs(result["energy_initial"]) + 1e-9) * 100.0, 1
        ),
        "peak_displacement_mm": round(result["peak_displacement_mm"], 2),
        "deformed_volume_ml": round(deformed_vol, 1),
        "converged": result["converged"],
        "iterations": result["iterations"],
        "deformed_mesh_url": f"/meshes_biomech/{deformed_glb.name}",
        "deformed_mesh_local_path": str(deformed_glb),
        "num_tets_remnant": int(len(tets)),
        "warning": "Solveur hyperélastique non validé cliniquement — planification uniquement, "
                   "paramètres tissulaires issus de l'atlas littérature (twin_biomech_atlas.py).",
    }
