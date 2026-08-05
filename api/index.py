# -*- coding: utf-8 -*-
"""
api/index.py — Point d'entrée serverless Vercel (API "légère").
==================================================================
Sous-ensemble de backend/main.py adapté aux contraintes du runtime Python
serverless de Vercel : pas de filesystem persistant (SQLite exclu, il FAUT
DATABASE_URL vers un Postgres externe, ex. Neon/Supabase), pas de process
long-running, pas de vrais sockets TCP.

En conséquence, SEULS les routers sans dépendance DICOM/segmentation/PACS/
HL7 sont montés ici : auth, patients, chat (dont /ws/chat-stream, qui ne
fonctionnera pas en pratique sur Vercel — le frontend retombe automatiquement
sur le REST /chat si le WebSocket échoue, voir streamBackendWs() dans
assets/app-part3.js), audit.

Les fonctionnalités DICOM/volumétrie/segmentation/PACS/HL7 restent
indisponibles sur ce déploiement : gardez le backend complet (Render, VPS
Docker...) pour ces usages, voir DEPLOYMENT.md Option C.
"""

import os
import sys
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError, DBAPIError

from db import get_db, init_db, DATABASE_URL
import models
import security as sec
from logging_config import setup_logging, correlation_id_var, generate_correlation_id

import routers.auth as auth_router
import routers.patients as patients_router
import routers.chat as chat_router
import routers.audit as audit_router
import schemas

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:8000").split(",")
SEED_DEMO_USERS = os.getenv("SEED_DEMO_USERS", "false").lower() == "true"

setup_logging(os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("ophtalmosurg.vercel")

if DATABASE_URL.startswith("sqlite"):
    logger.warning(
        "DATABASE_URL non défini (ou SQLite) sur un déploiement Vercel : le "
        "filesystem serverless n'est pas persistant, les données seraient "
        "perdues à chaque invocation froide. Configurez DATABASE_URL vers un "
        "Postgres externe (Neon, Supabase...) dans les variables d'env Vercel."
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if SEED_DEMO_USERS:
        db = next(get_db())
        try:
            if not db.query(models.User).first():
                for username, full_name, role in [("dr.hadj", "Dr. Hadj", "admin"), ("dr.benali", "Dr. Benali", "surgeon")]:
                    db.add(models.User(
                        username=username, full_name=full_name, role=role,
                        hashed_password=sec.hash_password("changeme"),
                    ))
                db.commit()
        finally:
            db.close()
    yield


app = FastAPI(title="OphtalmoSurg Plan — API légère (Vercel)", version="2.1.0-vercel", lifespan=lifespan)


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
    request_logger.info("%s %s → %d (%.0f ms)", request.method, request.url.path, response.status_code, duration_ms)
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(OperationalError)
@app.exception_handler(DBAPIError)
async def db_unavailable_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=503, content={"detail": "Service de données temporairement indisponible."})


app.include_router(auth_router.router)
app.include_router(patients_router.router)
app.include_router(chat_router.router)
app.include_router(audit_router.router)


@app.get("/health", response_model=schemas.HealthResponse)
@app.get("/healthz")
async def health():
    from ai_config import GEMINI_KEY, GROQ_KEY
    from specialties import SPECIALTY_LABELS
    return schemas.HealthResponse(
        status="ok",
        ai=bool(GEMINI_KEY or GROQ_KEY),
        specialties=list(SPECIALTY_LABELS.keys()),
        db="configured" if not DATABASE_URL.startswith("sqlite") else "sqlite-non-persistent",
        app_env=os.getenv("APP_ENV", "development"),
        seed_demo_users=SEED_DEMO_USERS,
        pacs_fhir_hl7=False,
        pacs_configured=False,
        circuit_breakers={},
        uptime_seconds=0,
    )


@app.get("/readyz")
async def readiness():
    checks = {}
    all_ok = True
    try:
        db = next(get_db())
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        db.close()
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {type(e).__name__}"
        all_ok = False
    return schemas.ReadyResponse(status="ready" if all_ok else "degraded", checks=checks)


@app.get("/specialties")
async def list_specialties():
    from specialties import SPECIALTY_LABELS
    return SPECIALTY_LABELS
