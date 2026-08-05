# Projet : OphtalmoSurg Plan — Exploration frontend pour workflow 3-clics + zero-touch

## Objectif de la session
Explorer le frontend (JS pur sans framework, 3 partiels + index.html) d'une SPA de
planification chirurgicale ophtalmologique, pour préparer deux features à venir :
1. Workflow de validation « 3-clicks » (Aperçu → Ajustement → Validation)
2. Bandeau « zero-touch auto-preparation » pour imports DICOM
Tâche = recherche uniquement, pas d'écriture de code.

## Architecture fichiers
- `index.html` (2513 lignes) : body data-mod="cataracte" (:25), hub #hub (:30),
  login gate #login-gate (:61), #app (:89), top-nav (data-view, :108-152),
  top-actions (:153-188), workflow-stepper #workflow-stepper (:196),
  quickbar #quickbar (:199), sidebar #sidebar (:209), viewport (canvas #gl-canvas :257),
  banner anatomie #anatomy-mode-banner (:214-256), toolbar DICOM (:389-435),
  toolbar MPR (:437-489), rtabs #rtabs (:515-522 : Plan/Staging/Implants/IA/Analyse),
  modales (modal-settings :664, modal-patients :762, modal-i18n-admin :781,
  modal-pacs :816, modal-audit :848, modal-dicom-viewer :874, modal-ar :892, puis ~20 NextGen),
  #notif :2254, #loader :2257-2260, scripts :2266-2276 (part1, part2, part3,
  three.js r128 + GLTFLoader CDN, dicom-parser CDN, app-bootstrap.js)
- `assets/app-part1.js` (2481 l.) : state global :323, i18n :21-162,
  organe procédural :538, twin :668-1010, segmentation réelle :1565-1825,
  PACS :1813-1900, DICOM :2042-2300
- `assets/app-part2.js` (1763 l.) : extension state.mpr :7-20, auditLog :23-30,
  segmentation MPR :361-407, staging :575-829, generateDicomSR :1090, lot B :896-1315,
  lot C :1317-1762
- `assets/app-part3.js` (2837 l.) : hub/nav :4-60, workflow stepper :159-192,
  renderRightPanel :214, setTab :432, resetPatientState :474, switchModule :560,
  auth :1643-1695, openModal/closeModal :1876-1877, saveSettings :1879,
  notify :2002, showLoader :2009, toggleAnatomyMode :2355,
  digitalTwinPipeline :2389-2643, init i18n :2660, top-nav wiring :2799-2834,
  init pipeline :2792
- `i18n/{fr,en,ar,nl}.json` : dicts — structure meta/common/nav/toolbar/staging/...
- Backend FastAPI : `api/` + `backend/` (non exploré encore)

## Points clés vérifiés

### 7. i18n (fait)
- Moteur app-part1.js : I18N_EMBEDDED :21, getNested :34, getOverrides :38
  (localStorage), saveOverrides :45, loadDict :53 (lazy fetch i18n/{loc}.json),
  formatICU :69, t() :83, applyTranslations :102 (data-i18n), detectBrowserLocale :109,
  setLocale :139, localStorage 'gsp_lang' (app-part3.js:2662), uiSetLocale :2687
- Sélecteur langue index.html:173-184 ; au changement : renderAll() + renderStagingPanel()
  (app-part3.js:2692-2693)

### 1. State global (fait)
- `const state = {` app-part1.js:323 ; extensions state.mpr app-part2.js:7-20
  (segments{tumor,portal_vein,hepatic_vein,bile_duct,gtv,ctv}, activeSegment,
  toolMode, measurements) ; state.auditLog app-part2.js:23, logAudit :25
- state.workflowStep app-part3.js:44, :178
- state.settings.{apiBase,chirurgien,geminiKey,geminiModel,groqKey,localServerUrl,
  localServerModel,offlineCertified} → saveSettings() app-part3.js:1879
- Labels segments ophtalmo : portal_vein→«Vaisseau rétinien », hepatic_vein→
  «Membrane épirétinienne », bile_duct→«Exsudats / Hémorragie » (app-part2.js:8-15)
- state.mpr._stagingData = {eye, anesth, urg, locs, acd, hodapp, pioCible, macula, pvr}
  (app-part2.js:596-605, 719-727)

### 2. Navigation / Hub / tabs (fait)
- renderHub() app-part3.js:4, openHub() :28 (ferme modales + Gemini),
  switchModule(id) :560 (state.mod, data-mod, resetPatientState(), rebuild 3D,
  initMPR(), renderAll(), puis digitalTwinPipeline.run(patId) à 200 ms :573-577)
- Top-nav wiring app-part3.js:2799-2834 : boutons data-view → dicom=openDicomViewer,
  ar=openArPanel, audit=openAuditTrail, NextGen=openModal ; plan/jumeau = vrais toggles
- setTab(tab) app-part3.js:432 (.rtab/.rtab-pane .on toggle) — patché app-part2.js:855-861
  pour gérer 'staging'
