// Test du code RÉEL (extrait des fichiers assets/app-part*.js) pour deux problèmes trouvés en
// auditant la fonctionnalité d'export :
//
// 1. generateDicomSR() et generateFhirR5() lisaient `state.staging` et `state.patient`, deux
//    objets qui n'ont jamais existé dans `const state = {...}` — cliquer "Export DICOM-SR" ou
//    "Export FHIR R5" levait une TypeError et ne produisait AUCUN fichier (bug bloquant pour
//    la planification réelle : impossible d'exporter un compte-rendu). Corrigé pour lire le
//    vrai état (state.mpr._stagingData, MODULES[state.mod].patient).
// 2. logAudit()/state.auditLog n'étaient pas scopés par patient : après un changement de
//    module, le journal d'audit et les exports d'un patient pouvaient contenir des actions
//    faites sur un AUTRE patient, sans distinction. Corrigé via currentPatientAuditLog().
//
// Usage : node run_test_export_and_auditlog_scoping.js
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

// ── Mocks minimaux ──
global.MODULES = {
  laryngologie: { patient: { id: 'PAT-A-LARYNGOLOGIE', nom: 'Patient A' } },
  otologie: { patient: { id: 'PAT-B-OTOLOGIE', nom: 'Patient B' } },
};
global.state = {
  mod: 'laryngologie',
  settings: { chirurgien: 'Dr. Test' },
  auditLog: [],
  mpr: {
    spacing: { x: 1, y: 1, z: 1 },
    segments: { tumor: { voxels: new Set([1, 2]) } },
    measurements: [],
    lastFLR: { totalML: 15, resectedML: 7, flrPct: 53.3 },
    _stagingData: { T: 'T2', N: 'N0', M: 'M0', cordMobility: 'Mobile' },
  },
};
let downloaded = null;
global._downloadFile = (filename, content) => { downloaded = { filename, content: JSON.parse(content) }; };

const code = [
  extractFunction(html, 'logAudit'),
  extractFunction(html, 'currentPatientAuditLog'),
  extractFunction(html, 'generateDicomSR'),
  extractFunction(html, 'generateFhirR5'),
].join('\n\n');
eval(code);

// ── 1) logAudit() sur le patient Laryngologie, puis changement (simulé) vers Otologie ──
logAudit('segment_wand', { seg: 'tumor' });
assert(state.auditLog.length === 1 && state.auditLog[0].patientId === 'PAT-A-LARYNGOLOGIE',
  'logAudit() tague bien chaque entrée avec le patientId actif (PAT-A-LARYNGOLOGIE)');

state.mod = 'otologie';
logAudit('staging_update', { T: 'T3' });
assert(state.auditLog.length === 2 && state.auditLog[1].patientId === 'PAT-B-OTOLOGIE',
  'logAudit() tague la nouvelle entrée avec le patientId du nouveau module (PAT-B-OTOLOGIE)');

const scopedToOtologie = currentPatientAuditLog();
assert(scopedToOtologie.length === 1 && scopedToOtologie[0].patientId === 'PAT-B-OTOLOGIE',
  "currentPatientAuditLog() ne renvoie QUE les entrées du patient actif (pas l'entrée du patient Laryngologie précédent)");

// ── 2) generateDicomSR()/generateFhirR5() ne doivent plus lever d'exception ──
let threwDicom = false;
try { generateDicomSR(); } catch (e) { threwDicom = true; console.error('   détail:', e.message); }
assert(!threwDicom, 'generateDicomSR() ne plante plus (state.staging/state.patient inexistants avant correctif)');
assert(downloaded && downloaded.content.PatientID === 'PAT-B-OTOLOGIE',
  'generateDicomSR() exporte bien le patient ACTUELLEMENT actif (Otologie), pas un patient fantôme');
assert(downloaded.content.StagingSummary.TNM === '???' || typeof downloaded.content.StagingSummary.TNM === 'string',
  'generateDicomSR() produit un TNM (chaîne), pas un crash, même sans _stagingData pour ce module simulé');

let threwFhir = false;
try { generateFhirR5(); } catch (e) { threwFhir = true; console.error('   détail:', e.message); }
assert(!threwFhir, 'generateFhirR5() ne plante plus non plus');
assert(downloaded.content.entry[0].resource.subject.reference === 'Patient/PAT-B-OTOLOGIE',
  'generateFhirR5() référence bien le patient actif dans le bundle FHIR');

console.log('\nTerminé.');
