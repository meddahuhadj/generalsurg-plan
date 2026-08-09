# -*- coding: utf-8 -*-
"""
_subprocess_boot.py — Utilitaire partagé : démarre backend/main.py dans un
process séparé avec un jeu de variables d'environnement contrôlé.

Nécessaire car APP_ENV, JWT_SECRET, SEED_DEMO_USERS, BOOTSTRAP_ADMIN_* sont
tous lus une seule fois à l'import de main.py — invisibles à un monkeypatch
dans le process qui a déjà importé backend.main via la fixture `client`
partagée (conftest.py, session-scoped).
"""

import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"


def run_boot_script(script_body: str, env_overrides: dict, timeout: int = 30) -> subprocess.CompletedProcess:
    """Exécute `script_body` (code Python) dans un sous-processus dont
    l'environnement est celui du process courant, surchargé par `env_overrides`.

    Une valeur `None` dans `env_overrides` supprime la variable de
    l'environnement du sous-processus (nécessaire pour tester le cas "variable
    absente" — ex. JWT_SECRET non défini — alors que le process pytest parent
    l'a lui-même positionnée via tests/conftest.py ; un simple `dict.update()`
    ne peut jamais supprimer une clé héritée du process parent).
    """
    env = os.environ.copy()
    for key, value in env_overrides.items():
        if value is None:
            env.pop(key, None)
        else:
            env[key] = value
    return subprocess.run(
        [sys.executable, "-c", script_body],
        env=env, capture_output=True, text=True, timeout=timeout,
    )
