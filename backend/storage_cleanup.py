# -*- coding: utf-8 -*-
"""
storage_cleanup.py — Nettoyage automatique du stockage DICOM (quota + TTL).
================================================================================
Empêche la filling du disque par les séries DICOM importées. Configurable
via des variables d'environnement :

  DICOM_STORAGE_MAX_GB   — quota max en Go (défaut: 50)
  DICOM_STORAGE_TTL_DAYS — durée de vie en jours (défaut: 90)

Exécuté en background au démarrage de l'app (toutes les heures) et
disponible comme endpoint d'admin pour un nettoyage manuel.
"""

import logging
import os
import shutil
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Tuple

logger = logging.getLogger("orlsurgplan3d.storage")

DICOM_STORAGE_DIR = Path(os.getenv("DICOM_STORAGE_DIR", "./storage/dicom_series")).resolve()
MAX_STORAGE_BYTES = int(os.getenv("DICOM_STORAGE_MAX_GB", "50")) * 1024 ** 3
TTL_SECONDS = int(os.getenv("DICOM_STORAGE_TTL_DAYS", "90")) * 86400


def get_storage_usage() -> Dict[str, int]:
    """Retourne l'utilisation actuelle du stockage DICOM."""
    if not DICOM_STORAGE_DIR.is_dir():
        return {"total_bytes": 0, "total_files": 0, "total_dirs": 0}
    total_bytes = 0
    total_files = 0
    total_dirs = 0
    for entry in DICOM_STORAGE_DIR.iterdir():
        if entry.is_dir():
            total_dirs += 1
            for f in entry.rglob("*"):
                if f.is_file():
                    total_bytes += f.stat().st_size
                    total_files += 1
    return {"total_bytes": total_bytes, "total_files": total_files, "total_dirs": total_dirs}


def cleanup_expired() -> Tuple[int, int]:
    """Supprime les séries expirées (> TTL). Retourne (nb_supprimé, bytes_libérés)."""
    if not DICOM_STORAGE_DIR.is_dir():
        return 0, 0
    cutoff = time.time() - TTL_SECONDS
    removed_dirs = 0
    freed_bytes = 0
    for entry in DICOM_STORAGE_DIR.iterdir():
        if entry.is_dir() and entry.stat().st_mtime < cutoff:
            size = sum(f.stat().st_size for f in entry.rglob("*") if f.is_file())
            shutil.rmtree(entry, ignore_errors=True)
            removed_dirs += 1
            freed_bytes += size
            logger.info("Série DICOM expirée supprimée: %s (%.1f Mo)", entry.name, size / 1024 / 1024)
    return removed_dirs, freed_bytes


def cleanup_oldest_if_over_quota() -> Tuple[int, int]:
    """Si le quota est dépassé, supprime les séries les plus anciennes jusqu'à revenir sous le quota."""
    usage = get_storage_usage()
    if usage["total_bytes"] <= MAX_STORAGE_BYTES:
        return 0, 0
    # Trie les dossiers par date de modification (plus ancien en premier)
    dirs = sorted(
        [d for d in DICOM_STORAGE_DIR.iterdir() if d.is_dir()],
        key=lambda d: d.stat().st_mtime,
    )
    removed = 0
    freed = 0
    for d in dirs:
        if usage["total_bytes"] - freed <= MAX_STORAGE_BYTES * 0.9:  # marge de 10%
            break
        size = sum(f.stat().st_size for f in d.rglob("*") if f.is_file())
        shutil.rmtree(d, ignore_errors=True)
        removed += 1
        freed += size
        logger.info("Série DICOM supprimée (quota dépassé): %s (%.1f Mo)", d.name, size / 1024 / 1024)
    return removed, freed


def run_cleanup() -> Dict[str, int]:
    """Exécute le nettoyage complet (TTL + quota)."""
    expired_removed, expired_freed = cleanup_expired()
    quota_removed, quota_freed = cleanup_oldest_if_over_quota()
    usage = get_storage_usage()
    result = {
        "expired_removed": expired_removed,
        "expired_freed_bytes": expired_freed,
        "quota_removed": quota_removed,
        "quota_freed_bytes": quota_freed,
        "remaining_bytes": usage["total_bytes"],
        "remaining_dirs": usage["total_dirs"],
    }
    if expired_removed or quota_removed:
        logger.info("Nettoyage DICOM: %d séries supprimées, %.1f Mo libérés, "
                     "%.1f Mo restants (%d séries)",
                     expired_removed + quota_removed,
                     (expired_freed + quota_freed) / 1024 / 1024,
                     usage["total_bytes"] / 1024 / 1024,
                     usage["total_dirs"])
    return result
