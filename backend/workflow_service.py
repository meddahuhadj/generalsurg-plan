# -*- coding: utf-8 -*-
"""
workflow_service.py — Workflow de validation éclair « 3 clics » + préparation zero-touch
=====================================================================================================
Objectif (recommandation 1 de la feuille de route) : faire passer l'application
d'une démonstration technique à un outil adopté quotidiennement en salle.

1. **Automatisation zero-touch (J-1)** : quand une série arrive sur le serveur
   (upload manuel, import PACS DICOMweb WADO-RS, import PACS DIMSE C-GET),
   `auto_trigger_for_series()` crée un `WorkflowRun` et lance en tâche de fond
   la préparation : lecture réelle des voxels DICOM -> extraction heuristique
   des structures -> simulation de marge -> garde-fou. Le chirurgien ne touche
   à rien : le jumeau est prêt quand il ouvre le dossier.

2. **Parcours de validation en 3 clics** (voir frontend) :
   - Aperçu : masques auto-générés (volumes réels en mL) ;
   - Ajustement : marge de sécurité glissée (recalcul instantané) ;
   - Validation : export DICOM SR / PDF dans le dossier patient.

HONNÊTETÉ CLINIQUE (à lire avant toute utilisation) :
   - Il n'existe pas de modèle de segmentation oculaire équivalent à
     TotalSegmentator (voir README « Limites connues »). L'extraction
     d'ici est une **heuristique déterministe** (seuillage HU + composantes
     connexes, `scipy.ndimage`), pas une IA clinique. Toutes les structures
     sont étiquetées `method="seuillage_HU_heuristique"` et `source` vaut
     `dicom_voxels` (pixels réellement lus) ou `metadata_estimate` (pixels
     illisibles -> estimation depuis les métadonnées DICOM uniquement).
   - Les volumes et l'effet de marge (dilation morphologique du masque cible
     + intersection avec les structures à risque) sont **calculés réellement**,
     déterministes et testables — c'est la valeur du workflow, pas les labels.
   - Les seuils de garde-fou (`MODULE_GUIDELINES`) sont des valeurs par défaut
     de démonstration, à valider cliniquement avant toute mise en production.

Endpoints HTTP dans routers/workflow.py — ce module expose la logique métier
(préparation, marge, validation, export) sans dépendre de FastAPI.
"""

from __future__ import annotations

import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

import models
from db import SessionLocal
from logging_config import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
WORKFLOW_STORAGE = Path(os.getenv("WORKFLOW_STORAGE_DIR", "./storage/workflows")).resolve()
WORKFLOW_STORAGE.mkdir(parents=True, exist_ok=True)

# Zero-touch activable/désactivable. Désactivé, seuls les déclenchements
# manuels (POST /workflow/auto-import) créent des runs.
WORKFLOW_AUTO_TRIGGER = os.getenv("WORKFLOW_AUTO_TRIGGER", "true").strip().lower() in ("1", "true", "yes")

# Résolution maximale du volume voxel analysé (mémoire bornée sur serveur
# partagé) — 160³ ≈ 4 M voxels, ample pour de l'ophtalmologie.
MAX_GRID = int(os.getenv("WORKFLOW_MAX_GRID", "160"))

# 2 jobs de préparation en parallèle max (lecture DICOM + scipy, peu lourd).
EXECUTOR = ThreadPoolExecutor(max_workers=2)

# ---------------------------------------------------------------------------
# Heuristique de structures (ophtalmologie) — seuillages HU + composantes connexes
# ---------------------------------------------------------------------------
# Classes radiologiques (Hounsfield) utilisées pour l'extraction. Ordre
# important : la première classe ayant un composant assez gros devient la
# CIBLE (cristallin dense/calcifications avant tissu mou, etc.).
HU_CLASSES: List[Tuple[str, str, float, float, str]] = [
    ("calcifications", "Calcifications / cristallin dense", 300.0, 3000.0, "#f59e0b"),
    ("tissu_mou_dense", "Tissu mou dense", 60.0, 300.0, "#f87171"),
    ("compartiment_fluidique", "Compartiment fluidique (~ vitré/humeur)", 0.0, 60.0, "#38bdf8"),
    ("tissu_adipeux", "Tissu adipeux (graisse orbitaire)", -150.0, 0.0, "#eab308"),
]

