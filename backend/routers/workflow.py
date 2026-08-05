# -*- coding: utf-8 -*-
"""
routers/workflow.py — API du workflow de validation éclair « 3 clics ».

Parcours (3 clics chirurgien) :
  1. Aperçu  : GET  /workflow/runs/{run_id}          -> structures + simulation (prêt quand prep_status=done)
  2. Ajustement : POST /workflow/runs/{run_id}/margin -> recalcul instantané de la marge (dilation réelle)
  3. Validation : POST /workflow/runs/{run_id}/validate + export DICOM SR / PDF

Préparation zero-touch : POST /workflow/auto-import crée un run manuel quand
WORKFLOW_AUTO_TRIGGER est désactivé, et sert aussi de déclencheur explicite.
La logique métier vit dans workflow_service.py (tâche de fond, heuristique,
garde-fou, exports) — ce router ne fait que l'orchestration HTTP.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
import workflow_service
from db import get_db
from deps import get_current_user, write_audit

router = APIRouter(tags=["workflow"])


# ---------------------------------------------------------------------------
# Schémas de corps de requête (style du repo : définis au plus près des routes)
# ---------------------------------------------------------------------------
class WorkflowAutoImportBody(BaseModel):
    patient_id: str
    series_id: Optional[str] = None
    modality: Optional[str] = None
    specialty: Optional[str] = None


class WorkflowMarginBody(BaseModel):
    margin_mm: float


class WorkflowValidateBody(BaseModel):
    validated_by: Optional[str] = None


# ---------------------------------------------------------------------------
# Déclenchement
# ---------------------------------------------------------------------------
@router.post("/workflow/auto-import")
async def workflow_auto_import(body: WorkflowAutoImportBody, request: Request,
                               current: models.User = Depends(get_current_user),
                               db: Session = Depends(get_db)):
    """Crée un run de workflow pour une série (déclenchement manuel).

    Utilisé quand WORKFLOW_AUTO_TRIGGER=false, ou pour re-préparer une série
    déjà importée. Retourne le run_id immédiatement : la préparation tourne en
    tâche de fond (statut à suivre via GET /workflow/runs/{run_id})."""
    patient = db.get(models.Patient, body.patient_id)
    if not patient:
        raise HTTPException(404, "Patient introuvable.")

    specialty = body.specialty or getattr(patient, "specialty", None) or "_default"
    dicom_dir: Optional[Path] = None
    series_id = body.series_id
    if series_id:
        series = db.get(models.DicomSeries, series_id)
        if series and series.local_path:
            dicom_dir = Path(series.local_path)

    modality = body.modality
    if not modality and series_id:
        series = db.get(models.DicomSeries, series_id)
        if series:
            modality = series.modality

    run_id = workflow_service.create_workflow_run(
        body.patient_id, series_id, modality or "OT", dicom_dir, specialty, trigger="manual"
    )
    write_audit(db, request, "Workflow — déclenchement manuel", "workflow", user=current,
                patient_id=body.patient_id, metadata={"run_id": run_id, "series_id": series_id})
    return {"run_id": run_id, "status": "preparing"}


# ---------------------------------------------------------------------------
# Lecture
# ---------------------------------------------------------------------------
def _run_to_dict(run: models.WorkflowRun) -> Dict[str, Any]:
    return {
        "id": run.id,
        "patient_id": run.patient_id,
        "series_id": run.series_id,
        "modality": run.modality,
        "specialty": run.specialty,
        "trigger": run.trigger,
        "stage": run.stage,
        "prep_status": run.prep_status,
        "prep_progress": run.prep_progress,
        "prep_error": run.prep_error,
        "source": run.source,
        "safety_margin_mm": run.safety_margin_mm,
        "structures": run.structures or [],
        "margin_simulation": run.margin_simulation or {},
        "validated_at": run.validated_at.isoformat() if run.validated_at else None,
        "validated_by": run.validated_by,
        "export_dicom_sr": run.export_dicom_sr,
        "export_pdf_path": run.export_pdf_path,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }


@router.get("/workflow/runs")
async def list_workflow_runs(patient_id: str,
                             current: models.User = Depends(get_current_user),
                             db: Session = Depends(get_db)):
    if not db.get(models.Patient, patient_id):
        raise HTTPException(404, "Patient introuvable.")
    runs = (db.query(models.WorkflowRun)
              .filter(models.WorkflowRun.patient_id == patient_id)
              .order_by(models.WorkflowRun.created_at.desc()).all())
    return {"runs": [_run_to_dict(r) for r in runs]}


@router.get("/workflow/runs/{run_id}")
async def get_workflow_run(run_id: str,
                           current: models.User = Depends(get_current_user),
                           db: Session = Depends(get_db)):
    run = db.get(models.WorkflowRun, run_id)
    if not run:
        raise HTTPException(404, "Run introuvable.")
    return _run_to_dict(run)


# ---------------------------------------------------------------------------
# Ajustement — recalcul instantané de la marge (dilation réelle, sans tâche de fond)
# ---------------------------------------------------------------------------
@router.post("/workflow/runs/{run_id}/margin")
async def recalc_workflow_margin(run_id: str, body: WorkflowMarginBody, request: Request,
                                 current: models.User = Depends(get_current_user),
                                 db: Session = Depends(get_db)):
    run = db.get(models.WorkflowRun, run_id)
    if not run:
        raise HTTPException(404, "Run introuvable.")
    if run.stage not in ("ready_for_review", "validated"):
        raise HTTPException(409, "La préparation du run n'est pas terminée (stage=%s)." % run.stage)
    sim = workflow_service.recalc_margin(run_id, body.margin_mm)
    if sim is None:
        raise HTTPException(422, "Recalcul impossible (masques absents).")
    write_audit(db, request, "Workflow — ajustement marge", "workflow", user=current,
                patient_id=run.patient_id, metadata={"run_id": run_id, "margin_mm": body.margin_mm})
    return sim


# ---------------------------------------------------------------------------
# Validation + exports
# ---------------------------------------------------------------------------
@router.post("/workflow/runs/{run_id}/validate")
async def validate_workflow(run_id: str, body: WorkflowValidateBody, request: Request,
                            current: models.User = Depends(get_current_user),
                            db: Session = Depends(get_db)):
    run = db.get(models.WorkflowRun, run_id)
    if not run:
        raise HTTPException(404, "Run introuvable.")
    validated_by = body.validated_by or current.username
    result = workflow_service.validate_workflow(run_id, validated_by)
    if result is None:
        raise HTTPException(404, "Run introuvable.")
    if "error" in result:
        raise HTTPException(409, result["message"])
    write_audit(db, request, "Workflow — validation plan", "workflow", user=current,
                patient_id=run.patient_id, metadata={"run_id": run_id})
    return result


@router.post("/workflow/runs/{run_id}/export-sr")
async def export_workflow_sr(run_id: str, request: Request,
                             current: models.User = Depends(get_current_user),
                             db: Session = Depends(get_db)):
    run = db.get(models.WorkflowRun, run_id)
    if not run:
        raise HTTPException(404, "Run introuvable.")
    sr = workflow_service.build_dicom_sr(run)
    run.export_dicom_sr = sr
    db.commit()
    write_audit(db, request, "Workflow — export DICOM SR", "workflow", user=current,
                patient_id=run.patient_id, metadata={"run_id": run_id})
    return sr


@router.get("/workflow/runs/{run_id}/export-pdf")
async def export_workflow_pdf(run_id: str, request: Request,
                              current: models.User = Depends(get_current_user),
                              db: Session = Depends(get_db)):
    run = db.get(models.WorkflowRun, run_id)
    if not run:
        raise HTTPException(404, "Run introuvable.")
    path = workflow_service.export_pdf(run_id)
    if not path or not Path(path).is_file():
        raise HTTPException(422, "Export PDF indisponible (reportlab absent ou échec).")
    write_audit(db, request, "Workflow — export PDF", "workflow", user=current,
                patient_id=run.patient_id, metadata={"run_id": run_id})
    return FileResponse(str(path), media_type="application/pdf",
                        filename=f"plan_validation_{run_id[:8]}.pdf")
