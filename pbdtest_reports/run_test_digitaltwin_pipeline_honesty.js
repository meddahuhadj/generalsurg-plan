// Test du code RÉEL (extrait des fichiers assets/app-part*.js) pour la découverte la plus grave
// de l'audit : digitalTwinPipeline, qui tourne AUTOMATIQUEMENT à chaque changement de patient
// (aucune action chirurgien requise), appelle le backend /api/v2/patient-anatomy/... — un
// endpoint déplacé derrière RESEARCH_MODE (voir real_patient_dicom_mesh_service.py, fictif par
// nature). Par défaut, cet appel échoue donc TOUJOURS, et le pipeline retombe sur
// _generateLocalPatientData(), qui invente des volumes à partir d'un hash de l'ID patient.
//
// Avant correctif : _applyResult() affichait cette estimation locale EXACTEMENT comme un
// résultat de segmentation réelle — "Jumeau 3D Patient-Spécifique Réel CERTIFIÉ", "SHA-256 ✓",
// bannière verte "ANATOMIE RÉELLE... Certifié" — sans aucune distinction. Ce test vérifie que
// les deux cas sont désormais rendus différemment.
//
// Usage : node run_test_digitaltwin_pipeline_honesty.js
const fs = require('fs');
const path = require('path');

// Le JS a été extrait de l'ancien HTML monolithique vers assets/app-part*.js
// (voir le découpage frontend) : on reconstitue le même contenu combiné en
// concaténant les 3 fichiers dans leur ordre d'exécution d'origine, pour que
// les recherches de marqueurs ci-dessous continuent de fonctionner à l'identique.
const html = ['app-part1.js', 'app-part2.js', 'app-part3.js']
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'assets', f), 'utf8'))
  .join('\n');

function assert(cond, msg) {
  if (!cond) { console.error('❌ ÉCHEC:', msg); process.exitCode = 1; }
  else console.log('✅', msg);
}

// ── Extraction de l'objet digitalTwinPipeline tel quel (littéral d'objet, pas une fonction) ──
function extractObjectLiteral(src, name) {
  const marker = `const ${name} = {`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`Objet introuvable dans le HTML : ${name}`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

// Mocks requis par _generateLocalPatientData() (MODULES[state.mod].patient) — avant eval.
global.state = { mod: 'laryngologie', settings: {} };
global.MODULES = { laryngologie: { patient: { nom: 'Patient Test' } } };

// `const` déclaré dans un eval() direct reste scopé à cet eval (ES6) — on le convertit en
// affectation sur `global` pour le rendre accessible ensuite, sans changer une seule ligne de
// son contenu réel.
const code = extractObjectLiteral(html, 'digitalTwinPipeline').replace(
  'const digitalTwinPipeline = {', 'global.digitalTwinPipeline = {'
);
eval(code);
const digitalTwinPipeline = global.digitalTwinPipeline;

// ── 1) _generateLocalPatientData() doit désormais s'auto-déclarer honnêtement ──
const localData = digitalTwinPipeline._generateLocalPatientData('PAT-TEST-999');
assert(localData.is_local_simulation === true, "_generateLocalPatientData() se déclare bien is_local_simulation=true");
assert(localData.is_real_patient_anatomy === false, "_generateLocalPatientData() ne prétend plus is_real_patient_anatomy=true (c'était le bug)");
assert(!('sha256_audit_seal' in localData), "le faux 'sha256_audit_seal' (juste l'ID patient en majuscules) a été retiré");

// ── 2) _applyResult() doit rendre différemment selon la source ──
global.document = {
  _els: {},
  getElementById(id) {
    if (!this._els[id]) this._els[id] = { style: {}, textContent: '', innerHTML: '' };
    return this._els[id];
  }
};
global.notify = (msg, type) => { global._lastNotify = { msg, type }; };
global.organMesh = null; global.wireframeMesh = null; global.vesselGroup = null;
global.gltfLoader = null;
global.state.settings = {};
global.loadRealMeshesIntoScene = async () => {};

// Cas A : données locales simulées (le cas par défaut désormais, backend RESEARCH_MODE-gated)
digitalTwinPipeline._applyResult(localData, 'PAT-TEST-999', false);
const descSim = document.getElementById('anatomy-mode-desc').innerHTML;
const titleSim = document.getElementById('anatomy-mode-title').textContent;
assert(descSim.includes('estimation locale') || descSim.includes('⚠'), 'estimation locale : la description affiche un avertissement, pas "maillages chargés" comme si c\'était réel');
assert(!descSim.includes('SHA-256 ✓'), 'estimation locale : plus de faux badge "SHA-256 ✓"');
assert(titleSim.toLowerCase().includes('estimation') || titleSim.toLowerCase().includes('indisponible'), `estimation locale : le titre de la bannière ne dit plus "Certifié" (obtenu: "${titleSim}")`);
assert(!titleSim.includes('Certifié'), 'estimation locale : le mot "Certifié" a disparu du titre de la bannière');
assert(global._lastNotify.type === 'warn', 'estimation locale : la notification est de type "warn", pas "ok"');

// Cas B : données réelles (backend réellement disponible, hypothétique mais doit rester géré)
const realData = {
  is_real_patient_anatomy: true,
  volumetric_analysis_ml: { total_organ_volume_ml: 20, lesion_volume_ml: 3, resected_volume_ml: 8, remnant_volume_ml: 12, remnant_ratio_pct: 60.0 },
  '3d_mesh_manifest_gltf': [{ organ: 'Larynx' }]
};
digitalTwinPipeline._applyResult(realData, 'PAT-TEST-REAL', false);
const descReal = document.getElementById('anatomy-mode-desc').innerHTML;
const titleReal = document.getElementById('anatomy-mode-title').textContent;
assert(descReal.includes('✅') && descReal.includes('maillages chargés'), 'données réelles : la description affiche bien le rendu positif normal');
assert(!titleReal.toLowerCase().includes('indisponible'), 'données réelles : le titre ne montre pas le message d\'indisponibilité');
assert(global._lastNotify.type === 'ok', 'données réelles : la notification reste de type "ok"');

console.log('\nTerminé.');
