# -*- coding: utf-8 -*-
"""specialties.py — Spécialités chirurgicales supportées (partagé entre routers)."""

from typing import Literal

Specialty = Literal["laryngologie", "otologie", "rhinologie", "cervicofacial", "pediatrique", "anesthesie_reanimation"]

SPECIALTY_LABELS = {
    "laryngologie": "Chirurgie Laryngée & VADS",
    "otologie": "Chirurgie Otologique",
    "rhinologie": "Chirurgie Rhino-Sinusienne",
    "cervicofacial": "Chirurgie Cervico-Faciale",
    "pediatrique": "ORL Pédiatrique",
    "anesthesie_reanimation": "Anesthésie-Réanimation",
}
