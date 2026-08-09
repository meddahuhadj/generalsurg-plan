# -*- coding: utf-8 -*-
"""
tests/test_hl7_interop.py — Validation des messages HL7 v2 avec un vrai parseur
==================================================================================
Utilise la bibliothèque `hl7` (parseur HL7 v2 tiers, pas notre propre code)
pour vérifier que les messages générés par interop.py sont structurellement
corrects — segments attendus présents, champs PID/PV1/ORC/OBR au bon endroit.

Lancer : cd backend && pytest tests/test_hl7_interop.py -v
"""
import hl7
import pytest

import interop


class FakePatient:
    id = "P001"
    nom = "DUPONT Jean"
    sexe = "M"
    chirurgien = "Dr. Hadj"
    specialty = "laryngologie"


@pytest.fixture
def patient():
    return FakePatient()


def test_oru_message_type_and_pid(patient):
    msg = interop.hl7_oru_r01(patient, {"organ_volume_ml": 1500, "remnant_pct": 32.5}, [])
    parsed = hl7.parse(msg)
    assert str(parsed.segment("MSH")(9)) == "ORU^R01"
    pid = parsed.segment("PID")
    assert str(pid(3)) == "P001"
    assert str(pid(5)) == "DUPONT Jean"
    assert str(pid(8)) == "M"
    # Bug corrigé pendant cette session : un caractère "~" parasite se
    # trouvait en PID-7 (date de naissance) à cause d'un mauvais compte de
    # séparateurs. Le champ doit être vide (nous ne collectons pas la DDN).
    assert str(pid(7)) == ""


def test_oru_includes_one_obx_per_measurement(patient):
    msg = interop.hl7_oru_r01(patient, {"organ_volume_ml": 1500, "remnant_pct": 32.5,
                                         "lesion_volume_ml": None}, [])
    parsed = hl7.parse(msg)
    obx_segments = [s for s in parsed if str(s[0][0]) == "OBX"]
    # 2 mesures non nulles fournies (lesion_volume_ml=None doit être ignoré).
    assert len(obx_segments) == 2


def test_adt_a08_message_type_and_pv1(patient):
    msg = interop.hl7_adt_a08(patient)
    parsed = hl7.parse(msg)
    assert str(parsed.segment("MSH")(9)) == "ADT^A08"
    assert str(parsed.segment("EVN")(1)) == "A08"
    pv1 = parsed.segment("PV1")
    assert str(pv1(2)) == "O"  # patient ambulatoire
    assert str(pv1(7)) == "Dr. Hadj"
    pid = parsed.segment("PID")
    assert str(pid(3)) == "P001"


def test_orm_o01_message_type_and_order(patient):
    msg = interop.hl7_orm_o01(patient, "Laryngectomie totale")
    parsed = hl7.parse(msg)
    assert str(parsed.segment("MSH")(9)) == "ORM^O01"
    orc = parsed.segment("ORC")
    assert str(orc(1)) == "NW"  # New order
    obr = parsed.segment("OBR")
    assert "Laryngectomie totale" in str(obr(4))


def test_hl7_escaping_of_special_characters():
    """Un nom contenant '|' (séparateur de champ HL7) doit être échappé,
    sinon il romprait la structure en champs du segment PID."""
    class WeirdPatient(FakePatient):
        nom = "DUPONT|Jean"
    msg = interop.hl7_adt_a08(WeirdPatient())
    # _hl7_escape remplace '|' par la séquence d'échappement HL7 "\F\" :
    # le pipe brut ne doit donc plus apparaître tel quel dans le nom transmis.
    assert "DUPONT\\F\\Jean" in msg
    parsed = hl7.parse(msg)
    pid = parsed.segment("PID")
    # Le vrai signal que l'échappement fonctionne : le champ sexe (PID-8), qui
    # vient APRÈS le nom dans le segment, doit rester correctement aligné. Si
    # le pipe n'avait pas été échappé, il aurait créé un champ PID
    # supplémentaire et décalé la position de tous les champs suivants.
    assert str(pid(8)) == "M"
