# -*- coding: utf-8 -*-
"""
db.py — Connexion base de données (PostgreSQL en production).

Par défaut, si DATABASE_URL n'est pas configurée dans .env, on retombe sur
un fichier SQLite local (./ophtalmosurg.db) afin que l'application démarre
sans dépendance externe pour le développement. En production, définissez :

    DATABASE_URL=postgresql+psycopg2://user:password@host:5432/ophtalmosurg

Un docker-compose.yml est fourni à la racine du backend pour lancer un
PostgreSQL local en une commande : `docker compose up -d db`.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./ophtalmosurg.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dépendance FastAPI : une session DB par requête, toujours fermée proprement."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Filet de sécurité pour le développement : crée les tables si elles n'existent
    pas encore (idempotent). En production, préférez les migrations Alembic
    versionnées (`alembic upgrade head`) — voir migrations/README.md.
    """
    import models  # noqa: F401 (assure l'enregistrement des modèles sur Base.metadata)
    Base.metadata.create_all(bind=engine)