# Volume minimal d'une structure retenue (mL) — filtre le bruit.
MIN_STRUCTURE_ML = 0.05
# Nombre max de structures à risque listées (les plus grosses).
MAX_RISK_STRUCTURES = 4

# ---------------------------------------------------------------------------
# Garde-fou déterministe — seuils par module.
# ⚠️ Valeurs PAR DÉFAUT DE DÉMONSTRATION, à valider par le comité clinique
# avant tout usage réel (référence indicative par société savante, en texte
# pour l'auditabilité).
# ---------------------------------------------------------------------------
MODULE_GUIDELINES: Dict[str, Dict[str, Any]] = {
    "cataracte": {
        "min_margin_mm": 0.5,
        "max_risk_overlap_pct": 30.0,
        "guideline": "ESCRS (2024) — pas de marge tissulaire normée en phaco ; seuils de démo non cliniques.",
    },
    "glaucome": {
        "min_margin_mm": 1.0,
        "max_risk_overlap_pct": 25.0,
        "guideline": "EGS (2021) — seuils de démo non cliniques, à valider.",
    },
    "retine": {
        "min_margin_mm": 2.0,
        "max_risk_overlap_pct": 20.0,
        "guideline": "EVRS (2023) — seuils de démo non cliniques, à valider.",
    },
    "_default": {
        "min_margin_mm": 1.0,
        "max_risk_overlap_pct": 25.0,
        "guideline": "Seuils par défaut (démo) — aucune validation clinique.",
    },
}


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Lecture réelle des voxels DICOM
# ---------------------------------------------------------------------------
def _load_volume_and_spacing(dicom_dir: Path) -> Optional[Tuple[np.ndarray, Tuple[float, float, float]]]:
    """Lit les fichiers .dcm du dossier et retourne (volume_hu, spacing_mm).

    volume_hu : ndarray float32 de forme (Z, Y, X), éventuellement décimé à
                MAX_GRID par axe. spacing_mm : (x, y, z) réel de la grille
                RETENUE (après décimation). Retourne None si aucun pixel lisible.
    Ne lève jamais — un fichier corrompu est ignoré, pas fatal.
    """
    try:
        import pydicom
    except ImportError:
        logger.warning("pydicom absent — préparation voxel indisponible.")
        return None

    files = sorted(p for p in dicom_dir.iterdir() if p.is_file())
    if not files:
        return None

    slices: List[Dict[str, Any]] = []
    for p in files:
        try:
            ds = pydicom.dcmread(str(p), force=True)
            if not getattr(ds, "PixelData", None):
                continue
            rows = int(getattr(ds, "Rows", 0) or 0)
            cols = int(getattr(ds, "Columns", 0) or 0)
            if not rows or not cols:
                continue
            raw = ds.pixel_array.astype(np.float32)
            slope = float(getattr(ds, "RescaleSlope", 1.0) or 1.0)
            intercept = float(getattr(ds, "RescaleIntercept", 0.0) or 0.0)
            px = raw * slope + intercept
            z = None
            try:
                z = float(ds.ImagePositionPatient[2])
            except Exception:
                try:
                    z = float(ds.InstanceNumber)
                except Exception:
                    z = float(len(slices))
            spacing_y = spacing_x = 1.0
            try:
                sp = ds.PixelSpacing  # (ligne, colonne) -> (y, x)
                spacing_y, spacing_x = float(sp[0]), float(sp[1])
            except Exception:
                pass
            thickness = 1.0
            try:
                thickness = float(ds.SliceThickness or 1.0)
            except Exception:
                pass
            slices.append({"z": z, "px": px, "spacing": (spacing_x, spacing_y, thickness)})
        except Exception:
            continue

    if not slices:
        return None

    slices.sort(key=lambda s: s["z"])
    first = slices[0]["spacing"]
    nz, ny, nx = len(slices), slices[0]["px"].shape[0], slices[0]["px"].shape[1]

    grid = np.zeros((nz, ny, nx), dtype=np.float32)
    for i, s in enumerate(slices):
        grid[i] = s["px"]

    dz = abs(slices[1]["z"] - slices[0]["z"]) if nz > 1 else first[2]
    if dz <= 0:
        dz = first[2]

    def _decimate(axis_len: int, spacing_axis: float) -> Tuple[int, np.ndarray, float]:
        step = max(1, int(np.ceil(axis_len / MAX_GRID)))
        idx = np.arange(0, axis_len, step)
        return len(idx), idx, spacing_axis * step

    nz2, idx_z, sz = _decimate(nz, dz)
    ny2, idx_y, sy = _decimate(ny, first[1])
    nx2, idx_x, sx = _decimate(nx, first[0])
    volume = grid[np.ix_(idx_z, idx_y, idx_x)]
    spacing = (sx, sy, sz)

    if volume.size == 0 or not np.isfinite(volume).any():
        return None

    volume[~np.isfinite(volume)] = -2000.0
    return volume, spacing


