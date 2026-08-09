// Test du code RÉEL (extrait tel quel des fichiers assets/app-part*.js) de resetPatientState()
// et switchModule() : vérifie qu'un changement de module/spécialité (= changement de patient
// dans cette app, un patient par module) réinitialise TOUTES les données spécifiques au
// patient précédent, listées dans resetPatientState() :
//   - state.mpr.segments (voxels tumeur/veine porte/veine sus-hépatique, outil "Wand")
//   - state.mpr._stagingData (TNM/BCLC/Child-Pugh/CRM/VEMS)
//   - state.mpr.measurements (distances/marges MPR, exportées telles quelles)
//   - state.mpr.couinaud (segments infiltrés + geste de résection suggéré, Lot C)
//   - state.mpr.margins (distance de marge R0/R1, proximité vasculaire, Lot C)
//   - state.mpr.ischemia (FLR fonctionnel, volume congestionné, Lot C)
//   - state.mpr.curvedCut (points de coupe curviligne / wedge resection, Lot C)
//   - state.mpr.lastFLR (dernier calcul de volumétrie, utilisé en fallback par les exports)
//   - state.registration (résultat de recalage manuel : translation/rotation/RMS)
//   - realMeshGroup / segmentMesh3D (maillages 3D de segmentation réelle)
//   - state.live.history + session Gemini Live active (contexte de conversation IA)
//
// Usage : node run_test_switchmodule_patient_isolation.js
const fs = require('fs');
const path = require('path');

// Le JS a été extrait de l'ancien HTML monolithique vers assets/app-part*.js
// (voir le découpage frontend) : on reconstitue le même contenu combiné en
// concaténant les 3 fichiers dans leur ordre d'exécution d'origine, pour que
// les recherches de marqueurs ci-dessous continuent de fonctionner à l'identique.
const html = ['app-part1.js', 'app-part2.js', 'app-part3.js']
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'assets', f), 'utf8'))
  .join('\n');

