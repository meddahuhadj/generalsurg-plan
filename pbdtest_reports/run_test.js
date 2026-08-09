// Test du moteur PBD réel (code extrait tel quel des fichiers assets/app-part*.js)
// avec la vraie librairie three.js r128 (mêmes classes Vector3/BufferGeometry/
// IcosahedronGeometry que dans le navigateur — seul WebGLRenderer est absent,
// ce dont on n'a pas besoin pour valider la géométrie et la physique).
global.THREE = require('three');
const fs = require('fs');
const code = fs.readFileSync(__dirname + '/extracted_pbd.js', 'utf8');
// Le code utilise `state.mod` — on le simule minimalement.
global.state = { mod: 'laryngologie' };
eval(code);

function assert(cond, msg) {
  if (!cond) { console.error('❌ ÉCHEC:', msg); process.exitCode = 1; }
  else console.log('✅', msg);
}

// ── 1) Génération de la géométrie et des particules ──
const geo = buildTwinGeometry();
assert(geo.attributes.position.count > 50, `géométrie générée avec ${geo.attributes.position.count} sommets (>50 attendu)`);

const particles = buildTwinParticles(geo);
assert(particles.length === geo.attributes.position.count, `${particles.length} particules = ${geo.attributes.position.count} sommets`);
const nPinned = particles.filter(p => p.pinned).length;
assert(nPinned > 0 && nPinned < particles.length, `${nPinned}/${particles.length} particules ancrées (ni 0 ni toutes)`);

const constraints = buildTwinConstraints(geo, particles);
assert(constraints.length > 0, `${constraints.length} contraintes de distance générées`);
// Chaque contrainte doit avoir une longueur au repos strictement positive.
const badRest = constraints.filter(c => !(c.restLength > 0));
assert(badRest.length === 0, `aucune contrainte à longueur de repos nulle/négative (${badRest.length} trouvée(s))`);

// ── 2) Simulation : construire un faux "twin" global comme dans le navigateur ──
global.twin = {
  active: true, particles, constraints, geometry: geo,
  grabbed: null, gravity: -0.35, stiffness: 0.4, substeps: 6,
};

const initialPositions = particles.map(p => p.pos.clone());

// Simule 2 secondes de chute libre sous gravité (120 pas à 60 img/s).
for (let i = 0; i < 120; i++) stepTwinPhysics(1/60);

// Les particules ANCRÉES ne doivent pas avoir bougé du tout.
let pinnedMoved = 0;
particles.forEach((p, i) => {
  if (p.pinned && p.pos.distanceTo(initialPositions[i]) > 1e-6) pinnedMoved++;
});
assert(pinnedMoved === 0, `les ${nPinned} particules ancrées n'ont pas bougé sous gravité`);

// Les particules NON ancrées doivent avoir bougé (sous gravité + contraintes).
let freeMoved = 0;
particles.forEach((p, i) => {
  if (!p.pinned && p.pos.distanceTo(initialPositions[i]) > 1e-4) freeMoved++;
});
assert(freeMoved > particles.length * 0.5, `${freeMoved}/${particles.length - nPinned} particules libres ont bougé sous gravité`);

// Pas de NaN/Infinity nulle part (signe classique d'une contrainte qui diverge).
let hasNaN = false;
particles.forEach(p => { if (!isFinite(p.pos.x) || !isFinite(p.pos.y) || !isFinite(p.pos.z)) hasNaN = true; });
assert(!hasNaN, 'aucune position NaN/Infinity après 120 pas de simulation (stabilité PBD)');

// La géométrie doit refléter les nouvelles positions (position attribute mis à jour).
const posAttr = geo.attributes.position;
const lastParticle = particles[particles.length - 1];
assert(Math.abs(posAttr.getY(particles.length - 1) - lastParticle.pos.y) < 1e-9,
  'geometry.attributes.position reflète bien les positions des particules (mesh non figé)');

// Les distances ne doivent pas avoir explosé (le tissu ne doit pas "exploser").
let maxStretch = 0;
constraints.forEach(c => {
  const d = particles[c.a].pos.distanceTo(particles[c.b].pos);
  maxStretch = Math.max(maxStretch, d / c.restLength);
});
assert(maxStretch < 3, `étirement maximal des contraintes = ${maxStretch.toFixed(2)}x (pas d'explosion numérique)`);

// ── 3) Test de "saisie" (grab) : déplacer une particule libre doit tirer ses voisines ──
const freeIdx = particles.findIndex(p => !p.pinned);
const neighborConstraint = constraints.find(c => c.a === freeIdx || c.b === freeIdx);
const neighborIdx = neighborConstraint.a === freeIdx ? neighborConstraint.b : neighborConstraint.a;
const neighborBefore = particles[neighborIdx].pos.clone();

twin.grabbed = freeIdx;
particles[freeIdx].pos.add(new THREE.Vector3(2, 2, 2)); // grosse traction
particles[freeIdx].prev.copy(particles[freeIdx].pos);
for (let i = 0; i < 30; i++) stepTwinPhysics(1/60);

const neighborMoved = particles[neighborIdx].pos.distanceTo(neighborBefore);
assert(neighborMoved > 0.05, `tirer une particule (voisin à distance ${neighborMoved.toFixed(3)}) déforme bien le voisinage (propagation des contraintes)`);

twin.grabbed = null;
console.log('\nTerminé.');
