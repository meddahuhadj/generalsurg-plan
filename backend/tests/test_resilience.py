# -*- coding: utf-8 -*-
"""
tests/test_resilience.py — Tests de résilience réseau (priorité 5)
=====================================================================
Ces tests ne dépendent d'AUCUN réseau externe réel : Gemini/Groq sont
simulés en monkeypatchant `httpx.AsyncClient.post` (les domaines
generativelanguage.googleapis.com et api.groq.com ne sont d'ailleurs pas
joignables depuis cet environnement de développement — c'est la bonne
pratique de test de toute façon : on ne doit jamais dépendre d'un service
tiers réel pour valider sa propre logique de fallback).

Lancer : cd backend && pytest tests/test_resilience.py -v
"""
import asyncio
import time

import httpx
import pytest
from starlette.requests import Request
from sqlalchemy.exc import OperationalError

import resilience
from routers import chat as chat_router


# ---------------------------------------------------------------------------
# CircuitBreaker — unitaire, sans réseau
# ---------------------------------------------------------------------------
def test_breaker_closed_by_default():
    b = resilience.CircuitBreaker(name="t1", failure_threshold=3, cooldown_seconds=10)
    assert b.state == "closed"
    b.before_call()  # ne doit pas lever


def test_breaker_opens_after_threshold_failures():
    b = resilience.CircuitBreaker(name="t2", failure_threshold=2, cooldown_seconds=10)
    b.on_failure()
    assert b.state == "closed"  # 1 échec < seuil de 2
    b.on_failure()
    assert b.state == "open"
    with pytest.raises(resilience.CircuitOpenError):
        b.before_call()


def test_breaker_success_resets_failure_count():
    b = resilience.CircuitBreaker(name="t3", failure_threshold=2, cooldown_seconds=10)
    b.on_failure()
    b.on_success()
    b.on_failure()
    assert b.state == "closed"  # le compteur a été remis à zéro par on_success()


def test_breaker_half_open_after_cooldown():
    b = resilience.CircuitBreaker(name="t4", failure_threshold=1, cooldown_seconds=0.05)
    b.on_failure()
    assert b.state == "open"
    time.sleep(0.08)
    assert b.state == "half-open"
    b.before_call()  # half-open laisse passer l'appel de test


# ---------------------------------------------------------------------------
# call_with_resilience — retry + classification transitoire vs définitive
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_retries_on_transient_error_then_succeeds():
    b = resilience.CircuitBreaker(name="t5", failure_threshold=5, cooldown_seconds=10)
    calls = {"n": 0}

    async def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ConnectError("panne réseau simulée")
        return "ok"

    result = await resilience.call_with_resilience(flaky, b, max_attempts=2, base_delay=0.01)
    assert result == "ok"
    assert calls["n"] == 2
    assert b.state == "closed"  # succès final -> disjoncteur toujours fermé


@pytest.mark.asyncio
async def test_no_retry_on_4xx_client_error():
    b = resilience.CircuitBreaker(name="t6", failure_threshold=5, cooldown_seconds=10)
    calls = {"n": 0}

    async def bad_key():
        calls["n"] += 1
        request = httpx.Request("POST", "https://example.invalid/api")
        response = httpx.Response(401, request=request, json={"error": "invalid api key"})
        raise httpx.HTTPStatusError("401", request=request, response=response)

    with pytest.raises(httpx.HTTPStatusError):
        await resilience.call_with_resilience(bad_key, b, max_attempts=3, base_delay=0.01)
    assert calls["n"] == 1  # PAS de retry sur une 4xx : échec rapide et net
    assert b.status()["consecutive_failures"] == 1


@pytest.mark.asyncio
async def test_breaker_fails_fast_without_touching_network_once_open():
    b = resilience.CircuitBreaker(name="t7", failure_threshold=1, cooldown_seconds=10)
    network_touched = {"count": 0}

    async def always_fails():
        network_touched["count"] += 1
        raise httpx.ConnectError("panne")

    with pytest.raises(httpx.ConnectError):
        await resilience.call_with_resilience(always_fails, b, max_attempts=1)
    assert b.state == "open"

    # Deuxième appel : le disjoncteur est ouvert, le réseau ne doit PAS être sollicité.
    with pytest.raises(resilience.CircuitOpenError):
        await resilience.call_with_resilience(always_fails, b, max_attempts=1)
    assert network_touched["count"] == 1  # toujours 1 : le 2e appel n'a pas touché le réseau


