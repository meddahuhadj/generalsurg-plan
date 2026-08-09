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


# tissue_type -> {model, shear_range_kpa (traçabilité), parameters, note}
LITERATURE_ATLAS: Dict[str, dict] = {
    "liver_parenchyma": {
        "model": "mooney_rivlin",
        "shear_range_kpa": (2.0, 8.0),
        "parameters": _mooney_rivlin_from_shear_kpa(5.0),
        "note": "Plage de rigidité hépatique saine usuelle en élastographie "
                "impulsionnelle — valeur médiane utilisée par défaut. Un foie "
                "fibrotique/cirrhotique est nettement plus rigide (>12-14 kPa) : "
                "à ajuster si l'imagerie du patient le documente.",
    },
    "liver_tumor": {
        "model": "mooney_rivlin",
        "shear_range_kpa": (8.0, 40.0),
        "parameters": _mooney_rivlin_from_shear_kpa(20.0),
        "note": "Les lésions hépatiques (notamment malignes) sont généralement "
                "plus rigides que le parenchyme sain, mais la plage varie "
                "énormément selon le type histologique — valeur illustrative "
                "très approximative, pas une référence diagnostique.",
    },
    "vessel_wall": {
        "model": "mooney_rivlin",
        "shear_range_kpa": (100.0, 300.0),
        "parameters": _mooney_rivlin_from_shear_kpa(200.0),
        "note": "Paroi vasculaire, nettement plus rigide que le parenchyme "
                "environnant — ordre de grandeur générique, pas spécifique à un "
                "calibre ou un type de paroi (artère vs veine) donné.",
    },
    "soft_tissue_generic": {
        "model": "neo_hookean",
        "shear_range_kpa": (1.0, 10.0),
        "parameters": _mooney_rivlin_from_shear_kpa(4.0),
        "note": "Faute de pipeline de segmentation dédié pour les spécialités "
                "autres que HBP (voir README, limites honnêtes), valeur "
                "générique de tissu mou — à ne pas utiliser pour un calcul "
                "clinique réel.",
    },
}

DEFAULT_TISSUE_TYPE = "soft_tissue_generic"


def get_default_biomech(tissue_type: str) -> dict:
    """Retourne l'entrée d'atlas pour `tissue_type`, ou le générique par
    défaut si ce type de tissu n'a pas d'entrée dédiée."""
    return LITERATURE_ATLAS.get(tissue_type, LITERATURE_ATLAS[DEFAULT_TISSUE_TYPE])
