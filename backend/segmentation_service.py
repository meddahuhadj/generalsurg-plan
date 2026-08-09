# -*- coding: utf-8 -*-
"""
segmentation_service.py — OphtalmoSurg Plan
============================================================
Service RÉEL de segmentation hépatique automatique, basé sur le
package officiel `TotalSegmentator` (nnU-Net, Wasserthal et al.),
PyPI: https://pypi.org/project/TotalSegmentator/

Contrairement à la version précédente (bouton "🔍 TotalSegmentator"
qui appelait un endpoint /segmentation/auto inexistant et retombait
sur une segmentation simulée), ce module exécute une VRAIE inférence
de deep learning sur le volume CT du patient et retourne des volumes
réels en mL pour :

  • task="liver_segments"  → 8 segments de Couinaud réels
    (liver_segment_1 … liver_segment_8, un vrai modèle entraîné
    spécifiquement pour ça — voir Springer JIIM 10.1007/s10278-025-01716-y)
  • task="liver_vessels"   → arbre vasculaire hépatique + tumeur
    (labels réels : liver_vessels, liver_tumor)

LIMITES HONNÊTES (à lire avant mise en prod) :
  1. Le modèle "liver_vessels" NE distingue PAS automatiquement veine
     porte / veine sus-hépatique / artère hépatique : il retourne un
     masque vasculaire unique. Une classification anatomique fine du
     réseau vasculaire (porte vs sus-hépatique) nécessite une analyse
     de squelette/graphe en aval (non incluse ici — c'est un vrai
     sujet de recherche, pas une simple case à cocher).
  2. L'inférence prend de ~10s (GPU, mode --fast) à plusieurs minutes
     (CPU). Ce module l'exécute dans un thread pool avec file de jobs
     asynchrone : le navigateur ne doit PAS attendre une réponse
     synchrone immédiate.
  3. Nécessite les poids du modèle (téléchargés automatiquement au
     premier lancement depuis Zenodo/GitHub par TotalSegmentator —
     prévoir un accès réseau sortant et ~5 Go d'espace disque).
  4. GPU fortement recommandé (CUDA). Fonctionne sur CPU mais lentement.

INSTALLATION
------------
    pip install TotalSegmentator dicom2nifti nibabel numpy fastapi python-multipart

INTÉGRATION dans votre backend/main.py existant :
    from segmentation_service import router as segmentation_router
    app.include_router(segmentation_router)

Endpoints exposés :
    POST /segmentation/auto?patient_id=...   (multipart: fichiers DICOM ou 1 fichier .nii.gz)
         -> {"job_id": "..."} (HTTP 202)
    GET  /segmentation/status/{job_id}
         -> {"status": "pending|running|done|error", "progress": "...", "result": {...} | null}
    GET  /segmentation/result/{job_id}
         -> résultat final (404 tant que non terminé)
============================================================
"""

from __future__ import annotations

import os
import shutil
import tempfile
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from logging_config import get_logger
import segmentation_specialties as spec

logger = get_logger(__name__)

router = APIRouter(prefix="/segmentation", tags=["segmentation"])

# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------
WORKDIR = Path(tempfile.gettempdir()) / "ophtalmosurg_segmentation"
WORKDIR.mkdir(parents=True, exist_ok=True)

# Dossier servi statiquement (voir main.py: app.mount("/meshes", ...)) contenant
# les maillages .glb générés — c'est ce que le frontend charge via THREE.GLTFLoader.
MESH_STORAGE = Path(os.getenv("MESH_STORAGE_DIR", "./storage/meshes")).resolve()
MESH_STORAGE.mkdir(parents=True, exist_ok=True)

# Couleurs par type de structure (RGBA 0-255), cohérentes avec la palette du frontend
MESH_COLORS = {
    "liver_segment": (139, 58, 58, 200),
    "liver_vessels": (255, 107, 53, 220),
    "liver_tumor": (239, 68, 68, 220),
    "liver": (79, 195, 247, 120),
}

# Un seul job lourd (GPU) à la fois par défaut — augmentez si vous avez
# plusieurs GPU ou tournez en CPU multi-cœurs avec prudence sur la RAM.
EXECUTOR = ThreadPoolExecutor(max_workers=1)

