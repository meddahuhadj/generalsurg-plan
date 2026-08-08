# -*- coding: utf-8 -*-
"""
routers/surgical_planning.py — Planification chirurgicale (boucle Planification → FLR → Plan chirurgical)
============================================================================================================
Fermeture de la boucle autour du solveur hyperélastique réel (`backend/biomech_solver.py`) :

    1. L'utilisateur dessine un plan de coupe sur les vues MPR → `plane_point` + `plane_normal`
       exprimés dans le référentiel du maillage segmenté (mm, cf. `segmentation_service.py`).
    2. `POST .../resection/simulate` calcule immédiatement :
         • FLR (Future Liver Remnant) = volume du côté remnant / volume total de l'organe,
           par découpage réel du maillage tétraédrique (pas une formule).
         • Marge oncologique = distance minimale tumeur ↔ plan de coupe
           (`biomech_solver.surface_min_distance_to_plane`).
         • Optionnellement (`run_fem=true`) la relaxation hyperélastique post-résection
           (Mooney-Rivlin/Ogden) avec export du maillage déformé en .glb.
    3. Le plan peut être sauvegardé (`POST .../resection/plans`), comparé, marqué comme
       « plan chirurgical retenu » (`.../select`) et exporté (PDF / DICOM SR).

⚠️ AVERTISSEMENT HONNÊTE (repris dans chaque réponse) : le solveur n'est pas validé
cliniquement — les paramètres tissulaires viennent de l'atlas littérature
(`twin_biomech_atlas.py`) et le plan de coupe est exprimé dans le référentiel du maillage
segmenté, pas dans le référentiel DICOM patient. Il s'agit d'aide à la planification,
pas d'un dispositif médical validé.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

import models
from db import get_db
from deps import get_current_user, write_audit
from schemas import (
    CriticalStructureMargin,
    ResectionMetrics,
    ResectionPlanIn,
    ResectionPlanOut,
    ResectionPlanUpdateIn,
    ResectionSimulationOut,
    ResectionSimulationRequest,
    SegmentOut,
)

router = APIRouter(prefix="/api/v2/surgical-planning", tags=["surgical-planning"])

# Répertoire des maillages segmentés (même source que segmentation_service.py : les
# fichiers .glb sont servis par `app.mount("/meshes", StaticFiles(MESH_STORAGE))`).
MESH_STORAGE = Path(__import__("os").getenv("MESH_STORAGE_DIR", "./storage/meshes")).resolve()

# Types de segment reconnus pour l'organe et la lésion (cf. patients.py / segments)
_ORGAN_TYPES = ("organe", "liver", "structure_tubulaire")
_LESION_TYPES = ("lesion", "liver_tumor", "tumeur")
# Structures neurovasculaires critiques (nerf/vaisseau) — jamais réséquées ni
# déformées par le solveur, seule leur distance au plan de coupe est calculée
# (marge de préservation), au même titre qu'une marge oncologique. Aucun pipeline
# de segmentation automatique n'existe pour ces structures en ORL (nerf facial,
# nerf récurrent laryngé...) : elles arrivent ici via import manuel — voir
# POST .../critical-structures/import ci-dessous.
_CRITICAL_TYPES = ("nerve", "vessel")
_DEFAULT_TISSUE_BY_TYPE = {"nerve": "nerve_epineurium", "vessel": "vessel_wall"}

_WARNING = (
    "Solveur hyperélastique non validé cliniquement — planification uniquement. "
    "Paramètres tissulaires issus de l'atlas littérature (twin_biomech_atlas.py). "
    "Le plan de coupe est exprimé dans le référentiel du maillage segmenté (mm)."
)


# ---------------------------------------------------------------------------
# Helpers de résolution (organe, lésion, maillage réel sur disque)
# ---------------------------------------------------------------------------

def _resolve_mesh_path(mesh_ref: Optional[str]) -> Optional[Path]:
    """Convertit un `mesh_ref` (ex. `/meshes/job_id/liver_total.glb` ou chemin
    disque) en chemin réel sur disque, sous réserve qu'il existe."""
    if not mesh_ref:
        return None
    raw = mesh_ref.strip()
    path = Path(raw)
    if raw.startswith("/meshes/") or "meshes" + "/" in raw.replace("\\", "/"):
        rel = raw.replace("\\", "/").split("/meshes/")[-1]
        path = MESH_STORAGE / rel
    elif not path.is_absolute():
        path = MESH_STORAGE / path
    return path if path.is_file() else None


