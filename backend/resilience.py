# -*- coding: utf-8 -*-
"""
resilience.py — Disjoncteur (circuit breaker) + retry pour appels réseau externes
====================================================================================
Objectif concret (priorité 5 de la feuille de route) : que se passe-t-il quand
Gemini, Groq ou le PACS distant sont indisponibles ou lents ?

Sans ce module, un fournisseur IA en panne fait planter chaque requête /chat
avec un timeout de plusieurs secondes, répété à chaque appel — mauvaise
expérience pour le chirurgien ET charge inutile sur un service déjà en panne.

Ce module apporte deux mécanismes complémentaires, volontairement simples
(pas de dépendance externe type `pybreaker` — un service médical doit pouvoir
auditer chaque ligne de sa logique de résilience) :

1. CircuitBreaker : après N échecs consécutifs, le disjoncteur "ouvre" pendant
   une durée de cooldown — les appels suivants échouent IMMÉDIATEMENT (sans
   toucher le réseau) jusqu'à la fin du cooldown, où un appel de test
   ("half-open") est autorisé. S'il réussit, le disjoncteur se referme.
2. retry_with_backoff : réessaie un appel réseau transitoire (timeout, erreur
   de connexion, 5xx) avec un délai croissant — mais PAS sur une erreur 4xx
   (ex. clé API invalide : réessayer ne changera rien, il faut échouer vite).

Utilisé par main.py pour /chat, /ws/chat-stream, et par pacs_client.py.
"""

from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional, TypeVar

import httpx

T = TypeVar("T")


class CircuitOpenError(Exception):
    """Levée quand le disjoncteur est ouvert : on n'a même pas tenté l'appel réseau."""


@dataclass
class CircuitBreaker:
    name: str
    failure_threshold: int = 3       # échecs consécutifs avant ouverture
    cooldown_seconds: float = 30.0   # durée avant de retenter (half-open)

    _failures: int = field(default=0, init=False)
    _opened_at: Optional[float] = field(default=None, init=False)

    @property
    def state(self) -> str:
        if self._opened_at is None:
            return "closed"
        if time.monotonic() - self._opened_at >= self.cooldown_seconds:
            return "half-open"
        return "open"

    def before_call(self) -> None:
        st = self.state
        if st == "open":
            remaining = self.cooldown_seconds - (time.monotonic() - self._opened_at)
            raise CircuitOpenError(
                f"Disjoncteur '{self.name}' ouvert (trop d'échecs récents) — "
                f"nouvel essai dans {max(0, remaining):.0f}s. Le réseau n'a pas été sollicité."
            )
        # half-open ou closed : on laisse passer l'appel (test si half-open)

    def on_success(self) -> None:
        self._failures = 0
        self._opened_at = None

    def on_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.failure_threshold:
            self._opened_at = time.monotonic()

    def status(self) -> dict:
        return {"name": self.name, "state": self.state, "consecutive_failures": self._failures}


# Un disjoncteur par fournisseur externe — état partagé au niveau du process
# (suffisant pour un seul worker Uvicorn ; en multi-worker, chaque worker a le
# sien, ce qui est un compromis acceptable : au pire on retente un peu plus).
GEMINI_BREAKER = CircuitBreaker(name="gemini", failure_threshold=3, cooldown_seconds=30.0)
GROQ_BREAKER = CircuitBreaker(name="groq", failure_threshold=3, cooldown_seconds=30.0)
PACS_BREAKER = CircuitBreaker(name="pacs", failure_threshold=3, cooldown_seconds=20.0)
DIMSE_BREAKER = CircuitBreaker(name="pacs_dimse", failure_threshold=3, cooldown_seconds=20.0)
MLLP_BREAKER = CircuitBreaker(name="hl7_mllp", failure_threshold=3, cooldown_seconds=20.0)


def _is_transient(exc: Exception) -> bool:
    """Erreur réseau/temporaire (timeout, connexion, 5xx) -> vaut la peine d'être
    réessayée. Une 4xx (clé invalide, requête malformée) ne l'est PAS."""
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    # pacs_client.PacsConnectionError : détection par nom de classe pour éviter
    # un import circulaire (pacs_client importe déjà ce module). Cette exception
    # signale par construction un problème réseau/HTTP côté PACS distant.
    if type(exc).__name__ in ("PacsConnectionError", "DimseConnectionError", "MllpError"):
        return True
    return False