# Mode d'inférence : "gpu" si CUDA dispo, sinon "cpu" (voir device= plus bas).
DEVICE = "gpu"  # passez à "cpu" si pas de GPU — TotalSegmentator gère le fallback lui-même
FAST_MODE = False  # True = modèle allégé, beaucoup plus rapide, un peu moins précis

# Ordre anatomique des labels liver_segment_1..8 tel que défini par
# TotalSegmentator (map_to_binary.py) — correspond aux segments de
# Couinaud I à VIII dans cet ordre.
COUINAUD_ORDER = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]

_JOBS: Dict[str, dict] = {}


class JobStatus(BaseModel):
    job_id: str
    status: str  # pending | running | done | error
    progress: Optional[str] = None
    result: Optional[dict] = None
    error: Optional[str] = None


# ------------------------------------------------------------------
# Conversion DICOM -> NIfTI (réelle, via dicom2nifti)
# ------------------------------------------------------------------
def _dicom_dir_to_nifti(dicom_dir: Path, out_nifti: Path) -> None:
    try:
        import dicom2nifti
    except ImportError as e:
        raise RuntimeError(
            "dicom2nifti n'est pas installé. `pip install dicom2nifti`."
        ) from e

    dicom2nifti.settings.disable_validate_slice_increment()
    # convert_directory produit un ou plusieurs .nii.gz dans out_nifti.parent
    out_nifti.parent.mkdir(parents=True, exist_ok=True)
    dicom2nifti.convert_directory(str(dicom_dir), str(out_nifti.parent), compression=True, reorient=True)

    produced = sorted(out_nifti.parent.glob("*.nii.gz"))
    if not produced:
        raise RuntimeError("Conversion DICOM → NIfTI: aucun fichier produit (série invalide ou incomplète).")
    # On prend le plus gros fichier (série principale, écarte les scouts/topogrammes)
    biggest = max(produced, key=lambda p: p.stat().st_size)
    if biggest != out_nifti:
        shutil.move(str(biggest), str(out_nifti))


# ------------------------------------------------------------------
# Calcul de volumes réels (mL) depuis un NIfTI multi-label
# ------------------------------------------------------------------
def _label_volumes_ml(nifti_path: Path, label_names: Dict[int, str]) -> Dict[str, float]:
    import nibabel as nib

    img = nib.load(str(nifti_path))
    data = img.get_fdata()
    zooms = img.header.get_zooms()[:3]  # mm par voxel (x, y, z)
    voxel_vol_ml = (zooms[0] * zooms[1] * zooms[2]) / 1000.0  # mm3 -> mL

    out: Dict[str, float] = {}
    for label_val, name in label_names.items():
        count = int(np.sum(data == label_val))
        out[name] = round(count * voxel_vol_ml, 1)
    return out


# ------------------------------------------------------------------
# Maillage 3D réel (marching cubes -> GLB) pour un label donné
# ------------------------------------------------------------------
def _maybe_build_mesh(job_id: str, nifti_path: Path, label_value: int, name: str,
                       color: tuple, job: dict) -> Optional[str]:
    """
    Tente d'extraire un maillage GLB réel pour ce label. Ne lève JAMAIS
    d'exception vers l'appelant : un échec de maillage (masque vide, trop
    petit, scikit-image/trimesh absents...) ne doit pas faire échouer tout
    le job de segmentation — les volumes restent valides même sans mesh.
    Retourne l'URL relative (/meshes/...) si réussi, sinon None.
    """
    try:
        from mesh_export import nifti_label_to_glb
        out_path = MESH_STORAGE / job_id / f"{name}.glb"
        info = nifti_label_to_glb(nifti_path, label_value=label_value, out_path=out_path, color_rgba=color)
        job.setdefault("mesh_info", {})[name] = info
        # Retient (chemin NIfTI, valeur de label) par structure nommée — nécessaire
        # pour reconstruire un maillage VOLUMIQUE (tétraédrique) à la demande plus
        # tard (voir twin_pipeline.build_tetmesh_for_structure), sans redemander une
        # nouvelle inférence. mesh_info ne garde que les métadonnées du GLB (surface),
        # pas de quoi retrouver le masque source.
        job.setdefault("label_sources", {})[name] = {
            "nifti_path": str(nifti_path), "label_value": label_value,
        }
        return f"/meshes/{job_id}/{name}.glb"
    except Exception as e:  # noqa: BLE001
        logger.error("Échec de génération du maillage '%s' (label %s): %s", name, label_value, e)
        return None


