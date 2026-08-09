# -*- coding: utf-8 -*-
"""
models.py — Modèles SQLAlchemy ORM (miroir de migrations/schema.sql).
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Text, DateTime, ForeignKey, JSON, UniqueConstraint
)
from sqlalchemy.orm import relationship

from db import Base


def _uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    full_name = Column(String(128), nullable=False)
    email = Column(String(256), unique=True, nullable=True)
    role = Column(String(32), nullable=False, default="surgeon")
    hashed_password = Column(Text, nullable=False)
    rpps = Column(String(32), nullable=True)
    is_active = Column(Boolean, default=True)

    # 2FA (TOTP)
    totp_secret = Column(String(64), nullable=True)            # actif une fois activé
    totp_pending_secret = Column(String(64), nullable=True)    # en attente de confirmation
    totp_enabled = Column(Boolean, default=False)
    totp_recovery_codes = Column(JSON, default=list)           # codes de secours (hashés)

    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String(32), primary_key=True)
    nom = Column(String(128), nullable=False)
    age = Column(Integer, nullable=False)
    sexe = Column(String(1), nullable=False)
    poids_kg = Column(Float, nullable=False)
    taille_cm = Column(Float, nullable=False)
    diagnostic = Column(Text, nullable=False)
    chirurgien = Column(String(128), nullable=False)
    specialty = Column(String(32), nullable=False, default="laryngologie")
    urgence = Column(String(16), default="vert")
    note = Column(Text, nullable=True)
    status = Column(String(32), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    segments = relationship("Segment", back_populates="patient", cascade="all, delete-orphan")

    @property
    def bsa_m2(self):
        if not self.poids_kg or not self.taille_cm:
            return None
        return round((self.poids_kg * self.taille_cm / 3600) ** 0.5, 3)


class Segment(Base):
    __tablename__ = "segments"

    id = Column(String(64), primary_key=True)
    patient_id = Column(String(32), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(32), nullable=False)
    volume_ml = Column(Float, nullable=False)
    label = Column(String(128), nullable=True)
    color_hex = Column(String(7), default="#ff0000")
    mesh_ref = Column(Text, nullable=True)     # chemin/URL du maillage STL/GLB réel
    metadata_json = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="segments")


class PreanesthesiaAssessment(Base):
    """Dossier & évaluation pré-anesthésique — un dossier courant par patient."""
    __tablename__ = "preanesthesia_assessments"

    id = Column(String(36), primary_key=True, default=_uuid)
    patient_id = Column(String(32), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, unique=True)
    asa_score = Column(Integer, nullable=True)
    asa_urgence = Column(Boolean, default=False)
    mallampati_score = Column(Integer, nullable=True)
    antecedents = Column(Text, nullable=True)
    allergies = Column(Text, nullable=True)
    traitement_chronique = Column(Text, nullable=True)
    jeune_solide_h = Column(Float, nullable=True)
    jeune_liquide_h = Column(Float, nullable=True)
    intubation_difficile_prevue = Column(Boolean, default=False)
    intubation_difficile_notes = Column(Text, nullable=True)
    checklist_json = Column("checklist", JSON, default=list)
    anesthesiste = Column(String(128), nullable=True)
    conclusion = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    patient = relationship("Patient")


class IcuFollowUp(Base):
    """Suivi réanimation/USI — un patient peut avoir plusieurs évaluations dans le temps
    (contrairement au dossier pré-anesthésique, qui est un état courant unique)."""
    __tablename__ = "icu_followups"

    id = Column(String(36), primary_key=True, default=_uuid)
    patient_id = Column(String(32), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    recorded_at = Column(DateTime, default=datetime.utcnow)

    # SOFA — 6 sous-scores 0-4 (Sepsis-related Organ Failure Assessment), total calculé serveur
    sofa_respiration = Column(Integer, nullable=True)
    sofa_coagulation = Column(Integer, nullable=True)
    sofa_hepatique = Column(Integer, nullable=True)
    sofa_cardiovasculaire = Column(Integer, nullable=True)
    sofa_neurologique = Column(Integer, nullable=True)
    sofa_renal = Column(Integer, nullable=True)
    sofa_total = Column(Integer, nullable=True)

    # APACHE II — score total renseigné (0-71) ; non recalculé ici à partir des variables
    # physiologiques brutes (formule complète non implémentée dans ce prototype).
    apache2_score = Column(Integer, nullable=True)

    # Glasgow (GCS) — 3 sous-scores, total calculé serveur
    glasgow_oculaire = Column(Integer, nullable=True)
    glasgow_verbale = Column(Integer, nullable=True)
    glasgow_motrice = Column(Integer, nullable=True)
    glasgow_total = Column(Integer, nullable=True)

    # RASS — Richmond Agitation-Sedation Scale (-5 à +4)
    rass_score = Column(Integer, nullable=True)

    # Ventilation mécanique
    vent_mode = Column(String(32), nullable=True)
    vent_fio2_pct = Column(Float, nullable=True)
    vent_peep_cmh2o = Column(Float, nullable=True)
    vent_vt_ml = Column(Float, nullable=True)
    vent_fr_rpm = Column(Float, nullable=True)

    # Bilan entrées/sorties (ml), bilan net calculé serveur
    bilan_entrees_ml = Column(Float, nullable=True)
    bilan_sorties_ml = Column(Float, nullable=True)
    bilan_net_ml = Column(Float, nullable=True)

    notes = Column(Text, nullable=True)
    auteur = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient")


class TwinBiomech(Base):
    """Propriétés mécaniques d'un tissu pour le jumeau numérique déformable —
    voir feuille de route "Jumeau numérique réel" (README/ARCHITECTURE_CAHIER_DES_CHARGES
    §2.2.1 twin-service, §3.3 TwinBiomech). Une ligne par (patient, tissue_type) :
    soit une valeur par défaut issue de la littérature (source="literature_atlas",
    voir twin_biomech_atlas.py), soit une valeur réelle patiente (source=
    "patient_elastography" ou "clinician_override") saisie une fois l'élastographie
    disponible — non implémenté ici, cette table ne fait qu'ouvrir la place.
    """
    __tablename__ = "twin_biomech"
    __table_args__ = (UniqueConstraint("patient_id", "tissue_type", name="uq_twin_biomech_patient_tissue"),)

    id = Column(String(36), primary_key=True, default=_uuid)
    patient_id = Column(String(32), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    tissue_type = Column(String(32), nullable=False)   # ex. "liver_parenchyma", "liver_tumor", "vessel_wall"
    model = Column(String(32), nullable=False, default="mooney_rivlin")  # linear | mooney_rivlin | ogden | neo_hookean
    parameters_json = Column("parameters", JSON, default=dict)  # ex. {"C10_kpa": 2.1, "C01_kpa": 0.3}
    source = Column(String(32), nullable=False, default="literature_atlas")
    validation_dataset_ref = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    patient = relationship("Patient")


class DicomSeries(Base):
    __tablename__ = "dicom_series"

    id = Column(String(36), primary_key=True, default=_uuid)
    patient_id = Column(String(32), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    study_uid = Column(String(256), nullable=False)
    series_uid = Column(String(256), unique=True, nullable=False)
    modality = Column(String(8), nullable=False)
    slice_thickness_mm = Column(Float, nullable=True)
    rows = Column(Integer, nullable=True)
    cols = Column(Integer, nullable=True)
    num_slices = Column(Integer, nullable=True)
    sha256 = Column(String(16), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    filename = Column(String(256), nullable=True)
    local_path = Column(String(512), nullable=True)  # dossier disque contenant les fichiers .dcm réels (si sauvegardés)
    imported_at = Column(DateTime, default=datetime.utcnow)


class VolumetrieResult(Base):
    __tablename__ = "volumetrie_results"

    id = Column(String(36), primary_key=True, default=_uuid)
    patient_id = Column(String(32), ForeignKey("patients.id"), nullable=False)
    organ_volume_ml = Column(Float, nullable=False)
    lesion_volume_ml = Column(Float, nullable=False)
    ratio_lesion_organe_pct = Column(Float, nullable=True)
    volume_resection_ml = Column(Float, nullable=True)
    remnant_pct = Column(Float, nullable=False)
    flr_threshold_pct = Column(Float, nullable=True)
    flr_safe = Column(Boolean, nullable=True)
    flr_bw_pct = Column(Float, nullable=True)
    bsa_m2 = Column(Float, nullable=True)
    margin_cm = Column(Float, default=1.0)
    is_cirrhotic = Column(Boolean, default=False)
    computed_at = Column(DateTime, default=datetime.utcnow)


class ResectionPlan(Base):
    """Plan de résection (fermeture de la boucle Planification → FLR → Plan chirurgical).
    Stocke le plan de coupe (point + normale), la marge oncologique demandée, les métriques
    calculées (FLR, volumes, énergie de déformation post-résection) et la référence au maillage
    déformé exporté par le solveur hyperélastique (backend/biomech_solver.py)."""
    __tablename__ = "resection_plans"

    id = Column(String(36), primary_key=True, default=_uuid)
    patient_id = Column(String(32), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(256), nullable=False, default="Plan de résection")
    status = Column(String(32), nullable=False, default="DRAFT")  # DRAFT | SELECTED
    tissue_type = Column(String(32), nullable=False, default="liver_parenchyma")
    model = Column(String(32), nullable=False, default="mooney_rivlin")
    mesh_ref = Column(Text, nullable=True)         # maillage organe réel utilisé pour la simulation
    plane_point = Column(JSON, nullable=False)
    plane_normal = Column(JSON, nullable=False)
    margin_mm = Column(Float, nullable=False, default=5.0)
    metrics_json = Column("metrics", JSON, default=dict)
    deformed_mesh_url = Column(Text, nullable=True)
    warning = Column(Text, nullable=True)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    patient = relationship("Patient")


class AuditLog(Base):
    """Traçabilité complète : qui, quand, quoi, sur quel patient."""
    __tablename__ = "audit_log"

    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(Integer, nullable=True)
    username = Column(String(64), nullable=True)
    patient_id = Column(String(32), nullable=True)
    action = Column(String(256), nullable=False)
    resource = Column(String(64), nullable=True)
    method = Column(String(8), nullable=True)
    path = Column(String(256), nullable=True)
    status_code = Column(Integer, nullable=True)
    ip_address = Column(String(64), nullable=True)
    niveau = Column(String(16), default="info")
    metadata_json = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
