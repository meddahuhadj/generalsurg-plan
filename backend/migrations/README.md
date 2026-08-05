# Migrations — OphtalmoSurg Plan

Deux façons d'obtenir le schéma en base, du plus simple au plus rigoureux :

## 1. Développement rapide (SQLite, zero-config)
Ne rien faire : `main.py` appelle `init_db()` au démarrage, qui crée les tables
manquantes automatiquement (`CREATE TABLE IF NOT EXISTS` via SQLAlchemy). C'est
un **filet de sécurité**, pas un système de migration versionné.

## 2. Production (PostgreSQL, migrations versionnées avec Alembic)

```bash
# 1. Démarrer PostgreSQL
docker compose up -d db

# 2. Configurer .env
DATABASE_URL=postgresql+psycopg2://ophtalmosurg:ophtalmosurg@localhost:5432/ophtalmosurg

# 3. Appliquer les migrations
alembic -c migrations/alembic.ini upgrade head
```

## Créer une nouvelle migration après avoir modifié models.py

```bash
alembic -c migrations/alembic.ini revision --autogenerate -m "description du changement"
# Relisez TOUJOURS le fichier généré dans versions/ avant de l'appliquer :
# l'autogénération ne détecte pas tout (renommages de colonnes, etc.)
alembic -c migrations/alembic.ini upgrade head
```

## Revenir en arrière

```bash
alembic -c migrations/alembic.ini downgrade -1   # une migration en arrière
alembic -c migrations/alembic.ini downgrade base # tout annuler
```

## Fichiers

- `schema.sql` — schéma SQL de référence, lisible directement (pour audit/revue).
- `env.py` — point d'entrée Alembic, câblé sur `models.py` (import de `Base.metadata`).
- `script.py.mako` — gabarit utilisé pour générer chaque nouveau fichier de migration.
- `versions/` — historique des migrations versionnées (généré, ne pas éditer à la main
  sauf pour corriger une autogénération imparfaite).