def _maybe_build_lowpoly_twin_mesh(job_id: str, target_faces: int = 1500) -> Optional[str]:
    """Variante bas-poly de liver_total.glb, dédiée à l'onglet "Jumeau numérique"
    (simulation de déformation PBD en JavaScript pur côté frontend) : plusieurs
    milliers de sommets y feraient chuter le framerate — voir
    index.html (assets/app-part*.js):buildTwinGeometryFromRealLiverMesh(). Ne lève
    jamais d'exception : un échec ne doit pas invalider le job de segmentation,
    le frontend retombe alors sur l'anatomie procédurale pour le Jumeau."""
    try:
        from mesh_export import decimate_glb
        in_path = MESH_STORAGE / job_id / "liver_total.glb"
        out_path = MESH_STORAGE / job_id / "liver_total_lowpoly.glb"
        decimate_glb(in_path, out_path, target_faces=target_faces, color_rgba=MESH_COLORS["liver"])
        return f"/meshes/{job_id}/liver_total_lowpoly.glb"
    except Exception as e:  # noqa: BLE001
        logger.error("Échec de génération du maillage bas-poly (Jumeau PBD): %s", e)
        return None


# ------------------------------------------------------------------
# Job de segmentation réel (exécuté dans le thread pool)
# ------------------------------------------------------------------
def _run_segmentation_job(job_id: str, nifti_input: Path, patient_id: str,
                          specialty: str = "hbp") -> None:
    """Point d'entrée du job, avec dispatch par spécialité :
      - hbp → pipeline dédié (segments de Couinaud + vaisseaux + tumeur)
      - autres spécialités chirurgicales → pipeline générique task="total"
        (+ tâches dédiées ex. kidney_vessels pour l'urologie)
    anesthesie_reanimation n'a pas de segmentation organique : l'endpoint
    le refuse proprement en amont."""
    job = _JOBS[job_id]
    job["progress"] = f"Pipeline de segmentation pour la spécialité '{specialty}'..."
    if specialty in spec.GENERIC_SPECIALTIES:
        _run_generic_specialty_job(job_id, nifti_input, patient_id, specialty)
    else:
        _run_liver_job(job_id, nifti_input, patient_id)


