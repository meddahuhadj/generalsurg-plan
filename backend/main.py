# -*- coding: utf-8 -*-
"""
OphtalmoSurg Plan — Backend Sécurisé v2.0 (ophtalmologie)
==================================================================
Version "production-ready" (priorité 1 de la feuille de route) :
  ✓ Authentification forte : mot de passe (bcrypt) + 2FA TOTP optionnelle par utilisateur
  ✓ Persistance PostgreSQL (SQLAlchemy) — fallback SQLite zero-config en dev
  ✓ Migrations : migrations/schema.sql (versionné) + Alembic prêt à l'emploi
  ✓ Audit trail complet : qui, quand, quoi, sur quel patient — table audit_log,
    peuplée automatiquement par un middleware sur CHAQUE requête authentifiée.

main.py orchestre l'application (config, garde-fous, middlewares, montage des
routers) ; la logique métier de chaque domaine vit dans routers/*.py (auth,
patients, dicom, volumetrie, chat, audit) et les dépendances transverses
(authentification, RBAC, audit trail) dans deps.py.

Démarrage rapide (SQLite, aucune dépendance externe) :
    pip install -r requirements.txt
    cp .env.example .env
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Démarrage avec PostgreSQL :
    docker compose up -d db
    # éditer .env : DATABASE_URL=postgresql+psycopg2://ophtalmosurg:ophtalmosurg@localhost:5432/ophtalmosurg
    alembic -c migrations/alembic.ini upgrade head
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

import os
import logging
import time
import traceback as _traceback
from contextlib import asynccontextmanager
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import Depends
from sqlalchemy.exc import OperationalError, DBAPIError

from db import get_db, init_db, DATABASE_URL
import models
import security as sec
import resilience
from deps import get_current_user, require_role, write_audit, oauth2_scheme  # noqa: F401 (re-exportés)
from specialties import SPECIALTY_LABELS
from ai_config import GEMINI_KEY, GROQ_KEY
from logging_config import setup_logging, correlation_id_var, generate_correlation_id

import routers.auth as auth_router
import routers.patients as patients_router
import routers.dicom as dicom_router
import routers.volumetrie as volumetrie_router
import routers.chat as chat_router
import routers.audit as audit_router
import routers.workflow as workflow_router
from schemas import DicomSRExportRequest, DicomSRExportResponse
import schemas

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# Défaut restreint au dev local — un déploiement réel doit positionner explicitement
# ALLOWED_ORIGINS dans .env (le garde-fou APP_ENV=production ci-dessous refuse de démarrer
# si la valeur est encore "*", combinée à allow_credentials=True c'était une origine XSS/CSRF).
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").split(",")
SEED_DEMO_USERS = os.getenv("SEED_DEMO_USERS", "true").lower() == "true"

# ── Logging structuré JSON + correlation IDs ───────────────────────────────
setup_logging(os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("ophtalmosurg.main")

# ── Garde-fou anti-mauvaise-config (priorité sécurité, ajouté suite à l'audit
# de juillet 2026) ───────────────────────────────────────────────────────────
# APP_ENV=production est le SEUL signal qui doit déterminer un déploiement
# clinique réel — DATABASE_URL pointant vers Postgres n'est pas fiable comme
# signal (un dev peut très bien tester avec Postgres local). Par défaut
# "development", pour ne rien casser sur les postes de dev existants.
APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
_JWT_SECRET_IS_DEFAULT = getattr(sec, "_JWT_SECRET_IS_DEFAULT", sec.JWT_SECRET == "CHANGEZ-MOI-EN-PRODUCTION")

if APP_ENV == "production":
    _fatal_errors = []
    if _JWT_SECRET_IS_DEFAULT:
        _fatal_errors.append(
            "JWT_SECRET est encore la valeur par défaut du code source "
            "(publique, visible dans security.py). N'importe qui peut forger "
            "un jeton d'authentification valide. Définissez une vraie valeur "
            "aléatoire dans .env (ex. `openssl rand -hex 32`)."
        )
    if not getattr(sec, "JWT_SECRET_EXPLICITLY_CONFIGURED", True):
        _fatal_errors.append(
            "JWT_SECRET n'est pas défini dans l'environnement : security.py génère "
            "alors un secret aléatoire DIFFÉRENT à chaque process. Avec plusieurs "
            "workers Uvicorn (voir --workers dans le Dockerfile), un jeton signé "
            "par un worker serait rejeté par un autre — authentification cassée de "
            "façon intermittente et silencieuse. Définissez une vraie valeur fixe "
            "dans .env (ex. `openssl rand -hex 32`)."
        )
    if SEED_DEMO_USERS:
        _fatal_errors.append(
            "SEED_DEMO_USERS=true : les comptes de démonstration "
            "dr.hadj/dr.benali (mot de passe 'changeme', public dans ce "
            "dépôt) seraient créés automatiquement. Positionnez "
            "SEED_DEMO_USERS=false dans .env avant la mise en production."
        )
    if "*" in ALLOWED_ORIGINS:
        _fatal_errors.append(
            "ALLOWED_ORIGINS contient '*' (toutes origines) combiné à "
            "allow_credentials=True — n'importe quel site web pourrait "
            "envoyer des requêtes authentifiées à cette API. Définissez "
            "la liste explicite des origines autorisées dans .env."
        )
    if DATABASE_URL.startswith("sqlite"):
        _fatal_errors.append(
            "DATABASE_URL pointe vers SQLite (fichier local, perdu au "
            "redémarrage, un seul writer à la fois) — inadapté à un usage "
            "clinique réel. Définissez DATABASE_URL vers un PostgreSQL "
            "(ex. `docker compose up -d db`, voir migrations/README.md)."
        )
    if _fatal_errors:
        raise RuntimeError(
            "\n\n🚫 Démarrage refusé (APP_ENV=production) — configuration non "
            "sûre pour un usage clinique :\n" +
            "\n".join(f"  - {e}" for e in _fatal_errors) +
            "\n\nCorrigez .env puis relancez. (Pour forcer un démarrage en "
            "dev/test avec cette config, utilisez APP_ENV=development.)\n"
        )
elif _JWT_SECRET_IS_DEFAULT or SEED_DEMO_USERS:
    # Hors production : on n'empêche rien (workflow de dev), mais on prévient
    # bruyamment dans les logs pour qu'un déploiement par erreur avec
    # APP_ENV oublié ne passe pas inaperçu.
    logger.warning("APP_ENV=%s — secret JWT par défaut et/ou "
                   "comptes de démo actifs. Ne JAMAIS utiliser cette configuration "
                   "pour un vrai patient. Positionnez APP_ENV=production dans .env "
                   "pour que ces réglages non sûrs bloquent le démarrage.", APP_ENV)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if SEED_DEMO_USERS:
        db = next(get_db())
        try:
            if not db.query(models.User).first():
                # dr.hadj est seedé en rôle "admin" (uniquement pour que /audit, réservé aux
                # rôles admin/dpo depuis le durcissement RBAC, reste testable en dev) — à
                # remplacer par une vraie attribution de rôles avant toute mise en production.
                for username, full_name, role in [("dr.hadj", "Dr. Hadj", "admin"), ("dr.benali", "Dr. Benali", "surgeon")]:
                    db.add(models.User(
                        username=username, full_name=full_name, role=role,
                        hashed_password=sec.hash_password("changeme"),
                    ))
                db.commit()
                logger.info("Utilisateurs de démonstration créés (dr.hadj / dr.benali, mdp: changeme). "
                            "À supprimer avant toute mise en production.")
            # Patients de démonstration fictifs — miroir des 3 patients codés en dur
            # dans MODULES (assets/app-part1.js), pour que le workflow 3-clics et le
            # hub soient utilisables sur un backend vierge. Données fictives (aides
            # "FICTIONAL_DEMO_DATA"), jamais destinées à un vrai patient.
            if not db.query(models.Patient).first():
                demo_patients = [
                    models.Patient(
                        id="40521-CAT", nom="Haddad, Leïla", age=74, sexe="F",
                        poids_kg=64, taille_cm=160,
                        diagnostic="Cataracte corticonucléaire OD stade N4",
                        chirurgien="Dr. Hadj", specialty="cataracte", urgence="vert",
                    ),
                    models.Patient(
                        id="52918-GLA", nom="Belaïd, Omar", age=68, sexe="M",
                        poids_kg=80, taille_cm=176,
                        diagnostic="Glaucome primitif à angle ouvert avancé OG",
                        chirurgien="Dr. Benali", specialty="glaucome", urgence="orange",
                    ),
                    models.Patient(
                        id="61147-RET", nom="Cissé, Fatou", age=57, sexe="F",
                        poids_kg=69, taille_cm=165,
                        diagnostic="Décollement de rétine rhegmatogène OD, macula off",
                        chirurgien="Dr. Hadj", specialty="retine", urgence="rouge",
                    ),
                ]
                db.add_all(demo_patients)
                db.commit()
                logger.info("Patients de démonstration créés (40521-CAT / 52918-GLA / 61147-RET, fictifs). "
                            "À supprimer avant toute mise en production.")
        finally:
            db.close()
    # Nettoyage initial du stockage DICOM (TTL + quota)
    try:
        import storage_cleanup
        result = storage_cleanup.run_cleanup()
        logger.info("Nettoyage DICOM initial: %s", result)
    except Exception as e:
        logger.warning("Nettoyage DICOM initial échoué: %s", e)
    yield


app = FastAPI(title="OphtalmoSurg Plan — Backend", version="2.1.0", lifespan=lifespan)

# ---------------------------------------------------------------------------
# Middleware correlation ID — chaque requête reçoit un ID unique tracable
# dans les logs et retourné dans le header X-Correlation-ID.
# ---------------------------------------------------------------------------
@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    cid = request.headers.get("X-Correlation-ID") or generate_correlation_id()
    correlation_id_var.set(cid)
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = cid
    return response

request_logger = logging.getLogger("ophtalmosurg.request")

@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - start) * 1000
    request_logger.info(
        "%s %s → %d (%.0f ms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Résilience — priorité 5 de la feuille de route.
# Deux garde-fous globaux pour qu'une panne d'infrastructure (DB, exception
# inattendue) ne renvoie jamais une trace Python brute au client (fuite
# d'information + mauvaise expérience) mais un message clair et exploitable,
# tout en gardant la trace complète côté serveur (logs + audit_log) pour le
# diagnostic. Chaque incident reçoit un error_id que le chirurgien peut
# communiquer au support technique.
# ---------------------------------------------------------------------------
import traceback as _traceback
from sqlalchemy.exc import OperationalError, DBAPIError

resilience_logger = logging.getLogger("ophtalmosurg.resilience")


def _log_incident(request: Request, exc: Exception) -> str:
    import uuid
    error_id = uuid.uuid4().hex[:12]
    cid = correlation_id_var.get()
    resilience_logger.error(
        "[incident %s] correlation_id=%s %s %s -> %s: %s",
        error_id, cid or "-", request.method, request.url.path,
        type(exc).__name__, exc, exc_info=True,
    )
    return error_id


@app.exception_handler(OperationalError)
@app.exception_handler(DBAPIError)
async def db_unavailable_handler(request: Request, exc: Exception):
    error_id = _log_incident(request, exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "Service de données temporairement indisponible. Réessayez dans quelques instants.",
                  "error_id": error_id},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # HTTPException est gérée nativement par FastAPI AVANT d'atteindre ce
    # handler générique (Starlette route les HTTPException séparément), donc
    # ceci ne capture que les échecs vraiment inattendus.
    error_id = _log_incident(request, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Erreur interne inattendue. L'incident a été journalisé.",
                  "error_id": error_id},
    )


# ---------------------------------------------------------------------------
# Routers par domaine (voir routers/*.py)
# API versionnée sous /api/v1/ + compatibilité ascendante sans prefix.
# Les mêmes routers sont montés deux fois : avec /api/v1 (nouveau) et
# sans prefix (anciens chemins, pour que les tests et les clients existants
# continuent de fonctionner sans modification).
# ---------------------------------------------------------------------------
API_V1 = "/api/v1"

# Routers métier par domaine. Chaque router est monté DEUX fois :
#   1. sous /api/v1 — l'API versionnée canonique (schéma OpenAPI/discussions API),
#   2. sans préfixe — les anciens chemins documentés dans le README et que le
#      frontend et les tests utilisent encore aujourd'hui (compatibilité ascendante).
# Le double montage est délibéré : c'est le MÊME objet APIRouter, donc les deux
# registrations ne peuvent pas diverger (aucun risque de dérive de schéma), et
# FastAPI ne duplique pas les operationId de l'OpenAPI (vérifié empiriquement).
# À terme, migrer le frontend et les tests vers /api/v1 puis retirer le passage
# sans préfixe (chantier frontend, voir feuille de route).
_core_routers = [
    auth_router.router,
    patients_router.router,
    dicom_router.router,
    volumetrie_router.router,
    chat_router.router,
    audit_router.router,
    workflow_router.router,
]
for _router in _core_routers:
    app.include_router(_router, prefix=API_V1)
    app.include_router(_router)

# routers/dicom.py charge segmentation_service.py (pipeline réel TotalSegmentator)
# dans son propre try/except et expose REAL_SEGMENTATION_AVAILABLE : app.mount()
# et un second app.include_router() sont des opérations de l'objet FastAPI `app`
# (pas d'un APIRouter), donc câblés ici plutôt que dans le router lui-même.
# Fonctionne même sans TotalSegmentator installé (l'erreur est renvoyée proprement
# dans le statut du job) ; nécessite scikit-image + trimesh pour l'export de maillage.
REAL_SEGMENTATION_AVAILABLE = dicom_router.REAL_SEGMENTATION_AVAILABLE
if REAL_SEGMENTATION_AVAILABLE:
    segmentation_service = dicom_router.segmentation_service
    segmentation_service.MESH_STORAGE.mkdir(parents=True, exist_ok=True)
    app.mount("/meshes", StaticFiles(directory=str(segmentation_service.MESH_STORAGE)), name="meshes")
    app.include_router(segmentation_service.router)

# ── Connecteurs PACS (DICOMweb QIDO-RS/WADO-RS) + export FHIR R4 / HL7 v2 ──
# Endpoints exposés sous /pacs/*, /fhir/*, /hl7/* (priorité 4 de la feuille de
# route). Fonctionne même sans PACS configuré ni `dicomweb-client` installé :
# /pacs/capabilities répond alors honnêtement, les autres endpoints renvoient
# une erreur 400/502 explicite plutôt qu'une fausse réponse.
#
# IMPORTANT : chaque service RÉEL est chargé dans son propre try/except pour
# qu'une erreur d'import sur un seul module n'empoisonne plus tous les autres
# (avant : un seul bloc try géant → une erreur sur un module désactivait
# silencieusement TOUS les routers, y compris les vrais endpoints cliniques).
_real_services = [
    ("pacs_router", "router"),
    ("pacs_router_v2", "router"),
    ("biomechanics_engine", "router"),
    ("voice_llm_service", "router"),
    ("voice_llm_service", "compliance_router"),
    ("hl7_anesthesia_service", "router"),
]
PACS_ROUTER_AVAILABLE = True
for _mod_name, _router_attr in _real_services:
    try:
        _mod = __import__(_mod_name)
        app.include_router(getattr(_mod, _router_attr))
    except Exception as e:  # noqa: BLE001
        logger.warning("Service %s.%s non chargé: %s", _mod_name, _router_attr, e)
        PACS_ROUTER_AVAILABLE = False

# ── Services EXPLORATOIRES (Jalons M21-M40) ─────────────────────────────────
# Nanorobots, interface cerveau-machine, cryo-BNCT, bio-impression, etc. Ce
# sont des concepts de recherche, PAS des dispositifs médicaux validés — ils
# ne doivent JAMAIS être exposés en production. Désactivés par défaut ; ne se
# chargent que si RESEARCH_MODE=true est explicitement positionné dans
# l'environnement (jamais en clinique, uniquement pour démonstration interne
# ou R&D encadrée). Voir aussi le Mode Recherche du frontend (bouton 🔬),
# qui doit rester cohérent avec ce flag côté serveur.
#
# monai_pipeline_v2 est inclus ici (et non dans _real_services) car audité et
# confirmé n'appeler ni torch ni monai : il retourne des volumes hépatiques et
# segments de Couinaud FIXES et IDENTIQUES pour tout patient (aucun calcul
# réel), tout en écrivant un enregistrement 'READY' en base avec un hash
# d'audit — sans jamais l'indiquer. Non utilisé par le frontend actuel
# (voir index.html / assets/app-part2.js, qui appelle /segmentation/auto et
# segmentation_service.py, la vraie intégration TotalSegmentator).
#
# real_patient_dicom_mesh_service a été déplacé ici depuis _real_services :
# malgré son nom, il ne contacte aucun PACS et n'exécute aucune IA — c'est un
# dictionnaire codé en dur de 2 patients fictifs, auparavant étiqueté
# "CERTIFIED_CLINICAL_REAL_ANATOMY". Corrigé pour être honnête (voir le
# fichier), mais reste un module de démonstration, pas un flux clinique réel.
RESEARCH_MODE = os.environ.get("RESEARCH_MODE", "false").strip().lower() in ("1", "true", "yes")
_exploratory_services = [
    "monai_pipeline_v2",
    "webxr_spatial_service",
    "robotic_ras_service",
    "genai_microsurgery_service",
    "pqc_bioprinting_service",
    "bci_cortical_service",
    "nanorobotics_swarm_service",
    "autonomous_robotic_laser_service",
    "epigenetic_sonogenetics_service",
    "raman_spectroscopy_plasma_service",
    "cryo_ire_bnct_service",
    "organoid_biomimetic_assembly_service",
    "iknife_reims_theranostics_service",
    "real_patient_dicom_mesh_service",
]
if RESEARCH_MODE:
    logger.warning("RESEARCH_MODE=true — chargement des services exploratoires "
                   "NON VALIDÉS CLINIQUEMENT. Ne jamais activer ce flag en production.")
    for _mod_name in _exploratory_services:
        try:
            _mod = __import__(_mod_name)
            app.include_router(_mod.router)
        except Exception as e:  # noqa: BLE001
            logger.warning("Service exploratoire %s non chargé: %s", _mod_name, e)
else:
    logger.info("Mode clinique (RESEARCH_MODE=false) — %d services exploratoires non chargés",
                len(_exploratory_services))


# ---------------------------------------------------------------------------
# Santé / méta — /health (liveness) + /readyz (readiness)
# ---------------------------------------------------------------------------
import time as _time
_start_time = _time.monotonic()


@app.get("/health", response_model=schemas.HealthResponse)
@app.get("/healthz")
async def health():
    """Liveness : l'app est vivante et répond. Ne teste PAS les dépendances externes."""
    return schemas.HealthResponse(
        status="ok",
        ai=bool(GEMINI_KEY or GROQ_KEY),
        specialties=list(SPECIALTY_LABELS.keys()),
        db="configured" if not getattr(sec, "_JWT_SECRET_IS_DEFAULT", False) else "default-secret-change-me",
        app_env=APP_ENV,
        seed_demo_users=SEED_DEMO_USERS,
        pacs_fhir_hl7=PACS_ROUTER_AVAILABLE,
        pacs_configured=bool(os.getenv("PACS_QIDO_URL")),
        circuit_breakers={
            "gemini": resilience.GEMINI_BREAKER.status(),
            "groq": resilience.GROQ_BREAKER.status(),
            "pacs": resilience.PACS_BREAKER.status(),
        },
        uptime_seconds=round(_time.monotonic() - _start_time, 1),
    )


