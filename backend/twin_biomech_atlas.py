# -*- coding: utf-8 -*-
"""
twin_biomech_atlas.py — Valeurs par défaut (littérature) des paramètres
Mooney-Rivlin par type de tissu, utilisées pour peupler `TwinBiomech` tant
qu'aucune élastographie patient réelle n'est disponible (voir feuille de
route "Jumeau numérique réel", ARCHITECTURE_CAHIER_DES_CHARGES.md §2.2.1/§3.3).

⚠️ AVERTISSEMENT HONNÊTE (même esprit que backend/biomechanics_engine.py) :
    Ce ne sont PAS des coefficients extraits d'une étude de calibration
    Mooney-Rivlin publiée et vérifiée un à un ici. Ce sont des ORDRES DE
    GRANDEUR dérivés des plages de rigidité (module de cisaillement, en kPa)
    cliniquement établies en élastographie (ex. élastographie impulsionnelle
    hépatique : ~2-8 kPa pour un foie sain, >12-14 kPa en cirrhose — seuils
    couramment utilisés en pratique clinique pour le staging de fibrose),
    converties en C10 via l'approximation petites déformations pour un
    matériau quasi-incompressible (μ ≈ 2·(C10+C01)), avec C01 fixé à 0 par
    défaut faute de donnée permettant de séparer C10/C01 (dégénère donc en
    Néo-Hookéen, pas un vrai Mooney-Rivlin biphasique calibré).

    À REMPLACER par une vraie calibration patient (élastographie IRM/US, voir
    Phase 4 de la feuille de route) avant tout usage autre qu'illustratif —
    ces valeurs ne doivent jamais servir de base à une décision clinique.
"""

from __future__ import annotations

from typing import Dict


def _mooney_rivlin_from_shear_kpa(shear_kpa: float) -> dict:
    """C01=0 par défaut (voir avertissement en tête de module) : approximation
    Néo-Hookéenne à partir d'un module de cisaillement unique, pas une vraie
    séparation C10/C01 issue d'un essai biaxial."""
    return {"C10_kpa": round(shear_kpa / 2.0, 4), "C01_kpa": 0.0}


# ---------------------------------------------------------------------------
# Classes de tissu — déterminent si le solveur hyperélastique (Mooney-Rivlin/
# Ogden, calibré pour un continuum mou quasi-incompressible) a un sens physique :
#   - "soft_deformable"        : parenchyme/glande/muscle — la relaxation FEM
#                                  post-résection est pertinente.
#   - "rigid_non_deformable"   : os/cartilage — un module de cisaillement en kPa
#                                  n'a pas de sens à l'échelle où ce solveur
#                                  travaille (l'os cortical est ~1000x plus
#                                  rigide, GPa vs kPa) ; ces valeurs ne
#                                  servent qu'à afficher un ordre de grandeur,
#                                  la FEM hyperélastique doit être REFUSÉE
#                                  pour ces types (voir routers/surgical_planning.py,
#                                  garde-fou avant `run_fem`).
#   - "neurovascular_critical" : nerf/vaisseau — jamais réséqué ni déformé par
#                                  ce solveur ; sert uniquement de référence
#                                  pour un calcul de marge (distance plan de
#                                  coupe ↔ structure), au même titre qu'une
#                                  marge oncologique. Voir `_resolve_critical_structures`
#                                  dans routers/surgical_planning.py.
# ---------------------------------------------------------------------------

