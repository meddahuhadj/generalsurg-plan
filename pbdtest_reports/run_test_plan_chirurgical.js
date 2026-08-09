// Test du code RÉEL (extrait tel quel des fichiers assets/app-part*.js, pas une réécriture) du
// pont frontend ↔ backend de planification chirurgicale réelle (onglet « Plan chir. ») :
//   1. Construction des chemins API (/api/v2/surgical-planning/...) et du payload de simulation.
//   2. `planChirurgicalFetch` : base URL jointe, header Authorization (Bearer), gestion 401,
//      refus explicite quand aucun backend n'est configuré.
//   3. CRUD : list / save / select / delete / export (URLs, corps, formats de fichier).
//   4. `planChirurgicalEnsurePatient` : synchronisation patient (PUT → fallback POST si 404)
//      avec mapping des champs frontend (diag→diagnostic, etc.).
//   5. Tri anatomique réel vs synthétique (mesh_ref) et badge honnête associé.
//   6. HTML des métriques FLR/marge/FEM (classes ok/warn/alert cohérentes avec styles.css).
//
// Usage : node run_test_plan_chirurgical.js
const fs = require('fs');
const path = require('path');

const html = ['app-part1.js', 'app-part2.js', 'app-part3.js']
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'assets', f), 'utf8'))
  .join('\n');