@app.get("/readyz")
async def readiness():
    """Readiness : l'app peut servir du trafic. Vérifie la DB et le stockage."""
    checks = {}
    all_ok = True

    # Test DB
    try:
        db = next(get_db())
        db.execute(text("SELECT 1"))
        db.close()
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {type(e).__name__}"
        all_ok = False

    # Test stockage DICOM
    try:
        dicom_dir = Path(os.getenv("DICOM_STORAGE_DIR", "./storage/dicom_series")).resolve()
        if dicom_dir.is_dir():
            checks["dicom_storage"] = "ok"
        else:
            checks["dicom_storage"] = "directory_missing"
    except Exception:
        checks["dicom_storage"] = "error"
        all_ok = False

    return schemas.ReadyResponse(
        status="ready" if all_ok else "degraded",
        checks=checks,
    )


@app.get("/specialties")
async def list_specialties():
    return SPECIALTY_LABELS


# ---------------------------------------------------------------------------
# Admin : nettoyage manuel du stockage DICOM (réservé admin)
# ---------------------------------------------------------------------------
@app.post("/admin/storage/cleanup")
async def admin_storage_cleanup(request: Request,
                                 current: models.User = Depends(require_role("admin")),
                                 db: Session = Depends(get_db)):
    """Nettoyage manuel du stockage DICOM — supprime les séries expirées et
    applique le quota. Réservé aux admins."""
    import storage_cleanup
    result = storage_cleanup.run_cleanup()
    write_audit(db, request, "Nettoyage manuel stockage DICOM", "admin", user=current,
                metadata=result)
    return result


