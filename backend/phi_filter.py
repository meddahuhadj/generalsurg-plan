# -*- coding: utf-8 -*-
"""
phi_filter.py — Filtre best-effort de pseudonymisation avant tout envoi de
texte à une IA cloud externe (Gemini, Groq) — voir routers/chat.py.

⚠️ AVERTISSEMENT HONNÊTE : ceci n'est PAS une solution de désidentification
certifiée (type Safe Harbor HIPAA ou anonymisation RGPD validée par un DPO).
C'est un filtre par expressions régulières qui repère les formes les plus
courantes d'identifiants directs dans un texte LIBRE tapé par un utilisateur
(email, téléphone français, numéro de sécurité sociale français, date
ressemblant à une naissance) — il ne peut PAS garantir l'absence de toute
donnée identifiante : un nom propre tapé en texte libre, sans motif
reconnaissable, n'est pas détecté par une regex générique.

La protection la plus fiable reste EN AMONT, pas ici : ne jamais construire un
prompt contenant le nom réel du patient — voir assets/app-part3.js
(`pseudonymPatientRef`), qui retire le nom des prompts IA à la source, y
compris pour le chemin "clé API directe" (browser → Gemini/Groq) qu'aucun
filtre côté serveur ne peut intercepter, puisqu'il ne passe jamais par ce
backend. Ce module est une DEUXIÈME ligne de défense (best-effort) pour le
texte libre qui, lui, transite par le backend (POST /chat, WS /ws/chat-stream).
"""

from __future__ import annotations

import re
from typing import Iterable, Optional

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
# Téléphone français : 0X XX XX XX XX ou +33 X XX XX XX XX, séparateurs espace/point/tiret optionnels.
_PHONE_FR_RE = re.compile(r"(?:\+33[\s.-]?|0)[1-9](?:[\s.-]?\d{2}){4}\b")
# NIR (numéro de sécurité sociale français, 13 ou 15 chiffres) : sexe(1-2) + année(2) + mois(01-12
# ou 20/30+ pour cas spéciaux, simplifié ici) + département + reste.
_NIR_RE = re.compile(r"\b[12]\s?\d{2}\s?(?:0[1-9]|1[0-2])\s?(?:\d{2}|2[AB])\s?\d{3}\s?\d{3}(?:\s?\d{2})?\b")
# Date JJ/MM/AAAA ou JJ-MM-AAAA ou JJ.MM.AAAA, plausible comme date de naissance (années 19xx/20xx).
_DOB_RE = re.compile(r"\b(?:0[1-9]|[12]\d|3[01])[/.\-](?:0[1-9]|1[0-2])[/.\-](?:19|20)\d{2}\b")

_PATTERNS = (
    (_EMAIL_RE, "[email masqué]"),
    (_NIR_RE, "[numéro de sécurité sociale masqué]"),
    (_PHONE_FR_RE, "[téléphone masqué]"),
    (_DOB_RE, "[date masquée]"),
)


def redact_text(text: str, known_identifiers: Optional[Iterable[str]] = None) -> str:
    """Retourne `text` avec les motifs d'identifiants directs remplacés par un
    marqueur générique.

    `known_identifiers` (ex. [patient.nom, patient.id] quand l'appelant les
    connaît) est traité en PRIORITÉ par correspondance exacte (insensible à la
    casse) — bien plus fiable qu'une regex générique, puisqu'on sait
    précisément quoi chercher. Les identifiants de moins de 3 caractères sont
    ignorés (trop de faux positifs sur un texte clinique normal).
    """
    if not text:
        return text

    redacted = text
    for identifier in known_identifiers or ():
        if identifier and len(identifier) >= 3:
            redacted = re.sub(re.escape(identifier), "[identifiant masqué]", redacted, flags=re.IGNORECASE)

    for pattern, replacement in _PATTERNS:
        redacted = pattern.sub(replacement, redacted)

    return redacted