# ---------------------------------------------------------------------------
# /chat — fallback Gemini -> Groq réel (bug corrigé dans cette session : avant,
# une panne réseau Gemini plantait l'endpoint en 500 brut au lieu de basculer)
# ---------------------------------------------------------------------------
@pytest.fixture
def client_with_fake_auth(monkeypatch):
    """TestClient FastAPI avec get_current_user court-circuité (pas besoin de
    login réel pour tester la logique réseau) et disjoncteurs réinitialisés."""
    import main
    resilience.GEMINI_BREAKER._failures = 0
    resilience.GEMINI_BREAKER._opened_at = None
    resilience.GROQ_BREAKER._failures = 0
    resilience.GROQ_BREAKER._opened_at = None

    fake_user = main.models.User(id="u1", username="dr.test", full_name="Dr. Test",
                                  role="surgeon", hashed_password="x", is_active=True)
    main.app.dependency_overrides[main.get_current_user] = lambda: fake_user
    from fastapi.testclient import TestClient
    yield TestClient(main.app), main
    main.app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_chat_falls_back_from_gemini_to_groq_on_network_failure(client_with_fake_auth, monkeypatch):
    client, main = client_with_fake_auth
    monkeypatch.setattr(chat_router, "GEMINI_KEY", "fake-gemini-key")
    monkeypatch.setattr(chat_router, "GROQ_KEY", "fake-groq-key")

    async def fake_post(self, url, *args, **kwargs):
        if "generativelanguage" in url:
            raise httpx.ConnectError("Gemini injoignable (panne simulée)")
        if "groq.com" in url:
            request = httpx.Request("POST", url)
            return httpx.Response(200, request=request,
                                   json={"choices": [{"message": {"content": "Réponse de secours via Groq"}}]})
        raise AssertionError(f"URL inattendue dans le test: {url}")

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    r = client.post("/chat", json={"message": "Quel est le stade T du larynx ?", "specialty": "laryngologie"})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "groq"
    assert body["fallback_from"] == "gemini"
    assert "secours" in body["reply"]


@pytest.mark.asyncio
async def test_chat_returns_clean_503_when_all_providers_down(client_with_fake_auth, monkeypatch):
    client, main = client_with_fake_auth
    monkeypatch.setattr(chat_router, "GEMINI_KEY", "fake-gemini-key")
    monkeypatch.setattr(chat_router, "GROQ_KEY", "fake-groq-key")

    async def always_down(self, url, *args, **kwargs):
        raise httpx.ConnectError("panne réseau totale (simulée)")

    monkeypatch.setattr(httpx.AsyncClient, "post", always_down)

    r = client.post("/chat", json={"message": "test", "specialty": "laryngologie"})
    assert r.status_code == 503
    detail = r.json()["detail"]
    assert "indisponibles" in detail
    # Le message reste utilisable et rassurant, pas une trace Python brute :
    assert "Traceback" not in detail and "ConnectError" not in detail


@pytest.mark.asyncio
async def test_chat_breaker_opens_and_subsequent_calls_fail_fast(client_with_fake_auth, monkeypatch):
    """Après plusieurs pannes consécutives, le disjoncteur Gemini doit s'ouvrir :
    les appels suivants ne doivent plus du tout solliciter le réseau Gemini
    (ils basculent directement sur Groq), donc doivent être nettement plus
    rapides que le premier — c'est tout l'intérêt du disjoncteur."""
    client, main = client_with_fake_auth
    monkeypatch.setattr(chat_router, "GEMINI_KEY", "fake-gemini-key")
    monkeypatch.setattr(chat_router, "GROQ_KEY", "fake-groq-key")
    gemini_calls = {"n": 0}

    async def flaky_post(self, url, *args, **kwargs):
        if "generativelanguage" in url:
            gemini_calls["n"] += 1
            await asyncio.sleep(0.05)  # simule une latence réseau avant l'échec
            raise httpx.ConnectError("Gemini injoignable (simulé)")
        request = httpx.Request("POST", url)
        return httpx.Response(200, request=request,
                               json={"choices": [{"message": {"content": "ok groq"}}]})

    monkeypatch.setattr(httpx.AsyncClient, "post", flaky_post)

    # Seuil par défaut du disjoncteur Gemini = 3 échecs consécutifs.
    for _ in range(3):
        r = client.post("/chat", json={"message": "test", "specialty": "laryngologie"})
        assert r.status_code == 200

    assert resilience.GEMINI_BREAKER.state == "open"
    calls_before = gemini_calls["n"]
    assert calls_before == 3  # max_attempts=1 côté /chat (pas de retry interne pour un chat interactif)

    r = client.post("/chat", json={"message": "test", "specialty": "laryngologie"})
    assert r.status_code == 200
    assert r.json()["source"] == "groq"
    # Le disjoncteur étant ouvert, Gemini n'a PAS été retenté :
    assert gemini_calls["n"] == calls_before


# ---------------------------------------------------------------------------
# Gestionnaires d'exceptions globaux — aucune trace brute renvoyée au client
# ---------------------------------------------------------------------------
def _fake_request(path="/patients/P001") -> Request:
    scope = {"type": "http", "method": "GET", "path": path, "headers": [], "query_string": b"",
              "client": ("127.0.0.1", 1234), "scheme": "http", "server": ("testserver", 80)}
    return Request(scope)


@pytest.mark.asyncio
async def test_unhandled_exception_handler_sanitizes_response():
    import main
    exc = ValueError("mot de passe secret ou détail interne sensible")
    response = await main.unhandled_exception_handler(_fake_request(), exc)
    assert response.status_code == 500
    body = response.body.decode()
    assert "error_id" in body
    assert "mot de passe secret" not in body  # le détail de l'exception ne fuite pas au client


@pytest.mark.asyncio
async def test_db_unavailable_handler_returns_503():
    import main
    exc = OperationalError("SELECT 1", {}, Exception("connexion refusée"))
    response = await main.db_unavailable_handler(_fake_request(), exc)
    assert response.status_code == 503
    body = response.body.decode()
    assert "indisponible" in body
    assert "error_id" in body
