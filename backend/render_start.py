# -*- coding: utf-8 -*-
"""
render_start.py — Lanceur pour Render.com (cold start court, port visible immédiatement).
=========================================================================================
Problème résolu : Render scanne les ports du conteneur pendant un temps limité
au démarrage. Uvicorn, lui, ne lie la socket d'écoute QU'UNE FOIS l'application
importée ET le lifespan terminé. Or l'import de l'app (FastAPI + routers, dont
pacs_router -> dicomweb_client -> pydicom) prend déjà ~23 s sur une machine de
bureau ; sur le 0,1 vCPU du plan gratuit Render, cela peut dépasser la fenêtre
du scan de port, d'où l'échec "Port scan timeout reached, no open ports detected".

Solution : cette socket est liée et mise en écoute AVANT tout import de l'app
(seuls os/socket/uvicorn sont importés). Le scan Render voit donc le port ouvert
immédiatement, pendant que uvicorn importe backend.main en arrière-plan et
commence à accepter les connexions (le health check Render /health ne répond
que quand l'app est prête, ce qui est acceptable : la fenêtre de health check
de Render est beaucoup plus large que celle du scan de port).

Usage (Dockerfile.render) :
    CMD ["sh", "-c", "python backend/render_start.py"]
"""

import os
import socket
import sys

# /app/backend doit être sur sys.path : main.py et ses modules importent à plat
# (from db import ..., import routers.*) — "uvicorn backend.main:app" depuis /app
# échouerait sinon (ModuleNotFoundError: No module named 'db'). app_dir le
# garantit sous uvicorn ; ce sys.path direct sert d'appoint pour le reste.
_APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
for _p in (_BACKEND_DIR, _APP_ROOT):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import uvicorn  # noqa: E402

PORT = int(os.environ.get("PORT", "10000"))


def main() -> None:
    # Lie la socket AVANT l'import de l'application : le port est détectable
    # par le scan Render dès les premières millisecondes du processus.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", PORT))
    sock.listen(128)
    sock.set_inheritable(True)

    config = uvicorn.Config(
        "main:app",
        app_dir=_BACKEND_DIR,
        host="0.0.0.0",
        port=PORT,
        workers=1,
        log_level=os.environ.get("LOG_LEVEL", "info").lower(),
    )
    server = uvicorn.Server(config)
    # sockets=[sock] : uvicorn réutilise la socket pré-liée au lieu d'en
    # rebinder une après l'import de l'app.
    server.run(sockets=[sock])


if __name__ == "__main__":
    main()