def _patient_segments(db: Session, patient_id: str) -> Tuple[List[models.Segment], List[models.Segment]]:
    segs = db.query(models.Segment).filter(models.Segment.patient_id == patient_id).all()
    organs = [s for s in segs if s.type in _ORGAN_TYPES]
    lesions = [s for s in segs if s.type in _LESION_TYPES]
    return organs, lesions


def _resolve_organ(db: Session, patient_id: str) -> Tuple[models.Segment, Path]:
    organs, _ = _patient_segments(db, patient_id)
    for seg in organs:
        mesh = _resolve_mesh_path(seg.mesh_ref)
        if mesh is not None:
            return seg, mesh
    raise HTTPException(
        400,
        "Aucun maillage 3D réel disponible pour ce patient : le calcul de FLR/marge exige un "
        "maillage segmenté (segments 'organe' avec un mesh .glb réel sur disque). Lancez d'abord "
        "la segmentation (/segmentation/auto) ou créez le segment via /patients/{id}/segments.",
    )


def _resolve_lesion(db: Session, patient_id: str) -> Optional[Tuple[models.Segment, Path]]:
    _, lesions = _patient_segments(db, patient_id)
    for seg in lesions:
        mesh = _resolve_mesh_path(seg.mesh_ref)
        if mesh is not None:
            return seg, mesh
    return None


def _resolve_critical_structures(db: Session, patient_id: str) -> List[Tuple[models.Segment, Path]]:
    """Toutes les structures neurovasculaires critiques (nerf/vaisseau) du patient
    ayant un maillage réel résolvable — typiquement importées manuellement (voir
    POST .../critical-structures/import), faute de pipeline de segmentation
    automatique pour ces structures en ORL."""
    segs = db.query(models.Segment).filter(
        models.Segment.patient_id == patient_id,
        models.Segment.type.in_(_CRITICAL_TYPES),
    ).all()
    out = []
    for seg in segs:
        mesh = _resolve_mesh_path(seg.mesh_ref)
        if mesh is not None:
            out.append((seg, mesh))
    return out


def _tissue_parameters(db: Session, patient_id: str, tissue_type: str) -> dict:
    """Paramètres matériau EFFECTIFS : valeur patiente stockée (twin_biomech) sinon défaut atlas."""
    rec = db.query(models.TwinBiomech).filter(
        models.TwinBiomech.patient_id == patient_id,
        models.TwinBiomech.tissue_type == tissue_type,
    ).first()
    if rec:
        return {"model": rec.model, "parameters": rec.parameters_json or {}}
    from twin_biomech_atlas import get_default_biomech
    entry = get_default_biomech(tissue_type)
    return {"model": entry["model"], "parameters": entry["parameters"]}


def _served_mesh_url(local_path: Path) -> str:
    """URL servie par le mount `/meshes` (StaticFiles sur MESH_STORAGE)."""
    try:
        rel = local_path.resolve().relative_to(MESH_STORAGE.resolve())
        return "/meshes/" + rel.as_posix()
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Cœur du calcul (FLR + marge + FEM optionnel) — réutilisé par simulate & save
# ---------------------------------------------------------------------------

