"""add preanesthesia_assessments and icu_followups tables

Revision ID: c3d4e5f6a7b8
Revises: b2f3d4e5f6a7
Create Date: 2026-08-02 00:00:00.000000

Corrige un écart entre models.py/schema.sql (module Anesthésie-Réanimation,
commit d7d211c) et les migrations Alembic : ces deux tables existaient déjà
côté ORM (dev SQLite, création automatique via Base.metadata.create_all) et
dans schema.sql, mais aucune révision Alembic ne les créait — `alembic upgrade
head` contre une base PostgreSQL neuve échouait donc silencieusement à créer
ces deux tables (les endpoints /patients/{id}/preanesthesie et
/patients/{id}/icu-followups auraient levé une erreur SQL en production).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2f3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('preanesthesia_assessments',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('patient_id', sa.String(length=32), nullable=False),
    sa.Column('asa_score', sa.Integer(), nullable=True),
    sa.Column('asa_urgence', sa.Boolean(), nullable=True),
    sa.Column('mallampati_score', sa.Integer(), nullable=True),
    sa.Column('antecedents', sa.Text(), nullable=True),
    sa.Column('allergies', sa.Text(), nullable=True),
    sa.Column('traitement_chronique', sa.Text(), nullable=True),
    sa.Column('jeune_solide_h', sa.Float(), nullable=True),
    sa.Column('jeune_liquide_h', sa.Float(), nullable=True),
    sa.Column('intubation_difficile_prevue', sa.Boolean(), nullable=True),
    sa.Column('intubation_difficile_notes', sa.Text(), nullable=True),
    sa.Column('checklist', sa.JSON(), nullable=True),
    sa.Column('anesthesiste', sa.String(length=128), nullable=True),
    sa.Column('conclusion', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('patient_id')
    )
    op.create_table('icu_followups',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('patient_id', sa.String(length=32), nullable=False),
    sa.Column('recorded_at', sa.DateTime(), nullable=True),
    sa.Column('sofa_respiration', sa.Integer(), nullable=True),
    sa.Column('sofa_coagulation', sa.Integer(), nullable=True),
    sa.Column('sofa_hepatique', sa.Integer(), nullable=True),
    sa.Column('sofa_cardiovasculaire', sa.Integer(), nullable=True),
    sa.Column('sofa_neurologique', sa.Integer(), nullable=True),
    sa.Column('sofa_renal', sa.Integer(), nullable=True),
    sa.Column('sofa_total', sa.Integer(), nullable=True),
    sa.Column('apache2_score', sa.Integer(), nullable=True),
    sa.Column('glasgow_oculaire', sa.Integer(), nullable=True),
    sa.Column('glasgow_verbale', sa.Integer(), nullable=True),
    sa.Column('glasgow_motrice', sa.Integer(), nullable=True),
    sa.Column('glasgow_total', sa.Integer(), nullable=True),
    sa.Column('rass_score', sa.Integer(), nullable=True),
    sa.Column('vent_mode', sa.String(length=32), nullable=True),
    sa.Column('vent_fio2_pct', sa.Float(), nullable=True),
    sa.Column('vent_peep_cmh2o', sa.Float(), nullable=True),
    sa.Column('vent_vt_ml', sa.Float(), nullable=True),
    sa.Column('vent_fr_rpm', sa.Float(), nullable=True),
    sa.Column('bilan_entrees_ml', sa.Float(), nullable=True),
    sa.Column('bilan_sorties_ml', sa.Float(), nullable=True),
    sa.Column('bilan_net_ml', sa.Float(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('auteur', sa.String(length=128), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('icu_followups')
    op.drop_table('preanesthesia_assessments')
