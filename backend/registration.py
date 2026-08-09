# -*- coding: utf-8 -*-
"""
registration.py — Recalage non-rigide réel : ICP (rigide) + FFD B-spline
cubique (non-rigide), pour aligner un nuage de points peropératoire (ex.
échographie trackée, stéréovision AR) sur le maillage préopératoire du jumeau
numérique. Remplace le stub honnête de
backend/biomechanics_engine.py:/elastic-registration, qui ne calculait rien
(voir son avertissement en tête de fichier — comptait juste les points reçus).

Deux étapes, dans l'ordre (standard en recalage médical, ex. Rueckert et al.
1999, "Nonrigid Registration Using Free-Form Deformations") :
  1. ICP rigide (Besl & McKay, 1992) — corrige la position/orientation globale.
  2. FFD (Free-Form Deformation) par B-spline cubique uniforme sur une grille
     de points de contrôle — corrige la déformation résiduelle NON rigide
     (organe mou déformé par la respiration/l'instrument), que l'ICP seul ne
     peut pas expliquer.

⚠️ AVERTISSEMENTS HONNÊTES :
    - Jamais validé sur un vrai flux peropératoire ni sur fantôme dans cet
      environnement (pas de matériel de tracking/AR disponible ici) — voir
      "Validation sur fantôme (TRE < 3mm)" de la feuille de route, non fait.
      Testé uniquement sur des nuages de points synthétiques à déformation
      connue (voir tests/test_registration.py).
    - La régularisation de la déformation FFD ici est un lissage laplacien
      simple de la grille de contrôle, PAS l'énergie de flexion (bending
      energy) analytique de la formulation complète de Rueckert et al. — plus
      simple à implémenter et à vérifier, mais moins physiquement motivée. À
      réévaluer si ce comportement s'avère insuffisant en pratique.
    - Recalage géométrique PUR : ne connaît rien des propriétés tissulaires du
      patient (contrairement à twin_solver.py, qui lui les utilise).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

import numpy as np
from scipy.spatial import cKDTree


# ---------------------------------------------------------------------------
# ICP rigide (Besl & McKay 1992, alignement optimal par SVD / algorithme de Kabsch)
# ---------------------------------------------------------------------------

def _best_fit_rigid_transform(source: np.ndarray, target: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Rotation R (3x3) + translation t (3,) minimisant sum ||R@source_i + t -
    target_i||^2, pour des points DÉJÀ APPARIÉS (même ordre, même longueur).
    Algorithme de Kabsch, avec correction de réflexion (cas dégénéré du SVD
    où le déterminant de R sortirait négatif — une réflexion, pas une
    rotation)."""
    src_centroid = source.mean(axis=0)
    tgt_centroid = target.mean(axis=0)
    src_c = source - src_centroid
    tgt_c = target - tgt_centroid

    H = src_c.T @ tgt_c
    U, _s, Vt = np.linalg.svd(H)
    R = Vt.T @ U.T
    if np.linalg.det(R) < 0:
        Vt = Vt.copy()
        Vt[-1, :] *= -1
        R = Vt.T @ U.T

    t = tgt_centroid - R @ src_centroid
    return R, t


@dataclass
class IcpResult:
    rotation: np.ndarray         # (3,3)
    translation: np.ndarray      # (3,)
    aligned_source: np.ndarray   # (N,3)
    rms_history: List[float]
    iterations: int
    converged: bool


