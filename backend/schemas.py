# -*- coding: utf-8 -*-
"""
schemas.py — Schémas Pydantic partagés (request/response models) pour tous les endpoints.
================================================================================================
Centralise la validation d'entrée/sortie de l'API. Chaque router importe ici ses schémas
plutôt que de les définir en duplication dans chaque fichier. Améliore la documentation
OpenAPI auto-générée et garantit une validation stricte sur tous les endpoints.
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from specialties import Specialty


# ---------------------------------------------------------------------------
# Communs
# ---------------------------------------------------------------------------

class ErrorDetail(BaseModel):
    """Format RFC 7807 (Problem Details) pour les erreurs API."""
    detail: str
    error_id: Optional[str] = None
    status: int
    title: str = "Erreur"


class HealthResponse(BaseModel):
    status: str
    ai: bool
    specialties: List[str]
    db: str
    app_env: str
    seed_demo_users: bool
    pacs_fhir_hl7: bool
    pacs_configured: bool
    circuit_breakers: Dict[str, Any]
    uptime_seconds: float


class ReadyResponse(BaseModel):
    status: str
    checks: Dict[str, str]


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class TwoFARequiredResponse(BaseModel):
    requires_2fa: bool = True
    pre_auth_token: str


class TwoFAVerifyRequest(BaseModel):
    pre_auth_token: str = Field(..., min_length=10)
    code: str = Field(..., min_length=6, max_length=12, description="Code TOTP 6 chiffres ou code de secours")


class TwoFASetupResponse(BaseModel):
    secret: str
    otpauth_uri: str
    qr_png_base64: str


class TwoFAEnableRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class TwoFADisableRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class TwoFARecoveryCodesResponse(BaseModel):
    enabled: bool
    recovery_codes: List[str]
    warning: str


class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    password: str = Field(..., max_length=128)
    full_name: Optional[str] = Field(None, min_length=1, max_length=128)


class RegisterResponse(BaseModel):
    msg: str


# ---------------------------------------------------------------------------
# Gestion des comptes (admin) — voir routers/users.py
# ---------------------------------------------------------------------------

class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    password: str = Field(..., min_length=8, max_length=128)
    full_name: Optional[str] = Field(None, min_length=1, max_length=128)
    role: Literal["admin", "surgeon", "dpo"] = "surgeon"


class UserUpdateRequest(BaseModel):
    role: Optional[Literal["admin", "surgeon", "dpo"]] = None
    is_active: Optional[bool] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    role: str
    is_active: bool
    totp_enabled: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Patients
# ---------------------------------------------------------------------------

class PatientCreate(BaseModel):
    id: str = Field(..., min_length=1, max_length=32)
    nom: str = Field(..., min_length=1, max_length=128)
    age: int = Field(..., ge=0, le=150)
    sexe: Literal["M", "F"]
    poids_kg: float = Field(..., ge=1, le=500)
    taille_cm: float = Field(..., ge=30, le=250)
    diagnostic: str = Field(..., min_length=1, max_length=1000)
    chirurgien: str = Field(..., min_length=1, max_length=128)
    specialty: Specialty = "cataracte"
    urgence: Literal["vert", "orange", "rouge"] = "vert"
    note: Optional[str] = None


class PatientUpdate(BaseModel):
    nom: Optional[str] = Field(None, min_length=1, max_length=128)
    age: Optional[int] = Field(None, ge=0, le=150)
    poids_kg: Optional[float] = Field(None, ge=1, le=500)
    taille_cm: Optional[float] = Field(None, ge=30, le=250)
    diagnostic: Optional[str] = Field(None, min_length=1, max_length=1000)
    specialty: Optional[Specialty] = None
    urgence: Optional[Literal["vert", "orange", "rouge"]] = None
    note: Optional[str] = None


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    nom: str
    age: int
    sexe: str
    poids_kg: float
    taille_cm: float
    diagnostic: str
    chirurgien: str
    specialty: str
    urgence: str
    note: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    bsa: Optional[float] = None


class SegmentCreate(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    type: Literal["organe", "lesion", "resection", "structure_tubulaire", "ganglion"]
    volume_ml: float = Field(..., ge=0)
    label: str = Field(..., min_length=1, max_length=128)
    color_hex: str = Field(default="#ff0000", pattern=r"^#[0-9a-fA-F]{6}$")
    mesh_ref: Optional[str] = None


class SegmentOut(SegmentCreate):
    model_config = ConfigDict(from_attributes=True)

    patient_id: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Dossier & évaluation pré-anesthésique
# ---------------------------------------------------------------------------

class ChecklistItem(BaseModel):
    done: bool = False
    text: str = Field(..., min_length=1, max_length=256)


class PreanesthesiaAssessmentIn(BaseModel):
    asa_score: Optional[int] = Field(None, ge=1, le=5)
    asa_urgence: Optional[bool] = None
    mallampati_score: Optional[int] = Field(None, ge=1, le=4)
    antecedents: Optional[str] = Field(None, max_length=4000)
    allergies: Optional[str] = Field(None, max_length=2000)
    traitement_chronique: Optional[str] = Field(None, max_length=2000)
    jeune_solide_h: Optional[float] = Field(None, ge=0, le=200)
    jeune_liquide_h: Optional[float] = Field(None, ge=0, le=200)
    intubation_difficile_prevue: Optional[bool] = None
    intubation_difficile_notes: Optional[str] = Field(None, max_length=2000)
    checklist: Optional[List[ChecklistItem]] = None
    anesthesiste: Optional[str] = Field(None, max_length=128)
    conclusion: Optional[str] = Field(None, max_length=4000)


class PreanesthesiaAssessmentOut(BaseModel):
    id: str
    patient_id: str
    asa_score: Optional[int] = None
    asa_urgence: bool = False
    mallampati_score: Optional[int] = None
    antecedents: Optional[str] = None
    allergies: Optional[str] = None
    traitement_chronique: Optional[str] = None
    jeune_solide_h: Optional[float] = None
    jeune_liquide_h: Optional[float] = None
    intubation_difficile_prevue: bool = False
    intubation_difficile_notes: Optional[str] = None
    checklist: List[ChecklistItem] = Field(default_factory=list)
    anesthesiste: Optional[str] = None
    conclusion: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Suivi réanimation / USI (plusieurs évaluations dans le temps par patient)
# ---------------------------------------------------------------------------

class IcuFollowUpIn(BaseModel):
    recorded_at: Optional[datetime] = None
    sofa_respiration: Optional[int] = Field(None, ge=0, le=4)
    sofa_coagulation: Optional[int] = Field(None, ge=0, le=4)
    sofa_hepatique: Optional[int] = Field(None, ge=0, le=4)
    sofa_cardiovasculaire: Optional[int] = Field(None, ge=0, le=4)
    sofa_neurologique: Optional[int] = Field(None, ge=0, le=4)
    sofa_renal: Optional[int] = Field(None, ge=0, le=4)
    apache2_score: Optional[int] = Field(None, ge=0, le=71)
    glasgow_oculaire: Optional[int] = Field(None, ge=1, le=4)
    glasgow_verbale: Optional[int] = Field(None, ge=1, le=5)
    glasgow_motrice: Optional[int] = Field(None, ge=1, le=6)
    rass_score: Optional[int] = Field(None, ge=-5, le=4)
    vent_mode: Optional[str] = Field(None, max_length=32)
    vent_fio2_pct: Optional[float] = Field(None, ge=21, le=100)
    vent_peep_cmh2o: Optional[float] = Field(None, ge=0, le=30)
    vent_vt_ml: Optional[float] = Field(None, ge=0, le=1000)
    vent_fr_rpm: Optional[float] = Field(None, ge=0, le=60)
    bilan_entrees_ml: Optional[float] = None
    bilan_sorties_ml: Optional[float] = None
    notes: Optional[str] = Field(None, max_length=4000)
    auteur: Optional[str] = Field(None, max_length=128)


class IcuFollowUpOut(BaseModel):
    id: str
    patient_id: str
    recorded_at: datetime
    sofa_respiration: Optional[int] = None
    sofa_coagulation: Optional[int] = None
    sofa_hepatique: Optional[int] = None
    sofa_cardiovasculaire: Optional[int] = None
    sofa_neurologique: Optional[int] = None
    sofa_renal: Optional[int] = None
    sofa_total: Optional[int] = None
    apache2_score: Optional[int] = None
    glasgow_oculaire: Optional[int] = None
    glasgow_verbale: Optional[int] = None
    glasgow_motrice: Optional[int] = None
    glasgow_total: Optional[int] = None
    rass_score: Optional[int] = None
    vent_mode: Optional[str] = None
    vent_fio2_pct: Optional[float] = None
    vent_peep_cmh2o: Optional[float] = None
    vent_vt_ml: Optional[float] = None
    vent_fr_rpm: Optional[float] = None
    bilan_entrees_ml: Optional[float] = None
    bilan_sorties_ml: Optional[float] = None
    bilan_net_ml: Optional[float] = None
    notes: Optional[str] = None
    auteur: Optional[str] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Jumeau numérique — propriétés biomécaniques (TwinBiomech)
# ---------------------------------------------------------------------------

BiomechModel = Literal["linear", "mooney_rivlin", "ogden", "neo_hookean"]
BiomechSource = Literal["literature_atlas", "patient_elastography", "clinician_override"]


class TwinBiomechIn(BaseModel):
    model: BiomechModel = "mooney_rivlin"
    parameters: Dict[str, float] = Field(..., description="Ex. {\"C10_kpa\": 2.1, \"C01_kpa\": 0.3}")
    source: BiomechSource = "clinician_override"
    validation_dataset_ref: Optional[str] = Field(None, max_length=2000)


class TwinBiomechOut(BaseModel):
    id: Optional[str] = None
    patient_id: str
    tissue_type: str
    model: BiomechModel
    parameters: Dict[str, float]
    source: BiomechSource
    validation_dataset_ref: Optional[str] = None
    note: Optional[str] = Field(None, description="Avertissement d'usage — présent seulement pour les valeurs d'atlas par défaut, absent une fois une vraie valeur patient enregistrée.")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TwinDeformRequest(BaseModel):
    job_id: str = Field(..., description="Job de segmentation déjà terminé (voir GET /segmentation/status/{job_id})")
    structure: str = Field(..., description="Nom de structure déjà segmentée, ex. 'liver_total' — doit avoir un maillage tétraédrique construit via POST /segmentation/{job_id}/tetmesh")
    tissue_type: str = Field(..., description="Clé TwinBiomech pour ce patient (ex. 'liver_parenchyma') — valeur enregistrée si présente, sinon défaut de l'atlas littérature")
    grab_point_mm: list[float] = Field(..., min_length=3, max_length=3, description="Point 3D (mm, repère du maillage) le plus proche du nœud saisi")
    target_delta_mm: list[float] = Field(..., min_length=3, max_length=3, description="Déplacement imposé (mm) au nœud saisi")
    pin_axis_fraction: float = Field(0.12, ge=0.0, le=0.5, description="Fraction de l'étendue en X ancrée (pédicule) — même convention que l'ancrage procédural du frontend")
    hyd_stiffness: float = Field(0.6, gt=0.0, le=1.0, description="Rigidité volumique (quasi-incompressibilité) — pas dérivée de TwinBiomech, qui ne modélise pas de module de compressibilité séparé")
    iterations: int = Field(30, ge=1, le=200)


class TwinDeformResponse(BaseModel):
    job_id: str
    structure: str
    tissue_type: str
    num_nodes: int
    num_tets: int
    grabbed_node_index: int
    dev_stiffness: float
    hyd_stiffness: float
    volume_ml_before: float
    volume_ml_after: float
    displacement_mm: list[list[float]] = Field(..., description="Déplacement (mm) de chaque nœud par rapport à sa position au repos, même ordre que le maillage stocké")


# ---------------------------------------------------------------------------
# DICOM
# ---------------------------------------------------------------------------

class DicomMetadata(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    series_uid: str
    study_uid: str
    modality: str
    slice_thickness_mm: Optional[float] = None
    rows: Optional[int] = None
    cols: Optional[int] = None
    num_slices: Optional[int] = None
    filename: Optional[str] = None
    local_path: Optional[str] = None


class DicomUploadResponse(BaseModel):
    series_uid: str
    sha256: str


class SegmentationStartResponse(BaseModel):
    job_id: str
    status: str = "pending"


# ---------------------------------------------------------------------------
# Volumetrie
# ---------------------------------------------------------------------------

class VolumetrieResponse(BaseModel):
    patient_id: str
    specialty: str
    organ_volume_ml: float
    lesion_volume_ml: float
    ratio_lesion_organe_pct: float
    volume_resection_ml: float
    remnant_pct: float
    margin_cm: float
    # Anciennement spécifique à la spécialité "hbp" (retirée) — toujours None
    # désormais, conservés pour compatibilité (voir routers/volumetrie.py).
    tlv_ml: Optional[float] = None
    tv_ml: Optional[float] = None
    flr_pct: Optional[float] = None
    flr_threshold_pct: Optional[float] = None
    flr_safe: Optional[bool] = None
    flr_bw_pct: Optional[float] = None
    bsa_m2: Optional[float] = None


# ---------------------------------------------------------------------------
# Chat / IA
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    specialty: Specialty = "cataracte"
    context: Literal["surgical-planning", "surgical-summary"] = "surgical-planning"


class ChatResponse(BaseModel):
    reply: str
    source: str
    user: str
    fallback_from: Optional[str] = None


class AIProxyRequest(BaseModel):
    model: str = Field(..., min_length=1, max_length=128)
    body: Dict[str, Any]


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: Optional[str]
    patient_id: Optional[str]
    action: str
    resource: Optional[str]
    method: Optional[str]
    path: Optional[str]
    status_code: Optional[int]
    niveau: str
    created_at: datetime

# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

class DicomSRExportRequest(BaseModel):
    patient: Dict[str, Any]
    specialty: Optional[str] = None
    volumetrie: Dict[str, Any] = {}
    notes: Optional[str] = None


class DicomSRExportResponse(BaseModel):
    PatientID: Optional[str]
    PatientName: Optional[str]
    Specialty: Optional[str]
    StudyDate: str
    SurgicalPlan: Dict[str, Any]
    Observations: Optional[str]
