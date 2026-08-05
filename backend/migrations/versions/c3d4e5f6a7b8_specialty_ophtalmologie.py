"""specialty column -> ophtalmologie (cataracte/glaucome/retine)

Revision ID: c3d4e5f6a7b8
Revises: b2f3d4e5f6a7
Create Date: 2026-08-03 00:00:00.000000

Le front (assets/app-part1.js) a été entièrement reconverti à l'ophtalmologie
(3 modules : cataracte, glaucome, retine) ; backend/specialties.py suit
désormais la même liste. Cette migration aligne la colonne patients.specialty :
  - toute ligne existante portant une des 7 anciennes valeurs de chirurgie
    générale (hbp, colorectal, gastrique, thyroide, thoracique, cardiaque,
    urologie) est remappée sur 'cataracte' (valeur par défaut la moins
    arbitraire, aucune correspondance clinique n'existe entre les deux
    nomenclatures — à corriger manuellement si des dossiers réels existent) ;
  - le DEFAULT de la colonne passe de 'hbp' à 'cataracte' ;
  - une contrainte CHECK restreint désormais la colonne aux 3 nouvelles
    valeurs, sur TOUTE base (qu'elle ait été provisionnée via schema.sql, qui
    portait déjà une CHECK sur les 7 anciennes valeurs, ou via `alembic
    upgrade head` depuis 85b9969d21f9, qui n'en portait aucune) — d'où le
    DROP CONSTRAINT IF EXISTS avant l'ADD CONSTRAINT.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2f3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OLD_SPECIALTIES = ('hbp', 'colorectal', 'gastrique', 'thyroide', 'thoracique', 'cardiaque', 'urologie')
_NEW_SPECIALTIES = ('cataracte', 'glaucome', 'retine')


def upgrade() -> None:
    # 1. Remapper les lignes existantes AVANT d'ajouter la contrainte, sinon
    #    la migration échoue sur toute base contenant déjà des patients créés
    #    sous l'ancienne nomenclature (hbp/colorectal/...).
    op.execute(
        "UPDATE patients SET specialty = 'cataracte' "
        "WHERE specialty NOT IN ('cataracte', 'glaucome', 'retine')"
    )

    # 2. Nouveau DEFAULT (l'ancien pointait vers 'hbp', qui n'existe plus).
    op.alter_column('patients', 'specialty', server_default='cataracte')

    # 3. Le nom de contrainte auto-généré par Postgres pour la CHECK inline de
    #    schema.sql est 'patients_specialty_check' ; IF EXISTS couvre aussi
    #    les bases provisionnées via Alembic seul, qui n'ont jamais eu cette
    #    contrainte (85b9969d21f9 ne la définissait pas).
    op.execute("ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_specialty_check")
    op.create_check_constraint(
        'patients_specialty_check', 'patients',
        sa.column('specialty').in_(_NEW_SPECIALTIES),
    )


def downgrade() -> None:
    op.drop_constraint('patients_specialty_check', 'patients', type_='check')
    op.alter_column('patients', 'specialty', server_default='hbp')
    # Remap best-effort AVANT de recréer la contrainte : aucune correspondance
    # clinique cataracte/glaucome/retine -> ancienne nomenclature n'existe, on
    # retombe sur le défaut historique plutôt que de laisser des lignes
    # invalides face à la CHECK ci-dessous.
    op.execute(
        "UPDATE patients SET specialty = 'hbp' "
        "WHERE specialty NOT IN ('hbp', 'colorectal', 'gastrique', 'thyroide', 'thoracique', 'cardiaque', 'urologie')"
    )
    op.create_check_constraint(
        'patients_specialty_check', 'patients',
        sa.column('specialty').in_(_OLD_SPECIALTIES),
    )
