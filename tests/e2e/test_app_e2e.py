# -*- coding: utf-8 -*-
"""Tests E2E Playwright du parcours chirurgical principal d'OphtalmoSurg Plan.

Scénario validé sans backend (mode démo) : hub -> sélection de module -> vue Plan 3D
avec MPR, bascule de module/patient, onglet Analyse calculé, i18n, navigation DICOM
sans backend, retour au hub. Chaque test vérifie aussi l'absence d'erreurs JS/réseau
sur le chemin critique (assert_clean_console).
"""

from conftest import assert_clean_console, select_module


def _canvas_sizes(page):
    def size(sel):
        return page.locator(sel).evaluate("el => [el.clientWidth, el.clientHeight]")

    return size("#gl-canvas"), size("#mpr-axial"), size("#mpr-coronal"), size("#mpr-sagittal")


def test_hub_presents_three_ophthalmology_modules(app):
    titles = app.locator(".hub-card-title").all_inner_texts()
    assert len(titles) == 3
    for expected in ("Cataracte", "Glaucome", "Rétinienne"):
        assert any(expected in t for t in titles), titles
    assert_clean_console(app)


def test_select_module_boots_plan_view_with_3d_and_mpr(app):
    select_module(app, "Chirurgie de la Cataracte", "cataracte")
    assert app.evaluate("state.mod") == "cataracte"
    assert app.locator("#app").is_visible()
    assert app.locator("#workflow-stepper .wf-step").count() == 4

    gl, ax, co, sa = _canvas_sizes(app)
    assert gl[0] > 50 and gl[1] > 50, gl
    for name, sz in (("axial", ax), ("coronal", co), ("sagittal", sa)):
        assert sz[0] > 0 and sz[1] > 0, (name, sz)

    sidebar = app.locator("#sidebar").inner_text()
    assert "40521-CAT" in sidebar, "Le patient du module Cataracte doit apparaître dans la sidebar"
    assert_clean_console(app)


def test_three_d_renderer_draws_meshes(app):
    select_module(app, "Chirurgie de la Cataracte", "cataracte")
    assert app.evaluate("typeof scene") == "object"
    assert app.evaluate("scene.children.length") > 0
    triangles = app.evaluate("renderer.info.render.triangles")
    assert triangles > 0, "Le renderer Three.js doit avoir dessiné des triangles"


def test_switch_module_updates_patient_and_anatomy(app):
    select_module(app, "Chirurgie de la Cataracte", "cataracte")
    assert "40521-CAT" in app.locator("#sidebar").inner_text()

    app.locator('.sidebar-item[onclick="switchModule(\'glaucome\')"]').first.click()
    app.wait_for_function(
        "() => document.body.getAttribute('data-mod') === 'glaucome' && "
        "!document.getElementById('loader').classList.contains('show')",
        timeout=20000,
    )
    app.wait_for_timeout(400)
    sidebar = app.locator("#sidebar").inner_text()
    assert "52918-GLA" in sidebar, "Bascule Cataracte -> Glaucome doit changer le patient"
    assert "40521-CAT" not in sidebar

    app.locator('.sidebar-item[onclick="switchModule(\'retine\')"]').first.click()
    app.wait_for_function(
        "() => document.body.getAttribute('data-mod') === 'retine' && "
        "!document.getElementById('loader').classList.contains('show')",
        timeout=20000,
    )
    app.wait_for_timeout(400)
    sidebar = app.locator("#sidebar").inner_text()
    assert "61147-RET" in sidebar, "Bascule Glaucome -> Rétine doit changer le patient"
    assert_clean_console(app)


def test_plan_tab_shows_procedure_metrics(app):
    select_module(app, "Chirurgie du Glaucome", "glaucome")
    labels = app.evaluate("MODULES[state.mod].metrics.map(m => m.label)")
    assert labels, "Le module doit déclarer des métriques"
    body = app.locator("#rtab-body").inner_text()
    for label in labels:
        assert label in body, "Métrique absente de l'onglet Plan : %s" % label
    assert_clean_console(app)


def test_analysis_tab_computes_volumetry_and_risk(app):
    select_module(app, "Chirurgie Vitréo-Rétinienne", "retine")
    app.locator('.rtab[data-tab="analyse"]').click()
    app.wait_for_function(
        "() => { const el = document.getElementById('analyse-body'); "
        "return el && el.innerText.indexOf('Calcul en cours') === -1 && el.innerText.length > 50; }",
        timeout=20000,
    )
    text = app.locator("#analyse-body").inner_text()
    assert "ml" in text, "La volumétrie calculée doit afficher des millilitres"
    assert "%" in text, "Le reste fonctionnel calculé doit afficher un pourcentage"
    high = app.evaluate("I18N.t('analysis.riskHigh')")
    assert any(lbl in text for lbl in (high,)), "Un niveau de risque calculé doit être affiché"
    assert_clean_console(app)


def test_i18n_switch_to_english_updates_labels(app):
    select_module(app, "Chirurgie de la Cataracte", "cataracte")
    twin = app.locator('[data-view="jumeau"] span[data-i18n="nav.twin"]')
    assert twin.inner_text() == "Jumeau Num."

    app.locator(".lang-selector-toggle").click()
    app.locator('.lang-option[data-lang="en"]').click()
    app.wait_for_function("document.documentElement.lang === 'en'", timeout=10000)
    assert app.evaluate("I18N.currentLocale()") == "en"
    assert twin.inner_text() == "Digital Twin"
    assert_clean_console(app)


def test_dicom_nav_degrades_gracefully_without_backend(app):
    select_module(app, "Chirurgie de la Cataracte", "cataracte")
    assert app.evaluate("state.settings.apiBase") == ""
    app.locator('[data-view="dicom"]').click()
    app.wait_for_function(
        "() => document.getElementById('notif').className.indexOf('warn') !== -1",
        timeout=10000,
    )
    notif = app.locator("#notif").inner_text()
    assert "backend" in notif.lower(), notif
    assert app.locator("#modal-dicom-viewer.open").count() == 0, (
        "Le viewer DICOM ne doit pas s'ouvrir sans backend"
    )
    assert_clean_console(app)


def test_hub_returns_from_app(app):
    select_module(app, "Chirurgie de la Cataracte", "cataracte")
    app.locator('button[onclick="openHub()"]').click()
    app.wait_for_selector("#hub:not(.hidden)", state="visible", timeout=10000)
    assert app.locator(".hub-card").count() == 3
    assert app.evaluate("getComputedStyle(document.getElementById('app')).display") == "none"
    assert_clean_console(app)