def _run_liver_job(job_id: str, nifti_input: Path, patient_id: str) -> None:
    job = _JOBS[job_id]
    t0 = time.time()
    try:
        from totalsegmentator.python_api import totalsegmentator

        job_dir = WORKDIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        # ── 1) Segments de Couinaud (I-VIII) — vrai modèle dédié ──
        job["status"] = "running"
        job["progress"] = "Segmentation des 8 segments de Couinaud (nnU-Net)..."
        seg_out = job_dir / "liver_segments.nii.gz"
        totalsegmentator(
            input=str(nifti_input), output=str(seg_out),
            task="liver_segments", ml=True, output_type="nifti",
            device=DEVICE, fast=FAST_MODE, quiet=True,
        )
        seg_labels = {i + 1: f"liver_segment_{i + 1}" for i in range(8)}
        seg_volumes = _label_volumes_ml(seg_out, seg_labels)

        # ── 2) Vaisseaux hépatiques + tumeur — vrai modèle dédié ──
        job["progress"] = "Segmentation vaisseaux hépatiques + tumeur (nnU-Net)..."
        vess_out = job_dir / "liver_vessels.nii.gz"
        totalsegmentator(
            input=str(nifti_input), output=str(vess_out),
            task="liver_vessels", ml=True, output_type="nifti",
            device=DEVICE, fast=False,  # liver_vessels ne supporte pas fast=True
            quiet=True,
        )
        vess_volumes = _label_volumes_ml(vess_out, {1: "liver_vessels", 2: "liver_tumor"})

        # ── 3) Volume hépatique total (organe complet) ──
        job["progress"] = "Segmentation du foie entier (contexte volumétrique)..."
        total_out = job_dir / "total.nii.gz"
        totalsegmentator(
            input=str(nifti_input), output=str(total_out),
            task="total", ml=True, output_type="nifti",
            device=DEVICE, fast=FAST_MODE, roi_subset=["liver"], quiet=True,
        )
        # Dans la task "total", le label "liver" a l'index fixe défini par
        # TotalSegmentator (class_map "total"). On le retrouve dynamiquement
        # pour éviter de coder en dur un numéro de version à version.
        from totalsegmentator.map_to_binary import class_map
        total_map = class_map["total"]
        liver_label = next((k for k, v in total_map.items() if v == "liver"), None)
        liver_total_ml = 0.0
        if liver_label is not None:
            liver_total_ml = _label_volumes_ml(total_out, {liver_label: "liver"}).get("liver", 0.0)

        segments_payload: List[dict] = []
        for i, roman in enumerate(COUINAUD_ORDER, start=1):
            ml = seg_volumes.get(f"liver_segment_{i}", 0.0)
            entry = {
                "organ": "liver_segment", "type": "segment",
                "segment_id": roman, "label": f"liver_segment_{i}",
                "volume_ml": ml,
            }
            entry["mesh_url"] = _maybe_build_mesh(
                job_id, seg_out, label_value=i, name=f"liver_segment_{roman}",
                color=MESH_COLORS["liver_segment"], job=job,
            )
            segments_payload.append(entry)

        tumor_ml = vess_volumes.get("liver_tumor", 0.0)
        if tumor_ml > 0:
            tumor_entry = {"organ": "tumor", "type": "tumeur", "volume_ml": tumor_ml}
            tumor_entry["mesh_url"] = _maybe_build_mesh(
                job_id, vess_out, label_value=2, name="liver_tumor",
                color=MESH_COLORS["liver_tumor"], job=job,
            )
            segments_payload.append(tumor_entry)

        liver_entry = {"organ": "liver", "type": "foie", "volume_ml": liver_total_ml}
        if liver_label is not None:
            liver_entry["mesh_url"] = _maybe_build_mesh(
                job_id, total_out, label_value=liver_label, name="liver_total",
                color=MESH_COLORS["liver"], job=job,
            )
        if liver_entry.get("mesh_url"):
            liver_entry["mesh_url_lowpoly"] = _maybe_build_lowpoly_twin_mesh(job_id)
        segments_payload.append(liver_entry)

        vessels_mesh_url = _maybe_build_mesh(
            job_id, vess_out, label_value=1, name="liver_vessels",
            color=MESH_COLORS["liver_vessels"], job=job,
        )

        result = {
            "patient_id": patient_id,
            "segments": segments_payload,
            "vessels": [
                {"name": "Arbre vasculaire hépatique (non discriminé porte/sus-hépatique)",
                 "volume_ml": vess_volumes.get("liver_vessels", 0.0),
                 "mesh_url": vessels_mesh_url}
            ],
            "liver_total_ml": liver_total_ml,
            "sum_couinaud_ml": round(sum(s["volume_ml"] for s in segments_payload if s["type"] == "segment"), 1),
            "model": "TotalSegmentator (nnU-Net) — tasks: liver_segments, liver_vessels, total",
            "processing_time_s": round(time.time() - t0, 1),
            "note": (
                "Vaisseaux non classifiés porte/artère/sus-hépatique automatiquement — "
                "masque vasculaire unique. Volumes des segments calculés depuis le nombre "
                "de voxels réel du masque × résolution du CT (mm3 -> mL)."
            ),
        }

        job["status"] = "done"
        job["progress"] = "Terminé."
        job["result"] = result

    except Exception as e:  # noqa: BLE001
        job["status"] = "error"
        job["error"] = f"{type(e).__name__}: {e}"
        job["progress"] = "Échec."
        traceback.print_exc()


