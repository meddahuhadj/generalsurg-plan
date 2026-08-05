# -*- coding: utf-8 -*-
"""Tests unitaires isolés pour backend/resilience.py (CircuitBreaker, RateLimiter, retry)."""

import sys
import os
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
import resilience
from resilience import CircuitBreaker, CircuitOpenError, RateLimiter


@pytest.fixture(autouse=True)
def _windows_selector_event_loop():
    """Sur Windows, quand cette suite tourne dans la même session pytest que
    des tests utilisant `TestClient` (portail anyio en arrière-plan, ex.
    tests/test_auth_patients_dicom.py), le ProactorEventLoop par défaut a une
    sémantique de détection de boucle "running" qui entre en conflit avec le
    Runner de pytest-asyncio (`Runner.run() cannot be called from a running
    event loop`). Le SelectorEventLoop n'a pas ce comportement. Restreint à
    ce fichier (pas un réglage global en conftest.py) car le SelectorEventLoop
    ne supporte PAS la création de sous-processus sur Windows — nécessaire
    aux tests e2e Playwright (tests/e2e/) qui tournent dans la même session.
    """
    if sys.platform == "win32":
        previous = asyncio.get_event_loop_policy()
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        yield
        asyncio.set_event_loop_policy(previous)
    else:
        yield


class TestCircuitBreaker:
    def test_initial_state_is_closed(self):
        cb = CircuitBreaker("test")
        assert cb.state == "closed"

    def test_failure_increments_count(self):
        cb = CircuitBreaker("test", failure_threshold=3)
        cb.on_failure()
        assert cb._failures == 1
        assert cb.state == "closed"

    def test_opens_after_threshold_failures(self):
        cb = CircuitBreaker("test", failure_threshold=3)
        cb.on_failure()
        cb.on_failure()
        assert cb.state == "closed"
        cb.on_failure()
        assert cb.state == "open"

    def test_open_circuit_raises_before_call(self):
        cb = CircuitBreaker("test", failure_threshold=1)
        cb.on_failure()
        with pytest.raises(CircuitOpenError, match="Disjoncteur"):
            cb.before_call()

    def test_success_resets_failures(self):
        cb = CircuitBreaker("test", failure_threshold=3)
        cb.on_failure()
        cb.on_failure()
        cb.on_success()
        assert cb._failures == 0
        assert cb.state == "closed"

    def test_half_open_after_cooldown(self):
        cb = CircuitBreaker("test", failure_threshold=1, cooldown_seconds=0.01)
        cb.on_failure()
        assert cb.state == "open"
        import time
        time.sleep(0.02)
        assert cb.state == "half-open"

    def test_half_open_allows_call(self):
        cb = CircuitBreaker("test", failure_threshold=1, cooldown_seconds=0.01)
        cb.on_failure()
        import time
        time.sleep(0.02)
        cb.before_call()

    def test_success_in_half_open_closes(self):
        cb = CircuitBreaker("test", failure_threshold=1, cooldown_seconds=0.01)
        cb.on_failure()
        import time
        time.sleep(0.02)
        assert cb.state == "half-open"
        cb.on_success()
        assert cb.state == "closed"

    def test_status_returns_dict(self):
        cb = CircuitBreaker("test", failure_threshold=5)
        cb.on_failure()
        s = cb.status()
        assert s["name"] == "test"
        assert s["state"] == "closed"
        assert s["consecutive_failures"] == 1


class TestRateLimiter:
    def test_allows_within_limit(self):
        rl = RateLimiter("test", max_attempts=3, window_seconds=60.0)
        rl.check("ip1")
        rl.check("ip1")
        rl.check("ip1")

    def test_blocks_over_limit(self):
        from fastapi import HTTPException
        rl = RateLimiter("test", max_attempts=2, window_seconds=60.0)
        rl.check("ip1")
        rl.check("ip1")
        with pytest.raises(HTTPException) as exc_info:
            rl.check("ip1")
        assert exc_info.value.status_code == 429
        assert "Retry-After" in exc_info.value.headers

    def test_separate_keys_independent(self):
        rl = RateLimiter("test", max_attempts=1, window_seconds=60.0)
        rl.check("ip1")
        with pytest.raises(Exception):
            rl.check("ip1")
        rl.check("ip2")

    def test_window_expires_resets_count(self):
        rl = RateLimiter("test", max_attempts=2, window_seconds=0.01)
        rl.check("ip1")
        rl.check("ip1")
        import time
        time.sleep(0.02)
        rl.check("ip1")


class TestIsTransient:
    def test_timeout_is_transient(self):
        import httpx
        assert resilience._is_transient(httpx.TimeoutException("timeout")) is True

    def test_connect_error_is_transient(self):
        import httpx
        assert resilience._is_transient(httpx.ConnectError("refused")) is True

    def test_500_is_transient(self):
        import httpx
        resp = httpx.Response(500)
        exc = httpx.HTTPStatusError("error", request=httpx.Request("GET", "http://x"), response=resp)
        assert resilience._is_transient(exc) is True

    def test_400_is_not_transient(self):
        import httpx
        resp = httpx.Response(400)
        exc = httpx.HTTPStatusError("error", request=httpx.Request("GET", "http://x"), response=resp)
        assert resilience._is_transient(exc) is False

    def test_generic_exception_not_transient(self):
        assert resilience._is_transient(ValueError("nope")) is False

    def test_dimse_connection_error_is_transient(self):
        class DimseConnectionError(Exception):
            pass
        assert resilience._is_transient(DimseConnectionError()) is True

    def test_mllp_error_is_transient(self):
        class MllpError(Exception):
            pass
        assert resilience._is_transient(MllpError()) is True


class TestCallWithResilience:
    @pytest.mark.asyncio
    async def test_success_calls_once(self):
        cb = CircuitBreaker("test", failure_threshold=3)
        call_count = 0

        async def fn():
            nonlocal call_count
            call_count += 1
            return "ok"

        result = await resilience.call_with_resilience(fn, cb, max_attempts=3, base_delay=0.01)
        assert result == "ok"
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_retries_on_transient_error(self):
        cb = CircuitBreaker("test", failure_threshold=5)
        call_count = 0
        import httpx

        async def fn():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise httpx.TimeoutException("timeout")
            return "recovered"

        result = await resilience.call_with_resilience(fn, cb, max_attempts=3, base_delay=0.01)
        assert result == "recovered"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_fails_fast_on_non_transient(self):
        cb = CircuitBreaker("test", failure_threshold=5)
        call_count = 0
        import httpx

        async def fn():
            nonlocal call_count
            call_count += 1
            resp = httpx.Response(400)
            raise httpx.HTTPStatusError("bad", request=httpx.Request("GET", "http://x"), response=resp)

        with pytest.raises(httpx.HTTPStatusError):
            await resilience.call_with_resilience(fn, cb, max_attempts=3, base_delay=0.01)
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_opens_circuit_after_failures(self):
        cb = CircuitBreaker("test", failure_threshold=2, cooldown_seconds=60.0)
        import httpx

        async def fn():
            raise httpx.TimeoutException("timeout")

        with pytest.raises(httpx.TimeoutException):
            await resilience.call_with_resilience(fn, cb, max_attempts=1, base_delay=0.01)
        with pytest.raises(httpx.TimeoutException):
            await resilience.call_with_resilience(fn, cb, max_attempts=1, base_delay=0.01)
        assert cb.state == "open"
        with pytest.raises(CircuitOpenError):
            await resilience.call_with_resilience(fn, cb, max_attempts=1, base_delay=0.01)
