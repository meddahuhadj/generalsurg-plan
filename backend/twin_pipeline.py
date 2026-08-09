# -*- coding: utf-8 -*-
"""
twin_pipeline.py — Relie la segmentation IA réelle (segmentation_service.py)
au solveur biomécanique du jumeau numérique (twin_solver.py) : construit un
maillage VOLUMIQUE (tétraédrique) à partir d'une structure déjà segmentée pour
un job donné, le stocke sur disque, et permet de le recharger pour lancer une
déformation dessus (voir routers/twin.py, POST /patients/{id}/twin/deform).

Phase 0b + 1b de la feuille de route "Jumeau numérique réel" : jusqu'ici,
`mesh_export.mask_to_tetmesh` (Phase 0) et `twin_solver.solve` (Phase 1)
n'avaient été validés que sur des formes synthétiques de test — ce module les
branche sur un vrai job de segmentation TotalSegmentator.

⚠️ Limite honnête : `segmentation_service.WORKDIR` (qui contient les fichiers
NIfTI sources) est un répertoire TEMPORAIRE (`tempfile.gettempdir()`), pas un
stockage durable — un job ancien peut avoir été nettoyé par l'OS. Le maillage
tétraédrique lui-même, une fois construit via `build_tetmesh_for_structure`,
est stocké sous `storage/tetmeshes/` (durable, comme `MESH_STORAGE` pour les
GLB) : seule la RECONSTRUCTION depuis zéro nécessite le NIfTI source encore
présent.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from mesh_export import mask_to_tetmesh
from twin_solver import TetMeshPrecomputed, precompute_tet_mesh

import segmentation_service as seg

TETMESH_STORAGE = seg.MESH_STORAGE.parent / "tetmeshes"
TETMESH_STORAGE.mkdir(parents=True, exist_ok=True)


def _label_source(job_id: str, structure: str) -> dict:
    job = seg._JOBS.get(job_id)
    if job is None:
        raise KeyError(f"job_id inconnu : {job_id}")
    if job.get("status") != "done":
        raise ValueError(f"Job pas encore terminé (status={job.get('status')}).")
    sources = job.get("label_sources", {})
    if structure not in sources:
        raise KeyError(
            f"Structure '{structure}' indisponible pour ce job (structures connues : "
            f"{sorted(sources)})."
        )
    return sources[structure]


def build_tetmesh_for_structure(job_id: str, structure: str,
                                 max_interior_points: int = 1500) -> dict:
    """Construit (ou reconstruit) le maillage tétraédrique de `structure` pour
    ce job à partir du NIfTI source déjà segmenté, et le stocke sur disque
    (`.npz`, nœuds + tétraèdres). Retourne les métadonnées (mêmes conventions
    que `mesh_export.mask_to_glb` : num_nodes/num_tets/volume_ml/path).

    Lève KeyError si le job ou la structure sont inconnus, ValueError si le
    job n'est pas terminé, FileNotFoundError si le NIfTI source n'est plus sur
    disque (voir avertissement en tête de module)."""
    import nibabel as nib

    source = _label_source(job_id, structure)
    nifti_path = Path(source["nifti_path"])
    if not nifti_path.is_file():
        raise FileNotFoundError(
            f"Fichier NIfTI source introuvable : {nifti_path} — ce job a peut-être été "
            f"nettoyé (WORKDIR est un répertoire temporaire, voir segmentation_service.WORKDIR)."
        )

    img = nib.load(str(nifti_path))
    data = img.get_fdata()
    zooms = img.header.get_zooms()[:3]
    mask = data == source["label_value"]

    result = mask_to_tetmesh(mask, spacing=zooms, max_interior_points=max_interior_points)

    out_dir = TETMESH_STORAGE / job_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{structure}.npz"
    np.savez(out_path, nodes=result["nodes"], tets=result["tets"])

    return {
        "path": str(out_path),
        "num_nodes": result["num_nodes"],
        "num_tets": result["num_tets"],
        "volume_ml": result["volume_ml"],
    }


def load_tetmesh(job_id: str, structure: str) -> TetMeshPrecomputed:
    """Charge un maillage tétraédrique déjà construit par
    `build_tetmesh_for_structure`. Lève FileNotFoundError s'il n'a pas encore
    été construit pour ce job/structure (appeler d'abord
    POST /segmentation/{job_id}/tetmesh?structure=...)."""
    path = TETMESH_STORAGE / job_id / f"{structure}.npz"
    if not path.is_file():
        raise FileNotFoundError(
            f"Maillage tétraédrique introuvable pour job={job_id} structure={structure} — "
            f"appelez d'abord POST /segmentation/{job_id}/tetmesh?structure={structure}."
        )
    data = np.load(path)
    return precompute_tet_mesh(data["nodes"], data["tets"])