def _run_generic_specialty_job(job_id: str, nifti_input: Path, patient_id: str, specialty: str) -> None:
    """Pipeline générique multi-spécialités : une inférence `total` (roi_subset)
    par spécialité + les tâches dédiées éventuelles (ex. kidney_vessels pour
    l'urologie). Produit le même contrat de résultat que le pipeline HBP :
    segments[], vessels[], volumes réels en mL, maillages .glb par structure."""
    job = _JOBS[job_id]
    t0 = time.time()
    try:
        from totalsegmentator.python_api import totalsegmentator
        from totalsegmentator.map_to_binary import class_map

        job_dir = WORKDIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        label_to_value: Dict[str, int] = {}
        volumes: Dict[str, float] = {}
        groups = spec.group_by_task(specialty)

        for task, labels in groups.items():
            job["progress"] = f"Segmentation '{task}' — {', '.join(labels)}..."
            out = job_dir / f"{task}.nii.gz"
            totalsegmentator(
                input=str(nifti_input), output=str(out),
                task=task, ml=True, output_type="nifti",
                device=DEVICE, fast=(task == "total" and FAST_MODE),
                roi_subset=labels, quiet=True,
            )
            task_map = class_map.get(task, {})
            value_by_name = {v: k for k, v in task_map.items()}
            selected = {name: value_by_name[name] for name in labels if name in value_by_name}
            volumes.update(_label_volumes_ml(out, selected))
            label_to_value.update(selected)

        def _mesh_builder(label: str) -> Optional[str]:
            info = spec.structure_info(label)
            value = label_to_value.get(label)
            if value is None:
                return None
            return _maybe_build_mesh(
                job_id, job_dir / f"{info['task']}.nii.gz",
                label_value=value, name=label, color=info["color"], job=job,
            )

        segments = spec.build_generic_segments_payload(specialty, volumes, _mesh_builder)
        vessels = spec.build_generic_vessels_payload(specialty, volumes, _mesh_builder)
        total_ml = round(sum(v for v in volumes.values() if v and v > 0), 1)

        result = {
            "patient_id": patient_id,
            "specialty": specialty,
            "segments": segments,
            "vessels": vessels,
            "total_ml": total_ml,
            "model": "TotalSegmentator (nnU-Net) — task: total"
                     + (" (+ kidney_vessels)" if "kidney_vessels" in groups else ""),
            "processing_time_s": round(time.time() - t0, 1),
            "note": (
                f"Segmentation générique pour la spécialité '{specialty}' : une "
                "inférence task='total' (roi_subset) par spécialité, sans tâche "
                "dédiée au foie. Volumes calculés depuis le nombre de voxels réel "
                "du masque × résolution du CT (mm3 -> mL)."
            ),
        }

        job["status"] = "done"
        job["progress"] = "Terminé."
        job["result"] = result

    except Exception as e:  # noqa: BLE001
        job["status"] = "error"
        job["error"] = f"{type(e).__name__}: {e}"
        job["progress"] = "Échec."
        traceback.print_exc()


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------
def start_job_from_dicom_dir(dicom_dir: Path, patient_id: str, specialty: str = "hbp") -> str:
    """Démarre un job de segmentation à partir d'un dossier de fichiers .dcm
    DÉJÀ PRÉSENTS SUR DISQUE (ex. une série importée depuis un PACS et
    sauvegardée par pacs_router.py), sans passer par un nouvel upload de
    fichiers. Retourne le job_id — mêmes GET /status/{job_id} et
    /result/{job_id} que pour un job démarré via POST /segmentation/auto.

    `specialty` choisit le pipeline : "hbp" (défaut, segments de Couinaud +
    vaisseaux + tumeur) ou une autre spécialité chirurgicale (pipeline
    générique task="total" + tâches dédiées).

    Factorisé pour que start_segmentation() (upload direct) et le nouvel
    endpoint « segmenter cette série déjà importée » partagent EXACTEMENT
    la même conversion DICOM->NIfTI et le même pipeline d'inférence — pas de
    logique dupliquée qui pourrait diverger silencieusement.
    """
    if not dicom_dir.is_dir() or not any(dicom_dir.iterdir()):
        raise ValueError(f"Dossier DICOM vide ou introuvable : {dicom_dir}")

    if specialty not in spec.GENERIC_SPECIALTIES and specialty != "hbp":
        raise ValueError(
            f"Spécialité '{specialty}' sans pipeline de segmentation. "
            f"Pipelines disponibles : hbp + {', '.join(spec.GENERIC_SPECIALTIES)}."
        )

    job_id = uuid.uuid4().hex[:12]
    job_dir = WORKDIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    _JOBS[job_id] = {"status": "pending", "progress": "En file d'attente...", "result": None, "error": None}

    nifti_path = job_dir / "input.nii.gz"
    try:
        _dicom_dir_to_nifti(dicom_dir, nifti_path)
    except Exception as e:  # noqa: BLE001
        _JOBS[job_id]["status"] = "error"
        _JOBS[job_id]["error"] = f"Conversion DICOM->NIfTI échouée: {e}"
        raise

    EXECUTOR.submit(_run_segmentation_job, job_id, nifti_path, patient_id, specialty)
    return job_id


