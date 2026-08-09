# -*- coding: utf-8 -*-
"""
conftest.py — permet `from backend.main import app` de fonctionner depuis la racine du dépôt.

`backend/main.py` importe ses propres modules avec des chemins relatifs à `backend/`
(ex. `from db import get_db`, cohérent avec le mode d'exécution documenté
`cd backend && uvicorn main:app`). Pour que les tests situés dans `tests/` (à la racine,
hors de `backend/`) puissent importer `backend.main` sans dupliquer le serveur, on ajoute
`backend/` à `sys.path` avant la collecte des tests.
"""

import os
import sys
import tempfile
from pathlib import Path

import pytest

_BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

# ---------------------------------------------------------------------------
# Base de données de test isolée
# ---------------------------------------------------------------------------
# Sans ceci, les tests retombent sur DATABASE_URL par défaut de db.py
# (sqlite:///./orlsurgplan3d.db), c'est-à-dire la même base que celle utilisée
# en dev local (`uvicorn main:app --reload`) : un test qui crée/supprime un
# patient pollue alors les données de dev, et le contenu des tests dépend de
# l'historique local de la machine. On pointe donc vers un fichier temporaire
# dédié à la session de test (pas ":memory:" : chaque Session() ouvrirait sa
# propre connexion, donc sa propre base vide, en l'absence de StaticPool).
# `setdefault` : un DATABASE_URL déjà positionné explicitement (ex. pour
# tester contre un vrai PostgreSQL) reste prioritaire.
_TEST_DB_PATH = Path(tempfile.gettempdir()) / f"orlsurgplan3d_test_{os.getpid()}.db"
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TEST_DB_PATH.as_posix()}")
os.environ.setdefault("SEED_DEMO_USERS", "true")
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production-use")
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("RESEARCH_MODE", "false")

# Isolation du stockage des maillages : les tests (planification chirurgicale,
# organe synthétique de démo) écrivent des .glb dans MESH_STORAGE ; on pointe
# vers un dossier temporaire dédié pour ne pas polluer ./storage/meshes du dev.
_TEST_MESH_DIR = Path(tempfile.gettempdir()) / f"orlsurgplan3d_meshes_test_{os.getpid()}"
os.environ.setdefault("MESH_STORAGE_DIR", str(_TEST_MESH_DIR))


@pytest.fixture(scope="session")
def client():
    """TestClient FastAPI partagé pour toute la session de test.

    Le `with` déclenche l'événement `startup` de l'app (création des tables +
    seed des comptes de démo dr.hadj/dr.benali) exactement une fois, contre le
    fichier temporaire ci-dessus — jamais contre backend/orlsurgplan3d.db.
    """
    from fastapi.testclient import TestClient
    from backend.main import app

    with TestClient(app) as c:
        yield c

    # Sous Windows, SQLite garde le fichier ouvert tant que les connexions du
    # pool SQLAlchemy n'ont pas été explicitement fermées : sans ce dispose(),
    # unlink() échoue avec PermissionError (fichier utilisé par le process).
    import db as dbmod
    dbmod.engine.dispose()
    _TEST_DB_PATH.unlink(missing_ok=True)


@pytest.fixture(autouse=True)
def _reset_auth_rate_limiter():
    """`resilience.AUTH_RATE_LIMITER`/`TWOFA_VERIFY_RATE_LIMITER`/`REGISTER_RATE_LIMITER`
    sont des singletons en mémoire du process (backend/resilience.py), partagés
    par toute la session de test puisque `client` est session-scoped. Les vider
    avant chaque test évite qu'un test qui multiplie les tentatives (ex. le test
    du rate limiting lui-même) ne fasse échouer un autre test avec un 429
    imprévisible.

    Import volontairement en `import resilience` (nom court, pas
    `backend.resilience`) : c'est exactement ainsi que `backend/main.py`
    importe ce module (voir sys.path.insert ci-dessus) — un import
    `backend.resilience` chargerait une DEUXIÈME instance du module, avec son
    propre singleton, sans aucun effet sur celui réellement utilisé par l'API.
    """
    import resilience
    resilience.AUTH_RATE_LIMITER._hits.clear()
    resilience.TWOFA_VERIFY_RATE_LIMITER._hits.clear()
    resilience.REGISTER_RATE_LIMITER._hits.clear()
    yield