# ---------------------------------------------------------------------------
# Extraction heuristique des structures (seuillage HU + composantes connexes)
# ---------------------------------------------------------------------------
def _extract_structures(volume: np.ndarray, spacing: Tuple[float, float, float]) -> Dict[str, Any]:
    from scipy import ndimage

    voxel_ml = (spacing[0] * spacing[1] * spacing[2]) / 1000.0
    min_voxels = max(8, int(MIN_STRUCTURE_ML / voxel_ml))

    class_masks: Dict[str, np.ndarray] = {}
    for key, _label, lo, hi, _color in HU_CLASSES:
        class_masks[key] = (volume >= lo) & (volume < hi)

    components: List[Dict[str, Any]] = []
    for ci, (key, label, lo, hi, color) in enumerate(HU_CLASSES):
        labeled, n = ndimage.label(class_masks[key], structure=np.ones((3, 3, 3)))
        if n == 0:
            continue
        for comp_id in range(1, n + 1):
            mask = labeled == comp_id
            if int(mask.sum()) < min_voxels:
                continue
            components.append({
                "key": f"{key}_{comp_id}",
                "class": key,
                "label": f"{label} #{comp_id}",
                "mask": mask,
                "volume_ml": round(int(mask.sum()) * voxel_ml, 3),
                "color": color,
                "class_index": ci,
            })
    if not components:
        return {"structures": [], "masks": {}, "voxel_ml": voxel_ml}

    # Cible = plus gros composant de la classe la plus « dense » disponible.
    components.sort(key=lambda c: (c["class_index"], -c["volume_ml"]))
    target = components[0]
    target["is_target"] = True
    target["is_risk"] = False

    # Structures à risque = plus gros composant de chaque AUTRE classe.
    risks: List[Dict[str, Any]] = []
    seen_classes = {target["class"]}
    for comp in components[1:]:
        if len(risks) >= MAX_RISK_STRUCTURES:
            break
        if comp["class"] in seen_classes:
            continue
        seen_classes.add(comp["class"])
        comp["is_target"] = False
        comp["is_risk"] = True
        risks.append(comp)

    masks: Dict[str, np.ndarray] = {"target": target["mask"]}
    for r in risks:
        masks[r["key"]] = r["mask"]

    structures = []
    for comp in [target] + risks:
        structures.append({
            "key": comp["key"],
            "label": comp["label"],
            "class": comp["class"],
            "volume_ml": comp["volume_ml"],
            "is_target": comp.get("is_target", False),
            "is_risk": comp.get("is_risk", False),
            "color": comp.get("color", "#94a3b8"),
            "method": "seuillage_HU_heuristique",
            "source": "dicom_voxels",
        })
    return {"structures": structures, "masks": masks, "voxel_ml": voxel_ml}