@router.get("/capabilities")
async def capabilities():
    """Indique quelles briques du pipeline réel sont disponibles sur ce serveur,
    pour que le frontend puisse afficher un message clair plutôt qu'un échec muet."""
    def _has(mod: str) -> bool:
        try:
            __import__(mod)
            return True
        except ImportError:
            return False

    has_gpu = False
    try:
        import torch
        has_gpu = torch.cuda.is_available()
    except ImportError:
        pass

    return {
        "totalsegmentator": _has("totalsegmentator"),
        "dicom2nifti": _has("dicom2nifti"),
        "nibabel": _has("nibabel"),
        "mesh_export": _has("skimage") and _has("trimesh"),
        "gpu": has_gpu,
        "ready_for_real_segmentation": _has("totalsegmentator") and _has("dicom2nifti") and _has("nibabel"),
        "ready_for_mesh_export": _has("skimage") and _has("trimesh") and _has("nibabel"),
        # Depuis la généralisation multi-spécialités : le pipeline réel couvre
        # désormais toutes les spécialités chirurgicales (hbp via liver_segments/
        # liver_vessels, les autres via task="total" + tâches dédiées).
        "supported_specialties": ["hbp"] + spec.GENERIC_SPECIALTIES,
        "specialty_pipelines": {
            "hbp": "liver_segments + liver_vessels + total/liver (Couinaud I-VIII)",
            **{s: ", ".join(spec.valid_specialty_structures(s))
               for s in spec.GENERIC_SPECIALTIES},
        },
    }


@router.post("/auto", status_code=202)
async def start_segmentation(patient_id: str, specialty: str = "hbp",
                             files: List[UploadFile] = File(...)):
    """
    Démarre un job de segmentation réel. Accepte soit :
      - plusieurs fichiers .dcm (une série DICOM complète), soit
      - un seul fichier .nii / .nii.gz déjà reconstruit.
    `specialty` (par défaut "hbp") choisit le pipeline : hbp = segments de
    Couinaud + vaisseaux + tumeur ; colorectal/gastrique/thyroide/thoracique/
    cardiaque/urologie = pipeline générique task="total" (roi_subset) + tâches
    dédiées (ex. kidney_vessels pour l'urologie).
    Retourne immédiatement un job_id (HTTP 202) — le calcul tourne en
    tâche de fond, le front doit sonder GET /segmentation/status/{job_id}.
    """
    if not files:
        raise HTTPException(400, "Aucun fichier reçu.")

    if specialty not in spec.GENERIC_SPECIALTIES and specialty != "hbp":
        raise HTTPException(
            400,
            f"Spécialité '{specialty}' sans pipeline de segmentation. "
            f"Pipelines disponibles : hbp + {', '.join(spec.GENERIC_SPECIALTIES)}.",
        )

    first_name = (files[0].filename or "").lower()
    try:
        if len(files) == 1 and (first_name.endswith(".nii") or first_name.endswith(".nii.gz")):
            job_id = uuid.uuid4().hex[:12]
            job_dir = WORKDIR / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            _JOBS[job_id] = {"status": "pending", "progress": "En file d'attente...", "result": None, "error": None}
            nifti_path = job_dir / "input.nii.gz"
            with open(nifti_path, "wb") as f:
                f.write(await files[0].read())
            EXECUTOR.submit(_run_segmentation_job, job_id, nifti_path, patient_id, specialty)
            return {"job_id": job_id, "status": "pending"}
        else:
            # Dossier de réception temporaire, DISTINCT du job_id final : la
            # conversion DICOM->NIfTI et le job tournent dans leur propre
            # répertoire, créé par start_job_from_dicom_dir. Ce dossier de
            # réception est nettoyé juste après (les fichiers .dcm bruts
            # n'ont pas besoin de survivre une fois convertis en NIfTI).
            staging_dir = Path(tempfile.mkdtemp(dir=WORKDIR, prefix="upload_"))
            try:
                for uf in files:
                    dest = staging_dir / (uf.filename or f"{uuid.uuid4().hex}.dcm")
                    with open(dest, "wb") as f:
                        f.write(await uf.read())
                # Réutilise EXACTEMENT le même chemin que « segmenter une
                # série déjà importée » : évite que les deux points d'entrée
                # divergent silencieusement avec le temps.
                job_id = start_job_from_dicom_dir(staging_dir, patient_id, specialty)
                return {"job_id": job_id, "status": "pending"}
            finally:
                shutil.rmtree(staging_dir, ignore_errors=True)
    except ValueError as e:
        raise HTTPException(400, f"Préparation des données échouée: {e}") from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Préparation des données échouée: {e}") from e


