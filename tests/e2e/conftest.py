# -*- coding: utf-8 -*-
"""Configuration pytest des tests E2E (Playwright) de l'application SPA OphtalmoSurg Plan.

La suite sert l'application statique (index.html + assets) via ``python -m http.server``
puis pilote Chromium headless. Deux familles de tests :

1. Mode démo (``base_url`` seul) : la SPA tourne sans backend (``apiBase`` vide) — le
   parcours que voit un chirurgien sans backend est validé ici (tests/test_app_e2e.py).
2. Mode backend réel (``base_url`` + ``backend_url``) : la SPA est branchée sur un
   backend FastAPI réel démarré par la fixture ``backend_url`` (base de données SQLite
   temporaire isolée, secrets dédiés) — c'est le parcours « planification réelle »
   (tests/test_workflow_e2e.py) : upload DICOM zero-touch, workflow 3-clics, exports.

Lancement ciblé :
    pytest tests/e2e -q            # tout
    pytest tests/e2e/test_workflow_e2e.py -q   # uniquement le parcours backend réel
"""

import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

import pytest

pytest.importorskip("playwright")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")

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
def backend_url(base_url):
    """Backend FastAPI réel, démarré isolé pour la session et arrêté à la fin.

    - Base SQLite temporaire (jamais le fichier de dev du dépôt) -> tables créées
      par init_db(), utilisateurs + patients de démo seedés sur base vierge.
    - Stockages DICOM / workflow redirigés vers le répertoire temporaire.
    - JWT_SECRET fixe (le frontend récupère son jeton du même process, mais un secret
      stable rend la session déterministe) et APP_ENV=development (sinon le garde-fou
      anti-mauvaise-config refuse le démarrage avec les comptes de démo).
    - ALLOWED_ORIGINS contient l'origine du serveur statique : les appels fetch de la
      SPA vers ce backend sont légitimes (navigateur), on ne les compte pas en erreur.
    """
    port = _free_port()
    url = "http://127.0.0.1:%d" % port
    work = tempfile.mkdtemp(prefix="ophtalmo_e2e_")
    env = os.environ.copy()
    env.update({
        "DATABASE_URL": "sqlite:///%s/e2e.db" % work.replace("\\", "/"),
        "WORKFLOW_STORAGE_DIR": os.path.join(work, "workflows"),
        "DICOM_STORAGE_DIR": os.path.join(work, "dicom_series"),
        "JWT_SECRET": "e2e-test-secret-not-for-production",
        "SEED_DEMO_USERS": "true",
        "APP_ENV": "development",
        "WORKFLOW_AUTO_TRIGGER": "true",
        "ALLOWED_ORIGINS": "%s,http://localhost" % base_url,
        "LOG_LEVEL": "ERROR",
    })
    log_path = os.path.join(work, "backend.log")
    with open(log_path, "w", encoding="utf-8") as logf:
        proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1",
             "--port", str(port), "--log-level", "error"],
            cwd=BACKEND_DIR, env=env, stdout=logf, stderr=subprocess.STDOUT,
        )
    ready = False
    for _ in range(120):
        if proc.poll() is not None:
            break
        try:
            with urllib.request.urlopen(url + "/health", timeout=1):
                ready = True
                break
        except OSError:
            time.sleep(0.25)
    if not ready:
        tail = ""
        try:
            with open(log_path, encoding="utf-8") as lf:
                tail = lf.read()[-3000:]
        except OSError:
            pass
        proc.kill()
        pytest.fail("Backend FastAPI non démarré (port %d) :\n%s" % (port, tail))
    yield url
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
    shutil.rmtree(work, ignore_errors=True)


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