# ---------------------------------------------------------------------------
# RFC 7807 (Problem Details) — format standardisé pour les erreurs API
# ---------------------------------------------------------------------------
@app.exception_handler(HTTPException)
async def rfc7807_exception_handler(request: Request, exc):
    headers = getattr(exc, "headers", None) or {}
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "type": "about:blank",
            "title": _HTTP_STATUS_TITLES.get(exc.status_code, "Erreur"),
            "status": exc.status_code,
            "detail": exc.detail,
            "instance": str(request.url.path),
        },
        headers=headers,
    )


_HTTP_STATUS_TITLES = {
    400: "Requête invalide",
    401: "Non authentifié",
    403: "Accès interdit",
    404: "Ressource introuvable",
    409: "Conflit",
    422: "Données invalides",
    429: "Trop de requêtes",
    500: "Erreur interne",
    502: "Service distant indisponible",
    503: "Service temporairement indisponible",
}


# ---------------------------------------------------------------------------
# Frontend helper
# ---------------------------------------------------------------------------
# index.html référence son CSS/JS via des chemins relatifs "assets/..." (voir
# le découpage du frontend monolithique) : indispensable de servir ce dossier
# en statique quand le frontend est chargé depuis ce backend (Docker, ou tout
# déploiement qui sert index.html via FastAPI plutôt qu'un serveur statique
# séparé) — sans ce mount, le navigateur recevrait des 404 sur assets/*.
_FRONTEND_ASSETS_DIR = (Path(os.path.dirname(__file__)) / ".." / "assets").resolve()
if _FRONTEND_ASSETS_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_FRONTEND_ASSETS_DIR)), name="frontend-assets")

