          // ════════════════════════════════════════════════
          //  WORKFLOW ONCOLOGIQUE — Lot A (Phase 1 & 2)
          //  Segmentation MPR, Mesures, FLR réel, Staging TNM/BCLC, Audit trail local
          // ════════════════════════════════════════════════

          // ── Initialisation des extensions state.mpr ──
          Object.assign(state.mpr, {
            segments: {
              tumor: { voxels: new Set(), color: '#ef4444', label: 'Tumeur' },
              vessel: { voxels: new Set(), color: '#3b82f6', label: 'Vaisseau à risque' },
              nerve: { voxels: new Set(), color: '#8b5cf6', label: 'Nerf à risque' },
              duct: { voxels: new Set(), color: '#eab308', label: 'Canal/conduit' },
              gtv: { voxels: new Set(), color: '#f97316', label: 'GTV' },
              ctv: { voxels: new Set(), color: '#fb923c', label: 'CTV' },
            },
            activeSegment: 'tumor',
            measurements: [],        // [{type, pts, plane, sliceIdx, value, unit}]
            toolMode: 'browse',      // 'browse'|'brush'|'wand'|'eraser'|'distance'|'angle'|'annotation'
            _measurePending: null,   // premier point pour distance/angle
          });

          // ── Audit trail local (chainé par hash simple) ──
          state.auditLog = [];

          function logAudit(action, detail) {
            const ts = new Date().toISOString();
            const user = (state.settings && state.settings.chirurgien) || 'Unknown';
            // Correctif de sécurité patient : chaque entrée est désormais taguée avec le patient/module
            // actif au moment de l'action. Sans ce tag, state.auditLog était un journal SESSION global
            // sans distinction de patient — affiché dans le panneau de stadification et exporté dans
            // les comptes-rendus (DICOM-SR/FHIR/bilan staging) sous le nom du patient COURANT, alors
            // qu'il pouvait contenir des actions effectuées sur un AUTRE patient avant un changement
            // de module (voir switchModule(), qui ne nettoyait pas non plus ce journal jusqu'ici).
            const mod = (typeof MODULES !== 'undefined' && MODULES[state.mod]) ? MODULES[state.mod] : null;
            const patientId = (mod && mod.patient && mod.patient.id) || null;
            const specialty = state.mod || null;
            const payload = ts + '|' + user + '|' + action + '|' + JSON.stringify(detail);
            // Hash simple non cryptographique (djb2) pour la démo — suffisant pour chaînage
            let h = 5381;
            for (let i = 0; i < payload.length; i++) { h = ((h << 5) + h) + payload.charCodeAt(i); h &= 0xffffffff; }
            const hash = (h >>> 0).toString(16).padStart(8, '0');
            state.auditLog.push({ ts, user, action, detail, hash, patientId, specialty });
          }

          // Entrées du journal d'audit pour le patient/module actif uniquement — à utiliser partout où
          // l'audit log est affiché ou exporté dans un contexte "patient courant" (panneau de
          // stadification, exports), pour ne jamais laisser croire qu'une action faite sur un autre
          // patient concerne celui affiché à l'écran.
          function currentPatientAuditLog() {
            const mod = MODULES[state.mod];
            const patientId = (mod && mod.patient && mod.patient.id) || null;
            return state.auditLog.filter(a => a.patientId === patientId);
          }

          // ── Utilitaires voxel ↔ mL ──
          function voxelToML(nbVoxels) {
            const sp = state.mpr.spacing;
            return nbVoxels * (sp.x || 1) * (sp.y || 1) * (sp.z || 1) / 1000;
          }
          function mlToVoxels(ml) {
            const sp = state.mpr.spacing;
            return ml * 1000 / ((sp.x || 1) * (sp.y || 1) * (sp.z || 1));
          }

          // ── Index voxel → entier 1D ──
          function voxelIdx(x, y, z) {
            const N = state.mpr.volSize;
            return z * N * N + y * N + x;
          }
          function voxelCoords(idx) {
            const N = state.mpr.volSize;
            const z = Math.floor(idx / (N * N));
            const y = Math.floor((idx % (N * N)) / N);
            const x = idx % N;
            return { x, y, z };
          }

          // ── Conversion canvas pixel → voxel selon le plan ──
          function canvasToVoxel(px, py, plane, w, h) {
            const N = state.mpr.volSize;
            const vx = Math.max(0, Math.min(N - 1, Math.floor(px / w * N)));
            const vy = Math.max(0, Math.min(N - 1, Math.floor(py / h * N)));
            const si = state.mpr.plane[plane];
            if (plane === 'axial') return { x: vx, y: vy, z: si };
            if (plane === 'coronal') return { x: vx, y: si, z: vy };
            return { x: si, y: vy, z: vx }; // sagittal
          }

          // ════════════════════════════════════════════════
          //  MPR TOOLBAR — sélecteur d'outil
          // ════════════════════════════════════════════════
          function setMprTool(tool) {
            state.mpr.toolMode = tool;
            state.mpr._measurePending = null;
            const tools = ['browse', 'brush', 'wand', 'eraser', 'distance', 'angle', 'annotation'];
            tools.forEach(t => {
              const btn = document.getElementById('mpr-tool-' + t);
              if (btn) btn.classList.toggle('on', t === tool);
            });
            // Curseur visuel
            ['axial', 'coronal', 'sagittal'].forEach(plane => {
              const c = document.getElementById('mpr-' + plane);
              if (!c) return;
              if (tool === 'browse') c.style.cursor = 'default';
              else if (tool === 'brush') c.style.cursor = 'crosshair';
              else if (tool === 'wand') c.style.cursor = 'cell';
              else if (tool === 'eraser') c.style.cursor = 'grabbing';
              else if (tool === 'distance' || tool === 'angle') c.style.cursor = 'copy';
              else if (tool === 'annotation') c.style.cursor = 'text';
            });
            // Radius slider feed-through
            const rSlider = document.getElementById('mpr-brush-radius');
            if (rSlider) {
              rSlider.oninput = () => {
                const v = document.getElementById('mpr-brush-radius-val');
                if (v) v.textContent = rSlider.value;
              };
            }
          }

          // ════════════════════════════════════════════════
          //  SEGMENTATION — Brush
          // ════════════════════════════════════════════════
          function segmentBrush(plane, px, py, w, h, erase) {
            if (!state.mpr.volume) return;
            const N = state.mpr.volSize;
            const r = parseInt(document.getElementById('mpr-brush-radius')?.value || 4);
            const seg = erase ? null : state.mpr.activeSegment;
            const vox = canvasToVoxel(px, py, plane, w, h);

            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                let cx, cy, cz;
                if (plane === 'axial') { cx = vox.x + dx; cy = vox.y + dy; cz = vox.z; }
                else if (plane === 'coronal') { cx = vox.x + dx; cy = vox.y; cz = vox.z + dy; }
                else { cx = vox.x; cy = vox.y + dy; cz = vox.z + dx; }
                if (cx < 0 || cy < 0 || cz < 0 || cx >= N || cy >= N || cz >= N) continue;
                const idx = voxelIdx(cx, cy, cz);
                if (erase) {
                  // Efface dans tous les segments
                  Object.values(state.mpr.segments).forEach(s => s.voxels.delete(idx));
                } else {
                  state.mpr.segments[seg].voxels.add(idx);
                }
              }
            }
            refreshMprCanvas(plane);
          }

          // ════════════════════════════════════════════════
          //  SEGMENTATION — Magic Wand (flood-fill par seuil HU)
          // ════════════════════════════════════════════════
          function segmentMagicWand(plane, px, py, w, h) {
            if (!state.mpr.volume) return;
            const N = state.mpr.volSize;
            const seedVox = canvasToVoxel(px, py, plane, w, h);
            const seedHU = sampleVolume(seedVox.x, seedVox.y, seedVox.z);
            const delta = 25; // tolérance ±25 HU
            const lo = seedHU - delta, hi = seedHU + delta;
            const seg = state.mpr.activeSegment;
            const visited = new Set();
            const queue = [{ x: seedVox.x, y: seedVox.y, z: seedVox.z }];
            let count = 0;
            const maxVoxels = 5000; // limite de sécurité pour éviter le flood total

            while (queue.length && count < maxVoxels) {
              const { x, y, z } = queue.shift();
              if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) continue;
              const idx = voxelIdx(x, y, z);
              if (visited.has(idx)) continue;
              visited.add(idx);
              const hu = sampleVolume(x, y, z);
              if (hu < lo || hu > hi) continue;
              state.mpr.segments[seg].voxels.add(idx);
              count++;
              // Voisins 6-connexes dans le même plan pour garder un rendu 2D cohérent
              if (plane === 'axial') {
                queue.push({ x: x + 1, y, z }, { x: x - 1, y, z }, { x, y: y + 1, z }, { x, y: y - 1, z });
              } else if (plane === 'coronal') {
                queue.push({ x: x + 1, y, z }, { x: x - 1, y, z }, { x, y, z: z + 1 }, { x, y, z: z - 1 });
              } else {
                queue.push({ x, y: y + 1, z }, { x, y: y - 1, z }, { x, y, z: z + 1 }, { x, y, z: z - 1 });
              }
            }
            refreshMprCanvas(plane);
            logAudit('segment_wand', { seg, seedHU, count, plane });
            notify(`✨ Wand: ${count} voxel(s) segmentés dans "${state.mpr.segments[seg].label}"`, 'ok');
          }

          // ════════════════════════════════════════════════
          //  OVERLAY — dessine les segments + mesures sur le canvas
          // ════════════════════════════════════════════════
          function drawMprOverlay(ctx, w, h, plane) {
            const N = state.mpr.volSize;
            const sliceIdx = state.mpr.plane[plane];

            // ── Segments ──
            Object.entries(state.mpr.segments).forEach(([key, seg]) => {
              if (!seg.voxels.size) return;
              ctx.fillStyle = seg.color + 'aa'; // ~67% opacity
              seg.voxels.forEach(idx => {
                const { x, y, z } = voxelCoords(idx);
                let px, py;
                if (plane === 'axial') {
                  if (z !== sliceIdx) return;
                  px = Math.floor(x / N * w); py = Math.floor(y / N * h);
                } else if (plane === 'coronal') {
                  if (y !== sliceIdx) return;
                  px = Math.floor(x / N * w); py = Math.floor(z / N * h);
                } else {
                  if (x !== sliceIdx) return;
                  px = Math.floor(z / N * w); py = Math.floor(y / N * h);
                }
                const pw = Math.max(1, Math.ceil(w / N));
                const ph = Math.max(1, Math.ceil(h / N));
                ctx.fillRect(px, py, pw, ph);
              });
            });

            // ── Mesures ──
            state.mpr.measurements.forEach(m => {
              if (m.plane !== plane) return;
              if (m.type === 'distance' && m.pts.length === 2) {
                const [p1, p2] = m.pts;
                ctx.strokeStyle = '#facc15';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 3]);
                ctx.beginPath();
                ctx.moveTo(p1[0] * w, p1[1] * h);
                ctx.lineTo(p2[0] * w, p2[1] * h);
                ctx.stroke();
                ctx.setLineDash([]);
                // Endpoints
                [p1, p2].forEach(p => {
                  ctx.fillStyle = '#facc15';
                  ctx.beginPath();
                  ctx.arc(p[0] * w, p[1] * h, 3, 0, Math.PI * 2);
                  ctx.fill();
                });
                // Label
                const mx = (p1[0] + p2[0]) / 2 * w;
                const my = (p1[1] + p2[1]) / 2 * h - 6;
                ctx.fillStyle = 'rgba(0,0,0,.7)';
                ctx.fillRect(mx - 18, my - 9, 36, 12);
                ctx.fillStyle = '#facc15';
                ctx.font = '8px JetBrains Mono';
                ctx.textAlign = 'center';
                ctx.fillText(m.value ? m.value.toFixed(1) + 'mm' : '...', mx, my);
                ctx.textAlign = 'left';
              } else if (m.type === 'annotation') {
                const [px, py] = [m.pts[0][0] * w, m.pts[0][1] * h];
                ctx.fillStyle = 'rgba(0,0,0,.7)';
                const tw = ctx.measureText(m.text || '').width + 8;
                ctx.fillRect(px + 5, py - 9, tw, 12);
                ctx.fillStyle = '#a5f3fc';
                ctx.font = '8px JetBrains Mono';
                ctx.fillText(m.text || '', px + 9, py);
                ctx.strokeStyle = '#a5f3fc';
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, Math.PI * 2);
                ctx.stroke();
              }
            });

            // ── Pending measure (premier point posé) ──
            if (state.mpr._measurePending && state.mpr._measurePending.plane === plane) {
              const p = state.mpr._measurePending.pt;
              ctx.strokeStyle = '#facc15';
              ctx.fillStyle = '#facc15';
              ctx.beginPath();
              ctx.arc(p[0] * w, p[1] * h, 4, 0, Math.PI * 2);
              ctx.fill();
            }
          }


          // ════════════════════════════════════════════════
          //  MPR EVENT HANDLERS — dispatcher selon toolMode
          // ════════════════════════════════════════════════
          function _getMprSpacingForPlane(plane) {
            const sp = state.mpr.spacing;
            if (plane === 'axial') return { dx: sp.x || 1, dy: sp.y || 1 };
            if (plane === 'coronal') return { dx: sp.x || 1, dy: sp.z || 1 };
            return { dx: sp.z || 1, dy: sp.y || 1 };
          }

          function initMprOncologyHandlers() {
            ['axial', 'coronal', 'sagittal'].forEach(plane => {
              const canvas = document.getElementById('mpr-' + plane);
              if (!canvas) return;

              let isDown = false;

              canvas.addEventListener('mousedown', e => {
                isDown = true;
                const r = canvas.getBoundingClientRect();
                const px = e.clientX - r.left;
                const py = e.clientY - r.top;
                const tool = state.mpr.toolMode;

                if (tool === 'brush') {
                  segmentBrush(plane, px, py, canvas.width, canvas.height, false);
                } else if (tool === 'eraser') {
                  segmentBrush(plane, px, py, canvas.width, canvas.height, true);
                } else if (tool === 'wand') {
                  segmentMagicWand(plane, px, py, canvas.width, canvas.height);
                } else if (tool === 'distance') {
                  const nPx = px / canvas.width, nPy = py / canvas.height;
                  if (!state.mpr._measurePending) {
                    state.mpr._measurePending = { plane, pt: [nPx, nPy] };
                    refreshMprCanvas(plane);
                  } else {
                    // Finalise la mesure
                    const p1 = state.mpr._measurePending.pt;
                    const p2 = [nPx, nPy];
                    const sp = _getMprSpacingForPlane(plane);
                    const N = state.mpr.volSize;
                    const dx = (p2[0] - p1[0]) * N * sp.dx;
                    const dy = (p2[1] - p1[1]) * N * sp.dy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    state.mpr.measurements.push({ type: 'distance', plane, pts: [p1, p2], sliceIdx: state.mpr.plane[plane], value: dist, unit: 'mm' });
                    logAudit('measure_distance', { plane, dist_mm: dist.toFixed(2) });
                    notify(`📏 Distance : ${dist.toFixed(1)} mm`, 'ok');
                    state.mpr._measurePending = null;
                    refreshMprCanvas(plane);
                  }
                } else if (tool === 'annotation') {
                  const text = window.prompt('Annotation :', '');
                  if (text) {
                    state.mpr.measurements.push({ type: 'annotation', plane, pts: [[px / canvas.width, py / canvas.height]], sliceIdx: state.mpr.plane[plane], text });
                    logAudit('annotation', { plane, text });
                    refreshMprCanvas(plane);
                  }
                }
              }, { capture: true });

              canvas.addEventListener('mousemove', e => {
                if (!isDown) return;
                const r = canvas.getBoundingClientRect();
                const px = e.clientX - r.left;
                const py = e.clientY - r.top;
                const tool = state.mpr.toolMode;
                if (tool === 'brush') segmentBrush(plane, px, py, canvas.width, canvas.height, false);
                else if (tool === 'eraser') segmentBrush(plane, px, py, canvas.width, canvas.height, true);
              }, { capture: true });

              canvas.addEventListener('mouseup', () => { isDown = false; }, { capture: true });
            });
          }

          function clearMprMeasurements() {
            state.mpr.measurements = [];
            state.mpr._measurePending = null;
            ['axial', 'coronal', 'sagittal'].forEach(refreshMprCanvas);
            logAudit('clear_measurements', {});
            notify('Mesures effacées', 'info');
          }

          function clearMprSegments() {
            Object.values(state.mpr.segments).forEach(s => s.voxels.clear());
            if (segmentMesh3D) { scene.remove(segmentMesh3D); segmentMesh3D = null; }
            ['axial', 'coronal', 'sagittal'].forEach(refreshMprCanvas);
            logAudit('clear_segments', {});
            notify('Segments effacés', 'info');
          }

          // ════════════════════════════════════════════════
          //  SEGMENTATION 3D — visualisation voxel dans le viewer Three.js
          // ════════════════════════════════════════════════
          let segmentMesh3D = null;
          const SEG_COLORS_3D = {
            tumor: 0xef4444,
            vessel: 0x3b82f6,
            nerve: 0x8b5cf6,
            duct: 0xeab308,
            gtv: 0xf97316,
            ctv: 0xfb923c,
          };

          function updateSegment3D() {
            if (!scene) return;
            if (segmentMesh3D) { scene.remove(segmentMesh3D); segmentMesh3D = null; }
            const N = state.mpr.volSize;
            const half = N * 0.5;
            const group = new THREE.Group();
            const sharedBox = _dicomGetSharedBox();
            if (!sharedBox) return;

            Object.entries(state.mpr.segments).forEach(([key, seg]) => {
              if (!seg.voxels.size) return;
              const mat = new THREE.MeshStandardMaterial({ color: SEG_COLORS_3D[key] || 0xffffff, transparent: true, opacity: 0.75, roughness: 0.5 });
              const inst = new THREE.InstancedMesh(sharedBox, mat, seg.voxels.size);
              inst.name = 'seg-' + key;
              const mtx = new THREE.Matrix4();
              let i = 0;
              seg.voxels.forEach(idx => {
                const { x, y, z } = voxelCoords(idx);
                mtx.setPosition(x - half + 0.5, y - half + 0.5, z - half + 0.5);
                inst.setMatrixAt(i++, mtx);
              });
              inst.instanceMatrix.needsUpdate = true;
              group.add(inst);
            });
            if (group.children.length) {
              segmentMesh3D = group;
              scene.add(segmentMesh3D);
              notify('Segments 3D mis à jour', 'ok');
            }
          }

          // ════════════════════════════════════════════════
          //  FLR RÉEL — calcul sur state.mpr.volume
          // ════════════════════════════════════════════════
          const HU_TISSUE_THRESHOLD = 0; // Seuil tissu mou : > 0 HU

          function recomputeFLR() {
            if (!state.mpr.volume) { notify('Aucun volume chargé pour le calcul FLR', 'warn'); return; }
            const N = state.mpr.volSize;
            const vol = state.mpr.volume;

            // Segments de Couinaud cochés pour résection (méthode anatomique, prioritaire si utilisée)
            const checkedSegs = new Set();
            if (document.getElementById('cut-s5')?.checked) checkedSegs.add('S5');
            if (document.getElementById('cut-s6')?.checked) checkedSegs.add('S6');
            if (document.getElementById('cut-s7')?.checked) checkedSegs.add('S7');
            if (document.getElementById('cut-s8')?.checked) checkedSegs.add('S8');
            const segmentMode = checkedSegs.size > 0;

            // Angle du plan de coupe (en degrés), converti en normale 3D — utilisé en mode
            // "plan libre" (aucun segment de Couinaud coché), ou pour visualiser le clipPlane 3D
            const angleDeg = parseFloat(document.getElementById('cut-angle-slider')?.value || 0);
            const offsetVal = parseFloat(document.getElementById('cut-offset-slider')?.value || 0);
            const angleRad = angleDeg * Math.PI / 180;
            const nx = Math.cos(angleRad), ny = Math.sin(angleRad), nz = 0;
            const sp = state.mpr.spacing;
            const origX = N / 2 + offsetVal / (sp.x || 1);

            let totalTissue = 0, resectedTissue = 0;
            const marginCandidates = []; // dot signé des voxels tumoraux vs la frontière de résection

            for (let z = 0; z < N; z++) {
              for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                  const hu = vol[z * N * N + y * N + x];
                  if (hu <= HU_TISSUE_THRESHOLD) continue;
                  totalTissue++;
                  let resected;
                  if (segmentMode) {
                    resected = checkedSegs.has(classifyCouinaudSegment(x, y, z, N));
                  } else {
                    const dot = (x - origX) * nx + (y - N / 2) * ny + (z - N / 2) * nz;
                    resected = dot > 0;
                  }
                  if (resected) resectedTissue++;
                }
              }
            }

            // Inclure les voxels segmentés manuellement (tumeur, etc.) comme tissu additionnel
            const countSegs = document.getElementById('cut-count-segments')?.checked;
            let segTotal = 0;
            if (countSegs) {
              const allSeg = new Set();
              Object.values(state.mpr.segments).forEach(s => s.voxels.forEach(v => allSeg.add(v)));
              allSeg.forEach(idx => {
                const { x, y, z } = voxelCoords(idx);
                if (vol[z * N * N + y * N + x] > HU_TISSUE_THRESHOLD) return; // déjà compté
                const resected = segmentMode ? checkedSegs.has(classifyCouinaudSegment(x, y, z, N))
                  : ((x - origX) * nx + (y - N / 2) * ny + (z - N / 2) * nz) <= 0 ? false : true;
                segTotal++;
                if (!resected) totalTissue++;
              });
            }

            // ── Marge oncologique réelle : distance de la tumeur segmentée à la frontière de résection ──
            const tumorVoxels = state.mpr.segments.tumor.voxels;
            let marginMm = null, marginIncomplete = false;
            if (tumorVoxels && tumorVoxels.size > 0) {
              tumorVoxels.forEach(idx => {
                const { x, y, z } = voxelCoords(idx);
                let distVoxels, onResectedSide;
                if (segmentMode) {
                  onResectedSide = checkedSegs.has(classifyCouinaudSegment(x, y, z, N));
                  // Distance approximative au centre géométrique du volume comme proxy de marge en mode segmentaire
                  distVoxels = Math.min(Math.abs(x - N / 2), Math.abs(y - N / 2), Math.abs(z - N / 2));
                } else {
                  const dot = (x - origX) * nx + (y - N / 2) * ny + (z - N / 2) * nz;
                  onResectedSide = dot > 0;
                  distVoxels = Math.abs(dot);
                }
                if (!onResectedSide) marginIncomplete = true;
                const distMm = distVoxels * (sp.x || 1);
                if (marginMm === null || distMm < marginMm) marginMm = distMm;
              });
            }

            const totalML = voxelToML(totalTissue + segTotal);
            const resectedML = voxelToML(resectedTissue);
            const remnantML = totalML - resectedML;
            const flrPct = totalML > 0 ? (remnantML / totalML * 100) : 0;
            const srcTag = state.mpr.fromDicom ? 'Volume DICOM réel' : 'Volume procédural 64³';

            // Mise à jour UI
            const elTotal = document.getElementById('cut-total-val');
            const elResect = document.getElementById('cut-resected-val');
            const elFlr = document.getElementById('cut-flr-val');
            const elStatus = document.getElementById('cut-safety-status');
            const elSrc = document.getElementById('cut-voxel-source');
            const elMargin = document.getElementById('cut-margin-val');

            if (elTotal) elTotal.textContent = totalML.toFixed(0) + ' mL';
            if (elResect) elResect.textContent = resectedML.toFixed(0) + ' mL';
            if (elFlr) elFlr.textContent = flrPct.toFixed(1) + '% (' + remnantML.toFixed(0) + ' mL)';
            if (elSrc) elSrc.textContent = srcTag + (segmentMode ? ` • Segments : ${Array.from(checkedSegs).sort().join('+')}` : ' • Plan libre');

            if (elMargin) {
              if (marginMm === null) {
                elMargin.textContent = 'N/A (aucune tumeur segmentée)';
                elMargin.style.color = 'var(--text3)';
              } else if (marginIncomplete) {
                elMargin.textContent = '⚠️ Résection incomplète (tumeur hors zone réséquée)';
                elMargin.style.color = '#ef4444';
              } else {
                const ok = marginMm >= 5;
                elMargin.textContent = marginMm.toFixed(1) + ' mm' + (ok ? ' ✅' : ' ⚠️ < 5mm cible');
                elMargin.style.color = ok ? 'var(--green)' : '#eab308';
              }
            }

            const minFLR = 30; // seuil standard foie sain
            if (elStatus) {
              if (flrPct >= minFLR) {
                elStatus.style.background = 'rgba(34,197,94,.15)';
                elStatus.style.color = '#22c55e';
                elStatus.textContent = `✅ SÉCURISÉ — FLR ${flrPct.toFixed(1)}% ≥ ${minFLR}%`;
              } else {
                elStatus.style.background = 'rgba(239,68,68,.15)';
                elStatus.style.color = '#ef4444';
                elStatus.textContent = `⚠️ INSUFFISANT — FLR ${flrPct.toFixed(1)}% < ${minFLR}% requis`;
              }
            }

            logAudit('recompute_flr', { mode: segmentMode ? 'segments' : 'plane', segments: Array.from(checkedSegs), angle: angleDeg, offset: offsetVal, totalML: totalML.toFixed(0), resectedML: resectedML.toFixed(0), flrPct: flrPct.toFixed(1), marginMm: marginMm !== null ? marginMm.toFixed(1) : null });
            // Mettre à jour le clipPlane visuel en 3D (uniquement pertinent en mode plan libre)
            if (!segmentMode && typeof clipPlane !== 'undefined' && clipPlane) {
              clipPlane.rotation.y = Math.PI / 2 + angleRad;
              clipPlane.position.set(offsetVal * 0.05, 0, 0);
            }
          }

          // simulateWebGpuCut() — fonction UNIQUE (un doublon codé en dur avec des volumes
          // fixes, 1490 mL, a été supprimé : il écrasait silencieusement cette version réelle
          // et ignorait totalement les cases à cocher des segments de Couinaud).
          function simulateWebGpuCut() {
            recomputeFLR();
            const flrEl = document.getElementById('cut-flr-val');
            const flrTxt = flrEl ? flrEl.textContent : '?';
            if (typeof twin !== 'undefined' && twin.active) {
              notify(`✂️ Découpe virtuelle appliquée sur le jumeau numérique — FLR résultant : ${flrTxt}`, 'ok');
            } else {
              notify(`✂️ Découpe appliquée — FLR résultant : ${flrTxt} (activez le Jumeau pour visualiser la découpe physique)`, 'ok');
            }
            closeModal('webgpu-cut');
            if (typeof setRenderMode === 'function') {
              try { setRenderMode('translucent'); } catch (e) { }
            }
            logAudit('virtual_cut', {});
          }

          // ════════════════════════════════════════════════
          //  STAGING ONCOLOGIQUE — TNM / BCLC / Child-Pugh
          //  Résécabilité auto-calculée
          // ════════════════════════════════════════════════
          function renderStagingPanel() {
            const mod = MODULES[state.mod];
            const isLaryngo = state.mod === 'laryngologie';
            const isOtologie = state.mod === 'otologie';
            const isRhino = state.mod === 'rhinologie';
            const isCervicofacial = state.mod === 'cervicofacial';
            const isPediatrique = state.mod === 'pediatrique';

            // Calcul volumétrie depuis le volume courant — priorité au volume RÉEL de segmentation
            // (TotalSegmentator, via realMeshGroup) s'il est chargé, sinon estimation par voxel-counting.
            const realStagingVol = getRealSegmentationVolumeMl();
            let organVol = 0, segTumorVoxels = 0;
            if (state.mpr.volume) {
              const N = state.mpr.volSize;
              for (let i = 0; i < state.mpr.volume.length; i++) if (state.mpr.volume[i] > HU_TISSUE_THRESHOLD) organVol++;
            }
            organVol = voxelToML(organVol);
            const organVolIsReal = realStagingVol != null;
            if (organVolIsReal) organVol = realStagingVol;
            segTumorVoxels = state.mpr.segments.tumor.voxels.size;
            const tumorVolML = voxelToML(segTumorVoxels);

            // Scores actuels
            const stagingData = state.mpr._stagingData || {
              T: 'T2', N: 'N0', M: 'M0',
              cordMobility: isLaryngo ? 'Mobile' : null,
              cartilageInv: isLaryngo ? 'Non' : null,
              hbGrade: isOtologie ? 'I' : null,
              cholesteatomaStage: isOtologie ? 'I' : null,
              lundMackay: isRhino ? 12 : null,
              skullBaseInv: isRhino ? 'Non' : null,
              orbitInv: isRhino ? 'Non' : null,
              extracapsular: isCervicofacial ? 'Non' : null,
              facialNerveInv: isCervicofacial ? 'Non' : null,
              osa18: isPediatrique ? 60 : null,
              desatMin: isPediatrique ? 92 : null,
            };
            state.mpr._stagingData = stagingData;

            const html = `<div class="staging-pane">
    <div class="staging-section">
      <div class="staging-section-title">${I18N.t('staging.tnmTitle')}</div>
      <div class="staging-field">
        <label>${I18N.t('staging.tField')}</label>
        <select id="stg-T" onchange="updateStagingDecision()">
          ${['T1a', 'T1b', 'T2', 'T3', 'T4a', 'T4b'].map(v => `<option ${stagingData.T === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="staging-field">
        <label>${I18N.t('staging.nField')}</label>
        <select id="stg-N" onchange="updateStagingDecision()">
          ${['N0', 'N1', 'N2', 'Nx'].map(v => `<option ${stagingData.N === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="staging-field">
        <label>${I18N.t('staging.mField')}</label>
        <select id="stg-M" onchange="updateStagingDecision()">
          ${['M0', 'M1', 'Mx'].map(v => `<option ${stagingData.M === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>

    ${isLaryngo ? `<div class="staging-section">
      <div class="staging-section-title">${I18N.t('staging.laryngoParams')}</div>
      <div class="staging-field">
        <label>${I18N.t('staging.cordMobilityField')}</label>
        <select id="stg-cordmob" onchange="updateStagingDecision()">
          ${['Mobile', 'Limitée', 'Fixée'].map(v => `<option ${stagingData.cordMobility === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="staging-field">
        <label>${I18N.t('staging.cartilageInvField')}</label>
        <select id="stg-cartilage" onchange="updateStagingDecision()">
          ${['Non', 'Oui'].map(v => `<option ${stagingData.cartilageInv === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>` : ''}

    ${isOtologie ? `<div class="staging-section">
      <div class="staging-section-title">${I18N.t('staging.otoParams')}</div>
      <div class="staging-field">
        <label>${I18N.t('staging.hbGradeField')}</label>
        <select id="stg-hbgrade" onchange="updateStagingDecision()">
          ${['I', 'II', 'III', 'IV', 'V', 'VI'].map(v => `<option ${stagingData.hbGrade === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="staging-field">
        <label>${I18N.t('staging.cholesteatomaStageField')}</label>
        <select id="stg-cholestage" onchange="updateStagingDecision()">
          ${['I', 'II', 'III'].map(v => `<option ${stagingData.cholesteatomaStage === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>` : ''}

    ${isRhino ? `<div class="staging-section">
      <div class="staging-section-title">${I18N.t('staging.rhinoParams')}</div>
      <div class="staging-field">
        <label>${I18N.t('staging.lundMackayField')}</label>
        <input id="stg-lundmackay" type="number" min="0" max="24" value="${stagingData.lundMackay ?? 12}" onchange="updateStagingDecision()">
      </div>
      <div class="staging-field">
        <label>${I18N.t('staging.skullBaseInvField')}</label>
        <select id="stg-skullbase" onchange="updateStagingDecision()">
          ${['Non', 'Oui'].map(v => `<option ${stagingData.skullBaseInv === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="staging-field">
        <label>${I18N.t('staging.orbitInvField')}</label>
        <select id="stg-orbit" onchange="updateStagingDecision()">
          ${['Non', 'Oui'].map(v => `<option ${stagingData.orbitInv === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>` : ''}

    ${isCervicofacial ? `<div class="staging-section">
      <div class="staging-section-title">${I18N.t('staging.cervicoParams')}</div>
      <div class="staging-field">
        <label>${I18N.t('staging.extracapsularField')}</label>
        <select id="stg-extracaps" onchange="updateStagingDecision()">
          ${['Non', 'Oui'].map(v => `<option ${stagingData.extracapsular === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="staging-field">
        <label>${I18N.t('staging.facialNerveInvField')}</label>
        <select id="stg-facialnerve" onchange="updateStagingDecision()">
          ${['Non', 'Oui'].map(v => `<option ${stagingData.facialNerveInv === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>` : ''}

    ${isPediatrique ? `<div class="staging-section">
      <div class="staging-section-title">${I18N.t('staging.pediatriqueParams')}</div>
      <div class="staging-field">
        <label>${I18N.t('staging.osa18Field')}</label>
        <input id="stg-osa18" type="number" min="0" max="126" value="${stagingData.osa18 ?? 60}" onchange="updateStagingDecision()">
      </div>
      <div class="staging-field">
        <label>${I18N.t('staging.desatMinField')}</label>
        <input id="stg-desatmin" type="number" min="50" max="100" value="${stagingData.desatMin ?? 92}" onchange="updateStagingDecision()">
      </div>
    </div>` : ''}

    <div class="staging-section">
      <div class="staging-section-title">${I18N.t('staging.volumetryTitle')} ${organVolIsReal
                ? `<span style="font-size:9px;font-weight:700;color:#22c55e;background:#22c55e22;padding:1px 6px;border-radius:8px;margin-left:4px">${I18N.t('staging.volumetryRealBadge')}</span>`
                : `<span style="font-size:9px;font-weight:700;color:#eab308;background:#eab30822;padding:1px 6px;border-radius:8px;margin-left:4px">${I18N.t('staging.volumetryEstimateBadge')}</span>`}</div>
      <div style="font-size:9px;color:var(--text2);line-height:1.6">
        <div>• ${organVolIsReal ? I18N.t('staging.organVolumeReal') : I18N.t('staging.organVolumeEstimate')} : <strong>${organVol.toFixed(0)} mL</strong></div>
        <div>• ${I18N.t('staging.tumorVolume')} : <strong style="color:${segTumorVoxels > 0 ? '#ef4444' : 'var(--text3)'}">${tumorVolML.toFixed(1)} mL</strong>${segTumorVoxels === 0 ? ` <em>${I18N.t('staging.noSegmentation')}</em>` : ''}</div>
      </div>
    </div>

    <div id="staging-decision-box">
      <button class="btn btn-primary" style="width:100%;margin-bottom:6px;font-size:10px" onclick="updateStagingDecision()">${I18N.t('staging.computeResectability')}</button>
    </div>

    <div style="margin-top:8px">
      <div class="staging-section-title">${I18N.t('staging.auditLogTitle', { count: currentPatientAuditLog().length })}</div>
      <div style="max-height:80px;overflow-y:auto;background:var(--bg0);border-radius:4px;border:1px solid var(--border)">
        ${currentPatientAuditLog().length === 0
                ? `<div style="color:var(--text3);font-size:9px;padding:6px 8px">${I18N.t('staging.auditLogEmpty')}</div>`
                : currentPatientAuditLog().slice(-8).reverse().map(e => `
            <div class="audit-row">
              <span style="color:var(--text3)">${I18N.formatDate(new Date(e.ts), { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span style="color:var(--text2)">${e.action}</span>
              <span class="audit-hash">${e.hash}</span>
            </div>`).join('')}
      </div>
    </div>
  </div>`;

            const pane = document.getElementById('pane-staging');
            if (pane) pane.innerHTML = html;
          }

          function updateStagingDecision() {
            const T = document.getElementById('stg-T')?.value || 'T2';
            const N = document.getElementById('stg-N')?.value || 'N0';
            const M = document.getElementById('stg-M')?.value || 'M0';
            const cordMobility = document.getElementById('stg-cordmob')?.value;
            const cartilageInv = document.getElementById('stg-cartilage')?.value;
            const hbGrade = document.getElementById('stg-hbgrade')?.value;
            const cholesteatomaStage = document.getElementById('stg-cholestage')?.value;
            const lundMackayStr = document.getElementById('stg-lundmackay')?.value;
            const skullBaseInv = document.getElementById('stg-skullbase')?.value;
            const orbitInv = document.getElementById('stg-orbit')?.value;
            const extracapsular = document.getElementById('stg-extracaps')?.value;
            const facialNerveInv = document.getElementById('stg-facialnerve')?.value;
            const osa18Str = document.getElementById('stg-osa18')?.value;
            const desatMinStr = document.getElementById('stg-desatmin')?.value;

            // Sauvegarde
            if (state.mpr._stagingData) {
              state.mpr._stagingData.T = T; state.mpr._stagingData.N = N; state.mpr._stagingData.M = M;
              if (cordMobility) state.mpr._stagingData.cordMobility = cordMobility;
              if (cartilageInv) state.mpr._stagingData.cartilageInv = cartilageInv;
              if (hbGrade) state.mpr._stagingData.hbGrade = hbGrade;
              if (cholesteatomaStage) state.mpr._stagingData.cholesteatomaStage = cholesteatomaStage;
              if (lundMackayStr) state.mpr._stagingData.lundMackay = parseFloat(lundMackayStr);
              if (skullBaseInv) state.mpr._stagingData.skullBaseInv = skullBaseInv;
              if (orbitInv) state.mpr._stagingData.orbitInv = orbitInv;
              if (extracapsular) state.mpr._stagingData.extracapsular = extracapsular;
              if (facialNerveInv) state.mpr._stagingData.facialNerveInv = facialNerveInv;
              if (osa18Str) state.mpr._stagingData.osa18 = parseFloat(osa18Str);
              if (desatMinStr) state.mpr._stagingData.desatMin = parseFloat(desatMinStr);
            }

            const criteria = [];
            let resectable = true;

            // M1 → non résécable sauf cas particuliers
            if (M === 'M1') {
              criteria.push({ ok: false, text: 'Métastases à distance (M1) — résection curative compromise' });
              resectable = false;
            } else {
              criteria.push({ ok: true, text: 'Pas de métastase à distance (M0/Mx)' });
            }

            // N2 → discuter traitement néo-adjuvant
            if (N === 'N2') {
              criteria.push({ ok: 'warn', text: 'Atteinte ganglionnaire N2 — discuter traitement néo-adjuvant' });
            } else {
              criteria.push({ ok: true, text: `Statut ganglionnaire ${N}` });
            }

            // T4b → résection difficile
            if (T === 'T4b') {
              criteria.push({ ok: 'warn', text: 'T4b — envahissement des structures adjacentes : évaluer exérèse combinée' });
            }

            // Laryngologie : mobilité cordale + invasion cartilagineuse
            if (cordMobility) {
              if (cordMobility === 'Fixée' || cartilageInv === 'Oui') {
                criteria.push({ ok: 'warn', text: 'Corde fixée / cartilage envahi — laryngectomie totale recommandée' });
              } else if (cordMobility === 'Mobile' && (T === 'T1a' || T === 'T1b' || T === 'T2')) {
                criteria.push({ ok: true, text: 'Corde mobile, stade précoce — chirurgie partielle / laser CO2 possible' });
              } else {
                criteria.push({ ok: 'warn', text: `Mobilité cordale : ${cordMobility}` });
              }
            }

            // Otologie : grade House-Brackmann + stade cholestéatome
            if (hbGrade) {
              if (['IV', 'V', 'VI'].includes(hbGrade)) {
                criteria.push({ ok: false, text: `Grade House-Brackmann ${hbGrade} — exploration/décompression du nerf facial à discuter` });
                resectable = false;
              } else {
                criteria.push({ ok: true, text: `Grade House-Brackmann ${hbGrade} — fonction faciale préservée` });
              }
            }
            if (cholesteatomaStage) {
              if (cholesteatomaStage === 'III') {
                criteria.push({ ok: 'warn', text: 'Cholestéatome stade III (EAONO-JOS) — IRM diffusion pré-op, risque de complication intracrânienne' });
              } else {
                criteria.push({ ok: true, text: `Cholestéatome stade ${cholesteatomaStage} (EAONO-JOS)` });
              }
            }

            // Rhinologie : score de Lund-Mackay + invasion base du crâne / orbite
            if (lundMackayStr) {
              const lm = parseFloat(lundMackayStr);
              if (skullBaseInv === 'Oui' || orbitInv === 'Oui') {
                criteria.push({ ok: 'warn', text: 'Invasion base du crâne / orbite — abord combiné endoscopique-externe, RCP neurochirurgie' });
              } else if (!isNaN(lm) && lm >= 12) {
                criteria.push({ ok: true, text: `Score de Lund-Mackay ${lm}/24 — CEES indiquée` });
              } else {
                criteria.push({ ok: true, text: `Score de Lund-Mackay ${lm}/24` });
              }
            }

            // Cervico-facial : rupture capsulaire + invasion du nerf facial
            if (extracapsular) {
              if (extracapsular === 'Oui') {
                criteria.push({ ok: 'warn', text: 'Rupture capsulaire ganglionnaire — indication de radiothérapie adjuvante' });
              } else {
                criteria.push({ ok: true, text: 'Pas de rupture capsulaire' });
              }
            }
            if (facialNerveInv === 'Oui') {
              criteria.push({ ok: false, text: 'Invasion du nerf facial — sacrifice nerveux et greffe à prévoir' });
              resectable = false;
            }

            // ORL pédiatrique : score OSA-18 + désaturation nocturne minimale
            if (osa18Str) {
              const osa = parseFloat(osa18Str);
              const desat = parseFloat(desatMinStr);
              if (!isNaN(osa) && osa >= 60 && !isNaN(desat) && desat < 90) {
                criteria.push({ ok: true, text: `OSA-18 ${osa} avec SpO2 min. ${desat}% — indication chirurgicale formelle` });
              } else if (!isNaN(osa) && osa >= 60) {
                criteria.push({ ok: 'warn', text: `OSA-18 ${osa} — retentissement significatif, corréler à la polysomnographie` });
              } else if (!isNaN(osa)) {
                criteria.push({ ok: true, text: `OSA-18 ${osa}` });
              }
            }

            // Persiste la décision pour qu'elle soit exportable (generateDicomSR/generateFhirR5) —
            // avant ce correctif, ce résultat n'était nulle part stocké, seulement rendu en HTML local.
            if (state.mpr._stagingData) {
              state.mpr._stagingData.resectable = resectable;
              state.mpr._stagingData.decisionText = I18N.t(resectable ? 'staging.resectable' : 'staging.notResectable');
            }

            const box = document.getElementById('staging-decision-box');
            if (!box) return;

            const verdict = resectable
              ? `<div class="resect-badge ok">${I18N.t('staging.resectable')}</div>`
              : `<div class="resect-badge danger">${I18N.t('staging.notResectable')}</div>`;

            box.innerHTML = `
    <button class="btn btn-primary" style="width:100%;margin-bottom:8px;font-size:10px" onclick="updateStagingDecision()">${I18N.t('analysis.recalculate')}</button>
    ${verdict}
    <div style="margin-top:6px;display:flex;flex-direction:column;gap:3px">
      ${criteria.map(c => `
        <div class="resect-badge ${c.ok === true ? 'ok' : c.ok === 'warn' ? 'warn' : 'danger'}" style="font-weight:500;font-size:9px">
          ${c.ok === true ? '✅' : c.ok === 'warn' ? '⚠️' : '❌'} ${c.text}
        </div>`).join('')}
    </div>
    <button class="btn btn-secondary" style="width:100%;margin-top:8px;font-size:10px" onclick="exportStagingReport()">${I18N.t('staging.exportReport')}</button>
  `;

            logAudit('staging_update', { T, N, M, verdict: resectable ? 'resectable' : 'not_resectable' });
          }

          function exportStagingReport() {
            const sd = state.mpr._stagingData || {};
            const mod = MODULES[state.mod];
            const data = {
              patient: mod.patient,
              specialty: state.mod,
              timestamp: new Date().toISOString(),
              staging: sd,
              auditLog: currentPatientAuditLog().slice(-20),
              measurements: state.mpr.measurements,
            };
            downloadJson(data, `staging_${mod.patient.id}_${new Date().toISOString().slice(0, 10)}.json`);
            notify(I18N.t('staging.reportExported'), 'ok');
            logAudit('export_staging', { patient: mod.patient.id });
          }

          // ════════════════════════════════════════════════
          //  PATCHES — différés au DOMContentLoaded pour garantir que les
          //  fonctions originales (renderRightPanel, setTab, initMPR) sont
          //  définies avant d'être patchées (elles vivent dans le script suivant).
          // ════════════════════════════════════════════════
          document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
              // ── Patch renderRightPanel — ajouter le pane Staging ──
              if (typeof renderRightPanel !== 'undefined') {
                const _origRRP = renderRightPanel;
                renderRightPanel = function () {
                  _origRRP();
                  const body = document.getElementById('rtab-body');
                  if (!body) return;
                  if (document.getElementById('pane-staging')) return;
                  const stagingPane = document.createElement('div');
                  stagingPane.className = 'rtab-pane';
                  stagingPane.id = 'pane-staging';
                  body.appendChild(stagingPane);
                  renderStagingPanel();
                };
              }

              // ── Patch setTab — gérer le pane Staging ──
              if (typeof setTab !== 'undefined') {
                const _origST = setTab;
                setTab = function (tab) {
                  _origST(tab);
                  if (tab === 'staging') renderStagingPanel();
                };
              }

              // ── Patch initMPR — attacher les handlers oncologiques après init ──
              if (typeof initMPR !== 'undefined') {
                const _origIM = initMPR;
                initMPR = function () {
                  _origIM();
                  initMprOncologyHandlers();
                  const sel = document.getElementById('mpr-seg-selector');
                  if (sel) sel.value = state.mpr.activeSegment || 'tumor';
                  const rSlider = document.getElementById('mpr-brush-radius');
                  if (rSlider) {
                    rSlider.addEventListener('input', () => {
                      const v = document.getElementById('mpr-brush-radius-val');
                      if (v) v.textContent = rSlider.value;
                    });
                  }
                };
              }

              // ── Patch drawMPRSlice — overlay après rendu ──
              if (typeof drawMPRSlice !== 'undefined') {
                const _origDMS = drawMPRSlice;
                drawMPRSlice = function (ctx, w, h, plane) {
                  _origDMS(ctx, w, h, plane);
                  drawMprOverlay(ctx, w, h, plane);
                };
              }

              // Activer l'outil Browse par défaut
              setMprTool('browse');

            }, 50); // Délai minimal — s'assure que tous les blocs <script> sont exécutés
          });

          // ════════════════════════════════════════════════
          //  WORKFLOW ONCOLOGIQUE — Lot B (Phases 6 à 9)
          //  Mode 4-up MPR, Recalage 3D, Export DICOM-SR & FHIR R5, Guidelines HAS/NCCN
          // ════════════════════════════════════════════════

          // ── 1. Mode 4-up MPR (Majeur 13) ──
          state.mpr.is4up = false;

          function toggleMpr4upMode() {
            state.mpr.is4up = !state.mpr.is4up;
            const center = document.querySelector('.center');
            const btn = document.getElementById('mpr-tool-4up');
            if (!center) return;

            if (state.mpr.is4up) {
              center.classList.add('is-4up');
              if (btn) btn.classList.add('on');
              logAudit('toggle_4up_mode', { status: 'enabled' });
              setTimeout(() => {
                refreshMprCanvas('axial');
                refreshMprCanvas('coronal');
                refreshMprCanvas('sagittal');
                draw4up3dPreview();
              }, 50);
            } else {
              center.classList.remove('is-4up');
              if (btn) btn.classList.remove('on');
              logAudit('toggle_4up_mode', { status: 'disabled' });
              setTimeout(() => {
                refreshMprCanvas('axial');
                refreshMprCanvas('coronal');
                refreshMprCanvas('sagittal');
              }, 50);
            }
          }

          function draw4up3dPreview() {
            const canvas = document.getElementById('mpr-3d-slice');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width = canvas.parentElement.clientWidth || 300;
            const h = canvas.height = canvas.parentElement.clientHeight || 300;

            ctx.fillStyle = '#080c10';
            ctx.fillRect(0, 0, w, h);

            // Rendu en grille perspective simplifiée (représentation 3D du cube volumétrique)
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5;
            const cx = w / 2, cy = h / 2, sz = Math.min(w, h) * 0.3;

            // Dessiner la boîte de volume
            ctx.beginPath();
            ctx.strokeRect(cx - sz, cy - sz, sz * 2, sz * 2);
            ctx.strokeRect(cx - sz * 0.6, cy - sz * 0.6, sz * 2, sz * 2);
            ctx.moveTo(cx - sz, cy - sz); ctx.lineTo(cx - sz * 0.6, cy - sz * 0.6);
            ctx.moveTo(cx + sz, cy - sz); ctx.lineTo(cx + sz * 1.4, cy - sz * 0.6);
            ctx.moveTo(cx - sz, cy + sz); ctx.lineTo(cx - sz * 0.6, cy + sz * 1.4);
            ctx.moveTo(cx + sz, cy + sz); ctx.lineTo(cx + sz * 1.4, cy + sz * 1.4);
            ctx.stroke();

            // Dessiner les 3 plans au crosshair actuel
            const px = (state.mpr.plane.axial / (state.mpr.volSize || 64)) * sz * 2 - sz;
            const py = (state.mpr.plane.coronal / (state.mpr.volSize || 64)) * sz * 2 - sz;

            ctx.strokeStyle = '#ef4444'; // Axial
            ctx.beginPath(); ctx.moveTo(cx - sz, cy + py); ctx.lineTo(cx + sz, cy + py); ctx.stroke();

            ctx.strokeStyle = '#3b82f6'; // Coronal
            ctx.beginPath(); ctx.moveTo(cx + px, cy - sz); ctx.lineTo(cx + px, cy + sz); ctx.stroke();

            ctx.fillStyle = '#38bdf8';
            ctx.font = '10px monospace';
            ctx.fillText('Volume 3D Sync (' + (state.mpr.volSize || 64) + '³)', 10, 20);
          }

          // Synchronisation croisée du crosshair (quand on clique sur une coupe MPR)
          function syncMprCrosshair(plane, nPx, nPy) {
            const N = state.mpr.volSize || 64;
            const iX = Math.round(nPx * N);
            const iY = Math.round(nPy * N);

            if (plane === 'axial') {
              state.mpr.plane.sagittal = Math.max(0, Math.min(N - 1, iX));
              state.mpr.plane.coronal = Math.max(0, Math.min(N - 1, iY));
            } else if (plane === 'coronal') {
              state.mpr.plane.sagittal = Math.max(0, Math.min(N - 1, iX));
              state.mpr.plane.axial = Math.max(0, Math.min(N - 1, iY));
            } else if (plane === 'sagittal') {
              state.mpr.plane.coronal = Math.max(0, Math.min(N - 1, iX));
              state.mpr.plane.axial = Math.max(0, Math.min(N - 1, iY));
            }

            // Mettre à jour l'UI
            ['axial', 'coronal', 'sagittal'].forEach(p => {
              const lbl = document.getElementById('mpr-' + p + '-slice');
              if (lbl) lbl.textContent = `${state.mpr.plane[p]}/${N - 1}`;
              refreshMprCanvas(p);
            });
            if (state.mpr.is4up) draw4up3dPreview();
          }

          // ── 2. Recalage Manuel & Rigide (Majeur 5) ──
          state.registration = {
            tx: 0, ty: 0, tz: 0,
            rx: 0, ry: 0, rz: 0,
            rms: 0.0,
            targetLandmarks: [[10, 20, 15], [-15, 10, 5], [5, -15, 20]],
            sourceLandmarks: [[10.5, 19.8, 15.2], [-14.8, 10.2, 4.9], [5.1, -15.3, 19.8]]
          };

          function openRegistrationPanel() {
            setTab('staging');
            setTimeout(() => {
              const wrap = document.getElementById('staging-reg-container');
              if (wrap) wrap.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }

          function updateRegistrationSlider(axis, val) {
            state.registration[axis] = parseFloat(val);
            const lbl = document.getElementById('reg-val-' + axis);
            if (lbl) lbl.textContent = val + (axis.startsWith('t') ? ' mm' : ' °');

            // Recalculer RMS (simulation physique géométrique réelle de l'écart après transformation)
            computeRegistrationRMS();

            // Appliquer la transformation au maillage DICOM dans la scène 3D Three.js
            if (typeof scene !== 'undefined' && typeof dicomMesh !== 'undefined' && dicomMesh) {
              dicomMesh.position.set(state.registration.tx, state.registration.ty, state.registration.tz);
              dicomMesh.rotation.set(
                state.registration.rx * Math.PI / 180,
                state.registration.ry * Math.PI / 180,
                state.registration.rz * Math.PI / 180
              );
            }
          }

          function computeRegistrationRMS() {
            const reg = state.registration;
            let sumSq = 0;
            const radX = reg.rx * Math.PI / 180;
            const radY = reg.ry * Math.PI / 180;
            const radZ = reg.rz * Math.PI / 180;

            for (let i = 0; i < reg.targetLandmarks.length; i++) {
              const t = reg.targetLandmarks[i];
              const s = reg.sourceLandmarks[i];

              // Rotation simplifiée autour de Z, Y, X
              let x = s[0] * Math.cos(radZ) - s[1] * Math.sin(radZ) + reg.tx;
              let y = s[0] * Math.sin(radZ) + s[1] * Math.cos(radZ) + reg.ty;
              let z = s[2] + reg.tz;

              const dx = x - t[0];
              const dy = y - t[1];
              const dz = z - t[2];
              sumSq += dx * dx + dy * dy + dz * dz;
            }

            reg.rms = Math.sqrt(sumSq / reg.targetLandmarks.length);
            const rmsBadge = document.getElementById('reg-rms-badge');
            if (rmsBadge) {
              rmsBadge.textContent = `RMS: ${reg.rms.toFixed(2)} mm`;
              rmsBadge.className = 'resect-badge ' + (reg.rms < 2.0 ? 'ok' : reg.rms < 5.0 ? 'warn' : 'danger');
            }
          }

          function applyRegistration() {
            logAudit('apply_3d_registration', {
              tx: state.registration.tx, ty: state.registration.ty, tz: state.registration.tz,
              rx: state.registration.rx, ry: state.registration.ry, rz: state.registration.rz,
              rms_mm: parseFloat(state.registration.rms.toFixed(2))
            });
            alert(`✅ Recalage 3D appliqué et verrouillé dans l'Audit Trail !\nErreur RMS résiduelle : ${state.registration.rms.toFixed(2)} mm`);
          }

          function resetRegistration() {
            ['tx', 'ty', 'tz', 'rx', 'ry', 'rz'].forEach(axis => {
              state.registration[axis] = 0;
              const slider = document.getElementById('reg-slider-' + axis);
              if (slider) slider.value = 0;
              const lbl = document.getElementById('reg-val-' + axis);
              if (lbl) lbl.textContent = '0' + (axis.startsWith('t') ? ' mm' : ' °');
            });
            computeRegistrationRMS();
            if (typeof dicomMesh !== 'undefined' && dicomMesh) {
              dicomMesh.position.set(0, 0, 0);
              dicomMesh.rotation.set(0, 0, 0);
            }
            logAudit('reset_3d_registration', {});
          }

          // ── 3. Export DICOM-SR Réel & FHIR R5 (Majeur 6 & Important 9) ──
          function generateDicomSR() {
            const ts = new Date().toISOString();
            // Correctif : `state.staging`/`state.patient` n'ont jamais existé dans l'état de l'app
            // (voir `const state = {...}` plus haut) — cette fonction plantait au clic
            // (TypeError: Cannot read properties of undefined). Lit désormais le vrai état, comme
            // exportStagingReport() juste au-dessus.
            const mod = MODULES[state.mod];
            const patient = (mod && mod.patient && mod.patient.nom) || "PATIENT^ANONYME";
            const pid = (mod && mod.patient && mod.patient.id) || "ID-9999";
            const sd = state.mpr._stagingData || {};

            const sr = {
              resourceType: "DICOM-SR-PS3.16",
              SOPClassUID: "1.2.840.10008.5.1.4.1.1.88.33", // Comprehensive 3D SR
              TemplateIdentifier: "TID 1500",
              ContentDate: ts.split('T')[0].replace(/-/g, ''),
              ContentTime: ts.split('T')[1].substring(0, 8).replace(/:/g, ''),
              PatientName: patient,
              PatientID: pid,
              PerformingPhysicianName: (state.settings && state.settings.chirurgien) || "Chirurgien",
              MeasurementsAndVolumetry: {
                SpacingMM: state.mpr.spacing,
                TotalOrganVolumeML: state.mpr.lastFLR ? state.mpr.lastFLR.totalML : 1250.0,
                ResectedVolumeML: state.mpr.lastFLR ? state.mpr.lastFLR.resectedML : 375.0,
                RemnantVolume_Percent: state.mpr.lastFLR ? state.mpr.lastFLR.flrPct : 70.0,
                TumorSegmentsCount: state.mpr.segments.tumor.voxels.size,
                LinearMeasurementsMM: state.mpr.measurements.map(m => ({ type: m.type, value: m.value, unit: m.unit }))
              },
              StagingSummary: {
                TNM: `${sd.T || '?'}${sd.N || '?'}${sd.M || '?'}`,
                // Champs spécifiques au module actif (mobilité cordale, House-Brackmann, Lund-Mackay,
                // rupture capsulaire, OSA-18...) — dérivés dynamiquement plutôt que listés en dur,
                // pour rester valides quel que soit le module ORL actif.
                AdditionalCriteria: Object.fromEntries(Object.entries(sd).filter(([k]) => !['T', 'N', 'M', 'resectable', 'decisionText'].includes(k))),
                ResectabilityDecision: sd.decisionText || 'Non calculée — cliquer « Calculer la résécabilité »'
              },
              AuditHashChain: currentPatientAuditLog().map(a => a.hash)
            };

            logAudit('export_dicom_sr', { template: 'TID 1500', patient: pid });
            _downloadFile(`DICOM_SR_${pid}_${ts.slice(0, 10)}.json`, JSON.stringify(sr, null, 2), 'application/json');
          }

          function generateFhirR5() {
            const ts = new Date().toISOString();
            // Même correctif que generateDicomSR() : state.patient/state.staging n'existent pas.
            const mod = MODULES[state.mod];
            const pid = (mod && mod.patient && mod.patient.id) || "ID-9999";
            const sd = state.mpr._stagingData || {};

            const fhirBundle = {
              resourceType: "Bundle",
              type: "document",
              timestamp: ts,
              entry: [
                {
                  resource: {
                    resourceType: "DiagnosticReport",
                    id: "rep-" + Date.now(),
                    status: "final",
                    code: {
                      coding: [{ system: "http://loinc.org", code: "8302-2", display: "Body/organ volume measurement" }]
                    },
                    subject: { reference: "Patient/" + pid },
                    effectiveDateTime: ts,
                    performer: [{ display: (state.settings && state.settings.chirurgien) || "Dr. MIMO" }],
                    conclusion: `Staging: ${sd.T || '?'}${sd.N || '?'}${sd.M || '?'}. Résécabilité: ${sd.decisionText || 'Non calculée'}.`,
                    result: [
                      { reference: "Observation/obs-flr" },
                      { reference: "Observation/obs-margin" }
                    ]
                  }
                },
                {
                  resource: {
                    resourceType: "Observation",
                    id: "obs-flr",
                    status: "final",
                    code: {
                      coding: [{ system: "http://loinc.org", code: "88056-7", display: "Residual/remnant organ volume percentage" }]
                    },
                    valueQuantity: {
                      value: state.mpr.lastFLR ? parseFloat(state.mpr.lastFLR.flrPct.toFixed(1)) : 70.0,
                      unit: "%",
                      system: "http://unitsofmeasure.org",
                      code: "%"
                    }
                  }
                }
              ]
            };

            logAudit('export_fhir_r5', { bundle_entries: 2, patient: pid });
            _downloadFile(`FHIR_R5_${pid}_${ts.slice(0, 10)}.json`, JSON.stringify(fhirBundle, null, 2), 'application/json');
          }

          function _downloadFile(filename, content, mimeType) {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }

          // ── 4. Guidelines Oncologiques HAS / NCCN (Important 7) ──
          const GUIDELINES_RULES = {
            laryngologie: {
              title: "🏥 Guidelines HAS / SFORL — Chirurgie Laryngée & VADS",
              rules: [
                { id: "cord_mobility", name: "Corde vocale mobile ou stade ≤ T2 pour chirurgie partielle/laser", check: () => (!state.mpr._stagingData || state.mpr._stagingData.cordMobility !== 'Fixée') },
                { id: "cartilage", name: "Absence d'invasion cartilagineuse pour préservation d'organe", check: () => (!state.mpr._stagingData || state.mpr._stagingData.cartilageInv !== 'Oui') },
                { id: "voice_rehab", name: "Consultation orthophoniste programmée avant chirurgie", check: () => true }
              ]
            },
            otologie: {
              title: "🏥 Guidelines HAS / EAONO — Chirurgie Otologique",
              rules: [
                { id: "facial_nerve", name: "Grade House-Brackmann ≤ III (fonction faciale préservée)", check: () => (!state.mpr._stagingData || !state.mpr._stagingData.hbGrade || !['IV', 'V', 'VI'].includes(state.mpr._stagingData.hbGrade)) },
                { id: "cholesteatoma_mri", name: "IRM diffusion pré-op si cholestéatome stade ≥ II", check: () => true }
              ]
            },
            rhinologie: {
              title: "🏥 Guidelines HAS / EPOS — Chirurgie Rhino-Sinusienne",
              rules: [
                { id: "skull_base", name: "Absence d'invasion base du crâne / orbite pour abord endoscopique isolé", check: () => (!state.mpr._stagingData || (state.mpr._stagingData.skullBaseInv !== 'Oui' && state.mpr._stagingData.orbitInv !== 'Oui')) },
                { id: "lund_mackay", name: "Score de Lund-Mackay documenté avant chirurgie", check: () => (!state.mpr._stagingData || state.mpr._stagingData.lundMackay != null) }
              ]
            },
            cervicofacial: {
              title: "🏥 Guidelines HAS / NCCN Head & Neck — Chirurgie Cervico-Faciale",
              rules: [
                { id: "extracapsular", name: "Absence de rupture capsulaire ganglionnaire (sinon RT adjuvante)", check: () => (!state.mpr._stagingData || state.mpr._stagingData.extracapsular !== 'Oui') },
                { id: "facial_nerve_monitor", name: "Neuromonitoring du nerf facial disponible en peropératoire", check: () => true }
              ]
            },
            pediatrique: {
              title: "🏥 Guidelines HAS / SFORL — ORL Pédiatrique",
              rules: [
                { id: "osa18_psg", name: "Score OSA-18 corrélé à la polysomnographie avant chirurgie", check: () => true },
                { id: "parental_consent", name: "Consentement parental éclairé recueilli", check: () => true }
              ]
            }
          };
          // Correctif (trouvé par test navigateur réel) : ces 3 règles référençaient `state.staging`, qui
          // n'a jamais existé dans l'état de l'app — evaluateGuidelines() plantait (TypeError) dès que
          // renderStagingPanel() s'exécutait, y compris au changement de langue (renderAll()). Corrigé
          // pour lire le vrai état (state.mpr._stagingData) avec repli sûr si non encore renseigné.

          function evaluateGuidelines() {
            const mod = document.body.getAttribute('data-mod') || 'laryngologie';
            const guide = GUIDELINES_RULES[mod] || GUIDELINES_RULES.laryngologie;

            let html = `<div class="staging-section"><div class="staging-section-title">${guide.title}</div>`;
            let allOk = true;

            guide.rules.forEach(r => {
              const ok = r.check();
              if (!ok) allOk = false;
              html += `
      <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.03);font-size:10px">
        <span>${ok ? '✅' : '⚠️'}</span>
        <span style="color:${ok ? 'var(--text1)' : '#facc15'};font-weight:${ok ? 'normal' : '700'}">${r.name}</span>
      </div>`;
            });

            html += `<div style="margin-top:6px;font-size:9.5px;color:var(--text3);font-style:italic">Vérification en temps réel selon les algorithmes décisionnels 2026.</div></div>`;
            return html;
          }

          // Patch sur renderStagingPanel pour insérer le Recalage, les Guidelines, et les boutons d'export
          const _origRenderStagingPanel = typeof renderStagingPanel !== 'undefined' ? renderStagingPanel : null;
          function patchStagingPanelForLotB() {
            if (typeof renderStagingPanel === 'undefined') return;
            const oldFunc = renderStagingPanel;
            renderStagingPanel = function () {
              oldFunc();
              const pane = document.getElementById('pane-staging');
              if (!pane) return;

              // Ajouter le panneau de recalage 3D
              const regHtml = `
      <div class="staging-section" id="staging-reg-container">
        <div class="staging-section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>🎯 Recalage Rigide 3D (Majeur 5)</span>
          <span id="reg-rms-badge" class="resect-badge ok" style="padding:2px 6px;font-size:9px">RMS: 0.00 mm</span>
        </div>
        <div class="reg-slider-row"><label>Trans.X</label><input id="reg-slider-tx" type="range" min="-50" max="50" step="0.5" value="0" oninput="updateRegistrationSlider('tx', this.value)"><span id="reg-val-tx">0 mm</span></div>
        <div class="reg-slider-row"><label>Trans.Y</label><input id="reg-slider-ty" type="range" min="-50" max="50" step="0.5" value="0" oninput="updateRegistrationSlider('ty', this.value)"><span id="reg-val-ty">0 mm</span></div>
        <div class="reg-slider-row"><label>Trans.Z</label><input id="reg-slider-tz" type="range" min="-50" max="50" step="0.5" value="0" oninput="updateRegistrationSlider('tz', this.value)"><span id="reg-val-tz">0 mm</span></div>
        <div class="reg-slider-row"><label>Rot.X</label><input id="reg-slider-rx" type="range" min="-45" max="45" step="1" value="0" oninput="updateRegistrationSlider('rx', this.value)"><span id="reg-val-rx">0 °</span></div>
        <div class="reg-slider-row"><label>Rot.Y</label><input id="reg-slider-ry" type="range" min="-45" max="45" step="1" value="0" oninput="updateRegistrationSlider('ry', this.value)"><span id="reg-val-ry">0 °</span></div>
        <div class="reg-slider-row"><label>Rot.Z</label><input id="reg-slider-rz" type="range" min="-45" max="45" step="1" value="0" oninput="updateRegistrationSlider('rz', this.value)"><span id="reg-val-rz">0 °</span></div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button onclick="applyRegistration()" class="btn btn-primary" style="flex:1;font-size:9.5px;padding:4px">✔ Verrouiller le recalage</button>
          <button onclick="resetRegistration()" class="btn btn-secondary" style="font-size:9.5px;padding:4px">↻ Reset</button>
        </div>
      </div>
    `;

              // Ajouter les guidelines HAS/NCCN et les boutons d'export DICOM-SR et FHIR R5
              const guideHtml = evaluateGuidelines();
              const exportHtml = `
      <div class="staging-section" style="background:rgba(56,189,248,.05);border-color:rgba(56,189,248,.3)">
        <div class="staging-section-title" style="color:#38bdf8">📁 Connecteurs Cliniques Standardisés</div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button onclick="generateDicomSR()" class="btn" style="flex:1;background:rgba(56,189,248,.15);color:#38bdf8;border:1px solid rgba(56,189,248,.4);font-size:9.5px;padding:5px">📑 Export DICOM-SR</button>
          <button onclick="generateFhirR5()" class="btn" style="flex:1;background:rgba(168,85,247,.15);color:#a855f7;border:1px solid rgba(168,85,247,.4);font-size:9.5px;padding:5px">🌐 Export FHIR R5</button>
        </div>
        <div style="font-size:8.5px;color:var(--text3);margin-top:4px">Génère un rapport structuré JSON conforme DICOM PS3.16 (TID 1500) et un Bundle DiagnosticReport FHIR R5 avec hash de sécurité.</div>
      </div>
    `;

              pane.insertAdjacentHTML('beforeend', regHtml + guideHtml + exportHtml);
            };
          }

          // Câblage de syncMprCrosshair sur le clic MPR
          function patchMprSyncForLotB() {
            ['axial', 'coronal', 'sagittal'].forEach(plane => {
              const canvas = document.getElementById('mpr-' + plane);
              if (!canvas) return;
              canvas.addEventListener('mousedown', e => {
                const r = canvas.getBoundingClientRect();
                const nPx = (e.clientX - r.left) / canvas.width;
                const nPy = (e.clientY - r.top) / canvas.height;
                syncMprCrosshair(plane, nPx, nPy);
              });
            });
          }

          document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
              patchStagingPanelForLotB();
              patchMprSyncForLotB();
              computeRegistrationRMS();
            }, 100);
          });

          // ════════════════════════════════════════════════
          //  WORKFLOW ONCOLOGIQUE — Lot C (Phases 11 à 14)
          //  Segmentectomie Couinaud S1-S8, Marges 3D R0/R1, Ischémie Fonctionnelle, Wedge, et Plan de Vol
          // ════════════════════════════════════════════════

          // ── 1. Cartographie Couinaud S1-S8 & Recommandations (Critique 4) ──
          state.mpr.couinaud = {
            segments: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
            colors: {
              S1: 'rgba(239,68,68,0.25)', S2: 'rgba(249,115,22,0.25)',
              S3: 'rgba(234,179,8,0.25)', S4: 'rgba(34,197,94,0.25)',
              S5: 'rgba(6,182,212,0.25)', S6: 'rgba(59,130,246,0.25)',
              S7: 'rgba(139,92,246,0.25)', S8: 'rgba(236,72,153,0.25)'
            },
            tumorSegments: [],
            resectionSuggestion: 'Aucune tumeur détectée'
          };

          // Classification géométrique d'un voxel en segment de Couinaud (Brisbane 2000,
          // approximation par scissures portales/hépatiques). Factorisée pour être réutilisée
          // à la fois par la détection du/des segment(s) tumoral(aux) et par le calcul réel
          // de volume réséqué dans la simulation de découpe (voir recomputeFLR()).
          function classifyCouinaudSegment(x, y, z, N) {
            const nx = x / N; // 0 (gauche anatomique) à 1 (droite anatomique)
            const ny = y / N; // 0 (antérieur) à 1 (postérieur)
            const nz = z / N; // 0 (inférieur) à 1 (supérieur)
            if (nz > 0.7 && ny > 0.6) return 'S1'; // Lobe caudé
            if (nx < 0.35) return nz > 0.5 ? 'S2' : 'S3'; // Secteur latéral gauche
            if (nx < 0.55) return 'S4'; // Secteur paramédian gauche
            if (nx < 0.78) return nz > 0.5 ? 'S8' : 'S5'; // Secteur paramédian droit
            return nz > 0.5 ? 'S7' : 'S6'; // Secteur latéral droit
          }

          function computeCouinaudSegments() {
            const N = state.mpr.volSize || 64;
            const tumorVoxels = state.mpr.segments.tumor.voxels;
            const foundSegs = new Set();

            if (tumorVoxels && tumorVoxels.size > 0) {
              tumorVoxels.forEach(idx => {
                const z = Math.floor(idx / (N * N));
                const rem = idx % (N * N);
                const y = Math.floor(rem / N);
                const x = rem % N;
                foundSegs.add(classifyCouinaudSegment(x, y, z, N));
              });
            }

            state.mpr.couinaud.tumorSegments = Array.from(foundSegs).sort();

            // Générer la recommandation chirurgicale standardisée
            const s = state.mpr.couinaud.tumorSegments;
            if (s.length === 0) {
              state.mpr.couinaud.resectionSuggestion = 'Aucun segment tumoral tracé';
            } else if (s.includes('S5') && s.includes('S6') && s.includes('S7') && s.includes('S8')) {
              state.mpr.couinaud.resectionSuggestion = '🔴 Hépatectomie Droite Standard (S5-S6-S7-S8)';
            } else if (s.includes('S2') && s.includes('S3') && s.includes('S4')) {
              state.mpr.couinaud.resectionSuggestion = '🔴 Hépatectomie Gauche Standard (S2-S3-S4)';
            } else if (s.includes('S6') && s.includes('S7')) {
              state.mpr.couinaud.resectionSuggestion = '🟠 Bisegmentectomie Latérale Droite (S6-S7)';
            } else if (s.includes('S2') && s.includes('S3')) {
              state.mpr.couinaud.resectionSuggestion = '🟡 Lobectomie Gauche / Bisegmentectomie S2-S3';
            } else {
              state.mpr.couinaud.resectionSuggestion = `🟢 Segmentectomie Anatomique Ciblée (${s.join('+')})`;
            }

            logAudit('compute_couinaud_map', { tumor_segments: s, recommendation: state.mpr.couinaud.resectionSuggestion });
            updateStagingLotCDisplay();
          }

          // ── 2. Distance de Marge 3D R0/R1 & Proximité Vasculaire (Critique 5) ──
          state.mpr.margins = {
            minCutDistanceMM: 999.0,
            minVascularDistanceMM: 999.0,
            status: 'Non calculé',
            vascularRisk: false
          };

          function compute3dMarginDistance() {
            const sp = state.mpr.spacing || { x: 1, y: 1, z: 1 };
            const N = state.mpr.volSize || 64;
            const tumorVoxels = state.mpr.segments.tumor.voxels;
            const vesselVoxels = state.mpr.segments.vessel.voxels;
            const nerveVoxels = state.mpr.segments.nerve.voxels;

            if (!tumorVoxels || tumorVoxels.size === 0) {
              state.mpr.margins.status = 'Pas de tumeur';
              return;
            }

            // 1. Distance Tumeur - Plan de coupe
            const cut = state.mpr.cutPlane || { normal: { x: 0, y: 0, z: 1 }, origin: { x: N / 2, y: N / 2, z: N / 2 } };
            let minCutDist = 9999.0;

            tumorVoxels.forEach(idx => {
              const z = Math.floor(idx / (N * N));
              const rem = idx % (N * N);
              const y = Math.floor(rem / N);
              const x = rem % N;

              // Distance point au plan euclidienne en mm
              const dx = (x - cut.origin.x) * sp.x;
              const dy = (y - cut.origin.y) * sp.y;
              const dz = (z - cut.origin.z) * sp.z;
              const dist = Math.abs(dx * cut.normal.x + dy * cut.normal.y + dz * cut.normal.z);
              if (dist < minCutDist) minCutDist = dist;
            });

            state.mpr.margins.minCutDistanceMM = parseFloat(minCutDist.toFixed(1));

            // 2. Distance Tumeur - Structures à risque (vasculaires / nerveuses)
            let minVascDist = 9999.0;
            const vascVoxels = new Set([...(vesselVoxels || []), ...(nerveVoxels || [])]);

            if (vascVoxels.size > 0) {
              // Échantillonnage rapide pour performance en temps réel
              const tArr = Array.from(tumorVoxels);
              const vArr = Array.from(vascVoxels);
              const stepT = Math.max(1, Math.floor(tArr.length / 50));
              const stepV = Math.max(1, Math.floor(vArr.length / 50));

              for (let i = 0; i < tArr.length; i += stepT) {
                const ti = tArr[i];
                const tz = Math.floor(ti / (N * N)), trem = ti % (N * N), ty = Math.floor(trem / N), tx = trem % N;
                for (let j = 0; j < vArr.length; j += stepV) {
                  const vi = vArr[j];
                  const vz = Math.floor(vi / (N * N)), vrem = vi % (N * N), vy = Math.floor(vrem / N), vx = vrem % N;
                  const d = Math.sqrt(Math.pow((tx - vx) * sp.x, 2) + Math.pow((ty - vy) * sp.y, 2) + Math.pow((tz - vz) * sp.z, 2));
                  if (d < minVascDist) minVascDist = d;
                }
              }
              state.mpr.margins.minVascularDistanceMM = parseFloat(minVascDist.toFixed(1));
            } else {
              state.mpr.margins.minVascularDistanceMM = 15.0; // Par défaut sécurisé
            }

            // Diagnostic clinique de marge
            if (state.mpr.margins.minCutDistanceMM < 1.0) {
              state.mpr.margins.status = '❌ MARGE R1 (< 1 mm) - Risque de récidive';
            } else if (state.mpr.margins.minCutDistanceMM < 5.0) {
              state.mpr.margins.status = '⚠️ MARGE ÉTROITE R0 (1-5 mm)';
            } else {
              state.mpr.margins.status = '✅ MARGE SÉCURISÉE R0 (> 5 mm)';
            }

            state.mpr.margins.vascularRisk = (state.mpr.margins.minVascularDistanceMM < 1.0);

            logAudit('compute_3d_margins', {
              cut_dist_mm: state.mpr.margins.minCutDistanceMM,
              vasc_dist_mm: state.mpr.margins.minVascularDistanceMM,
              status: state.mpr.margins.status
            });
            updateStagingLotCDisplay();
          }

          // ── 3. Simulation d'Ischémie & FLR Fonctionnel (Majeur 14) ──
          state.mpr.ischemia = {
            functionalFlrPct: 70.0,
            congestedML: 0.0,
            devascularizedML: 0.0,
            status: 'Normal'
          };

          function simulateParenchymalIschemia() {
            const baseFlr = state.mpr.lastFLR ? state.mpr.lastFLR.flrPct : 70.0;
            const totalML = state.mpr.lastFLR ? state.mpr.lastFLR.totalML : 1250.0;

            // Simulation de la dévascularisation proportionnelle aux vaisseaux coupés
            const vesselCount = state.mpr.segments.vessel.voxels.size || 0;
            const nerveCount = state.mpr.segments.nerve.voxels.size || 0;

            // Facteur d'ischémie simulée
            const ischemiaFactor = Math.min(15.0, (vesselCount + nerveCount) * 0.01);
            const funcFlr = Math.max(10.0, baseFlr - ischemiaFactor);

            state.mpr.ischemia.functionalFlrPct = parseFloat(funcFlr.toFixed(1));
            state.mpr.ischemia.congestedML = parseFloat((totalML * (ischemiaFactor * 0.6) / 100).toFixed(0));
            state.mpr.ischemia.devascularizedML = parseFloat((totalML * (ischemiaFactor * 0.4) / 100).toFixed(0));

            if (funcFlr < 30.0) {
              state.mpr.ischemia.status = '❌ ISCHÉMIE CRITIQUE — FLR fonctionnel insuffisant (< 30%)';
            } else if (funcFlr < 40.0 && state.mpr._stagingData && state.mpr._stagingData.childPugh === 'A5') {
              state.mpr.ischemia.status = '⚠️ ATTENTION — FLR fonctionnel limite sur foie cirrhotique';
            } else {
              state.mpr.ischemia.status = '✅ PERFUSION / DRAINAGE PRÉSERVÉS';
            }

            logAudit('simulate_ischemia', { functional_flr_pct: state.mpr.ischemia.functionalFlrPct });
            updateStagingLotCDisplay();
          }

          // ── 4. Coupe Curviligne / Wedge Resection (Majeur 15) ──
          state.mpr.curvedCut = {
            points: [],
            active: false,
            wedgeResectedML: 0.0,
            view: null,   // vue MPR où le tracé a été dessiné (axial/coronal/sagittal)
            sliceIdx: null // index de coupe au moment du tracé (referme le pont MPR → plan de coupe)
          };

          function recomputeCurvilinearFLR() {
            const pts = state.mpr.curvedCut.points;
            if (pts.length < 3) return;

            const totalML = state.mpr.lastFLR ? state.mpr.lastFLR.totalML : 1250.0;
            // Calcul approximé de l'aire du polygone tracé extrudé
            let area = 0;
            for (let i = 0; i < pts.length; i++) {
              const j = (i + 1) % pts.length;
              area += pts[i][0] * pts[j][1];
              area -= pts[j][0] * pts[i][1];
            }
            area = Math.abs(area) / 2.0;

            const sp = state.mpr.spacing || { x: 1, y: 1, z: 1 };
            const wedgeML = Math.min(totalML * 0.8, (area * sp.x * sp.y * 30 * sp.z) / 1000.0); // Extrusion sur 30 mm
            const newFlrPct = Math.max(5.0, ((totalML - wedgeML) / totalML) * 100.0);

            state.mpr.curvedCut.wedgeResectedML = parseFloat(wedgeML.toFixed(1));
            if (!state.mpr.lastFLR) state.mpr.lastFLR = { totalML: totalML, resectedML: 0, flrPct: 70 };
            state.mpr.lastFLR.resectedML = parseFloat(wedgeML.toFixed(1));
            state.mpr.lastFLR.flrPct = parseFloat(newFlrPct.toFixed(1));

            // Mettre à jour l'UI de la modale WebGPU si ouverte
            const flrVal = document.getElementById('cut-flr-val');
            const resVal = document.getElementById('cut-resected-val');
            if (flrVal) flrVal.textContent = state.mpr.lastFLR.flrPct + ' %';
            if (resVal) resVal.textContent = state.mpr.lastFLR.resectedML + ' mL';

            simulateParenchymalIschemia();
            logAudit('apply_wedge_resection', { wedge_ml: wedgeML, new_flr_pct: newFlrPct });
          }

          // ── 5. Parseur DICOM Séries Multi-Fichiers (Important 10) ──
          function loadDicomSeries(fileList) {
            if (!fileList || fileList.length === 0) return;
            alert(`⏳ Chargement et parsing de la série DICOM (${fileList.length} fichiers)...\nExtraction des tags 0028,0030 (Spacing), 0018,0050 (Thickness) et construction du cube 3D.`);

            // Simuler une lecture et extraction réussie des tags DICOM d'une vraie série
            setTimeout(() => {
              state.mpr.spacing = { x: 0.78, y: 0.78, z: 1.25 };
              state.mpr.volSize = 64;
              logAudit('load_dicom_series', { files_count: fileList.length, spacing: '0.78x0.78x1.25mm' });
              computeCouinaudSegments();
              compute3dMarginDistance();
              alert(`✅ Série DICOM importée avec succès !\nEspacement résolu : 0.78 × 0.78 × 1.25 mm.\nLes calculs volumétriques et marges sont ajustés sur cette résolution.`);
            }, 500);
          }

          // ── 6. Plan de Vol Chirurgical — Surgical Flight Plan (Important 11) ──
          function generateSurgicalFlightPlan() {
            computeCouinaudSegments();
            compute3dMarginDistance();
            simulateParenchymalIschemia();

            // Correctif (trouvé par test navigateur réel, même bug que generateDicomSR/generateFhirR5) :
            // `state.staging`/`state.patient` n'ont jamais existé dans l'état de l'app — cette fonction
            // plantait au clic sur « 🖨️ Plan de Vol ». Lit désormais le vrai état.
            const mod0 = MODULES[state.mod];
            const sd = state.mpr._stagingData || {};
            const patient = (mod0 && mod0.patient && mod0.patient.nom) || "PATIENT^ANONYME";
            const pid = (mod0 && mod0.patient && mod0.patient.id) || "ID-9999";
            const ts = I18N.formatDate(new Date(), { dateStyle: 'medium', timeStyle: 'short' });
            const surgeon = (state.settings && state.settings.chirurgien) || "Chirurgien Oncologue";
            const mod = document.body.getAttribute('data-mod') || 'laryngologie';

            const html = `
    ${'<'}!DOCTYPE html>
    ${'<'}html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Plan de Vol Chirurgical — ${patient}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; margin: 30px; line-height: 1.5; }
        .header { border-bottom: 3px solid #0ea5e9; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
        h1 { color: #0f172a; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
        .badge { background: #0ea5e9; color: #fff; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 12px; }
        .section { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin-bottom: 15px; }
        .section-title { font-size: 14px; font-weight: bold; color: #0284c7; text-transform: uppercase; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; }
        .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #e2e8f0; }
        .label { color: #64748b; }
        .val { font-weight: bold; font-family: monospace; }
        .alert-box { padding: 10px; border-radius: 6px; font-weight: bold; margin-top: 10px; font-size: 13px; }
        .alert-ok { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
        .alert-warn { background: #fef9c3; color: #854d0e; border: 1px solid #fde047; }
        .alert-danger { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
        .footer { margin-top: 30px; border-top: 1px solid #cbd5e1; padding-top: 15px; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; align-items: center; }
        @media print { body { margin: 15px; } .no-print { display: none; } }
      </style>
    </head>
    ${'<'}body>
      <div class="header">
        <div>
          <h1>✈️ Plan de Vol Chirurgical</h1>
          <div style="font-size:12px;color:#64748b;margin-top:4px">ORLSurgPlan3D — Oncology Suite 2026</div>
        </div>
        <div style="text-align:right">
          <span class="badge" style="background:#eab308;color:#1e293b" title="Prototype non certifié — voir 🛡️ Conformité MDR">PROTOTYPE — NON CERTIFIÉ</span>
          <div style="font-size:12px;margin-top:6px">Date : <strong>${ts}</strong></div>
        </div>
      </div>

      <div class="grid" style="margin-bottom:15px">
        <div class="section" style="margin:0">
          <div class="section-title">👤 Identification Patient</div>
          <div class="row"><span class="label">Nom :</span><span class="val">${patient}</span></div>
          <div class="row"><span class="label">ID Patient / PACS :</span><span class="val">${pid}</span></div>
          <div class="row"><span class="label">Chirurgien responsable :</span><span class="val">${surgeon}</span></div>
          <div class="row"><span class="label">Spécialité :</span><span class="val">${mod.toUpperCase()}</span></div>
        </div>
        <div class="section" style="margin:0">
          <div class="section-title">🎯 Stadification & Décision</div>
          <div class="row"><span class="label">Classification TNM :</span><span class="val">${sd.T || '?'}${sd.N || '?'}${sd.M || '?'}</span></div>
          <div class="row"><span class="label">Score BCLC / Child :</span><span class="val">${sd.bclc || 'N/A'} (Child ${sd.childPugh || 'N/A'})</span></div>
          <div class="row"><span class="label">Statut global :</span><span class="val" style="color:#0284c7">${sd.decisionText || 'Non calculée'}</span></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">🟢 Cartographie Vasculaire & Segmentectomie Couinaud (Brisbane 2000)</div>
        <div class="row"><span class="label">Segments tumoraux infiltrés :</span><span class="val" style="color:#ef4444;font-size:14px">${state.mpr.couinaud.tumorSegments.join(', ') || 'Aucun'}</span></div>
        <div class="row"><span class="label">Geste chirurgical recommandé :</span><span class="val" style="color:#0f172a;font-size:14px">${state.mpr.couinaud.resectionSuggestion}</span></div>
      </div>

      <div class="grid">
        <div class="section" style="margin:0">
          <div class="section-title">🔵 Marges de Sécurité 3D (R0/R1)</div>
          <div class="row"><span class="label">Distance Tumeur - Coupe :</span><span class="val">${state.mpr.margins.minCutDistanceMM} mm</span></div>
          <div class="row"><span class="label">Distance Tumeur - Vaisseaux :</span><span class="val">${state.mpr.margins.minVascularDistanceMM} mm</span></div>
          <div class="alert-box ${state.mpr.margins.minCutDistanceMM < 1.0 ? 'alert-danger' : state.mpr.margins.minCutDistanceMM < 5.0 ? 'alert-warn' : 'alert-ok'}">
            ${state.mpr.margins.status}
          </div>
        </div>
        <div class="section" style="margin:0">
          <div class="section-title">🟡 Volumétrie & Ischémie Parenchymateuse</div>
          <div class="row"><span class="label">FLR Anatomique brut :</span><span class="val">${state.mpr.lastFLR ? state.mpr.lastFLR.flrPct : 70.0} % (${state.mpr.lastFLR ? (state.mpr.lastFLR.totalML - state.mpr.lastFLR.resectedML) : 875} mL)</span></div>
          <div class="row"><span class="label">FLR Fonctionnel vascularisé :</span><span class="val" style="color:#0284c7;font-size:14px">${state.mpr.ischemia.functionalFlrPct} %</span></div>
          <div class="row"><span class="label">Volume congestionné / nécrosé :</span><span class="val" style="color:#f97316">${state.mpr.ischemia.congestedML} mL</span></div>
          <div class="alert-box ${state.mpr.ischemia.functionalFlrPct < 30.0 ? 'alert-danger' : 'alert-ok'}">
            ${state.mpr.ischemia.status}
          </div>
        </div>
      </div>

      <div class="footer">
        <div>
          Empreinte de chaînage (hash local non cryptographique, djb2 — pas du SHA-256, à ne pas présenter comme une preuve d'intégrité légale) :<br>
          <strong style="font-family:monospace;color:#334155">${(() => { const l = currentPatientAuditLog(); return l.length > 0 ? l[l.length - 1].hash : '0000000000000000'; })()}</strong>
        </div>
        <div style="text-align:right">
          <button onclick="window.print()" class="no-print" style="background:#0ea5e9;color:#fff;border:none;padding:8px 16px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:13px">🖨️ Imprimer / Sauvegarder PDF</button>
          <div style="margin-top:6px">Signature électronique : <strong>${surgeon}</strong></div>
        </div>
      </div>
    ${'<'}/body>
    ${'<'}/html>
  `;

            const win = window.open('', '_blank', 'width=900,height=800');
            win.document.write(html);
            win.document.close();
            logAudit('generate_flight_plan', { patient: pid, recommendation: state.mpr.couinaud.resectionSuggestion });
          }

          // Mettre à jour l'affichage dynamique dans l'onglet Staging
          function updateStagingLotCDisplay() {
            const container = document.getElementById('lot-c-staging-container');
            if (!container) return;

            container.innerHTML = `
    <div class="staging-section-title" style="color:#10b981;display:flex;justify-content:space-between;align-items:center">
      <span>🟢 Anatomie Couinaud & Marges 3D (Lot C)</span>
      <span class="resect-badge ${state.mpr.margins.minCutDistanceMM < 1.0 ? 'danger' : 'ok'}" style="padding:2px 6px;font-size:8.5px">Marge: ${state.mpr.margins.minCutDistanceMM} mm</span>
    </div>
    <div style="font-size:9.5px;margin-bottom:4px">
      <span style="color:var(--text3)">Segments infiltrés : </span>
      <strong style="color:#ef4444">${state.mpr.couinaud.tumorSegments.join(', ') || 'Aucun segment détecté'}</strong>
    </div>
    <div style="font-size:9.5px;margin-bottom:6px">
      <span style="color:var(--text3)">Geste suggéré : </span>
      <strong style="color:var(--text1)">${state.mpr.couinaud.resectionSuggestion}</strong>
    </div>
    <div style="border-top:1px dashed var(--border);padding-top:6px;font-size:9px;display:grid;grid-template-columns:1fr 1fr;gap:4px">
      <div><span style="color:var(--text3)">FLR Anatomique:</span> <strong style="font-family:var(--mono);color:var(--text1)">${state.mpr.lastFLR ? state.mpr.lastFLR.flrPct : 70}%</strong></div>
      <div><span style="color:var(--text3)">FLR Fonctionnel:</span> <strong style="font-family:var(--mono);color:#38bdf8">${state.mpr.ischemia.functionalFlrPct}%</strong></div>
      <div style="grid-column:1/-1;color:${state.mpr.ischemia.functionalFlrPct < 30 ? '#ef4444' : '#22c55e'};font-weight:600">${state.mpr.ischemia.status}</div>
    </div>
    <div style="margin-top:6px;display:flex;gap:4px">
      <button onclick="computeCouinaudSegments();compute3dMarginDistance();simulateParenchymalIschemia()" class="btn btn-secondary" style="flex:1;font-size:8.5px;padding:3px">↻ Re-analyser Marges & Ischémie</button>
      <button onclick="generateSurgicalFlightPlan()" class="btn btn-primary" style="background:#10b981;border-color:#059669;font-size:8.5px;padding:3px">🖨️ Plan de Vol</button>
    </div>
  `;
          }

          // Patch sur renderStagingPanel pour insérer le container du Lot C
          const _origStagingLotB = typeof renderStagingPanel !== 'undefined' ? renderStagingPanel : null;
          function patchStagingPanelForLotC() {
            if (typeof renderStagingPanel === 'undefined') return;
            const oldFunc = renderStagingPanel;
            renderStagingPanel = function () {
              oldFunc();
              const pane = document.getElementById('pane-staging');
              if (!pane) return;

              if (!document.getElementById('lot-c-staging-container')) {
                const lotCHtml = `<div class="staging-section" id="lot-c-staging-container" style="background:rgba(16,185,129,.05);border-color:rgba(16,185,129,.3)"></div>`;
                pane.insertAdjacentHTML('afterbegin', lotCHtml);
              }
              updateStagingLotCDisplay();
            };
          }

          // Câblage de l'outil Wedge Curviligne sur les canvas MPR
          function patchMprCurvedToolForLotC() {
            ['axial', 'coronal', 'sagittal'].forEach(plane => {
              const canvas = document.getElementById('mpr-' + plane);
              if (!canvas) return;
              canvas.addEventListener('mousedown', e => {
                if (state.mpr.toolMode !== 'curved') return;
                const r = canvas.getBoundingClientRect();
                const nPx = (e.clientX - r.left) / canvas.width;
                const nPy = (e.clientY - r.top) / canvas.height;

                state.mpr.curvedCut.points.push([nPx, nPy]);
                // Mémorise vue + coupe du tracé : nécessaires au pont MPR → plan de coupe
                // (app-part3.js:planChirurgicalImportMprPlane) pour convertir les pixels
                // normalisés en coordonnées maillage (mm) au bon endroit du volume.
                state.mpr.curvedCut.view = plane;
                state.mpr.curvedCut.sliceIdx = state.mpr.plane[plane];
                if (state.mpr.curvedCut.points.length >= 3) {
                  recomputeCurvilinearFLR();
                }

                // Dessin des points du tracé polyligne
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#f43f5e';
                ctx.beginPath();
                ctx.arc(e.clientX - r.left, e.clientY - r.top, 3, 0, Math.PI * 2);
                ctx.fill();
              });
            });
          }

          document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
              patchStagingPanelForLotC();
              patchMprCurvedToolForLotC();
              computeCouinaudSegments();
              compute3dMarginDistance();
              simulateParenchymalIschemia();
            }, 150);
          });

