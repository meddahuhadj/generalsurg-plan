global.THREE = require('three');
const fs = require('fs');
const code = fs.readFileSync(__dirname + '/extracted_pbd.js', 'utf8');
global.state = { mod: 'hbp' };
eval(code);

const specialties = ['hbp','colorectal','gastrique','thyroide','thoracique','cardiaque','urologie','anesthesie_reanimation'];
console.log('Spécialités testées:', specialties.join(', '));
console.log();

let allOk = true;
for (const mod of specialties) {
  state.mod = mod;
  const geo = buildTwinGeometry();
  const particles = buildTwinParticles(geo);
  const constraints = buildTwinConstraints(geo, particles);
  const nPinned = particles.filter(p => p.pinned).length;

  global.twin = { active: true, particles, constraints, geometry: geo, grabbed: null, gravity: -0.35, stiffness: 0.4, substeps: 6 };
  const before = particles.map(p => p.pos.clone());
  for (let i = 0; i < 90; i++) stepTwinPhysics(1/60);

  const nanCount = particles.filter(p => !isFinite(p.pos.x) || !isFinite(p.pos.y) || !isFinite(p.pos.z)).length;
  const pinnedMoved = particles.filter((p, i) => p.pinned && p.pos.distanceTo(before[i]) > 1e-6).length;
  let maxStretch = 0;
  constraints.forEach(c => { maxStretch = Math.max(maxStretch, particles[c.a].pos.distanceTo(particles[c.b].pos) / c.restLength); });

  const ok = geo.attributes.position.count > 20 && constraints.length > 0 && nPinned > 0 &&
             nanCount === 0 && pinnedMoved === 0 && maxStretch < 3;
  allOk = allOk && ok;
  console.log(`${ok ? '✅' : '❌'} ${mod.padEnd(12)} sommets=${geo.attributes.position.count} contraintes=${constraints.length} ancrés=${nPinned} étirement_max=${maxStretch.toFixed(2)}x NaN=${nanCount}`);
}
console.log();
console.log(allOk ? '✅ Les 7 spécialités produisent un jumeau numérique stable.' : '❌ Au moins une spécialité échoue.');
process.exitCode = allOk ? 0 : 1;
