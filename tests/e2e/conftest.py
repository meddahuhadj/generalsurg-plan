# -*- coding: utf-8 -*-
"""Configuration pytest des tests E2E (Playwright) de l'application SPA OphtalmoSurg Plan.

La suite sert l'application statique (index.html + assets) via ``python -m http.server``
puis pilote Chromium headless. Aucun backend n'est nécessaire : la SPA tourne en
« mode démo » (``apiBase`` vide), et c'est précisément ce parcours — celui que voit un
chirurgien sans backend — qui est validé ici.

Lancement ciblé :
    pytest tests/e2e -q
"""

import os
import subprocess
import sys
import time
import urllib.request

import pytest

pytest.importorskip("playwright")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Erreurs « bénignes » tolérées en mode démo : le pipeline démo POST parfois vers le
# backend absent et le serveur statique répond alors 501 (Unsupported method). Ce n'est
# pas un bug de la SPA, c'est le comportement attendu sans backend — tout le reste
# (pageerror, échec CDN, 404, etc.) fait échouer les tests.
ALLOWED_CONSOLE_PATTERNS = ("status of 501",)
ALLOWED_HTTP_STATUSES = (501,)


def _free_port():
    import socket

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def base_url():
    """Serveur statique racine du dépôt, arrêté à la fin de la session."""
    port = _free_port()
    proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=REPO_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    url = "http://127.0.0.1:%d" % port
    for _ in range(50):
        try:
            with urllib.request.urlopen(url + "/index.html", timeout=1):
                break
        except OSError:
            time.sleep(0.1)
    yield url
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.fixture(scope="session")
def browser():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        try:
            b = p.chromium.launch(headless=True)
        except Exception as exc:  # Chromium non installé (playwright install chromium)
            pytest.skip("Chromium Playwright indisponible : %s" % exc)
        yield b
        b.close()


@pytest.fixture()
def page(browser):
    """Page neuve par test, avec diagnostic console/réseau attaché (page.diag_errors).

    La locale est fixée à fr-FR pour que l'app démarre déterministe en français
    (l'app détecte la langue via navigator.language) — le test i18n bascule ensuite
    explicitement vers l'anglais.
    """
    context = browser.new_context(viewport={"width": 1440, "height": 900}, locale="fr-FR")
    pg = context.new_page()
    pg.diag_errors = []
    pg.on(
        "console",
        lambda m: pg.diag_errors.append(("console", m.type, m.text))
        if m.type == "error"
        else None,
    )
    pg.on("pageerror", lambda e: pg.diag_errors.append(("pageerror", "uncaught", str(e))))
    pg.on(
        "response",
        lambda r: pg.diag_errors.append(("http", r.status, "%s %s" % (r.request.method, r.url)))
        if r.status >= 400
        else None,
    )
    yield pg
    context.close()


@pytest.fixture()
def app(page, base_url):
    """Charge l'application et attend le hub (premier écran)."""
    page.goto(base_url + "/index.html", wait_until="load", timeout=30000)
    page.wait_for_selector("#hub-cards .hub-card", timeout=20000)
    return page


def select_module(page, title, module_id):
    """Ouvre un module depuis le hub et attend la fin du boot (viewport 3D dimensionné)."""
    page.locator(".hub-card", has_text=title).first.click()
    page.wait_for_function(
        "() => document.body.getAttribute('data-mod') === '%s' && "
        "document.getElementById('gl-canvas') && document.getElementById('gl-canvas').clientWidth > 50"
        % module_id,
        timeout=20000,
    )
    page.wait_for_timeout(800)


def assert_clean_console(page):
    """Échoue si une erreur non tolérée (pageerror, console, HTTP >= 400) est survenue."""
    bad = [
        e
        for e in page.diag_errors
        if e[0] == "pageerror"
        or (e[0] == "console" and not any(p in e[2] for p in ALLOWED_CONSOLE_PATTERNS))
        or (e[0] == "http" and e[1] not in ALLOWED_HTTP_STATUSES)
    ]
    assert not bad, "Erreurs console/réseau non tolérées : %s" % bad[:6]
