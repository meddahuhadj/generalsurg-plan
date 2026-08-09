# -*- coding: utf-8 -*-
"""
routers/twin.py — Propriétés biomécaniques du jumeau numérique (TwinBiomech).

Première brique exposée de la feuille de route "Jumeau numérique réel"
(hyperélasticité Mooney-Rivlin — voir README, ARCHITECTURE_CAHIER_DES_CHARGES.md
§2.2.1/§3.3). Ne calcule aucune déformation : gère seulement les PARAMÈTRES
matériau par tissu pour un patient, avec un défaut issu de la littérature
(`twin_biomech_atlas.py`) tant qu'aucune valeur réelle (élastographie ou
saisie clinicienne) n'a été enregistrée.

Endpoints exposés :
    GET    /patients/{patient_id}/twin/biomech                  liste effective (stocké ou défaut d'atlas)
    PUT    /patients/{patient_id}/twin/biomech/{tissue_type}     enregistre/écrase une valeur réelle
    DELETE /patients/{patient_id}/twin/biomech/{tissue_type}     revient au défaut d'atlas
    POST   /patients/{patient_id}/twin/deform                    Phase 1b : lance le solveur XPBD
           réel (twin_solver.py) sur un maillage tétraédrique patient déjà construit
           (voir POST /segmentation/{job_id}/tetmesh) — premier branchement du solveur
           sur de vraies données, plus seulement des formes synthétiques de test.
"""

from datetime import datetime
from typing import List

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

import models
import twin_pipeline
import twin_solver
from db import get_db
from deps import get_current_user, write_audit
from schemas import TwinBiomechIn, TwinBiomechOut, TwinDeformRequest, TwinDeformResponse
from twin_biomech_atlas import LITERATURE_ATLAS, get_default_biomech

router = APIRouter(tags=["twin"])


def _stored_out(rec: models.TwinBiomech) -> TwinBiomechOut:
    return TwinBiomechOut(
        id=rec.id, patient_id=rec.patient_id, tissue_type=rec.tissue_type,
        model=rec.model, parameters=rec.parameters_json or {}, source=rec.source,
        validation_dataset_ref=rec.validation_dataset_ref, note=None,
        created_at=rec.created_at, updated_at=rec.updated_at,
    )


def _atlas_out(patient_id: str, tissue_type: str) -> TwinBiomechOut:
    entry = get_default_biomech(tissue_type)
    return TwinBiomechOut(
        id=None, patient_id=patient_id, tissue_type=tissue_type,
        model=entry["model"], parameters=entry["parameters"], source="literature_atlas",
        validation_dataset_ref=None, note=entry["note"],
    )


