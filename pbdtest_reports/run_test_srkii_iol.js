// Test du code RÉEL (extrait tel quel de assets/app-part3.js, pas une réécriture) du calcul
// de puissance de LIO (formule SRK II) ajouté pour la planification réelle du module
// Cataracte — voir le commentaire au-dessus de srkIIA1() dans app-part3.js pour la
// justification du choix de SRK II plutôt que SRK/T (constantes non vérifiables sans
// recherche web au moment de l'écriture).
//
// Usage : node run_test_srkii_iol.js
const fs = require('fs');
const path = require('path');

const html = ['app-part1.js', 'app-part2.js', 'app-part3.js']
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'assets', f), 'utf8'))
  .join('\n');

function extractFunction(src, name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`Fonction introuvable : ${name}`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const fnNames = ['srkIIA1', 'srkIIPower', 'validateBiometryInputs', 'computeIOLResult'];
const extracted = fnNames.map(n => extractFunction(html, n)).join('\n\n');

function assert(cond, msg) {
  if (!cond) { console.error('❌ ÉCHEC:', msg); process.exitCode = 1; }
  else console.log('✅', msg);
}
function approx(a, b, eps, msg) {
  assert(Math.abs(a - b) < eps, `${msg} (obtenu ${a}, attendu ~${b})`);
}

global.state = { biometryByPatient: {} };
global.MODULES = { cataracte: { id: 'cataracte', patient: { id: 'P1' } } };

eval(extracted);

// ── 1) srkIIA1 : bascules de bucket exactes (bornes incluses/exclues comme documenté) ──
const A = 118.0;
approx(srkIIA1(A, 19.9), A + 3.0, 1e-9, 'AL=19.9 -> A+3.0');
approx(srkIIA1(A, 20.0), A + 2.0, 1e-9, 'AL=20.0 -> A+2.0 (borne incluse)');
approx(srkIIA1(A, 20.99), A + 2.0, 1e-9, 'AL=20.99 -> A+2.0');
approx(srkIIA1(A, 21.0), A + 1.0, 1e-9, 'AL=21.0 -> A+1.0 (borne incluse)');
approx(srkIIA1(A, 21.99), A + 1.0, 1e-9, 'AL=21.99 -> A+1.0');
approx(srkIIA1(A, 22.0), A + 0.0, 1e-9, 'AL=22.0 -> A+0.0 (borne incluse)');
approx(srkIIA1(A, 24.49), A + 0.0, 1e-9, 'AL=24.49 -> A+0.0');
approx(srkIIA1(A, 24.5), A - 0.5, 1e-9, 'AL=24.5 -> A-0.5 (borne incluse)');
approx(srkIIA1(A, 30.0), A - 0.5, 1e-9, 'AL=30.0 -> A-0.5');

// ── 2) srkIIPower : valeur calculée à la main, P = A1 - 2.5*AL - 0.9*K ──
// A=118, AL=23.0 (bucket 22-24.5 -> A1=118), K=44.0 => P = 118 - 57.5 - 39.6 = 20.9
let r = srkIIPower(118.0, 23.0, 44.0);
approx(r.power, 20.9, 0.01, 'srkIIPower(118, 23.0, 44.0) = 20.9 D');
approx(r.a1, 118.0, 1e-9, 'a1 renvoyé = 118.0 (aucun ajustement dans ce bucket)');

// AL=19.0 (bucket <20 -> A1=A+3=121), K=46.0 => P = 121 - 47.5 - 41.4 = 32.1
r = srkIIPower(118.0, 19.0, 46.0);
approx(r.power, 32.1, 0.01, 'srkIIPower(118, 19.0, 46.0) = 32.1 D (oeil court, A1 ajusté)');

// ── 3) validateBiometryInputs : rejette les valeurs hors plage plausible ──
assert(validateBiometryInputs(118, 23.5, 43.75).valid, 'biométrie normale acceptée sans erreur bloquante');
assert(!validateBiometryInputs(118, 10, 43.75).valid, 'AL=10mm rejetée (hors plage 15-40mm)');
assert(!validateBiometryInputs(118, 23.5, 25).valid, 'K=25D rejetée (hors plage 30-60D)');
assert(!validateBiometryInputs(90, 23.5, 43.75).valid, 'constante A=90 rejetée (hors plage 110-130)');

const normal = validateBiometryInputs(118, 23.5, 43.75);
assert(normal.warnings.length === 0, 'aucun avertissement pour un oeil de longueur normale (23.5mm)');
const longEye = validateBiometryInputs(118, 27.0, 43.75);
assert(longEye.valid && longEye.warnings.length === 1, 'oeil long (27mm) accepté avec avertissement de fiabilité SRK II');
const shortEye = validateBiometryInputs(118, 21.0, 43.75);
assert(shortEye.valid && shortEye.warnings.length === 1, 'oeil court (21mm) accepté avec avertissement de fiabilité SRK II');

// ── 4) computeIOLResult : jamais de valeur par défaut tant que rien n'est saisi ──
global.state.biometryByPatient = {};
assert(computeIOLResult(MODULES.cataracte) === null, 'computeIOLResult() renvoie null sans biométrie saisie (pas de valeur pré-remplie)');

global.state.biometryByPatient['P1'] = { al: 23.0, k1: 43.5, k2: 44.5, k: 44.0, a: 118.0 };
const res = computeIOLResult(MODULES.cataracte);
assert(res && !res.error, 'computeIOLResult() renvoie un résultat une fois la biométrie saisie');
approx(res.power, 20.9, 0.01, 'computeIOLResult() recalcule bien via srkIIPower (20.9 D)');

// Biométrie invalide déjà stockée (ex. saisie erronée conservée) -> erreur explicite, pas un
// nombre silencieusement faux.
global.state.biometryByPatient['P2'] = { al: 5.0, k1: 43.5, k2: 44.5, k: 44.0, a: 118.0 };
const bad = computeIOLResult({ id: 'cataracte', patient: { id: 'P2' } });
assert(bad && bad.error, 'computeIOLResult() renvoie une erreur explicite pour une biométrie hors plage, jamais un calcul silencieux');

if (process.exitCode === 1) {
  console.error('\n❌ Au moins un test a échoué.');
} else {
  console.log('\n✅ Tous les tests SRK II / calcul LIO sont passés.');
}
