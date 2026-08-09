"""add twin_biomech table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-02 00:00:00.000001

Première brique de la feuille de route "Jumeau numérique réel" (hyperélasticité
Mooney-Rivlin, voir README/ARCHITECTURE_CAHIER_DES_CHARGES.md §2.2.1 twin-service,
§3.3 TwinBiomech) : une ligne par (patient, tissue_type) portant le modèle de
matériau et ses paramètres — valeur par défaut de la littérature au départ
(source='literature_atlas', voir backend/twin_biomech_atlas.py), remplaçable par
une valeur patiente réelle une fois l'élastographie disponible (non implémenté
ici, cette migration ouvre seulement la place).
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
    op.create_table('twin_biomech',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('patient_id', sa.String(length=32), nullable=False),
    sa.Column('tissue_type', sa.String(length=32), nullable=False),
    sa.Column('model', sa.String(length=32), nullable=False),
    sa.Column('parameters', sa.JSON(), nullable=True),
    sa.Column('source', sa.String(length=32), nullable=False),
    sa.Column('validation_dataset_ref', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('patient_id', 'tissue_type', name='uq_twin_biomech_patient_tissue')
    )
    op.create_index('idx_twin_biomech_patient', 'twin_biomech', ['patient_id'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_twin_biomech_patient', table_name='twin_biomech')
    op.drop_table('twin_biomech')