@dataclass
class RateLimiter:
    """
    Limiteur de débit simple par clé (ex. IP), fenêtre glissante en mémoire — même philosophie
    que CircuitBreaker ci-dessus : pas de dépendance externe (ex. `slowapi`/Redis), auditable
    ligne à ligne. Ajouté pour protéger `POST /auth/token` (aucune limite n'existait avant, un
    brute-force sur le mot de passe n'était pas mitigé).

    Limite connue (comme pour CircuitBreaker) : état en mémoire du process — avec plusieurs
    workers Uvicorn, chaque worker a son propre compteur (compromis acceptable, au pire la
    limite réelle est `N × nb_workers`). Pour un déploiement multi-worker exposé publiquement,
    préférer un limiteur partagé (ex. Redis) en plus de celui-ci.
    """
    name: str
    max_attempts: int = 10       # tentatives autorisées par fenêtre
    window_seconds: float = 60.0

    _hits: dict = field(default_factory=dict, init=False)  # clé -> liste de timestamps monotonic

    def check(self, key: str) -> None:
        """Lève HTTPException 429 si la clé a dépassé son quota sur la fenêtre glissante."""
        from fastapi import HTTPException, status  # import local pour ne pas alourdir le module au repos

        now = time.monotonic()
        timestamps = [t for t in self._hits.get(key, []) if now - t < self.window_seconds]
        if len(timestamps) >= self.max_attempts:
            retry_after = self.window_seconds - (now - timestamps[0])
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Trop de tentatives. Réessayez dans {max(1, round(retry_after))}s.",
                headers={"Retry-After": str(max(1, round(retry_after)))},
            )
        timestamps.append(now)
        self._hits[key] = timestamps


# 10 tentatives / minute / IP (par défaut, voir AUTH_RATE_LIMIT_PER_MINUTE) sur
# l'authentification — assez large pour un usage légitime (2FA compris) mais
# coupe un brute-force en boucle serrée.
_AUTH_RATE_LIMIT = int(os.getenv("AUTH_RATE_LIMIT_PER_MINUTE", "10"))
AUTH_RATE_LIMITER = RateLimiter(name="auth_token", max_attempts=_AUTH_RATE_LIMIT, window_seconds=60.0)

# 10 tentatives / minute / IP sur la vérification du code 2FA — un code TOTP a
# 6 chiffres (1 million de combinaisons) : sans cette limite, seule l'étape
# mot de passe de /auth/token était protégée, pas l'étape 2FA elle-même.
TWOFA_VERIFY_RATE_LIMITER = RateLimiter(name="2fa_verify", max_attempts=10, window_seconds=60.0)

# 5 inscriptions / minute / IP — protège contre la création de masse de comptes
# quand ALLOW_SELF_REGISTRATION=true (démo publique ; désactivé pour un pilote réel).
REGISTER_RATE_LIMITER = RateLimiter(name="register", max_attempts=5, window_seconds=60.0)

# 30 requêtes / minute / IP sur le chat IA — protège contre les abus tout en
# laissant une marge pour un usage clinique normal (questions rapides en OR).
CHAT_RATE_LIMITER = RateLimiter(name="chat", max_attempts=30, window_seconds=60.0)

# 5 requêtes / minute / IP sur la segmentation — opération lourde (GPU, temps réel).
SEGMENTATION_RATE_LIMITER = RateLimiter(name="segmentation", max_attempts=5, window_seconds=60.0)


async def call_with_resilience(
    fn: Callable[[], Awaitable[T]],
    breaker: CircuitBreaker,
    max_attempts: int = 2,
    base_delay: float = 0.5,
) -> T:
    """Exécute `fn()` (une coroutine sans argument, typiquement une closure autour
    d'un appel httpx) protégée par un disjoncteur + retry avec backoff exponentiel
    sur erreurs transitoires uniquement."""
    breaker.before_call()
    last_exc: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        try:
            result = await fn()
            breaker.on_success()
            return result
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if not _is_transient(exc) or attempt == max_attempts:
                breaker.on_failure()
                raise
            await asyncio.sleep(base_delay * (2 ** (attempt - 1)))
    # Ne devrait jamais être atteint (la boucle raise ou return avant), mais
    # garde-fou explicite plutôt qu'un retour implicite None.
    raise last_exc or RuntimeError("call_with_resilience: échec sans exception capturée")
