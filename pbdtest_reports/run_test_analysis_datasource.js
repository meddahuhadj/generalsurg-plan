// Test du code RÉEL (extrait tel quel des fichiers assets/app-part*.js, pas une réécriture) qui
// décide si le volume d'organe/score de risque affichés viennent d'une vraie segmentation
// (TotalSegmentator, via realMeshGroup) ou d'une estimation procédurale — la distinction
// "réel vs simulé" ajoutée pour la planification réelle. Couvre aussi la régression de
// sécurité patient corrigée dans switchModule() : realMeshGroup doit être vidé au changement
// de module, sinon le volume RÉEL d'un patient précédent continuerait d'être affiché comme
// "réel" pour un autre patient.
//
// Usage : node run_test_analysis_datasource.js
const fs = require('fs');
const path = require('path');

// Le JS a été extrait de l'ancien HTML monolithique vers assets/app-part*.js
// (voir le découpage frontend) : on reconstitue le même contenu combiné en
// concaténant les 3 fichiers dans leur ordre d'exécution d'origine, pour que
// les recherches de marqueurs ci-dessous continuent de fonctionner à l'identique.
const html = ['app-part1.js', 'app-part2.js', 'app-part3.js']
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'assets', f), 'utf8'))
  .join('\n');

// Extraction par appariement d'accolades (pas de regex fragile face à des accolades imbriquées).
function extractFunction(src, name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`Fonction introuvable dans le HTML : ${name}`);
  let i = src.indexOf('{', start);
  let depth = 0;
  const bodyStart = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const fnNames = ['computeOrganVolumeMl', 'computeRiskScore', 'riskLevel', 'getRealSegmentationVolumeMl', 'computeAnalysis'];
const extracted = fnNames.map(n => extractFunction(html, n)).join('\n\n');

function assert(cond, msg) {
  if (!cond) { console.error('❌ ÉCHEC:', msg); process.exitCode = 1; }
  else console.log('✅', msg);
}

// ── Mocks minimaux (pas de THREE.js/scène nécessaire : ces fonctions ne touchent
// que state/MODULES/realMeshGroup, des objets JS simples) ──
global.state = {
  mod: 'laryngologie',
  mpr: { volume: new Float32Array(64 * 64 * 64).fill(20), volSize: 64 } // "tissu" partout -> fracTissue ~1
};
global.MODULES = {
  laryngologie: { metrics: [{ st: 'ok' }, { st: 'warn' }], patient: { urg: 'orange', age: 55 } }
};
global.realMeshGroup = null;
// I18N : computeAnalysis()/riskLevel() appellent I18N.t() depuis l'internationalisation de
// l'app — mock minimal suffisant (les assertions ci-dessous portent sur dataSource/organVol,
// pas sur le texte des libellés, déjà couvert par pbdtest_reports/run_test_i18n.js).
global.I18N = { t: (key, params) => key };

eval(extracted);

// ── 1) Aucun maillage réel chargé -> estimation procédurale, jamais confondue avec du réel ──
assert(getRealSegmentationVolumeMl() === null, 'getRealSegmentationVolumeMl() renvoie null sans maillage réel chargé');
let a = computeAnalysis();
assert(a.dataSource === 'procedural_estimate', `computeAnalysis() dataSource='procedural_estimate' sans segmentation réelle (obtenu: ${a.dataSource})`);
assert(a.organVol > 0, `organVol procédural > 0 (obtenu ${a.organVol.toFixed(1)})`);

// ── 2) Maillage réel chargé avec volume_ml -> doit primer sur l'estimation procédurale ──
global.realMeshGroup = {
  children: [
    { userData: { label: 'Liver_Parenchyma', volume_ml: 1420.0 } },
    { userData: { label: 'Tumor', volume_ml: 320.0 } },
    { userData: { label: 'NoVolumeEntry' } }, // pas de volume_ml -> doit être ignoré, pas planter
  ]
};
const realVol = getRealSegmentationVolumeMl();
assert(realVol === 1740.0, `getRealSegmentationVolumeMl() somme correctement les entrées valides (1420+320=1740, obtenu ${realVol})`);
a = computeAnalysis();
assert(a.dataSource === 'real_segmentation', `computeAnalysis() dataSource='real_segmentation' quand un maillage réel est chargé (obtenu: ${a.dataSource})`);
assert(a.organVol === 1740.0, `organVol utilise le volume RÉEL (1740), pas l'estimation procédurale (obtenu ${a.organVol})`);

// ── 3) Régression de sécurité patient : un realMeshGroup vide (children=[]) ne doit
//      PAS être confondu avec un maillage réel valide — sinon un groupe "vidé" (ex. par un
//      switchModule() incomplet) pourrait quand même être traité comme une source réelle. ──
global.realMeshGroup = { children: [] };
assert(getRealSegmentationVolumeMl() === null, 'un realMeshGroup avec children=[] (ex. après nettoyage switchModule) redevient null, pas une fausse source réelle');
a = computeAnalysis();
assert(a.dataSource === 'procedural_estimate', 'après nettoyage (children=[]), computeAnalysis() retombe bien sur procedural_estimate');

// ── 4) Un realMeshGroup dont AUCUNE entrée n'a de volume_ml exploitable -> null, pas 0 ──
global.realMeshGroup = { children: [{ userData: { label: 'X' } }, { userData: {} }] };
assert(getRealSegmentationVolumeMl() === null, 'aucune entrée exploitable -> null (pas confondu avec un volume réel de 0 mL)');

console.log('\nTerminé.');