@router.get("/status/{job_id}", response_model=JobStatus)
async def get_status(job_id: str):
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "job_id inconnu.")
    return JobStatus(job_id=job_id, status=job["status"], progress=job.get("progress"),
                      result=job.get("result") if job["status"] == "done" else None,
                      error=job.get("error"))


@router.get("/result/{job_id}")
async def get_result(job_id: str):
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "job_id inconnu.")
    if job["status"] != "done":
        raise HTTPException(409, f"Job pas encore terminé (status={job['status']}).")
    return job["result"]


@router.post("/{job_id}/tetmesh")
async def build_tetmesh(job_id: str, structure: str):
    """
    Construit un maillage VOLUMIQUE (tétraédrique) pour `structure` (déjà
    segmentée dans ce job — voir GET /segmentation/result/{job_id} pour la
    liste des noms disponibles) et le stocke sur disque. Préalable
    indispensable au solveur biomécanique réel du jumeau numérique
    (POST /patients/{patient_id}/twin/deform, voir routers/twin.py) : jusqu'ici
    ce solveur n'avait été validé que sur des formes synthétiques de test
    (backend/tests/test_twin_solver.py), pas sur un vrai maillage patient.
    """
    try:
        import twin_pipeline
        info = twin_pipeline.build_tetmesh_for_structure(job_id, structure)
    except KeyError as e:
        raise HTTPException(404, str(e)) from e
    except (ValueError, FileNotFoundError) as e:
        raise HTTPException(409, str(e)) from e
    return {"job_id": job_id, "structure": structure, **info}


@router.get("/margin/{job_id}")
async def get_oncologic_margin(
    job_id: str,
    structure_a: str = "liver_tumor",
    structure_b: str = "liver_vessels",
    safety_margin_mm: Optional[float] = None,
):
    """Marge oncologique réelle : distance 3D minimale entre la surface de
    `structure_a` (tumeur par défaut) et `structure_b` (vaisseaux par
    défaut), calculée depuis les maillages .glb déjà générés pour ce job
    (voir mesh_export.surface_to_surface_min_distance pour la méthode et
    ses limites — approximation par échantillonnage, pas une distance
    solide-à-solide exacte)."""
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "job_id inconnu.")
    if job["status"] != "done":
        raise HTTPException(409, f"Job pas encore terminé (status={job['status']}).")

    mesh_info = job.get("mesh_info", {})
    for name in (structure_a, structure_b):
        if name not in mesh_info:
            raise HTTPException(
                404,
                f"Maillage '{name}' indisponible pour ce job (structure non détectée "
                f"ou génération GLB échouée — voir GET /segmentation/result/{job_id}).",
            )

    path_a = MESH_STORAGE / job_id / f"{structure_a}.glb"
    path_b = MESH_STORAGE / job_id / f"{structure_b}.glb"
    for p in (path_a, path_b):
        if not p.is_file():
            raise HTTPException(404, f"Fichier maillage introuvable sur disque : {p.name}")

    try:
        from mesh_export import mesh_distance_from_glb
        d = mesh_distance_from_glb(path_a, path_b)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"Échec du calcul de distance surface-à-surface: {e}") from e

    margin_mm = round(d["min_distance_mm"], 2)
    return {
        "job_id": job_id,
        "structure_a": structure_a,
        "structure_b": structure_b,
        "margin_mm": margin_mm,
        "safety_margin_mm": safety_margin_mm,
        "margin_sufficient": (margin_mm >= safety_margin_mm) if safety_margin_mm is not None else None,
        "method": d["method"],
        "details": {
            "direction_a_to_b_mm": round(d["direction_a_to_b_mm"], 2),
            "direction_b_to_a_mm": round(d["direction_b_to_a_mm"], 2),
            "n_points_a": d["n_points_a"], "n_points_b": d["n_points_b"],
        },
        "note": "Distance approximative surface-à-surface (points échantillonnés vs surface exacte), "
                "ne détecte pas un éventuel envahissement (distance ≈ 0 dans ce cas).",
    }