def rigid_icp(source: np.ndarray, target: np.ndarray, max_iterations: int = 50,
              tolerance: float = 1e-6) -> IcpResult:
    """ICP point-à-point standard : à chaque itération, associe chaque point
    de `source` (déjà transformé par l'itération précédente) à son plus
    proche voisin dans `target` (cKDTree), calcule la transformation rigide
    optimale pour cette correspondance (Kabsch), l'applique, répète jusqu'à
    convergence (variation du RMS < `tolerance`) ou `max_iterations`.

    `source`/`target` : (N,3)/(M,3) — PAS nécessairement de même taille ni
    déjà appariés : c'est justement ce que l'ICP résout itérativement.
    """
    if len(source) == 0 or len(target) == 0:
        raise ValueError("source et target doivent contenir au moins un point.")

    tree = cKDTree(target)
    current = source.copy()
    R_total = np.eye(3)
    t_total = np.zeros(3)
    rms_history: List[float] = []
    converged = False
    iterations = 0

    for iterations in range(1, max_iterations + 1):
        _distances, idx = tree.query(current)
        matched_target = target[idx]

        R_step, t_step = _best_fit_rigid_transform(current, matched_target)
        current = (R_step @ current.T).T + t_step
        R_total = R_step @ R_total
        t_total = R_step @ t_total + t_step

        rms = float(np.sqrt(np.mean(np.sum((current - matched_target) ** 2, axis=1))))
        rms_history.append(rms)
        if len(rms_history) > 1 and abs(rms_history[-2] - rms_history[-1]) < tolerance:
            converged = True
            break

    return IcpResult(rotation=R_total, translation=t_total, aligned_source=current,
                      rms_history=rms_history, iterations=iterations, converged=converged)


# ---------------------------------------------------------------------------
# FFD non-rigide par B-spline cubique uniforme
# ---------------------------------------------------------------------------

def _cubic_bspline_weights(t: np.ndarray) -> np.ndarray:
    """4 poids de B-spline cubique uniforme pour un paramètre local t dans
    [0,1) (formule standard — voir ex. Lee, Wolberg & Shin 1996, "Scattered
    Data Interpolation with Multilevel B-Splines"). Retourne (N,4), colonnes
    = poids B0..B3. Partition de l'unité : chaque ligne somme à 1 (vérifié
    dans tests/test_registration.py)."""
    t = np.asarray(t, dtype=np.float64)
    t2 = t * t
    t3 = t2 * t
    b0 = (1 - t) ** 3 / 6.0
    b1 = (3 * t3 - 6 * t2 + 4) / 6.0
    b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6.0
    b3 = t3 / 6.0
    return np.stack([b0, b1, b2, b3], axis=-1)


@dataclass
class FfdGrid:
    """Grille de points de contrôle FFD. `displacement[i,j,k]` = déplacement
    (mm) du point de contrôle (i,j,k) ; position déformée d'un point p =
    p + interpolation B-spline tensorielle du déplacement des 4x4x4 points de
    contrôle voisins."""
    origin: np.ndarray          # (3,) coin de la grille (mm)
    spacing: np.ndarray         # (3,) taille de maille (mm)
    displacement: np.ndarray    # (nx, ny, nz, 3)

    def _local_coords(self, points: np.ndarray):
        rel = (points - self.origin) / self.spacing
        base_idx = np.floor(rel).astype(int) - 1  # indice du 1er des 4 points de contrôle (a=0)
        local_t = rel - np.floor(rel)
        return base_idx, local_t

    def deform_points(self, points: np.ndarray) -> np.ndarray:
        """Position déformée = position + interpolation B-spline tensorielle
        du déplacement des points de contrôle voisins."""
        base_idx, local_t = self._local_coords(points)
        wx = _cubic_bspline_weights(local_t[:, 0])
        wy = _cubic_bspline_weights(local_t[:, 1])
        wz = _cubic_bspline_weights(local_t[:, 2])

        nx, ny, nz, _ = self.displacement.shape
        out = np.zeros_like(points, dtype=np.float64)
        for a in range(4):
            ix = np.clip(base_idx[:, 0] + a, 0, nx - 1)
            for b in range(4):
                iy = np.clip(base_idx[:, 1] + b, 0, ny - 1)
                w_ab = wx[:, a] * wy[:, b]
                for c in range(4):
                    iz = np.clip(base_idx[:, 2] + c, 0, nz - 1)
                    w = (w_ab * wz[:, c])[:, None]
                    out += w * self.displacement[ix, iy, iz]
        return points + out

    def splat_residuals(self, points: np.ndarray, residuals: np.ndarray) -> None:
        """Répartit un déplacement résiduel demandé en chaque point sur les
        points de contrôle voisins, pondéré par les mêmes poids B-spline que
        `deform_points` (cohérence lecture/écriture), MOYENNÉ par le poids
        total reçu à chaque point de contrôle — même principe que
        twin_solver.solve() (moyenne de type Jacobi, pas une application
        séquentielle qui diverge sur une grille fortement connectée)."""
        base_idx, local_t = self._local_coords(points)
        wx = _cubic_bspline_weights(local_t[:, 0])
        wy = _cubic_bspline_weights(local_t[:, 1])
        wz = _cubic_bspline_weights(local_t[:, 2])
        nx, ny, nz, _ = self.displacement.shape

        accum = np.zeros_like(self.displacement)
        weight_sum = np.zeros((nx, ny, nz))
        for a in range(4):
            ix = np.clip(base_idx[:, 0] + a, 0, nx - 1)
            for b in range(4):
                iy = np.clip(base_idx[:, 1] + b, 0, ny - 1)
                w_ab = wx[:, a] * wy[:, b]
                for c in range(4):
                    iz = np.clip(base_idx[:, 2] + c, 0, nz - 1)
                    w = w_ab * wz[:, c]
                    np.add.at(accum, (ix, iy, iz), w[:, None] * residuals)
                    np.add.at(weight_sum, (ix, iy, iz), w)

        touched = weight_sum > 1e-9
        self.displacement[touched] += accum[touched] / weight_sum[touched, None]