# ---------------------------------------------------------------------------
# Simulation de marge de sécurité — dilation morphologique réelle
# ---------------------------------------------------------------------------
def _dilate_by_margin(mask: np.ndarray, margin_mm: float, spacing: Tuple[float, float, float]) -> np.ndarray:
    """Dilate le masque binaire de `margin_mm` réels (dilation euclidienne exacte).

    `distance_transform_edt(~mask, sampling=spacing)` renvoie, pour chaque voxel
    de fond, sa distance en mm au masque ; la dilation est l'ensemble des points
    à distance <= margin_mm. O(N) et déterministe — contrairement à une
    `binary_dilation` avec un élément structurant ellipsoïde de rayon 10-30 mm
    (plusieurs dizaines de secondes sur un volume 160³), ce qui rend le
    recalcul instantané de la marge (3ᵉ clic) réellement instantané.
    """
    if margin_mm <= 0:
        return mask.copy()
    from scipy import ndimage

    dist = ndimage.distance_transform_edt(~mask, sampling=spacing)
    return dist <= margin_mm


def compute_margin_simulation(
    target_mask: np.ndarray,
    risk_masks: Dict[str, np.ndarray],
    margin_mm: float,
    spacing: Tuple[float, float, float],
    voxel_ml: float,
    specialty: str,
) -> Dict[str, Any]:
    """Calcule l'effet de la marge : volume réséqué + chevauchement des risques
    + résultat du garde-fou. Retourne le dict `margin_simulation` persisté."""
    dilated = _dilate_by_margin(target_mask, margin_mm, spacing)
    risk_overlaps = {}
    for key, mask in risk_masks.items():
        inter = int((dilated & mask).sum())
        base = int(mask.sum())
        pct = (inter / base * 100.0) if base else 0.0
        risk_overlaps[key] = round(pct, 1)

    resection_ml = round(int(dilated.sum()) * voxel_ml, 3)
    max_overlap_pct = max(risk_overlaps.values(), default=0.0)

    guidelines = MODULE_GUIDELINES.get(specialty) or MODULE_GUIDELINES["_default"]
    min_margin = float(guidelines["min_margin_mm"])
    max_overlap_ok = float(guidelines["max_risk_overlap_pct"])

    flags = []
    if margin_mm < min_margin:
        flags.append({"rule": "min_safety_margin", "status": "warn", "message": f"Marge {margin_mm} mm < seuil {min_margin} mm ({specialty})."})
    else:
        flags.append({"rule": "min_safety_margin", "status": "ok", "message": f"Marge {margin_mm} mm ≥ seuil {min_margin} mm ({specialty})."})
    if max_overlap_pct > max_overlap_ok:
        flags.append({"rule": "max_risk_overlap", "status": "warn", "message": f"Chevauchement risque max {max_overlap_pct}% > seuil {max_overlap_ok}% ({specialty})."})
    else:
        flags.append({"rule": "max_risk_overlap", "status": "ok", "message": f"Chevauchement risque max {max_overlap_pct}% ≤ seuil {max_overlap_ok}% ({specialty})."})

    guardrail = evaluate_guardrail(flags, specialty)
    return {
        "margin_mm": margin_mm,
        "resection_volume_ml": resection_ml,
        "risk_overlaps_pct": risk_overlaps,
        "guardrail": guardrail,
    }


def evaluate_guardrail(flags: List[Dict[str, str]], specialty: str) -> Dict[str, Any]:
    """Garde-fou déterministe non-IA : transcrit chaque règle en ok/warn."""
    warns = [f for f in flags if f["status"] == "warn"]
    ok = all(f["status"] == "ok" for f in flags)
    level = "ok" if ok else "warn"
    guideline = (MODULE_GUIDELINES.get(specialty) or MODULE_GUIDELINES["_default"])["guideline"]
    return {
        "level": level,
        "ok": ok,
        "flags": flags,
        "guideline": guideline,
        "note": "Garde-fou déterministe de démonstration — seuils à valider cliniquement (non CE).",
    }


# ---------------------------------------------------------------------------
# Persistance des masques (recalcul de marge sans relire les DICOM)
# ---------------------------------------------------------------------------
def _save_masks(run_id: str, masks: Dict[str, np.ndarray], spacing: Tuple[float, float, float], voxel_ml: float) -> None:
    run_dir = WORKFLOW_STORAGE / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    arr = {f"m_{k}": v for k, v in masks.items()}
    np.savez_compressed(run_dir / "masks.npz", spacing=np.array(spacing, dtype=np.float32), voxel_ml=np.float32(voxel_ml), **arr)


