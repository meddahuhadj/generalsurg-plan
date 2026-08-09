# -*- coding: utf-8 -*-
"""
test_compliance_fda_mdr.py — Suite de vérification de l'honnêteté des endpoints "NextGen"
=======================================================================================
Ces tests vérifiaient auparavant des valeurs de conformité réglementaire FABRIQUÉES
("CERTIFIED_COMPLIANT" MDR, faux numéros FDA 510(k) de produits tiers réels, précision
sub-millimétrique codée en dur) et les faisaient passer au vert en CI, ce qui renforçait
une fausse confiance dans un statut de certification qui n'a jamais existé.

Ce fichier a été réécrit pour vérifier le comportement HONNÊTE désormais en place : ces
endpoints déclarent explicitement l'absence de certification réelle et l'absence de calcul
réel derrière certaines métriques, au lieu de simuler un dispositif médical validé.

Exécution :
    pytest tests/test_compliance_fda_mdr.py -v
"""

import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_mdr_fda_status_endpoint_is_honest_about_no_certification():
    """
    Vérifie que /api/v2/compliance/mdr-fda-status déclare honnêtement l'absence de
    certification MDR/FDA réelle, au lieu de l'ancien "CERTIFIED_COMPLIANT" fabriqué.
    """
    response = client.get("/api/v2/compliance/mdr-fda-status")
    assert response.status_code == 200, f"Erreur HTTP: {response.text}"
    data = response.json()

    certs = data["regulatory_certifications"]
    assert certs["eu_mdr_2017_745"]["status"] == "NOT_CERTIFIED"
    assert certs["us_fda_510k"]["status"] == "NOT_SUBMITTED"
    # Les anciens faux numéros 510(k) de produits tiers réels ne doivent plus apparaître.
    assert "predicate_devices" not in certs["us_fda_510k"]
    assert "disclaimer" in data and "non certifié" in data["disclaimer"].lower()


def test_mdr_fda_status_audit_trail_count_is_real_not_fabricated():
    """
    Le compteur d'événements d'audit doit refléter le contenu réel de la table
    audit_logs (ou signaler honnêtement son indisponibilité), jamais une valeur
    fixe fabriquée comme l'ancien fallback "= 42".
    """
    response = client.get("/api/v2/compliance/mdr-fda-status")
    assert response.status_code == 200
    data = response.json()
    trail = data["cryptographic_audit_trail"]
    assert "total_logged_events" in trail
    assert isinstance(trail["total_logged_events"], int)
    assert "audit_table_available" in trail


def test_biomech_respiratory_displacement_is_labeled_as_simplified_model():
    """
    Le modèle de déplacement respiratoire reste une formule paramétrique simple
    (pas un solveur FEM/PBD réel) : vérifie qu'il est désormais étiqueté comme tel.
    """
    response = client.get(
        "/api/v2/biomech/twins/TWIN-TEST-001/respiratory-displacement?phase_rad=1.57"
    )
    assert response.status_code == 200
    data = response.json()

    dz = data["global_diaphragm_shift_mm"]
    assert -15.5 <= dz <= -13.5, f"Déplacement respiratoire incohérent: {dz} mm"
    assert data["model_type"] == "simplified_kinematic_formula_not_patient_calibrated"
    assert "note" in data


def test_biomech_elastic_registration_no_longer_fabricates_results():
    """
    L'ancien endpoint /elastic-registration renvoyait des métriques de convergence
    fixes (final_rms_mm=0.34, 18 itérations) indépendamment du nuage de points fourni
    — aucun recalage n'était réellement calculé. Vérifie que l'endpoint déclare
    maintenant honnêtement l'absence d'implémentation au lieu de fabriquer un résultat.
    """
    payload = {
        "twin_id": "TWIN-TEST-001",
        "intraop_point_cloud": [[10.2, 24.5, -5.1], [12.0, 25.1, -4.8], [15.4, 22.0, -6.2]],
        "stiffness_regularization": 0.05,
        "max_iterations": 50,
    }
    response = client.post("/api/v2/biomech/twins/TWIN-TEST-001/elastic-registration", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "not_implemented"
    assert data["num_points_received"] == len(payload["intraop_point_cloud"])
    assert "final_rms_error_mm" not in data


def test_voice_dictate_report_is_labeled_as_keyword_matching_not_llm():
    """
    Le générateur de compte-rendu CCAM reste un appariement de mots-clés, pas un LLM.
    Vérifie que la réponse le déclare explicitement et ne prétend plus être un document
    "signé et verrouillé" au sens légal.
    """
    payload = {
        "patient_id": "PAT-TEST-MDR-888",
        "twin_id": "TWIN-888",
        "surgeon_username": "dr.hadj.test",
        "specialty": "Laryngologie",
        "raw_voice_transcript": "Laryngectomie totale avec curage cervical fonctionnel bilatéral. Prothèse phonatoire trachéo-œsophagienne mise en place.",
        "request_fhir_cda": True,
    }
    response = client.post("/api/v2/voice/dictate-report", json=payload)
    assert response.status_code == 201
    data = response.json()

    assert data["generation_method"] == "keyword_matching_demo"
    assert len(data["ccam_codes_assigned"]) > 0
    assert data["ccam_codes_assigned"][0]["code"] == "GALA002"

    sha_hash = data["sha256_integrity_hash"]
    assert len(sha_hash) == 64, "Le hash SHA-256 ne fait pas 64 caractères hexadécimaux"
    assert all(c in "0123456789abcdef" for c in sha_hash.lower())


def test_or_monitor_hemodynamics_is_labeled_as_simulated():
    """
    Le flux de constantes vitales "en direct" reste une génération sinus/cosinus, pas
    une acquisition depuis un moniteur réel — vérifie l'étiquetage explicite et
    l'absence des noms de moniteurs commerciaux (Dräger/Mindray) implicitement associés
    à ces valeurs simulées.
    """
    response = client.get("/api/v2/or-monitor/hemodynamics/TWIN-OR-TEST-111?phase_t=1.0")
    assert response.status_code == 200
    data = response.json()

    assert data["data_source"] == "SIMULATED_WAVEFORM"
    assert "monitor_device" not in data


def test_or_anesthesia_hemodynamic_clamping_simulation_is_labeled_as_heuristic():
    """
    La simulation de clampage reste un outil de règles à seuils fixes, pas un modèle
    physiologique validé cliniquement — vérifie l'étiquetage explicite en plus du
    comportement fonctionnel (tolérance/chute de PAM) déjà couvert précédemment.
    """
    payload = {
        "twin_id": "TWIN-OR-TEST-111",
        "vessel_name": "Clampage carotidien (exérèse tumorale cervicale)",
        "clamping_duration_min": 1.5,
        "specialty": "Cervicofacial",
        "patient_asa_score": 2,
    }
    response = client.post("/api/v2/or-monitor/simulate-clamping", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["max_ischemia_tolerance_min"] == 3.0
    assert data["remaining_safe_ischemia_min"] == 1.5
    assert data["hemodynamic_impact_prediction"]["map_drop_mmhg"] < 0
    assert data["model_type"] == "rule_based_heuristic_fixed_thresholds_not_clinically_validated"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