# tissue_type -> {model, tissue_class, shear_range_kpa (traçabilité), parameters, note}
LITERATURE_ATLAS: Dict[str, dict] = {
    "liver_parenchyma": {
        "model": "mooney_rivlin",
        "tissue_class": "soft_deformable",
        "shear_range_kpa": (2.0, 8.0),
        "parameters": _mooney_rivlin_from_shear_kpa(5.0),
        "note": "Plage de rigidité hépatique saine usuelle en élastographie "
                "impulsionnelle — valeur médiane utilisée par défaut. Un foie "
                "fibrotique/cirrhotique est nettement plus rigide (>12-14 kPa) : "
                "à ajuster si l'imagerie du patient le documente.",
    },
    "liver_tumor": {
        "model": "mooney_rivlin",
        "tissue_class": "soft_deformable",
        "shear_range_kpa": (8.0, 40.0),
        "parameters": _mooney_rivlin_from_shear_kpa(20.0),
        "note": "Les lésions hépatiques (notamment malignes) sont généralement "
                "plus rigides que le parenchyme sain, mais la plage varie "
                "énormément selon le type histologique — valeur illustrative "
                "très approximative, pas une référence diagnostique.",
    },
    "vessel_wall": {
        "model": "mooney_rivlin",
        "tissue_class": "neurovascular_critical",
        "shear_range_kpa": (100.0, 300.0),
        "parameters": _mooney_rivlin_from_shear_kpa(200.0),
        "note": "Paroi vasculaire (ex. axe carotido-jugulaire en ORL cervico-"
                "faciale), nettement plus rigide que le parenchyme environnant — "
                "ordre de grandeur générique, pas spécifique à un calibre ou un "
                "type de paroi (artère vs veine) donné. Traité comme structure "
                "critique : jamais réséqué par le solveur, seule sa distance au "
                "plan de coupe est calculée (marge vasculaire).",
    },
    "nerve_epineurium": {
        "model": "neo_hookean",
        "tissue_class": "neurovascular_critical",
        "shear_range_kpa": (3.0, 15.0),
        "parameters": _mooney_rivlin_from_shear_kpa(8.0),
        "note": "Nerf périphérique (ex. nerf facial VII en parotidectomie/"
                "otologie, nerf récurrent laryngé, nerf hypoglosse/spinal en "
                "curage cervical) — ordre de grandeur très large tiré "
                "d'études d'élastographie par ondes de cisaillement sur nerf "
                "périphérique, PAS une calibration par nerf nommé (le nerf "
                "facial intra-parotidien n'a pas de valeur publiée dédiée "
                "utilisée ici). Ces paramètres ne sont volontairement PAS "
                "utilisés pour déformer le nerf : un nerf n'est jamais "
                "réséqué par le solveur, seule la distance plan↔nerf est "
                "calculée (marge de préservation). Champ conservé pour "
                "cohérence de schéma et un futur usage illustratif (ex. "
                "jumeau numérique visuel), pas pour un calcul clinique.",
    },
    "cartilage_hyaline": {
        "model": "neo_hookean",
        "tissue_class": "rigid_non_deformable",
        "shear_range_kpa": (300.0, 800.0),
        "parameters": _mooney_rivlin_from_shear_kpa(500.0),
        "note": "Cartilage laryngé (thyroïde/cricoïde/aryténoïde) ou nasal/"
                "septal — ordre de grandeur très approximatif (le cartilage "
                "hyalin se rigidifie aussi avec l'âge par calcification, non "
                "modélisé ici). Le module de cisaillement en kPa n'a de toute "
                "façon qu'une valeur illustrative pour ce tissu : "
                "`routers/surgical_planning.py` REFUSE la relaxation FEM "
                "hyperélastique pour tout tissu `rigid_non_deformable` (400 "
                "explicite) plutôt que de produire une déformation non "
                "physique — seul le calcul géométrique (FLR + marge) reste "
                "disponible.",
    },
    "bone_cortical": {
        "model": "neo_hookean",
        "tissue_class": "rigid_non_deformable",
        "shear_range_kpa": (None, None),
        "parameters": {"C10_kpa": 0.0, "C01_kpa": 0.0},
        "note": "Os cortical (ex. os temporal en chirurgie otologique/base du "
                "crâne). Son module de Young réel est de l'ordre du GPa "
                "(~1000x le foie) : totalement hors de l'échelle kPa pour "
                "laquelle ce solveur hyperélastique a été calibré/validé "
                "numériquement (voir tests/test_biomech_solver.py) — "
                "AUCUNE valeur numérique fournie ici volontairement plutôt "
                "qu'un chiffre kPa trompeur. `rigid_non_deformable` bloque "
                "systématiquement `run_fem=true` pour ce type ; seule la "
                "planification géométrique (volume fraisé, distance à une "
                "structure noble) a un sens pour de l'os.",
    },
    "gland_soft": {
        "model": "mooney_rivlin",
        "tissue_class": "soft_deformable",
        "shear_range_kpa": (1.0, 4.0),
        "parameters": _mooney_rivlin_from_shear_kpa(2.0),
        "note": "Glande cervico-faciale de consistance molle (parotide, "
                "thyroïde saine) — ordre de grandeur générique tiré de "
                "plages d'élastographie glandulaire ; un nodule/goitre "
                "modifie sensiblement la rigidité locale, non pris en "
                "compte ici. Utilisable pour la relaxation FEM (parenchyme "
                "mou), contrairement au cartilage/os voisins.",
    },
    "muscle_skeletal": {
        "model": "mooney_rivlin",
        "tissue_class": "soft_deformable",
        "shear_range_kpa": (2.0, 15.0),
        "parameters": _mooney_rivlin_from_shear_kpa(6.0),
        "note": "Muscle strié au repos (ex. sterno-cléido-mastoïdien, muscles "
                "prévertébraux en curage cervical) — la rigidité musculaire "
                "varie énormément avec le tonus/la contraction (jusqu'à "
                "~10x au repos vs contracté) : valeur de repos uniquement, "
                "sans signification per-opératoire sous curarisation ou non.",
    },
    "soft_tissue_generic": {
        "model": "neo_hookean",
        "tissue_class": "soft_deformable",
        "shear_range_kpa": (1.0, 10.0),
        "parameters": _mooney_rivlin_from_shear_kpa(4.0),
        "note": "Faute de type tissulaire plus spécifique reconnu par "
                "l'atlas, valeur générique de tissu mou — à ne pas utiliser "
                "pour un calcul clinique réel.",
    },
}

DEFAULT_TISSUE_TYPE = "soft_tissue_generic"


def get_default_biomech(tissue_type: str) -> dict:
    """Retourne l'entrée d'atlas pour `tissue_type`, ou le générique par
    défaut si ce type de tissu n'a pas d'entrée dédiée."""
    return LITERATURE_ATLAS.get(tissue_type, LITERATURE_ATLAS[DEFAULT_TISSUE_TYPE])


def get_tissue_class(tissue_type: str) -> str:
    """Classe du tissu ('soft_deformable' | 'rigid_non_deformable' |
    'neurovascular_critical') — type inconnu de l'atlas traité comme
    'soft_deformable' (comportement historique par défaut, avant l'ajout des
    classes rigides/critiques)."""
    return get_default_biomech(tissue_type).get("tissue_class", "soft_deformable")


def is_fem_eligible(tissue_type: str) -> bool:
    """False pour tout tissu rigide (os/cartilage) ou neurovasculaire critique
    (nerf/vaisseau) : la relaxation hyperélastique du solveur n'a de sens
    physique/clinique que pour un parenchyme mou (`soft_deformable`)."""
    return get_tissue_class(tissue_type) == "soft_deformable"