- renderRightPanel app-part3.js:214 (panes plan/implants/ia/analyse) ;
  pane-staging INJECTÉ par patch app-part2.js:836-861 (DOMContentLoaded + setTimeout 50 ms)
- WORKFLOW_STEPS app-part3.js:159-164 + renderWorkflowStepper :165 + goToWorkflowStep :177
  (4 étapes : patient/analyse/simulation/bloc) → #workflow-stepper index.html:196

### 8. Modales/panneaux (fait)
- openModal(id)/closeModal(id) app-part3.js:1876-1877 (classList.add('open') sur
  #modal-<id>)
- Modale patients : #patients-table :770, #patient-edit-form :771, togglePatientEditForm :773
- Modale PACS :816-846 (inputs pacs-qido-url, pacs-filter-*, #pacs-results)
- Modale audit :848-872 (#audit-results, filtres)
- Modale dicom-viewer :874-890 (#dicom-viewer-results)
- Modale AR :892-916
- AUCUNE infra confirm dialog / stepper-wizard dédiée trouvée (recherche
  confirm|confirmDialog|showConfirm → vide) — à construire pour la feature
  « Validation »

### 3. DICOM / PACS (fait)
- loadDicomFiles(fileList) app-part1.js:2042-2194 : parse dicom-parser, skip TS
  compressée 1.2.840.10008.1.2.4.*, skip encapsulé, resampling N³, HU,
  state.mpr.volume, initMPR(), showDicomIn3D() (setTimeout 50 ms), showLoader
  + I18N.t('dicom.*')
- PACS : openPacsPanel :1813, pacsAuthedFetch :1827 (token Bearer),
  searchPacsStudies :1840 (GET /pacs/studies?QIDO), loadPacsSeries :1867
  (GET /pacs/studies/{uid}/series), importPacsSeries :1885
  (POST /pacs/import) → notifie « visible dans /dicom/{id} »
- openDicomViewer :1951 (GET /dicom/{patient_id}), loadDicomSeriesList :1962,
  bouton segmentExistingSeries dans la liste
- legacy loadDicomSeries app-part2.js:1549 (simulé, alert(), logAudit)
- Loader : showLoader(title,sub)/hideLoader() app-part3.js:2009-2014 → #loader
- notify(msg,type) app-part3.js:2002-2006 → #notif (3000 ms)

### 4. Segmentation (fait)
- REAL_SEGMENTATION_SUPPORTED_SPECIALTIES = [] app-part1.js:1565 → indisponible
  en ophtalmologie (message FR :1566-1569)
- runRealSegmentation :1582 (check /segmentation/capabilities, POST
  /segmentation/auto?patient_id=, pollSegmentationJob :1651 → GET
  /segmentation/status/{id} 5 s, jusqu'à 15 min), segmentExistingSeries :1666
  (POST /segmentation/from-series/{id}), loadRealMeshesIntoScene :1747
- PATTERN de sécurité patient : capture startedForPatientId + recheck à la fin
  (:1616, :1631-1636, :1681, :1698-1704)
- setRealSegStatus :1577 → #real-seg-status
- Segmentation MPR manuelle : segmentMesh3D app-part2.js:371, tool brush/wand/eraser
  (setMprTool), mpr-seg-selector index.html:470-478

### 5. Jumeau numérique (fait)
- enterDigitalTwin app-part1.js:763 (masque organMesh/wireframe/vesselGroup/clipPlane,
  twin.geometry = buildTwinGeometryFromRealLiverMesh() || buildTwinGeometry(),
  buildTwinParticles :722, buildTwinConstraints :744), exitDigitalTwin :815,
  resetDigitalTwin :836, setTwinInteraction :842, stepTwinPhysics :848 (PBD,
  gravity, substeps, pinned anchors), animate :922, onResize :982
- Garde : `if (!scene || twin.active) return;`
- Buttons vp-tools-twin / vp-tools-normal (index.html:259-292)

### 6. Volumétrie / Export (fait)
- renderStagingPanel app-part2.js:575-705 : volume organe (voxel-counting OU
  getRealSegmentationVolumeMl()), volume tumeur (segments.tumor.voxels.size),
  selecteurs cliniques, #staging-decision-box ; badge « réel/estimation »
- updateStagingDecision :707-754+ (critères LOCS/ACD/PIO/VR, résécabilité)
- exportStagingReport :815-829 (JSON download + logAudit)
- generateDicomSR :1090 (objet DICOM-SR PS3.16 TID 1500, SOPClassUID
  1.2.840.10008.5.1.4.1.1.88.33) ; generateFhirR5 à côté ; boutons injectés
  par patchStagingPanelForLotB :1250-1293
- export endpoint backend : POST {base}/export/dicom-sr (app-part3.js:414)
- Lot C : computeCouinaudSegments, compute3dMarginDistance, simulateParenchymalIschemia,
  generateSurgicalFlightPlan (Plan de Vol, bouton :465), state.mpr.lastFLR.{totalML,
  resectedML, flrPct}, state.mpr.ischemia

### 9. Backend / mode dégradé (partiel)
- needsLogin() app-part3.js:1670 : `!!state.settings.apiBase && !isAuthenticated()`
- showLoginGateIfNeeded :1674, submitLogin :1695, AUTH_STORAGE_KEY='ophtalmosurg_auth'
  :1643 (sessionStorage), loadStoredAuth :1645, persistAuth :1656
- PAS de health-check /health trouvé côté front ; indisponibilité gérée par
  try/catch + fallback (runRealSegmentation → « Impossible de joindre le backend » ;
  digitalTwinPipeline → _generateLocalPatientData)
- Backend endpoints référencés : /segmentation/*, /pacs/*, /dicom/{id}, /audit,
  /export/dicom-sr, /api/v2/patient-anatomy/ingest-and-reconstruct, /elastic-registration
- Backend fichiers api/ et backend/ NON encore explorés

### 10. Toast/Loader/bannière (fait)
- notify(msg, type) app-part3.js:2002 (3 s), #notif index.html:2254
- showLoader/hideLoader app-part3.js:2009-2014 → #loader (+#loader-title, #loader-sub)
- BANNIÈRE #anatomy-mode-banner index.html:214-256 : #pipeline-status-icon,
  #anatomy-mode-title, #anatomy-mode-desc, boutons 🔄 Forcer
  (digitalTwinPipeline.forceReload()) et ⚠️ Démo (toggleAnatomyMode),
  #pipeline-progress-wrap (+#pipeline-progress-bar, #pipeline-step-label,
  #pipeline-pct, #pip-step-1..5)
- digitalTwinPipeline UI : _setStep(stepNum,pct,label) :2599, _setBanner(mode:
  loading/ok/demo/warn) :2614, _showProgress(bool) :2638

## Feature « zero-touch auto-preparation » — pré-existant (important)
- digitalTwinPipeline app-part3.js:2389-2643 : run(patId, forceReload) :2398 avec
  cache _cache, AbortController, 5 étapes simulées (PACS :2418 → WADO :2423 → IA
  TotalSegmentator :2428 → maillages :2454 → jumeau :2459), backend
  /api/v2/patient-anatomy/ingest-and-reconstruct (:2434) avec fallback
  _generateLocalPatientData(patId) :2549 (données pseudo-aléatoires hash de l'ID,
  is_local_simulation:true, integrity_note honnête)
- _applyResult :2477 distingue isSimulated vs réel ; notifie
  « Aucune action requise » :2521 — PATTERN « zero-touch » déjà présent
- DÉCLENCHÉ automatiquement : switchModule :576 (200 ms) et init :2792 (800 ms)
- La bannière existe déjà (#anatomy-mode-banner) — la feature demandée
  (bandeau zero-touch pour imports DICOM) pourra le réutiliser/étendre
- NOTA : le pipeline simule ses étapes (delays fixes) et ne lit PAS réellement
  loadDicomFiles()/showDicomIn3D() ; le vrai import DICOM (loadDicomFiles :2042)
  n'update pas la bannière — gap à combler pour « zero-touch après import »

## Feature « 3-clicks Aperçu→Ajustement→Validation » — pré-existant (important)
- Le pane-staging (renderStagingPanel app-part2.js:575) + updateStagingDecision :707
  est le meilleur point d'ancrage (équivalent « Ajustement »)
- Le workflow-stepper #workflow-stepper (4 étapes) existe mais n'a PAS de notion
  aperçu/ajustement/validation d'un import DICOM
- Aucune infra confirm dialog ; les actions « validation » devront soit réutiliser
  openModal/closeModal (app-part3.js:1876-1877), soit créer une modale dédiée
- Le pattern de patch surrender (patchStagingPanelForLotB :1250 / LotC :1712,
  patchRenderRightPanel :836-861, patchSetTab :855) est LE pattern d'extension
  utilisé par les lots précédents — à imiter pour la nouvelle feature
- resetPatientState app-part3.js:474 (inventaire explicite des champs à remettre
  à zéro au changement de patient) — à étendre si de nouveaux champs sont ajoutés

## Reste à faire / non exploré
1. `renderSidebar` app-part3.js:88 + carte patient (#sidebar) — lecture non faite
2. resetPatientState body complet (app-part3.js:474-560)
3. renderHub/openHub body (app-part3.js:4-60)
4. State global complet (app-part1.js:323-350)
5. Backend : api/ et backend/ (FastAPI, endpoints /segmentation, /pacs, /audit,
   /export/dicom-sr, /api/v2/patient-anatomy) — non explorés
6. modales NextGen (surgai :919, surgsim :979, surgor :1041...) — non lues
7. Recherche des callers de exportDicomSR côté backend (point 6 approfondi)

## Outils / contraintes
- Pas de rg : utiliser PowerShell Select-String
- Le dossier contient .venv/node_modules → filtrer les listings
- Path racine : D:\Travail\GeneralSurgPlan3D  MIMO\pour  Claude 2\GeneralSurgPlan3D_MIMO_enrichi  8 - ophtalmologie