@router.get("/patients/{patient_id}/twin/biomech", response_model=List[TwinBiomechOut])
async def list_twin_biomech(patient_id: str,
                             current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Valeurs EFFECTIVES (stockées si présentes, sinon défaut d'atlas) pour
    chaque type de tissu connu de l'atlas — pas seulement ce qui est en base,
    pour que le frontend ait toujours une valeur exploitable à afficher."""
    if not db.get(models.Patient, patient_id):
        raise HTTPException(404, "Patient introuvable.")

    stored = {
        r.tissue_type: r for r in db.query(models.TwinBiomech).filter(
            models.TwinBiomech.patient_id == patient_id
        ).all()
    }
    return [
        _stored_out(stored[tissue_type]) if tissue_type in stored else _atlas_out(patient_id, tissue_type)
        for tissue_type in LITERATURE_ATLAS
    ]


@router.put("/patients/{patient_id}/twin/biomech/{tissue_type}", response_model=TwinBiomechOut)
async def upsert_twin_biomech(patient_id: str, tissue_type: str, body: TwinBiomechIn, request: Request,
                               current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Enregistre une valeur réelle (élastographie ou ajustement clinicien),
    qui remplace le défaut d'atlas pour ce tissu tant qu'elle n'est pas supprimée."""
    if not db.get(models.Patient, patient_id):
        raise HTTPException(404, "Patient introuvable.")

    rec = db.query(models.TwinBiomech).filter(
        models.TwinBiomech.patient_id == patient_id, models.TwinBiomech.tissue_type == tissue_type
    ).first()
    created = rec is None
    if created:
        rec = models.TwinBiomech(patient_id=patient_id, tissue_type=tissue_type)
        db.add(rec)

    rec.model = body.model
    rec.parameters_json = body.parameters
    rec.source = body.source
    rec.validation_dataset_ref = body.validation_dataset_ref
    rec.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(rec)
    write_audit(db, request,
                "Création valeur biomécanique jumeau" if created else "Modification valeur biomécanique jumeau",
                "twin_biomech", user=current, patient_id=patient_id, niveau="ok",
                metadata={"tissue_type": tissue_type, "model": body.model, "source": body.source})
    return _stored_out(rec)


@router.delete("/patients/{patient_id}/twin/biomech/{tissue_type}", response_model=TwinBiomechOut)
async def reset_twin_biomech(patient_id: str, tissue_type: str, request: Request,
                              current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Supprime la valeur enregistrée pour ce tissu — le patient revient au
    défaut d'atlas (pas une erreur si rien n'était enregistré : idempotent)."""
    if not db.get(models.Patient, patient_id):
        raise HTTPException(404, "Patient introuvable.")

    rec = db.query(models.TwinBiomech).filter(
        models.TwinBiomech.patient_id == patient_id, models.TwinBiomech.tissue_type == tissue_type
    ).first()
    if rec:
        db.delete(rec)
        db.commit()
        write_audit(db, request, "Réinitialisation valeur biomécanique jumeau (retour à l'atlas)",
                    "twin_biomech", user=current, patient_id=patient_id, niveau="info",
                    metadata={"tissue_type": tissue_type})
    return _atlas_out(patient_id, tissue_type)


def _shear_kpa_from_parameters(parameters: dict) -> float:
    """μ ≈ 2·(C10+C01) — voir twin_biomech_atlas.py pour la dérivation et ses
    limites (approximation Néo-Hookéenne, C01 généralement nul dans l'atlas
    actuel)."""
    return 2.0 * (float(parameters.get("C10_kpa", 0.0)) + float(parameters.get("C01_kpa", 0.0)))


@router.post("/patients/{patient_id}/twin/deform", response_model=TwinDeformResponse)
async def deform_twin(patient_id: str, body: TwinDeformRequest, request: Request,
                       current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Lance le solveur biomécanique réel (twin_solver.solve, Phase 1) sur le
    maillage tétraédrique d'une structure DÉJÀ segmentée pour un patient
    (Phase 0b — voir twin_pipeline.py) : premier branchement du solveur sur de
    vraies données patient, jusqu'ici validé uniquement sur des formes
    synthétiques de test (backend/tests/test_twin_solver.py).

    La rigidité de forme (`dev_stiffness`) est dérivée du module de
    cisaillement effectif du patient pour `tissue_type` (valeur enregistrée
    via PUT /twin/biomech si présente, sinon défaut de l'atlas littérature) —
    voir `twin_solver.stiffness_from_shear_kpa` pour la portée EXACTE de cette
    conversion (relative, pas calibrée en unités physiques réelles). La
    rigidité volumique (`hyd_stiffness`) reste un paramètre direct de la
    requête : TwinBiomech ne modélise pas encore de module de compressibilité
    séparé par tissu.
    """
    if not db.get(models.Patient, patient_id):
        raise HTTPException(404, "Patient introuvable.")

    try:
        mesh = twin_pipeline.load_tetmesh(body.job_id, body.structure)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e

    rec = db.query(models.TwinBiomech).filter(
        models.TwinBiomech.patient_id == patient_id, models.TwinBiomech.tissue_type == body.tissue_type
    ).first()
    parameters = rec.parameters_json if rec else get_default_biomech(body.tissue_type)["parameters"]
    shear_kpa = _shear_kpa_from_parameters(parameters or {})
    if shear_kpa <= 0:
        raise HTTPException(
            422,
            f"Paramètres biomécaniques invalides pour '{body.tissue_type}' "
            f"(module de cisaillement effectif <= 0 : {parameters}).",
        )
    dev_stiffness = twin_solver.stiffness_from_shear_kpa(shear_kpa)

    nodes = mesh.rest_nodes
    x_min, x_max = float(nodes[:, 0].min()), float(nodes[:, 0].max())
    pin_threshold = x_min + (x_max - x_min) * body.pin_axis_fraction
    pinned = nodes[:, 0] <= pin_threshold

    grab_point = np.asarray(body.grab_point_mm, dtype=float)
    grab_idx = int(np.argmin(np.linalg.norm(nodes - grab_point, axis=1)))
    target = nodes[grab_idx] + np.asarray(body.target_delta_mm, dtype=float)

    state = twin_solver.TwinSolverState(positions=nodes.copy(), pinned=pinned, grabbed={grab_idx: target})
    # mesh.rest_volume (twin_solver.precompute_tet_mesh) est en mm³ (nœuds en mm) —
    # /1000 pour convertir en mL, cohérent avec le volume_ml déjà renvoyé par
    # twin_pipeline.build_tetmesh_for_structure (mesh_export.mask_to_tetmesh).
    volume_before = float(mesh.rest_volume.sum()) / 1000.0
    final = twin_solver.solve(mesh, state, dev_stiffness=dev_stiffness,
                              hyd_stiffness=body.hyd_stiffness, iterations=body.iterations)
    F_final = twin_solver.deformation_gradient(final, mesh.tets, mesh.dm_inv)
    volume_after = float((mesh.rest_volume * np.linalg.det(F_final)).sum()) / 1000.0

    write_audit(db, request, "Simulation de déformation du jumeau numérique", "twin_deform",
                user=current, patient_id=patient_id, niveau="ok",
                metadata={"job_id": body.job_id, "structure": body.structure,
                          "tissue_type": body.tissue_type, "dev_stiffness": round(dev_stiffness, 4)})

    return TwinDeformResponse(
        job_id=body.job_id, structure=body.structure, tissue_type=body.tissue_type,
        num_nodes=len(nodes), num_tets=len(mesh.tets), grabbed_node_index=grab_idx,
        dev_stiffness=round(dev_stiffness, 4), hyd_stiffness=body.hyd_stiffness,
        volume_ml_before=round(volume_before, 4), volume_ml_after=round(volume_after, 4),
        displacement_mm=(final - nodes).tolist(),
    )
