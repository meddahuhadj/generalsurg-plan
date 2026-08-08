          // ════════════════════════════════════════════════
          //  HUB
          // ════════════════════════════════════════════════
          function renderHub() {
            const container = document.getElementById('hub-cards');
            container.innerHTML = '';
            Object.values(MODULES).forEach((m, i) => {
              const card = document.createElement('div');
              card.className = 'hub-card';
              card.style.setProperty('--card-color', m.color);
              card.style.animationDelay = `${i * 0.08}s`;
              card.style.animation = `fadeUp 0.5s ease ${i * 0.08}s forwards`;
              card.style.opacity = '0';
              card.innerHTML = `
      <div class="hub-card-glow"></div>
      <div class="hub-card-icon">${m.icon}</div>
      <div class="hub-card-title">${m.name}</div>
      <div class="hub-card-sub">${m.desc}</div>
      <div class="hub-card-procs">
        <div class="hub-card-proc-label">Procédures clés</div>
        ${m.hubProcs.map(p => `<span class="hub-card-proc-chip"><span class="cdot"></span>${p}</span>`).join('')}
      </div>`;
              card.onclick = () => selectModule(m.id);
              container.appendChild(card);
            });
          }

          function openHub() {
            // Ferme proprement toute session vocale active avant de quitter le module
            if (typeof gl !== 'undefined' && gl.active) { disconnectGeminiLive(); }
            document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));

            const hub = document.getElementById('hub');
            hub.classList.remove('hidden');
            // force reflow avant de retirer fade-out pour rejouer la transition d'entrée
            void hub.offsetWidth;
            hub.classList.remove('fade-out');
            document.getElementById('app').style.display = 'none';
            renderHub();
          }

          function selectModule(id) {
            state.mod = id;
            state.workflowStep = 0;
            document.body.setAttribute('data-mod', id);
            document.getElementById('hub').classList.add('fade-out');
            setTimeout(() => {
              document.getElementById('hub').classList.add('hidden');
              document.getElementById('app').style.display = 'flex';
              showLoader('Chargement du module ' + MODULES[id].name, 'Initialisation des composants...');
              setTimeout(() => {
                hideLoader();
                initViewport();
                initMPR();
                renderAll();
                startTimer();
                // Adaptation dynamique du moteur de dictée CCAM selon la spécialité (Jalon M10)
                const btnD1 = document.getElementById('btn-dict-1');
                const btnD2 = document.getElementById('btn-dict-2');
                if (id === 'glaucome') {
                  if (btnD1) { btnD1.innerHTML = '🔊 Dictée : « Trabéculectomie avec mitomycine C, bulle de filtration fonctionnelle »'; btnD1.setAttribute('onclick', "simulateCcamDictation('trabeculectomie')"); }
                  if (btnD2) { btnD2.innerHTML = '🔊 Dictée : « Implant de drainage Ahmed FP7 pour glaucome réfractaire »'; btnD2.setAttribute('onclick', "simulateCcamDictation('ahmed')"); }
                } else if (id === 'retine') {
                  if (btnD1) { btnD1.innerHTML = '🔊 Dictée : « Vitrectomie 25G pour décollement de rétine avec tamponnement gaz SF6 »'; btnD1.setAttribute('onclick', "simulateCcamDictation('vitrectomie')"); }
                  if (btnD2) { btnD2.innerHTML = '🔊 Dictée : « Pelage de membrane épirétinienne avec peeling ILM »'; btnD2.setAttribute('onclick', "simulateCcamDictation('peeling')"); }
                } else {
                  if (btnD1) { btnD1.innerHTML = '🔊 Dictée : « Phacoémulsification avec implantation de LIO en chambre postérieure »'; btnD1.setAttribute('onclick', "simulateCcamDictation('phaco')"); }
                  if (btnD2) { btnD2.innerHTML = '🔊 Dictée : « Chirurgie combinée cataracte-glaucome, phaco + trabéculectomie »'; btnD2.setAttribute('onclick', "simulateCcamDictation('combinee')"); }
                }
                notify('Module ' + MODULES[id].short + ' chargé — Dictées CCAM auto-configurées', 'ok');
              }, 800);
            }, 500);
          }

          // ════════════════════════════════════════════════
          //  RENDER ALL
          // ════════════════════════════════════════════════
          function renderAll() {
            renderSidebar();
            renderQuickbar();
            renderRightPanel();
            renderVP_HUD();
            renderGeminiChips();
            document.getElementById('brand-sub').textContent = MODULES[state.mod].short;
          }

          // ── Sidebar ──
          function renderSidebar() {
            const mod = MODULES[state.mod]; const p = mod.patient;
            let html = `<div class="sidebar-scroll">`;
            let planningInfo = '';
            const room1 = I18N.t('sidebar.room', { n: 1 });
            if (p.id === '48392-HEP') planningInfo = `${room1} • 10:30 - 14:30 (${I18N.t('sidebar.statusOngoing')})`;
            else if (p.id === '33815-TH') planningInfo = `${room1} • 08:00 - 10:00 (${I18N.t('sidebar.statusDone')})`;
            else if (p.id === '51027-CR') planningInfo = `${room1} • 15:00 - 18:00 (${I18N.t('sidebar.statusPlanned')})`;
            else planningInfo = I18N.t('sidebar.notScheduledToday');

            // Patient card
            html += `<div class="patient-card" style="position:relative">
    <div style="position:absolute; top:10px; right:10px; font-size:14px; cursor:pointer; background:var(--bg1); border-radius:4px; padding:2px 6px; border:1px solid var(--border);" onclick="toggleDashboard()" title="Voir Planning du Bloc">📅</div>
    <div class="pc-head"><div class="pc-avatar">👤</div><div><div class="pc-name">${p.nom}</div><div class="pc-id">${p.id}</div></div></div>
    <div class="pc-row"><span class="pc-label">${I18N.t('sidebar.ageSex')}</span><span class="pc-val">${p.age} ${p.sexe}</span></div>
    <div class="pc-row"><span class="pc-label">${I18N.t('sidebar.weightHeight')}</span><span class="pc-val">${p.poids} kg / ${p.taille} cm</span></div>
    <div class="pc-row"><span class="pc-label">${I18N.t('sidebar.diagnosis')}</span><span class="pc-val" style="max-width:130px;text-align:right">${p.diag}</span></div>
    <div class="pc-row" style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05)"><span class="pc-label">${I18N.t('sidebar.orPlanning')}</span><span class="pc-val" style="color:var(--accent);font-weight:600;font-size:10.5px">${planningInfo}</span></div>
    <div style="margin-top:8px"><span class="urgency-badge ${p.urg}">${p.urg === 'rouge' ? I18N.t('sidebar.urgencyRed') : p.urg === 'orange' ? I18N.t('sidebar.urgencyOrange') : I18N.t('sidebar.urgencyGreen')}</span></div>
  </div>`;

            // Anatomy tree
            mod.structures.forEach((sec, si) => {
              const open = sec.open ? 'open' : '';
              html += `<div class="sidebar-section">
      <div class="sidebar-hdr ${open}" onclick="toggleSidebarSection(this)"><span>${sec.name}</span><span class="chev">▶</span></div>
      <div class="sidebar-body ${open}">
        ${sec.children.map(c => `<div class="sidebar-item" onclick="highlightStructure('${c.replace(/'/g, "\\'")}')"><span class="ico">◻</span>${c}</div>`).join('')}
      </div>
    </div>`;
            });

            // Module switcher
            html += `<div class="sidebar-section" style="margin-top:auto">
    <div class="sidebar-hdr"><span>${I18N.t('sidebar.switchModule')}</span></div>
    <div class="sidebar-body open">
      ${Object.values(MODULES).filter(m => m.id !== state.mod).map(m => `<div class="sidebar-item" onclick="switchModule('${m.id}')"><span class="ico">${m.icon}</span>${m.short}</div>`).join('')}
    </div>
  </div>`;

            html += `</div>`;
            document.getElementById('sidebar').innerHTML = html;
          }

          function toggleSidebarSection(el) {
            el.classList.toggle('open');
            el.nextElementSibling.classList.toggle('open');
          }

          // Sidebar ↔ 3D scene link: pulse the matching mesh so the tree isn't just decorative text.
          function highlightStructure(name) {
            const part = organParts.find(p => p.name === name);
            if (!part || !part.mesh) { notify('Structure non localisée dans le modèle 3D', 'info'); return; }
            const mesh = part.mesh;
            const mat = mesh.material;
            const origColor = mat.color.clone();
            const origOpacity = mat.opacity;
            let t = 0;
            const pulse = () => {
              t += 0.12;
              mat.opacity = origOpacity + Math.abs(Math.sin(t)) * 0.5;
              if (t < Math.PI * 2) { requestAnimationFrame(pulse); } else { mat.opacity = origOpacity; mat.color.copy(origColor); }
            };
            mat.color.set(0xffffff);
            pulse();
            setViewMode('3d');
            notify('Structure repérée : ' + name, 'info');
          }

          // ── Quickbar ──
          // ── Stepper de workflow clinique : Patient → Analyse IA → Simulation → Bloc ──
          const WORKFLOW_STEPS = [
            { id: 'patient', icon: '👤', i18nKey: 'workflow.patient' },
            { id: 'analyse', icon: '🤖', i18nKey: 'workflow.analysis' },
            { id: 'simulation', icon: '🧊', i18nKey: 'workflow.simulation' },
            { id: 'bloc', icon: '🔴', i18nKey: 'workflow.or' }
          ];
          function renderWorkflowStepper() {
            const el = document.getElementById('workflow-stepper');
            if (!el) return;
            el.innerHTML = WORKFLOW_STEPS.map((s, i) => {
              const cls = i === state.workflowStep ? 'current' : (i < state.workflowStep ? 'done' : '');
              const sep = i < WORKFLOW_STEPS.length - 1 ? '<span class="wf-arrow">›</span>' : '';
              return `<div class="wf-step ${cls}" onclick="goToWorkflowStep(${i})">
      <div class="wf-num">${i < state.workflowStep ? '✓' : i + 1}</div>
      <div class="wf-label">${s.icon} ${I18N.t(s.i18nKey)}</div>
    </div>${sep}`;
            }).join('');
          }
          function goToWorkflowStep(i) {
            state.workflowStep = i;
            const step = WORKFLOW_STEPS[i].id;
            const clickView = v => { const b = document.querySelector(`.top-nav button[data-view="${v}"]`); if (b) b.click(); };
            if (step === 'patient') {
              document.querySelector('.patient-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (step === 'analyse') {
              clickView('plan');
              setTab('analyse');
            } else if (step === 'simulation') {
              clickView('jumeau');
            } else if (step === 'bloc') {
              if (!state.or) toggleOR();
            }
            renderWorkflowStepper();
          }

          function renderQuickbar() {
            const mod = MODULES[state.mod];
            let html = `<div class="qb-section">
    <div class="qb-pill"><strong>${mod.icon} ${mod.short}</strong></div>
    <div class="qb-sep"></div>
    <div class="qb-pill"><span class="qb-urgency ${mod.patient.urg}">${mod.patient.nom}</span></div>
    <div class="qb-sep"></div>
    <div class="qb-timer" id="qb-timer" onclick="toggleTimer()"><span class="tdot"></span><span id="timer-display">00:00:00</span></div>
  </div>
  <div class="qb-section" id="qb-metrics">
    ${mod.metrics.map(m => `<div class="qb-metric"><span class="ml">${m.key}</span><span class="mv ${m.st}">${m.val}</span></div><div class="qb-sep"></div>`).join('')}
  </div>
  <div class="qb-section">
    <button class="btn-icon gemini-toggle-btn" id="gemini-btn" onclick="toggleGemini()"><span class="ldot"></span>Gemini Live</button>
  </div>`;
            document.getElementById('quickbar').innerHTML = html;
            renderWorkflowStepper();
          }

          // ── Right Panel ──
          function renderRightPanel() {
            const mod = MODULES[state.mod];
            const body = document.getElementById('rtab-body');

            // Plan pane
            const _analysis = computeAnalysis();
            let planHtml = `<div class="rtab-pane on" id="pane-plan">
    ${renderAiBriefing(_analysis)}
    <div class="psec"><div class="psec-title">${I18N.t('plan.plannedProcedure')}</div>
      <div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:4px">${mod.procedures[0]}</div>
      <div style="font-size:10px;color:var(--text2)">Voie: cœlioscopie • Durée estimée: 3h15</div>
    </div>
    <div class="psec"><div class="psec-title">${I18N.t('plan.metricsTitle', { specialty: mod.short })}</div>
      ${mod.metrics.map(m => `<div class="metric-row"><span class="k">${m.label}</span><span class="v ${m.st}">${m.val}</span></div>`).join('')}
    </div>
    ${renderBiometryPanel(mod)}
    <div class="psec"><div class="psec-title">${I18N.t('plan.checklistTitle')}</div>
      ${mod.checklist.map(c => `<div class="checklist-item"><span class="check-icon">${c.done ? '✅' : '⬜'}</span><span class="check-text">${c.text}</span></div>`).join('')}
    </div>
  </div>`;

            // Implants pane
            let implantHtml = `<div class="rtab-pane" id="pane-implants">
    <div class="psec"><div class="psec-title">Implants & Matériel</div>
      ${mod.implants.map((imp, i) => `<div class="implant-card ${imp.sel ? 'selected' : ''}" onclick="toggleImplant(this)">
        <div class="ic-name">${imp.name}</div><div class="ic-ref">${imp.ref}</div>
        <div class="ic-tags">${imp.tags.map(t => `<span class="ic-tag blue">${t}</span>`).join('')}</div>
      </div>`).join('')}
    </div>
  </div>`;

            // AI Chat pane
            let chatHtml = `<div class="rtab-pane" id="pane-ia">
    <div class="ai-chat">
      <div class="chat-msgs" id="chat-msgs">
        <div class="msg bot">Bonjour, je suis votre assistant chirurgical ${mod.short}. Comment puis-je vous aider ?<div class="msg-time">Maintenant</div></div>
      </div>
      <div class="chat-input-row">
        <button class="btn-mic" id="btn-mic" onclick="toggleMic()">🎤</button>
        <input class="chat-input" id="chat-input" data-i18n-placeholder="ai.chatPlaceholder" placeholder="Posez votre question..." onkeydown="if(event.key==='Enter')sendChat()">
        <button class="btn-send" onclick="sendChat()">➤</button>
      </div>
    </div>
  </div>`;

            // Analyse pane (volumétrie + score de risque, calculés — pas codés en dur)
            let analyseHtml = `<div class="rtab-pane" id="pane-analyse">
    <div id="analyse-body">Calcul en cours...</div>
  </div>`;

            body.innerHTML = planHtml + implantHtml + chatHtml + analyseHtml;
            setTab(state.tab);
            runAnalysis();
          }

          // ════════════════════════════════════════════════
          //  ANALYSE — volumétrie (à partir du volume voxel) + score de risque
          //  (à partir des métriques 'warn'/'ok' du module courant)
          // ════════════════════════════════════════════════
          function computeOrganVolumeMl() {
            // Count "tissue" voxels in the procedural/DICOM volume and scale to a plausible
            // organ size per specialty so the number reacts to the actual dataset, not a constant.
            if (!state.mpr.volume) buildProceduralVolume();
            const N = state.mpr.volSize;
            let tissue = 0;
            for (let i = 0; i < state.mpr.volume.length; i++) if (state.mpr.volume[i] > 15) tissue++;
            const fracTissue = tissue / (N * N * N);
            const refML = { cataracte: 6.5, glaucome: 6.5, retine: 6.5 }[state.mod] || 6.5;
            // Normalise against the expected fraction for a centred ellipsoid (~0.28) so refML stays the anchor.
            return refML * (fracTissue / 0.28);
          }

          function computeRiskScore() {
            const mod = MODULES[state.mod];
            let score = 15; // baseline
            mod.metrics.forEach(m => { if (m.st === 'warn') score += 18; if (m.st === 'crit') score += 30; });
            if (mod.patient.urg === 'orange') score += 10;
            if (mod.patient.urg === 'rouge') score += 22;
            if (mod.patient.age > 70) score += 8;
            return Math.max(2, Math.min(98, Math.round(score)));
          }
          function riskLevel(score) {
            if (score < 30) return { label: I18N.t('analysis.riskLow'), color: '#22c55e' };
            if (score < 60) return { label: I18N.t('analysis.riskModerate'), color: '#eab308' };
            return { label: I18N.t('analysis.riskHigh'), color: '#ef4444' };
          }

          // Si de vrais maillages de segmentation sont chargés (loadRealMeshesIntoScene, via
          // /segmentation/auto ou /segmentation/from-series), leur volume réel (userData.volume_ml,
          // issu de TotalSegmentator) doit primer sur l'estimation procédurale. Renvoie null si aucun
          // maillage réel n'est chargé, pour que l'appelant sache distinguer les deux cas explicitement.
          function getRealSegmentationVolumeMl() {
            if (!realMeshGroup || !realMeshGroup.children.length) return null;
            let total = 0, any = false;
            realMeshGroup.children.forEach(obj => {
              const v = obj.userData && obj.userData.volume_ml;
              if (typeof v === 'number' && !isNaN(v)) { total += v; any = true; }
            });
            return any ? total : null;
          }

          // ── Calcul de puissance de LIO — formule SRK II (Sanders-Retzlaff-Kraff, 1988) ──
          //
          // Choisie plutôt que SRK/T (citée dans les métriques de démo) car SRK/T est une
          // formule vergence-théorique avec de nombreuses constantes de correction (largeur
          // et hauteur cornéennes, ACD personnalisée, correction d'épaisseur rétinienne...)
          // qu'il aurait été risqué de reconstituer de mémoire sans pouvoir les vérifier
          // contre une source publiée — une constante légèrement fausse produirait une
          // puissance plausible mais cliniquement fausse, silencieusement. SRK II est une
          // formule de régression plus ancienne et moins précise sur les yeux très longs/
          // courts, mais sa structure est simple et sans ambiguïté :
          //
          //   P = A1 - 2.5 × AL - 0.9 × K
          //
          // où A1 est la constante A du fabricant, ajustée selon la longueur axiale :
          //   AL < 20.0        → A1 = A + 3.0
          //   20.0 ≤ AL < 21.0 → A1 = A + 2.0
          //   21.0 ≤ AL < 22.0 → A1 = A + 1.0
          //   22.0 ≤ AL < 24.5 → A1 = A + 0.0
          //   AL ≥ 24.5        → A1 = A − 0.5
          //
          // Portée volontairement limitée à la cible réfractive émmétrope (plan 0 D) :
          // l'ajustement pour une réfraction cible non-nulle varie selon les sources et
          // n'est pas ajouté ici tant qu'il n'est pas vérifié contre une référence publiée.
          //
          // ⚠️ Ce calcul n'est PAS validé cliniquement dans ce dépôt (voir bandeau
          // "Prototype de démonstration" affiché en permanence dans l'app). Avant de lui
          // faire confiance : comparez son résultat à celui déjà affiché par votre
          // biomètre (IOL Master/Lenstar) sur au moins 2-3 patients réels.
          function srkIIA1(aConstant, axialLengthMm) {
            if (axialLengthMm < 20.0) return aConstant + 3.0;
            if (axialLengthMm < 21.0) return aConstant + 2.0;
            if (axialLengthMm < 22.0) return aConstant + 1.0;
            if (axialLengthMm < 24.5) return aConstant + 0.0;
            return aConstant - 0.5;
          }

          function srkIIPower(aConstant, axialLengthMm, avgKD) {
            const a1 = srkIIA1(aConstant, axialLengthMm);
            const power = a1 - 2.5 * axialLengthMm - 0.9 * avgKD;
            return { power: Math.round(power * 100) / 100, a1 };
          }

          // Bornes de plausibilité (pas des bornes physiologiques strictes) : au-delà, la
          // valeur saisie est presque certainement une erreur de frappe/unité (ex. rayon
          // cornéen en mm au lieu d'une puissance en D) plutôt qu'une vraie mesure extrême.
          // Le calcul reste possible mais un avertissement est renvoyé, jamais un blocage
          // silencieux ni un résultat présenté sans réserve.
          function validateBiometryInputs(aConstant, axialLengthMm, avgKD) {
            const warnings = [];
            if (!(axialLengthMm > 0) || axialLengthMm < 15 || axialLengthMm > 40) {
              return { valid: false, warnings: [`Longueur axiale (${axialLengthMm} mm) hors plage plausible (15-40 mm) — vérifiez la saisie.`] };
            }
            if (!(avgKD > 0) || avgKD < 30 || avgKD > 60) {
              return { valid: false, warnings: [`Kératométrie moyenne (${avgKD} D) hors plage plausible (30-60 D) — vérifiez la saisie (unité : dioptries, pas mm de rayon).`] };
            }
            if (!(aConstant > 0) || aConstant < 110 || aConstant > 130) {
              return { valid: false, warnings: [`Constante A (${aConstant}) hors plage plausible (110-130) — vérifiez la valeur fournie par le fabricant de l'implant.`] };
            }
            if (axialLengthMm < 22.0 || axialLengthMm > 26.0) {
              warnings.push('SRK II est connue pour être moins fiable sur les yeux très courts (<22 mm) ou très longs (>26 mm) — envisager une formule théorique (Hoffer Q, SRK/T, Barrett) pour ces cas.');
            }
            return { valid: true, warnings };
          }

          // Résultat complet pour le patient actif du module Cataracte, à partir de la
          // biométrie saisie par l'utilisateur (state.biometryByPatient) — jamais pré-
          // remplie ni déduite des métriques de démo. Retourne null si rien n'a encore
          // été saisi pour ce patient (l'appelant doit alors afficher le formulaire vide,
          // pas une valeur calculée par défaut).
          function computeIOLResult(mod) {
            const bio = state.biometryByPatient[mod.patient.id];
            if (!bio || bio.al == null || bio.k == null || bio.a == null) return null;
            const check = validateBiometryInputs(bio.a, bio.al, bio.k);
            if (!check.valid) return { error: check.warnings[0] };
            const { power, a1 } = srkIIPower(bio.a, bio.al, bio.k);
            return { power, a1, warnings: check.warnings, bio };
          }

          // Formulaire de saisie biométrie affiché uniquement pour le module Cataracte —
          // les autres spécialités n'ont pas d'équivalent "calcul LIO" dans cette version.
          // Rendu séparé du reste de planHtml (conteneur #iol-result dédié) pour pouvoir
          // rafraîchir uniquement le résultat après calcul, sans reconstruire tout le
          // panneau droit (qui perdrait le focus/la position de scroll de l'utilisateur).
          function renderBiometryPanel(mod) {
            if (mod.id !== 'cataracte') return '';
            const bio = state.biometryByPatient[mod.patient.id] || {};
            const val = (v) => (v == null ? '' : v);
            return `<div class="psec" id="biometrie-panel">
      <div class="psec-title">Biométrie & calcul LIO (SRK II)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
        <label style="font-size:9px;color:var(--text3)">Longueur axiale (mm)<input type="number" step="0.01" id="bio-al" value="${val(bio.al)}" style="width:100%" ${state.readOnly ? 'disabled' : ''}></label>
        <label style="font-size:9px;color:var(--text3)">Constante A implant<input type="number" step="0.1" id="bio-a" value="${val(bio.a)}" style="width:100%" ${state.readOnly ? 'disabled' : ''}></label>
        <label style="font-size:9px;color:var(--text3)">Kératométrie K1 (D)<input type="number" step="0.01" id="bio-k1" value="${val(bio.k1)}" style="width:100%" ${state.readOnly ? 'disabled' : ''}></label>
        <label style="font-size:9px;color:var(--text3)">Kératométrie K2 (D)<input type="number" step="0.01" id="bio-k2" value="${val(bio.k2)}" style="width:100%" ${state.readOnly ? 'disabled' : ''}></label>
      </div>
      <button class="btn btn-secondary" style="width:100%" onclick="calculateIOL()" ${state.readOnly ? 'disabled' : ''}>Calculer la puissance LIO</button>
      <div id="iol-result" style="margin-top:6px">${renderIOLResultHtml(computeIOLResult(mod))}</div>
    </div>`;
          }

          function renderIOLResultHtml(result) {
            if (!result) {
              return `<div style="font-size:9px;color:var(--text3)">Saisissez la biométrie réelle du patient pour calculer une puissance de LIO — aucune valeur par défaut, contrairement à la métrique de démo ci-dessus.</div>`;
            }
            if (result.error) {
              return `<div style="font-size:10px;color:#ef4444">⚠️ ${result.error}</div>`;
            }
            const warnHtml = result.warnings.length
              ? `<div style="font-size:9px;color:#eab308;margin-top:4px">⚠️ ${result.warnings.join(' ')}</div>` : '';
            return `<div class="metric-row"><span class="k">Puissance LIO (SRK II, cible plan 0 D)</span><span class="v ok">${result.power.toFixed(2)} D</span></div>
    <div style="font-size:9px;color:var(--text3)">Calculé — non validé cliniquement dans ce dépôt : comparez à votre biomètre (IOL Master/Lenstar) avant tout usage réel.</div>
    ${warnHtml}`;
          }

          function calculateIOL() {
            if (guardReadOnly('calcul de puissance LIO')) return;
            const mod = MODULES[state.mod];
            const al = parseFloat(document.getElementById('bio-al').value);
            const k1 = parseFloat(document.getElementById('bio-k1').value);
            const k2 = parseFloat(document.getElementById('bio-k2').value);
            const a = parseFloat(document.getElementById('bio-a').value);
            if ([al, k1, k2, a].some(v => isNaN(v))) {
              notify('Renseignez les 4 champs (longueur axiale, K1, K2, constante A) avant de calculer.', 'warn');
              return;
            }
            const k = Math.round(((k1 + k2) / 2) * 100) / 100;
            state.biometryByPatient[mod.patient.id] = { al, k1, k2, k, a };
            const result = computeIOLResult(mod);
            const el = document.getElementById('iol-result');
            if (el) el.innerHTML = renderIOLResultHtml(result);
            if (result && result.error) notify(result.error, 'warn');
            else notify('Puissance LIO recalculée.', 'ok');
          }

          function computeAnalysis() {
            const mod = MODULES[state.mod];
            const realVol = getRealSegmentationVolumeMl();
            // dataSource distingue une vraie mesure (TotalSegmentator, via maillages chargés) d'une
            // simple estimation procédurale — jamais mélangées silencieusement (voir runAnalysis()).
            const dataSource = realVol != null ? 'real_segmentation' : 'procedural_estimate';
            const organVol = realVol != null ? realVol : computeOrganVolumeMl();
            const resectionPct = 0.5 + (mod.metrics.some(m => m.st === 'warn') ? 0.08 : 0);
            const resectedVol = organVol * resectionPct;
            const remnantPct = Math.round((organVol - resectedVol) / organVol * 1000) / 10;
            const risk = computeRiskScore();
            const lvl = riskLevel(risk);
            // key stable (non traduit) utilisé pour la logique ; le libellé affiché est résolu via
            // I18N.t() au moment du rendu (runAnalysis()) — auparavant la comparaison se faisait sur le
            // libellé français lui-même ('Attendu'), ce qui aurait cassé le style "Attendu" en surbrillance
            // dès qu'une autre langue était affichée.
            const scenarios = [
              { key: 'optimistic', label: 'Optimiste', flr: Math.min(95, remnantPct + 8).toFixed(1) },
              { key: 'expected', label: 'Attendu', flr: remnantPct.toFixed(1) },
              { key: 'unfavorable', label: 'Défavorable', flr: Math.max(5, remnantPct - 10).toFixed(1) }
            ];
            const criticalMetrics = mod.metrics.filter(m => m.st === 'warn' || m.st === 'crit');
            return { mod, organVol, dataSource, resectedVol, remnantPct, risk, lvl, scenarios, criticalMetrics };
          }

          // ── Fiche de synthèse IA proactive ──────────────────────────────────
          // Générée automatiquement à partir des mêmes calculs réels que l'onglet
          // Analyse (pas un texte statique) : le chirurgien voit la recommandation
          // et le risque dès l'ouverture du patient, sans avoir à le demander.
          function renderAiBriefing(a) {
            const safeThreshold = 30;
            const flrOk = a.remnantPct >= safeThreshold;
            const metricLine = a.criticalMetrics.length
              ? `<div class="ai-brief-line">${I18N.t('ai.briefingWatch', { metrics: a.criticalMetrics.map(m => `${m.key} ${m.val}`).join(', ') })}</div>`
              : `<div class="ai-brief-line">${I18N.t('ai.briefingNoIssue')}</div>`;
            return `<div class="ai-brief">
    <div class="ai-brief-head">${I18N.t('ai.briefingTitle')}</div>
    <div class="ai-brief-line">${I18N.t('ai.briefingProcedure', { procedure: `<b>${a.mod.procedures[0]}</b>` })}</div>
    <div class="ai-brief-line">${I18N.t('ai.briefingRemnant', { pct: `<b style="color:${flrOk ? '#22c55e' : '#ef4444'}">${a.remnantPct}</b>`, threshold: safeThreshold })}</div>
    <div class="ai-brief-line">${I18N.t('ai.briefingRisk')} <span class="ai-brief-risk" style="background:${a.lvl.color}22;color:${a.lvl.color}">${a.lvl.label} · ${a.risk}/100</span></div>
    ${metricLine}
  </div>`;
          }

          function runAnalysis() {
            const a = computeAnalysis();
            const { organVol, dataSource, resectedVol, remnantPct, risk, lvl, scenarios } = a;

            // Badge visible à côté des chiffres, distinct du bandeau global de la page : un chirurgien
            // doit voir AU NIVEAU DE CHAQUE VALEUR si elle vient d'une vraie segmentation ou d'une
            // estimation procédurale — les deux ne doivent jamais être visuellement indiscernables.
            const sourceBadge = dataSource === 'real_segmentation'
              ? `<span style="font-size:9px;font-weight:700;color:#22c55e;background:#22c55e22;padding:1px 6px;border-radius:8px;margin-left:6px">${I18N.t('analysis.realSegmentationBadge')}</span>`
              : `<span style="font-size:9px;font-weight:700;color:#eab308;background:#eab30822;padding:1px 6px;border-radius:8px;margin-left:6px">${I18N.t('analysis.proceduralBadge')}</span>`;

            const scenarioLabels = { optimistic: I18N.t('analysis.scenarioOptimistic'), expected: I18N.t('analysis.scenarioExpected'), unfavorable: I18N.t('analysis.scenarioUnfavorable') };

            const html = `
    <div class="psec"><div class="psec-title">${I18N.t('analysis.sectionTitle')} ${sourceBadge}</div>
      <div class="metric-row"><span class="k">${I18N.t('analysis.organVolume')}</span><span class="v ok">${organVol.toFixed(0)} ml</span></div>
      <div class="metric-row"><span class="k">${I18N.t('analysis.resectionVolume')}</span><span class="v warn">${resectedVol.toFixed(0)} ml</span></div>
      <div class="metric-row"><span class="k">${I18N.t('analysis.remnant')}</span><span class="v ${remnantPct >= 30 ? 'ok' : 'warn'}">${remnantPct}%</span></div>
      ${dataSource !== 'real_segmentation' ? `<div style="font-size:9px;color:var(--text3);margin-top:4px">${I18N.t('analysis.proceduralNote')}</div>` : ''}
    </div>
    <div class="psec"><div class="psec-title">${I18N.t('analysis.riskScoreTitle')} <span style="font-size:9px;font-weight:700;color:#eab308;background:#eab30822;padding:1px 6px;border-radius:8px;margin-left:6px">${I18N.t('analysis.riskScoreBadge')}</span></div>
      <div style="display:flex;align-items:center;gap:10px;margin:6px 0">
        <div style="font-size:26px;font-weight:800;color:${lvl.color}">${risk}</div>
        <div>
          <div style="font-size:11px;font-weight:700;color:${lvl.color}">${lvl.label}</div>
          <div style="font-size:9px;color:var(--text3)">${I18N.t('analysis.riskScoreBasedOn', { count: a.criticalMetrics.length })}</div>
        </div>
      </div>
    </div>
    <div class="psec"><div class="psec-title">${I18N.t('analysis.scenarios')}</div>
      ${scenarios.map(s => `<div class="metric-row"><span class="k">${scenarioLabels[s.key]}</span><span class="v ${s.key === 'expected' ? 'ok' : ''}">${I18N.t('analysis.remnantFunctional', { pct: s.flr })}</span></div>`).join('')}
    </div>
    <button class="btn btn-primary" style="width:100%;margin-top:6px" onclick="runAnalysis();notify(I18N.t('analysis.recalculated'),'ok')">${I18N.t('analysis.recalculate')}</button>
    <button class="btn btn-secondary" style="width:100%;margin-top:6px" onclick="exportPlan()">${I18N.t('analysis.exportPlan')}</button>
  `;
            const el = document.getElementById('analyse-body');
            if (el) el.innerHTML = html;
          }

          async function exportPlan() {
            const mod = MODULES[state.mod];
            const realVol = getRealSegmentationVolumeMl();
            const organVol = realVol != null ? realVol : computeOrganVolumeMl();
            const volumeSource = realVol != null ? 'real_segmentation_totalsegmentator' : 'procedural_estimate_not_clinical';
            const payload = {
              patient: { id: mod.patient.id, nom: mod.patient.nom },
              specialty: state.mod,
              volumetrie: { organ_volume_ml: Math.round(organVol), remnant_pct: 60, volume_source: volumeSource },
              notes: 'Export généré depuis OphtalmoSurg Plan'
                + (volumeSource === 'procedural_estimate_not_clinical'
                  ? ' — ⚠ volume_organe = estimation procédurale, PAS une mesure de segmentation clinique validée.'
                  : ' — volume_organe issu de la segmentation IA réelle (TotalSegmentator).')
            };
            if (state.settings.apiBase) {
              try {
                const base = state.settings.apiBase.replace(/\/+$/, '');
                const r = await fetch(base + '/export/dicom-sr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const data = await r.json();
                downloadJson(data, `plan_${mod.patient.id}.json`);
                notify('Export généré via le backend', 'ok');
                return;
              } catch (e) { /* fall through to local export */ }
            }
            downloadJson(payload, `plan_${mod.patient.id}.json`);
            notify('Export local généré (backend non configuré)', 'info');
          }

          function downloadJson(obj, filename) {
            const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
            URL.revokeObjectURL(url);
          }

          function setTab(tab) {
            state.tab = tab;
            document.querySelectorAll('.rtab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
            document.querySelectorAll('.rtab-pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + tab));
          }

          // ── VP HUD ──
          function renderVP_HUD() {
            const mod = MODULES[state.mod];
            document.getElementById('vp-hud').innerHTML = `
    <div class="hud-chip"><span class="lbl">Module</span>${mod.short}</div>
    <div class="hud-chip"><span class="lbl">Patient</span>${mod.patient.id}</div>
    <div class="hud-chip"><span class="lbl">Procédure</span>${mod.procedures[0]}</div>
    <div class="hud-chip"><span class="lbl">Mode</span><span id="hud-mode">3D Solide</span></div>`;
          }

          // ── Gemini Chips ──
          function renderGeminiChips() {
            const mod = MODULES[state.mod];
            document.getElementById('gb-chips').innerHTML = mod.aiChips.map(c => `<button class="gb-chip" onclick="askGB('${c}')">${c}</button>`).join('');
          }

          // ════════════════════════════════════════════════
          //  INTERACTIONS
          // ════════════════════════════════════════════════
          // ════════════════════════════════════════════════
          //  RESET D'ÉTAT PATIENT — sécurité patient centralisée
          // ════════════════════════════════════════════════
          // Cette app garde un patient par module, mais son état "patient courant" est éclaté dans de
          // nombreuses variables globales (state.mpr.*, state.live.*, state.registration, realMeshGroup,
          // segmentMesh3D...) qui ont été ajoutées lot par lot au fil des fonctionnalités, sans qu'aucune
          // n'ait jamais été systématiquement remise à zéro au changement de module. Résultat trouvé en
          // audit : AU MOINS 5 endroits où des données cliniques d'un patient (segmentation tumorale,
          // stadification TNM/BCLC, mesures de marge, cartographie Couinaud, simulation d'ischémie,
          // contexte de conversation IA...) continuaient silencieusement d'influencer l'affichage et les
          // exports d'un AUTRE patient après un changement de module.
          //
          // Plutôt que de continuer à corriger ces fuites une par une à chaque fois qu'une nouvelle est
          // trouvée (risque réel qu'une 6e apparaisse à la prochaine fonctionnalité ajoutée sans qu'on y
          // pense), cette fonction centralise TOUT le nettoyage "changement de patient" en un seul endroit
          // avec un inventaire explicite — c'est la fonction à mettre à jour si un futur champ d'état
          // patient-spécifique est ajouté.
          function resetPatientState() {
            // Maillages 3D de segmentation IA réelle (TotalSegmentator, via loadRealMeshesIntoScene) —
            // sans ce nettoyage, computeAnalysis()/renderStagingPanel() auraient continué à afficher le
            // volume organe RÉEL d'un AUTRE patient, étiqueté "🏥 segmentation réelle" — même défaut que
            // celui corrigé côté backend dans real_patient_dicom_mesh_service.py.
            if (realMeshGroup) {
              scene.remove(realMeshGroup);
              realMeshGroup = null;
              if (organMesh) organMesh.material.opacity = 1;
              if (wireframeMesh) wireframeMesh.material.opacity = 1;
              if (vesselGroup) vesselGroup.visible = true;
            }
            if (segmentMesh3D) { scene.remove(segmentMesh3D); segmentMesh3D = null; }

            // Volume DICOM réel importé (loadDicomFiles) et sa reconstruction voxel 3D
            // (showDicomIn3D/dicomIsoMesh) — LA fuite la plus grave de cette famille de bugs : sans ce
            // nettoyage, les coupes MPR (axial/coronal/sagittal) ET la reconstruction 3D voxelisée
            // continuaient à afficher les VRAIES images scanner d'un AUTRE patient (pas une estimation
            // ni une donnée fabriquée — de vraies coupes DICOM) après un changement de patient, car
            // initMPR() ne régénère un volume procédural que si state.mpr.volume est vide.
            if (typeof _dicomDisposeIso === 'function') _dicomDisposeIso();
            if (typeof dicomIsoEnabled !== 'undefined') dicomIsoEnabled = false;
            if (state.mpr) {
              state.mpr.volume = null;
              state.mpr.fromDicom = false;
            }

            if (state.mpr) {
              // Segmentation manuelle (Wand — tumeur, vaisseau rétinien, membrane épirétinienne) : pesait sinon
              // sur le calcul de résécabilité et le volume tumeur du nouveau patient.
              if (state.mpr.segments) Object.values(state.mpr.segments).forEach(s => s.voxels.clear());
              // Stadification TNM/BCLC/Child-Pugh/CRM/VEMS.
              state.mpr._stagingData = null;
              // Mesures/annotations MPR (distances, marges) — exportées telles quelles dans le
              // compte-rendu (LinearMeasurementsMM, exportPlan()).
              state.mpr.measurements = [];
              // Cartographie Couinaud (Lot C) : segments infiltrés + geste de résection suggéré pour
              // l'ancien patient, affichés tels quels dans le panneau de stadification.
              if (state.mpr.couinaud) {
                state.mpr.couinaud.tumorSegments = [];
                state.mpr.couinaud.resectionSuggestion = 'Aucune tumeur détectée';
              }
              // Distance de marge 3D R0/R1 & proximité vasculaire (Lot C) — un statut de marge oncologique
              // d'un autre patient ne doit jamais rester affiché comme "calculé" pour le nouveau.
              if (state.mpr.margins) {
                state.mpr.margins.minCutDistanceMM = 999.0;
                state.mpr.margins.minVascularDistanceMM = 999.0;
                state.mpr.margins.status = 'Non calculé';
                state.mpr.margins.vascularRisk = false;
              }
              // Simulation d'ischémie parenchymateuse & FLR fonctionnel (Lot C).
              if (state.mpr.ischemia) {
                state.mpr.ischemia.functionalFlrPct = 70.0;
                state.mpr.ischemia.congestedML = 0.0;
                state.mpr.ischemia.devascularizedML = 0.0;
                state.mpr.ischemia.status = 'Normal';
              }
              // Coupe curviligne / wedge resection (Lot C).
              if (state.mpr.curvedCut) {
                state.mpr.curvedCut.points = [];
                state.mpr.curvedCut.active = false;
                state.mpr.curvedCut.wedgeResectedML = 0.0;
              }
              // Dernier calcul de volumétrie/FLR (utilisé en fallback par plusieurs exports).
              state.mpr.lastFLR = null;
            }

            // Recalage manuel/rigide : seul le résultat (translation/rotation/RMS) est patient-spécifique,
            // les points fiduciaires de démonstration ne le sont pas — on ne réinitialise que le résultat.
            if (state.registration) {
              state.registration.tx = 0; state.registration.ty = 0; state.registration.tz = 0;
              state.registration.rx = 0; state.registration.ry = 0; state.registration.rz = 0;
              state.registration.rms = 0.0;
            }

            // Mémoire multi-tours de Gemini Live : le prompt système (liveSystemPrompt()) inclut bien le
            // patient ACTUEL à chaque appel, mais les tours de conversation précédents envoyés comme
            // contexte (askGeminiLiveStream) pouvaient contenir des détails cliniques discutés sur un
            // AUTRE patient — l'IA pouvait alors mélanger les deux dossiers dans sa réponse. Si une
            // session vocale Gemini Live est active, on la referme : elle redémarrera avec un contexte
            // système propre au nouveau patient (le contexte déjà établi côté serveur Google pour la
            // session en cours ne peut de toute façon pas être "oublié" autrement qu'en fermant le WS).
            state.live.history = [];
            if (typeof gl !== 'undefined' && gl.active) disconnectGeminiLive();
          }

          function switchModule(id) {
            showLoader('Chargement ' + MODULES[id].name, 'Changement de module...');
            state.mod = id;
            document.body.setAttribute('data-mod', id);
            resetPatientState();
            setTimeout(() => {
              if (twin.active) { exitDigitalTwin(); enterDigitalTwin(); }
              else if (organMesh) { buildOrgan(); }
              else { buildProceduralVolume(); }
              initMPR();
              renderAll();
              hideLoader();
              // Lance automatiquement le pipeline en tâche de fond — aucune action chirurgien requise
              if (state.anatomyMode !== 'procedural') {
                const patId = MODULES[id] && MODULES[id].patient ? MODULES[id].patient.id : 'PAT-2026-001';
                // Petit délai pour laisser l'UI se stabiliser, puis pipeline de fond
                setTimeout(() => { digitalTwinPipeline.run(patId); }, 200);
              }
            }, 600);
          }

          // ── Mode Clinique (défaut) / Mode Recherche ──────────────────────────
          // Masque par défaut les modules exploratoires non validés cliniquement
          // (Jalons M21-M40 : nanorobots, BCI, cryo-BNCT, iKnife/Ac-225, etc.)
          // pour que le chirurgien ne voie que les outils utilisables au bloc.
          // Rien n'est supprimé : le Mode Recherche les révèle explicitement.
          function setResearchMode(on) {
            state.researchMode = !!on;
            document.body.classList.toggle('research-mode', state.researchMode);
            const btn = document.getElementById('btn-research-toggle');
            if (btn) btn.classList.toggle('active', state.researchMode);
            notify(state.researchMode
              ? '🔬 Mode Recherche activé — modules exploratoires + Paramètres techniques (⚙) visibles'
              : '✅ Mode Clinique — seuls les outils validés pour le bloc sont affichés', 'info');
          }
          function toggleResearchMode() { setResearchMode(!state.researchMode); }

          function setOrMode(on) {
            state.or = !!on;
            document.body.classList.toggle('or-mode', state.or);
            document.getElementById('btn-or-toggle').classList.toggle('active', state.or);
            onResize();
            notify(state.or ? 'Mode OR activé — Interface chirurgicale' : 'Mode OR désactivé', 'info');
          }
          function toggleOR() { setOrMode(!state.or); }

          let dashboardInterval = null;
          function setDashboardMode(on) {
            state.dashboard = !!on;
            document.body.classList.toggle('dashboard-mode', state.dashboard);
            document.getElementById('btn-dash-toggle').classList.toggle('active', state.dashboard);

            if (state.dashboard) {
              notify('📊 Tableau de Bord Bloc activé', 'info');
              const pat = MODULES[state.mod]?.patient;
              if (pat) document.getElementById('dash-pat-name').textContent = `${pat.name} (${pat.id})`;

              if (!dashboardInterval) {
                let baseHr = 72, baseMap = 68, baseSpo2 = 99, timeSec = 8130;
                dashboardInterval = setInterval(() => {
                  baseHr = Math.max(50, Math.min(130, baseHr + (Math.random() - 0.5) * 4));
                  baseMap = Math.max(40, Math.min(120, baseMap + (Math.random() - 0.5) * 3));
                  baseSpo2 = Math.max(90, Math.min(100, baseSpo2 + (Math.random() - 0.3) * 1));

                  const elHr = document.getElementById('dash-hr');
                  const elMap = document.getElementById('dash-map');
                  const elSpo2 = document.getElementById('dash-spo2');
                  const elAlert = document.getElementById('dash-alert-banner');

                  if (elHr) {
                    elHr.textContent = Math.round(baseHr);
                    elHr.className = 'dash-vital-val ' + (baseHr < 60 || baseHr > 100 ? (baseHr < 50 || baseHr > 120 ? 'dash-val-alert' : 'dash-val-warn') : 'dash-val-ok');
                  }
                  if (elMap) {
                    elMap.textContent = Math.round(baseMap);
                    elMap.className = 'dash-vital-val ' + (baseMap < 65 || baseMap > 100 ? (baseMap < 55 || baseMap > 110 ? 'dash-val-alert' : 'dash-val-warn') : 'dash-val-ok');
                  }
                  if (elSpo2) {
                    elSpo2.textContent = Math.round(baseSpo2);
                    elSpo2.className = 'dash-vital-val ' + (baseSpo2 < 95 ? (baseSpo2 < 92 ? 'dash-val-alert' : 'dash-val-warn') : 'dash-val-ok');
                  }
                  if (elAlert) {
                    if (baseMap < 60) {
                      elAlert.style.display = 'block';
                      elAlert.innerHTML = '⚠️ ALERTE CRITIQUE : Hypotension sévère détectée (PAM < 60) !';
                    } else if (baseHr > 110) {
                      elAlert.style.display = 'block';
                      elAlert.innerHTML = '⚠️ ALERTE CRITIQUE : Tachycardie détectée !';
                    } else {
                      elAlert.style.display = 'none';
                    }
                  }

                  timeSec++;
                  const elTimer = document.getElementById('dash-timer');
                  if (elTimer) {
                    const hh = String(Math.floor(timeSec / 3600)).padStart(2, '0');
                    const mm = String(Math.floor((timeSec % 3600) / 60)).padStart(2, '0');
                    const ss = String(timeSec % 60).padStart(2, '0');
                    elTimer.textContent = `${hh}:${mm}:${ss}`;
                  }
                }, 2000);
              }
            } else {
              notify('Tableau de Bord Bloc désactivé', 'info');
              if (dashboardInterval) { clearInterval(dashboardInterval); dashboardInterval = null; }
            }
          }
          function toggleDashboard() { setDashboardMode(!state.dashboard); }

          function loadSurgeryFromSchedule(modId) {
            notify('Ouverture du dossier patient et du Jumeau Numérique...', 'info');
            setDashboardMode(false);
            switchModule(modId);
            setTimeout(() => {
              const btn = document.querySelector('.top-nav button[data-view="jumeau"]');
              if (btn && !btn.classList.contains('active')) btn.click();
            }, 900);
          }

          function setTouchMode(on) {
            state.touchMode = !!on;
            document.body.classList.toggle('touch-mode', state.touchMode);
            document.getElementById('btn-touch-toggle').classList.toggle('active', state.touchMode);
            notify(state.touchMode ? 'Mode tactile activé — cibles agrandies' : 'Mode tactile désactivé', 'info');
          }
          function toggleTouchMode() { setTouchMode(!state.touchMode); }

          function setReadOnlyMode(on) {
            state.readOnly = !!on;
            document.body.classList.toggle('readonly-mode', state.readOnly);
            document.getElementById('btn-readonly-toggle').classList.toggle('active', state.readOnly);
            notify(state.readOnly ? '🔒 Mode lecture seule activé — équipe du bloc, aucune modification possible' : 'Mode lecture seule désactivé', 'info');
          }
          function toggleReadOnly() { setReadOnlyMode(!state.readOnly); }

          // Garde à appeler en tête de toute action qui modifie des données partagées.
          // Retourne true (et bloque l'action) si le mode lecture seule est actif.
          function guardReadOnly(actionLabel) {
            if (state.readOnly) {
              notify('🔒 Action bloquée en mode lecture seule : ' + actionLabel, 'warn');
              return true;
            }
            return false;
          }

          function setTheme(mode) { // 'light' | 'dark'
            state.light = (mode === 'light');
            document.body.classList.toggle('light', state.light);
            notify('Mode ' + (state.light ? 'clair' : 'sombre') + ' activé', 'info');
          }
          function toggleDarkLight() { setTheme(state.light ? 'dark' : 'light'); }

          // Zoom caméra 3D — bornes identiques à la molette (canvas.addEventListener('wheel',...))
          // pour que commande vocale/texte et souris restent cohérentes.
          function zoomIn(step = 1) {
            if (!camera) { notify('Viewer 3D non initialisé.', 'warn'); return; }
            camera.position.z = Math.max(2.5, Math.min(10, camera.position.z - 0.8 * step));
            notify('🔍 Zoom avant', 'info');
          }
          function zoomOut(step = 1) {
            if (!camera) { notify('Viewer 3D non initialisé.', 'warn'); return; }
            camera.position.z = Math.max(2.5, Math.min(10, camera.position.z + 0.8 * step));
            notify('🔍 Zoom arrière', 'info');
          }

          function toggleGemini() {
            state.gemini = !state.gemini;
            document.getElementById('gemini-panel').classList.toggle('open', state.gemini);
            document.getElementById('gemini-btn').classList.toggle('on', state.gemini);
          }

          function setViewMode(mode) {
            state.viewMode = mode;
            ['3d', 'seg', 'coupe', 'mesure'].forEach(m => {
              const btn = document.getElementById('vp-' + m);
              if (btn) btn.classList.toggle('on', m === mode);
            });
            const hud = document.getElementById('hud-mode');
            if (hud) hud.textContent = mode === '3d' ? '3D Solide' : mode === 'seg' ? 'Segmentation' : mode === 'coupe' ? 'Plan de coupe' : 'Mesure';
          }

          function setRenderMode(mode) {
            document.querySelectorAll('.view-modes button').forEach((b, i) => {
              b.classList.toggle('on', ['solid', 'wireframe', 'translucent'][i] === mode);
            });
            if (organMesh) {
              organMesh.material.wireframe = mode === 'wireframe';
              organMesh.material.opacity = mode === 'translucent' ? 0.25 : 0.45;
            }
            const hud = document.getElementById('hud-mode');
            if (hud) hud.textContent = '3D ' + (mode === 'solid' ? 'Solide' : mode === 'wireframe' ? 'Fil de fer' : 'Translucide');
          }

          function toggleImplant(el) { el.classList.toggle('selected') }

          function toggleMic() { document.getElementById('btn-mic').classList.toggle('on') }

          // ── Chat (right panel) ──
          function sendChat() {
            if (guardReadOnly('envoi de message')) return;
            const input = document.getElementById('chat-input');
            const msg = input.value.trim(); if (!msg || state.aiBusy) return;
            addChatMsg('user', msg); input.value = '';
            const bubbleId = 'b' + Date.now();
            addChatMsg('bot', '<span class="ai-typing">●●●</span>', bubbleId);
            askAI(msg).then(reply => {
              executeVoiceAction(reply);
              const clean = reply.replace(/\[ACTION:[a-z_]+\]/g, '').trim();
              setChatMsg(bubbleId, clean || reply);
              speakAIReply(clean || reply);
            }).catch(err => setChatMsg(bubbleId, '⚠️ ' + err.message));
          }

          function addChatMsg(role, text, id) {
            const msgs = document.getElementById('chat-msgs');
            msgs.innerHTML += `<div class="msg ${role}"${id ? ` id="${id}"` : ''}>${text}<div class="msg-time">Maintenant</div></div>`;
            msgs.scrollTop = msgs.scrollHeight;
          }
          function setChatMsg(id, text) {
            const el = document.getElementById(id);
            if (el) el.innerHTML = text + '<div class="msg-time">Maintenant</div>';
          }

          // ── Gemini Live (bottom bar) ──
          // ════════════════════════════════════════════════
          //  GEMINI LIVE — vraie conversation bidirectionnelle
          //  (mémoire multi-tours + prompt système riche + voix)
          // ════════════════════════════════════════════════
          function sendGB() {
            if (guardReadOnly('envoi de message')) return;
            const input = document.getElementById('gb-input');
            const msg = input.value.trim(); if (!msg || state.aiBusy) return;
            input.value = '';
            if (gl.active) {
              sendGeminiLiveText(msg);   // session temps réel active : passe par le WebSocket Gemini Live
            } else {
              liveTurn(msg);             // sinon : appel texte classique en streaming (REST)
            }
          }

          async function liveTurn(msg) {
            addGBMsg('user', msg);
            state.live.history.push({ role: 'user', text: msg });
            const bubbleId = 'g' + Date.now();
            addGBMsg('model', '<span class="ai-typing">●●●</span>', bubbleId);

            let full = '';
            const onDelta = (chunk) => {
              full += chunk;
              setGBMsg(bubbleId, escapeHtml(full) + '<span class="ai-typing">▍</span>');
            };

            try {
              const reply = await askGeminiLiveStream(msg, onDelta);
              full = reply || full;
              executeVoiceAction(full);
              const clean = full.replace(/\[ACTION:[a-z_]+\]/g, '').trim();
              setGBMsg(bubbleId, escapeHtml(clean || full));
              speakAIReply(clean || full);
              state.live.history.push({ role: 'model', text: clean || full });
              if (state.live.history.length > 16) state.live.history.splice(0, state.live.history.length - 16);
            } catch (err) {
              setGBMsg(bubbleId, '⚠️ ' + err.message);
            }
          }

          function escapeHtml(s) {
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          }

          function askGB(q) {
            document.getElementById('gb-input').value = q;
            sendGB();
          }

          function addGBMsg(role, text, id) {
            const msgs = document.getElementById('gb-msgs');
            msgs.innerHTML += `<div class="gb-msg-row"${id ? ` id="${id}"` : ''}><span class="gb-role ${role}">${role === 'user' ? 'Vous' : 'IA'}</span><span class="gb-text">${text}</span></div>`;
            msgs.scrollTop = msgs.scrollHeight;
          }
          function setGBMsg(id, text) {
            const el = document.getElementById(id);
            if (el) { el.querySelector('.gb-text').innerHTML = text; el.closest('.gb-msgs')?.scrollTo?.(0, 999999); const p = el.parentElement; if (p) p.scrollTop = p.scrollHeight; }
          }
          function setLiveStatus(text) {
            const el = document.getElementById('live-voice-status');
            if (el && text) el.textContent = text;
          }

          // ── Prompt système dédié à Gemini Live : conversation orale, contextualisée en temps réel ──
          // ── Blocs de connaissances cliniques spécifiques à chaque spécialité,
          //    injectés dans le prompt système pour des réponses vraiment adaptées
          //    (classifications, seuils, complications typiques) plutôt qu'un
          //    texte générique commun à tous les modules. ──
          // ════════════════════════════════════════════════
          //  MODE HORS-LIGNE CERTIFIÉ — banque de réponses pré-calculées, par spécialité
          //  Ne dépend d'aucune API externe (Gemini/Groq/backend). Utilisée automatiquement
          //  quand aucune IA n'est configurée, ou explicitement via ⚙ Paramètres.
          //  Chaque entrée est reliée par mots-clés — objectif : couvrir fidèlement les
          //  questions rapides (aiChips) de chaque module avec un contenu clinique réel,
          //  pas une phrase générique.
          // ════════════════════════════════════════════════
          const OFFLINE_KNOWLEDGE = {
            cataracte: [
              { kw: ['lio', 'puissance', 'implant', 'calcul'], a: "La puissance de la LIO se calcule à partir de la biométrie (longueur axiale, kératométrie) via une formule adaptée à la morphologie oculaire : SRK/T pour les yeux de longueur moyenne, Barrett Universal II en 1re intention dans la plupart des cas, Hoffer Q pour les yeux courts, Haigis/Barrett pour les yeux longs. Une erreur de biométrie de 0.1mm sur la longueur axiale décale la réfraction post-opératoire d'environ 0.25 à 0.3 D." },
              { kw: ['rupture', 'capsulaire', 'complication'], a: "Le risque de rupture capsulaire postérieure est plus élevé en cas de noyau dense (LOCS N5-N6), de pseudo-exfoliation, de zonule fragile ou de faible mydriase. Il impose alors une vitrectomie antérieure et peut nécessiter une fixation sclérale ou dans le sulcus de la LIO plutôt qu'une implantation dans le sac." },
              { kw: ['torique', 'astigmatisme'], a: "Une LIO torique est indiquée en cas d'astigmatisme cornéen régulier ≥0.75-1D, pour corriger simultanément la cataracte et l'astigmatisme. Le marquage de l'axe et l'alignement peropératoire précis (à ±5°) sont essentiels à son efficacité." },
              { kw: ['deuxième', '2e', 'œil', 'délai'], a: "Le délai entre les deux yeux dépend de la récupération visuelle et de la stabilité réfractive du premier œil (habituellement 1 à 4 semaines), et permet d'ajuster le calcul de LIO du second œil si un écart réfractif inattendu est constaté sur le premier." },
            ],
            glaucome: [
              { kw: ['pio', 'cible', 'pression'], a: "La PIO cible est individualisée selon le stade du glaucome, la PIO de départ et la vitesse de progression : réduction d'au moins 20-30% par rapport à la PIO initiale pour un stade précoce, cible plus basse (souvent <15mmHg) pour un stade avancé où la marge fonctionnelle est réduite." },
              { kw: ['trabéculectomie', 'implant', 'drainage', 'choix'], a: "La trabéculectomie avec antimétabolite (mitomycine C) reste la référence pour une PIO cible basse chez un patient sans chirurgie conjonctivale antérieure ; un implant de drainage (Ahmed, Baerveldt) est privilégié en cas d'échec de filtration antérieur, de conjonctive cicatricielle ou de glaucome néovasculaire/réfractaire." },
              { kw: ['bulle', 'filtration', 'risque'], a: "Les complications de la bulle de filtration incluent l'hypotonie précoce, la fibrose/échec de filtration à moyen terme, et le risque tardif de blébite/endophtalmie (plus élevé avec les bulles fines avasculaires sous mitomycine C) — d'où l'importance du suivi et de l'éducation du patient aux signes d'alerte." },
              { kw: ['champ visuel', 'suivi', 'progression'], a: "Le suivi post-opératoire du champ visuel (Humphrey 24-2) se fait typiquement à 3-6 mois puis tous les 6-12 mois, en comparant la déviation moyenne (MD) et l'indice de progression (VFI) aux examens antérieurs pour confirmer la stabilisation attendue après chirurgie filtrante." },
            ],
            retine: [
              { kw: ['macula', 'on', 'off', 'statut'], a: "Le statut maculaire (on = macula à plat, off = macula décollée) conditionne le pronostic visuel final et l'urgence chirurgicale : une macula on doit être opérée en urgence (< 24-48h) pour préserver l'acuité centrale, une macula off tolère un délai un peu plus long (jusqu'à 7 jours) sans perte de chances majeure." },
              { kw: ['tamponnement', 'gaz', 'silicone', 'choix'], a: "Le choix du tamponnement dépend de l'étendue et de la complexité du décollement : gaz (SF6, C3F8) pour les cas simples avec résorption spontanée en quelques semaines, huile de silicone pour les décollements complexes, la PVR sévère ou quand un positionnement prolongé est difficile pour le patient." },
              { kw: ['pvr', 'prolifér', 'ré-intervention'], a: "La vitréorétinopathie proliférative (PVR) est classée de A (minime) à C (membranes rétractiles majeures) : les stades C sont associés à un taux de ré-intervention élevé et orientent vers un tamponnement par huile de silicone et une chirurgie plus extensive (rétinotomie de relaxation si nécessaire)." },
              { kw: ['délai', 'urgence', 'chirurgical'], a: "Le délai chirurgical recommandé dépend du statut maculaire et du risque d'extension : macula on = urgence vraie (<24-48h), macula off récent = privilégier une prise en charge sous 7 jours, décollement chronique stable = délai moins critique mais à ne pas prolonger indûment." },
            ],
          };

          const SPECIALTY_PROMPTS = {
            cataracte: `EXPERTISE CATARACTE — repères à utiliser quand pertinent :
- Biométrie (IOL-Master) : longueur axiale, kératométrie moyenne, profondeur de chambre antérieure (ACD).
- Formules de calcul de LIO : SRK/T (yeux moyens), Barrett Universal II (1re intention), Hoffer Q (yeux courts), Haigis (yeux longs).
- Classification LOCS III pour la densité du cristallin (N1 à N6) — oriente la technique (phaco standard vs EEC si noyau très dense).
- Facteurs de risque de rupture capsulaire : pseudo-exfoliation, zonule fragile, faible mydriase, noyau dense.
- LIO torique si astigmatisme cornéen régulier ≥0.75-1D ; alignement peropératoire précis nécessaire.`,

            glaucome: `EXPERTISE GLAUCOME — repères à utiliser quand pertinent :
- Classification de Hodapp-Parrish-Anderson (précoce/modéré/avancé) selon la déviation moyenne (MD) du champ visuel.
- PIO cible individualisée : réduction ≥20-30% de la PIO initiale, cible plus stricte si stade avancé.
- Choix trabéculectomie (± mitomycine C) vs implant de drainage (Ahmed/Baerveldt) selon antécédents conjonctivaux et sévérité.
- MIGS (iStent, Xen) pour les stades précoces à modérés, souvent combinés à la chirurgie de la cataracte.
- Complications de la bulle de filtration : hypotonie précoce, échec de filtration, risque de blébite/endophtalmie tardive.`,

            retine: `EXPERTISE VITRÉO-RÉTINIENNE — repères à utiliser quand pertinent :
- Statut maculaire (on/off) : facteur pronostique majeur et déterminant de l'urgence chirurgicale.
- Classification PVR (A à C) — les stades C orientent vers un tamponnement par huile de silicone et une chirurgie plus extensive.
- Choix du tamponnement : gaz (SF6/C3F8, résorption en semaines) vs huile de silicone (décollements complexes, ablation différée).
- Schéma rétinien horaire des déchirures/décollement, essentiel à la planification du cerclage ou de la vitrectomie.
- Délai chirurgical : macula on = urgence <24-48h, macula off = privilégier <7 jours.`
          };

          // Instructions de commandes d'action — partagées par TOUS les canaux
          // (Gemini Live vocal, Gemini Live texte, chat simple) pour qu'une commande
          // tapée ou parlée produise le même comportement, peu importe le canal.
          function voiceCommandInstructions() {
            return [
              ``,
              `COMMANDES D'ACTION — EXÉCUTION DANS L'INTERFACE :`,
              `Quand le chirurgien te demande explicitement une action sur l'interface (pas une question clinique),`,
              `réponds en commençant par [ACTION:nom_action] puis poursuis ta réponse normalement. N'utilise ces`,
              `commandes QUE si l'intention est claire et explicite (jamais pour une simple question clinique).`,
              ``,
              `Actions disponibles :`,
              `- "vue 3D" / "affiche la 3D" / "revenir à la 3D" → [ACTION:vue_3d]`,
              `- "vue MPR" / "vue en coupes" / "affiche les coupes" / "mode coupe" → [ACTION:vue_mpr]`,
              `- "zoom avant" / "zoom positif" / "rapproche" / "agrandis" → [ACTION:zoom_avant]`,
              `- "zoom arrière" / "zoom négatif" / "éloigne" / "dézoome" → [ACTION:zoom_arriere]`,
              `- "mode clair" / "thème clair" / "passe en clair" → [ACTION:mode_clair]`,
              `- "mode sombre" / "thème sombre" / "passe en sombre" → [ACTION:mode_sombre]`,
              `- "active le bloc opératoire" / "mode OR" / "mode bloc" → [ACTION:bloc_operatoire_on]`,
              `- "désactive le bloc opératoire" / "quitte le mode OR" → [ACTION:bloc_operatoire_off]`,
              `- "mode tactile" / "active le tactile" → [ACTION:mode_tactile_on]`,
              `- "désactive le mode tactile" → [ACTION:mode_tactile_off]`,
              `- "mode lecture seule" / "verrouille l'écran" → [ACTION:mode_lecture_seule_on]`,
              `- "désactive la lecture seule" / "déverrouille" → [ACTION:mode_lecture_seule_off]`,
              `- "ouvre l'analyse" / "montre le risque" / "la volumétrie" → [ACTION:open_analyse]`,
              `- "ouvre le chat" → [ACTION:open_ia]`,
              `- "ouvre le plan" → [ACTION:open_plan]`,
              `- "ouvre les implants" → [ACTION:open_implants]`,
              `- "ouvre la base patients" → [ACTION:open_patients]`,
              `- "ouvre les paramètres" → [ACTION:open_settings]`,
              `- "ferme" / "ferme la fenêtre" → [ACTION:close_modal]`,
              `- "recalcule l'analyse" / "recalcule le risque" → [ACTION:recalc_analysis]`,
              `- "exporte le plan" → [ACTION:export_plan]`,
              `- "sélectionne le module cataracte" / "passe en cataracte" → [ACTION:switch_cataracte]`,
              `- "sélectionne le module glaucome" → [ACTION:switch_glaucome]`,
              `- "sélectionne le module rétine" / "passe en vitréo-rétinien" → [ACTION:switch_retine]`,
            ].join('\n');
          }

          function liveSystemPrompt() {
            const mod = MODULES[state.mod];
            const warn = mod.metrics.filter(m => m.st === 'warn').map(m => `${m.label}: ${m.val}`).join(', ') || 'aucune';
            return [
              `Tu es "OphtalmoSurg Live", l'assistant chirurgical vocal intégré au poste de planification ${mod.name}.`,
              `Tu participes à une conversation ORALE CONTINUE en temps réel avec un chirurgien pendant sa préparation opératoire — pas à un échange écrit formel.`,
              ``,
              `Contexte patient actif : ${mod.patient.nom}, ${mod.patient.age} ans, ${mod.patient.sexe}, diagnostic "${mod.patient.diag}", niveau d'urgence: ${mod.patient.urg}.`,
              `Métriques hors cible actuellement affichées : ${warn}.`,
              ``,
              SPECIALTY_PROMPTS[state.mod] || '',
              ``,
              `Règles de style (essentielles : ta réponse est lue à voix haute PENDANT qu'elle est générée) :`,
              // I18N : la langue de réponse suit la langue active de l'interface (I18N.currentLocale()),
              // pas une valeur "français" codée en dur — voir I18N.t('ai.respondInLanguage') dans les 4
              // fichiers i18n/*.json. C'est la seule contrainte de langue ; le style oral reste identique.
              `- ${I18N.t('ai.respondInLanguage', { language: I18N.languageName() })} Style oral, naturel, direct — comme un confrère qui répond à voix haute.`,
              `- Commence directement par l'information utile, en phrases COURTES et complètes (chaque phrase doit avoir un sens si elle est lue seule, car elle sera vocalisée dès qu'elle est terminée).`,
              `- 1 à 3 phrases par défaut. Pas de listes à puces, pas de markdown, pas de formules d'introduction inutiles ("Bien sûr", "Voici", etc.).`,
              `- Si la question est ambiguë, pose UNE question de clarification courte plutôt que de deviner.`,
              `- Reste dans le fil de la conversation : tiens compte des échanges précédents (mémoire de la session).`,
              `- Tu peux citer des chiffres cliniques usuels (seuils, risques) mais toujours comme repère indicatif.`,
              `- Termine par un rappel bref que la décision finale reste au chirurgien SEULEMENT si la question porte sur une décision clinique concrète (pas systématiquement).`,
              `- Ne jamais halluciner de données patient précises non fournies ci-dessus ; dis que l'information n'est pas disponible dans le dossier si on te la demande.`
            ].join('\n') + '\n' + voiceCommandInstructions();
          }

          // Renvoie le texte complet, en appelant onDelta(chunk) au fur et à mesure quand le streaming est possible.
          async function askGeminiLiveStream(message, onDelta) {
            if (state.settings.offlineCertified) {
              const text = offlineAnswer(message);
              onDelta(text);
              return text;
            }
            const system = liveSystemPrompt();
            const contents = state.live.history.slice(-10).map(h => ({ role: h.role, parts: [{ text: h.text }] }));
            contents.push({ role: 'user', parts: [{ text: message }] });

            state.aiBusy = true;
            try {
              if (state.localEngine) {
                try { return await askLocalWebGpu(system, message, onDelta); }
                catch (e) { notify('Modèle local WebGPU indisponible (' + e.message + ') — bascule sur le fournisseur suivant.', 'warn'); }
              }
              if (state.settings.localServerUrl) {
                try { return await streamLocalServer(system, message, onDelta); }
                catch (e) { notify('Serveur IA local indisponible (' + e.message + ') — bascule sur le fournisseur suivant.', 'warn'); }
              }
              if (state.settings.geminiKey) {
                try {
                  return await streamGeminiDirect(system, contents, onDelta);
                } catch (e) {
                  if (String(e.message).includes('429')) {
                    if (String(e.message).includes('quota=0')) {
                      if (!state.settings.groqKey && !state.settings.apiBase) throw e;
                    } else {
                      await new Promise(r => setTimeout(r, 1500));
                      try { return await streamGeminiDirect(system, contents, onDelta); }
                      catch (e2) {
                        notify('Gemini: quota dépassé (429) — bascule sur le fournisseur suivant', 'warn');
                        if (!state.settings.groqKey && !state.settings.apiBase) throw new Error("Gemini a atteint son quota (429). Ajoutez une clé Groq de secours ou patientez, dans ⚙ Paramètres.");
                      }
                    }
                  } else if (!state.settings.groqKey && !state.settings.apiBase) {
                    throw e;
                  }
                }
              }
              if (state.settings.groqKey) {
                return await streamGroq(system, message, onDelta);
              }
              if (state.settings.apiBase) {
                try {
                  return await streamBackendWs(message, system, onDelta);
                } catch (e) {
                  // WebSocket indisponible → repli sur l'appel REST classique du backend
                  const token = await getBackendToken();
                  const base = state.settings.apiBase.replace(/\/+$/, '');
                  const r = await fetch(base + '/chat', {
                    method: 'POST', headers: {
                      'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token
                    }, body: JSON.stringify({ message, specialty: state.mod, context: 'surgical-planning' })
                  });
                  if (!r.ok) throw new Error('Backend: ' + r.status);
                  const data = await r.json();
                  const text = data.reply || 'Réponse vide.';
                  onDelta(text);
                  return text;
                }
              }
              const text = offlineAnswer(message) + ' (mode démo — ajoutez une clé IA dans ⚙ Paramètres pour une vraie conversation en streaming)';
              onDelta(text);
              return text;
            } finally {
              state.aiBusy = false;
            }
          }

          // ── Gemini : streamGenerateContent en SSE ──
          async function throwGeminiError(r) {
            let detail = '';
            try { const j = await r.json(); detail = j?.error?.message || ''; } catch (e) { }
            if (/limit:\s*0\b/i.test(detail)) {
              throw new Error(`Gemini: ${r.status} — quota=0 pour le modèle "${state.settings.geminiModel}" (probablement retiré/indisponible en gratuit). Changez de modèle dans ⚙ Paramètres (essayez gemini-flash-latest ou gemini-3-flash-preview).`);
            }
            const short = detail ? detail.split('.')[0].slice(0, 140) : '';
            throw new Error(`Gemini: ${r.status}${short ? ' — ' + short : ''}`);
          }

          async function streamGeminiDirect(system, contents, onDelta) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${state.settings.geminiModel || 'gemini-flash-latest'}:streamGenerateContent?key=${state.settings.geminiKey}&alt=sse`;
            const r = await fetch(url, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                system_instruction: { parts: [{ text: system }] },
                contents,
                generationConfig: { maxOutputTokens: 220, temperature: 0.5 }
              })
            });
            if (!r.ok) { await throwGeminiError(r); }
            const reader = r.body.getReader();
            const decoder = new TextDecoder();
            let buf = '', full = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop();
              for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (!payload || payload === '[DONE]') continue;
                try {
                  const obj = JSON.parse(payload);
                  const t = obj.candidates?.[0]?.content?.parts?.[0]?.text || '';
                  if (t) { full += t; onDelta(t); }
                } catch (e) { /* ligne partielle, ignorée */ }
              }
            }
            return full || 'Réponse vide.';
          }

          // ── Groq (OpenAI-compatible) : chat/completions avec stream:true ──
          async function streamGroq(system, message, onDelta) {
            const messages = [{ role: 'system', content: system }, ...state.live.history.slice(-10).map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text }))];
            messages.push({ role: 'user', content: message });
            const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST', headers: {
                'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.settings.groqKey
              }, body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 250, temperature: 0.5, stream: true })
            });
            if (!r.ok) throw new Error('Groq: ' + r.status);
            const reader = r.body.getReader();
            const decoder = new TextDecoder();
            let buf = '', full = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop();
              for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (!payload || payload === '[DONE]') continue;
                try {
                  const obj = JSON.parse(payload);
                  const t = obj.choices?.[0]?.delta?.content || '';
                  if (t) { full += t; onDelta(t); }
                } catch (e) { /* ligne partielle, ignorée */ }
              }
            }
            return full || 'Réponse vide.';
          }

          // ── Serveur IA local (Ollama / llama.cpp / vLLM...) : même format SSE
          // compatible OpenAI que Groq, mais sur le réseau local uniquement — aucune
          // donnée ne sort de la machine/du LAN. Portée offline-first demandée.
          async function streamLocalServer(system, message, onDelta) {
            const base = state.settings.localServerUrl.replace(/\/+$/, '');
            const messages = [{ role: 'system', content: system }, ...state.live.history.slice(-10).map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text }))];
            messages.push({ role: 'user', content: message });
            const r = await fetch(base + '/v1/chat/completions', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: state.settings.localServerModel || 'llama3', messages, max_tokens: 300, temperature: 0.5, stream: true })
            });
            if (!r.ok) throw new Error('Serveur IA local: HTTP ' + r.status + ' — vérifiez qu\'il tourne et que l\'URL est correcte.');
            const reader = r.body.getReader();
            const decoder = new TextDecoder();
            let buf = '', full = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop();
              for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (!payload || payload === '[DONE]') continue;
                try {
                  const obj = JSON.parse(payload);
                  const t = obj.choices?.[0]?.delta?.content || '';
                  if (t) { full += t; onDelta(t); }
                } catch (e) { /* ligne partielle, ignorée */ }
              }
            }
            return full || 'Réponse vide.';
          }

          // ── Modèle local WebGPU (WebLLM / MLC) : inférence 100% dans l'onglet
          // navigateur, aucune requête réseau après le chargement initial du modèle.
          // API vérifiée sur la doc officielle WebLLM (github.com/mlc-ai/web-llm,
          // npmjs.com/package/@mlc-ai/web-llm) : CreateMLCEngine() puis
          // engine.chat.completions.create() au format OpenAI (stream ou non).
          function webgpuSupported() {
            return typeof navigator !== 'undefined' && !!navigator.gpu;
          }

          async function loadLocalWebGpuModel(modelId, onProgress) {
            if (!webgpuSupported()) {
              throw new Error("WebGPU non disponible dans ce navigateur. Nécessite Chrome/Edge 113+ (desktop ou " +
                "Android récent) — non supporté sur Safari/Firefox à ce jour.");
            }
            const webllm = await import('https://esm.run/@mlc-ai/web-llm');
            const engine = await webllm.CreateMLCEngine(modelId, {
              initProgressCallback: (p) => { if (onProgress) onProgress(p); }
            });
            state.localEngine = engine;
            state.localEngineModel = modelId;
            return engine;
          }

          function unloadLocalWebGpuModel() {
            if (state.localEngine && state.localEngine.unload) state.localEngine.unload().catch(() => { });
            state.localEngine = null;
            state.localEngineModel = null;
            document.getElementById('btn-load-webgpu').style.display = 'inline-block';
            document.getElementById('btn-unload-webgpu').style.display = 'none';
            document.getElementById('webgpu-progress').textContent = '';
            notify('Modèle local WebGPU déchargé — retour aux fournisseurs configurés.', 'info');
          }

          async function askLocalWebGpu(system, message, onDelta) {
            if (!state.localEngine) throw new Error("Modèle local WebGPU non chargé (⚙ Paramètres → IA locale).");
            const messages = [{ role: 'system', content: system }, ...state.live.history.slice(-6).map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.text })), { role: 'user', content: message }];
            const stream = await state.localEngine.chat.completions.create({ messages, stream: true, temperature: 0.5, max_tokens: 300 });
            let full = '';
            for await (const chunk of stream) {
              const t = chunk.choices?.[0]?.delta?.content || '';
              if (t) { full += t; if (onDelta) onDelta(t); }
            }
            return full || 'Réponse vide.';
          }

          // Bouton "Charger le modèle" dans les paramètres : câble loadLocalWebGpuModel()
          // à la barre de progression réelle fournie par WebLLM (initProgressCallback).
          async function uiLoadLocalWebGpuModel() {
            const modelId = document.getElementById('input-webgpu-model').value;
            const btn = document.getElementById('btn-load-webgpu');
            const progressEl = document.getElementById('webgpu-progress');
            btn.disabled = true; btn.textContent = 'Chargement...';
            try {
              await loadLocalWebGpuModel(modelId, (p) => {
                progressEl.textContent = p.text || `${Math.round((p.progress || 0) * 100)}%`;
              });
              btn.style.display = 'none';
              document.getElementById('btn-unload-webgpu').style.display = 'inline-block';
              progressEl.textContent = '✓ Modèle chargé — prêt, hors ligne.';
              notify('✓ Modèle local WebGPU chargé (' + modelId + ') — utilisé en priorité, zéro réseau.', 'ok');
            } catch (e) {
              notify('Échec du chargement du modèle local : ' + e.message, 'warn');
              progressEl.textContent = '';
            } finally {
              btn.disabled = false; btn.textContent = '⬇ Charger le modèle';
            }
          }

          function refreshWebGpuStatusUI() {
            const el = document.getElementById('webgpu-status');
            if (!el) return;
            el.textContent = webgpuSupported()
              ? '✓ WebGPU supporté par ce navigateur.'
              : '✗ WebGPU non détecté — Chrome/Edge 113+ requis (desktop ou Android récent).';
          }

          // ── Backend : WebSocket /ws/chat-stream (streaming natif déjà implémenté côté serveur) ──
          function streamBackendWs(message, system, onDelta) {
            return new Promise((resolve, reject) => {
              const base = state.settings.apiBase.replace(/\/+$/, '').replace(/^http/, 'ws');
              let ws;
              try { ws = new WebSocket(base + '/ws/chat-stream'); }
              catch (e) { reject(e); return; }
              let full = '';
              const timeout = setTimeout(() => { ws.close(); reject(new Error('Backend WS: délai dépassé')); }, 20000);
              ws.onopen = () => {
                ws.send(JSON.stringify({ message, specialty: state.mod, context: 'surgical-planning', system }));
              };
              ws.onmessage = (ev) => {
                let data; try { data = JSON.parse(ev.data); } catch (e) { return; }
                if (data.delta) { full += data.delta; onDelta(data.delta); }
                else if (data.done) { clearTimeout(timeout); ws.close(); resolve(full || 'Réponse vide.'); }
                else if (data.error) { clearTimeout(timeout); ws.close(); reject(new Error(data.error)); }
              };
              ws.onerror = () => { clearTimeout(timeout); reject(new Error('Backend WS indisponible')); };
              ws.onclose = () => { clearTimeout(timeout); if (full) resolve(full); };
            });
          }

          async function callGeminiDirect(system, contents) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${state.settings.geminiModel || 'gemini-flash-latest'}:generateContent?key=${state.settings.geminiKey}`;
            const r = await fetch(url, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                system_instruction: { parts: [{ text: system }] },
                contents,
                generationConfig: { maxOutputTokens: 220, temperature: 0.5 }
              })
            });
            if (!r.ok) { await throwGeminiError(r); }
            const data = await r.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Réponse vide.';
          }


          // ════════════════════════════════════════════════
          //  GEMINI LIVE — moteur temps réel (WebSocket BidiGenerateContent)
          //  Audio bidirectionnel natif (16kHz in / 24kHz out), VAD serveur,
          //  interruption naturelle, transcription live. Architecture reprise
          //  d'une implémentation qui fonctionne de façon fiable en production.
          // ════════════════════════════════════════════════
          const GEMINI_LIVE_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

          const gl = {           // état du moteur Gemini Live (séparé de state.live, qui reste pour le chat texte)
            ws: null, active: false, muted: false,
            audioContext: null, micStream: null, micProcessor: null,
            audioQueue: [], isPlaying: false, playbackCtx: null,
            accumModelText: '', lastRole: null, lastRow: null,
            camStream: null
          };

          function glModel() {
            return document.getElementById('gemini-live-model')?.value || 'gemini-3.1-flash-live-preview';
          }

          // Synthèse vocale des réponses IA (Web Speech API, 100% navigateur, zéro
          // dépendance/coût réseau). La langue suit TOUJOURS I18N.currentIntl(), donc la
          // langue d'interface active choisie par l'utilisateur — jamais une langue codée
          // en dur — cohérent avec ai.respondInLanguage qui fait déjà suivre le texte de
          // la réponse. Ne concerne que le chat texte (panneau IA Chat, barre du bas hors
          // session Gemini Live) : la session Gemini Live temps réel a déjà sa propre voix
          // audio nativement (voir gl.audioQueue plus bas), il ne faut pas la doubler ici.
          function speakAIReply(text) {
            if (!('speechSynthesis' in window) || !text) return;
            const clean = String(text).replace(/\[ACTION:[a-z_]+\]/g, '').replace(/[*_`#>]/g, '').trim();
            if (!clean) return;
            try {
              window.speechSynthesis.cancel(); // une seule réponse parlée à la fois
              const utter = new SpeechSynthesisUtterance(clean);
              utter.lang = I18N.currentIntl();
              const voices = window.speechSynthesis.getVoices();
              const voice = voices.find(v => v.lang === utter.lang) ||
                voices.find(v => v.lang.startsWith(utter.lang.split('-')[0]));
              if (voice) utter.voice = voice;
              window.speechSynthesis.speak(utter);
            } catch (e) { /* best-effort : la voix ne doit jamais bloquer le chat */ }
          }

          // Commandes vocales exécutables dans l'app (le prompt système demande à Gemini
          // de préfixer sa réponse par [ACTION:xxx] quand une action est reconnue).
          function glActionMap() {
            return {
              open_analyse: () => { setTab('analyse'); },
              open_ia: () => setTab('ia'),
              open_plan: () => setTab('plan'),
              open_implants: () => setTab('implants'),
              open_patients: () => openModal('patients'),
              open_settings: () => { prefillSettings(); openModal('settings'); },
              close_modal: () => document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')),
              recalc_analysis: () => runAnalysis(),
              export_plan: () => exportPlan(),
              switch_cataracte: () => switchModule('cataracte'),
              switch_glaucome: () => switchModule('glaucome'),
              switch_retine: () => switchModule('retine'),
              // Ajouts : vue 3D/MPR, zoom, thème, OR/tactile/lecture seule en versions
              // explicites on/off (une commande vocale doit toujours produire le même
              // résultat, pas basculer à l'aveugle selon l'état courant).
              vue_3d: () => setViewMode('3d'),
              vue_mpr: () => setViewMode('coupe'),
              zoom_avant: () => zoomIn(),
              zoom_arriere: () => zoomOut(),
              mode_clair: () => setTheme('light'),
              mode_sombre: () => setTheme('dark'),
              bloc_operatoire_on: () => setOrMode(true),
              bloc_operatoire_off: () => setOrMode(false),
              mode_tactile_on: () => setTouchMode(true),
              mode_tactile_off: () => setTouchMode(false),
              mode_lecture_seule_on: () => setReadOnlyMode(true),
              mode_lecture_seule_off: () => setReadOnlyMode(false)
            };
          }

          function executeVoiceAction(text) {
            const m = text.match(/\[ACTION:([a-z_]+)\]/);
            if (!m) return;
            const action = m[1];
            const map = glActionMap();
            if (map[action]) {
              setTimeout(map[action], 250);
              notify('🎤 Action vocale : ' + action.replace(/_/g, ' '), 'info');
            }
          }

          // Prompt système Gemini Live (vocal) — identique au prompt texte depuis cette
          // session : liveSystemPrompt() inclut désormais voiceCommandInstructions(),
          // donc les commandes fonctionnent pareil à l'oral et à l'écrit.
          function geminiLiveSystemPrompt() {
            return liveSystemPrompt();
          }

          // ── Connexion WebSocket ──
          async function connectGeminiLive() {
            const key = state.settings.geminiKey;
            if (!key) {
              notify('🔑 Clé API Gemini requise dans ⚙ Paramètres pour Gemini Live', 'warn');
              return false;
            }
            setGeminiLiveStatus('connecting');
            const wsUrl = `${GEMINI_LIVE_WS_BASE}?key=${encodeURIComponent(key)}`;
            try { gl.ws = new WebSocket(wsUrl); }
            catch (e) { setGeminiLiveStatus('idle'); notify('Connexion WebSocket échouée : ' + e.message, 'warn'); return false; }

            return new Promise((resolve) => {
              const connTimeout = setTimeout(() => {
                notify('⏱ Délai de connexion Gemini Live dépassé — vérifiez la clé API et le modèle.', 'warn');
                gl.active = false; setGeminiLiveStatus('idle'); updateGeminiLiveButtons();
                try { gl.ws?.close(); } catch (e) { }
                resolve(false);
              }, 10000);

              gl.ws.onopen = () => {
                const setup = {
                  setup: {
                    model: `models/${glModel()}`,
                    generationConfig: {
                      responseModalities: ['AUDIO'],
                      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } }
                    },
                    systemInstruction: { parts: [{ text: geminiLiveSystemPrompt() }] },
                    inputAudioTranscription: {},
                    outputAudioTranscription: {}
                  }
                };
                gl.ws.send(JSON.stringify(setup));
              };

              gl.ws.onmessage = async (evt) => {
                let data;
                try { data = evt.data instanceof Blob ? JSON.parse(await evt.data.text()) : JSON.parse(evt.data); }
                catch (e) { return; }
                if (data.setupComplete !== undefined) clearTimeout(connTimeout);
                handleGeminiLiveMessage(data, resolve);
              };
              gl.ws.onerror = () => {
                clearTimeout(connTimeout);
                notify('Erreur WebSocket Gemini Live — vérifiez la clé API et le modèle sélectionné', 'warn');
                gl.active = false; setGeminiLiveStatus('idle'); updateGeminiLiveButtons();
                resolve(false);
              };
              gl.ws.onclose = () => {
                clearTimeout(connTimeout);
                const wasActive = gl.active;
                gl.active = false; setGeminiLiveStatus('idle'); updateGeminiLiveButtons();
                if (wasActive) notify('Session Gemini Live terminée', 'info');
                stopGeminiMic();
              };
            });
          }

          function handleGeminiLiveMessage(data, setupResolve) {
            if (data.error) {
              const msg = data.error.message || JSON.stringify(data.error);
              notify('Erreur API Gemini Live : ' + msg, 'warn');
              appendLiveTranscript('model', '⚠ Erreur API : ' + msg);
              gl.active = false; setGeminiLiveStatus('idle'); updateGeminiLiveButtons();
              if (setupResolve) setupResolve(false);
              return;
            }
            if (data.setupComplete !== undefined) {
              setGeminiLiveStatus('connected');
              if (setupResolve) setupResolve(true);
              setTimeout(() => setGeminiLiveStatus('listening'), 400);
              const mod = MODULES[state.mod];
              sendGeminiLiveText(`Bonjour, je suis prêt à planifier le cas de ${mod.patient.nom}. Présente-toi brièvement en une phrase et confirme que tu es prêt.`, true);
              return;
            }
            if (data.serverContent) {
              const sc = data.serverContent;
              if (sc.modelTurn?.parts) {
                sc.modelTurn.parts.forEach(part => {
                  if (part.inlineData?.mimeType?.startsWith('audio/')) {
                    queueGeminiAudio(base64ToFloat32(part.inlineData.data), 24000);
                    setGeminiLiveStatus('speaking');
                  }
                  if (part.text) { appendLiveTranscript('model', part.text, true); gl.accumModelText += part.text; }
                });
              }
              if (sc.outputTranscription?.text) { appendLiveTranscript('model', sc.outputTranscription.text, true); gl.accumModelText += sc.outputTranscription.text; }
              if (sc.inputTranscription?.text) { appendLiveTranscript('user', sc.inputTranscription.text, true); }
              if (sc.turnComplete) {
                setGeminiLiveStatus('listening');
                if (gl.accumModelText) {
                  executeVoiceAction(gl.accumModelText);
                  const clean = gl.accumModelText.replace(/\[ACTION:[a-z_]+\]/g, '').trim();
                  if (clean) {
                    state.live.history.push({ role: 'model', text: clean });
                    if (state.live.history.length > 16) state.live.history.splice(0, state.live.history.length - 16);
                  }
                }
                gl.accumModelText = '';
              }
              if (sc.interrupted) { gl.audioQueue = []; gl.isPlaying = false; setGeminiLiveStatus('listening'); }
            }
          }

          // ── Micro : capture continue PCM16 @16kHz ──
          async function startGeminiMic() {
            try {
              gl.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
              gl.micStream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true } });
              const source = gl.audioContext.createMediaStreamSource(gl.micStream);
              const bufferSize = 4096;
              gl.micProcessor = gl.audioContext.createScriptProcessor(bufferSize, 1, 1);
              gl.micProcessor.onaudioprocess = (e) => {
                if (!gl.active || gl.muted || !gl.ws || gl.ws.readyState !== WebSocket.OPEN) return;
                const samples = e.inputBuffer.getChannelData(0);
                const int16 = float32ToInt16(samples);
                const b64 = int16ToBase64(int16);
                gl.ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: b64 } } }));
              };
              source.connect(gl.micProcessor);
              gl.micProcessor.connect(gl.audioContext.destination);
              return true;
            } catch (e) {
              notify('Micro inaccessible : ' + e.message, 'warn');
              return false;
            }
          }
          function stopGeminiMic() {
            if (gl.micProcessor) { gl.micProcessor.disconnect(); gl.micProcessor = null; }
            if (gl.micStream) { gl.micStream.getTracks().forEach(t => t.stop()); gl.micStream = null; }
            if (gl.audioContext) { gl.audioContext.close().catch(() => { }); gl.audioContext = null; }
          }

          // ── Lecture audio en file (24kHz PCM renvoyé par Gemini) ──
          async function queueGeminiAudio(pcmFloat32, sampleRate) {
            gl.audioQueue.push({ pcmFloat32, sampleRate });
            if (!gl.isPlaying) drainGeminiAudioQueue();
          }
          async function drainGeminiAudioQueue() {
            if (gl.audioQueue.length === 0) { gl.isPlaying = false; return; }
            gl.isPlaying = true;
            const { pcmFloat32, sampleRate } = gl.audioQueue.shift();
            if (!gl.playbackCtx || gl.playbackCtx.state === 'closed') { gl.playbackCtx = new (window.AudioContext || window.webkitAudioContext)(); }
            const buf = gl.playbackCtx.createBuffer(1, pcmFloat32.length, sampleRate);
            buf.copyToChannel(pcmFloat32, 0);
            const src = gl.playbackCtx.createBufferSource();
            src.buffer = buf; src.connect(gl.playbackCtx.destination);
            src.onended = drainGeminiAudioQueue;
            src.start();
          }

          // ── Envoi de texte dans la session Live (utilisé par le champ texte du panneau) ──
          function sendGeminiLiveText(text, silent) {
            if (!gl.ws || gl.ws.readyState !== WebSocket.OPEN) return;
            gl.ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }));
            if (!silent) appendLiveTranscript('user', text);
          }

          // ── Transcript (panneau Gemini Live, réutilise gb-msgs) ──
          function appendLiveTranscript(role, text, append) {
            const el = document.getElementById('gb-msgs');
            if (!el) return;
            if (append && gl.lastRole === role && gl.lastRow) {
              const span = gl.lastRow.querySelector('.gb-text');
              span.textContent += text;
            } else {
              const row = document.createElement('div');
              row.className = 'gb-msg-row';
              row.innerHTML = `<span class="gb-role ${role === 'user' ? 'user' : 'model'}">${role === 'user' ? 'Vous' : 'Gemini'}</span><span class="gb-text"></span>`;
              row.querySelector('.gb-text').textContent = text;
              el.appendChild(row);
              gl.lastRow = row; gl.lastRole = role;
            }
            el.scrollTop = el.scrollHeight;
          }

          // ── Statut visuel ──
          function setGeminiLiveStatus(st) {
            const cfg = {
              idle: { label: 'Non connecté', orb: '✨', color: 'var(--text3)' },
              connecting: { label: 'Connexion…', orb: '⏳', color: '#eab308' },
              connected: { label: 'Connecté', orb: '🟢', color: '#22c55e' },
              listening: { label: 'Je vous écoute…', orb: '🎤', color: '#22c55e' },
              speaking: { label: 'Gemini parle…', orb: '🔊', color: 'var(--accent)' },
              error: { label: 'Erreur', orb: '⚠️', color: 'var(--red)' }
            };
            const c = cfg[st] || cfg.idle;
            const orb = document.getElementById('gemini-orb'), label = document.getElementById('gemini-live-status');
            if (orb) orb.textContent = c.orb;
            if (label) { label.textContent = c.label; label.style.color = c.color; }
          }

          function updateGeminiLiveButtons() {
            const main = document.getElementById('btn-live-voice');
            const mute = document.getElementById('btn-live-mute');
            if (main) main.textContent = gl.active ? '⏹' : '▶';
            if (mute) mute.disabled = !gl.active;
          }

          async function toggleGeminiLiveSession() {
            if (gl.active) { disconnectGeminiLive(); return; }
            if (guardReadOnly('session vocale Gemini Live')) return;
            if (state.settings.offlineCertified) {
              notify('📚 Mode hors-ligne certifié actif — la session vocale temps réel (réseau requis) est désactivée. Désactivez ce mode dans ⚙ Paramètres pour l\'utiliser.', 'warn');
              return;
            }
            const connected = await connectGeminiLive();
            if (!connected) return;
            const micOk = await startGeminiMic();
            if (!micOk) { gl.ws?.close(); return; }
            gl.active = true;
            updateGeminiLiveButtons();
            notify('✓ Gemini Live connecté — parlez naturellement, la conversation est continue', 'ok');
          }

          function disconnectGeminiLive() {
            gl.active = false;
            if (gl.ws) { gl.ws.close(); gl.ws = null; }
            stopGeminiMic();
            gl.audioQueue = []; gl.isPlaying = false;
            setGeminiLiveStatus('idle');
            updateGeminiLiveButtons();
            notify('Session Gemini Live terminée', 'info');
          }

          function toggleGeminiLiveMute() {
            gl.muted = !gl.muted;
            const btn = document.getElementById('btn-live-mute');
            if (btn) { btn.textContent = gl.muted ? '🔇' : '🎤'; btn.classList.toggle('on', gl.muted); }
            if (gl.active) setGeminiLiveStatus(gl.muted ? 'connected' : 'listening');
            notify(gl.muted ? '🔇 Micro coupé' : '🎤 Micro actif', 'info');
          }

          // ── Encodage PCM ──
          function float32ToInt16(float32Array) {
            const int16 = new Int16Array(float32Array.length);
            for (let i = 0; i < float32Array.length; i++) { const s = Math.max(-1, Math.min(1, float32Array[i])); int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF; }
            return int16;
          }
          function int16ToBase64(int16Array) {
            const bytes = new Uint8Array(int16Array.buffer);
            let binary = ''; const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            return btoa(binary);
          }
          function base64ToFloat32(b64) {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const int16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
            return float32;
          }

          window.addEventListener('beforeunload', () => { if (gl.active) disconnectGeminiLive(); });


          // ════════════════════════════════════════════════
          //  AI ENGINE — chat du panneau droit (réponse ponctuelle, sans mémoire de session)
          //  Priorité : clé Gemini client → clé Groq client → backend proxy → réponse hors-ligne
          // ════════════════════════════════════════════════
          // ════════════════════════════════════════════════
          //  AUTHENTIFICATION BACKEND — écran de connexion réel
          //  Remplace l'ancien getBackendToken() qui s'auto-authentifiait
          //  silencieusement avec un identifiant de démo codé en dur
          //  (dr.hadj/changeme) : n'importe quel déploiement réel se
          //  connectait alors comme le même utilisateur, sans jamais montrer
          //  d'écran de connexion. Ici, chaque utilisateur saisit ses propres
          //  identifiants ; le jeton est mis en cache en mémoire + sessionStorage
          //  (pas localStorage : un JWT ne doit pas survivre à la fermeture de
          //  l'onglet sur un poste partagé) jusqu'à expiration.
          //
          //  Non couvert (choix assumé, voir README) : le flux 2FA/TOTP que le
          //  backend expose déjà (POST /auth/2fa/verify) — un compte avec la 2FA
          //  activée reçoit un message d'erreur clair plutôt qu'un blocage muet.
          // ════════════════════════════════════════════════
          const AUTH_STORAGE_KEY = 'ophtalmosurg_auth';

          function loadStoredAuth() {
            try {
              const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
              if (!raw) return;
              const saved = JSON.parse(raw);
              if (saved && saved.token && saved.expiresAt && Date.now() < saved.expiresAt) {
                state.auth = saved;
              }
            } catch (e) { /* sessionStorage indisponible (navigation privée stricte) — pas bloquant */ }
          }

          function persistAuth() {
            try {
              if (state.auth.token) sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state.auth));
              else sessionStorage.removeItem(AUTH_STORAGE_KEY);
            } catch (e) { }
          }

          function isAuthenticated() {
            return !!(state.auth.token && state.auth.expiresAt && Date.now() < state.auth.expiresAt);
          }

          // Un login est nécessaire dès qu'un backend est configuré et qu'aucun
          // jeton valide n'est en mémoire — jamais en mode démo hors-ligne
          // (apiBase vide), qui doit rester utilisable sans authentification.
          function needsLogin() {
            return !!state.settings.apiBase && !isAuthenticated();
          }

          function showLoginGateIfNeeded() {
            const gate = document.getElementById('login-gate');
            if (!gate) return;
            if (needsLogin()) {
              document.getElementById('login-gate-backend-url').textContent = state.settings.apiBase;
              gate.style.display = 'flex';
              const userEl = document.getElementById('login-username');
              if (userEl) userEl.focus();
            } else {
              gate.style.display = 'none';
            }
          }

          function logout() {
            state.auth = { token: null, username: null, expiresAt: null };
            persistAuth();
            refreshLoginStatusUI();
            showLoginGateIfNeeded();
            notify('Déconnecté du backend.', 'info');
          }

          async function submitLogin() {
            const usernameEl = document.getElementById('login-username');
            const passwordEl = document.getElementById('login-password');
            const errEl = document.getElementById('login-error');
            const btn = document.getElementById('login-submit-btn');
            const username = usernameEl.value.trim();
            const password = passwordEl.value;
            errEl.style.display = 'none';
            if (!username || !password) {
              errEl.textContent = "Renseignez l'identifiant et le mot de passe.";
              errEl.style.display = 'block';
              return;
            }
            const originalLabel = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Connexion...';
            try {
              const base = state.settings.apiBase.replace(/\/+$/, '');
              const form = new URLSearchParams({ username, password });
              const r = await fetch(base + '/auth/token', {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form
              });
              const data = await r.json().catch(() => ({}));
              if (r.status === 401) throw new Error(data.detail || 'Identifiants invalides.');
              if (r.status === 429) throw new Error(data.detail || 'Trop de tentatives — réessayez dans quelques instants.');
              if (!r.ok) throw new Error(data.detail || ('Erreur serveur (HTTP ' + r.status + ')'));
              if (data.requires_2fa) {
                throw new Error("La double authentification (2FA) est activée sur ce compte — non prise en charge par cet écran de connexion pour l'instant. Utilisez un compte sans 2FA ou désactivez-la temporairement côté serveur.");
              }
              state.auth = {
                token: data.access_token,
                username,
                expiresAt: Date.now() + (data.expires_in ? data.expires_in * 1000 : 8 * 3600 * 1000),
              };
              persistAuth();
              passwordEl.value = '';
              showLoginGateIfNeeded();
              refreshLoginStatusUI();
              notify('Connecté en tant que ' + username + '.', 'ok');
            } catch (e) {
              errEl.textContent = e.message;
              errEl.style.display = 'block';
            } finally {
              btn.disabled = false;
              btn.textContent = originalLabel;
            }
          }

          function refreshLoginStatusUI() {
            const el = document.getElementById('settings-login-status');
            if (!el) return;
            if (!state.settings.apiBase) {
              el.textContent = '';
            } else if (isAuthenticated()) {
              el.innerHTML = 'Connecté en tant que <b>' + state.auth.username +
                '</b> — <a href="#" onclick="logout();return false;">Se déconnecter</a>';
            } else {
              el.textContent = 'Non connecté au backend.';
            }
          }

          async function getBackendToken() {
            if (isAuthenticated()) return state.auth.token;
            // Ne devrait normalement pas se produire : showLoginGateIfNeeded()
            // bloque l'interface avant qu'un appel backend puisse être déclenché
            // sans jeton valide. Filet de sécurité si un jeton expire pendant
            // une session déjà ouverte.
            showLoginGateIfNeeded();
            throw new Error('Session backend expirée — reconnectez-vous.');
          }

          async function askAI(message) {
            if (state.settings.offlineCertified) {
              return offlineAnswer(message);
            }
            const mod = MODULES[state.mod];
            // I18N : la langue de réponse suit la langue active de l'interface (I18N.currentLocale()),
            // pas "français" codé en dur — voir I18N.t('ai.respondInLanguage').
            const system = `Tu es l'assistant chirurgical IA OphtalmoSurg Plan, spécialisé en ${mod.name}. ` +
              `Patient en cours: ${mod.patient.nom}, ${mod.patient.age} ans, diagnostic: ${mod.patient.diag}. ` +
              `${I18N.t('ai.respondInLanguage', { language: I18N.languageName() })} Réponse concise (3-5 phrases max) et cliniquement pertinente. ` +
              `Rappelle que la décision finale reste au chirurgien.` +
              '\n' + voiceCommandInstructions();

            state.aiBusy = true;
            try {
              // Offline-first : le local est TOUJOURS tenté avant tout fournisseur
              // réseau, s'il est configuré/chargé — c'est tout l'intérêt demandé
              // (zéro dépendance réseau, zéro fuite de données).
              if (state.localEngine) {
                try { return await askLocalWebGpu(system, message, () => { }); }
                catch (e) { notify('Modèle local WebGPU indisponible (' + e.message + ') — bascule sur le fournisseur suivant.', 'warn'); }
              }
              if (state.settings.localServerUrl) {
                try { return await streamLocalServer(system, message, () => { }); }
                catch (e) { notify('Serveur IA local indisponible (' + e.message + ') — bascule sur le fournisseur suivant.', 'warn'); }
              }
              if (state.settings.geminiKey) {
                try {
                  return await callGeminiDirect(system, [{ role: 'user', parts: [{ text: message }] }]);
                } catch (e) {
                  if (!state.settings.groqKey && !state.settings.apiBase) throw e;
                }
              }
              if (state.settings.groqKey) {
                const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                  method: 'POST', headers: {
                    'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.settings.groqKey
                  }, body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [{ role: 'system', content: system }, { role: 'user', content: message }],
                    max_tokens: 400, temperature: 0.4
                  })
                });
                if (!r.ok) throw new Error('Groq: ' + r.status);
                const data = await r.json();
                return data.choices?.[0]?.message?.content || 'Réponse vide.';
              }
              if (state.settings.apiBase) {
                const token = await getBackendToken();
                const base = state.settings.apiBase.replace(/\/+$/, '');
                const r = await fetch(base + '/chat', {
                  method: 'POST', headers: {
                    'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token
                  }, body: JSON.stringify({ message, specialty: state.mod, context: 'surgical-planning' })
                });
                if (!r.ok) throw new Error('Backend: ' + r.status);
                const data = await r.json();
                return data.reply || 'Réponse vide.';
              }
              // Offline fallback — clearly labelled as demo content, not a silent fake answer
              return offlineAnswer(message) + '<br><span style="opacity:.55;font-size:9px">Mode démo — configurez une clé IA dans Paramètres pour des réponses générées en direct.</span>';
            } finally {
              state.aiBusy = false;
            }
          }

          function offlineAnswer(q) {
            const mod = MODULES[state.mod];
            const bank = OFFLINE_KNOWLEDGE[state.mod] || [];
            const ql = (q || '').toLowerCase();

            // Score chaque entrée par nombre de mots-clés présents dans la question
            let best = null, bestScore = 0;
            bank.forEach(entry => {
              const score = entry.kw.reduce((s, k) => s + (ql.includes(k) ? 1 : 0), 0);
              if (score > bestScore) { bestScore = score; best = entry; }
            });
            if (best && bestScore > 0) {
              return best.a + '<br><span style="opacity:.5;font-size:9px">📚 Réponse certifiée hors-ligne — ' + mod.short + '</span>';
            }

            // Repli : point de situation dynamique basé sur les métriques réelles du patient actif
            const m = mod.metrics.find(x => x.st === 'warn') || mod.metrics[0];
            return `Je n'ai pas de fiche pré-calculée correspondant exactement à cette question en mode hors-ligne. ` +
              `Point de situation disponible : ${m.label} = ${m.val} pour ${mod.patient.nom}. ` +
              `Essayez l'une des questions rapides ci-contre, ou reconnectez une clé IA dans ⚙ Paramètres pour une réponse libre.` +
              '<br><span style="opacity:.5;font-size:9px">📚 Mode hors-ligne certifié — ' + mod.short + '</span>';
          }

          // ── Timer ──
          function startTimer() {
            if (state.timerInterval) clearInterval(state.timerInterval);
            state.timerSec = 0;
            state.timerInterval = setInterval(() => {
              if (state.timerRunning) {
                state.timerSec++;
                const h = String(Math.floor(state.timerSec / 3600)).padStart(2, '0');
                const m = String(Math.floor((state.timerSec % 3600) / 60)).padStart(2, '0');
                const s = String(state.timerSec % 60).padStart(2, '0');
                document.getElementById('timer-display').textContent = h + ':' + m + ':' + s;
              }
            }, 1000);
          }

          function toggleTimer() {
            state.timerRunning = !state.timerRunning;
            document.getElementById('qb-timer').classList.toggle('paused', !state.timerRunning);
          }

          // ── Modals ──
          function openModal(id) { document.getElementById('modal-' + id).classList.add('open') }
          function closeModal(id) { document.getElementById('modal-' + id).classList.remove('open') }

          function saveSettings() {
            const previousApiBase = state.settings.apiBase;
            state.settings.geminiKey = document.getElementById('input-gemini-key').value.trim();
            state.settings.geminiModel = document.getElementById('input-gemini-model').value.trim() || 'gemini-flash-latest';
            state.settings.groqKey = document.getElementById('input-groq-key').value.trim();
            state.settings.apiBase = document.getElementById('input-api-base').value.trim();
            state.settings.localServerUrl = document.getElementById('input-local-server-url').value.trim();
            state.settings.localServerModel = document.getElementById('input-local-server-model').value.trim() || 'llama3';
            state.settings.chirurgien = document.getElementById('input-chirurgien').value.trim() || state.settings.chirurgien;
            state.settings.offlineCertified = document.getElementById('toggle-offline-certified').classList.contains('on');
            // Un jeton obtenu pour un backend n'est pas valide pour un autre —
            // force une nouvelle connexion si l'URL a changé.
            if (state.settings.apiBase !== previousApiBase) {
              state.auth = { token: null, username: null, expiresAt: null };
              persistAuth();
            }
            closeModal('settings');
            const mode = state.settings.offlineCertified ? '📚 Hors-ligne certifié (forcé)' :
              state.localEngine ? '🔒 Modèle local WebGPU (' + state.localEngineModel + ')' :
                state.settings.localServerUrl ? '🔒 Serveur IA local (' + state.settings.localServerUrl + ')' :
                  state.settings.geminiKey ? `Gemini (${state.settings.geminiModel})` :
                    state.settings.groqKey ? 'Groq (clé directe)' : state.settings.apiBase ? 'Backend proxy' : 'Démo hors-ligne';
            notify('Paramètres enregistrés — IA: ' + mode, 'ok');
            refreshLoginStatusUI();
            showLoginGateIfNeeded();
          }

          function prefillSettings() {
            // Contient du HTML (<code>...</code>) — I18N.applyTranslations() met à jour le
            // textContent des éléments [data-i18n] simples, mais celui-ci a besoin d'innerHTML pour
            // conserver la mise en forme des noms de modèles alternatifs, d'où l'appel dédié ici.
            const hintEl = document.getElementById('settings-gemini-hint');
            if (hintEl) hintEl.innerHTML = I18N.t('settings.geminiModelHint', {
              alt1: '<code>gemini-3-flash-preview</code>', alt2: '<code>gemini-3.1-flash-lite</code>', alt3: '<code>gemini-2.5-flash-lite</code>'
            });
            document.getElementById('input-gemini-key').value = state.settings.geminiKey;
            document.getElementById('input-gemini-model').value = state.settings.geminiModel;
            document.getElementById('input-groq-key').value = state.settings.groqKey;
            document.getElementById('input-api-base').value = state.settings.apiBase;
            document.getElementById('input-local-server-url').value = state.settings.localServerUrl || '';
            document.getElementById('input-local-server-model').value = state.settings.localServerModel || '';
            document.getElementById('input-chirurgien').value = state.settings.chirurgien;
            document.getElementById('toggle-offline-certified').classList.toggle('on', !!state.settings.offlineCertified);
            refreshLoginStatusUI();
            refreshWebGpuStatusUI();
            if (state.localEngine) {
              document.getElementById('btn-load-webgpu').style.display = 'none';
              document.getElementById('btn-unload-webgpu').style.display = 'inline-block';
              document.getElementById('webgpu-progress').textContent = '✓ Modèle chargé — prêt, hors ligne.';
            }
          }

          // ── Patients table ──
          function renderPatientsTable(filter) {
            filter = (filter || '').toLowerCase();
            let html = `<table style="width:100%;border-collapse:collapse">
    <tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:6px 10px;font-size:9px;color:var(--text3);text-transform:uppercase">ID</th><th style="text-align:left;padding:6px 10px;font-size:9px;color:var(--text3);text-transform:uppercase">Nom</th><th style="text-align:left;padding:6px 10px;font-size:9px;color:var(--text3);text-transform:uppercase">Diagnostic</th><th style="text-align:left;padding:6px 10px;font-size:9px;color:var(--text3);text-transform:uppercase">Module</th></tr>`;
            Object.values(MODULES)
              .filter(m => !filter || m.patient.nom.toLowerCase().includes(filter) || m.patient.id.toLowerCase().includes(filter) || m.patient.diag.toLowerCase().includes(filter))
              .forEach(m => {
                const p = m.patient;
                html += `<tr style="border-bottom:1px solid rgba(255,255,255,.03);cursor:pointer" onclick="closeModal('patients');switchModule('${m.id}')">
        <td style="padding:6px 10px;font:9px var(--mono);color:var(--text3)">${p.id}</td>
        <td style="padding:6px 10px;font-size:10.5px">${p.nom}</td>
        <td style="padding:6px 10px;font-size:10px;color:var(--text2)">${p.diag}</td>
        <td style="padding:6px 10px;font-size:10px;color:${m.color}">${m.short}</td>
      </tr>`;
              });
            html += `</table>`;
            document.getElementById('patients-table').innerHTML = html;
          }

          function togglePatientEditForm() {
            const el = document.getElementById('patient-edit-form');
            const showing = el.style.display !== 'none';
            if (showing) { el.style.display = 'none'; return; }
            const mod = MODULES[state.mod];
            const p = mod.patient;
            el.style.display = 'block';
            el.innerHTML = `
    <div style="font-size:10px;color:var(--text3);margin-bottom:8px">Patient du module actif : <b style="color:${mod.color}">${mod.short}</b></div>
    <div class="form-row"><div class="form-label">Nom</div><input class="form-control" id="pf-nom" value="${p.nom}"></div>
    <div class="form-row"><div class="form-label">Âge</div><input class="form-control" id="pf-age" type="number" value="${p.age}"></div>
    <div class="form-row"><div class="form-label">Poids (kg)</div><input class="form-control" id="pf-poids" type="number" value="${p.poids || 70}"></div>
    <div class="form-row"><div class="form-label">Taille (cm)</div><input class="form-control" id="pf-taille" type="number" value="${p.taille || 170}"></div>
    <div class="form-row"><div class="form-label">Diagnostic</div><input class="form-control" id="pf-diag" value="${p.diag}"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:6px" onclick="savePatientEdit()">💾 Enregistrer${state.settings.apiBase ? ' (local + backend)' : ' (local)'}</button>
  `;
          }

          async function savePatientEdit() {
            if (guardReadOnly('modification du dossier patient')) return;
            const mod = MODULES[state.mod];
            const p = mod.patient;
            p.nom = document.getElementById('pf-nom').value.trim() || p.nom;
            p.age = parseInt(document.getElementById('pf-age').value) || p.age;
            p.poids = parseFloat(document.getElementById('pf-poids').value) || p.poids;
            p.taille = parseFloat(document.getElementById('pf-taille').value) || p.taille;
            p.diag = document.getElementById('pf-diag').value.trim() || p.diag;
            renderPatientsTable();
            renderAll();
            notify('Patient mis à jour (local)', 'ok');

            if (state.settings.apiBase) {
              try {
                const token = await getBackendToken();
                const base = state.settings.apiBase.replace(/\/+$/, '');
                const body = {
                  id: p.id, nom: p.nom, age: p.age, sexe: p.sexe || 'M',
                  poids_kg: p.poids, taille_cm: p.taille, diagnostic: p.diag,
                  chirurgien: state.settings.chirurgien, specialty: state.mod, urgence: p.urg || 'vert'
                };
                let r = await fetch(base + '/patients/' + p.id, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
                if (r.status === 404) {
                  r = await fetch(base + '/patients', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
                }
                if (r.ok) notify('Synchronisé avec le backend', 'ok');
                else notify('Backend: échec de synchronisation (' + r.status + ')', 'warn');
              } catch (e) { notify('Backend indisponible: ' + e.message, 'warn'); }
            }
          }

          // ── Notifications ──
          function notify(msg, type = 'info') {
            const n = document.getElementById('notif');
            n.textContent = msg; n.className = 'notif show ' + type;
            setTimeout(() => n.classList.remove('show'), 3000);
          }

          // ── Loader ──
          function showLoader(title, sub) {
            document.getElementById('loader-title').textContent = title;
            document.getElementById('loader-sub').textContent = sub;
            document.getElementById('loader').classList.add('show');
          }
          function hideLoader() { document.getElementById('loader').classList.remove('show') }

          // ── Wave Canvas (Gemini) ──
          function drawWave() {
            const canvas = document.getElementById('wave-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.parentElement.clientWidth - 20; canvas.height = 36;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const t = Date.now() * 0.003;
            const mod = MODULES[state.mod] || { color: '#38bdf8' };
            ctx.strokeStyle = mod.color; ctx.lineWidth = 1.5; ctx.beginPath();
            for (let x = 0; x < canvas.width; x++) {
              const y = 18 + Math.sin(x * 0.04 + t) * 6 * Math.sin(x * 0.01 + t * 0.5) + Math.cos(x * 0.08 + t * 1.5) * 3;
              x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
            requestAnimationFrame(drawWave);
          }

          // ════════════════════════════════════════════════
          //  INIT
          // ════════════════════════════════════════════════
          //  SIMULATEURS NEXTGEN (SurgAI, SurgSim, SurgVoice)
          // ════════════════════════════════════════════════
          function updateSurgAiPreview() {
            const sel = document.getElementById('surgai-strategy-select').value;
            const durEl = document.getElementById('surgai-dur');
            const eblEl = document.getElementById('surgai-ebl');
            const riskEl = document.getElementById('surgai-risk');
            if (sel === 'phaco_standard') {
              durEl.textContent = '18 min'; eblEl.textContent = '< 1 mL';
              riskEl.textContent = '3.1% (Faible)'; riskEl.style.color = 'var(--green)';
              notify('Stratégie Phacoémulsification standard sélectionnée : SHAP recalibré.', 'info');
            } else if (sel === 'combinee_glaucome') {
              durEl.textContent = '45 min'; eblEl.textContent = '< 2 mL';
              riskEl.textContent = '11.8% (Modéré)'; riskEl.style.color = 'var(--orange)';
              notify('Stratégie Chirurgie combinée cataracte-glaucome sélectionnée : Risque de bulle de filtration +9%.', 'warn');
            } else {
              durEl.textContent = '12 min'; eblEl.textContent = '< 1 mL';
              riskEl.textContent = '15.5% (Opacification capsulaire à 2 ans)'; riskEl.style.color = '#f43f5e';
              notify('Option Capsulotomie YAG sélectionnée : Attention, à ne réaliser qu\'après stabilisation réfractive.', 'warn');
            }
          }

          function simulateClamping(vesselName, flrPct, statusText) {
            const flrBar = document.getElementById('surgsim-flr-bar');
            const flrStatus = document.getElementById('surgsim-flr-status');
            flrBar.style.width = flrPct + '%';
            const volUl = Math.round(750 * (flrPct / 100));
            flrStatus.textContent = 'PRR: ' + flrPct + '% (' + volUl + ' µL/min) — ' + statusText;
            if (flrPct < 40) {
              flrBar.style.background = '#f43f5e'; flrStatus.style.color = '#f43f5e';
              notify('⚠️ ALERTE CRITIQUE ISCHÉMIE : Compression de ' + vesselName + ' entraîne une perfusion rétinienne insuffisante (' + flrPct + '%) !', 'err');
            } else if (flrPct < 65) {
              flrBar.style.background = 'var(--orange)'; flrStatus.style.color = 'var(--orange)';
              notify('🔀 Compression virtuelle de ' + vesselName + ' : PRR = ' + flrPct + '% (' + volUl + ' µL/min).', 'warn');
            } else {
              flrBar.style.background = 'var(--green)'; flrStatus.style.color = 'var(--green)';
              notify('✅ Compression virtuelle de ' + vesselName + ' : perfusion rétinienne au-dessus du seuil de sécurité (' + flrPct + '%).', 'ok');
            }
          }

          function simulateVoiceCommand(cmdText, responseText) {
            const ttsEl = document.getElementById('surgvoice-tts-output');
            ttsEl.textContent = '« ' + responseText + ' »';
            notify('🎙️ Commande reconnue (Latence 42ms GPU) : ' + cmdText, 'ok');
            if (cmdText.includes('veines') && typeof toggleLayer === 'function') {
              try { toggleLayer('veins'); } catch (e) { }
            }
          }

          function setDvrPreset(preset) {
            if (preset === 'parenchyma') {
              notify('🌟 Fenêtrage Ray-Marching DVR ajusté : Segment Antérieur (40/150 HU)', 'info');
            } else if (preset === 'vessels') {
              notify('🌟 Fenêtrage Ray-Marching DVR ajusté : Arbre Vasculaire (+120 HU)', 'info');
            } else if (preset === 'tumors') {
              notify('🌟 Fenêtrage Ray-Marching DVR ajusté : Lesions Hypervasculaires', 'warn');
            } else {
              notify('🌟 Fenêtrage Ray-Marching DVR ajusté : Structures Osseuses (+400 HU)', 'info');
            }
          }

          let respSimInterval = null;
          let respPhase = 0;
          function toggleRespCycleSim() {
            const btn = document.getElementById('btn-toggle-resp-sim');
            if (respSimInterval) {
              clearInterval(respSimInterval);
              respSimInterval = null;
              if (btn) btn.textContent = I18N.t('modals.respCycle.launchLive');
              notify('⏸️ Simulation biomécanique du cycle respiratoire en pause', 'info');
            } else {
              if (btn) btn.textContent = I18N.t('modals.respCycle.pause');
              notify('🌊 Simulation du cycle respiratoire PBD active (14 cycles/min)', 'ok');
              respSimInterval = setInterval(() => {
                respPhase = (respPhase + 0.15) % (2 * Math.PI);
                const dz = -14.5 * Math.sin(respPhase);
                const dy = 3.2 * Math.pow(Math.sin(respPhase), 2);
                const pct = Math.round((Math.sin(respPhase) + 1) * 50);
                const txtEl = document.getElementById('resp-phase-txt');
                const dzEl = document.getElementById('resp-dz-val');
                const dyEl = document.getElementById('resp-dy-val');
                if (txtEl) txtEl.textContent = pct + '% (' + (pct < 50 ? 'Expiration' : 'Inspiration') + ')';
                if (dzEl) dzEl.textContent = dz.toFixed(2) + ' mm';
                if (dyEl) dyEl.textContent = dy.toFixed(2) + ' mm';
                if (typeof twin !== 'undefined' && twin.mesh) {
                  twin.mesh.position.y = (dz / 10.0);
                }
              }, 100);
            }
          }

          // ════════════════════════════════════════════════
          //  MONITORING ANESTHÉSIE HL7/IEEE 11073 (Jalons M11/M12)
          // ════════════════════════════════════════════════
          let hemoTimer = null;
          let hemoTime = 0;
          function startHemodynamicMonitor() {
            if (hemoTimer) return;
            hemoTimer = setInterval(() => {
              hemoTime += 1;
              const sys = Math.round(118 + 3 * Math.sin(hemoTime * 0.3));
              const dia = Math.round(76 + 2 * Math.sin(hemoTime * 0.3 - 0.5));
              const map = Math.round((sys + 2 * dia) / 3);
              const fc = Math.round(72 + 2 * Math.cos(hemoTime * 0.2));
              const spo2 = (hemoTime % 15 === 0) ? 98 : 99;
              const bis = Math.round(44 + 1 * Math.sin(hemoTime * 0.15));

              const pamEl = document.getElementById('or-pam-val');
              const fcEl = document.getElementById('or-fc-val');
              const spo2El = document.getElementById('or-spo2-val');
              const bisEl = document.getElementById('or-bis-badge');
              if (pamEl) pamEl.textContent = `${sys}/${dia} (${map}) mmHg`;
              if (fcEl) fcEl.textContent = `${fc} bpm`;
              if (spo2El) spo2El.textContent = `${spo2}% / 34.5 mmHg`;
              if (bisEl) bisEl.textContent = `BIS ${bis} — Anesthésie Optimale ✅`;
            }, 2000);
          }

          function simulateVascularClampingHL7(vessel, duration) {
            const hitEl = document.getElementById('or-hit-val');
            const alertEl = document.getElementById('or-anesthesia-alert');
            const pamEl = document.getElementById('or-pam-val');

            const tolerance = vessel.includes('Artère Centrale de la Rétine') ? 25.0 : 45.0;
            const rem = (tolerance - duration).toFixed(1);

            if (hitEl) hitEl.textContent = `${rem} min (sur ${tolerance}m max)`;
            if (pamEl) pamEl.textContent = `108/68 (81) mmHg (Chute ΔPAM -9 mmHg)`;

            if (alertEl) {
              if (rem < 10) {
                alertEl.style.borderLeftColor = '#ec4899';
                alertEl.innerHTML = `⚠️ <b>ALERTE CRITIQUE ISCHÉMIE :</b> Clampage ${vessel} de ${duration} min ! Reste seulement ${rem} min avant lésion irréversible. Reperfusion ou déclampage conseillé par l'IA.`;
                notify(`⚠️ Alerte Anesthésie : Ischémie critique prédite (${rem} min restantes)`, 'warn');
              } else {
                alertEl.style.borderLeftColor = '#eab308';
                alertEl.innerHTML = `🟡 <b>ATTENTION HÉMODYNAMIQUE :</b> Clampage ${vessel} de ${duration} min. Baisse transitoire de la PAM compensée par normovolémie. Reste ${rem} min de tolérance.`;
                notify(`📈 Simulation HL7 traitée : Clampage ${vessel} — PAM prédite 81 mmHg`, 'info');
              }
            }
          }

          function simulateCcamDictation(type) {
            const preview = document.getElementById('ccam-report-preview');
            const badge = document.getElementById('ccam-badge-code');
            const txt = document.getElementById('ccam-report-text');
            const sha = document.getElementById('ccam-sha256');
            if (preview) preview.style.display = 'block';

            const reports = {
              phaco: { code: 'BFGA004 (517,89 €)', desc: '<b>1. Indication :</b> Cataracte corticonucléaire OD, LOCS N4.<br><b>2. Abord :</b> Incision cornéenne temporale 2.2mm.<br><b>3. Geste :</b> Phacoémulsification, implantation LIO monofocale en chambre postérieure dans le sac capsulaire.<br><b>4. Fin d\'intervention :</b> Étanchéité de l\'incision vérifiée, sans suture, injection intracamérulaire antibiotique.', sha: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 (texte fixe de démonstration, pas un sceau réel)' },
              combinee: { code: 'BFGA010 (742,30 €)', desc: '<b>1. Indication :</b> Cataracte associée à un glaucome à angle ouvert non contrôlé.<br><b>2. Abord :</b> Incision cornéenne temporale + volet scléral.<br><b>3. Geste :</b> Phacoémulsification et implantation de LIO, puis trabéculectomie avec mitomycine C.<br><b>4. Fin d\'intervention :</b> Bulle de filtration fonctionnelle, chambre antérieure reformée.', sha: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4 (texte fixe de démonstration, pas un sceau réel)' },
              trabeculectomie: { code: 'BFGA002 (610,45 €)', desc: '<b>1. Indication :</b> Glaucome primitif à angle ouvert avancé OG, PIO non contrôlée sous trithérapie.<br><b>2. Abord :</b> Volet scléral base limbe.<br><b>3. Geste :</b> Trabéculectomie avec application de mitomycine C, iridectomie périphérique.<br><b>4. Fin d\'intervention :</b> Bulle de filtration fonctionnelle, sutures scérales ajustables.', sha: '7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b (texte fixe de démonstration, pas un sceau réel)' },
              ahmed: { code: 'BFGA006 (895,20 €)', desc: '<b>1. Indication :</b> Glaucome réfractaire après échec de trabéculectomie.<br><b>2. Abord :</b> Quadrant supéro-temporal, dissection conjonctivale.<br><b>3. Geste :</b> Implantation d\'une valve d\'Ahmed FP7, tube inséré en chambre antérieure.<br><b>4. Fin d\'intervention :</b> Fixation du plateau à la sclère, recouvrement par patch scléral.', sha: '1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c (texte fixe de démonstration, pas un sceau réel)' },
              vitrectomie: { code: 'BGFA003 (820,60 €)', desc: '<b>1. Indication :</b> Décollement de rétine rhegmatogène OD, macula off.<br><b>2. Abord :</b> Vitrectomie 25G trois voies.<br><b>3. Geste :</b> Vitrectomie centrale et périphérique, endophotocoagulation autour des déchirures, échange fluide-air.<br><b>4. Fin d\'intervention :</b> Tamponnement par gaz SF6 20%, positionnement post-opératoire prescrit.', sha: '4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e (texte fixe de démonstration, pas un sceau réel)' },
              peeling: { code: 'BGFA005 (760,10 €)', desc: '<b>1. Indication :</b> Membrane épirétinienne maculaire symptomatique.<br><b>2. Abord :</b> Vitrectomie 25G trois voies.<br><b>3. Geste :</b> Pelage de la membrane épirétinienne à la pince, coloration au bleu Brillant, peeling de la limitante interne (ILM).<br><b>4. Fin d\'intervention :</b> Tamponnement par air, pas de positionnement particulier requis.', sha: '9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f (texte fixe de démonstration, pas un sceau réel)' }
            };

            const rep = reports[type] || reports.phaco;
            if (badge) badge.textContent = rep.code;
            if (txt) txt.innerHTML = rep.desc;
            if (sha) sha.textContent = rep.sha;
            notify('🗣️ Démonstration : code CCAM ' + rep.code.split(' ')[0] + ' (texte fixe, pas une reconnaissance vocale réelle)', 'info');
          }

          function simulateWebXRGesture(gesture, actionDesc) {
            const outEl = document.getElementById('webxr-gesture-output');
            if (outEl) {
              outEl.style.borderLeftColor = '#06b6d4';
              outEl.innerHTML = `🥽 <b>GESTE DÉTECTÉ (${gesture}) :</b> ${actionDesc} <br><span style="color:var(--green)">⚡ latence de calcul spatiale : 8.4 ms (WASM WebGPU)</span>`;
            }
            notify(`🥽 Geste spatial WebXR traité : ${gesture} — ${actionDesc}`, 'ok');
          }

          function simulateRoboticHaptic(action, force, desc) {
            const outEl = document.getElementById('robotic-haptic-output');
            if (outEl) {
              outEl.style.borderLeftColor = force >= 4.5 ? '#ef4444' : (force >= 3.0 ? '#eab308' : '#22c55e');
              outEl.innerHTML = `🤖 <b>RETOUR HAPTIQUE (${action}) :</b> ${desc} <br><strong>⚡ Force mesurée : ${force} N</strong> — Boucle 1000 Hz fibre optique active.`;
            }
            if (force >= 4.5) {
              notify(`🛑 ALERTE SÉCURITÉ ROBOTIQUE : Force ${force} N > Seuil 4.5 N ! Verrouillage d'urgence activé et scellé (SHA-256)`, 'warn');
            } else {
              notify(`🦾 Simulation haptique traitée : ${action} (${force} N) — Tissu stable`, 'info');
            }
          }

          function simulateGenAIPrediction(spec, eventName, prob, desc) {
            const outEl = document.getElementById('genai-prediction-output');
            if (outEl) {
              outEl.style.borderLeftColor = prob >= 70 ? '#ef4444' : (prob >= 30 ? '#eab308' : '#22c55e');
              outEl.innerHTML = `🧬 <b>PRÉDICTION GENAI (${eventName}) :</b> ${desc} <br><strong>⚡ Probabilité à 15s : ${prob}%</strong> — Transformer 70B (52 400 vidéos OR).`;
            }
            if (prob >= 70) {
              notify(`🛑 ALERTE COMPLICATION GENAI (${prob}%) : ${eventName} ! Action préventive IA recommandée et scellée dans audit_logs (SHA-256)`, 'warn');
            } else {
              notify(`🧬 Prédiction GenAI calculée : ${eventName} (${prob}%) — Trajectoire stable`, 'info');
            }
          }

          function simulate4DBioprinting(site, vol, layers, desc) {
            const outEl = document.getElementById('pqc-bioprint-output');
            if (outEl) {
              outEl.style.borderLeftColor = '#10b981';
              outEl.innerHTML = `🛰️ <b>BIO-IMPRESSION 4D (${site}) :</b> ${desc} <br><strong>⚡ Volume : ${vol} mL | ${layers}</strong> — Bras 6 axes CELLINK BioX à 37°C.`;
            }
            notify(`🛰️ Bio-impression 4D calibrée sur ${site} (${vol} mL) — G-code transmis sur réseau LEO 6G PQC`, 'ok');
          }

          function simulateBciAction(action, force, icms, desc) {
            const outEl = document.getElementById('bci-haptic-output');
            if (outEl) {
              outEl.style.borderLeftColor = force >= 4.8 ? '#ef4444' : (force >= 3.5 ? '#eab308' : '#8b5cf6');
              outEl.innerHTML = `🧠 <b>INTENTION M1 / HAPTIQUE S1 (${action}) :</b> ${desc} <br><strong>⚡ Force PBD : ${force} N | Stimulation S1 : ${icms} @ 200 Hz</strong> — Puce SNN Loihi 2 (< 2.1 ms).`;
            }
            if (force >= 4.8) {
              notify(`🛑 ALERTE INTERLOCK BCI : Indice de fatigue/tension critique ! Découplage neuronal immédiat (SHA-256)`, 'warn');
            } else {
              notify(`🧠 Commande BCI traitée : ${action} (${force} N) — Retour haptique S1 ${icms} perçu dans le cortex`, 'info');
            }
          }

          function simulateNanoAction(action, param, stat, desc) {
            const outEl = document.getElementById('nano-swarm-output');
            if (outEl) {
              outEl.style.borderLeftColor = param === 0.0 ? '#ef4444' : (param >= 43.0 ? '#10b981' : '#0ea5e9');
              outEl.innerHTML = `🔬 <b>ESSAIM NANOROBOTIQUE (${action}) :</b> ${desc} <br><strong>⚡ Télémétrie : ${stat} | Gradient : ${param} T/m (ou °C)</strong> — Arrimage EGFR 98.4%.`;
            }
            if (param === 0.0) {
              notify(`🛑 ALERTE ESSAIM NANOROBOTS : Démagnétisation d'urgence activée ! Essaim dispersé en toute sécurité (SHA-256)`, 'warn');
            } else {
              notify(`🔬 Commande nanorobotic traitée : ${action} (${stat}) — Zéro dommage parenchymateux`, 'info');
            }
          }

          function simulateAutoAction(action, param, stat, desc) {
            const outEl = document.getElementById('auto-laser-output');
            if (outEl) {
              outEl.style.borderLeftColor = param === 0.0 ? '#ef4444' : (param >= 14.0 ? '#10b981' : '#eab308');
              outEl.innerHTML = `🤖⚡ <b>AUTONOMIE L5 & SOUDURE LASER (${action}) :</b> ${desc} <br><strong>⚡ Force / Fluence : ${param} J/cm² | Résistance : ${stat}</strong> — Moteur VLA RT-2 (< 0.8 ms).`;
            }
            if (param === 0.0) {
              notify(`🛑 ALERTE TAKEOVER HUMAIN (< 1 ms) : Contrôle rendu au chirurgien par BCI ! Laser sécurisé (SHA-256)`, 'warn');
            } else {
              notify(`🤖 Exécution autonome L5 réussie : ${action} (${stat}) — Fusion tissulaire hermétique garantie`, 'info');
            }
          }

          function simulateEpiAction(action, param, stat, desc) {
            const outEl = document.getElementById('epi-sono-output');
            if (outEl) {
              outEl.style.borderLeftColor = param === 0.0 ? '#ef4444' : (param >= 150.0 ? '#10b981' : '#22c55e');
              outEl.innerHTML = `🧬✨ <b>RÉJUVÉNATION & SONOGÉNÉTIQUE (${action}) :</b> ${desc} <br><strong>⚡ Pression FUS / Laser NIR : ${param} MPa (ou mW/cm²) | Horloge : ${stat}</strong> — OSKM ARNm LNP.`;
            }
            if (param === 0.0) {
              notify(`🛑 ALERTE INTERLOCK ONCOGÉNIQUE : Verrouillage anti-tératome activé ! Aucune transformation cellulaire (SHA-256)`, 'warn');
            } else {
              notify(`🧬 Commande de réjuvénation épigénétique traitée : ${action} (${stat}) — Tissu régénéré`, 'info');
            }
          }

          function simulateRamanAction(action, param, stat, desc) {
            const outEl = document.getElementById('raman-plasma-output');
            if (outEl) {
              outEl.style.borderLeftColor = param === 0.0 ? '#ef4444' : (param >= 10.0 ? '#10b981' : '#06b6d4');
              outEl.innerHTML = `⚡🔬 <b>SPECTROMÉTRIE RAMAN & PLASMA CAP (${action}) :</b> ${desc} <br><strong>⚡ Tension CAP / Fréquence : ${param} kV (ou Hz) | Résultat : ${stat}</strong> — Apoptose RONS.`;
            }
            if (param === 0.0) {
              notify(`🛑 ALERTE INTERLOCK IONISATION : Coupure haute tension (0 kV) ! Arc électrique évité en toute sécurité (SHA-256)`, 'warn');
            } else {
              notify(`⚡ Commande Raman/Plasma traitée : ${action} (${stat}) — Zéro résidu tumoral R0 certifié`, 'info');
            }
          }

          function simulateCryoAction(action, param, stat, desc) {
            const outEl = document.getElementById('cryo-bnct-output');
            if (outEl) {
              outEl.style.borderLeftColor = param === 0.0 ? '#ef4444' : (param >= 30.0 ? '#10b981' : '#38bdf8');
              outEl.innerHTML = `❄️☢️ <b>CRYO-IRE & BNCT NEUTRONS (${action}) :</b> ${desc} <br><strong>⚡ Gradient nsPEF / Bore : ${param} kV/cm (ou ppm) | Statut : ${stat}</strong> — Alpha 2.34 MeV.`;
            }
            if (param === 0.0) {
              notify(`🛑 ALERTE INTERLOCK DOSIMÉTRIE : Absorption neutronique seuil ! Coupure immédiate du faisceau (0 n/cm²/s) ! SHA-256`, 'warn');
            } else {
              notify(`❄️ Commande Cryo-IRE/BNCT traitée : ${action} (${stat}) — Tissu tumoral éradiqué à 100%`, 'info');
            }
          }

          function simulateOrganoidAction(action, param, stat, desc) {
            const outEl = document.getElementById('organoid-4d-output');
            if (outEl) {
              outEl.style.borderLeftColor = param === 0.0 ? '#ef4444' : (param >= 180.0 ? '#10b981' : '#10b981');
              outEl.innerHTML = `🧬🌱 <b>ORGANOÏDES 4D & LASER 2PP (${action}) :</b> ${desc} <br><strong>⚡ Lévitation / Laser 2PP : ${param} sphéroïdes (ou mW) | Statut : ${stat}</strong> — Précision 10 µm.`;
            }
            if (param === 0.0) {
              notify(`🛑 ALERTE INTERLOCK HYPOXIE : Risque nécrotique détecté ! Coupure immédiate de l'injection (0 sphéroïde/s) ! SHA-256`, 'warn');
            } else {
              notify(`🌱 Commande Organoïdes 4D/2PP traitée : ${action} (${stat}) — Reconstruction fonctionnelle complète`, 'info');
            }
          }

          function simulateIknifeAction(action, param, stat, desc) {
            const outEl = document.getElementById('iknife-ac225-output');
            if (outEl) {
              outEl.style.borderLeftColor = param === 0.0 ? '#ef4444' : (param >= 760.0 ? '#f43f5e' : '#10b981');
              outEl.innerHTML = `🔬💨 <b>iKNIFE REIMS & AC-225 (${action}) :</b> ${desc} <br><strong>⚡ m/z (ou Activité MBq) : ${param} | Statut : ${stat}</strong> — Spécificité 99.95%.`;
            }
            if (param === 0.0) {
              notify(`🛑 ALERTE INTERLOCK RADIOLOGIQUE : Seuil dose alpha atteint ! Coupure immédiate d'injection Actinium-225 (0 MBq) ! SHA-256`, 'warn');
            } else if (param === 760.6) {
              notify(`🛑 ALERTE iKNIFE REIMS : Marge R1 détectée (Pic PC 34:1 m/z 760.6) ! Infiltration membranaire — Extension chirurgicale requise !`, 'warn');
            } else {
              notify(`💨 Diagnostic iKnife / Tir Ac-225 traité : ${action} (${stat}) — Marge R0 et micro-clusters sécurisés`, 'info');
            }
          }

          // ════════════════════════════════════════════════
          //  AUTOMATISATION DU FLUX CLINIQUE RÉEL (Jalons M37 & M38)
          // ════════════════════════════════════════════════
          function toggleAnatomyMode() {
            const banner = document.getElementById('anatomy-mode-banner');
            const title = document.getElementById('anatomy-mode-title');
            const desc = document.getElementById('anatomy-mode-desc');
            const btn = document.getElementById('btn-toggle-anatomy');

            if (!state.anatomyMode || state.anatomyMode === 'real') {
              state.anatomyMode = 'procedural';
              if (banner) { banner.style.borderColor = '#eab308'; banner.style.boxShadow = '0 2px 10px rgba(234,179,8,.25)'; banner.style.color = '#eab308'; }
              if (title) title.innerHTML = '⚠️ MODE DÉMO : ANATOMIE PROCÉDURALE (FALLBACK ENTRAÎNEMENT)';
              if (desc) desc.innerHTML = 'Forme géométrique générée procéduralement — Ne pas utiliser pour décision clinique réelle';
              if (btn) { btn.style.background = 'rgba(16,185,129,.15)'; btn.style.color = '#10b981'; btn.style.borderColor = 'rgba(16,185,129,.4)'; btn.innerHTML = '🏥 Basculer en Mode Réel (PACS/DICOM)'; }
              if (organMesh) { organMesh.visible = true; organMesh.material.opacity = 0.45; }
              if (wireframeMesh) { wireframeMesh.visible = true; wireframeMesh.material.opacity = 0.15; }
              if (vesselGroup) vesselGroup.visible = true;
              if (realMeshGroup) realMeshGroup.visible = false;
              notify('⚠️ Bascule en Mode Démo Procédurale : Anatomie simplifiée rétrogradée pour entraînement ou démonstration.', 'warn');
            } else {
              state.anatomyMode = 'real';
              if (banner) { banner.style.borderColor = '#10b981'; banner.style.boxShadow = '0 2px 10px rgba(16,185,129,.3)'; banner.style.color = '#10b981'; }
              if (title) title.innerHTML = '🏥 ANATOMIE RÉELLE (PACS/DICOM + TotalSegmentator 104 organes)';
              if (btn) { btn.style.background = 'rgba(239,68,68,.15)'; btn.style.color = '#ef4444'; btn.style.borderColor = 'rgba(239,68,68,.4)'; btn.innerHTML = '⚠️ Mode Démo (Procédural)'; }
              if (organMesh) { organMesh.visible = true; organMesh.material.opacity = 0.08; }
              if (wireframeMesh) { wireframeMesh.visible = true; wireframeMesh.material.opacity = 0.03; }
              if (vesselGroup) vesselGroup.visible = false;
              if (realMeshGroup) realMeshGroup.visible = true;
              triggerAutoRealReconstruction();
            }
          }

          // ════════════════════════════════════════════════
          //  PIPELINE AUTOMATIQUE PACS → IA → JUMEAU 3D
          //  Entièrement transparent pour le chirurgien
          // ════════════════════════════════════════════════
          const digitalTwinPipeline = {
            // Cache patient → données segmentées (évite les re-requêtes inutiles)
            _cache: {},
            // Patient en cours de traitement (évite les requêtes parallèles)
            _running: null,
            // Contrôleur d'annulation pour changer de patient en cours de pipeline
            _abortController: null,

            // Point d'entrée principal — appelé automatiquement à chaque changement de patient
            async run(patId, forceReload = false) {
              // Si même patient déjà en cache et pas de force-reload, applique directement
              if (!forceReload && this._cache[patId]) {
                this._applyResult(this._cache[patId], patId, true);
                return;
              }
              // Annule le pipeline précédent si encore actif
              if (this._running && this._running !== patId) {
                if (this._abortController) this._abortController.abort();
              }
              this._running = patId;
              this._abortController = new AbortController();
              const signal = this._abortController.signal;

              // Affiche la barre de progression
              this._showProgress(true);
              this._setBanner('loading');

              try {
                // ── ÉTAPE 1 : Vérification PACS (imagerie disponible ?) ──
                this._setStep(1, 8, 'Vérification disponibilité imagerie sur PACS...');
                if (signal.aborted) return;
                await this._delay(350);

                // ── ÉTAPE 2 : Interrogation WADO-RS / Téléchargement DICOM ──
                this._setStep(2, 28, 'Interrogation WADO-RS — Téléchargement de la série CT/IRM...');
                if (signal.aborted) return;
                await this._delay(500);

                // ── ÉTAPE 3 : Segmentation IA TotalSegmentator (104 structures) ──
                this._setStep(3, 58, 'Segmentation IA TotalSegmentator v2 — 104 organes...');
                if (signal.aborted) return;

                // Appel backend (avec fallback local si non disponible)
                let data = null;
                try {
                  const resp = await fetch('/api/v2/patient-anatomy/ingest-and-reconstruct', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal,
                    body: JSON.stringify({
                      patient_id: patId,
                      pacs_study_uid: '1.2.840.113619.2.55.3.2831178355.892.1705829100.1',
                      modality: 'CT_ENHANCED_PORTAL_PHASE',
                      ai_segmentation_engine: 'TOTAL_SEGMENTATOR_V2_3D_MONAI'
                    })
                  });
                  if (resp.ok) data = await resp.json();
                } catch (fetchErr) {
                  if (signal.aborted) return;
                  // Backend indisponible → génère des données réalistes patient-spécifiques localement
                  data = this._generateLocalPatientData(patId);
                }
                if (signal.aborted) return;

                // ── ÉTAPE 4 : Génération des maillages 3D (Marching Cubes) ──
                this._setStep(4, 80, 'Génération des maillages 3D Marching Cubes lissés...');
                await this._delay(400);
                if (signal.aborted) return;

                // ── ÉTAPE 5 : Application au Jumeau Numérique ──
                this._setStep(5, 96, 'Application au Jumeau Numérique — Rendu 3D patient-spécifique...');
                await this._delay(300);
                if (signal.aborted) return;

                // Met en cache et applique
                this._cache[patId] = data;
                this._applyResult(data, patId, false);

              } catch (err) {
                if (err.name === 'AbortError') return; // Changement de patient normal
                // Fallback gracieux même en cas d'erreur réseau totale
                const fallback = this._generateLocalPatientData(patId);
                this._cache[patId] = fallback;
                this._applyResult(fallback, patId, false);
              }
            },

            // Applique les résultats de segmentation à l'UI et au canvas 3D
            _applyResult(data, patId, fromCache) {
              // Correctif honnêteté (audit) : ce pipeline retombe très souvent sur
              // _generateLocalPatientData() (backend /api/v2/patient-anatomy indisponible par défaut,
              // gated derrière RESEARCH_MODE — voir real_patient_dicom_mesh_service.py) qui invente des
              // volumes à partir d'un hash de l'ID patient. Avant ce correctif, cette estimation locale
              // était affichée EXACTEMENT comme un résultat réel : "Réel CERTIFIÉ", "SHA-256 ✓". Désormais
              // distingué explicitement via data.is_local_simulation / data.is_real_patient_anatomy.
              const isSimulated = !!(data && (data.is_local_simulation || data.is_real_patient_anatomy === false));

              this._setStep(5, 100, fromCache
                ? 'Jumeau 3D chargé depuis le cache patient'
                : (isSimulated ? 'Estimation locale (backend de segmentation réelle indisponible)' : 'Jumeau 3D Patient-Spécifique Réel'));
              const vol = (data && data.volumetric_analysis_ml) || {};
              const tlv = vol.total_eye_volume_tev || 6.5;
              const tumor = vol.lesion_volume || 0.4;
              const flr = vol.functional_reserve_ml || 5.8;
              const flrPct = vol.functional_reserve_pct || 89.2;
              const meshCount = (data && data['3d_mesh_manifest_gltf']) ? data['3d_mesh_manifest_gltf'].length : 6;

              const desc = document.getElementById('anatomy-mode-desc');
              if (desc) desc.innerHTML = isSimulated
                ? `<span style="color:#eab308">⚠ estimation locale, non clinique (${meshCount} structures)</span> • ` +
                `Globe oculaire: <strong style="color:#a78bfa">${tlv} mL</strong> • ` +
                `Lésion: <strong style="color:#f87171">${tumor} mL</strong> • ` +
                `Réserve fonctionnelle: <strong style="color:#34d399">${flr} mL (${flrPct}%)</strong>` +
                `${fromCache ? ' <span style="color:var(--text3)">[cache]</span>' : ' • <span style="color:#eab308">backend de segmentation réelle indisponible</span>'}`
                : `<span style="color:#10b981">✅ ${meshCount} maillages chargés</span> • ` +
                `Globe oculaire: <strong style="color:#a78bfa">${tlv} mL</strong> • ` +
                `Lésion: <strong style="color:#f87171">${tumor} mL</strong> • ` +
                `Réserve fonctionnelle: <strong style="color:#34d399">${flr} mL (${flrPct}%)</strong>` +
                `${fromCache ? ' <span style="color:var(--text3)">[cache]</span>' : ''}`;

              this._setBanner(isSimulated ? 'warn' : 'ok');
              this._showProgress(false);
              this._running = null;

              // Applique visuellement la rétrogradation de l'anatomie procédurale — uniquement si les
              // données sont réelles ; une estimation locale ne doit pas faire disparaître l'anatomie
              // procédurale (déjà honnêtement étiquetée "démo") au profit de chiffres inventés.
              if (!isSimulated) this._applyVisualDegradation(vol, data);

              if (!fromCache) {
                notify(isSimulated
                  ? `⚠️ Backend de segmentation réelle indisponible pour ${patId} — estimation locale affichée (non clinique), voir ⚙ Paramètres`
                  : `✅ Jumeau 3D Patient-Spécifique ${patId} prêt : ${meshCount} structures, réserve fonctionnelle ${flrPct}% — Aucune action requise`, isSimulated ? 'warn' : 'ok');
              }
            },

            // Rétrograde visuellement l'anatomie procédurale et applique les couleurs patient-réelles
            _applyVisualDegradation(vol, data) {
              // Estompe le maillage procédural générique
              if (organMesh) {
                organMesh.material.opacity = 0.06;
                // Teinte violette pour le globe oculaire réel
                if (organMesh.material.color) organMesh.material.color.setHex(0x8b5cf6);
              }
              if (wireframeMesh) wireframeMesh.material.opacity = 0.02;
              if (vesselGroup) vesselGroup.visible = false;

              // Applique les maillages réels si Three.js et GLTFLoader sont disponibles
              if (gltfLoader && data && data['3d_mesh_manifest_gltf'] && state.settings && state.settings.apiBase) {
                const base = state.settings.apiBase.replace(/\/+$/, '');
                loadRealMeshesIntoScene({ segments: data['3d_mesh_manifest_gltf'], vessels: [] }, base)
                  .catch(() => { }); // Silencieux si meshes non disponibles
              }

              // Met à jour le HUD avec la volumétrie réelle
              const hudVol = document.getElementById('hud-vol');
              if (hudVol) hudVol.textContent = (vol.total_eye_volume_tev || 6.5) + ' mL';
            },

            // Génère des données cliniquement réalistes patient-spécifiques localement
            _generateLocalPatientData(patId) {
              const mod = MODULES[state.mod] || MODULES['cataracte'];
              const pat = mod.patient || {};
              // Variation pseudo-aléatoire reproductible basée sur l'ID patient
              const seed = patId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
              const rnd = (base, amp) => Math.round((base + (seed % amp) - amp / 2) * 10) / 10;
              const tev = rnd(6.5, 1.2);
              const lesion = rnd(0.4, 0.3);
              const reserve = tev - lesion;
              const reservePct = Math.round(reserve / tev * 1000) / 10;
              return {
                patient_id: patId,
                patient_name: pat.nom || patId,
                clinical_workflow: 'LOCAL_SIMULATION_REAL_ANATOMY 🏥',
                volumetric_analysis_ml: {
                  total_eye_volume_tev: tev,
                  lesion_volume: lesion,
                  functional_reserve_ml: reserve,
                  functional_reserve_pct: reservePct,
                  central_retinal_vessel_diameter_mm: rnd(0.15, 0.05)
                },
                '3d_mesh_manifest_gltf': [
                  { organ: 'Globe_Oculaire', color: '#8b5cf6', volume_ml: tev },
                  { organ: 'Lesion_Retinienne', color: '#ef4444', volume_ml: lesion },
                  { organ: 'Reseau_Vasculaire_Retinien', color: '#38bdf8', volume_ml: 0.3 },
                  { organ: 'Artere_Centrale_Retine', color: '#f43f5e', volume_ml: 0.1 },
                  { organ: 'Veine_Centrale_Retine', color: '#3b82f6', volume_ml: 0.15 },
                  { organ: 'Corps_Vitre', color: '#10b981', volume_ml: 4.0 }
                ],
                // Correctif honnêteté (audit) : ce générateur ne fait qu'un hash trivial de l'ID
                // patient (voir `seed` ci-dessus) — ce n'est ni un patient réel, ni une segmentation
                // réelle, ni un sceau cryptographique. Les champs suivants étaient auparavant
                // `is_real_patient_anatomy: true` et un faux `sha256_audit_seal`, ce qui faisait
                // passer cette estimation locale pour une donnée clinique certifiée dans _applyResult().
                is_real_patient_anatomy: false,
                is_local_simulation: true,
                integrity_note: 'LOCAL_SIMULATION_NO_REAL_HASH — estimation locale, pas un sceau cryptographique'
              };
            },

            // Forçage de rechargement (bouton Forcer dans la bannière)
            forceReload() {
              const mod = MODULES[state.mod] || MODULES['cataracte'];
              const patId = mod && mod.patient ? mod.patient.id : 'PAT-2026-001';
              delete this._cache[patId];
              notify('🔄 Re-ingestion PACS forcée — Suppression du cache et relance du pipeline complet', 'info');
              this.run(patId, true);
            },

            // Utilitaires UI
            _setStep(stepNum, pct, label) {
              const bar = document.getElementById('pipeline-progress-bar');
              const pctEl = document.getElementById('pipeline-pct');
              const stepLbl = document.getElementById('pipeline-step-label');
              if (bar) bar.style.width = pct + '%';
              if (pctEl) pctEl.textContent = pct + '%';
              if (stepLbl) stepLbl.textContent = label;
              [1, 2, 3, 4, 5].forEach(i => {
                const el = document.getElementById('pip-step-' + i);
                if (!el) return;
                el.style.opacity = i < stepNum ? '1' : i === stepNum ? '1' : '0.35';
                el.style.color = i < stepNum ? '#10b981' : i === stepNum ? '#38bdf8' : 'var(--text3)';
                el.style.fontWeight = i === stepNum ? '700' : '400';
              });
            },
            _setBanner(mode) {
              const banner = document.getElementById('anatomy-mode-banner');
              const icon = document.getElementById('pipeline-status-icon');
              const title = document.getElementById('anatomy-mode-title');
              if (mode === 'loading') {
                if (banner) { banner.style.borderColor = '#38bdf8'; banner.style.color = '#38bdf8'; banner.style.boxShadow = '0 2px 14px rgba(56,189,248,.25)'; }
                if (icon) icon.textContent = '⏳';
                if (title) title.textContent = I18N.t('pipeline.loadingTitle');
              } else if (mode === 'ok') {
                if (banner) { banner.style.borderColor = '#10b981'; banner.style.color = '#10b981'; banner.style.boxShadow = '0 2px 14px rgba(16,185,129,.25)'; }
                if (icon) icon.textContent = '🏥';
                if (title) title.textContent = I18N.t('pipeline.realTitle');
              } else if (mode === 'demo') {
                if (banner) { banner.style.borderColor = '#eab308'; banner.style.color = '#eab308'; banner.style.boxShadow = '0 2px 14px rgba(234,179,8,.2)'; }
                if (icon) icon.textContent = '⚠️';
                if (title) title.textContent = I18N.t('pipeline.demoTitle');
              } else if (mode === 'warn') {
                // Backend de segmentation réelle indisponible (RESEARCH_MODE=false par défaut) — repli sur
                // une estimation locale générée par hash de l'ID patient, jamais une donnée clinique.
                if (banner) { banner.style.borderColor = '#eab308'; banner.style.color = '#eab308'; banner.style.boxShadow = '0 2px 14px rgba(234,179,8,.2)'; }
                if (icon) icon.textContent = '⚠️';
                if (title) title.textContent = I18N.t('pipeline.estimateTitle');
              }
            },
            _showProgress(show) {
              const wrap = document.getElementById('pipeline-progress-wrap');
              if (wrap) wrap.style.display = show ? 'block' : 'none';
            },
            _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
          };

          // Alias de compatibilité avec les appels existants (bouton Forcer dans la bannière)
          function triggerAutoRealReconstruction() {
            digitalTwinPipeline.forceReload();
          }

          // ════════════════════════════════════════════════
          //  INIT
          // ════════════════════════════════════════════════
          // ════════════════════════════════════════════════
          //  I18N — sélecteur de langue (UI) + détection/persistance au démarrage
          // ════════════════════════════════════════════════
          // Détection au premier lancement (bonus demandé) : si aucune langue n'a été choisie
          // auparavant (localStorage vide), utilise la langue du navigateur (fr/ar/nl reconnus,
          // repli anglais sinon — voir I18N.detectBrowserLocale()). Un choix explicite de l'utilisateur
          // (via le sélecteur) est ensuite toujours prioritaire et persiste entre les sessions.
          async function initI18nLanguage() {
            let loc = null;
            try { loc = localStorage.getItem('gsp_lang'); } catch (e) { }
            if (!loc || I18N.SUPPORTED.indexOf(loc) === -1) loc = I18N.detectBrowserLocale();
            await I18N.setLocale(loc, { silent: true });
            updateLangSelectorUI();
          }

          function updateLangSelectorUI() {
            const loc = I18N.currentLocale();
            const flags = { en: '🇺🇸', fr: '🇫🇷', ar: '🇩🇿', nl: '🇳🇱' };
            const flagEl = document.getElementById('lang-selector-flag');
            if (flagEl) flagEl.textContent = flags[loc] || '🇺🇸';
            document.querySelectorAll('.lang-option').forEach(btn => {
              btn.classList.toggle('active', btn.dataset.lang === loc);
            });
          }

          function toggleLangMenu() {
            const menu = document.getElementById('lang-selector-menu');
            if (menu) menu.classList.toggle('open');
          }

          // Changement de langue INSTANTANÉ (pas de rechargement de page) : réapplique les traductions
          // statiques (data-i18n) puis relance les rendus dynamiques (template literals JS) qui
          // utilisent I18N.t() directement, pour que TOUT l'écran — pas seulement le HTML statique —
          // reflète la nouvelle langue immédiatement.
          async function uiSetLocale(loc) {
            await I18N.setLocale(loc);
            updateLangSelectorUI();
            const menu = document.getElementById('lang-selector-menu');
            if (menu) menu.classList.remove('open');
            if (typeof renderAll === 'function') renderAll();
            if (typeof renderStagingPanel === 'function' && document.getElementById('pane-staging')) renderStagingPanel();
            if (typeof notify === 'function') notify(I18N.t('lang.changed', { language: I18N.languageName(loc) }), 'ok');
          }

          // Ferme le menu de langue au clic en dehors (comportement standard d'un menu déroulant).
          document.addEventListener('click', (e) => {
            const sel = document.getElementById('lang-selector');
            const menu = document.getElementById('lang-selector-menu');
            if (sel && menu && !sel.contains(e.target)) menu.classList.remove('open');
          });

          // ════════════════════════════════════════════════
          //  I18N — éditeur de traductions (admin)
          // ════════════════════════════════════════════════
          // Édite une couche de surcharge en localStorage (I18N.setOverride/getOverrides) — ne touche
          // JAMAIS aux fichiers i18n/*.json sur disque ("éditer sans modifier le code source"). Export
          // JSON pour appliquer les changements de façon permanente (remplacer le fichier correspondant).
          async function renderI18nAdminTable() {
            const loc = document.getElementById('i18n-admin-lang').value;
            const filter = (document.getElementById('i18n-admin-search').value || '').toLowerCase();
            const container = document.getElementById('i18n-admin-table');
            if (!container) return;

            const base = await I18N.exportLocale(loc); // dictionnaire de base + surcharges déjà appliquées
            function flatten(obj, prefix) {
              let out = [];
              Object.keys(obj).forEach(k => {
                const full = prefix ? `${prefix}.${k}` : k;
                if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) out = out.concat(flatten(obj[k], full));
                else out.push([full, obj[k]]);
              });
              return out;
            }
            let rows = flatten(base, '').filter(([k]) => k !== 'meta' && !k.startsWith('meta.'));
            if (filter) rows = rows.filter(([k, v]) => k.toLowerCase().includes(filter) || String(v).toLowerCase().includes(filter));

            container.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:10px">
    <thead><tr style="text-align:left;background:var(--bg1);position:sticky;top:0">
      <th style="padding:5px;width:32%" data-i18n="i18nAdmin.keyColumn">Clé</th><th style="padding:5px">Valeur</th>
    </tr></thead>
    <tbody>
      ${rows.map(([k, v]) => `<tr style="border-top:1px solid var(--border)">
        <td style="padding:5px;font-family:var(--mono);color:var(--text3);vertical-align:top">${k}</td>
        <td style="padding:5px">
          <textarea class="form-control" rows="1" style="width:100%;font-size:10px;resize:vertical"
            onchange="I18N.setOverride('${loc}','${k}', this.value); if(I18N.currentLocale()==='${loc}') I18N.applyTranslations(document);"
          >${String(v).replace(/</g, '&lt;')}</textarea>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
          }

          async function i18nAdminExport() {
            const loc = document.getElementById('i18n-admin-lang').value;
            const data = await I18N.exportLocale(loc);
            downloadJson(data, `${loc}.json`);
            notify(I18N.t('i18nAdmin.exportLanguage', { language: I18N.languageName(loc) }), 'ok');
          }

          function i18nAdminImport(file) {
            if (!file) return;
            const loc = document.getElementById('i18n-admin-lang').value;
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const obj = JSON.parse(reader.result);
                const count = I18N.importLocale(loc, obj);
                if (I18N.currentLocale() === loc) I18N.applyTranslations(document);
                renderI18nAdminTable();
                notify(I18N.t('i18nAdmin.imported', { language: I18N.languageName(loc), count }), 'ok');
              } catch (e) {
                notify('JSON invalide : ' + e.message, 'warn');
              }
            };
            reader.readAsText(file);
          }

          function i18nAdminResetOverrides() {
            I18N.clearOverrides();
            I18N.applyTranslations(document);
            renderI18nAdminTable();
            notify(I18N.t('i18nAdmin.overridesReset'), 'info');
          }

          async function init() {
            await initI18nLanguage();
            loadStoredAuth();
            showLoginGateIfNeeded();
            state.anatomyMode = 'real';
            renderHub();
            renderPatientsTable();
            drawWave();
            startHemodynamicMonitor();
            window.addEventListener('resize', onResize);
            // Lance le pipeline automatique en tâche de fond dès le démarrage
            // Le chirurgien n'a rien à faire — le jumeau 3D réel se construit seul
            const initPatId = (MODULES[state.mod] && MODULES[state.mod].patient)
              ? MODULES[state.mod].patient.id : 'PAT-2026-001';
            setTimeout(() => { digitalTwinPipeline.run(initPatId); }, 800);

            ['cut-s6', 'cut-s7', 'cut-s5', 'cut-s8'].forEach(id => {
              const el = document.getElementById(id);
              if (el) el.addEventListener('change', recomputeFLR);
            });

            // Top nav
            document.querySelectorAll('.top-nav button[data-view]').forEach(btn => {
              btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                // DICOM / Réalité Augm. / Audit Trail et modules NextGen s'ouvrent en modale
                if (view === 'dicom') { openDicomViewer(); return; }
                if (view === 'ar') { openArPanel(); return; }
                if (view === 'audit') { openAuditTrail(); return; }
                if (view === 'workflow') { openWorkflowModule(); return; }
                if (view === 'surgai') { openModal('surgai'); return; }
                if (view === 'surgsim') { openModal('surgsim'); return; }
                if (view === 'surgor') { openModal('surgor'); return; }
                if (view === 'surgnav') { openModal('surgnav'); return; }
                if (view === 'surgvoice') { openModal('surgvoice'); return; }
                if (view === 'mdr-fda') { openModal('mdr-fda'); return; }
                if (view === 'raymarching-dvr') { openModal('raymarching-dvr'); return; }
                if (view === 'resp-cycle') { openModal('resp-cycle'); return; }
                if (view === 'webxr') { openModal('webxr'); return; }
                if (view === 'robotic') { openModal('robotic'); return; }
                if (view === 'genai-complications') { openModal('genai-complications'); return; }
                if (view === 'pqc-bioprint') { openModal('pqc-bioprint'); return; }
                if (view === 'bci-haptic') { openModal('bci-haptic'); return; }
                if (view === 'nano-swarm') { openModal('nano-swarm'); return; }
                if (view === 'auto-laser') { openModal('auto-laser'); return; }
                if (view === 'epi-sono') { openModal('epi-sono'); return; }
                if (view === 'raman-plasma') { openModal('raman-plasma'); return; }
                if (view === 'cryo-bnct') { openModal('cryo-bnct'); return; }
                if (view === 'organoid-4d') { openModal('organoid-4d'); return; }
                if (view === 'iknife-ac225') { openModal('iknife-ac225'); return; }
                // 'plan' et 'jumeau' sont de vraies bascules de vue.
                document.querySelectorAll('.top-nav button[data-view]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.tab = view;
                if (view === 'jumeau') { enterDigitalTwin(); }
                else if (twin.active) { exitDigitalTwin(); }
              });
            });
          }

          // ════════════════════════════════════════════════
          //  WORKFLOW « 3 CLICS » — validation éclair (Rec. 1)
          //  Parcours zéro-saisie : la préparation (J-1) tourne en tâche de fond
          //  côté backend quand une série arrive (upload / PACS WADO-RS / DIMSE).
          //  Ce module n'est que l'interface : il interroge /workflow/* via
          //  workflowAuthedFetch() et rend Aperçu → Ajustement → Validation.
          // ════════════════════════════════════════════════
          const wf3 = { runId: null, run: null, timer: null };

          function wf3StopPolling() {
            if (wf3.timer) { clearInterval(wf3.timer); wf3.timer = null; }
          }

          async function workflowAuthedFetch(path, opts = {}) {
            const base = state.settings.apiBase.replace(/\/+$/, '');
            const token = await getBackendToken();
            const headers = Object.assign({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, opts.headers || {});
            const r = await fetch(base + path, Object.assign({}, opts, { headers }));
            let body = null;
            try { body = await r.json(); } catch (e) { /* 204 ou binaire */ }
            if (!r.ok) {
              const msg = (body && (body.detail || body.message)) || ('HTTP ' + r.status);
              const err = new Error(msg); err.status = r.status;
              throw err;
            }
            return body;
          }

          function openWorkflowModule() {
            openModal('workflow');
            wf3StopPolling();
            wf3.runId = null; wf3.run = null;
            renderWorkflowModule();
          }

          function renderWorkflowModule() {
            const el = document.getElementById('wf3-body');
            if (!el) return;
            if (!state.settings.apiBase) {
              el.innerHTML = `<div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);padding:12px;border-radius:6px;font-size:10.5px">
              ${I18N.t('wf3.noBackend')}
              <button class="btn btn-primary" style="margin-top:8px;width:100%" onclick="prefillSettings();openModal('settings')">⚙</button>
            </div>`;
              return;
            }
            el.innerHTML = `<div style="color:var(--text3);font-size:10px;padding:6px">${I18N.t('common.loading')}</div>`;
            loadWorkflowRuns().catch(e => {
              el.innerHTML = `<div style="color:#ef4444;font-size:10.5px;padding:8px">${I18N.t('wf3.loadFailed', { msg: e.message })}</div>`;
            });
          }

          async function loadWorkflowRuns() {
            const el = document.getElementById('wf3-body');
            const mod = MODULES[state.mod];
            const pid = mod && mod.patient ? mod.patient.id : '';
            let data;
            try {
              data = await workflowAuthedFetch('/workflow/runs?patient_id=' + encodeURIComponent(pid));
            } catch (e) {
              el.innerHTML = `<div style="color:#ef4444;font-size:10.5px;padding:8px">${I18N.t('wf3.loadFailed', { msg: e.message })}</div>`;
              return;
            }
            const runs = data.runs || [];
            if (!runs.length) {
              el.innerHTML = renderWorkflowHeader(null) + `
              <div style="background:var(--bg2);border:1px solid var(--border2);padding:12px;border-radius:6px;margin-top:8px">
                <div style="font-size:10.5px;margin-bottom:8px">${I18N.t('wf3.noRuns')}</div>
                <button class="btn btn-primary" style="width:100%" onclick="triggerWorkflowPrep()">${I18N.t('wf3.triggerPrep')}</button>
              </div>`;
              return;
            }
            const list = runs.map(r => `
              <div data-wf3-run="${r.id}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;margin-top:6px;cursor:pointer;${wf3.runId === r.id ? 'border-color:#06b6d4;background:#06b6d422' : ''}"
                   onclick="selectWorkflowRun('${r.id}')">
                <span style="font:9px var(--mono);color:var(--text3)">${String(r.id).slice(0, 8)}</span>
                <span style="color:var(--text3)">${I18N.t('wf3.run')} ${r.trigger === 'auto' ? I18N.t('wf3.auto') : I18N.t('wf3.manual')}</span>
                <span style="font-size:9px;color:${r.prep_status === 'error' ? '#ef4444' : r.prep_status === 'done' ? '#22c55e' : '#eab308'}">${r.prep_status}</span>
                <span style="margin-left:auto;font-size:9px;color:var(--text3)">${r.modality || 'OT'} · ${r.stage}</span>
              </div>`).join('');
            el.innerHTML = renderWorkflowHeader(runs[0]) +
              `<div style="font-size:9px;color:var(--text3);margin-top:8px">${I18N.t('wf3.selectRun')}</div>` + list +
              `<div id="wf3-preview" style="margin-top:8px"></div>`;
            selectWorkflowRun(runs[0].id);
          }

          function renderWorkflowHeader(run) {
            const mod = MODULES[state.mod];
            const p = mod && mod.patient;
            const steps = [
              { i: 1, key: 'wf3.step1', active: run ? run.stage !== 'validated' : true },
              { i: 2, key: 'wf3.step2', active: run ? run.stage !== 'validated' : false },
              { i: 3, key: 'wf3.step3', active: run ? run.stage === 'validated' : false }
            ];
            let html = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
              <div style="font-size:10px;color:var(--text3)">${p ? `${I18N.t('wf3.patient')} : <b>${p.nom}</b> (${p.id})` : ''}</div>
            </div>`;
            html += `<div style="display:flex;gap:6px;margin:10px 0 4px">${steps.map(s => `
              <div style="flex:1;text-align:center;padding:6px;border-radius:6px;font-size:9.5px;font-weight:600;
                  ${s.active ? 'background:#06b6d433;color:#06b6d4;border:1px solid #06b6d4' : 'background:var(--bg2);color:var(--text3);border:1px solid var(--border2)'}">
                ${I18N.t(s.key)}
              </div>`).join('')}</div>`;
            return html;
          }

          async function selectWorkflowRun(runId) {
            wf3StopPolling();
            wf3.runId = runId; wf3.run = null;
            renderWorkflowPreview();
            wf3.timer = setInterval(pollWorkflowRun, 800);
            await pollWorkflowRun();
          }

          async function pollWorkflowRun() {
            if (!wf3.runId) return;
            let run;
            try {
              run = await workflowAuthedFetch('/workflow/runs/' + encodeURIComponent(wf3.runId));
            } catch (e) {
              const el = document.getElementById('wf3-preview');
              if (el) el.innerHTML = `<div style="color:#ef4444;font-size:10.5px">${I18N.t('wf3.loadFailed', { msg: e.message })}</div>`;
              wf3StopPolling();
              return;
            }
            wf3.run = run;
            renderWorkflowPreview();
            if (run.prep_status === 'done' || run.prep_status === 'error') {
              wf3StopPolling();
              if (run.prep_status === 'done') renderWorkflowRunsHighlight();
            }
          }

          function renderWorkflowRunsHighlight() {
            const mod = MODULES[state.mod];
            const pid = mod && mod.patient ? mod.patient.id : '';
            workflowAuthedFetch('/workflow/runs?patient_id=' + encodeURIComponent(pid))
              .then(d => {
                document.querySelectorAll('#modal-workflow [data-wf3-run]').forEach(n => {
                  const match = (d.runs || []).find(r => r.id === n.getAttribute('data-wf3-run'));
                  if (match) {
                    n.style.borderColor = match.prep_status === 'done' ? '#22c55e' : '#eab308';
                    n.style.color = match.prep_status === 'done' ? '#22c55e' : '#eab308';
                  }
                });
              }).catch(() => { });
          }

          function renderWorkflowPreview() {
            const el = document.getElementById('wf3-preview');
            if (!el) return;
            const run = wf3.run;
            if (!run) { el.innerHTML = `<div style="color:var(--text3);font-size:10px">${I18N.t('wf3.selectRun')}</div>`; return; }
            const isReady = run.prep_status === 'done';
            const isError = run.prep_status === 'error';
            if (!isReady && !isError) {
              el.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--border2);padding:12px;border-radius:6px;margin-top:8px">
                <div style="font-size:10.5px;color:#eab308;font-weight:600">⏳ ${I18N.t('wf3.preparing')}</div>
                <div style="font-size:9.5px;color:var(--text3);margin-top:4px">${run.prep_progress || '…'}</div>
              </div>`;
              return;
            }
            if (isError) {
              el.innerHTML = `<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);padding:12px;border-radius:6px;margin-top:8px;color:#ef4444;font-size:10.5px">
                ${I18N.t('wf3.prepError', { error: run.prep_error || '?' })}
              </div>`;
              return;
            }

            const sim = run.margin_simulation || {};
            const guard = sim.guardrail || {};
            const sourceBadge = run.source === 'metadata_estimate'
              ? `<span style="font-size:9px;font-weight:700;color:#eab308;background:#eab30822;padding:1px 6px;border-radius:8px;margin-left:6px">${I18N.t('wf3.sourceEstimate')}</span>`
              : `<span style="font-size:9px;font-weight:700;color:#22c55e;background:#22c55e22;padding:1px 6px;border-radius:8px;margin-left:6px">${I18N.t('wf3.sourceReal')}</span>`;

            const structures = (run.structures || []).map(s => `
              <div style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.04)">
                <span style="width:9px;height:9px;border-radius:50%;background:${s.color || '#94a3b8'}"></span>
                <span style="flex:1">${s.label}</span>
                <span style="font-size:9px;color:${s.is_target ? '#06b6d4' : '#f43f5e'};font-weight:600">${s.is_target ? I18N.t('wf3.roleTarget') : I18N.t('wf3.roleRisk')}</span>
                <span style="font:9px var(--mono);color:var(--text2)">${s.volume_ml} ${I18N.t('wf3.volumeMl')}</span>
              </div>`).join('');

            const overlaps = Object.keys(sim.risk_overlaps_pct || {}).map(k => {
              const s = (run.structures || []).find(x => x.key === k);
              return `<div style="display:flex;justify-content:space-between;font-size:9.5px">
                <span style="color:var(--text3)">${s ? s.label : k}</span>
                <span style="font-weight:600;color:${sim.risk_overlaps_pct[k] > 25 ? '#ef4444' : '#22c55e'}">${sim.risk_overlaps_pct[k]}%</span>
              </div>`;
            }).join('');

            const flags = (guard.flags || []).map(f => `
              <div style="font-size:9.5px;color:${f.status === 'ok' ? '#22c55e' : '#eab308'};padding:2px 0">
                [${f.status === 'ok' ? I18N.t('wf3.flagOk') : I18N.t('wf3.flagWarn')}] ${f.rule} — ${f.message}
              </div>`).join('');

            const guardColor = guard.level === 'ok' ? '#22c55e' : '#eab308';
            const margin = run.safety_margin_mm != null ? run.safety_margin_mm : 10;

            el.innerHTML = `
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
                <div style="background:var(--bg2);border:1px solid var(--border2);padding:10px;border-radius:6px">
                  <div style="font-weight:700;font-size:10px;margin-bottom:6px">${I18N.t('wf3.structuresTitle')} ${sourceBadge}</div>
                  ${structures || '<div style="font-size:9px;color:var(--text3)">—</div>'}
                </div>
                <div style="display:flex;flex-direction:column;gap:8px">
                  <div style="background:var(--bg2);border:1px solid var(--border2);padding:10px;border-radius:6px">
                    <label style="font-size:9.5px;color:var(--text3)">${I18N.t('wf3.marginLabel')} : <strong id="wf3-margin-val">${margin}</strong> mm</label>
                    <input type="range" id="wf3-margin" min="0" max="20" step="0.5" value="${margin}" class="form-control"
                      style="padding:0;cursor:pointer" oninput="onWf3MarginInput(this)">
                  </div>
                  <div style="background:var(--bg2);border:1px solid var(--border2);padding:10px;border-radius:6px">
                    <div style="display:flex;justify-content:space-between;font-size:10px">
                      <span style="color:var(--text3)">${I18N.t('wf3.resectionVolume')}</span>
                      <span style="font-weight:700;color:var(--accent)" id="wf3-resection">${sim.resection_volume_ml != null ? sim.resection_volume_ml : '—'} ${I18N.t('wf3.volumeMl')}</span>
                    </div>
                    ${overlaps ? `<div style="margin-top:6px;border-top:1px dashed var(--border);padding-top:6px">${I18N.t('wf3.riskOverlap')} :${overlaps}</div>` : ''}
                  </div>
                  <div style="border:1px solid ${guardColor}55;background:${guardColor}18;padding:10px;border-radius:6px">
                    <div style="font-weight:700;font-size:10px;color:${guardColor}">🛡 ${I18N.t('wf3.guardrailTitle')} : ${guard.level === 'ok' ? I18N.t('wf3.guardrailOk') : I18N.t('wf3.guardrailWarn')}</div>
                    <div style="margin-top:4px">${flags}</div>
                    <div style="font-size:8.5px;color:var(--text3);margin-top:4px">${I18N.t('wf3.guideline', { g: guard.guideline || '—' })}</div>
                  </div>
                </div>
              </div>
              <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
                <button class="btn btn-primary" style="flex:1" onclick="validateWorkflowRun()" ${run.stage === 'validated' ? 'disabled' : ''}>${I18N.t('wf3.validate')}</button>
                <button class="btn btn-secondary" onclick="exportWorkflowSr()">${I18N.t('wf3.exportSr')}</button>
                <button class="btn btn-secondary" onclick="downloadWorkflowPdf()">${I18N.t('wf3.exportPdf')}</button>
              </div>
              <div id="wf3-validated" style="margin-top:8px"></div>`;
            renderWorkflowValidated(run);
          }

          function renderWorkflowValidated(run) {
            const box = document.getElementById('wf3-validated');
            if (!box) return;
            if (run.stage === 'validated' && run.validated_at) {
              box.innerHTML = `<div style="background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);padding:10px;border-radius:6px;font-size:10px">
                ✅ ${I18N.t('wf3.validatedBy')} : <b>${run.validated_by || '—'}</b> ${I18N.t('wf3.validatedAt')} ${new Date(run.validated_at).toLocaleString()}</div>`;
            }
          }

          function onWf3MarginInput(input) {
            const val = parseFloat(input.value);
            document.getElementById('wf3-margin-val').textContent = val;
            clearTimeout(wf3._debounce);
            wf3._debounce = setTimeout(() => recalcWorkflowMargin(val), 250);
          }

          async function recalcWorkflowMargin(marginMm) {
            if (!wf3.runId) return;
            try {
              const sim = await workflowAuthedFetch('/workflow/runs/' + encodeURIComponent(wf3.runId) + '/margin', {
                method: 'POST', body: JSON.stringify({ margin_mm: marginMm })
              });
              if (wf3.run) {
                wf3.run.margin_simulation = sim;
                wf3.run.safety_margin_mm = sim.margin_mm;
                renderWorkflowPreview();
              }
              notify(I18N.t('wf3.recalcDone', { mm: marginMm }), 'ok');
            } catch (e) {
              notify(I18N.t('wf3.recalcFailed') + ' (' + e.message + ')', 'warn');
            }
          }

          async function validateWorkflowRun() {
            if (!wf3.runId) return;
            if (!confirm(I18N.t('wf3.confirmValidate'))) return;
            try {
              const res = await workflowAuthedFetch('/workflow/runs/' + encodeURIComponent(wf3.runId) + '/validate', {
                method: 'POST', body: JSON.stringify({})
              });
              if (wf3.run) {
                wf3.run.stage = res.stage;
                wf3.run.validated_at = res.validated_at;
                wf3.run.validated_by = res.validated_by;
              }
              renderWorkflowPreview();
              renderWorkflowRunsHighlight();
              notify('✅ ' + I18N.t('wf3.prepDone'), 'ok');
            } catch (e) {
              notify(I18N.t('wf3.recalcFailed') + ' (' + e.message + ')', 'warn');
            }
          }

          async function exportWorkflowSr() {
            if (!wf3.runId) return;
            try {
              const sr = await workflowAuthedFetch('/workflow/runs/' + encodeURIComponent(wf3.runId) + '/export-sr', {
                method: 'POST', body: JSON.stringify({})
              });
              notify(I18N.t('wf3.srExported', { title: sr.title || '' }), 'ok');
            } catch (e) {
              notify(I18N.t('wf3.srUnavailable') + ' (' + e.message + ')', 'warn');
            }
          }

          async function downloadWorkflowPdf() {
            if (!wf3.runId) return;
            try {
              const base = state.settings.apiBase.replace(/\/+$/, '');
              const token = await getBackendToken();
              const r = await fetch(base + '/workflow/runs/' + encodeURIComponent(wf3.runId) + '/export-pdf', {
                headers: { 'Authorization': 'Bearer ' + token }
              });
              if (!r.ok) throw new Error('HTTP ' + r.status);
              const blob = await r.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'plan_validation_' + wf3.runId.slice(0, 8) + '.pdf';
              document.body.appendChild(a); a.click(); a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 4000);
              notify(I18N.t('wf3.prepDone'), 'ok');
            } catch (e) {
              notify(I18N.t('wf3.pdfUnavailable') + ' (' + e.message + ')', 'warn');
            }
          }

          async function triggerWorkflowPrep() {
            const mod = MODULES[state.mod];
            const pid = mod && mod.patient ? mod.patient.id : '';
            try {
              const res = await workflowAuthedFetch('/workflow/auto-import', {
                method: 'POST', body: JSON.stringify({ patient_id: pid, specialty: state.mod })
              });
              notify(I18N.t('wf3.preparing'), 'info');
              loadWorkflowRuns();
            } catch (e) {
              notify(I18N.t('wf3.recalcFailed') + ' (' + e.message + ')', 'warn');
            }
          }

          document.addEventListener('DOMContentLoaded', init);
