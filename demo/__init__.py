# -*- coding: utf-8 -*-
"""
demo/ — Modules de démonstration (version "Recherche / Démo" uniquement).

⚠️ CE LOGICIEL N'EST PAS DESTINÉ À UN USAGE CLINIQUE dans cette version.

Ce dossier contient des exemples illustrant des concepts et des structures de
données (patients fictifs, anatomies codées en dur, etc.). Aucun de ces modules
n'est un dispositif médical validé, et ils ne sont JAMAIS chargés par la version
"Clinique / Production" (`APP_MODE=clinical` / `DEMO_MODE=false`).

Chargement dans `backend/main.py` :
    if DEMO_MODE:
        from demo_patient_dicom_mesh_service import router as demo_router
        app.include_router(demo_router)
"""

from __future__ import annotations
