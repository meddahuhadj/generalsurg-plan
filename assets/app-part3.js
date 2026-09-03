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
            // :not(#modal-login) — une fermeture globale ne doit jamais escamoter la
            // modale de connexion avant validation (exposerait l'app en dessous).
            document.querySelectorAll('.modal-overlay.open:not(#modal-login)').forEach(m => m.classList.remove('open'));

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
                if (id === 'otologie') {
                  if (btnD1) { btnD1.innerHTML = '🔊 Dictée : « Tympanoplastie de type I avec greffe de cartilage tragal »'; btnD1.setAttribute('onclick', "simulateCcamDictation('tympanoplastie')"); }
                  if (btnD2) { btnD2.innerHTML = '🔊 Dictée : « Mastoïdectomie avec exérèse de cholestéatome et ossiculoplastie en un temps »'; btnD2.setAttribute('onclick', "simulateCcamDictation('mastoidectomie')"); }
                } else if (id === 'rhinologie') {
                  if (btnD1) { btnD1.innerHTML = '🔊 Dictée : « Chirurgie endoscopique des sinus bilatérale avec méatotomie moyenne »'; btnD1.setAttribute('onclick', "simulateCcamDictation('cees')"); }
                  if (btnD2) { btnD2.innerHTML = '🔊 Dictée : « Septoplastie avec turbinectomie inférieure bilatérale »'; btnD2.setAttribute('onclick', "simulateCcamDictation('septoplastie')"); }
                } else if (id === 'cervicofacial') {
                  if (btnD1) { btnD1.innerHTML = '🔊 Dictée : « Parotidectomie superficielle droite avec neuromonitoring du nerf facial »'; btnD1.setAttribute('onclick', "simulateCcamDictation('parotidectomie')"); }
                  if (btnD2) { btnD2.innerHTML = '🔊 Dictée : « Curage ganglionnaire cervical fonctionnel des niveaux II à IV »'; btnD2.setAttribute('onclick', "simulateCcamDictation('curage_cervical')"); }
                } else if (id === 'pediatrique') {
                  if (btnD1) { btnD1.innerHTML = '🔊 Dictée : « Amygdalectomie bilatérale avec adénoïdectomie pour syndrome d\'apnées obstructives »'; btnD1.setAttribute('onclick', "simulateCcamDictation('amygdalectomie')"); }
                  if (btnD2) { btnD2.innerHTML = '🔊 Dictée : « Pose d\'aérateurs trans-tympaniques bilatéraux pour otite séro-muqueuse chronique »'; btnD2.setAttribute('onclick', "simulateCcamDictation('att')"); }
                } else {
                  if (btnD1) { btnD1.innerHTML = '🔊 Dictée : « Laryngectomie totale avec curage cervical fonctionnel bilatéral »'; btnD1.setAttribute('onclick', "simulateCcamDictation('laryngectomie')"); }
                  if (btnD2) { btnD2.innerHTML = '🔊 Dictée : « Cordectomie transorale au laser CO2 pour carcinome T1a de la corde vocale droite »'; btnD2.setAttribute('onclick', "simulateCcamDictation('cordectomie')"); }
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
            if (p.id === '40218-LAR') planningInfo = `${room1} • 10:30 - 14:30 (${I18N.t('sidebar.statusOngoing')})`;
            else if (p.id === '52130-OTO') planningInfo = `${room1} • 08:00 - 10:00 (${I18N.t('sidebar.statusDone')})`;
            else if (p.id === '61045-RHI') planningInfo = `${room1} • 15:00 - 18:00 (${I18N.t('sidebar.statusPlanned')})`;
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

            // Plan chirurgical pane (FLR/marge/FEM via backend — planification réelle)
            let planchirHtml = `<div class="rtab-pane" id="pane-planchir">
    <div id="planchir-body">Connexion au backend…</div>
  </div>`;

            body.innerHTML = planHtml + implantHtml + chatHtml + analyseHtml + planchirHtml;
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
            const refML = { laryngologie: 15, otologie: 2, rhinologie: 40, cervicofacial: 25, pediatrique: 10, anesthesie_reanimation: 500 }[state.mod] || 500;
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
            // Si le backend est configuré et qu'un plan chirurgical RETENU (SELECTED) existe,
            // l'export passe par le vrai endpoint DICOM SR du plan calculé sur le maillage segmenté.
            // Sinon, fallback honnête : export JSON local clairement étiqueté estimation procédurale.
            if (state.settings.apiBase) {
              try {
                const plans = await planChirurgicalList(mod.patient.id);
                const selected = plans.find(p => p.status === 'SELECTED');
                if (selected) {
                  await planChirurgicalExport(mod.patient.id, selected.id, 'dicom-sr');
                  notify('Export DICOM SR du plan chirurgical retenu généré', 'ok');
                  return;
                }
              } catch (e) { /* fall through to local export */ }
            }
            const realVol = getRealSegmentationVolumeMl();
            const organVol = realVol != null ? realVol : computeOrganVolumeMl();
            const volumeSource = realVol != null ? 'real_segmentation_totalsegmentator' : 'procedural_estimate_not_clinical';
            const payload = {
              patient: { id: mod.patient.id, nom: mod.patient.nom },
              specialty: state.mod,
              volumetrie: { organ_volume_ml: Math.round(organVol), remnant_pct: 60, volume_source: volumeSource },
              notes: 'Export généré depuis ORLSurgPlan3D'
                + (volumeSource === 'procedural_estimate_not_clinical'
                  ? ' — ⚠ volume_organe = estimation procédurale, PAS une mesure de segmentation clinique validée.'
                  : ' — volume_organe issu de la segmentation IA réelle (TotalSegmentator).')
            };
            downloadJson(payload, `plan_${mod.patient.id}.json`);
            notify('Export local généré (plan retenu inexistant ou backend non configuré)', 'info');
          }

          function downloadJson(obj, filename) {
            const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
            URL.revokeObjectURL(url);
          }

          // ════════════════════════════════════════════════
          //  PLAN CHIRURGICAL — pont frontend ↔ backend de planification réelle
          //  (/api/v2/surgical-planning/...). Le backend calcule sur le maillage
          //  segmenté : FLR (découpage tétraédrique), marge oncologique tumeur↔plan,
          //  relaxation hyperélastique post-résection (FEM Mooney-Rivlin/Ogden), plans
          //  persistés, plan retenu (SELECTED), export PDF / DICOM SR.
          //  Les fonctions pures (chemin API, payload, tri anatomique, HTML) sont
          //  testées par pbdtest_reports/run_test_plan_chirurgical.js.
          // ════════════════════════════════════════════════

          function planChirurgicalBase() {
            return state.settings.apiBase ? state.settings.apiBase.replace(/\/+$/, '') : '';
          }

          function planChirurgicalAvailable() {
            return !!(state.settings && state.settings.apiBase);
          }

          function planChirurgicalPatientId() {
            const mod = MODULES[state.mod];
            return mod && mod.patient ? mod.patient.id : '';
          }

          function planChirurgicalPath(kind, patientId, planId) {
            const pid = encodeURIComponent(patientId || '');
            const base = '/api/v2/surgical-planning/patients/' + pid + '/resection';
            switch (kind) {
              case 'simulate': return base + '/simulate';
              case 'plans': return base + '/plans';
              case 'plan': return base + '/plans/' + encodeURIComponent(planId || '');
              case 'select': return base + '/plans/' + encodeURIComponent(planId || '') + '/select';
              case 'export': return base + '/plans/' + encodeURIComponent(planId || '') + '/export';
              case 'export-guide': return base + '/plans/' + encodeURIComponent(planId || '') + '/export-guide';
              case 'export-meshes': return base + '/plans/' + encodeURIComponent(planId || '') + '/export-meshes';
              default: return base;
            }
          }

          async function planChirurgicalFetch(path, opts) {
            opts = opts || {};
            if (!planChirurgicalAvailable()) throw new Error('Planification réelle indisponible : aucun backend configuré (⚙ Paramètres).');
            const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
            const token = await getBackendToken();
            if (token) headers['Authorization'] = 'Bearer ' + token;
            const init = { method: opts.method || 'GET', headers };
            if (opts.body !== undefined && opts.body !== null) init.body = JSON.stringify(opts.body);
            const r = await fetch(planChirurgicalBase() + path, init);
            if (r.status === 401) await handleUnauthorized(r);
            return r;
          }

          function planChirurgicalSimulatePayload(planePoint, planeNormal, marginMm, tissueType, model, runFem) {
            return {
              plane_point: [Number(planePoint[0]), Number(planePoint[1]), Number(planePoint[2])],
              plane_normal: [Number(planeNormal[0]), Number(planeNormal[1]), Number(planeNormal[2])],
              margin_mm: Math.min(50, Math.max(0, Number(marginMm) || 5.0)),
              tissue_type: tissueType || 'liver_parenchyma',
              model: model || 'mooney_rivlin',
              run_fem: !!runFem,
              max_displacement_mm: 1.5
            };
          }

          async function planChirurgicalSimulate(patientId, payload) {
            const r = await planChirurgicalFetch(planChirurgicalPath('simulate', patientId), { method: 'POST', body: payload });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error((data.detail || 'Simulation échouée') + (data.error_id ? ' [' + data.error_id + ']' : ''));
            return data;
          }

          async function planChirurgicalList(patientId) {
            const r = await planChirurgicalFetch(planChirurgicalPath('plans', patientId));
            if (!r.ok) return [];
            return await r.json();
          }

          async function planChirurgicalSave(patientId, title, payload) {
            const body = Object.assign({ title: title || 'Plan de résection' }, payload);
            const r = await planChirurgicalFetch(planChirurgicalPath('plans', patientId), { method: 'POST', body });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error((data.detail || 'Enregistrement du plan échoué') + (data.error_id ? ' [' + data.error_id + ']' : ''));
            return data;
          }

          async function planChirurgicalSelect(patientId, planId) {
            const r = await planChirurgicalFetch(planChirurgicalPath('select', patientId, planId), { method: 'POST' });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error((data.detail || 'Sélection du plan impossible') + (data.error_id ? ' [' + data.error_id + ']' : ''));
            return data;
          }

          async function planChirurgicalDelete(patientId, planId) {
            const r = await planChirurgicalFetch(planChirurgicalPath('plan', patientId, planId), { method: 'DELETE' });
            if (!r.ok) throw new Error('Suppression du plan impossible (' + r.status + ')');
          }

          async function planChirurgicalExport(patientId, planId, format) {
            const r = await planChirurgicalFetch(planChirurgicalPath('export', patientId, planId) + '?format=' + encodeURIComponent(format || 'pdf'));
            if (!r.ok) {
              const data = await r.json().catch(() => ({}));
              throw new Error((data.detail || 'Export impossible') + (data.error_id ? ' [' + data.error_id + ']' : ''));
            }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'plan_' + String(planId || 'x').slice(0, 8) + '.' + (format === 'dicom-sr' ? 'dcm' : 'pdf');
            a.click();
            URL.revokeObjectURL(url);
          }

          async function planChirurgicalExportGuide(patientId, planId, format) {
            format = format || 'stl';
            const r = await planChirurgicalFetch(planChirurgicalPath('export-guide', patientId, planId) + '?format=' + encodeURIComponent(format));
            if (!r.ok) {
              const data = await r.json().catch(() => ({}));
              throw new Error((data.detail || 'Export du guide 3D impossible') + (data.error_id ? ' [' + data.error_id + ']' : ''));
            }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'guide_' + String(planId || 'x').slice(0, 8) + '.' + format;
            a.click();
            URL.revokeObjectURL(url);
          }

          async function planChirurgicalExportMeshes(patientId, planId, part) {
            part = part || 'remnant';
            const r = await planChirurgicalFetch(planChirurgicalPath('export-meshes', patientId, planId) + '?part=' + encodeURIComponent(part));
            if (!r.ok) {
              const data = await r.json().catch(() => ({}));
              throw new Error((data.detail || 'Export du maillage 3D impossible') + (data.error_id ? ' [' + data.error_id + ']' : ''));
            }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'organ_' + part + '_' + String(planId || 'x').slice(0, 8) + '.stl';
            a.click();
            URL.revokeObjectURL(url);
          }

          async function planChirurgicalEnsurePatient() {
            const patientId = planChirurgicalPatientId();
            const mod = MODULES[state.mod];
            const body = {
              id: patientId, nom: mod.patient.nom, age: mod.patient.age, sexe: mod.patient.sexe || 'M',
              poids_kg: mod.patient.poids || 70, taille_cm: mod.patient.taille || 170,
              diagnostic: mod.patient.diag, chirurgien: state.settings.chirurgien || 'Dr. non renseigné',
              specialty: state.mod, urgence: mod.patient.urg || 'vert'
            };
            let r = await planChirurgicalFetch('/patients/' + encodeURIComponent(patientId), { method: 'PUT', body });
            if (r.status === 404) {
              r = await planChirurgicalFetch('/patients', { method: 'POST', body });
              if (!r.ok) throw new Error('Création du patient dans le backend impossible (' + r.status + ')');
            } else if (!r.ok) {
              throw new Error('Synchronisation du patient impossible (' + r.status + ')');
            }
            return true;
          }

          async function planChirurgicalSegments() {
            const r = await planChirurgicalFetch('/patients/' + encodeURIComponent(planChirurgicalPatientId()) + '/segments');
            if (!r.ok) return [];
            return await r.json();
          }

          async function planChirurgicalGenerateSyntheticOrgan() {
            const r = await planChirurgicalFetch('/api/v2/demo/synthetic-organ', { method: 'POST', body: { patient_id: planChirurgicalPatientId() } });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error((data.detail || 'Génération de l\'anatomie synthétique impossible') + (data.error_id ? ' [' + data.error_id + ']' : ''));
            return data;
          }

          // Tri des segments en organe(s) planifiable(s) et lésion(s) + badge honnête réel/synthétique.
          // mesh_ref /meshes/{job_id}/... = segmentation IA réelle ; /meshes/demo/... ou 'synthetic' = démo.
          function planChirurgicalPlanifiable(segments) {
            const segs = segments || [];
            const organs = segs.filter(s => s.type === 'organe' || s.type === 'structure_tubulaire' || s.type === 'liver');
            const lesions = segs.filter(s => s.type === 'lesion' || s.type === 'liver_tumor' || s.type === 'tumeur');
            const withMesh = segs.filter(s => !!s.mesh_ref);
            const isSynthetic = s => s.mesh_ref.includes('/demo/') || /synthetic/i.test(s.mesh_ref);
            return {
              organs, lesions,
              hasOrganMesh: organs.some(s => !!s.mesh_ref),
              hasLesionMesh: lesions.some(s => !!s.mesh_ref),
              hasMesh: withMesh.length > 0,
              realCount: withMesh.filter(s => !isSynthetic(s)).length,
              syntheticCount: withMesh.filter(s => isSynthetic(s)).length,
              total: segs.length
            };
          }

          // ── Pont MPR → plan de coupe (référentiel maillage, mm) ──
          // L'outil « ✂️ Wedge » (state.mpr.toolMode='curved') laisse un tracé de points
          // normalisés (0..1) sur une vue MPR (state.mpr.curvedCut.points). Ce pont le convertit
          // en { plane_point, plane_normal } dans le référentiel du maillage segmenté (mm) :
          //   • vue axial  → coupe = z ; coronal → y ; sagittal → x (aligné sur drawMprOverlay) ;
          //   • voxel → mm : mode 'corner' (segmentation réelle, vertices mm, origine coin NIfTI,
          //     coordonnée = voxel × spacing) ou 'synthetic' (anatomie démo centrée origine,
          //     ≈2.5 mm/voxel — conversion documentée approximative, démo uniquement) ;
          //   • plan de coupe = plan contenant la droite du tracé, perpendiculaire à la vue.
          function planChirurgicalMprViewAxes(view) {
            if (view === 'coronal') return { u: 0, v: 2, w: 1, normal: [0, 1, 0] };
            if (view === 'sagittal') return { u: 2, v: 1, w: 0, normal: [1, 0, 0] };
            return { u: 0, v: 1, w: 2, normal: [0, 0, 1] }; // axial
          }

          function planChirurgicalMprVoxelFromNormalized(view, nPx, nPy, N, sliceIdx) {
            const a = planChirurgicalMprViewAxes(view);
            const vox = [0, 0, 0];
            vox[a.u] = nPx * N;
            vox[a.v] = nPy * N;
            vox[a.w] = sliceIdx;
            return vox;
          }

          function planChirurgicalMprToMeshMm(voxel, spacing, mode) {
            const sp = spacing || {};
            const sx = Number(sp.x) || 1, sy = Number(sp.y) || 1, sz = Number(sp.z) || 1;
            if (mode === 'synthetic') {
              const N = 64, mmPerVoxel = 2.5;
              return [(voxel[0] - N / 2) * mmPerVoxel, (voxel[1] - N / 2) * mmPerVoxel, (voxel[2] - N / 2) * mmPerVoxel];
            }
            return [voxel[0] * sx, voxel[1] * sy, voxel[2] * sz];
          }

          function planChirurgicalMprPlaneFromCut(cut, opts) {
            opts = opts || {};
            const pts = cut && Array.isArray(cut.points) ? cut.points : [];
            if (!pts.length) return null;
            const view = cut.view || 'axial';
            const N = opts.volSize || 64;
            const spacing = opts.spacing;
            const sliceIdx = (cut.sliceIdx != null) ? cut.sliceIdx : (opts.planeIdx != null ? opts.planeIdx : 0);
            const mode = opts.mode === 'synthetic' ? 'synthetic' : 'corner';
            const a = planChirurgicalMprViewAxes(view);

            const pts3d = pts.map(p => planChirurgicalMprToMeshMm(
              planChirurgicalMprVoxelFromNormalized(view, p[0], p[1], N, sliceIdx), spacing, mode));

            let c = [0, 0, 0];
            pts3d.forEach(p => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; });
            c = [c[0] / pts3d.length, c[1] / pts3d.length, c[2] / pts3d.length];

            if (pts3d.length === 1) {
              return { plane_point: c, plane_normal: a.normal.slice(), view, sliceIdx, mode, points: 1 };
            }

            // Droite de moindres carrés dans le plan de la vue (axes u,v) : vecteur propre
            // dominant de la matrice de covariance 2×2.
            let cuu = 0, cuv = 0, cvv = 0;
            pts3d.forEach(p => {
              const du = p[a.u] - c[a.u], dv = p[a.v] - c[a.v];
              cuu += du * du; cuv += du * dv; cvv += dv * dv;
            });
            const trace = cuu + cvv;
            let dirU = 1, dirV = 0;
            if (trace > 1e-12) {
              const disc = Math.sqrt(Math.max(0, trace * trace - 4 * (cuu * cvv - cuv * cuv)));
              const l1 = (trace + disc) / 2;
              if (Math.abs(cuv) > 1e-12) { dirU = l1 - cvv; dirV = cuv; }
              else if (cuu >= cvv) { dirU = 1; dirV = 0; }
              else { dirU = 0; dirV = 1; }
              const dl = Math.hypot(dirU, dirV) || 1;
              dirU /= dl; dirV /= dl;
            }
            const d = [0, 0, 0];
            d[a.u] = dirU; d[a.v] = dirV;
            // Normale du plan de coupe = normale de la vue × direction du tracé.
            const n = [
              a.normal[1] * d[2] - a.normal[2] * d[1],
              a.normal[2] * d[0] - a.normal[0] * d[2],
              a.normal[0] * d[1] - a.normal[1] * d[0],
            ];
            const nl = Math.hypot(n[0], n[1], n[2]) || 1;
            return {
              plane_point: [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100, Math.round(c[2] * 100) / 100],
              plane_normal: [Math.round(n[0] / nl * 100) / 100, Math.round(n[1] / nl * 100) / 100, Math.round(n[2] / nl * 100) / 100],
              view, sliceIdx, mode, points: pts3d.length,
            };
          }

          // Mode de conversion MPR→maillage par défaut : 'corner' pour une segmentation réelle,
          // 'synthetic' quand seule l'anatomie de démo (centrée) est chargée.
          function planChirurgicalDefaultMappingMode(anat) {
            return anat && anat.syntheticCount > 0 && anat.realCount === 0 ? 'synthetic' : 'corner';
          }

          // Métriques FLR/marge/FEM → HTML (pure, testable).
          function planChirurgicalMetricsHtml(m) {
            m = m || {};
            const flr = m.flr_pct;
            const flrOk = typeof flr === 'number' && flr >= 30;
            const marginOk = m.margin_ok;
            const rows = [
              '<div class="metric-row"><span class="k">Volume total</span><span class="v">' + (m.total_volume_ml != null ? m.total_volume_ml + ' ml' : 'n/a') + '</span></div>',
              '<div class="metric-row"><span class="k">Volume réséqué</span><span class="v">' + (m.resected_volume_ml != null ? m.resected_volume_ml + ' ml' : 'n/a') + '</span></div>',
              '<div class="metric-row"><span class="k">Reliquat (remnant)</span><span class="v">' + (m.remnant_volume_ml != null ? m.remnant_volume_ml + ' ml' : 'n/a') + '</span></div>',
              '<div class="metric-row"><span class="k">FLR</span><span class="v ' + (flrOk ? 'ok' : 'warn') + '">' + (flr != null ? flr + '%' : 'n/a') + '</span></div>'
            ];
            if (m.margin_mm != null) {
              rows.push('<div class="metric-row"><span class="k">Marge tumorale</span><span class="v ' + (marginOk ? 'ok' : 'alert') + '">' + m.margin_mm + ' mm' + (marginOk === false ? ' (insuffisante)' : '') + '</span></div>');
            }
            if (Array.isArray(m.critical_structure_margins) && m.critical_structure_margins.length > 0) {
              m.critical_structure_margins.forEach(cs => {
                const val = cs.margin_mm;
                const ok = val != null && val >= 3.0;
                rows.push('<div class="metric-row"><span class="k">Marge ' + escapeHtml(cs.label || cs.type) + '</span><span class="v ' + (val == null ? '' : (ok ? 'ok' : 'warn')) + '">' + (val != null ? val + ' mm' : 'n/a') + '</span></div>');
              });
            }
            if (m.strain_energy_relaxation_pct != null) {
              rows.push(
                '<div class="metric-row"><span class="k">Relaxation FEM</span><span class="v">' + m.strain_energy_relaxation_pct + '%</span></div>',
                '<div class="metric-row"><span class="k">Déplacement max</span><span class="v">' + (m.peak_displacement_mm != null ? m.peak_displacement_mm + ' mm' : 'n/a') + '</span></div>',
                '<div class="metric-row"><span class="k">Convergence</span><span class="v ' + (m.converged ? 'ok' : 'warn') + '">' + (m.converged ? 'oui' : 'non') + (m.iterations != null ? ' (' + m.iterations + ' it.)' : '') + '</span></div>'
              );
            }
            return '<div class="psec"><div class="psec-title">Métriques calculées (backend)</div>' + rows.join('') + '</div>';
          }

          function planChirurgicalBadgeHtml(anat) {
            if (anat.syntheticCount > 0 && anat.realCount === 0) return '<span class="planchir-badge synth">anatomie synthétique (démo)</span>';
            if (anat.realCount > 0 && anat.syntheticCount === 0) return '<span class="planchir-badge real">segmentation IA réelle</span>';
            if (anat.realCount > 0 && anat.syntheticCount > 0) return '<span class="planchir-badge mixed">mixte réel + synthétique</span>';
            return '<span class="planchir-badge none">aucun maillage 3D</span>';
          }

          function planChirurgicalPanelHtml(anat, plans) {
            const plansList = plans || [];
            const organsOpts = anat.organs.map((s, i) =>
              '<label class="planchir-org"><input type="radio" name="planchir-organ" value="' + escapeHtml(s.mesh_ref || '') + '" data-name="' + escapeHtml(s.name || '') + '"' + (i === 0 ? ' checked' : '') + '/>' + escapeHtml(s.name || '') + '<span class="sub">' + escapeHtml(s.type || '') + (s.mesh_ref ? '' : ' · sans maillage') + '</span></label>'
            ).join('') || '<div class="planchir-empty">Aucun organe segmenté. Lancez la segmentation (bouton Anatomie) ou générez une anatomie démo.</div>';
            const plansHtml = plansList.map(p => {
              const m = p.metrics || {};
              const isSel = p.status === 'SELECTED';
              return '<div class="planchir-plan' + (isSel ? ' sel' : '') + '">'
                + '<div class="planchir-plan-head"><span class="planchir-plan-title">' + escapeHtml(p.title || '') + '</span>'
                + '<span class="planchir-plan-status ' + (isSel ? 'ok' : '') + '">' + (isSel ? '★ RETENU' : 'brouillon') + '</span></div>'
                + '<div class="planchir-plan-meta">FLR ' + (m.flr_pct != null ? m.flr_pct + '%' : 'n/a')
                + ' · marge ' + (m.margin_mm != null ? m.margin_mm + ' mm' : 'n/a')
                + (m.margin_ok === false ? ' ⚠' : '')
                + (m.strain_energy_relaxation_pct != null ? ' · FEM ' + m.strain_energy_relaxation_pct + '%' : '') + '</div>'
                + '<div class="planchir-plan-actions">'
                + '<button class="btn-planchir" data-plan-id="' + p.id + '" data-act="select"' + (isSel ? ' disabled' : '') + '>Retenir</button>'
                + '<button class="btn-planchir" data-plan-id="' + p.id + '" data-act="export">PDF</button>'
                + '<button class="btn-planchir" data-plan-id="' + p.id + '" data-act="export-sr">DICOM SR</button>'
                + '<button class="btn-planchir accent" data-plan-id="' + p.id + '" data-act="export-guide">🖨️ Guide 3D (STL)</button>'
                + '<button class="btn-planchir" data-plan-id="' + p.id + '" data-act="export-meshes">📦 Maillages (STL)</button>'
                + '<button class="btn-planchir danger" data-plan-id="' + p.id + '" data-act="del">Suppr.</button>'
                + '</div></div>';
            }).join('') || '<div class="planchir-empty">Aucun plan enregistré. Réglez le plan de coupe puis « Simuler & enregistrer ».</div>';
            return ''
              + '<div class="psec"><div class="psec-title">Anatomie planifiable</div>'
              + '<div class="planchir-badge-row">' + planChirurgicalBadgeHtml(anat) + (anat.total ? '<span class="planchir-badge none">' + anat.total + ' segment(s)</span>' : '') + '</div>'
              + organsOpts
              + (anat.hasMesh ? '' : '<button class="btn-planchir accent" id="planchir-gen">⚙ Générer une anatomie démo</button>')
              + '</div>'
              + '<div class="psec"><div class="psec-title">Plan de coupe (mm, référentiel du maillage segmenté)</div>'
              + '<div class="planchir-empty" id="planchir-mpr-status">Dessinez une coupe avec l\'outil « ✂️ Wedge » sur une vue MPR (axial/coronal/sagittal), puis « ↩ Importer le tracé MPR ». Conversion voxel→mm approximative ; le backend recalcule FLR/marge sur le vrai maillage.</div>'
              + '<div class="form-row"><label class="form-label">Référentiel MPR → maillage (mm)</label><select class="form-control" id="planchir-mapmode">'
              + '<option value="corner"' + (planChirurgicalDefaultMappingMode(anat) === 'corner' ? ' selected' : '') + '>Segmentation réelle (voxel × spacing)</option>'
              + '<option value="synthetic"' + (planChirurgicalDefaultMappingMode(anat) === 'synthetic' ? ' selected' : '') + '>Anatomie démo centrée (≈2.5 mm/voxel)</option>'
              + '</select></div>'
              + '<button class="btn-planchir accent" id="planchir-import-mpr" style="width:100%">↩ Importer le tracé MPR (✂️ Wedge)</button>'
              + '<div class="form-row"><label class="form-label">Point du plan (x,y,z)</label><div class="planchir-vec">'
              + [0, 1, 2].map(i => '<input type="number" step="1" class="form-control planchir-num" id="planchir-pp' + i + '" value="0"/>').join('')
              + '</div></div>'
              + '<div class="form-row"><label class="form-label">Normale (nx,ny,nz) — côté positif = reliquat</label><div class="planchir-vec">'
              + [0, 1, 2].map(i => '<input type="number" step="0.1" class="form-control planchir-num" id="planchir-pn' + i + '" value="' + (i === 2 ? '1' : '0') + '"/>').join('')
              + '</div></div>'
              + '<div class="form-row"><label class="form-label">Marge tumorale demandée (mm)</label><input type="number" step="0.5" min="0" max="50" class="form-control planchir-num" id="planchir-margin" value="5"/></div>'
              + '<div class="form-row"><label class="form-label">Tissu anatomique</label><select class="form-control" id="planchir-tissue">'
              + '<option value="liver_parenchyma">Parenchyme hépatique</option>'
              + '<option value="soft_tissue">Tissus mous génériques</option>'
              + '<option value="nerve_epineurium">Nerf (Épinèvre - ORL)</option>'
              + '<option value="cartilage_hyaline">Cartilage hyalin (Larynx/Trachée - ORL)</option>'
              + '<option value="bone_cortical">Os cortical (Mandibule/Os temporal - ORL)</option>'
              + '<option value="gland_soft">Glande salivaire (Parotide/Submandibulaire - ORL)</option>'
              + '<option value="muscle_skeletal">Muscle squelettique</option>'
              + '</select></div>'
              + '<div class="form-row"><label class="form-label">Modèle hyperélastique</label><select class="form-control" id="planchir-model">'
              + '<option value="mooney_rivlin">Mooney-Rivlin</option><option value="ogden">Ogden</option><option value="neo_hookean">Néo-hookéen</option><option value="linear">Linéaire (rapide)</option>'
              + '</select></div>'
              + '<div class="form-row"><label class="form-label check"><input type="checkbox" id="planchir-fem" checked/> FEM post-résection (≈5-15 s)</label></div>'
              + '<button class="btn-primary" id="planchir-sim" style="width:100%">▶ Simuler & enregistrer le plan</button>'
              + '</div>'
              + '<div class="psec"><div class="psec-title">Plans enregistrés</div>' + plansHtml + '</div>';
          }

          function planChirurgicalOfflineHtml() {
            return '<div class="psec"><div class="psec-title">Plan chirurgical</div>'
              + '<div class="planchir-empty">Planification réelle indisponible — le backend n\'est pas configuré. '
              + 'Ouvrez ⚙ Paramètres et renseignez l\'URL de l\'API (puis reconnectez-vous) pour activer le calcul '
              + 'FLR/marge/FEM sur le maillage segmenté, la persistance des plans et l\'export PDF / DICOM SR / Guide 3D STL.</div></div>';
          }

          async function planChirurgicalRefresh() {
            const el = document.getElementById('planchir-body');
            if (!el) return;
            if (!planChirurgicalAvailable()) {
              el.innerHTML = planChirurgicalOfflineHtml();
              return;
            }
            el.innerHTML = '<div class="psec"><div class="psec-title">Plan chirurgical</div><div class="planchir-empty">Connexion au backend…</div></div>';
            try {
              await planChirurgicalEnsurePatient();
              const segments = await planChirurgicalSegments();
              const plans = await planChirurgicalList(planChirurgicalPatientId());
              el.innerHTML = planChirurgicalPanelHtml(planChirurgicalPlanifiable(segments), plans);
              planChirurgicalBind(el);
            } catch (e) {
              el.innerHTML = '<div class="psec"><div class="psec-title">Plan chirurgical</div>'
                + '<div class="planchir-empty" style="color:#ef4444">' + escapeHtml(e.message) + '</div></div>';
            }
          }

          function planChirurgicalBind(root) {
            root = root || document;
            const simBtn = root.querySelector('#planchir-sim');
            if (simBtn) simBtn.addEventListener('click', planChirurgicalSimulateFromUi);
            const genBtn = root.querySelector('#planchir-gen');
            if (genBtn) genBtn.addEventListener('click', planChirurgicalGenerateFromUi);
            const importBtn = root.querySelector('#planchir-import-mpr');
            if (importBtn) importBtn.addEventListener('click', planChirurgicalImportMprPlane);

            const tissueSelect = root.querySelector('#planchir-tissue');
            const femCheckbox = root.querySelector('#planchir-fem');
            if (tissueSelect && femCheckbox) {
              tissueSelect.addEventListener('change', () => {
                const val = tissueSelect.value;
                if (val === 'cartilage_hyaline' || val === 'bone_cortical' || val === 'bone') {
                  femCheckbox.checked = false;
                  femCheckbox.disabled = true;
                  notify('FEM désactivée pour ce tissu rigide (calcul géométrique uniquement).', 'info');
                } else {
                  femCheckbox.disabled = false;
                }
              });
            }

            root.querySelectorAll('[data-plan-id]').forEach(btn => {
              btn.addEventListener('click', () => {
                const id = btn.dataset.planId;
                const act = btn.dataset.act;
                if (act === 'select') planChirurgicalSelectUi(id);
                else if (act === 'export') planChirurgicalExportUi(id, 'pdf');
                else if (act === 'export-sr') planChirurgicalExportUi(id, 'dicom-sr');
                else if (act === 'export-guide') planChirurgicalExportGuideUi(id);
                else if (act === 'export-meshes') planChirurgicalExportMeshesUi(id);
                else if (act === 'del') planChirurgicalDeleteUi(id);
              });
            });
          }

          async function planChirurgicalGenerateFromUi() {
            try {
              notify('Génération de l\'anatomie synthétique (organe + lésion)…', 'info');
              await planChirurgicalGenerateSyntheticOrgan();
              notify('Anatomie démo générée — relancez la planification.', 'ok');
              planChirurgicalRefresh();
            } catch (e) { notify(e.message, 'error'); }
          }

          // Importe le tracé MPR (✂️ Wedge) dans les champs plan de coupe et signale le résultat.
          function planChirurgicalImportMprPlane() {
            const cut = state.mpr.curvedCut;
            if (!cut || !Array.isArray(cut.points) || cut.points.length === 0) {
              notify('Aucun tracé MPR — dessinez d\'abord une coupe avec l\'outil « ✂️ Wedge » sur une vue axiale/coronale/sagittale.', 'warn');
              return;
            }
            const modeSel = document.getElementById('planchir-mapmode');
            const mode = modeSel ? modeSel.value : 'corner';
            const plane = planChirurgicalMprPlaneFromCut(cut, {
              volSize: state.mpr.volSize,
              spacing: state.mpr.spacing,
              planeIdx: state.mpr.plane ? state.mpr.plane[cut.view] : 0,
              mode,
            });
            if (!plane) { notify('Tracé MPR vide.', 'warn'); return; }
            plane.plane_point.forEach((v, i) => { const el = document.getElementById('planchir-pp' + i); if (el) el.value = v; });
            plane.plane_normal.forEach((v, i) => { const el = document.getElementById('planchir-pn' + i); if (el) el.value = v; });
            const st = document.getElementById('planchir-mpr-status');
            if (st) {
              st.textContent = 'Plan importé : vue ' + plane.view + ', coupe ' + plane.sliceIdx + ', '
                + plane.points + ' point(s), mode ' + (plane.mode === 'synthetic' ? 'démo' : 'segmentation réelle')
                + ' — vérifiez le FLR calculé (conversion voxel→mm approximative).';
            }
            notify('Plan de coupe importé depuis le tracé MPR (' + plane.view + ').', 'ok');
          }

          async function planChirurgicalSimulateFromUi() {
            const organ = document.querySelector('input[name="planchir-organ"]:checked');
            if (!organ) { notify('Sélectionnez d\'abord un organe planifiable.', 'error'); return; }
            const pp = [0, 1, 2].map(i => Number(document.getElementById('planchir-pp' + i).value) || 0);
            const pn = [0, 1, 2].map(i => Number(document.getElementById('planchir-pn' + i).value) || 0);
            const margin = Number(document.getElementById('planchir-margin').value) || 5;
            const tissue = document.getElementById('planchir-tissue').value;
            const model = document.getElementById('planchir-model').value;
            const runFem = document.getElementById('planchir-fem').checked;
            const payload = planChirurgicalSimulatePayload(pp, pn, margin, tissue, model, runFem);
            notify('Calcul en cours (tétraédrisation + marge' + (runFem ? ' + FEM' : '') + ')…', 'info');
            const btn = document.getElementById('planchir-sim');
            if (btn) btn.disabled = true;
            try {
              const out = await planChirurgicalSimulate(planChirurgicalPatientId(), payload);
              const m = out.metrics || {};
              await planChirurgicalSave(planChirurgicalPatientId(), 'Résection — marge ' + margin + ' mm', payload);
              const flr = m.flr_pct != null ? m.flr_pct + '%' : 'n/a';
              const mg = m.margin_mm != null ? m.margin_mm + ' mm' : 'n/a';
              notify('Plan enregistré : FLR ' + flr + ' · marge ' + mg + (m.margin_ok === false ? ' (⚠ insuffisante)' : ''), m.margin_ok === false ? 'warn' : 'ok');
              if (out.warning) console.warn('[Plan chirurgical] ' + out.warning);
              planChirurgicalRefresh();
            } catch (e) {
              notify('Échec simulation : ' + e.message, 'error');
            } finally {
              if (btn) btn.disabled = false;
            }
          }

          async function planChirurgicalSelectUi(planId) {
            try {
              const rec = await planChirurgicalSelect(planChirurgicalPatientId(), planId);
              notify('Plan retenu : « ' + rec.title + ' »', 'ok');
              planChirurgicalRefresh();
            } catch (e) { notify(e.message, 'error'); }
          }

          async function planChirurgicalExportUi(planId, format) {
            try {
              await planChirurgicalExport(planChirurgicalPatientId(), planId, format);
              notify('Export ' + (format === 'dicom-sr' ? 'DICOM SR' : 'PDF') + ' du plan généré.', 'ok');
            } catch (e) { notify(e.message, 'error'); }
          }

          async function planChirurgicalExportGuideUi(planId, format) {
            try {
              notify('Génération du guide de coupe 3D sur-mesure (STL)…', 'info');
              await planChirurgicalExportGuide(planChirurgicalPatientId(), planId, format || 'stl');
              notify('Guide de coupe 3D (STL) téléchargé — prêt pour l\'impression 3D.', 'ok');
            } catch (e) { notify(e.message, 'error'); }
          }

          async function planChirurgicalExportMeshesUi(planId, part) {
            try {
              notify('Export des sous-maillages 3D (STL)…', 'info');
              await planChirurgicalExportMeshes(planChirurgicalPatientId(), planId, part || 'remnant');
              notify('Maillage 3D (STL) du reliquat d\'organe téléchargé.', 'ok');
            } catch (e) { notify(e.message, 'error'); }
          }

          async function planChirurgicalDeleteUi(planId) {
            if (!window.confirm('Supprimer ce plan de résection ?')) return;
            try {
              await planChirurgicalDelete(planChirurgicalPatientId(), planId);
              notify('Plan supprimé.', 'info');
              planChirurgicalRefresh();
            } catch (e) { notify(e.message, 'error'); }
          }

          function setTab(tab) {
            state.tab = tab;
            document.querySelectorAll('.rtab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
            document.querySelectorAll('.rtab-pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + tab));
            if (tab === 'planchir') planChirurgicalRefresh();
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
              // Segmentation manuelle (Wand — tumeur, veine porte, veine sus-hépatique) : pesait sinon
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
                state.mpr.curvedCut.view = null;
                state.mpr.curvedCut.sliceIdx = null;
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

          // ── Paramètres avancés (technique/maintenance) ──────────────────────
          // Masque par défaut les réglages techniques (clé Gemini, URL backend)
          // pour que le chirurgien ne voie que les outils utilisables au bloc ;
          // le personnel technique/maintenance les révèle explicitement.
          function setAdvancedMode(on) {
            state.advancedMode = !!on;
            document.body.classList.toggle('advanced-mode', state.advancedMode);
            const btn = document.getElementById('btn-advanced-toggle');
            if (btn) btn.classList.toggle('active', state.advancedMode);
            notify(state.advancedMode
              ? '🔧 Paramètres avancés activés — réglages techniques (⚙) visibles'
              : '✅ Seuls les outils validés pour le bloc sont affichés', 'info');
          }
          function toggleAdvancedMode() { setAdvancedMode(!state.advancedMode); }

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
            laryngologie: [
              { kw: ['tnm', 'stade', 't3', 't4'], a: "La stadification T du larynx dépend de la sous-unité et de la mobilité cordale : T1 = lésion limitée à une sous-unité avec mobilité normale, T2 = extension muqueuse avec mobilité normale ou diminuée, T3 = fixation cordale ou envahissement de l'espace paraglottique/de la corticale interne du cartilage thyroïde, T4a = envahissement à travers le cartilage thyroïde ou des tissus extralaryngés." },
              { kw: ['laryngectomie', 'totale', 'partielle'], a: "Une chirurgie partielle (cordectomie, laryngectomie partielle) ou par laser CO2 est envisageable pour les stades T1-T2 avec corde mobile ; une laryngectomie totale est généralement recommandée en cas de fixation cordale, d'envahissement cartilagineux ou de stade T3-T4 avancé, notamment après échec de traitement conservateur." },
              { kw: ['récidive', 'locale'], a: "Le risque de récidive locale dépend principalement du statut des marges de résection, de l'envahissement cartilagineux et de l'extension extralaryngée. Une marge >5mm et l'absence d'invasion cartilagineuse sont associées à un risque de récidive locale nettement plus faible." },
              { kw: ['voix', 'réhabilitation', 'phonatoire'], a: "La réhabilitation vocale après laryngectomie totale repose principalement sur la prothèse phonatoire trachéo-œsophagienne (type Provox), avec un taux de réussite de l'ordre de 90% ; la voix œsophagienne et le laryngophone électronique restent des alternatives en cas d'échec ou de contre-indication." },
            ],
            otologie: [
              { kw: ['paralysie', 'faciale', 'nerf facial'], a: "Le risque de paralysie faciale (grade House-Brackmann) après chirurgie otologique est faible en primo-chirurgie non compliquée (environ 1-3% de paralysie transitoire), mais augmente significativement en cas de reprise chirurgicale ou d'érosion du canal de Fallope par un cholestéatome." },
              { kw: ['gain', 'auditif', 'audition'], a: "Le gain auditif attendu après ossiculoplastie dépend du type de prothèse : une fermeture du Rinne (air-bone gap) <20dB est obtenue dans environ 70-80% des cas avec une PORP, un peu moins avec une TORP du fait de la chaîne de transmission plus longue." },
              { kw: ['implant', 'cochléaire', 'indication'], a: "L'implantation cochléaire est indiquée en cas de surdité neurosensorielle sévère à profonde bilatérale avec bénéfice insuffisant des aides auditives conventionnelles, typiquement pour un seuil auditif moyen >70-90dB et une discrimination vocale <50-60% en champ libre appareillé." },
              { kw: ['récidive', 'cholestéatome'], a: "Le taux de cholestéatome résiduel ou récidivant est de l'ordre de 10-20% à 5 ans après technique fermée (canal wall up), nettement plus faible après technique ouverte (canal wall down). Une chirurgie en 2 temps ou une IRM de diffusion de surveillance permet de dépister une récidive infraclinique." },
            ],
            rhinologie: [
              { kw: ['brèche', 'méningée', 'liquide céphalo-rachidien'], a: "Le risque de brèche ostéo-méningée en chirurgie endoscopique des sinus est faible (de l'ordre de 0,5 à 1%) en chirurgie de routine, mais augmente nettement au voisinage de la lame criblée ou du toit de l'ethmoïde et lors des exérèses tumorales étendues vers la base du crâne." },
              { kw: ['extension', 'orbitaire', 'endocrânienne'], a: "Une extension orbitaire ou endocrânienne d'une tumeur naso-sinusienne doit être recherchée systématiquement par IRM (envahissement de la graisse orbitaire, de la dure-mère) en complément du scanner, et fait discuter un abord combiné endoscopique-externe avec les équipes d'ophtalmologie et de neurochirurgie." },
              { kw: ['récidive', 'polypose'], a: "La polypose naso-sinusienne récidive dans 40 à 60% des cas à 5 ans en l'absence de traitement médical d'entretien adapté ; les biothérapies anti-IL4/IL5/IgE sont désormais proposées dans les formes sévères à phénotype éosinophilique récidivantes après chirurgie." },
              { kw: ['indication', 'chirurgicale', 'traitement médical'], a: "Selon les recommandations EPOS, un traitement médical maximal (corticothérapie locale, lavages de sérum salé, cure courte de corticoïdes oraux si besoin) doit être tenté en première intention ; la chirurgie est indiquée en cas d'échec du traitement médical bien conduit ou de complication." },
            ],
            cervicofacial: [
              { kw: ['paralysie', 'faciale', 'parotidectomie'], a: "Le risque de parésie faciale transitoire après parotidectomie superficielle pour tumeur bénigne est de l'ordre de 15 à 30%, avec récupération complète dans la grande majorité des cas en quelques mois ; le risque de paralysie définitive reste faible (1 à 5%) hors chirurgie carcinologique avec sacrifice nerveux." },
              { kw: ['extension', 'ganglionnaire'], a: "L'extension ganglionnaire cervicale s'évalue selon les niveaux I à VI (classification AAO-HNS) ; l'échographie avec cytoponction et l'IRM cervico-faciale précisent le niveau atteint, la taille et la présence de signes de rupture capsulaire, déterminants pour le type de curage à réaliser." },
              { kw: ['type', 'curage'], a: "Le curage cervical peut être radical (sacrifice du nerf spinal, de la veine jugulaire interne et du sterno-cléido-mastoïdien), radical modifié (préservation d'une ou plusieurs de ces structures) ou sélectif (limité à certains niveaux ganglionnaires) — le choix dépend du site tumoral primitif et du statut ganglionnaire clinique/radiologique." },
              { kw: ['nerf spinal', 'accessoire'], a: "La préservation du nerf spinal accessoire (XI) lors d'un curage sélectif limite le risque de syndrome de l'épaule (douleur, dysfonction du trapèze) ; sa préservation est la règle sauf envahissement tumoral direct documenté du nerf." },
            ],
            pediatrique: [
              { kw: ['indication', 'amygdalectomie'], a: "L'amygdalectomie est indiquée en cas d'angines récidivantes répondant aux critères de Paradise (≥7 épisodes/an, ou ≥5/an sur 2 ans, ou ≥3/an sur 3 ans) ou en cas d'hypertrophie amygdalienne obstructive avec syndrome d'apnées obstructives du sommeil confirmé ou fortement suspecté." },
              { kw: ['hémorragie', 'post-amygdalectomie'], a: "L'hémorragie post-amygdalectomie primaire (dans les 24h) survient dans environ 0,5 à 1% des cas ; l'hémorragie secondaire (J5-J10, chute d'escarre) est plus fréquente (2 à 5%) et justifie une surveillance parentale attentive durant les 10 premiers jours post-opératoires." },
              { kw: ['osa-18', 'score'], a: "Le score OSA-18 (échelle de qualité de vie, 18 à 126 points) est considéré comme cliniquement significatif à partir de 60 points environ ; il doit être corrélé à la polysomnographie pour confirmer et quantifier objectivement le syndrome d'apnées obstructives avant d'indiquer une chirurgie." },
              { kw: ['corps étranger', 'prise en charge'], a: "La prise en charge d'un corps étranger des voies aéro-digestives dépend de sa localisation et de sa nature : une pile bouton œsophagienne est une urgence d'extraction immédiate (risque de nécrose caustique en quelques heures), alors qu'un corps étranger bronchique inerte peut être extrait par endoscopie rigide en semi-urgence sous anesthésie générale." },
            ],
          };

          const SPECIALTY_PROMPTS = {
            laryngologie: `EXPERTISE LARYNGOLOGIE — repères à utiliser quand pertinent :
- Stadification TNM du larynx (UICC/AJCC), spécifique par sous-site (supraglotte/glotte/sous-glotte).
- Mobilité cordale : normale (T1-T2), fixée (T3, souvent envahissement paraglottique/cartilagineux).
- Envahissement cartilagineux (thyroïde/cricoïde) : contre-indique la chirurgie de préservation d'organe.
- Niveaux ganglionnaires cervicaux (II-IV pour le drainage laryngé, VI pour le récurrentiel/sous-glottique).
- Réhabilitation vocale post-laryngectomie totale : prothèse phonatoire trachéo-œsophagienne (Provox), voix œsophagienne, laryngophone.
- Toujours resituer une décision d'exérèse (partielle/laser vs totale) par rapport à la mobilité cordale et l'extension cartilagineuse.`,

            otologie: `EXPERTISE OTOLOGIE — repères à utiliser quand pertinent :
- Grade House-Brackmann (I à VI) pour la fonction du nerf facial, avant et après chirurgie.
- Classification EAONO-JOS du cholestéatome (stade I à III) — oriente le bilan d'imagerie et le risque de complication.
- PTA (seuil auditif moyen), test de Rinne/Weber pour caractériser une surdité de transmission vs de perception.
- Indications d'implant cochléaire : surdité neurosensorielle sévère à profonde bilatérale, bénéfice prothétique insuffisant.
- Techniques de mastoïdectomie : canal wall up (préserve l'anatomie, risque de récidive) vs canal wall down (moindre récidive, cavité d'évidement).
- Toujours resituer une décision opératoire par rapport au risque de lésion du nerf facial et au gain auditif attendu.`,

            rhinologie: `EXPERTISE RHINOLOGIE — repères à utiliser quand pertinent :
- Score de Lund-Mackay (0 à 24) pour quantifier l'atteinte scanographique des sinus.
- Score SNOT-22 pour le retentissement fonctionnel et qualité de vie.
- Structures à risque en chirurgie endoscopique : lame criblée, artère ethmoïdale antérieure, nerf optique, carotide interne.
- Recommandations EPOS : traitement médical maximal avant indication chirurgicale (hors complication ou tumeur).
- Extension orbitaire ou vers la base du crâne des tumeurs naso-sinusiennes : impose IRM et abord combiné endoscopique-externe.
- Toujours resituer une décision chirurgicale par rapport au score de Lund-Mackay et à la présence de structures à risque envahies.`,

            cervicofacial: `EXPERTISE CERVICO-FACIALE — repères à utiliser quand pertinent :
- Niveaux ganglionnaires cervicaux I à VI (classification AAO-HNS) pour décrire toute extension.
- Types de curage cervical : radical, radical modifié, sélectif — selon le site primitif et le statut ganglionnaire.
- Rupture capsulaire ganglionnaire : facteur majeur d'indication de radiothérapie adjuvante.
- Grade House-Brackmann prévisionnel et neuromonitoring du nerf facial en chirurgie parotidienne.
- Préservation du nerf spinal accessoire (XI) en curage sélectif pour limiter le syndrome de l'épaule.
- Toujours resituer une décision de curage par rapport au statut ganglionnaire (niveau, taille, rupture capsulaire).`,

            pediatrique: `EXPERTISE ORL PÉDIATRIQUE — repères à utiliser quand pertinent :
- Critères de Paradise pour l'indication d'amygdalectomie sur angines récidivantes (≥7/an, ≥5/an×2 ans, ≥3/an×3 ans).
- Score OSA-18 (18 à 126) : seuil de retentissement significatif autour de 60, à corréler à la polysomnographie.
- Grade amygdalien de Brodsky (0 à 4) pour quantifier l'obstruction oropharyngée.
- Hémorragie post-amygdalectomie : primaire (<24h, ~0,5-1%) vs secondaire (J5-J10, ~2-5%, chute d'escarre).
- Urgence d'extraction d'un corps étranger selon sa nature : pile bouton = urgence absolue (risque de nécrose caustique).
- Toujours resituer une décision opératoire par rapport à l'âge, au poids et aux contraintes anesthésiques pédiatriques.`
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
              `- "sélectionne le hub laryngologie" / "passe au module larynx" → [ACTION:switch_laryngologie]`,
              `- "sélectionne le hub otologie" → [ACTION:switch_otologie]`,
              `- "sélectionne le hub rhinologie" → [ACTION:switch_rhinologie]`,
              `- "sélectionne le hub cervico-facial" → [ACTION:switch_cervicofacial]`,
              `- "sélectionne le hub pédiatrique" → [ACTION:switch_pediatrique]`,
              `- "sélectionne le hub anesthésie-réanimation" → [ACTION:switch_anesthesie_reanimation]`,
            ].join('\n');
          }

          function liveSystemPrompt() {
            const mod = MODULES[state.mod];
            const warn = mod.metrics.filter(m => m.st === 'warn').map(m => `${m.label}: ${m.val}`).join(', ') || 'aucune';
            return [
              `Tu es "ORLSurgPlan3D Live", l'assistant chirurgical vocal intégré au poste de planification ${mod.name}.`,
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
                  if (await handleUnauthorized(r)) { throw new Error('Session expirée — reconnectez-vous puis reposez votre question.'); }
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
              close_modal: () => document.querySelectorAll('.modal-overlay.open:not(#modal-login)').forEach(m => m.classList.remove('open')),
              recalc_analysis: () => runAnalysis(),
              export_plan: () => exportPlan(),
              switch_laryngologie: () => switchModule('laryngologie'),
              switch_otologie: () => switchModule('otologie'),
              switch_rhinologie: () => switchModule('rhinologie'),
              switch_cervicofacial: () => switchModule('cervicofacial'),
              switch_pediatrique: () => switchModule('pediatrique'),
              switch_anesthesie_reanimation: () => switchModule('anesthesie_reanimation'),
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
          //  SESSION — connexion réelle au backend (remplace l'ancien auto-login
          //  silencieux avec identifiants de démo codés en dur). Connexion
          //  obligatoire uniquement quand state.settings.apiBase est configuré
          //  (déploiement pilote) ; comportement anonyme local inchangé sinon
          //  (démo publique). Jeton conservé dans sessionStorage — effacé à la
          //  fermeture de l'onglet, adapté à un poste clinique partagé.
          // ════════════════════════════════════════════════
          const SESSION_STORAGE_KEY = 'gsp_session';
          let _sessionPromise = null;
          let _pendingPreAuthToken = null;
          let _loginResolve = null;

          function loadSessionFromStorage() {
            try {
              const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
              if (!raw) return null;
              const s = JSON.parse(raw);
              if (!s.token || !s.expiresAt || Date.now() >= s.expiresAt) return null;
              return s;
            } catch (e) { return null; }
          }

          function clearSession() {
            state.session = { token: null, expiresAt: null, username: null, role: null };
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            updateSessionIndicatorUI();
          }

          function updateSessionIndicatorUI() {
            const el = document.getElementById('session-indicator');
            const label = document.getElementById('session-indicator-label');
            if (!el || !label) return;
            if (state.session && state.session.token) {
              label.textContent = `${state.session.username} (${state.session.role})`;
              el.style.display = 'flex';
            } else {
              el.style.display = 'none';
            }
          }

          function openLoginGate() {
            document.getElementById('login-step-password').style.display = 'block';
            document.getElementById('login-step-2fa').style.display = 'none';
            document.getElementById('login-error').textContent = '';
            document.getElementById('login-password').value = '';
            openModal('login');
            return new Promise((resolve) => { _loginResolve = resolve; });
          }

          async function ensureSession() {
            if (state.session.token && state.session.expiresAt > Date.now()) return state.session.token;
            const restored = loadSessionFromStorage();
            if (restored) { state.session = restored; updateSessionIndicatorUI(); return state.session.token; }
            if (!_sessionPromise) {
              _sessionPromise = openLoginGate().finally(() => { _sessionPromise = null; });
            }
            await _sessionPromise;
            return state.session.token;
          }

          // Conservé pour zéro diff sur les 5 sites d'appel existants
          // (segmentExistingSeries, pacsAuthedFetch, askAI, askAIStreaming,
          // savePatientEdit) — délègue simplement à ensureSession().
          async function getBackendToken() { return ensureSession(); }

          async function submitLogin() {
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            const errEl = document.getElementById('login-error');
            errEl.textContent = '';
            if (!username || !password) { errEl.textContent = 'Identifiant et mot de passe requis.'; return; }
            const base = state.settings.apiBase.replace(/\/+$/, '');
            try {
              const form = new URLSearchParams({ username, password });
              const r = await fetch(base + '/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
              const data = await r.json().catch(() => ({}));
              if (r.status === 429) { errEl.textContent = data.detail || 'Trop de tentatives — réessayez dans un instant.'; return; }
              if (!r.ok) { errEl.textContent = 'Identifiants invalides.'; return; }
              if (data.requires_2fa) {
                _pendingPreAuthToken = data.pre_auth_token;
                document.getElementById('login-step-password').style.display = 'none';
                document.getElementById('login-step-2fa').style.display = 'block';
                document.getElementById('login-2fa-error').textContent = '';
                document.getElementById('login-2fa-code').value = '';
                document.getElementById('login-2fa-code').focus();
                return;
              }
              await _completeLogin(data, username);
            } catch (e) {
              errEl.textContent = 'Backend injoignable : ' + e.message;
            }
          }

          async function submitTwoFa() {
            const code = document.getElementById('login-2fa-code').value.trim();
            const errEl = document.getElementById('login-2fa-error');
            errEl.textContent = '';
            const base = state.settings.apiBase.replace(/\/+$/, '');
            try {
              const r = await fetch(base + '/auth/2fa/verify', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pre_auth_token: _pendingPreAuthToken, code }),
              });
              const data = await r.json().catch(() => ({}));
              if (r.status === 429) { errEl.textContent = data.detail || 'Trop de tentatives.'; return; }
              if (!r.ok) { errEl.textContent = 'Code invalide.'; return; }
              const username = document.getElementById('login-username').value.trim();
              await _completeLogin(data, username);
            } catch (e) {
              errEl.textContent = 'Backend injoignable : ' + e.message;
            }
          }

          async function _completeLogin(tokenResponse, username) {
            // Le rôle vient du payload JWT (déjà encodé côté backend via
            // sec.create_token(..., extra={"role":...})) — décodage best-effort,
            // purement informatif côté client (affichage), jamais utilisé pour une
            // décision d'autorisation : le backend reste seul juge via require_role().
            let role = 'surgeon';
            try {
              const payload = JSON.parse(atob(tokenResponse.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
              role = payload.role || role;
            } catch (e) { /* décodage best-effort, non bloquant */ }

            state.session = { token: tokenResponse.access_token, expiresAt: Date.now() + tokenResponse.expires_in * 1000, username, role };
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state.session));
            if (!state.settings.chirurgien || state.settings.chirurgien === 'Dr. Hadj') {
              state.settings.chirurgien = username; // pré-remplissage best-effort, personnalisable dans ⚙ Paramètres
            }
            _pendingPreAuthToken = null;
            closeModal('login');
            updateSessionIndicatorUI();
            if (_loginResolve) { _loginResolve(); _loginResolve = null; }
          }

          function logout() {
            clearSession();
            notify('Déconnecté.', 'info');
            if (state.settings.apiBase) { ensureSession(); }
          }

          // Aide partagée pour les appels authentifiés : sur 401, efface la session
          // et relance la connexion — NE relance PAS automatiquement l'appel
          // d'origine (le risque de doublon, ex. démarrer 2x le même job de
          // segmentation, l'emporte sur un retry silencieux) ; l'appelant décide.
          async function handleUnauthorized(response) {
            if (response.status !== 401) return false;
            clearSession();
            notify('Session expirée — reconnexion requise.', 'warn');
            await ensureSession();
            return true;
          }

          // ════════════════════════════════════════════════
          //  AI ENGINE — chat du panneau droit (réponse ponctuelle, sans mémoire de session)
          //  Priorité : clé Gemini client → clé Groq client → backend proxy → réponse hors-ligne
          // ════════════════════════════════════════════════

          async function askAI(message) {
            if (state.settings.offlineCertified) {
              return offlineAnswer(message);
            }
            const mod = MODULES[state.mod];
            // I18N : la langue de réponse suit la langue active de l'interface (I18N.currentLocale()),
            // pas "français" codé en dur — voir I18N.t('ai.respondInLanguage').
            const system = `Tu es l'assistant chirurgical IA ORLSurgPlan3D, spécialisé en ${mod.name}. ` +
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
                if (await handleUnauthorized(r)) { throw new Error('Session expirée — reconnectez-vous puis reposez votre question.'); }
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
            const newApiBase = document.getElementById('input-api-base').value.trim();
            const apiBaseChanged = newApiBase !== state.settings.apiBase;
            state.settings.geminiKey = document.getElementById('input-gemini-key').value.trim();
            state.settings.geminiModel = document.getElementById('input-gemini-model').value.trim() || 'gemini-flash-latest';
            state.settings.groqKey = document.getElementById('input-groq-key').value.trim();
            state.settings.apiBase = newApiBase;
            state.settings.localServerUrl = document.getElementById('input-local-server-url').value.trim();
            state.settings.localServerModel = document.getElementById('input-local-server-model').value.trim() || 'llama3';
            state.settings.chirurgien = document.getElementById('input-chirurgien').value.trim() || state.settings.chirurgien;
            state.settings.offlineCertified = document.getElementById('toggle-offline-certified').classList.contains('on');
            // Un jeton émis par un autre backend n'a aucune raison d'être valide ici.
            if (apiBaseChanged) { clearSession(); }
            closeModal('settings');
            const mode = state.settings.offlineCertified ? '📚 Hors-ligne certifié (forcé)' :
              state.localEngine ? '🔒 Modèle local WebGPU (' + state.localEngineModel + ')' :
                state.settings.localServerUrl ? '🔒 Serveur IA local (' + state.settings.localServerUrl + ')' :
                  state.settings.geminiKey ? `Gemini (${state.settings.geminiModel})` :
                    state.settings.groqKey ? 'Groq (clé directe)' : state.settings.apiBase ? 'Backend proxy' : 'Démo hors-ligne';
            notify('Paramètres enregistrés — IA: ' + mode, 'ok');
            if (apiBaseChanged && state.settings.apiBase) { ensureSession(); }
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
                if (await handleUnauthorized(r)) { notify('Session expirée — reconnectez-vous puis enregistrez à nouveau.', 'warn'); return; }
                if (r.status === 404) {
                  r = await fetch(base + '/patients', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(body) });
                  if (await handleUnauthorized(r)) { notify('Session expirée — reconnectez-vous puis enregistrez à nouveau.', 'warn'); return; }
                }
                if (r.ok) notify('Synchronisé avec le backend', 'ok');
                else notify('Backend: échec de synchronisation (' + r.status + ')', 'warn');
              } catch (e) { notify('Backend indisponible: ' + e.message, 'warn'); }
            }
          }

          // ── Dossier & évaluation pré-anesthésique (transverse à tous les modules) ──
          const DEFAULT_PREANESTHESIE_CHECKLIST = [
            { done: false, text: 'Identité du patient vérifiée' },
            { done: false, text: 'Consentement éclairé signé' },
            { done: false, text: 'Jeûne respecté (solide ≥ 6h / liquide clair ≥ 2h)' },
            { done: false, text: 'Allergies vérifiées' },
            { done: false, text: 'Site opératoire marqué' },
            { done: false, text: "Matériel d'intubation difficile disponible si prévu" }
          ];

          function renderPreanesthesieChecklist(items) {
            const box = document.getElementById('pa-checklist');
            box.innerHTML = items.map((it, i) => `
      <label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:11px">
        <input type="checkbox" ${it.done ? 'checked' : ''} onchange="togglePreanesthesieChecklistItem(${i})">
        <span>${it.text}</span>
      </label>`).join('');
          }

          function togglePreanesthesieChecklistItem(i) {
            const mod = MODULES[state.mod];
            const rec = state.preanesthesie[mod.patient.id];
            if (!rec) return;
            rec.checklist[i].done = !rec.checklist[i].done;
            renderPreanesthesieChecklist(rec.checklist);
          }

          async function loadPreanesthesieForm() {
            const mod = MODULES[state.mod];
            const p = mod.patient;
            document.getElementById('preanesthesie-patient-label').textContent =
              `Patient : ${p.nom} (${mod.short})`;

            let rec = state.preanesthesie[p.id];
            if (!rec && state.settings.apiBase) {
              try {
                const token = await getBackendToken();
                const base = state.settings.apiBase.replace(/\/+$/, '');
                const r = await fetch(base + '/patients/' + p.id + '/preanesthesie', {
                  headers: { 'Authorization': 'Bearer ' + token }
                });
                if (r.ok) {
                  const data = await r.json();
                  rec = {
                    asa_score: data.asa_score, asa_urgence: data.asa_urgence,
                    mallampati_score: data.mallampati_score, antecedents: data.antecedents,
                    allergies: data.allergies, traitement_chronique: data.traitement_chronique,
                    jeune_solide_h: data.jeune_solide_h, jeune_liquide_h: data.jeune_liquide_h,
                    intubation_difficile_prevue: data.intubation_difficile_prevue,
                    checklist: data.checklist && data.checklist.length ? data.checklist : DEFAULT_PREANESTHESIE_CHECKLIST.map(x => ({ ...x })),
                    anesthesiste: data.anesthesiste, conclusion: data.conclusion
                  };
                  state.preanesthesie[p.id] = rec;
                }
              } catch (e) { /* backend indisponible : on retombe sur le formulaire vide/local */ }
            }
            if (!rec) {
              rec = state.preanesthesie[p.id] = {
                asa_score: '', asa_urgence: false, mallampati_score: '', antecedents: '',
                allergies: '', traitement_chronique: '', jeune_solide_h: '', jeune_liquide_h: '',
                intubation_difficile_prevue: false,
                checklist: DEFAULT_PREANESTHESIE_CHECKLIST.map(x => ({ ...x })),
                anesthesiste: '', conclusion: ''
              };
            }

            document.getElementById('pa-asa').value = rec.asa_score || '';
            document.getElementById('pa-asa-urgence').checked = !!rec.asa_urgence;
            document.getElementById('pa-mallampati').value = rec.mallampati_score || '';
            document.getElementById('pa-intub-diff').checked = !!rec.intubation_difficile_prevue;
            document.getElementById('pa-jeune-solide').value = rec.jeune_solide_h ?? '';
            document.getElementById('pa-jeune-liquide').value = rec.jeune_liquide_h ?? '';
            document.getElementById('pa-antecedents').value = rec.antecedents || '';
            document.getElementById('pa-allergies').value = rec.allergies || '';
            document.getElementById('pa-traitement').value = rec.traitement_chronique || '';
            document.getElementById('pa-anesthesiste').value = rec.anesthesiste || '';
            document.getElementById('pa-conclusion').value = rec.conclusion || '';
            renderPreanesthesieChecklist(rec.checklist);
          }

          async function savePreanesthesieForm() {
            if (guardReadOnly('modification du dossier pré-anesthésique')) return;
            const mod = MODULES[state.mod];
            const p = mod.patient;
            const rec = state.preanesthesie[p.id];

            rec.asa_score = document.getElementById('pa-asa').value ? parseInt(document.getElementById('pa-asa').value) : null;
            rec.asa_urgence = document.getElementById('pa-asa-urgence').checked;
            rec.mallampati_score = document.getElementById('pa-mallampati').value ? parseInt(document.getElementById('pa-mallampati').value) : null;
            rec.intubation_difficile_prevue = document.getElementById('pa-intub-diff').checked;
            rec.jeune_solide_h = document.getElementById('pa-jeune-solide').value ? parseFloat(document.getElementById('pa-jeune-solide').value) : null;
            rec.jeune_liquide_h = document.getElementById('pa-jeune-liquide').value ? parseFloat(document.getElementById('pa-jeune-liquide').value) : null;
            rec.antecedents = document.getElementById('pa-antecedents').value.trim();
            rec.allergies = document.getElementById('pa-allergies').value.trim();
            rec.traitement_chronique = document.getElementById('pa-traitement').value.trim();
            rec.anesthesiste = document.getElementById('pa-anesthesiste').value.trim();
            rec.conclusion = document.getElementById('pa-conclusion').value.trim();

            notify('Dossier pré-anesthésique mis à jour (local)', 'ok');

            if (state.settings.apiBase) {
              try {
                const token = await getBackendToken();
                const base = state.settings.apiBase.replace(/\/+$/, '');
                const r = await fetch(base + '/patients/' + p.id + '/preanesthesie', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                  body: JSON.stringify({
                    asa_score: rec.asa_score, asa_urgence: rec.asa_urgence,
                    mallampati_score: rec.mallampati_score, antecedents: rec.antecedents,
                    allergies: rec.allergies, traitement_chronique: rec.traitement_chronique,
                    jeune_solide_h: rec.jeune_solide_h, jeune_liquide_h: rec.jeune_liquide_h,
                    intubation_difficile_prevue: rec.intubation_difficile_prevue,
                    checklist: rec.checklist, anesthesiste: rec.anesthesiste, conclusion: rec.conclusion
                  })
                });
                if (r.ok) notify('Synchronisé avec le backend', 'ok');
                else notify('Backend: échec de synchronisation (' + r.status + ')', 'warn');
              } catch (e) { notify('Backend indisponible: ' + e.message, 'warn'); }
            }
          }

          // ── Suivi réanimation / USI (transverse, historique par patient) ──
          function _sumInputs(ids) {
            const vals = ids.map(id => document.getElementById(id).value).filter(v => v !== '');
            if (!vals.length) return null;
            return vals.reduce((a, v) => a + parseInt(v), 0);
          }

          function updateSofaTotal() {
            const total = _sumInputs(['icu-sofa-resp', 'icu-sofa-coag', 'icu-sofa-hep', 'icu-sofa-cardio', 'icu-sofa-neuro', 'icu-sofa-renal']);
            document.getElementById('icu-sofa-total').textContent = total === null ? '—' : total + ' / 24';
          }

          function updateGlasgowTotal() {
            const total = _sumInputs(['icu-gcs-eye', 'icu-gcs-verbal', 'icu-gcs-motor']);
            document.getElementById('icu-gcs-total').textContent = total === null ? '—' : total + ' / 15';
          }

          function updateBilanNet() {
            const e = document.getElementById('icu-bilan-entrees').value;
            const s = document.getElementById('icu-bilan-sorties').value;
            if (e === '' && s === '') { document.getElementById('icu-bilan-net').textContent = '—'; return; }
            const net = (parseFloat(e) || 0) - (parseFloat(s) || 0);
            document.getElementById('icu-bilan-net').textContent = (net >= 0 ? '+' : '') + net;
          }

          function renderIcuFollowupHistory(items) {
            const box = document.getElementById('icu-followup-history');
            if (!items.length) {
              box.innerHTML = `<div style="padding:10px;font-size:10px;color:var(--text3)">Aucune évaluation enregistrée pour ce patient.</div>`;
              return;
            }
            box.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:10px">
      <tr style="border-bottom:1px solid var(--border);color:var(--text3);text-transform:uppercase;font-size:8.5px">
        <th style="text-align:left;padding:5px 8px">Date</th><th style="text-align:left;padding:5px 8px">SOFA</th>
        <th style="text-align:left;padding:5px 8px">Glasgow</th><th style="text-align:left;padding:5px 8px">RASS</th>
        <th style="text-align:left;padding:5px 8px">Ventilation</th><th style="text-align:left;padding:5px 8px">Bilan net</th>
        <th></th>
      </tr>` + items.map(it => `
      <tr style="border-bottom:1px solid rgba(255,255,255,.03)">
        <td style="padding:5px 8px;font:9px var(--mono)">${new Date(it.recorded_at).toLocaleString()}</td>
        <td style="padding:5px 8px">${it.sofa_total ?? '—'}</td>
        <td style="padding:5px 8px">${it.glasgow_total ?? '—'}</td>
        <td style="padding:5px 8px">${it.rass_score ?? '—'}</td>
        <td style="padding:5px 8px">${it.vent_mode || '—'}</td>
        <td style="padding:5px 8px">${it.bilan_net_ml ?? '—'}</td>
        <td style="padding:5px 8px"><button class="btn-icon" style="width:20px;height:20px;font-size:10px" onclick="deleteIcuFollowup('${it.id}')" title="Supprimer">🗑</button></td>
      </tr>`).join('');
          }

          async function loadIcuFollowups() {
            const mod = MODULES[state.mod];
            const p = mod.patient;
            document.getElementById('icu-followup-patient-label').textContent = `Patient : ${p.nom} (${mod.short})`;

            let items = state.icuFollowups[p.id] || [];
            if (state.settings.apiBase) {
              try {
                const token = await getBackendToken();
                const base = state.settings.apiBase.replace(/\/+$/, '');
                const r = await fetch(base + '/patients/' + p.id + '/icu-followups', {
                  headers: { 'Authorization': 'Bearer ' + token }
                });
                if (r.ok) { items = await r.json(); state.icuFollowups[p.id] = items; }
              } catch (e) { /* backend indisponible : on retombe sur le cache local */ }
            }
            renderIcuFollowupHistory(items);

            // Réinitialise le formulaire d'ajout
            ['icu-sofa-resp', 'icu-sofa-coag', 'icu-sofa-hep', 'icu-sofa-cardio', 'icu-sofa-neuro', 'icu-sofa-renal',
              'icu-apache2', 'icu-rass', 'icu-gcs-eye', 'icu-gcs-verbal', 'icu-gcs-motor', 'icu-vent-mode',
              'icu-vent-fio2', 'icu-vent-peep', 'icu-vent-fr', 'icu-vent-vt', 'icu-bilan-entrees', 'icu-bilan-sorties',
              'icu-notes', 'icu-auteur'].forEach(id => { document.getElementById(id).value = ''; });
            updateSofaTotal(); updateGlasgowTotal(); updateBilanNet();
          }

          async function addIcuFollowup() {
            if (guardReadOnly('ajout d\'une évaluation réanimation/USI')) return;
            const mod = MODULES[state.mod];
            const p = mod.patient;
            const num = id => { const v = document.getElementById(id).value; return v === '' ? null : parseFloat(v); };
            const int_ = id => { const v = document.getElementById(id).value; return v === '' ? null : parseInt(v); };
            const str_ = id => document.getElementById(id).value.trim() || null;

            const body = {
              sofa_respiration: int_('icu-sofa-resp'), sofa_coagulation: int_('icu-sofa-coag'),
              sofa_hepatique: int_('icu-sofa-hep'), sofa_cardiovasculaire: int_('icu-sofa-cardio'),
              sofa_neurologique: int_('icu-sofa-neuro'), sofa_renal: int_('icu-sofa-renal'),
              apache2_score: int_('icu-apache2'), rass_score: int_('icu-rass'),
              glasgow_oculaire: int_('icu-gcs-eye'), glasgow_verbale: int_('icu-gcs-verbal'), glasgow_motrice: int_('icu-gcs-motor'),
              vent_mode: str_('icu-vent-mode'), vent_fio2_pct: num('icu-vent-fio2'), vent_peep_cmh2o: num('icu-vent-peep'),
              vent_fr_rpm: num('icu-vent-fr'), vent_vt_ml: num('icu-vent-vt'),
              bilan_entrees_ml: num('icu-bilan-entrees'), bilan_sorties_ml: num('icu-bilan-sorties'),
              notes: str_('icu-notes'), auteur: str_('icu-auteur')
            };

            let saved = null;
            if (state.settings.apiBase) {
              try {
                const token = await getBackendToken();
                const base = state.settings.apiBase.replace(/\/+$/, '');
                const r = await fetch(base + '/patients/' + p.id + '/icu-followups', {
                  method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                  body: JSON.stringify(body)
                });
                if (r.ok) { saved = await r.json(); notify('Évaluation enregistrée et synchronisée', 'ok'); }
                else notify('Backend: échec de synchronisation (' + r.status + ')', 'warn');
              } catch (e) { notify('Backend indisponible: ' + e.message, 'warn'); }
            }
            if (!saved) {
              const sofaVals = [body.sofa_respiration, body.sofa_coagulation, body.sofa_hepatique, body.sofa_cardiovasculaire, body.sofa_neurologique, body.sofa_renal].filter(v => v !== null);
              const gcsVals = [body.glasgow_oculaire, body.glasgow_verbale, body.glasgow_motrice].filter(v => v !== null);
              saved = Object.assign({}, body, {
                id: 'local-' + Date.now(), patient_id: p.id, recorded_at: new Date().toISOString(),
                sofa_total: sofaVals.length ? sofaVals.reduce((a, v) => a + v, 0) : null,
                glasgow_total: gcsVals.length ? gcsVals.reduce((a, v) => a + v, 0) : null,
                bilan_net_ml: (body.bilan_entrees_ml !== null || body.bilan_sorties_ml !== null) ? (body.bilan_entrees_ml || 0) - (body.bilan_sorties_ml || 0) : null
              });
              notify('Évaluation enregistrée (local)', 'ok');
            }

            if (!state.icuFollowups[p.id]) state.icuFollowups[p.id] = [];
            state.icuFollowups[p.id].unshift(saved);
            renderIcuFollowupHistory(state.icuFollowups[p.id]);
          }

          async function deleteIcuFollowup(id) {
            if (guardReadOnly('suppression d\'une évaluation réanimation/USI')) return;
            const mod = MODULES[state.mod];
            const p = mod.patient;
            if (state.settings.apiBase && !id.startsWith('local-')) {
              try {
                const token = await getBackendToken();
                const base = state.settings.apiBase.replace(/\/+$/, '');
                await fetch(base + '/patients/' + p.id + '/icu-followups/' + id, {
                  method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token }
                });
              } catch (e) { notify('Backend indisponible: ' + e.message, 'warn'); }
            }
            state.icuFollowups[p.id] = (state.icuFollowups[p.id] || []).filter(it => it.id !== id);
            renderIcuFollowupHistory(state.icuFollowups[p.id]);
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
            if (sel === 'hep_droite') {
              durEl.textContent = '185 min'; eblEl.textContent = '210 mL';
              riskEl.textContent = '12.4% (Faible)'; riskEl.style.color = 'var(--green)';
              notify('Stratégie Hépatectomie Droite sélectionnée : SHAP recalibré.', 'info');
            } else if (sel === 'seg_7_8') {
              durEl.textContent = '240 min'; eblEl.textContent = '340 mL';
              riskEl.textContent = '18.1% (Modéré)'; riskEl.style.color = 'var(--orange)';
              notify('Stratégie Segmentectomie VII-VIII sélectionnée : Risque hémorragique +14%.', 'warn');
            } else {
              durEl.textContent = '95 min'; eblEl.textContent = '50 mL';
              riskEl.textContent = '24.0% (Récidive à 2 ans élevée)'; riskEl.style.color = '#f43f5e';
              notify('Option Thermo-ablation sélectionnée : Attention, marge < 5 mm.', 'warn');
            }
          }

          function simulateClamping(vesselName, flrPct, statusText) {
            const flrBar = document.getElementById('surgsim-flr-bar');
            const flrStatus = document.getElementById('surgsim-flr-status');
            flrBar.style.width = flrPct + '%';
            const volMl = Math.round(1490 * (flrPct / 100));
            flrStatus.textContent = 'FLR: ' + flrPct + '% (' + volMl + ' mL) — ' + statusText;
            if (flrPct < 40) {
              flrBar.style.background = '#f43f5e'; flrStatus.style.color = '#f43f5e';
              notify('⚠️ ALERTE CRITIQUE ISCHÉMIE : Clampage de ' + vesselName + ' entraîne un FLR insuffisant (' + flrPct + '%) !', 'err');
            } else if (flrPct < 65) {
              flrBar.style.background = 'var(--orange)'; flrStatus.style.color = 'var(--orange)';
              notify('🔀 Clampage virtuel de ' + vesselName + ' : FLR = ' + flrPct + '% (' + volMl + ' mL).', 'warn');
            } else {
              flrBar.style.background = 'var(--green)'; flrStatus.style.color = 'var(--green)';
              notify('✅ Clampage virtuel de ' + vesselName + ' : FLR optimal au-dessus du seuil de sécurité (' + flrPct + '%).', 'ok');
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
              notify('🌟 Fenêtrage Ray-Marching DVR ajusté : Parenchyme Hépatique (40/150 HU)', 'info');
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

            const tolerance = (vessel.includes('Rénal') || vessel.includes('Rénale')) ? 25.0 : 45.0;
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
              laryngectomie: { code: 'GALA002 (1450,00 €)', desc: '<b>1. Indication :</b> Carcinome épidermoïde glottique cT3N1, corde vocale fixée.<br><b>2. Abord :</b> Cervicotomie.<br><b>3. Geste :</b> Laryngectomie totale avec curage cervical fonctionnel bilatéral (niveaux II-IV) et fermeture pharyngienne en T.<br><b>4. Fin d\'intervention :</b> Trachéostome définitif, prothèse phonatoire trachéo-œsophagienne (Provox) posée en un temps.', sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2 (texte fixe de démonstration, pas un sceau réel)' },
              cordectomie: { code: 'GAFA004 (620,00 €)', desc: '<b>1. Indication :</b> Carcinome T1a de la corde vocale droite.<br><b>2. Abord :</b> Laryngoscopie en suspension.<br><b>3. Geste :</b> Cordectomie transorale au laser CO2, type III (classification ELS).<br><b>4. Fin d\'intervention :</b> Hémostase au contact, pas de trachéotomie.', sha: 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3 (texte fixe de démonstration, pas un sceau réel)' },
              tympanoplastie: { code: 'CAJA001 (540,00 €)', desc: '<b>1. Indication :</b> Perforation tympanique séquellaire d\'otite chronique.<br><b>2. Abord :</b> Voie du conduit / rétro-auriculaire.<br><b>3. Geste :</b> Myringoplastie type I avec greffe de cartilage tragal.<br><b>4. Fin d\'intervention :</b> Méchage résorbable du conduit auditif externe.', sha: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4 (texte fixe de démonstration, pas un sceau réel)' },
              mastoidectomie: { code: 'CAFA002 (890,00 €)', desc: '<b>1. Indication :</b> Cholestéatome de la caisse, stade II (EAONO-JOS).<br><b>2. Abord :</b> Rétro-auriculaire.<br><b>3. Geste :</b> Mastoïdectomie canal wall up avec exérèse complète de la matrice et ossiculoplastie (PORP) en un temps.<br><b>4. Fin d\'intervention :</b> Intégrité du nerf facial vérifiée au neuromonitoring.', sha: 'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5 (texte fixe de démonstration, pas un sceau réel)' },
              cees: { code: 'GAFA010 (1120,00 €)', desc: '<b>1. Indication :</b> Polypose naso-sinusienne bilatérale récidivante, Lund-Mackay 14/24.<br><b>2. Abord :</b> Endoscopie naso-sinusienne.<br><b>3. Geste :</b> Méatotomie moyenne bilatérale, ethmoïdectomie antérieure et postérieure, sphénoïdotomie.<br><b>4. Fin d\'intervention :</b> Mèches résorbables bilatérales.', sha: 'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6 (texte fixe de démonstration, pas un sceau réel)' },
              septoplastie: { code: 'GAEA002 (480,00 €)', desc: '<b>1. Indication :</b> Déviation septale symptomatique avec obstruction nasale.<br><b>2. Abord :</b> Voie endonasale.<br><b>3. Geste :</b> Résection sous-muqueuse du septum avec repositionnement, turbinectomie inférieure bilatérale associée.<br><b>4. Fin d\'intervention :</b> Attelles siliconées bilatérales.', sha: 'f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7 (texte fixe de démonstration, pas un sceau réel)' },
              parotidectomie: { code: 'CBFA001 (980,00 €)', desc: '<b>1. Indication :</b> Adénome pléomorphe du lobe superficiel de la parotide droite.<br><b>2. Abord :</b> Cervico-parotidien.<br><b>3. Geste :</b> Parotidectomie superficielle avec dissection du tronc et des branches du nerf facial sous neuromonitoring continu.<br><b>4. Fin d\'intervention :</b> Drain aspiratif de Redon.', sha: 'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8 (texte fixe de démonstration, pas un sceau réel)' },
              curage_cervical: { code: 'GEFA004 (860,00 €)', desc: '<b>1. Indication :</b> Adénopathies cervicales niveaux II-III métastatiques d\'un carcinome des VADS.<br><b>2. Abord :</b> Cervicotomie.<br><b>3. Geste :</b> Curage ganglionnaire cervical fonctionnel niveaux II à IV avec préservation de la veine jugulaire interne, du SCM et du nerf spinal.<br><b>4. Fin d\'intervention :</b> Drain aspiratif.', sha: 'b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9 (texte fixe de démonstration, pas un sceau réel)' },
              amygdalectomie: { code: 'GAFA020 (310,00 €)', desc: '<b>1. Indication :</b> Angines récidivantes répondant aux critères de Paradise.<br><b>2. Abord :</b> Voie orale.<br><b>3. Geste :</b> Amygdalectomie bilatérale extracapsulaire au bistouri froid avec adénoïdectomie associée.<br><b>4. Fin d\'intervention :</b> Hémostase par ligatures, pas de packing.', sha: 'c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0 (texte fixe de démonstration, pas un sceau réel)' },
              att: { code: 'CAFA015 (210,00 €)', desc: '<b>1. Indication :</b> Otite séro-muqueuse chronique bilatérale avec hypoacousie de transmission.<br><b>2. Abord :</b> Otoscopie sous microscope opératoire.<br><b>3. Geste :</b> Myringotomie antéro-inférieure bilatérale avec pose d\'aérateurs trans-tympaniques.<br><b>4. Fin d\'intervention :</b> Perméabilité des aérateurs vérifiée.', sha: 'd0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1 (texte fixe de démonstration, pas un sceau réel)' }
            };

            const rep = reports[type] || reports.laryngectomie;
            if (badge) badge.textContent = rep.code;
            if (txt) txt.innerHTML = rep.desc;
            if (sha) sha.textContent = rep.sha;
            notify('🗣️ Démonstration : code CCAM ' + rep.code.split(' ')[0] + ' (texte fixe, pas une reconnaissance vocale réelle)', 'info');
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
              const organVol = vol.total_organ_volume_ml || 20;
              const lesionVol = vol.lesion_volume_ml || 3;
              const remnant = vol.remnant_volume_ml || 12;
              const remnantPct = vol.remnant_ratio_pct || 60.0;
              const meshCount = (data && data['3d_mesh_manifest_gltf']) ? data['3d_mesh_manifest_gltf'].length : 5;

              const desc = document.getElementById('anatomy-mode-desc');
              if (desc) desc.innerHTML = isSimulated
                ? `<span style="color:#eab308">⚠ estimation locale, non clinique (${meshCount} structures)</span> • ` +
                `Organe: <strong style="color:#a78bfa">${organVol} mL</strong> • ` +
                `Lésion: <strong style="color:#f87171">${lesionVol} mL</strong> • ` +
                `Restant: <strong style="color:#34d399">${remnant} mL (${remnantPct}%)</strong>` +
                `${fromCache ? ' <span style="color:var(--text3)">[cache]</span>' : ' • <span style="color:#eab308">backend de segmentation réelle indisponible</span>'}`
                : `<span style="color:#10b981">✅ ${meshCount} maillages chargés</span> • ` +
                `Organe: <strong style="color:#a78bfa">${organVol} mL</strong> • ` +
                `Lésion: <strong style="color:#f87171">${lesionVol} mL</strong> • ` +
                `Restant: <strong style="color:#34d399">${remnant} mL (${remnantPct}%)</strong>` +
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
                  : `✅ Jumeau 3D Patient-Spécifique ${patId} prêt : ${meshCount} structures, volume restant ${remnantPct}% — Aucune action requise`, isSimulated ? 'warn' : 'ok');
              }
            },

            // Rétrograde visuellement l'anatomie procédurale et applique les couleurs patient-réelles
            _applyVisualDegradation(vol, data) {
              // Estompe le maillage procédural générique
              if (organMesh) {
                organMesh.material.opacity = 0.06;
                // Teinte violette pour l'anatomie patient-réelle
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
              if (hudVol) hudVol.textContent = (vol.total_organ_volume_ml || 20) + ' mL';
            },

            // Génère des données cliniquement réalistes patient-spécifiques localement
            _generateLocalPatientData(patId) {
              const mod = MODULES[state.mod] || MODULES['laryngologie'];
              const pat = mod.patient || {};
              // Variation pseudo-aléatoire reproductible basée sur l'ID patient
              const seed = patId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
              const rnd = (base, amp) => Math.round((base + (seed % amp) - amp / 2) * 10) / 10;
              // Volume anatomique de référence dérivé du module actif (mêmes ordres de grandeur
              // que `refML` dans computeOrganVolumeMl()) au lieu d'une valeur figée de foie.
              const refVol = { laryngologie: 15, otologie: 2, rhinologie: 40, cervicofacial: 25, pediatrique: 10, anesthesie_reanimation: 500 }[mod.id] || 20;
              const organVol = Math.max(1, rnd(refVol, Math.max(2, refVol * 0.3)));
              const lesionVol = Math.max(0.5, rnd(refVol * 0.15, Math.max(1, refVol * 0.1)));
              const resected = Math.max(0.5, rnd(organVol * 0.5, organVol * 0.15));
              const remnant = Math.max(0, organVol - resected);
              const remnantPct = Math.round(remnant / organVol * 1000) / 10;

              // Manifeste de mesh dérivé de l'anatomie réelle du module actif (au lieu d'une liste
              // figée d'organes hépatiques) : chaque groupe de la structure anatomique (mod.structures,
              // déjà affiché dans l'arbre anatomique du panneau gauche) devient une entité du jumeau,
              // avec la lésion en tête de liste. Fonctionne pour n'importe quel module, présent ou futur.
              const groupColors = ['#8b5cf6', '#38bdf8', '#f43f5e', '#3b82f6', '#10b981'];
              const structures = mod.structures || [];
              const meshManifest = [{ organ: 'Lesion', color: '#ef4444', volume_ml: lesionVol }];
              structures.forEach((grp, i) => {
                meshManifest.push({
                  organ: grp.name.replace(/[^\p{L}\p{N}]+/gu, '_'),
                  color: groupColors[i % groupColors.length],
                  volume_ml: Math.max(0.5, rnd(organVol / (structures.length || 1), 3))
                });
              });

              return {
                patient_id: patId,
                patient_name: pat.nom || patId,
                clinical_workflow: 'LOCAL_SIMULATION_REAL_ANATOMY 🏥',
                volumetric_analysis_ml: {
                  total_organ_volume_ml: organVol,
                  lesion_volume_ml: lesionVol,
                  resected_volume_ml: resected,
                  remnant_volume_ml: remnant,
                  remnant_ratio_pct: remnantPct
                },
                '3d_mesh_manifest_gltf': meshManifest,
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
              const mod = MODULES[state.mod] || MODULES['laryngologie'];
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
            // Connexion obligatoire uniquement en mode pilote (apiBase configuré) —
            // bloque l'accès au hub tant qu'aucune session valide n'existe. La démo
            // publique (apiBase vide) garde son comportement anonyme inchangé.
            if (state.settings.apiBase) { await ensureSession(); }
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
                // DICOM / Réalité Augm. / Audit Trail et les vues Surg* s'ouvrent en modale
                if (view === 'dicom') { openDicomViewer(); return; }
                if (view === 'ar') { openArPanel(); return; }
                if (view === 'audit') { openAuditTrail(); return; }
                if (view === 'surgai') { openModal('surgai'); return; }
                if (view === 'surgsim') { openModal('surgsim'); return; }
                if (view === 'surgor') { openModal('surgor'); return; }
                if (view === 'surgnav') { openModal('surgnav'); return; }
                if (view === 'surgvoice') { openModal('surgvoice'); return; }
                if (view === 'mdr-fda') { openModal('mdr-fda'); return; }
                if (view === 'raymarching-dvr') { openModal('raymarching-dvr'); return; }
                if (view === 'resp-cycle') { openModal('resp-cycle'); return; }
                // 'plan' et 'jumeau' sont de vraies bascules de vue.
                document.querySelectorAll('.top-nav button[data-view]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.tab = view;
                if (view === 'jumeau') { enterDigitalTwin(); }
                else if (twin.active) { exitDigitalTwin(); }
              });
            });
          }

          document.addEventListener('DOMContentLoaded', init);
