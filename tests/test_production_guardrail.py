# -*- coding: utf-8 -*-
"""
test_production_guardrail.py — Vérifie que le garde-fou APP_ENV=production de
backend/main.py (lignes ~86-140) refuse réellement de démarrer sur une
configuration non sûre (JWT_SECRET par défaut, comptes de démo actifs, CORS
wildcard, DATABASE_URL sqlite).

Ce garde-fou n'avait jusqu'ici aucun test : il s'exécute au moment de
l'import du module (avant même la création de l'objet FastAPI), donc
invisible à la fixture `client` partagée (conftest.py) qui a déjà importé
`backend.main` avec un jeu de variables d'environnement fixé pour toute la
session. Chaque scénario nécessite donc un import frais dans un
sous-processus dédié — voir tests/_subprocess_boot.py.
"""

import pytest

from _subprocess_boot import BACKEND_DIR, run_boot_script

_IMPORT_ONLY_SCRIPT = (
    f"import sys; sys.path.insert(0, {str(BACKEND_DIR)!r})\n"
    "import main\n"
    "print('BOOTED_OK')\n"
)

_SAFE_ENV = {
    "APP_ENV": "production",
    "JWT_SECRET": "a-real-random-secret-not-default-1234567890",
    "SEED_DEMO_USERS": "false",
    "ALLOWED_ORIGINS": "https://pilote.hopital.example",
    "DATABASE_URL": "postgresql+psycopg2://user:pass@localhost:5432/wont_connect",
}


@pytest.mark.parametrize("key,value", [
    ("JWT_SECRET", "CHANGEZ-MOI-EN-PRODUCTION"),
    ("SEED_DEMO_USERS", "true"),
    ("ALLOWED_ORIGINS", "*"),
    ("DATABASE_URL", "sqlite:///./rejected.db"),
])
def test_production_boot_refuses_unsafe_config(key, value):
    env = dict(_SAFE_ENV)
    env[key] = value
    result = run_boot_script(_IMPORT_ONLY_SCRIPT, env)
    assert result.returncode != 0, result.stdout + result.stderr
    assert "BOOTED_OK" not in result.stdout
    assert "Démarrage refusé" in result.stderr


def test_production_boot_refuses_when_jwt_secret_unset():
    env = dict(_SAFE_ENV)
    env["JWT_SECRET"] = None  # supprime la variable héritée du process pytest parent
    result = run_boot_script(_IMPORT_ONLY_SCRIPT, env)
    assert result.returncode != 0, result.stdout + result.stderr
    assert "BOOTED_OK" not in result.stdout


def test_development_boot_accepts_same_config_that_production_rejects(tmp_path):
    """Contrôle négatif : la même configuration non sûre ne bloque PAS le
    démarrage hors production (workflow de dev existant, ne doit pas casser)."""
    db_path = tmp_path / "dev_guardrail_check.db"
    env = dict(_SAFE_ENV)
    env["APP_ENV"] = "development"
    env["JWT_SECRET"] = "CHANGEZ-MOI-EN-PRODUCTION"
    env["SEED_DEMO_USERS"] = "true"
    env["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    result = run_boot_script(_IMPORT_ONLY_SCRIPT, env)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "BOOTED_OK" in result.stdout
