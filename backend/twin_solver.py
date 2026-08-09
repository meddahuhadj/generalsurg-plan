# -*- coding: utf-8 -*-
"""
twin_solver.py — Solveur XPBD (Extended Position Based Dynamics, Macklin,
Müller & Chentanez, 2016) pour le jumeau numérique déformable, avec un
matériau hyperélastique NÉO-HOOKÉEN par tétraèdre (formulation "cross-product"
de Smith, Goes & Kim, "Stable Neo-Hookean Flesh Simulation", SIGGRAPH 2018 —
robuste même pour des tétraèdres inversés/dégénérés, contrairement à une
formulation passant par F^-1).

Contexte : Phase 1 de la feuille de route "Jumeau numérique réel" (voir
README/ARCHITECTURE_CAHIER_DES_CHARGES.md §2.2.1/§3.5.1). Remplace le PBD
"distance uniquement" du frontend (assets/app-part1.js, voir son commentaire
d'en-tête) par un calcul sur le maillage VOLUMIQUE produit par
`mesh_export.mask_to_tetmesh` (Phase 0), avec deux contraintes par tétraèdre :

  1. Contrainte déviatorique (forme) : C_dev = sqrt(tr(FᵀF)) - sqrt(3)
     — résiste au cisaillement/étirement, pilotée par la rigidité de
     cisaillement du tissu (TwinBiomech).
  2. Contrainte hydrostatique (volume) : C_hyd = det(F) - 1
     — résiste au changement de volume (quasi-incompressibilité biologique).

Où F = Ds @ Dm_inv est le gradient de déformation du tétraèdre (Ds = arête
déformées, Dm_inv = inverse des arêtes au repos, précalculé une fois).

⚠️ AVERTISSEMENTS HONNÊTES :
    - **Néo-Hookéen, pas Mooney-Rivlin biphasique.** Un vrai Mooney-Rivlin
      (2 paramètres C10/C01) nécessite de différentier aussi le second
      invariant I2 = fonction de cof(F), non implémenté ici. Cohérent avec
      `twin_biomech_atlas.py`, qui fixe déjà C01=0 par défaut faute de donnée
      permettant de le calibrer séparément — ajouter le terme C01 est un
      prolongement possible, pas fait dans cette session.
    - **Rigidité RELATIVE, pas calibrée en unités physiques réelles.**
      `stiffness_from_shear_kpa()` ci-dessous transforme un module de
      cisaillement (kPa, issu de l'atlas ou d'une élastographie réelle) en un
      facteur de rigidité PBD dans [0,1] via une fonction saturante monotone
      — un tissu 2x plus rigide dans l'atlas produit une réponse
      *proportionnellement* plus rigide dans le solveur, mais la relation
      exacte contrainte-déplacement n'a PAS été calibrée/validée contre un
      essai mécanique réel (voir Phase 4/5 de la feuille de route). Ne pas
      interpréter un déplacement produit par ce solveur comme une distance
      en mm cliniquement significative sans cette calibration.
    - **Résolution géométrique, pas dynamique temporelle.** Ce solveur
      relaxe vers un équilibre statique pour une position de "saisie" donnée
      (adapté à une aide à la décision : poser un geste, calculer le résultat
      stable), pas une simulation temps réel avec inertie/vitesse.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

import numpy as np


# ---------------------------------------------------------------------------
# Précalcul du maillage (une fois, à partir de mesh_export.mask_to_tetmesh)
# ---------------------------------------------------------------------------

@dataclass
class TetMeshPrecomputed:
    rest_nodes: np.ndarray      # (N, 3)
    tets: np.ndarray            # (M, 4) indices
    dm_inv: np.ndarray          # (M, 3, 3) — inverse de la matrice d'arêtes au repos
    rest_volume: np.ndarray     # (M,) — volume au repos de chaque tétraèdre (mm³)


def precompute_tet_mesh(nodes: np.ndarray, tets: np.ndarray) -> TetMeshPrecomputed:
    """Précalcule `Dm_inv` et le volume au repos pour chaque tétraèdre — fait
    une seule fois par maillage (pas à chaque itération du solveur).

    Lève ValueError si un tétraèdre est dégénéré (volume au repos ~0, donc
    `Dm` non inversible) : un tel tétraèdre ne peut porter aucune contrainte
    physique sensée (voir `mesh_export.mask_to_tetmesh`, qui filtre déjà les
    tétraèdres dégénérés en amont — cette vérification est une seconde
    ligne de défense, pas redondante si `nodes`/`tets` viennent d'ailleurs).
    """
    rest = nodes[tets]  # (M, 4, 3)
    dm = np.transpose(rest[:, 1:] - rest[:, :1], (0, 2, 1))  # (M, 3, 3), colonnes = arêtes

    det_dm = np.linalg.det(dm)
    if np.any(np.abs(det_dm) < 1e-12):
        raise ValueError("Tétraèdre dégénéré (volume au repos ~0) : Dm non inversible.")

    dm_inv = np.linalg.inv(dm)
    rest_volume = np.abs(det_dm) / 6.0

    return TetMeshPrecomputed(rest_nodes=nodes, tets=tets, dm_inv=dm_inv, rest_volume=rest_volume)


# ---------------------------------------------------------------------------
# Gradient de déformation + contraintes Néo-Hookéennes (par tétraèdre)
# ---------------------------------------------------------------------------

def deformation_gradient(positions: np.ndarray, tets: np.ndarray, dm_inv: np.ndarray) -> np.ndarray:
    """F = Ds @ Dm_inv pour chaque tétraèdre. `positions` = positions
    COURANTES (déformées) des nœuds, (N, 3). Retourne (M, 3, 3)."""
    deformed = positions[tets]  # (M, 4, 3)
    ds = np.transpose(deformed[:, 1:] - deformed[:, :1], (0, 2, 1))  # (M, 3, 3)
    return ds @ dm_inv


def _node_gradients_from_P(P: np.ndarray, dm_inv: np.ndarray) -> np.ndarray:
    """Convertit ∂C/∂F (P, (M,3,3)) en gradients par nœud (M, 4, 3), via
    G = P @ Dm_inv^T (colonnes = ∂C/∂x2, ∂C/∂x3, ∂C/∂x4) et
    ∂C/∂x1 = -(somme des colonnes de G) — résultat standard pour un
    tétraèdre linéaire (voir Sifakis & Barbic, "FEM Simulation of 3D
    Deformable Solids", SIGGRAPH course notes, §3.2), validé par différences
    finies dans tests/test_twin_solver.py."""
    G = P @ np.transpose(dm_inv, (0, 2, 1))  # (M, 3, 3), colonnes = grad x2,x3,x4
    grad_x1 = -G.sum(axis=2)                 # (M, 3)
    grads = np.zeros((P.shape[0], 4, 3))
    grads[:, 0] = grad_x1
    grads[:, 1] = G[:, :, 0]
    grads[:, 2] = G[:, :, 1]
    grads[:, 3] = G[:, :, 2]
    return grads


def deviatoric_constraint(F: np.ndarray, dm_inv: np.ndarray):
    """C_dev = sqrt(tr(FᵀF)) - sqrt(3) — résiste au cisaillement/étirement.
    Retourne (C (M,), gradients par nœud (M,4,3))."""
    i_c = np.einsum("mij,mij->m", F, F)  # tr(F^T F) = somme des carrés des éléments
    sqrt_ic = np.sqrt(np.maximum(i_c, 1e-12))
    C = sqrt_ic - np.sqrt(3.0)
    P = F / sqrt_ic[:, None, None]
    return C, _node_gradients_from_P(P, dm_inv)


def hydrostatic_constraint(F: np.ndarray, dm_inv: np.ndarray):
    """C_hyd = det(F) - 1 — résiste au changement de volume. ∂det(F)/∂F
    calculé via produits vectoriels des colonnes de F (formule du cofacteur,
    équivalente à det(F)*F^-T mais définie même si F est singulière — voir
    Smith, Goes & Kim 2018). Retourne (C (M,), gradients par nœud (M,4,3))."""
    f0, f1, f2 = F[:, :, 0], F[:, :, 1], F[:, :, 2]
    detF = np.einsum("mi,mi->m", f0, np.cross(f1, f2))
    C = detF - 1.0
    P = np.stack([np.cross(f1, f2), np.cross(f2, f0), np.cross(f0, f1)], axis=2)
    return C, _node_gradients_from_P(P, dm_inv)


# ---------------------------------------------------------------------------
# Rigidité relative à partir de l'atlas TwinBiomech (voir avertissement en tête)
# ---------------------------------------------------------------------------

def stiffness_from_shear_kpa(shear_kpa: float, reference_kpa: float = 10.0,
                              min_stiffness: float = 0.05, max_stiffness: float = 0.95) -> float:
    """Fonction saturante monotone kPa -> facteur de rigidité PBD dans
    [min_stiffness, max_stiffness]. `reference_kpa` fixe l'échelle (à mi-hauteur
    de la plage de rigidité) — 10 kPa place le foie sain (~5 kPa, voir l'atlas)
    autour de 0.33 et la paroi vasculaire (~200 kPa) près du plafond. RELATIF
    uniquement — voir avertissement en tête de module."""
    if shear_kpa <= 0:
        raise ValueError("shear_kpa doit être positif.")
    ratio = shear_kpa / (shear_kpa + reference_kpa)
    return float(np.clip(ratio, min_stiffness, max_stiffness))


# ---------------------------------------------------------------------------
# Solveur (relaxation géométrique vers un équilibre statique)
# ---------------------------------------------------------------------------

@dataclass
class TwinSolverState:
    positions: np.ndarray        # (N, 3) — position courante (modifiée en place par solve())
    pinned: np.ndarray           # (N,) bool — nœuds fixes (ancrage, ex. pédicule)
    grabbed: Dict[int, np.ndarray] = field(default_factory=dict)  # idx -> position cible imposée


def solve(mesh: TetMeshPrecomputed, state: TwinSolverState,
          dev_stiffness: float, hyd_stiffness: float, iterations: int = 30) -> np.ndarray:
    """Relaxe `state.positions` (modifiée EN PLACE, aussi retournée) vers un
    équilibre satisfaisant au mieux les contraintes déviatorique et
    hydrostatique de chaque tétraèdre, sous les contraintes dures `pinned`
    (immobiles) et `grabbed` (imposées à une position cible). Solveur de type
    Jacobi projeté (PBD) : au sein d'une passe, chaque tétraèdre calcule sa
    correction à partir du MÊME instantané de positions, et les corrections
    de tous les tétraèdres touchant un nœud partagé sont MOYENNÉES (pas
    appliquées séquentiellement) avant d'être appliquées à ce nœud — voir le
    commentaire détaillé dans le corps de la fonction pour pourquoi
    (Gauss-Seidel diverge sur un maillage Delaunay où un nœud est partagé par
    plusieurs dizaines de tétraèdres). `iterations` passes complètes — pas de
    pas de temps : c'est une relaxation géométrique vers un état stable, pas
    une intégration dynamique (voir avertissement en tête de module).
    """
    if not (0.0 < dev_stiffness <= 1.0) or not (0.0 < hyd_stiffness <= 1.0):
        raise ValueError("Les rigidités doivent être dans (0, 1].")

    positions = state.positions
    tets = mesh.tets
    n_nodes = len(positions)
    free_mask = ~state.pinned
    grabbed_idx = np.fromiter(state.grabbed.keys(), dtype=int, count=len(state.grabbed))
    grabbed_target = (np.array([state.grabbed[i] for i in grabbed_idx]) if len(grabbed_idx)
                       else np.zeros((0, 3)))
    grab_start = positions[grabbed_idx].copy() if len(grabbed_idx) else np.zeros((0, 3))

    movable_mask = free_mask.copy()
    movable_mask[grabbed_idx] = False  # nœuds saisis : imposés, pas résolus par les contraintes

    # `C_hyd = det(F) - 1` est CUBIQUE en position (pas linéaire comme une
    # contrainte de distance) : une correction "à 100%" en une seule itération
    # peut largement dépasser le régime où l'approximation locale du solveur
    # est valide. Trois garde-fous, tous nécessaires (observés empiriquement en
    # développant ce module — voir tests/test_twin_solver.py) :
    #   1. Amener la position saisie PROGRESSIVEMENT vers sa cible plutôt que
    #      d'imposer d'un coup une violation de contrainte massive.
    #   2. Plafonner la correction par (tétraèdre, nœud) à une fraction de la
    #      taille caractéristique du maillage local.
    #   3. MOYENNER (Jacobi), pas appliquer séquentiellement (Gauss-Seidel), les
    #      corrections des différents tétraèdres partageant un même nœud au
    #      sein d'une passe. Avec un maillage issu de Delaunay (nœuds partagés
    #      par plusieurs dizaines de tétraèdres, voir mesh_export.mask_to_tetmesh),
    #      appliquer séquentiellement des corrections indépendantes (calculées
    #      à partir du MÊME instantané de positions en début de passe) revient
    #      à une marche aléatoire qui ne converge pas — empiriquement constaté :
    #      une rigidité hydrostatique plus élevée y produisait une préservation
    #      du volume PIRE, pas meilleure, avant ce correctif.
    char_length = float(np.cbrt(max(mesh.rest_volume.mean(), 1e-9))) if len(mesh.rest_volume) else 1.0
    max_step = 0.25 * char_length

    for it in range(iterations):
        if len(grabbed_idx):
            ramp = (it + 1) / iterations
            positions[grabbed_idx] = (1 - ramp) * grab_start + ramp * grabbed_target

        # F recalculé fraîchement au début de CHAQUE passe (une passe par type de
        # contrainte) — indispensable : la passe hydrostatique doit voir les
        # positions déjà corrigées par la passe déviatorique, pas un gradient
        # de déformation obsolète calculé avant ces corrections.
        for constraint_fn, stiffness in (
            (deviatoric_constraint, dev_stiffness),
            (hydrostatic_constraint, hyd_stiffness),
        ):
            F = deformation_gradient(positions, tets, mesh.dm_inv)
            C, grads = constraint_fn(F, mesh.dm_inv)  # C: (M,), grads: (M,4,3)

            movable_per_corner = movable_mask[tets]  # (M,4) bool
            grad_norm2 = np.einsum("mni,mni->mn", grads, grads)  # (M,4)
            denom = np.where(movable_per_corner, grad_norm2, 0.0).sum(axis=1)  # (M,)
            valid = denom > 1e-12

            lam = np.zeros(len(tets))
            lam[valid] = stiffness * (-C[valid]) / denom[valid]
            delta = lam[:, None, None] * grads  # (M,4,3)
            delta = np.where(movable_per_corner[:, :, None], delta, 0.0)

            # Correction PBD standard (Müller et al. 2007) : masse uniforme (w=1).
            norms = np.linalg.norm(delta, axis=2)  # (M,4)
            over = norms > max_step
            scale = np.where(over, max_step / np.where(over, norms, 1.0), 1.0)
            delta = delta * scale[:, :, None]

            accum = np.zeros((n_nodes, 3))
            count = np.zeros(n_nodes)
            flat_idx = tets.reshape(-1)
            flat_delta = delta.reshape(-1, 3)
            flat_movable = movable_per_corner.reshape(-1)
            np.add.at(accum, flat_idx[flat_movable], flat_delta[flat_movable])
            np.add.at(count, flat_idx[flat_movable], 1)
            touched = count > 0
            positions[touched] += accum[touched] / count[touched, None]

    return positions