def _compute_resection(db: Session, patient_id: str, req: ResectionSimulationRequest) -> dict:
    from biomech_solver import (
        build_tetmesh_from_glb,
        simulate_post_resection,
        split_tetmesh_by_plane,
        surface_min_distance_to_plane,
    )
    import numpy as np

    p = db.get(models.Patient, patient_id)
    if not p:
        raise HTTPException(404, "Patient introuvable.")

    organ_seg, organ_mesh = _resolve_organ(db, patient_id)
    lesion = _resolve_lesion(db, patient_id)

    plane_point = [float(v) for v in req.plane_point]
    plane_normal = [float(v) for v in req.plane_normal]

    # FLR par découpage réel du maillage tétraédrique
    try:
        tet = build_tetmesh_from_glb(organ_mesh)
        split = split_tetmesh_by_plane(
            tet, np.asarray(plane_point, float), np.asarray(plane_normal, float)
        )
    except ValueError as e:
        raise HTTPException(400, f"Maillage organe non exploitable : {e}")

    total_ml = tet["volume_ml"]
    if split["remnant"] is None:
        raise HTTPException(
            400,
            "Le plan de coupe laisse un remnant (futur reliquat) vide — repositionnez le plan "
            "pour conserver du tissu sain du côté remnant (n·(x−p) > 0).",
        )
    remnant_ml = split["remnant"]["volume_ml"]
    resected_ml = max(0.0, total_ml - remnant_ml)
    flr_pct = remnant_ml / total_ml * 100.0 if total_ml else 0.0

    # Marge oncologique : distance minimale tumeur ↔ plan (côté remnant, estimation)
    margin_mm = None
    margin_ok = None
    if lesion is not None:
        try:
            margin_mm = surface_min_distance_to_plane(lesion[1], np.asarray(plane_point, float),
                                                      np.asarray(plane_normal, float))
            margin_ok = margin_mm >= req.margin_mm
        except ValueError:
            margin_mm = None

    # Marges aux structures critiques (nerf/vaisseau) — même méthode que la marge
    # oncologique, appliquée à chaque structure importée pour ce patient (voir
    # _resolve_critical_structures). Une structure sans maillage réel est
    # simplement absente de la liste plutôt que de bloquer tout le calcul : ce
    # n'est pas parce qu'aucun nerf n'a été importé qu'on doit refuser le FLR.
    critical_margins: List[CriticalStructureMargin] = []
    for seg, mesh_path in _resolve_critical_structures(db, patient_id):
        try:
            d = surface_min_distance_to_plane(mesh_path, np.asarray(plane_point, float),
                                              np.asarray(plane_normal, float))
            d = round(d, 2)
        except ValueError:
            d = None
        critical_margins.append(CriticalStructureMargin(
            segment_id=seg.id, label=seg.label or seg.type, type=seg.type,
            tissue_type=(seg.metadata_json or {}).get("tissue_type"),
            margin_mm=d,
        ))

    metrics = ResectionMetrics(
        total_volume_ml=round(total_ml, 1),
        resected_volume_ml=round(resected_ml, 1),
        remnant_volume_ml=round(remnant_ml, 1),
        flr_pct=round(flr_pct, 1),
        margin_mm=round(margin_mm, 2) if margin_mm is not None else None,
        margin_ok=margin_ok,
        critical_structure_margins=critical_margins,
    )

    deformed_mesh_url = None
    if req.run_fem:
        from twin_biomech_atlas import is_fem_eligible

        if not is_fem_eligible(req.tissue_type):
            raise HTTPException(
                400,
                f"La relaxation FEM hyperélastique n'est pas applicable au tissu "
                f"'{req.tissue_type}' (os/cartilage — voir twin_biomech_atlas.py, "
                f"tissue_class='rigid_non_deformable'). Ce solveur est calibré pour "
                f"un continuum mou quasi-incompressible, pas pour un tissu rigide "
                f"dont la raideur réelle est de plusieurs ordres de grandeur "
                f"supérieure. Relancez avec run_fem=false pour conserver le calcul "
                f"géométrique (FLR + marges) sans simulation de déformation.",
            )
        tissue = _tissue_parameters(db, patient_id, req.tissue_type)
        model = req.model if req.model != "linear" else tissue["model"]
        params = req.tissue_parameters or tissue["parameters"]
        try:
            fem = simulate_post_resection(
                organ_mesh,
                np.asarray(plane_point, float),
                np.asarray(plane_normal, float),
                tissue_params=params,
                model=model,
                max_displacement_mm=req.max_displacement_mm,
            )
            metrics.model = model
            metrics.strain_energy_kpa_mm3_initial = fem.get("strain_energy_kpa_mm3_initial")
            metrics.strain_energy_kpa_mm3_final = fem.get("strain_energy_kpa_mm3_final")
            metrics.strain_energy_relaxation_pct = fem.get("strain_energy_relaxation_pct")
            metrics.peak_displacement_mm = fem.get("peak_displacement_mm")
            metrics.deformed_volume_ml = fem.get("deformed_volume_ml")
            metrics.converged = fem.get("converged")
            metrics.iterations = fem.get("iterations")
            metrics.num_tets_remnant = fem.get("num_tets_remnant")
            deformed_mesh_url = _served_mesh_url(Path(fem["deformed_mesh_local_path"]))
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"Simulation FEM impossible : {e}")

    return {
        "patient_id": patient_id,
        "mesh_ref": organ_seg.mesh_ref,
        "plane_point": plane_point,
        "plane_normal": plane_normal,
        "metrics": metrics,
        "deformed_mesh_url": deformed_mesh_url,
        "warning": _WARNING,
    }


# ---------------------------------------------------------------------------
# Simulation sans persistance (déplacement interactif du plan sur la MPR)
# ---------------------------------------------------------------------------

