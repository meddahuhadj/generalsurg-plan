// Test du code RÉEL (extrait des fichiers assets/app-part*.js) pour une race condition trouvée en
// auditant le pont DICOM/PACS → segmentation IA → viewer 3D : un job de segmentation réelle
// (segmentExistingSeries / runRealSegmentation) peut prendre jusqu'à ~15 minutes
// (pollSegmentationJob). Rien n'empêchait le chirurgien de changer de patient pendant l'attente
// — le résultat, une fois prêt, s'appliquait alors AVEUGLÉMENT au patient affiché à CE
// moment-là, pas à celui pour lequel le job avait été lancé. Corrigé en capturant l'ID patient
// au lancement et en le revérifiant à la réception du résultat.
//
// Usage : node run_test_segmentation_race_condition.js
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

// ── Mocks ──
global.MODULES = {
  laryngologie: { patient: { id: 'PAT-A-LARYNGOLOGIE' } },
  otologie: { patient: { id: 'PAT-B-OTOLOGIE' } },
};
global.state = { mod: 'laryngologie', settings: { apiBase: 'http://backend.test' } };
global.guardReadOnly = () => false;
global.getBackendToken = async () => 'fake-token';
global.closeModal = () => {};
global.showLoader = () => {};
global.hideLoader = () => {};
global.setRealSegStatus = () => {};
let loadRealMeshesCalled = false;
global.loadRealMeshesIntoScene = async () => { loadRealMeshesCalled = true; };
let lastNotify = null;
global.notify = (msg, type) => { lastNotify = { msg, type }; };

// pollSegmentationJob simule un job long : pendant l'attente, le test change state.mod pour
// simuler un changement de patient par le chirurgien.
global.pollSegmentationJob = async (base, job_id) => {
  state.mod = 'otologie'; // ← le chirurgien bascule sur un AUTRE patient pendant le calcul
  return { segments: [{ label: 'Liver', volume_ml: 1234 }], liver_total_ml: 1234 };
};

// fetch mocké : réponse OK avec un job_id, pour le POST /segmentation/from-series/...
global.fetch = async (url, opts) => ({
  ok: true,
  json: async () => ({ job_id: 'job-123' }),
});

// extractFunction() cherche le marqueur "function NAME(" et ne capture donc pas le mot-clé
// `async` qui le précède dans le fichier source — on le rajoute (segmentExistingSeries utilise
// `await` en interne, la fonction extraite doit rester async pour être valide).
const code = 'async ' + extractFunction(html, 'segmentExistingSeries');
eval(code);

const fakeBtn = { textContent: 'Segmenter cette série', disabled: false };

(async () => {
  await segmentExistingSeries('series-abc', fakeBtn);

  assert(loadRealMeshesCalled === false,
    'loadRealMeshesIntoScene() n\'est PAS appelée quand le patient a changé pendant le job (sinon le résultat de PAT-A-HBP serait affiché comme si c\'était celui de PAT-B-COLORECTAL)');
  assert(lastNotify && lastNotify.type === 'warn' && lastNotify.msg.includes('ignoré'),
    'une notification "warn" explique que le résultat a été ignoré car le patient a changé');

  console.log('\nTerminé.');
})();
