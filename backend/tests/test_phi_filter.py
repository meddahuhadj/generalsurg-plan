# -*- coding: utf-8 -*-
"""
tests/test_phi_filter.py — Vérifie backend/phi_filter.py (filtre best-effort
de pseudonymisation avant envoi à une IA cloud, voir routers/chat.py).

Lancer : cd backend && pytest tests/test_phi_filter.py -v
"""
from phi_filter import redact_text


def test_redacts_email():
    assert redact_text("Contact: jean.dupont@hopital.fr pour suite") == "Contact: [email masqué] pour suite"


def test_redacts_french_phone_number():
    for phone in ("06 12 34 56 78", "0612345678", "+33 6 12 34 56 78", "01.23.45.67.89"):
        result = redact_text(f"Joignable au {phone} avant 18h")
        assert "[téléphone masqué]" in result
        assert phone not in result


def test_redacts_french_nir():
    nir = "1 85 03 75 108 042 12"
    result = redact_text(f"NIR: {nir}")
    assert "[numéro de sécurité sociale masqué]" in result


def test_redacts_date_of_birth_like_pattern():
    result = redact_text("Né le 14/03/1975, admis ce jour")
    assert "[date masquée]" in result
    assert "14/03/1975" not in result


def test_redacts_known_identifier_case_insensitive():
    result = redact_text("Le patient Jean DUPONT présente une masse hépatique",
                          known_identifiers=["Jean Dupont"])
    assert "[identifiant masqué]" in result
    assert "DUPONT" not in result


def test_ignores_short_known_identifiers_to_avoid_false_positives():
    # Un identifiant de 2 caractères ("Op" par ex.) redacterait n'importe quel
    # texte clinique normal — ignoré volontairement (voir docstring du module).
    result = redact_text("Opération prévue demain", known_identifiers=["Op"])
    assert result == "Opération prévue demain"


def test_leaves_clinically_relevant_text_untouched():
    text = "Patient de 62 ans, diagnostic carcinome hépatocellulaire segment VII, ASA 2."
    assert redact_text(text) == text


def test_empty_and_none_text_returns_as_is():
    assert redact_text("") == ""
    assert redact_text(None) is None


def test_multiple_identifiers_and_patterns_combined():
    result = redact_text(
        "Patiente Marie Curie, contact marie.c@mail.fr, née le 07/11/1980.",
        known_identifiers=["Marie Curie"],
    )
    assert "[identifiant masqué]" in result
    assert "[email masqué]" in result
    assert "[date masquée]" in result
    assert "Marie" not in result
    assert "07/11/1980" not in result
