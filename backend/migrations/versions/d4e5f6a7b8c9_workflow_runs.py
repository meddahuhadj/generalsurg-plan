"""workflow_runs — workflow de validation éclair 3 clics

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-03 09:00:00.000000

Ajoute la table `workflow_runs` : un run est créé automatiquement
(trigger='auto') à l'arrivée d'une série DICOM sur le serveur (upload
manuel, PACS DICOMweb WADO-RS, PACS DIMSE) ou manuellement, et porte la
préparation (extraction heuristique des structures, simulation de marge
par défaut 10 mm, garde-fou) ainsi que la validation et les exports.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'workflow_runs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('patient_id', sa.String(length=32), nullable=False),
        sa.Column('series_id', sa.String(length=36), nullable=True),
        sa.Column('modality', sa.String(length=8), nullable=True),
        sa.Column('specialty', sa.String(length=32), nullable=True),
        sa.Column('trigger', sa.String(length=16), nullable=True),
        sa.Column('stage', sa.String(length=24), nullable=True),
        sa.Column('prep_status', sa.String(length=16), nullable=True),
        sa.Column('prep_progress', sa.String(length=256), nullable=True),
        sa.Column('prep_error', sa.Text(), nullable=True),
        sa.Column('source', sa.String(length=24), nullable=True),
        sa.Column('safety_margin_mm', sa.Float(), nullable=True),
        sa.Column('structures', sa.JSON(), nullable=True),
        sa.Column('margin_simulation', sa.JSON(), nullable=True),
        sa.Column('validated_at', sa.DateTime(), nullable=True),
        sa.Column('validated_by', sa.String(length=64), nullable=True),
        sa.Column('export_dicom_sr', sa.JSON(), nullable=True),
        sa.Column('export_pdf_path', sa.String(length=512), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_workflow_runs_patient_id', 'workflow_runs', ['patient_id'])
    op.create_index('ix_workflow_runs_series_id', 'workflow_runs', ['series_id'])


def downgrade() -> None:
    op.drop_index('ix_workflow_runs_series_id', table_name='workflow_runs')
    op.drop_index('ix_workflow_runs_patient_id', table_name='workflow_runs')
    op.drop_table('workflow_runs')