# assets/app-part1.js (moteur I18N) fait `fetch("i18n/{locale}.json")` relatif à la
# page — sans ce mount, ces requêtes 404ent quand le frontend est servi par CE
# backend (Docker) : l'app reste utilisable (repli sur I18N_EMBEDDED, voir le
# commentaire dans app-part1.js) mais l'édition des traductions via /i18n/*.json
# documentée côté frontend ne fonctionnerait pas silencieusement.
_FRONTEND_I18N_DIR = (Path(os.path.dirname(__file__)) / ".." / "i18n").resolve()
if _FRONTEND_I18N_DIR.is_dir():
    app.mount("/i18n", StaticFiles(directory=str(_FRONTEND_I18N_DIR)), name="frontend-i18n")


@app.get("/")
async def serve_frontend():
    path = os.path.join(os.path.dirname(__file__), "..", "index.html")
    if os.path.exists(path):
        return FileResponse(path)
    return {"msg": "OphtalmoSurg Plan API — voir /docs pour la documentation."}


# Fichiers PWA à la racine (manifest, service worker, favicon) : on les sert
# individuellement plutôt que de monter toute la racine en statique (qui
# exposerait backend/, .env, etc.) — même logique que serve_frontend() ci-dessus.
_REPO_ROOT = (Path(os.path.dirname(__file__)) / "..").resolve()


