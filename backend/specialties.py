# -*- coding: utf-8 -*-
"""specialties.py — Spécialités chirurgicales supportées (partagé entre routers).

Doit rester synchronisé avec MODULES dans assets/app-part1.js (front) : les clés
ci-dessous sont exactement les 3 modules ophtalmologiques exposés par l'app."""

from typing import Literal

Specialty = Literal["cataracte", "glaucome", "retine"]

SPECIALTY_LABELS = {
    "cataracte": "Chirurgie de la Cataracte",
    "glaucome": "Chirurgie du Glaucome",
    "retine": "Chirurgie Vitréo-Rétinienne",
}