def _load_masks(run_id: str) -> Optional[Tuple[Dict[str, np.ndarray], Tuple[float, float, float], float]]:
    f = WORKFLOW_STORAGE / run_id / "masks.npz"
    if not f.is_file():
        return None
    try:
        data = np.load(f, allow_pickle=False)
        spacing = tuple(float(x) for x in data["spacing"])
        voxel_ml = float(data["voxel_ml"])
        masks = {k[2:]: data[k].astype(bool) for k in data.files if k.startswith("m_")}
        return masks, spacing, voxel_ml
    except Exception:
        logger.exception("Lecture des masques du run %s impossible", run_id)
        return None


# ---------------------------------------------------------------------------
# Préparation zero-touch
# ---------------------------------------------------------------------------
def _run_preparation(run_id: str, dicom_dir: Optional[Path]) -> None:
    """Tâche de fond : lecture voxels -> extraction -> marge par défaut 10 mm
    -> garde-fou -> stage=ready_for_review. Ne lève jamais (erreurs persistées)."""
    db = SessionLocal()
    run = db.get(models.WorkflowRun, run_id)
    if run is None:
        db.close()
        return
    try:
        run.prep_status = "running"
        run.prep_progress = "Lecture des voxels DICOM…"
        db.commit()

        if dicom_dir is not None and dicom_dir.is_dir():
            loaded = _load_volume_and_spacing(dicom_dir)
        else:
            loaded = None

        if loaded is not None:
            volume, spacing = loaded
            run.prep_progress = "Extraction heuristique des structures…"
            db.commit()
            result = _extract_structures(volume, spacing)
            structures = result["structures"]
            voxel_ml = result["voxel_ml"]
            masks = result["masks"]
            run.source = "dicom_voxels"
        else:
            # Pixels illisibles (DICOM compressé, dossier vide…) : estimation
            # depuis les métadonnées de la série — honnêtement étiquetée.
            structures, voxel_ml, masks = _metadata_estimate(db, run)
            run.source = "metadata_estimate"
            spacing = (1.0, 1.0, 1.0)

        if not structures:
            run.stage = "failed"
            run.prep_status = "error"
            run.prep_error = "Aucune structure extraite (volume homogène, images illisibles ou classe hors seuils)."
            run.prep_progress = "Échec de l'extraction."
            db.commit()
            return

        run.prep_progress = "Simulation de la marge par défaut (10 mm)…"
        db.commit()
        target_mask = masks.get("target")
        risk_masks = {k: v for k, v in masks.items() if k != "target"}
        if target_mask is None:
            run.stage = "failed"
            run.prep_status = "error"
            run.prep_error = "Pas de masque cible extrait."
            db.commit()
            return

        run.structures = structures
        _save_masks(run_id, masks, spacing, voxel_ml)
        margin_mm = float(run.safety_margin_mm if run.safety_margin_mm is not None else 10.0)
        run.margin_simulation = compute_margin_simulation(
            target_mask, risk_masks, margin_mm, spacing, voxel_ml, run.specialty or "_default"
        )
        run.stage = "ready_for_review"
        run.prep_status = "done"
        run.prep_progress = "Prêt — structures et simulation de marge disponibles."
        run.prep_error = None
        db.commit()
        logger.info("Workflow %s prêt pour revue (%d structures, %s).", run_id, len(structures), run.source)
    except Exception:
        db.rollback()
        run.prep_status = "error"
        run.prep_error = f"Erreur interne : {type(Exception).__name__}"
        run.stage = "failed"
        run.prep_progress = "Échec de la préparation."
        db.commit()
        logger.exception("Préparation du workflow %s en erreur", run_id)
    finally:
        db.close()