@app.get("/manifest.webmanifest")
async def serve_manifest():
    path = _REPO_ROOT / "manifest.webmanifest"
    if path.exists():
        return FileResponse(path, media_type="application/manifest+json")
    raise HTTPException(404, "manifest.webmanifest introuvable.")


@app.get("/sw.js")
async def serve_service_worker():
    path = _REPO_ROOT / "sw.js"
    if path.exists():
        # Cache-Control: no-cache — le navigateur doit revérifier sw.js à chaque
        # visite pour détecter une mise à jour rapidement (sinon un ancien service
        # worker peut rester actif pendant des jours, cache HTTP par défaut oblige).
        return FileResponse(path, media_type="application/javascript",
                             headers={"Cache-Control": "no-cache"})
    raise HTTPException(404, "sw.js introuvable.")


@app.get("/favicon.ico")
async def serve_favicon():
    path = _REPO_ROOT / "favicon.ico"
    if path.exists():
        return FileResponse(path, media_type="image/x-icon")
    raise HTTPException(404, "favicon.ico introuvable.")


@app.get("/offline.html")
async def serve_offline():
    """Page de fallback hors-ligne servie par le Service Worker quand ni le réseau
    ni le cache ne sont disponibles. Cache-Control: no-cache pour que le navigateur
    vérifie la version à chaque connexion (même logique que sw.js)."""
    path = _REPO_ROOT / "offline.html"
    if path.exists():
        return FileResponse(path, media_type="text/html",
                             headers={"Cache-Control": "no-cache"})
    raise HTTPException(404, "offline.html introuvable.")


@app.post("/export/dicom-sr", response_model=DicomSRExportResponse)
async def export_dicom_sr(data: DicomSRExportRequest, request: Request, current: models.User = Depends(get_current_user),
                           db: Session = Depends(get_db)):
    sr_content = {
        "PatientID": data.patient.get("id"),
        "PatientName": data.patient.get("nom"),
        "Specialty": data.specialty,
        "StudyDate": datetime.now().strftime("%Y%m%d"),
        "SurgicalPlan": {
            "OrganVolume": data.volumetrie.get("organ_volume_ml"),
            "LesionVolume": data.volumetrie.get("lesion_volume_ml"),
            "ResectionVolume": data.volumetrie.get("volume_resection_ml"),
            "RemnantPct": data.volumetrie.get("remnant_pct"),
        },
        "Observations": data.notes,
    }
    write_audit(db, request, "Export plan (DICOM SR)", "export", user=current,
                patient_id=data.patient.get("id"))
    return DicomSRExportResponse(**sr_content)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