function extractFunction(src, name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`Fonction introuvable dans le HTML : ${name}`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

function assert(cond, msg) {
  if (!cond) { console.error('❌ ÉCHEC:', msg); process.exitCode = 1; }
  else console.log('✅', msg);
}

// ── Mocks minimaux : switchModule() orchestre beaucoup de rendu 3D/DOM, mais
// resetPatientState() (le nettoyage de sécurité patient qu'on vérifie ici) s'exécute AVANT
// le setTimeout de reconstruction — pas besoin de simuler fidèlement Three.js/le DOM. ──
global.document = { body: { setAttribute() {} } };
global.showLoader = () => {};
global.hideLoader = () => {};
global.MODULES = {
  laryngologie: { name: 'Laryngologie', patient: { id: 'PAT-A-LARYNGOLOGIE' } },
  otologie: { name: 'Otologie', patient: { id: 'PAT-B-OTOLOGIE' } },
};
global.twin = { active: false };
global.buildOrgan = () => {};
global.buildProceduralVolume = () => {};
global.initMPR = () => {};
global.renderAll = () => {};
global.digitalTwinPipeline = { run() {} };
global.scene = { remove() {} };
global.organMesh = null;
global.wireframeMesh = null;
global.vesselGroup = null;
global.segmentMesh3D = { fake: 'mesh' }; // simule un maillage de segmentation 3D affiché pour le patient précédent
global.realMeshGroup = { children: [{ userData: { volume_ml: 999 } }] }; // simule un maillage réel du patient précédent
let disconnectCalled = false;
global.gl = { active: true }; // simule une session vocale Gemini Live en cours pour le patient précédent
global.disconnectGeminiLive = () => { disconnectCalled = true; global.gl.active = false; };
let dicomDisposeCalled = false;
global.dicomIsoEnabled = true; // simule des voxels DICOM réels affichés pour le patient précédent
global._dicomDisposeIso = () => { dicomDisposeCalled = true; global.dicomIsoEnabled = false; };

global.state = {
  mod: 'laryngologie',
  anatomyMode: 'procedural',
  live: { history: [{ role: 'user', text: 'Quelle est la taille de la tumeur ?' }, { role: 'model', text: '4.5 cm au segment 7.' }] },
  registration: { tx: 12, ty: -8, tz: 3, rx: 0.1, ry: 0.05, rz: -0.02, rms: 2.4, targetLandmarks: [[1, 2, 3]], sourceLandmarks: [[1.1, 2.1, 3.1]] },
  mpr: {
    segments: {
      tumor: { label: 'Tumeur', voxels: new Set([10, 11, 12]) },
      vessel: { label: 'Vaisseau à risque', voxels: new Set([20]) },
      nerve: { label: 'Nerf à risque', voxels: new Set() },
    },
    _stagingData: { T: 'T3', N: 'N1', M: 'M0', bclc: 'B', childPugh: 'B7' },
    measurements: [{ type: 'distance', plane: 'axial', pts: [[0, 0], [1, 1]], value: 24.5, unit: 'mm' }],
    couinaud: { segments: ['S1','S2'], tumorSegments: ['S7', 'S8'], resectionSuggestion: 'Hépatectomie droite (S7/S8)' },
    margins: { minCutDistanceMM: 2.3, minVascularDistanceMM: 1.1, status: 'R1 — marge insuffisante', vascularRisk: true },
    ischemia: { functionalFlrPct: 41.2, congestedML: 180.0, devascularizedML: 45.0, status: 'Ischémie critique' },
    curvedCut: { points: [[1,2],[3,4],[5,6]], active: true, wedgeResectedML: 220.0 },
    lastFLR: { totalML: 1450, resectedML: 700, flrPct: 51.7 },
    // Volume DICOM RÉEL importé pour le patient Laryngologie (pas une estimation) — la fuite la plus
    // grave de toute cette famille de bugs si elle n'est pas nettoyée : de vraies coupes
    // scanner d'un patient continueraient à s'afficher (MPR + voxels 3D) pour un autre patient.
    volume: new Float32Array([100, 200, 300]),
    fromDicom: true,
  },
};

// resetPatientState() est appelée par switchModule() (défini plus loin dans le fichier) —
// on extrait et charge les deux, dans l'ordre.
const code = [extractFunction(html, 'resetPatientState'), extractFunction(html, 'switchModule')].join('\n\n');
eval(code);

// Pré-conditions : le patient Laryngologie a bien des données "sales" avant le changement de module.
assert(state.mpr.segments.tumor.voxels.size === 3, 'pré-condition : voxels tumeur du patient Laryngologie présents');
assert(state.mpr._stagingData !== null, 'pré-condition : stadification du patient Laryngologie présente');
assert(realMeshGroup !== null, 'pré-condition : maillage réel du patient Laryngologie chargé');
assert(state.live.history.length === 2, 'pré-condition : historique Gemini Live du patient Laryngologie présent');
assert(state.mpr.couinaud.tumorSegments.length === 2, 'pré-condition : segments Couinaud infiltrés du patient Laryngologie présents');
assert(state.mpr.margins.status !== 'Non calculé', 'pré-condition : statut de marge du patient Laryngologie présent');
assert(state.mpr.ischemia.status !== 'Normal', 'pré-condition : statut d\'ischémie du patient Laryngologie présent');
assert(state.mpr.curvedCut.active === true, 'pré-condition : coupe curviligne du patient Laryngologie active');
assert(state.mpr.lastFLR !== null, 'pré-condition : dernier FLR du patient Laryngologie présent');
assert(state.registration.rms > 0, 'pré-condition : résultat de recalage du patient Laryngologie présent');
assert(state.mpr.volume !== null && state.mpr.fromDicom === true, 'pré-condition : volume DICOM réel du patient Laryngologie présent');
assert(dicomIsoEnabled === true, 'pré-condition : voxels DICOM 3D du patient Laryngologie affichés');

switchModule('otologie');

// Après changement de module (= changement de patient), plus aucune trace du patient précédent.
assert(state.mod === 'otologie', 'state.mod mis à jour vers le nouveau module');
assert(state.mpr.segments.tumor.voxels.size === 0, 'voxels tumeur du patient précédent effacés');
assert(state.mpr.segments.vessel.voxels.size === 0, 'voxels vaisseau à risque du patient précédent effacés');
assert(state.mpr._stagingData === null || state.mpr._stagingData === undefined, 'stadification TNM/BCLC/Child-Pugh du patient précédent effacée');
assert(state.mpr.measurements.length === 0, 'mesures/annotations MPR du patient précédent effacées');
assert(realMeshGroup === null, 'maillage de segmentation réelle du patient précédent déchargé');
assert(segmentMesh3D === null, 'maillage de segmentation 3D (voxels) du patient précédent déchargé');
assert(state.live.history.length === 0, "historique de conversation Gemini Live du patient précédent effacé");
assert(disconnectCalled === true, 'la session vocale Gemini Live active du patient précédent est bien fermée');
assert(state.mpr.couinaud.tumorSegments.length === 0, 'segments Couinaud infiltrés du patient précédent effacés (Lot C)');
assert(state.mpr.couinaud.resectionSuggestion === 'Aucune tumeur détectée', 'geste de résection suggéré du patient précédent effacé (Lot C)');
assert(state.mpr.margins.status === 'Non calculé' && state.mpr.margins.vascularRisk === false, 'statut de marge R0/R1 du patient précédent effacé (Lot C)');
assert(state.mpr.ischemia.status === 'Normal' && state.mpr.ischemia.functionalFlrPct === 70.0, 'simulation d\'ischémie du patient précédent effacée (Lot C)');
assert(state.mpr.curvedCut.active === false && state.mpr.curvedCut.points.length === 0, 'coupe curviligne/wedge resection du patient précédent effacée (Lot C)');
assert(state.mpr.lastFLR === null, 'dernier FLR du patient précédent effacé (fallback des exports)');
assert(state.registration.rms === 0 && state.registration.tx === 0, 'résultat de recalage manuel du patient précédent effacé');
assert(state.mpr.volume === null && state.mpr.fromDicom === false, "volume DICOM RÉEL (vraies coupes scanner) du patient précédent effacé — sinon les images d'un autre patient continueraient de s'afficher (MPR + 3D)");
assert(dicomDisposeCalled === true && dicomIsoEnabled === false, 'reconstruction 3D voxelisée du volume DICOM du patient précédent déchargée de la scène');

console.log('\nTerminé.');
