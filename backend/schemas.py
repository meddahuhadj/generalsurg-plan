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