// Extraction par appariement d'accolades. Les fonctions asynchrones doivent conserver leur
// mot-clé `async` (sinon leur `await` interne devient une SyntaxError) : on cherche d'abord
// `async function name(`, puis `function name(` en repli.
function extractFunction(src, name) {
  const asyncMarker = `async function ${name}(`;
  let start = src.indexOf(asyncMarker);
  let marker = asyncMarker;
  if (start === -1) {
    marker = `function ${name}(`;
    start = src.indexOf(marker);
  }
  if (start === -1) throw new Error(`Fonction introuvable dans les assets : ${name}`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

const fnNames = [
  'planChirurgicalBase',
  'planChirurgicalAvailable',
  'planChirurgicalPatientId',
  'planChirurgicalPath',
  'planChirurgicalFetch',
  'planChirurgicalSimulatePayload',
  'planChirurgicalSimulate',
  'planChirurgicalList',
  'planChirurgicalSave',
  'planChirurgicalSelect',
  'planChirurgicalDelete',
  'planChirurgicalExport',
  'planChirurgicalEnsurePatient',
  'planChirurgicalSegments',
  'planChirurgicalPlanifiable',
  'planChirurgicalBadgeHtml',
  'planChirurgicalMetricsHtml',
  // Pont MPR → plan de coupe (fonctions pures, testables sans DOM) :
  'planChirurgicalMprViewAxes',
  'planChirurgicalMprVoxelFromNormalized',
  'planChirurgicalMprToMeshMm',
  'planChirurgicalMprPlaneFromCut',
  'planChirurgicalDefaultMappingMode',
];
const extracted = fnNames.map(n => extractFunction(html, n)).join('\n\n');

function assert(cond, msg) {
  if (!cond) { console.error('❌ ÉCHEC:', msg); process.exitCode = 1; }
  else console.log('✅', msg);
}

// ── Mocks minimaux (aucun DOM/THREE.js nécessaire : ces fonctions ne touchent que
// state/MODULES/fetch/getBackendToken/handleUnauthorized) ──
global.state = {
  mod: 'laryngologie',
  settings: { apiBase: 'http://localhost:8000/' }, // slash final volontairement présent
};
global.MODULES = {
  laryngologie: {
    patient: {
      id: '40218-LAR', nom: 'DUPONT', age: 55, sexe: 'M',
      diag: 'Carcinome épidermoïde du larynx', poids: 72, taille: 175, urg: 'orange',
    },
  },
};
global.getBackendToken = async () => 'tok123';
let unauthorizedCalls = 0;
global.handleUnauthorized = async () => { unauthorizedCalls++; return true; };
global.notify = () => {};

const calls = [];
const responses = {}; // clé : URL exacte (sans query) → { status, body }
global.fetch = async (url, init) => {
  calls.push({ url, init });
  const hit = responses[url.split('?')[0]];
  if (!hit) throw new Error('Aucun mock fetch pour ' + url);
  return {
    ok: hit.status >= 200 && hit.status < 300,
    status: hit.status,
    json: async () => hit.body,
    blob: async () => ({ mock: true }),
  };
};

// Mocks navigateur pour planChirurgicalExport (création d'ancre de téléchargement).
let lastDownload = null;
global.document = {
  createElement: () => ({
    set href(v) { lastDownload = v; },
    set download(v) { lastDownload += ' || download=' + v; },
    click() {},
  }),
};
global.URL.createObjectURL = () => 'blob:mock';
global.URL.revokeObjectURL = () => {};

eval(extracted);

(async () => {
  // ── 1) Chemins API : structure exacte attendue par le backend ──
  assert(
    planChirurgicalPath('simulate', '40218-LAR') === '/api/v2/surgical-planning/patients/40218-LAR/resection/simulate',
    `chemin simulate exact (obtenu: ${planChirurgicalPath('simulate', '40218-LAR')})`
  );
  assert(
    planChirurgicalPath('plans', '40218-LAR') === '/api/v2/surgical-planning/patients/40218-LAR/resection/plans',
    `chemin plans exact (obtenu: ${planChirurgicalPath('plans', '40218-LAR')})`
  );
  assert(
    planChirurgicalPath('select', '40218-LAR', 'p1') === '/api/v2/surgical-planning/patients/40218-LAR/resection/plans/p1/select',
    'chemin select exact'
  );
  assert(
    planChirurgicalPath('export', '40218-LAR', 'p1') === '/api/v2/surgical-planning/patients/40218-LAR/resection/plans/p1/export',
    'chemin export exact'
  );
  assert(
    planChirurgicalPath('plan', '40218-LAR', 'p1') === '/api/v2/surgical-planning/patients/40218-LAR/resection/plans/p1',
    'chemin delete exact'
  );

  // ── 2) Payload de simulation : valeurs par défaut, conversion numérique, bornage marge [0..50] ──
  let payload = planChirurgicalSimulatePayload([1, 2, 3], [0, 0, 1], undefined, undefined, undefined, true);
  assert(JSON.stringify(payload.plane_point) === '[1,2,3]', 'plane_point converti en nombres');
  assert(payload.margin_mm === 5, `marge par défaut 5.0 (obtenu ${payload.margin_mm})`);
  assert(payload.tissue_type === 'liver_parenchyma', 'tissu par défaut liver_parenchyma');
  assert(payload.model === 'mooney_rivlin', 'modèle par défaut mooney_rivlin');
  assert(payload.run_fem === true, 'run_fem par défaut true');
  payload = planChirurgicalSimulatePayload([0, 0, 0], [0, 1, 0], 99, 'bone', 'ogden', false);
  assert(payload.margin_mm === 50, `marge bornée à 50 (obtenu ${payload.margin_mm})`);
  payload = planChirurgicalSimulatePayload([0, 0, 0], [0, 1, 0], -8, 'bone', 'ogden', false);
  assert(payload.margin_mm === 0, `marge bornée à 0 (obtenu ${payload.margin_mm})`);
  assert(payload.run_fem === false, 'run_fem=false transmis tel quel');

  // ── 3) planChirurgicalFetch : base jointe, header Bearer, refus sans backend ──
  responses['http://localhost:8000/api/v2/surgical-planning/patients/40218-LAR/resection/plans'] = { status: 200, body: [] };
  await planChirurgicalList('40218-LAR');
  const listCall = calls.find(c => c.url.endsWith('/resection/plans'));
  assert(listCall && listCall.init.headers['Authorization'] === 'Bearer tok123', 'Authorization: Bearer <token> présent');
  assert(listCall && listCall.init.headers['Content-Type'] === 'application/json', 'Content-Type: application/json présent');
  assert(!(listCall.init.body), 'GET sans corps');

  const oldBase = state.settings.apiBase;
  state.settings.apiBase = '';
  let threw = false;
  try { await planChirurgicalFetch('/api/v2/anything'); } catch (e) { threw = true; }
  assert(threw, 'sans backend configuré → erreur explicite, pas un appel réseau silencieux');
  state.settings.apiBase = oldBase;

  // 401 → handleUnauthorized appelé (session expirée)
  responses['http://localhost:8000/api/v2/surgical-planning/patients/40218-LAR/resection/plans/x'] = { status: 401, body: {} };
  await planChirurgicalFetch('/api/v2/surgical-planning/patients/40218-LAR/resection/plans/x');
  assert(unauthorizedCalls === 1, 'réponse 401 → handleUnauthorized() appelé (reconnexion déclenchée)');

  // ── 4) CRUD : save / select / delete / export ──
  responses['http://localhost:8000/api/v2/surgical-planning/patients/40218-LAR/resection/plans'] = {
    status: 201, body: { id: 'plan1', title: 'Résection — marge 5 mm', status: 'DRAFT', metrics: { flr_pct: 42.1 } },
  };
  const saved = await planChirurgicalSave('40218-LAR', 'Résection — marge 5 mm', planChirurgicalSimulatePayload([0, 0, 0], [0, 0, 1], 5, 'liver_parenchyma', 'mooney_rivlin', true));
  const saveCall = calls.find(c => c.init.method === 'POST' && c.url.endsWith('/resection/plans'));
  const saveBody = JSON.parse(saveCall.init.body);
  assert(saveBody.title === 'Résection — marge 5 mm', 'save : titre transmis dans le corps POST');
  assert(saveBody.plane_point.length === 3 && saveBody.run_fem === true, 'save : payload de simulation complet dans le corps');
  assert(saved.id === 'plan1', `save : réponse parsée retournée (obtenu ${saved.id})`);

  responses['http://localhost:8000/api/v2/surgical-planning/patients/40218-LAR/resection/plans/plan1/select'] = {
    status: 200, body: { id: 'plan1', title: 'X', status: 'SELECTED' },
  };
  const sel = await planChirurgicalSelect('40218-LAR', 'plan1');
  assert(sel.status === 'SELECTED', 'select : POST sur /select, statut SELECTED retourné');

  responses['http://localhost:8000/api/v2/surgical-planning/patients/40218-LAR/resection/plans/plan1'] = { status: 204, body: {} };
  await planChirurgicalDelete('40218-LAR', 'plan1');
  assert(calls.some(c => c.init.method === 'DELETE' && c.url.endsWith('/resection/plans/plan1')), 'delete : DELETE sur /plans/{id}');

  responses['http://localhost:8000/api/v2/surgical-planning/patients/40218-LAR/resection/plans/plan1/export'] = { status: 200, body: {} };
  await planChirurgicalExport('40218-LAR', 'plan1', 'dicom-sr');
  const expCall = calls.find(c => c.url.startsWith('http://localhost:8000/api/v2/surgical-planning/patients/40218-LAR/resection/plans/plan1/export'));
  assert(expCall && expCall.url.includes('format=dicom-sr'), `export : query format=dicom-sr (obtenu ${expCall.url})`);
  assert(lastDownload && lastDownload.includes('download=plan_plan1.dcm'), `export : extension .dcm pour DICOM SR (obtenu ${lastDownload})`);
  await planChirurgicalExport('40218-LAR', 'plan1', 'pdf');
  assert(lastDownload.includes('download=plan_plan1.pdf'), 'export : extension .pdf pour PDF');

  // ── 5) planChirurgicalEnsurePatient : PUT → fallback POST si 404, mapping des champs ──
  responses['http://localhost:8000/patients/40218-LAR'] = { status: 404, body: { detail: 'introuvable' } };
  responses['http://localhost:8000/patients'] = { status: 201, body: { id: '40218-LAR' } };
  await planChirurgicalEnsurePatient();
  const putCall = calls.find(c => c.url.endsWith('/patients/40218-LAR') && c.init.method === 'PUT');
  const putBody = JSON.parse(putCall.init.body);
  assert(putBody.diagnostic === 'Carcinome épidermoïde du larynx', 'sync patient : mapping diag → diagnostic');
  assert(putBody.id === '40218-LAR' && putBody.specialty === 'laryngologie', 'sync patient : id et specialty transmis');
  assert(putBody.poids_kg === 72 && putBody.taille_cm === 175, 'sync patient : poids/taille transmis');
  const postCall = calls.find(c => c.url === 'http://localhost:8000/patients' && c.init.method === 'POST');
  assert(postCall, 'PUT 404 → création du patient via POST /patients');

  // ── 6) Tri anatomique réel vs synthétique + badge honnête ──
  const anat = planChirurgicalPlanifiable([
    { name: 'Foie synthétique', type: 'organe', mesh_ref: '/meshes/demo/40218-LAR/liver_synthetic.glb' },
    { name: 'Lésion', type: 'lesion', mesh_ref: '/meshes/demo/40218-LAR/tumor.glb' },
  ]);
  assert(anat.organs.length === 1 && anat.lesions.length === 1, 'organe + lésion classés par type');
  assert(anat.syntheticCount === 2 && anat.realCount === 0, 'mesh /meshes/demo/... → synthétique (démo), jamais présenté comme réel');
  assert(planChirurgicalBadgeHtml(anat).includes('synth'), 'badge « anatomie synthétique (démo) » pour maillages de démo');

  const anatReal = planChirurgicalPlanifiable([
    { name: 'Liver_Parenchyma', type: 'liver', mesh_ref: '/meshes/job_123/liver_total_lowpoly.glb' },
    { name: 'Tumor', type: 'liver_tumor', mesh_ref: '/meshes/job_123/tumor.glb' },
  ]);
  assert(anatReal.realCount === 2 && anatReal.syntheticCount === 0, 'mesh /meshes/{job_id}/... → segmentation réelle');
  assert(anatReal.hasOrganMesh && anatReal.hasLesionMesh, 'flags hasOrganMesh/hasLesionMesh corrects');
  assert(planChirurgicalBadgeHtml(anatReal).includes('real'), 'badge « segmentation IA réelle »');

  const anatVide = planChirurgicalPlanifiable([]);
  assert(!anatVide.hasMesh && anatVide.total === 0, 'aucun segment → hasMesh=false, pas de crash');
  assert(planChirurgicalBadgeHtml(anatVide).includes('aucun maillage'), 'badge « aucun maillage 3D »');

  // ── 7) HTML des métriques : FLR (seuil 30%), marge, FEM ──
  let mh = planChirurgicalMetricsHtml({ total_volume_ml: 1200, resected_volume_ml: 500, remnant_volume_ml: 700, flr_pct: 58.3, margin_mm: 12, margin_ok: true });
  assert(mh.includes('58.3%') && mh.includes('v ok'), 'FLR ≥ 30% → classe ok');
  assert(mh.includes('12 mm') && !mh.includes('insuffisante'), 'marge suffisante sans mention insuffisante');
  mh = planChirurgicalMetricsHtml({ flr_pct: 15, margin_mm: 2, margin_ok: false, strain_energy_relaxation_pct: 33, peak_displacement_mm: 0.8, converged: true, iterations: 6 });
  assert(mh.includes('15%') && mh.includes('v warn'), 'FLR < 30% → classe warn');
  assert(mh.includes('insuffisante'), 'marge insuffisante clairement étiquetée');
  assert(mh.includes('Relaxation FEM') && mh.includes('33%'), 'bloc FEM affiché quand relaxation présente');
  assert(mh.includes('6 it.') && mh.includes('oui'), 'convergence et itérations FEM affichées');
  const mhVide = planChirurgicalMetricsHtml(null);
  assert(mhVide.includes('n/a'), 'métriques vides → n/a, pas de crash');

  // ── 8) Pont MPR → plan de coupe : axes de vue, voxel→mm, plan dérivé du tracé ✂️ Wedge ──
  // Alignement sur drawMprOverlay : axial → slice z (u=x, v=y), coronal → slice y (u=x, v=z),
  // sagittal → slice x (u=z, v=y).
  assert(JSON.stringify(planChirurgicalMprViewAxes('axial').normal) === '[0,0,1]', 'vue axiale → normale [0,0,1] (slice = z)');
  assert(JSON.stringify(planChirurgicalMprViewAxes('coronal').normal) === '[0,1,0]', 'vue coronale → normale [0,1,0] (slice = y)');
  assert(JSON.stringify(planChirurgicalMprViewAxes('sagittal').normal) === '[1,0,0]', 'vue sagittale → normale [1,0,0] (slice = x)');
  assert(JSON.stringify(planChirurgicalMprViewAxes('coronal').u) === '0' && planChirurgicalMprViewAxes('coronal').v === 2, 'coronal : u=x, v=z');
  assert(JSON.stringify(planChirurgicalMprViewAxes('sagittal').u) === '2' && planChirurgicalMprViewAxes('sagittal').v === 1, 'sagittal : u=z, v=y');
  assert(planChirurgicalMprViewAxes('inconnu').w === 2, 'vue inconnue → repli axial');

  // Pixel normalisé (0..1) → voxel : le centre d'une vue 64³ est le voxel (32,32,32).
  let vox = planChirurgicalMprVoxelFromNormalized('axial', 0.5, 0.5, 64, 32);
  assert(JSON.stringify(vox) === '[32,32,32]', 'axial (0.5,0.5,coupe32) → voxel [32,32,32]');
  vox = planChirurgicalMprVoxelFromNormalized('sagittal', 0.5, 0.5, 64, 16);
  assert(JSON.stringify(vox) === '[16,32,32]', 'sagittal : pixel u → x (slice = x), v → y');
  vox = planChirurgicalMprVoxelFromNormalized('coronal', 0.5, 0.5, 64, 8);
  assert(JSON.stringify(vox) === '[32,8,32]', 'coronal : pixel v → z (slice = y)');

  // voxel → mm : mode corner = voxel × spacing (origine coin NIfTI) ; synthetic = centré ±~2.5mm/voxel.
  let mm = planChirurgicalMprToMeshMm([32, 32, 32], { x: 0.78, y: 0.78, z: 1.25 }, 'corner');
  assert(JSON.stringify(mm) === '[24.96,24.96,40]', 'corner : [32,32,32] × spacing {0.78,0.78,1.25} → [24.96,24.96,40]');
  mm = planChirurgicalMprToMeshMm([32, 32, 32], { x: 0.78, y: 0.78, z: 1.25 }, 'synthetic');
  assert(JSON.stringify(mm) === '[0,0,0]', 'synthetic : centre du volume → [0,0,0] (origine du maillage démo)');
  mm = planChirurgicalMprToMeshMm([16, 32, 32], null, 'synthetic');
  assert(JSON.stringify(mm) === '[-40,0,0]', 'synthetic : voxel 16 → -40 mm (≈2.5 mm/voxel)');

  // Plan dérivé d'un tracé ✂️ Wedge (points normalisés) : droite de moindres carrés dans la vue,
  // plane_normal = normale de la vue × direction du tracé (arrondi 0.01).
  const sp = { x: 0.78, y: 0.78, z: 1.25 };
  let pl = planChirurgicalMprPlaneFromCut(
    { points: [[0.25, 0.5], [0.5, 0.5], [0.75, 0.5]], view: 'axial', sliceIdx: 32 },
    { volSize: 64, spacing: sp, mode: 'corner' });
  assert(pl && pl.points === 3, 'tracé 3 points → plan dérivé');
  assert(JSON.stringify(pl.plane_point) === '[24.96,24.96,40]', 'axial horizontal : plane_point = centroïde voxel×spacing');
  assert(JSON.stringify(pl.plane_normal) === '[0,1,0]', 'axial horizontal : normale = [0,1,0] (plan vertical)');
  assert(pl.sliceIdx === 32 && pl.view === 'axial' && pl.mode === 'corner', 'métadonnées vue/coupe/mode conservées');

  pl = planChirurgicalMprPlaneFromCut(
    { points: [[0.5, 0.25], [0.5, 0.5], [0.5, 0.75]], view: 'axial', sliceIdx: 32 },
    { volSize: 64, spacing: sp, mode: 'corner' });
  assert(pl && Math.abs(Math.abs(pl.plane_normal[0]) - 1) < 0.01 && Math.abs(pl.plane_normal[1]) < 0.01,
    `axial vertical : normale ≈ ±[1,0,0] (obtenu [${pl.plane_normal.join(',')}])`);

  // sliceIdx du tracé prioritaire sur planeIdx transmis séparément.
  pl = planChirurgicalMprPlaneFromCut(
    { points: [[0.25, 0.5], [0.75, 0.5]], view: 'sagittal', sliceIdx: 5 },
    { volSize: 64, spacing: sp, mode: 'corner', planeIdx: 42 });
  assert(pl.sliceIdx === 5, 'sliceIdx du tracé prioritaire sur planeIdx');
  assert(pl && Math.abs(pl.plane_normal[1]) > 0.99 && Math.abs(pl.plane_normal[2]) < 0.01,
    `sagittal horizontal (trait le long de z) → plan frontal, normale ≈ ±[0,1,0] (obtenu [${pl.plane_normal.join(',')}])`);

  // 1 seul point → plane_point unique, normale = normale de la vue (pas de direction fittée).
  pl = planChirurgicalMprPlaneFromCut({ points: [[0.5, 0.5]], view: 'axial', sliceIdx: 32 }, { volSize: 64, spacing: sp, mode: 'corner' });
  assert(pl.points === 1 && JSON.stringify(pl.plane_normal) === '[0,0,1]', '1 point → normale = normale de la vue');

  // Tracé vide → null, jamais de plan fantôme.
  assert(planChirurgicalMprPlaneFromCut({ points: [], view: 'axial' }, {}) === null, 'tracé vide → null');

  // Mode de conversion par défaut selon l'anatomie chargée.
  assert(planChirurgicalDefaultMappingMode({ syntheticCount: 2, realCount: 0 }) === 'synthetic', 'démo seule → mode synthetic');
  assert(planChirurgicalDefaultMappingMode({ syntheticCount: 0, realCount: 1 }) === 'corner', 'segmentation réelle → mode corner');
  assert(planChirurgicalDefaultMappingMode(null) === 'corner', 'sans anatomie → repli corner');

  console.log('\nTerminé.');
})();