@router.post("/patients/{patient_id}/resection/simulate", response_model=ResectionSimulationOut)
async def simulate_resection(patient_id: str, req: ResectionSimulationRequest, request: Request,
                             current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Calcule FLR + marge (+ FEM) pour un plan de coupe SANS le sauvegarder —
    pour le retour immédiat pendant le dessin du plan sur la MPR."""
    result = _compute_resection(db, patient_id, req)
    write_audit(db, request, "Simulation de plan de résection", "resection_plan", user=current,
                patient_id=patient_id, niveau="info",
                metadata={"flr_pct": result["metrics"].flr_pct,
                          "margin_mm": result["metrics"].margin_mm,
                          "run_fem": req.run_fem})
    return result


# ---------------------------------------------------------------------------
# Import manuel de structures critiques (nerf/vaisseau) — pont réaliste vers la
# marge de préservation en l'absence de tout modèle de segmentation automatique
# pour ces structures en ORL (nerf facial, nerf récurrent laryngé, hypoglosse,
# axe carotido-jugulaire...). Le maillage vient d'une segmentation manuelle
# faite ailleurs (3D Slicer, ITK-SNAP, Mimics...) et exportée en .glb/.stl/.obj.
# ---------------------------------------------------------------------------

_CRITICAL_STRUCTURE_COLORS = {
    "nerve": (255, 215, 0, 220),    # jaune — convention chirurgicale usuelle pour un nerf
    "vessel": (200, 30, 30, 200),   # rouge — convention vasculaire générique (artère/veine non distinguées ici)
}


@router.post("/patients/{patient_id}/critical-structures/import", response_model=SegmentOut, status_code=201)
async def import_critical_structure(
    patient_id: str,
    request: Request,
    structure_type: str = Form(..., pattern="^(nerve|vessel)$", description="Type de structure critique : nerve ou vessel"),
    label: str = Form(..., min_length=1, max_length=128, description="Ex. 'Nerf facial (VII)', 'Veine jugulaire interne'"),
    tissue_type: Optional[str] = Form(None, description="Type de tissu de twin_biomech_atlas.py "
                                      "(ex. nerve_epineurium, vessel_wall) — défaut selon structure_type si omis"),
    file: UploadFile = File(..., description="Maillage segmenté manuellement ailleurs (.glb/.stl/.obj)"),
    current: models.User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Importe le maillage d'une structure neurovasculaire critique déjà segmentée
    MANUELLEMENT (pas par ce backend — aucune IA de segmentation nerf/vaisseau
    n'existe ici, voir README) et l'enregistre comme `Segment` (type nerve/vessel)
    afin qu'elle soit automatiquement prise en compte par
    `POST .../resection/simulate` (marge de préservation, `critical_structure_margins`)."""
    if not db.get(models.Patient, patient_id):
        raise HTTPException(404, "Patient introuvable.")

    suffix = Path(file.filename or "").suffix.lower().lstrip(".")
    if suffix not in ("glb", "stl", "obj"):
        raise HTTPException(400, f"Format de maillage non supporté : '{suffix or '(aucun)'}' "
                                 f"— formats acceptés : .glb, .stl, .obj.")

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Fichier vide.")

    import trimesh
    from io import BytesIO
    try:
        mesh = trimesh.load(BytesIO(raw), file_type=suffix, force="mesh")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Maillage illisible ou corrompu : {e}")

    if not hasattr(mesh, "vertices") or len(mesh.vertices) == 0 or len(mesh.faces) == 0:
        raise HTTPException(400, "Maillage vide (0 sommet ou 0 triangle) — import refusé.")

    seg_id = f"{structure_type}-{uuid.uuid4().hex[:10]}"
    out_dir = MESH_STORAGE / "critical_structures" / patient_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{seg_id}.glb"

    from mesh_export import export_mesh_glb
    export_mesh_glb(mesh, out_path, color_rgba=_CRITICAL_STRUCTURE_COLORS.get(structure_type, (255, 255, 0, 220)))

    # Le volume n'est utile qu'à titre indicatif pour ces structures (jamais
    # réséquées) : None plutôt que 0.0 si le maillage n'est pas fermé (watertight),
    # cohérent avec mesh_export.mask_to_glb ailleurs dans le code.
    volume_ml = float(abs(mesh.volume) / 1000.0) if mesh.is_watertight else 0.0
    resolved_tissue = tissue_type or _DEFAULT_TISSUE_BY_TYPE.get(structure_type, "soft_tissue_generic")

    rec = models.Segment(
        id=seg_id, patient_id=patient_id, type=structure_type,
        volume_ml=round(volume_ml, 3), label=label,
        color_hex="#ffd700" if structure_type == "nerve" else "#c81e1e",
        mesh_ref=_served_mesh_url(out_path),
        metadata_json={"tissue_type": resolved_tissue, "source": "manual_import",
                       "watertight": bool(mesh.is_watertight)},
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    write_audit(db, request, f"Import maillage structure critique ({structure_type})", "critical_structure",
                user=current, patient_id=patient_id, niveau="ok",
                metadata={"segment_id": seg_id, "label": label, "watertight": bool(mesh.is_watertight)})
    return rec


# ---------------------------------------------------------------------------
# CRUD des plans de résection persistés
# ---------------------------------------------------------------------------

def _plan_out(rec: models.ResectionPlan) -> ResectionPlanOut:
    metrics = rec.metrics_json or {}
    return ResectionPlanOut(
        id=rec.id, patient_id=rec.patient_id, title=rec.title, status=rec.status,
        tissue_type=rec.tissue_type, model=rec.model, mesh_ref=rec.mesh_ref,
        plane_point=rec.plane_point or [], plane_normal=rec.plane_normal or [],
        margin_mm=rec.margin_mm,
        metrics=ResectionMetrics(**{
            "total_volume_ml": metrics.get("total_volume_ml"),
            "resected_volume_ml": metrics.get("resected_volume_ml"),
            "remnant_volume_ml": metrics.get("remnant_volume_ml"),
            "flr_pct": metrics.get("flr_pct"),
            "margin_mm": metrics.get("margin_mm"),
            "margin_ok": metrics.get("margin_ok"),
            "critical_structure_margins": metrics.get("critical_structure_margins") or [],
            "model": metrics.get("model"),
            "strain_energy_kpa_mm3_initial": metrics.get("strain_energy_kpa_mm3_initial"),
            "strain_energy_kpa_mm3_final": metrics.get("strain_energy_kpa_mm3_final"),
            "strain_energy_relaxation_pct": metrics.get("strain_energy_relaxation_pct"),
            "peak_displacement_mm": metrics.get("peak_displacement_mm"),
            "deformed_volume_ml": metrics.get("deformed_volume_ml"),
            "converged": metrics.get("converged"),
            "iterations": metrics.get("iterations"),
            "num_tets_remnant": metrics.get("num_tets_remnant"),
        }),
        deformed_mesh_url=rec.deformed_mesh_url,
        warning=rec.warning,
        created_at=rec.created_at, updated_at=rec.updated_at,
    )


def _get_plan(db: Session, patient_id: str, plan_id: str) -> models.ResectionPlan:
    rec = db.query(models.ResectionPlan).filter(
        models.ResectionPlan.id == plan_id,
        models.ResectionPlan.patient_id == patient_id,
    ).first()
    if not rec:
        raise HTTPException(404, "Plan de résection introuvable.")
    return rec


@router.post("/patients/{patient_id}/resection/plans", response_model=ResectionPlanOut)
async def create_resection_plan(patient_id: str, body: ResectionPlanIn, request: Request,
                                current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Calcule puis PERSISTE un plan de résection (FLR + marge + FEM optionnel)."""
    req = ResectionSimulationRequest(
        plane_point=body.plane_point, plane_normal=body.plane_normal,
        tissue_type=body.tissue_type, model=body.model, margin_mm=body.margin_mm,
        run_fem=body.run_fem, max_displacement_mm=body.max_displacement_mm,
    )
    result = _compute_resection(db, patient_id, req)

    rec = models.ResectionPlan(
        patient_id=patient_id, title=body.title, status="DRAFT",
        tissue_type=body.tissue_type, model=req.model if req.run_fem else body.model,
        mesh_ref=result["mesh_ref"],
        plane_point=result["plane_point"], plane_normal=result["plane_normal"],
        margin_mm=body.margin_mm,
        metrics_json=result["metrics"].model_dump(),
        deformed_mesh_url=result["deformed_mesh_url"],
        warning=result["warning"],
        created_by=current.id if current else None,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    write_audit(db, request, "Création plan de résection", "resection_plan", user=current,
                patient_id=patient_id, niveau="ok",
                metadata={"plan_id": rec.id, "flr_pct": result["metrics"].flr_pct,
                          "run_fem": req.run_fem})
    return _plan_out(rec)


@router.get("/patients/{patient_id}/resection/plans", response_model=List[ResectionPlanOut])
async def list_resection_plans(patient_id: str,
                               current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.get(models.Patient, patient_id):
        raise HTTPException(404, "Patient introuvable.")
    recs = db.query(models.ResectionPlan).filter(
        models.ResectionPlan.patient_id == patient_id
    ).order_by(models.ResectionPlan.created_at.desc()).all()
    return [_plan_out(r) for r in recs]


@router.get("/patients/{patient_id}/resection/plans/{plan_id}", response_model=ResectionPlanOut)
async def get_resection_plan(patient_id: str, plan_id: str,
                             current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _plan_out(_get_plan(db, patient_id, plan_id))


@router.put("/patients/{patient_id}/resection/plans/{plan_id}", response_model=ResectionPlanOut)
async def update_resection_plan(patient_id: str, plan_id: str, body: ResectionPlanUpdateIn,
                                request: Request,
                                current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Met à jour titre/statut, ou recalcule FLR/marge (rapide, sans FEM) si le plan
    de coupe est déplacé. Pour relancer une FEM, refaites `POST .../simulate` puis
    `POST .../select` (ou recréez le plan)."""
    rec = _get_plan(db, patient_id, plan_id)

    if body.title is not None:
        rec.title = body.title
    if body.status is not None:
        rec.status = body.status

    recompute = body.plane_point is not None or body.plane_normal is not None
    if recompute:
        plane_point = [float(v) for v in (body.plane_point or rec.plane_point)]
        plane_normal = [float(v) for v in (body.plane_normal or rec.plane_normal)]
        req = ResectionSimulationRequest(
            plane_point=plane_point, plane_normal=plane_normal,
            tissue_type=rec.tissue_type, model=rec.model,
            margin_mm=body.margin_mm if body.margin_mm is not None else rec.margin_mm,
            run_fem=False,
        )
        result = _compute_resection(db, patient_id, req)
        rec.plane_point = result["plane_point"]
        rec.plane_normal = result["plane_normal"]
        if body.margin_mm is not None:
            rec.margin_mm = body.margin_mm
        rec.metrics_json = result["metrics"].model_dump()
        rec.deformed_mesh_url = result["deformed_mesh_url"]
    elif body.margin_mm is not None:
        rec.margin_mm = body.margin_mm
        metrics = rec.metrics_json or {}
        if "margin_ok" in metrics and metrics.get("margin_mm") is not None:
            metrics["margin_ok"] = metrics["margin_mm"] >= rec.margin_mm
            rec.metrics_json = metrics

    rec.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rec)
    write_audit(db, request, "Modification plan de résection", "resection_plan", user=current,
                patient_id=patient_id, niveau="info",
                metadata={"plan_id": rec.id, "recomputed": recompute, "status": rec.status})
    return _plan_out(rec)


@router.post("/patients/{patient_id}/resection/plans/{plan_id}/select", response_model=ResectionPlanOut)
async def select_resection_plan(patient_id: str, plan_id: str, request: Request,
                                current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Marque ce plan comme le « plan chirurgical retenu » (SELECTED) ; les autres
    plans du patient repassent en DRAFT. Un seul plan retenu par patient."""
    rec = _get_plan(db, patient_id, plan_id)
    for other in db.query(models.ResectionPlan).filter(
        models.ResectionPlan.patient_id == patient_id,
        models.ResectionPlan.id != plan_id,
    ).all():
        other.status = "DRAFT"
    rec.status = "SELECTED"
    rec.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rec)
    write_audit(db, request, "Plan de résection retenu (plan chirurgical)", "resection_plan",
                user=current, patient_id=patient_id, niveau="ok", metadata={"plan_id": rec.id})
    return _plan_out(rec)


@router.delete("/patients/{patient_id}/resection/plans/{plan_id}", status_code=204)
async def delete_resection_plan(patient_id: str, plan_id: str, request: Request,
                                current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    rec = _get_plan(db, patient_id, plan_id)
    db.delete(rec)
    db.commit()
    write_audit(db, request, "Suppression plan de résection", "resection_plan", user=current,
                patient_id=patient_id, niveau="warn", metadata={"plan_id": plan_id})


# ---------------------------------------------------------------------------
# Export du plan retenu (PDF / DICOM SR)
# ---------------------------------------------------------------------------

def _plan_summary_lines(p: models.Patient, rec: models.ResectionPlan) -> List[str]:
    m = rec.metrics_json or {}
    lines = [
        "PLAN DE RESECTION",
        "=================",
        f"Patient          : {p.nom} ({p.id})",
        f"Age / Sexe       : {p.age} / {p.sexe}",
        f"Diagnostic       : {p.diagnostic}",
        f"Specialite       : {p.specialty}",
        "",
        f"Titre du plan    : {rec.title}",
        f"Statut           : {rec.status}",
        f"Tissu / Modele   : {rec.tissue_type} / {rec.model}",
        f"Marge demandee   : {rec.margin_mm:.1f} mm",
        "",
        "METRIQUES CALCULEES",
        "-------------------",
        f"Volume total     : {m.get('total_volume_ml', 'n/a')} mL",
        f"Volume resecte   : {m.get('resected_volume_ml', 'n/a')} mL",
        f"Reliquat (remnant): {m.get('remnant_volume_ml', 'n/a')} mL",
        f"FLR              : {m.get('flr_pct', 'n/a')} %",
    ]
    if m.get("margin_mm") is not None:
        lines.append(f"Marge tumorale    : {m['margin_mm']:.2f} mm (requise {rec.margin_mm:.1f} mm) "
                     f"[{'OK' if m.get('margin_ok') else 'INSUFFISANTE'}]")
    crit = m.get("critical_structure_margins") or []
    if crit:
        lines += ["", "MARGES AUX STRUCTURES CRITIQUES (nerf/vaisseau)", "------------------------------------------------"]
        for cs in crit:
            val = cs.get("margin_mm")
            lines.append(f"{cs.get('label', cs.get('type', '?'))} ({cs.get('type', '?')}) : "
                         f"{'%.2f mm' % val if val is not None else 'non calculable'}")
    if m.get("strain_energy_relaxation_pct") is not None:
        lines += [
            "",
            "SIMULATION POST-RESECTION (solveur hyperelastique)",
            "--------------------------------------------------",
            f"Relaxation energie : {m.get('strain_energy_relaxation_pct')} %",
            f"Deplacement max    : {m.get('peak_displacement_mm')} mm",
            f"Convergence        : {'oui' if m.get('converged') else 'non'} ({m.get('iterations')} it.)",
        ]
    lines += [
        "",
        "Avertissement : solveur non valide cliniquement, aide a la planification uniquement.",
    ]
    return lines


def _export_pdf(p: models.Patient, rec: models.ResectionPlan) -> bytes:
    """Génère un PDF minimal valide (Latin-1) — aucune dépendance externe nécessaire."""
    lines = _plan_summary_lines(p, rec)

    def esc(s: str) -> str:
        return (s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
                 .encode("latin-1", "replace").decode("latin-1"))

    x, y = 50.0, 790.0
    line_h = 13.0
    stream = ["BT", "/F1 10 Tf", f"{x} {y} Td"]
    for ln in (esc(l) for l in lines):
        stream.append(f"({ln}) Tj")
        stream.append(f"0 -{line_h} Td")
    stream.append("ET")

    objs = [
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj",
        "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj",
        "5 0 obj\n<< /Length " + str(len("\n".join(stream))) + " >>\nstream\n"
        + "\n".join(stream) + "\nendstream\nendobj",
    ]

    cursor = len("%PDF-1.4\n")
    offsets = []
    for obj in objs:
        offsets.append(cursor)
        cursor += len(obj) + 1
    xref_entries = "".join(f"{offsets[i]:010d} 00000 n \n" for i in range(5))
    pdf = ("%PDF-1.4\n" + "\n".join(objs) + "\n"
           + f"xref\n0 6\n0000000000 65535 f \n{xref_entries}"
           + "trailer\n<< /Size 6 /Root 1 0 R >>\n"
           + f"startxref\n{cursor}\n%%EOF")
    return pdf.encode("latin-1", "replace")


def _export_dicom_sr(p: models.Patient, rec: models.ResectionPlan) -> bytes:
    """Construit un DICOM SR (Comprehensive SR) réel via pydicom contenant le plan."""
    from pydicom import Dataset, uid
    from pydicom.uid import generate_uid

    m = rec.metrics_json or {}

    def text_content(name: str, scheme: str, value: str) -> Dataset:
        ds = Dataset()
        ds.ConceptNameCodeSequence = [Dataset()]
        ds.ConceptNameCodeSequence[0].CodeValue = scheme
        ds.ConceptNameCodeSequence[0].CodingSchemeDesignator = "99GSP"
        ds.ConceptNameCodeSequence[0].CodeMeaning = name
        ds.ValueType = "TEXT"
        ds.TextValue = value[:1024]
        return ds

    def container(name: str, scheme: str, children: List[Dataset]) -> Dataset:
        ds = Dataset()
        ds.ConceptNameCodeSequence = [Dataset()]
        ds.ConceptNameCodeSequence[0].CodeValue = scheme
        ds.ConceptNameCodeSequence[0].CodingSchemeDesignator = "99GSP"
        ds.ConceptNameCodeSequence[0].CodeMeaning = name
        ds.ValueType = "CONTAINER"
        ds.ContinuityOfContent = "SEPARATE"
        ds.ContentSequence = children
        return ds

    critical_items = [
        text_content(f"Marge structure critique — {cs.get('label', cs.get('type', '?'))}",
                     "GSP.CRITICAL_MARGIN",
                     (f"{cs['margin_mm']:.2f} mm ({cs.get('type', '?')})"
                      if cs.get("margin_mm") is not None else "non calculable"))
        for cs in (m.get("critical_structure_margins") or [])
    ]

    root = container("Plan de résection", "GSP.PLAN",
                     [
                         text_content("Patient", "GSP.PATIENT",
                                      f"{p.nom} ({p.id}) — {p.age} ans/{p.sexe} — {p.diagnostic}"),
                         text_content("Statut du plan", "GSP.STATUS", rec.status),
                         text_content("Tissu / Modèle", "GSP.MATERIAL",
                                      f"{rec.tissue_type} / {rec.model}"),
                         text_content("Marge demandée", "GSP.MARGIN", f"{rec.margin_mm:.1f} mm"),
                         text_content("FLR", "GSP.FLR", f"{m.get('flr_pct', 'n/a')} % "
                                     f"(reliquat {m.get('remnant_volume_ml', 'n/a')} mL sur "
                                     f"{m.get('total_volume_ml', 'n/a')} mL)"),
                         text_content("Marge tumorale", "GSP.TUMOR_MARGIN",
                                      (f"{m['margin_mm']:.2f} mm [OK]"
                                       if m.get("margin_ok") else "non évaluée / insuffisante")),
                         *critical_items,
                         text_content("Simulation FEM", "GSP.FEM",
                                      f"relaxation {m.get('strain_energy_relaxation_pct', 'n/a')} %, "
                                      f"déplacement max {m.get('peak_displacement_mm', 'n/a')} mm, "
                                      f"convergence {m.get('converged', 'n/a')}"),
                         text_content("Avertissement", "GSP.WARNING",
                                      "Solveur non validé cliniquement — aide à la planification uniquement."),
                     ])

    ds = Dataset()
    ds.SOPClassUID = uid.ComprehensiveSRStorage
    ds.SOPInstanceUID = generate_uid()
    ds.Modality = "SR"
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.PatientID = p.id
    ds.PatientName = p.nom
    ds.PatientSex = p.sexe
    ds.ContentDate = datetime.utcnow().strftime("%Y%m%d")
    ds.ContentTime = datetime.utcnow().strftime("%H%M%S")
    ds.SpecificCharacterSet = "ISO_IR 192"
    ds.ValueType = "CONTAINER"
    ds.ContinuityOfContent = "SEPARATE"
    ds.ConceptNameCodeSequence = [Dataset()]
    ds.ConceptNameCodeSequence[0].CodeValue = "GSP.PLAN"
    ds.ConceptNameCodeSequence[0].CodingSchemeDesignator = "99GSP"
    ds.ConceptNameCodeSequence[0].CodeMeaning = "Plan de résection"
    ds.ContentSequence = root.ContentSequence

    from io import BytesIO
    from pydicom import FileMetaDataset
    from pydicom.filewriter import dcmwrite
    from pydicom.uid import ExplicitVRLittleEndian

    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = uid.ComprehensiveSRStorage
    file_meta.MediaStorageSOPInstanceUID = ds.SOPInstanceUID
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds.file_meta = file_meta

    buffer = BytesIO()
    dcmwrite(buffer, ds, enforce_file_format=True)
    return buffer.getvalue()


def _log_export(db: Session, request: Request, patient_id: str, plan_id: str,
                fmt: str, file_bytes: bytes, user: models.User):
    try:
        db.execute(text("""
            INSERT INTO export_history (id, patient_id, user_id, format, file_size_bytes, created_at)
            VALUES (:id, :patient_id, :user_id, :format, :size, NOW())
        """), {
            "id": str(uuid.uuid4()), "patient_id": patient_id,
            "user_id": user.id if user else None, "format": fmt, "size": len(file_bytes),
        })
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
    write_audit(db, request, f"Export plan de résection ({fmt})", "resection_plan", user=user,
                patient_id=patient_id, niveau="ok", metadata={"plan_id": plan_id, "format": fmt})


@router.get("/patients/{patient_id}/resection/plans/{plan_id}/export")
async def export_resection_plan(patient_id: str, plan_id: str,
                                format: str = Query("pdf", pattern="^(pdf|dicom-sr)$"),
                                request: Request = None,
                                current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Exporte le plan de résection retenu en PDF ou DICOM SR (téléchargement)."""
    rec = _get_plan(db, patient_id, plan_id)
    p = db.get(models.Patient, patient_id)
    if not p:
        raise HTTPException(404, "Patient introuvable.")

    from fastapi.responses import Response

    if format == "dicom-sr":
        data = _export_dicom_sr(p, rec)
        media = "application/dicom"
        ext = "dcm"
    else:
        data = _export_pdf(p, rec)
        media = "application/pdf"
        ext = "pdf"

    _log_export(db, request, patient_id, plan_id, format, data, current)
    return Response(content=data, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="plan_{rec.id[:8]}.{ext}"'})
