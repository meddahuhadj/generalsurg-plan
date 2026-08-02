# -*- coding: utf-8 -*-
"""
conftest.py — rend les tests de backend/tests/ importables standalone.

Les modules de `backend/` (ex. `mllp_client`, `resilience`) s'importent avec
des chemins courts relatifs à `backend/` (cohérent avec le mode d'exécution
documenté `cd backend && pytest tests/...`). Quand la suite est lancée depuis
la racine du dépôt (`pytest backend/tests tests`), ces imports échouent sans
ajout de `backend/` à sys.path.

Le conftest de `tests/conftest.py` (racine) le fait déjà pour toute la session
— mais pas quand on lance un seul fichier de `backend/tests/` indépendamment.
Ce conftest rend chaque fichier de ce dossier autonome, quelle que soit la
cible de la commande pytest.
"""

import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