def _smooth_grid(grid: np.ndarray, factor: float = 0.3) -> np.ndarray:
    """Lissage laplacien léger de la grille de contrôle (régularisation
    simple — voir avertissement en tête de module) : chaque point de
    contrôle est tiré vers la moyenne de ses 6 voisins directs, d'une
    fraction `factor`. Pas de rebouclage aux bords (les points de bord
    gardent leur propre valeur comme "voisin" manquant)."""
    out = grid.copy()
    for axis in range(3):
        neighbor_prev = np.roll(grid, 1, axis=axis)
        neighbor_next = np.roll(grid, -1, axis=axis)
        idx0 = [slice(None)] * 4
        idxN = [slice(None)] * 4
        idx0[axis] = 0
        idxN[axis] = -1
        neighbor_prev[tuple(idx0)] = grid[tuple(idx0)]
        neighbor_next[tuple(idxN)] = grid[tuple(idxN)]
        out = out + factor / 3.0 * ((neighbor_prev + neighbor_next) / 2.0 - grid)
    return out


@dataclass
class FfdResult:
    grid: FfdGrid
    deformed_source: np.ndarray
    rms_history: List[float]
    iterations: int


def bspline_ffd_register(source: np.ndarray, target: np.ndarray, grid_spacing_mm: float,
                          iterations: int = 15, smoothing: float = 0.3) -> FfdResult:
    """Affine un alignement (déjà rigide — voir `rigid_icp`, à appeler avant)
    par une déformation non-rigide locale. À chaque itération : ré-associe
    chaque point source déformé à son plus proche voisin cible (cKDTree),
    distribue le déplacement résiduel demandé sur la grille de contrôle
    (`FfdGrid.splat_residuals`), lisse légèrement la grille (régularisation),
    puis ré-évalue les positions déformées.
    """
    if len(source) == 0 or len(target) == 0:
        raise ValueError("source et target doivent contenir au moins un point.")
    if grid_spacing_mm <= 0:
        raise ValueError("grid_spacing_mm doit être positif.")

    bbox_min = np.minimum(source.min(axis=0), target.min(axis=0)) - 2 * grid_spacing_mm
    bbox_max = np.maximum(source.max(axis=0), target.max(axis=0)) + 2 * grid_spacing_mm
    dims = np.maximum(np.ceil((bbox_max - bbox_min) / grid_spacing_mm).astype(int) + 3, 5)

    grid = FfdGrid(origin=bbox_min, spacing=np.full(3, grid_spacing_mm),
                   displacement=np.zeros((*dims, 3)))

    tree = cKDTree(target)
    rms_history: List[float] = []
    deformed = source.copy()

    for _ in range(iterations):
        deformed = grid.deform_points(source)
        _distances, idx = tree.query(deformed)
        matched = target[idx]
        residual = matched - deformed
        rms_history.append(float(np.sqrt(np.mean(np.sum(residual ** 2, axis=1)))))

        grid.splat_residuals(source, residual)
        grid.displacement = _smooth_grid(grid.displacement, factor=smoothing)

    deformed = grid.deform_points(source)

    return FfdResult(grid=grid, deformed_source=deformed, rms_history=rms_history, iterations=iterations)