def _metadata_estimate(db, run: models.WorkflowRun) -> Tuple[List[Dict[str, Any]], float, Dict[str, np.ndarray]]:
    """Estimation DEPUIS LES MÉTADONNÉES uniquement (pixels illisibles).
    Structure unique factice `metadata_only` — pas de calcul voxel réel."""
    spacing = (1.0, 1.0, 1.0)
    voxel_ml = 0.001
    structures = [{
        "key": "metadata_only",
        "label": "Structure estimée (métadonnées seules)",
        "class": "inconnu",
        "volume_ml": 0.0,
        "is_target": True,
        "is_risk": False,
        "color": "#94a3b8",
        "method": "estimation_metadonnees",
        "source": "metadata_estimate",
    }]
    masks = {"target": np.zeros((2, 2, 2), dtype=bool)}
    run.prep_progress = "Voxels illisibles — estimation par métadonnées (précision limitée)."
    return structures, voxel_ml, masks


def auto_trigger_for_series(patient_id: str, series_id: Optional[str], modality: str, dicom_dir: Optional[Path], specialty: Optional[str]) -> Optional[str]:
    """Appelé par les 3 chemins d'import (upload, WADO-RS, DIMSE).

    Si WORKFLOW_AUTO_TRIGGER est activé, crée le WorkflowRun (trigger=auto)
    et lance la préparation en tâche de fond. Retourne le run_id ou None.
    """
    if not WORKFLOW_AUTO_TRIGGER:
        logger.info("Zero-touch désactivé (WORKFLOW_AUTO_TRIGGER=false) — pas de run auto pour la série %s.", series_id)
        return None
    return create_workflow_run(patient_id, series_id, modality, dicom_dir, specialty, trigger="auto")


def create_workflow_run(patient_id: str, series_id: Optional[str], modality: str, dicom_dir: Optional[Path], specialty: Optional[str], trigger: str = "manual") -> str:
    db = SessionLocal()
    run = models.WorkflowRun(
        id=str(uuid.uuid4()),
        patient_id=patient_id,
        series_id=series_id,
        modality=(modality or "OT").upper()[:8],
        specialty=specialty,
        trigger=trigger,
        stage="preparing",
        prep_status="pending",
        prep_progress="En attente de préparation…",
        safety_margin_mm=10.0,
        structures=[],
        margin_simulation={},
    )
    db.add(run)
    db.commit()
    run_id = run.id
    db.refresh(run)
    logger.info("Workflow %s créé (trigger=%s) pour la série %s.", run_id, trigger, series_id)
    EXECUTOR.submit(_run_preparation, run_id, dicom_dir)
    db.close()
    return run_id


# ---------------------------------------------------------------------------
# Ajustement (recalcul instantané de marge) — endpoint, hors tâche de fond
# ---------------------------------------------------------------------------
def recalc_margin(run_id: str, margin_mm: float) -> Optional[Dict[str, Any]]:
    db = SessionLocal()
    run = db.get(models.WorkflowRun, run_id)
    if run is None:
        db.close()
        return None
    loaded = _load_masks(run_id)
    if loaded is None:
        db.close()
        return None
    masks, spacing, voxel_ml = loaded
    target = masks.get("target")
    if target is None:
        db.close()
        return None
    risks = {k: v for k, v in masks.items() if k != "target"}
    margin_mm = max(0.0, float(margin_mm))
    sim = compute_margin_simulation(target, risks, margin_mm, spacing, voxel_ml, run.specialty or "_default")
    run.safety_margin_mm = margin_mm
    run.margin_simulation = sim
    db.commit()
    db.close()
    return sim


# ---------------------------------------------------------------------------
# Validation + export
# ---------------------------------------------------------------------------
def validate_workflow(run_id: str, validated_by: str) -> Optional[Dict[str, Any]]:
    db = SessionLocal()
    run = db.get(models.WorkflowRun, run_id)
    if run is None:
        db.close()
        return None
    if run.stage != "ready_for_review":
        db.close()
        return {"error": "run_not_ready", "message": "La préparation n'est pas terminée."}
    validated_at = datetime.now(timezone.utc)
    vby = validated_by or "inconnu"
    run_id, patient_id = run.id, run.patient_id
    run.stage = "validated"
    run.validated_at = validated_at
    run.validated_by = vby
    db.commit()
    db.close()
    return {
        "run_id": run_id,
        "patient_id": patient_id,
        "stage": "validated",
        "validated_at": validated_at.isoformat(),
        "validated_by": vby,
    }


def build_dicom_sr(run: models.WorkflowRun) -> Dict[str, Any]:
    """DICOM SR (PS3.16) structuré de la validation — contenu honnête."""
    margin = run.margin_simulation or {}
    return {
        "object_type": "SR Document",
        "sop_class_uid": "1.2.840.10008.5.1.4.1.1.88.22",
        "title": "Plan ophtalmologique validé — workflow 3 clics",
        "patient_id": run.patient_id,
        "series_id": run.series_id,
        "specialty": run.specialty,
        "modality": run.modality,
        "trigger": run.trigger,
        "stage": run.stage,
        "source": run.source,
        "validated_by": run.validated_by,
        "validated_at": run.validated_at.isoformat() if run.validated_at else None,
        "safety_margin_mm": run.safety_margin_mm,
        "structures": run.structures or [],
        "margin_simulation": margin,
        "disclaimer": "Garde-fou et seuils de démonstration — à valider cliniquement, non CE.",
    }


def export_pdf(run_id: str) -> Optional[Path]:
    """Génère le compte-rendu PDF de validation. Retourne le chemin du fichier."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError:
        logger.warning("reportlab non installé — export PDF indisponible.")
        return None

    db = SessionLocal()
    run = db.get(models.WorkflowRun, run_id)
    if run is None:
        db.close()
        return None

    run_dir = WORKFLOW_STORAGE / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    out = run_dir / "rapport_validation.pdf"

    styles = {
        "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=16, leading=20),
        "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12, leading=16, spaceBefore=8),
        "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9, leading=12),
        "small": ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=10, textColor="#555555"),
    }

    doc = SimpleDocTemplate(str(out), pagesize=A4, topMargin=15 * mm, bottomMargin=15 * mm)
    story = [
        Paragraph("Plan ophtalmologique — rapport de validation", styles["h1"]),
        Spacer(1, 4 * mm),
        Paragraph("Workflow « 3 clics » · OphtalmoSurg Plan (prototype démo)", styles["small"]),
        Spacer(1, 3 * mm),
    ]

    sim = run.margin_simulation or {}
    guard = sim.get("guardrail") or {}
    header_rows = [
        ["Run", run.id],
        ["Patient", run.patient_id],
        ["Série", run.series_id or "—"],
        ["Spécialité", run.specialty or "—"],
        ["Source", run.source or "—"],
        ["Validé par", run.validated_by or "—"],
        ["Validé le", (run.validated_at.isoformat() if run.validated_at else "—")],
        ["Marge de sécurité", f"{run.safety_margin_mm} mm"],
        ["Volume réséqué simulé", f"{sim.get('resection_volume_ml', '—')} mL"],
        ["Garde-fou", guard.get("level", "—")],
    ]
    table = Table([[Paragraph(k, styles["body"]), Paragraph(str(v), styles["body"])] for k, v in header_rows], colWidths=[45 * mm, 110 * mm])
    table.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, "#999999")]))
    story.append(table)

    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("Structures", styles["h2"]))
    for s in (run.structures or []):
        role = "Cible" if s.get("is_target") else "Risque"
        story.append(Paragraph(f"• <b>{s.get('label')}</b> ({role}) — {s.get('volume_ml')} mL — méthode : {s.get('method')}", styles["body"]))

    if guard.get("flags"):
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph("Garde-fou", styles["h2"]))
        for f in guard["flags"]:
            story.append(Paragraph(f"• [{f['status']}] {f['rule']} — {f['message']}", styles["body"]))
        story.append(Paragraph(f"Référence : {guard.get('guideline', '—')}", styles["small"]))
        story.append(Paragraph(guard.get("note", ""), styles["small"]))

    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph("Ce document est généré par un prototype de démonstration. "
                           "Seuils, volumes et labels ne constituent pas un dispositif médical "
                           "et doivent être validés cliniquement (MDR UE 2017/745).", styles["small"]))

    doc.build(story)
    run.export_pdf_path = str(out)
    db.commit()
    db.close()
    return out
