          // ════════════════════════════════════════════════
          //  MODULE REGISTRY — Définition des spécialités
          // ════════════════════════════════════════════════
          // ════════════════════════════════════════════════
          //  I18N — moteur d'internationalisation (EN/FR/AR-RTL/NL)
          // ════════════════════════════════════════════════
          // Architecture : dictionnaires externes i18n/{locale}.json charges en lazy-load (vrai
          // lazy-load, editables sans toucher au HTML, source de l'export/import de l'editeur de
          // traductions) AVEC repli automatique sur une copie embarquee (I18N_EMBEDDED, generee depuis
          // ces memes 4 fichiers) si fetch() echoue -- notamment en mode file:// (double-clic, sans
          // serveur), ou fetch() d'un fichier local est bloque par le navigateur. Resultat : l'app
          // reste multilingue meme ouverte en double-clic, ET editable via /i18n/*.json quand servie
          // par un serveur (backend ou autre).
          //
          // Perimetre couvert (Phase 1) : chrome UI principal (barre d'outils, onglets, panneaux
          // Plan/Analyse/Staging/DICOM/Audit, notifications courantes, parametres, fiche patient, chat
          // IA hors-ligne). Les ~15 modales exploratoires "NextGen" (deja masquees hors Mode Recherche)
          // restent en francais dans cette passe ; le mecanisme ci-dessous les rend triviales a etendre
          // (ajouter des cles dans les 4 fichiers i18n/*.json + I18N_EMBEDDED, puis data-i18n / I18N.t()
          // dans le HTML/JS concerne -- aucun changement d'architecture necessaire).
          const I18N_EMBEDDED = { "en": { "meta": { "locale": "en", "name": "English", "nativeName": "English", "flag": "🇺🇸", "dir": "ltr", "intl": "en-US" }, "common": { "close": "Close", "cancel": "Cancel", "save": "Save", "apply": "Apply", "export": "Export", "import": "Import", "edit": "Edit", "delete": "Delete", "loading": "Loading…", "search": "Search…", "yes": "Yes", "no": "No", "warning": "Warning", "error": "Error", "success": "Success", "info": "Info", "notImplemented": "Not implemented in this prototype", "notCalculated": "Not calculated", "none": "None", "unknown": "Unknown" }, "nav": { "workflow3": "3-Click Workflow", "plan": "Plan", "dicom": "DICOM", "twin": "Digital Twin", "ar": "Augmented Reality", "audit": "Audit Trail", "surgai": "SurgAI", "surgsim": "SurgSim", "surgor": "OR AI", "surgnav": "GPS Nav", "surgvoice": "Assistant", "mdrFda": "Compliance", "researchToggle": "Research Mode — reveals exploratory modules not clinically validated (Milestones M21-M40)", "dashToggle": "OR Dashboard", "orToggle": "Operating Room Mode (shared screen)", "touchToggle": "Touch mode (enlarged targets)", "readonlyToggle": "Read-only mode (OR team)", "themeToggle": "Theme", "hubToggle": "Switch module / specialty", "settingsToggle": "Technical settings (Gemini, backend) — research/maintenance mode only", "patientsToggle": "Patients", "exitOr": "Exit OR Mode", "exitDash": "Exit Dashboard", "researchBanner": "🔬 RESEARCH MODE ACTIVE — the modules shown above are exploratory (Milestones M21-M40), not clinically validated, and must not be used for decision-making in the OR." }, "lang": { "selectorLabel": "Language", "en": "English", "fr": "Français", "ar": "العربية", "nl": "Nederlands", "changed": "Language switched to {language}" }, "sidebar": { "ageSex": "Age / Sex", "weightHeight": "Weight / Height", "diagnosis": "Diagnosis", "orPlanning": "OR Schedule", "notScheduledToday": "Not scheduled today", "urgencyRed": "🔴 Urgent", "urgencyOrange": "🟠 Semi-urgent", "urgencyGreen": "🟢 Scheduled", "switchModule": "Switch module", "room": "Room {n}", "statusOngoing": "Ongoing", "statusDone": "Done", "statusPlanned": "Planned" }, "toolbar": { "importDicom": "Import DICOM", "realSegmentation": "Real AI Segmentation", "realSegmentationTitle": "Runs a real segmentation inference (TotalSegmentator) on the backend and loads the resulting real 3D meshes", "pacs": "PACS", "pacsTitle": "Search a study on the PACS (QIDO-RS) and import a series (WADO-RS)", "threshold3d": "3D Threshold", "voxelsToggle": "Show/hide the voxelized DICOM organ in the 3D scene", "recenter": "Recenter", "recenterTitle": "Recenter camera on the DICOM organ (key R)", "reset": "Reset", "resetTitle": "Reset rotation + zoom (key Space)", "spin": "Spin", "spinTitle": "Toggle automatic rotation" }, "analysis": { "sectionTitle": "Volumetry (computed on the current 3D volume)", "organVolume": "Organ volume", "resectionVolume": "Estimated resection volume", "remnant": "Functional remnant", "realSegmentationBadge": "🏥 real segmentation", "proceduralBadge": "⚠ procedural estimate, non-clinical", "proceduralNote": "Estimate derived from the displayed voxel volume, not a validated AI segmentation. Use “🔬 Real AI Segmentation” for a TotalSegmentator-based calculation.", "riskScoreTitle": "Operative risk score", "riskScoreBadge": "⚠ internal heuristic, not clinically validated", "riskScoreBasedOn": "based on {count} off-target metric(s), age, urgency — internal formula, not a validated risk scale (e.g. POSSUM, ASA)", "riskLow": "Low", "riskModerate": "Moderate", "riskHigh": "High", "scenarios": "Predictive scenarios", "scenarioOptimistic": "Optimistic", "scenarioExpected": "Expected", "scenarioUnfavorable": "Unfavorable", "remnantFunctional": "{pct}% functional remnant", "recalculate": "↻ Recalculate", "recalculated": "Analysis recalculated", "exportPlan": "⭳ Export plan (DICOM SR / JSON)" }, "staging": { "tnmTitle": "🔬 TNM Staging", "tField": "T (Tumor)", "nField": "N (Lymph nodes)", "mField": "M (Metastasis)", "hbpParams": "🏥 HBP Parameters", "bclcField": "BCLC", "childPughField": "Child-Pugh", "colorectalParams": "🏥 Colorectal Parameters", "crmField": "CRM", "thoracicParams": "🫁 Thoracic Parameters", "vemsField": "Preop. FEV1", "volumetryTitle": "📊 Volumetry", "volumetryRealBadge": "🏥 real", "volumetryEstimateBadge": "⚠ estimate", "organVolumeReal": "Organ volume (real AI segmentation)", "organVolumeEstimate": "Organ volume (current volume, estimate)", "tumorVolume": "Segmented tumor volume", "noSegmentation": "(no segmentation)", "computeResectability": "🔄 Compute resectability", "auditLogTitle": "📋 Audit Log ({count} entr{count, plural, one {y} other {ies}})", "auditLogEmpty": "No action recorded.", "resectable": "✅ Resectable — Surgery indicated", "notResectable": "❌ Not resectable as is — Discuss alternative", "exportReport": "⭳ Export staging summary", "reportExported": "Staging report exported (JSON)" }, "dicom": { "importing": "Importing {count} file(s)…", "resampling": "Resampling {n}³ voxels…", "loaded": "{count} DICOM slice(s) loaded — Scroll=navigate, WW={ww} WL={wl}", "reconstructing": "Reconstructing 3D…", "voxelizing": "Voxelizing at threshold {threshold} HU…", "realVolumeShown": "✓ Real DICOM volume shown in 3D — threshold {threshold} HU, {count} voxel(s) in {chunks} chunk(s)", "noVolume": "No DICOM volume to display", "noVoxelsAboveThreshold": "No voxel ≥ {threshold} HU — lower the threshold in the 🎚 bar", "hidden": "DICOM voxels hidden — procedural anatomy restored", "shown": "Real DICOM voxels shown", "reconstructionFailed": "3D reconstruction failed: {error}" }, "settings": { "title": "Settings", "geminiKey": "Gemini API Key", "geminiModel": "Gemini Model", "geminiModelHint": "gemini-flash-latest always points to the newest Flash release (avoids deprecations). Alternatives: {alt1}, {alt2}, or {alt3} (closes 2026-07-22).", "groqKey": "Groq API Key (fallback)", "backendUrl": "Backend URL", "surgeonName": "Surgeon name", "localAiTitle": "🔒 Local AI (offline-first — zero network, zero data leak)", "localAiHint": "If configured below, the local AI is ALWAYS tried first, before Gemini/Groq/backend — the prompt and response never leave the device (WebGPU) or the local network (server).", "localServer": "Local server (Ollama / llama.cpp, OpenAI-compatible API)", "localServerModel": "Model name on the local server", "webgpuModel": "Local in-browser model (WebGPU, WebLLM)", "webgpuChecking": "Checking WebGPU support…", "loadModel": "⬇ Load model", "unloadModel": "✕ Unload", "webgpuHint": "First load: ~1-5 GB download (cached by the browser via IndexedDB — instant afterwards). Requires Chrome/Edge 113+ (desktop or recent Android); not available on Safari/Firefox yet. Once loaded, no network request is made to generate a reply.", "offlineCertifiedTitle": "📚 Certified offline mode", "offlineCertifiedHint": "Forces pre-computed answers, even if an AI key is configured. No network call to Gemini/Groq." }, "patients": { "title": "Patient Database", "searchPlaceholder": "Search a patient…", "editCurrent": "✎ Edit current patient", "updated": "Patient updated (local)", "syncedBackend": "Synced with backend" }, "audit": { "title": "📜 Audit Trail", "filterByPatient": "Filter by patient", "filterByUser": "Filter by user" }, "ai": { "chatPlaceholder": "Ask a question…", "briefingTitle": "🤖 Automatic AI summary", "briefingProcedure": "{procedure} recommended for this patient.", "briefingRemnant": "Estimated functional remnant: {pct}% (safety threshold: {threshold}%)", "briefingRisk": "Operative risk:", "briefingWatch": "⚠️ To monitor: {metrics}", "briefingNoIssue": "✅ No off-target metric detected.", "respondInLanguage": "Respond exclusively in {language}." }, "modals": { "mdrFda": { "title": "🛡️ Compliance status (prototype, not certified) & CCAM dictation draft", "notCertifiedBanner": "⚠️ Uncertified prototype: this software has NOT undergone any CE MDR 2017/745 certification, any FDA 510(k) submission, or any formal HIPAA audit. The information below describes the actual state of the prototype, not an obtained certification.", "regulatoryStateTitle": "📋 Actual regulatory status", "dictationTitle": "🗣️ CCAM dictation draft (demonstration)", "dictationHint": "⚠️ Keyword matching on a predefined text — NOT a real speech-recognition or NLP engine. Must be fully validated before any use:", "reportPreviewTitle": "📄 Draft report (demonstration, not a legal document):" }, "respCycle": { "title": "🌊 Respiratory cycle — simplified kinematic formula, not clinically validated", "banner": "🌊 Illustrative kinematic formula: sinusoidal approximation of respiratory motion (14 cycles/min), not calibrated on this patient, not clinically validated — not a real finite-element solver.", "launchLive": "▶ Launch live cycle", "pause": "⏸️ Pause", "displacementTitle": "📍 Anatomical displacement (formula, real time)", "respiratoryPhase": "Respiratory phase", "craniocaudalShift": "Cranio-caudal displacement (ΔZ)", "anteroposteriorShift": "Antero-posterior tilt (ΔY)", "registrationTitle": "🛠️ Non-rigid registration — not implemented", "registrationHint": "⚠️ No elastic registration solver is implemented in this prototype (see backend/biomechanics_engine.py `/elastic-registration`, which now honestly returns \"not_implemented\" instead of fabricated metrics).", "pneumoPressure": "Pneumoperitoneum pressure (parameter)", "registerButton": "🔄 Register on AR Stereovision / Ultrasound (not implemented)" } }, "i18nAdmin": { "title": "🌐 Translation editor", "hint": "Edits are saved locally (browser) as an override layer, without modifying the source files. Export the JSON to apply them permanently.", "keyColumn": "Key", "exportLanguage": "Export {language} JSON", "importLanguage": "Import {language} JSON", "resetOverrides": "Reset local edits", "overridesSaved": "Translation edits saved locally", "overridesReset": "Local translation edits cleared", "imported": "{language} translations imported ({count} key(s))" }, "plan": { "plannedProcedure": "Planned procedure", "metricsTitle": "{specialty} Metrics", "checklistTitle": "Preop checklist" }, "workflow": { "patient": "My Patient", "analysis": "AI Analysis", "simulation": "Simulation", "or": "OR" }, "pipeline": { "loadingTitle": "PACS → AI → 3D Twin pipeline in progress...", "realTitle": "REAL ANATOMY — Patient-Specific 3D Twin", "demoTitle": "DEMO MODE — Procedural Anatomy (Training only)", "estimateTitle": "LOCAL ESTIMATE — Real segmentation backend unavailable (non-clinical)" } , "wf3": { "title": "3-Click Workflow — Rapid Validation", "step1": "1 · Review", "step2": "2 · Adjust", "step3": "3 · Validate", "step1Desc": "Structures auto-extracted when the series arrives (J-1, zero-typing) with real volumes in mL.", "step2Desc": "Drag the safety margin — instant recalculation of resected volume and guardrail.", "step3Desc": "Validate the plan, then export the DICOM SR report and patient PDF.", "noBackend": "The 3-Click Workflow requires the backend (DICOM upload / PACS). Configure its URL in Settings, then log in.", "noRuns": "No prepared run for this patient. Trigger a manual preparation:", "triggerPrep": "Trigger preparation", "preparing": "Preparing... the digital twin will be ready with no action from you.", "prepDone": "Ready — structures and margin simulation available.", "prepError": "Preparation failed: {error}", "sourceReal": "Real DICOM voxels", "sourceEstimate": "Metadata estimate", "structuresTitle": "Detected structures", "roleTarget": "Target", "roleRisk": "Risk", "volumeMl": "mL", "marginLabel": "Safety margin", "resectionVolume": "Simulated resected volume", "riskOverlap": "Risk overlap", "guardrailTitle": "Deterministic guardrail", "guardrailOk": "Within thresholds", "guardrailWarn": "Threshold(s) exceeded — review margin", "guideline": "Reference: {g}", "flagOk": "OK", "flagWarn": "Warning", "validate": "Validate plan", "confirmValidate": "Validate the surgical plan and freeze the margin?", "validatedBy": "Validated by", "validatedAt": "on", "exportSr": "Export DICOM SR", "srExported": "DICOM SR exported — {title}", "srUnavailable": "DICOM SR export unavailable.", "exportPdf": "Download PDF", "pdfUnavailable": "PDF export unavailable (reportlab not installed).", "recalcDone": "Margin updated: {mm} mm — instant recalculation.", "recalcFailed": "Operation failed.", "patient": "Patient", "series": "Series", "source": "Source", "trigger": "Trigger", "auto": "auto", "manual": "manual", "run": "Run", "loadFailed": "Failed to load: {msg}", "selectRun": "Choose a prepared run:", "notReady": "Preparing — the margin becomes adjustable when ready." } }, "fr": { "meta": { "locale": "fr", "name": "French", "nativeName": "Français", "flag": "🇫🇷", "dir": "ltr", "intl": "fr-FR" }, "common": { "close": "Fermer", "cancel": "Annuler", "save": "Enregistrer", "apply": "Appliquer", "export": "Exporter", "import": "Importer", "edit": "Éditer", "delete": "Supprimer", "loading": "Chargement…", "search": "Rechercher…", "yes": "Oui", "no": "Non", "warning": "Avertissement", "error": "Erreur", "success": "Succès", "info": "Info", "notImplemented": "Non implémenté dans ce prototype", "notCalculated": "Non calculé", "none": "Aucun", "unknown": "Inconnu" }, "nav": { "workflow3": "Workflow 3-Clics", "plan": "Plan", "dicom": "DICOM", "twin": "Jumeau Num.", "ar": "Réalité Augm.", "audit": "Audit Trail", "surgai": "SurgAI", "surgsim": "SurgSim", "surgor": "Bloc IA", "surgnav": "GPS Nav", "surgvoice": "Assistant", "mdrFda": "Conformité", "researchToggle": "Mode Recherche — révèle les modules exploratoires non validés cliniquement (Jalons M21-M40)", "dashToggle": "Tableau de Bord Bloc", "orToggle": "Mode Bloc Opératoire (écran partagé)", "touchToggle": "Mode tactile (cibles agrandies)", "readonlyToggle": "Mode lecture seule (équipe du bloc)", "themeToggle": "Thème", "hubToggle": "Changer de module / spécialité", "settingsToggle": "Paramètres techniques (Gemini, backend) — réservé au mode recherche/maintenance", "patientsToggle": "Patients", "exitOr": "Sortir Mode OR", "exitDash": "Sortir Tableau de Bord", "researchBanner": "🔬 MODE RECHERCHE ACTIVÉ — les modules affichés ci-dessus sont exploratoires (Jalons M21-M40), non validés cliniquement, et ne doivent pas être utilisés pour la prise de décision au bloc." }, "lang": { "selectorLabel": "Langue", "en": "English", "fr": "Français", "ar": "العربية", "nl": "Nederlands", "changed": "Langue changée vers {language}" }, "sidebar": { "ageSex": "Âge / Sexe", "weightHeight": "Poids / Taille", "diagnosis": "Diagnostic", "orPlanning": "Planning Bloc", "notScheduledToday": "Non programmé aujourd'hui", "urgencyRed": "🔴 Urgent", "urgencyOrange": "🟠 Semi-urgent", "urgencyGreen": "🟢 Programmé", "switchModule": "Changer de module", "room": "Salle {n}", "statusOngoing": "En cours", "statusDone": "Terminé", "statusPlanned": "Prévu" }, "toolbar": { "importDicom": "Importer DICOM", "realSegmentation": "Segmentation IA réelle", "realSegmentationTitle": "Lance une vraie inférence de segmentation (TotalSegmentator) sur le backend et charge les maillages 3D réels obtenus", "pacs": "PACS", "pacsTitle": "Rechercher une étude sur le PACS (QIDO-RS) et importer une série (WADO-RS)", "threshold3d": "Seuil 3D", "voxelsToggle": "Afficher/masquer l'organe DICOM voxelisé dans la scène 3D", "recenter": "Recadrer", "recenterTitle": "Recadrer la caméra sur l'organe DICOM (touche R)", "reset": "Reset", "resetTitle": "Réinitialiser rotation + zoom (touche Espace)", "spin": "Spin", "spinTitle": "Activer/désactiver la rotation automatique" }, "analysis": { "sectionTitle": "Volumétrie (calculée sur le volume 3D courant)", "organVolume": "Volume organe", "resectionVolume": "Volume de résection estimé", "remnant": "Reste fonctionnel", "realSegmentationBadge": "🏥 segmentation réelle", "proceduralBadge": "⚠ estimation procédurale, non clinique", "proceduralNote": "Estimation dérivée du volume voxel affiché, pas d'une segmentation IA validée. Utilisez « 🔬 Segmentation IA réelle » pour un calcul basé sur TotalSegmentator.", "riskScoreTitle": "Score de risque opératoire", "riskScoreBadge": "⚠ heuristique interne, non validée cliniquement", "riskScoreBasedOn": "basé sur {count} métrique(s) hors cible, âge, urgence — formule interne, pas une échelle de risque validée (ex. POSSUM, ASA)", "riskLow": "Faible", "riskModerate": "Modéré", "riskHigh": "Élevé", "scenarios": "Scénarios prédictifs", "scenarioOptimistic": "Optimiste", "scenarioExpected": "Attendu", "scenarioUnfavorable": "Défavorable", "remnantFunctional": "{pct}% reste fonctionnel", "recalculate": "↻ Recalculer", "recalculated": "Analyse recalculée", "exportPlan": "⭳ Exporter le plan (DICOM SR / JSON)" }, "staging": { "tnmTitle": "🔬 Stadification TNM", "tField": "T (Tumeur)", "nField": "N (Ganglions)", "mField": "M (Métastases)", "hbpParams": "🏥 Paramètres HBP", "bclcField": "BCLC", "childPughField": "Child-Pugh", "colorectalParams": "🏥 Paramètres Colorectaux", "crmField": "CRM", "thoracicParams": "🫁 Paramètres Thoraciques", "vemsField": "VEMS préop.", "volumetryTitle": "📊 Volumétrie", "volumetryRealBadge": "🏥 réelle", "volumetryEstimateBadge": "⚠ estimation", "organVolumeReal": "Volume organe (segmentation IA réelle)", "organVolumeEstimate": "Volume organe (volume courant, estimation)", "tumorVolume": "Volume tumeur segmentée", "noSegmentation": "(aucune segmentation)", "computeResectability": "🔄 Calculer la résécabilité", "auditLogTitle": "📋 Audit Log ({count} entrée{count, plural, one {} other {s}})", "auditLogEmpty": "Aucune action enregistrée.", "resectable": "✅ Résécable — Chirurgie indiquée", "notResectable": "❌ Non résécable en l'état — Discuter alternative", "exportReport": "⭳ Exporter bilan staging", "reportExported": "Bilan staging exporté (JSON)" }, "dicom": { "importing": "Lecture de {count} fichier(s)…", "resampling": "Resampling {n}³ voxels…", "loaded": "{count} coupe(s) DICOM chargée(s) — Molette=naviguer, WW={ww} WL={wl}", "reconstructing": "Reconstruction 3D…", "voxelizing": "Voxelisation au seuil {threshold} HU…", "realVolumeShown": "✓ Volume DICOM réel affiché en 3D — seuil {threshold} HU, {count} voxel(s) en {chunks} chunk(s)", "noVolume": "Aucun volume DICOM à afficher", "noVoxelsAboveThreshold": "Aucun voxel ≥ {threshold} HU — baissez le seuil dans la barre 🎚", "hidden": "Voxels DICOM masqués — anatomie procédurale restaurée", "shown": "Voxels DICOM réels affichés", "reconstructionFailed": "Reconstruction 3D échouée : {error}" }, "settings": { "title": "Paramètres", "geminiKey": "Clé API Gemini", "geminiModel": "Modèle Gemini", "geminiModelHint": "gemini-flash-latest pointe toujours vers le Flash le plus récent (évite les dépréciations). Alternatives : {alt1}, {alt2}, ou {alt3} (ferme le 22/07/2026).", "groqKey": "Clé API Groq (fallback)", "backendUrl": "URL Backend", "surgeonName": "Nom du chirurgien", "localAiTitle": "🔒 IA locale (offline-first — zéro réseau, zéro fuite de données)", "localAiHint": "Si configurée ci-dessous, l'IA locale est TOUJOURS essayée en premier, avant Gemini/Groq/backend — le prompt et la réponse ne quittent jamais l'appareil (WebGPU) ou le réseau local (serveur).", "localServer": "Serveur local (Ollama / llama.cpp, API compatible OpenAI)", "localServerModel": "Nom du modèle sur le serveur local", "webgpuModel": "Modèle local dans le navigateur (WebGPU, WebLLM)", "webgpuChecking": "Vérification du support WebGPU…", "loadModel": "⬇ Charger le modèle", "unloadModel": "✕ Décharger", "webgpuHint": "Premier chargement : téléchargement de ~1 à 5 Go (mis en cache par le navigateur via IndexedDB — instantané ensuite). Nécessite Chrome/Edge 113+ (desktop ou Android récent) ; non disponible sur Safari/Firefox à ce jour. Une fois chargé, aucune requête réseau n'est faite pour générer une réponse.", "offlineCertifiedTitle": "📚 Mode hors-ligne certifié", "offlineCertifiedHint": "Force les réponses pré-calculées, même si une clé IA est configurée. Aucun appel réseau vers Gemini/Groq." }, "patients": { "title": "Base Patients", "searchPlaceholder": "Rechercher un patient…", "editCurrent": "✎ Éditer patient courant", "updated": "Patient mis à jour (local)", "syncedBackend": "Synchronisé avec le backend" }, "audit": { "title": "📜 Audit Trail", "filterByPatient": "Filtrer par patient", "filterByUser": "Filtrer par utilisateur" }, "ai": { "chatPlaceholder": "Posez votre question…", "briefingTitle": "🤖 Synthèse IA automatique", "briefingProcedure": "{procedure} recommandée pour ce patient.", "briefingRemnant": "Reste fonctionnel estimé : {pct}% (seuil de sécurité : {threshold}%)", "briefingRisk": "Risque opératoire :", "briefingWatch": "⚠️ À surveiller : {metrics}", "briefingNoIssue": "✅ Aucune métrique hors cible détectée.", "respondInLanguage": "Réponds exclusivement en {language}." }, "modals": { "mdrFda": { "title": "🛡️ Statut de conformité (prototype, non certifié) & brouillon de dictée CCAM", "notCertifiedBanner": "⚠️ Prototype non certifié : ce logiciel n'a fait l'objet d'AUCUNE certification CE MDR 2017/745, d'AUCUNE soumission FDA 510(k), et d'AUCUN audit HIPAA formel. Les informations ci-dessous décrivent l'état réel du prototype, pas une conformité obtenue.", "regulatoryStateTitle": "📋 État réglementaire réel", "dictationTitle": "🗣️ Brouillon de dictée CCAM (démonstration)", "dictationHint": "⚠️ Appariement de mots-clés sur un texte prédéfini — PAS un moteur de reconnaissance vocale ni de NLP réel. À valider intégralement avant tout usage :", "reportPreviewTitle": "📄 Brouillon de compte-rendu (démonstration, pas un document légal) :" }, "respCycle": { "title": "🌊 Cycle respiratoire — formule cinématique simplifiée, non validée cliniquement", "banner": "🌊 Formule cinématique illustrative : approximation sinusoïdale du mouvement respiratoire (14 cycles/min), non calibrée sur ce patient, non validée cliniquement — pas un solveur par éléments finis réel.", "launchLive": "▶ Lancer Cycle Live", "pause": "⏸️ Mettre en Pause", "displacementTitle": "📍 Déplacement Anatomique (formule, temps réel)", "respiratoryPhase": "Phase respiratoire", "craniocaudalShift": "Déplacement crânio-caudal (ΔZ)", "anteroposteriorShift": "Bascule antéro-postérieure (ΔY)", "registrationTitle": "🛠️ Recalage non-rigide — non implémenté", "registrationHint": "⚠️ Aucun solveur de recalage élastique n'est implémenté dans ce prototype (voir backend/biomechanics_engine.py `/elastic-registration`, qui renvoie désormais honnêtement \"not_implemented\" au lieu de métriques fabriquées).", "pneumoPressure": "Pression pneumopéritoine (paramètre)", "registerButton": "🔄 Recaler sur Stéréovision AR / Écho (non implémenté)" } }, "i18nAdmin": { "title": "🌐 Éditeur de traductions", "hint": "Les modifications sont sauvegardées localement (navigateur) comme couche de surcharge, sans modifier les fichiers source. Exportez le JSON pour les appliquer de façon permanente.", "keyColumn": "Clé", "exportLanguage": "Exporter le JSON {language}", "importLanguage": "Importer le JSON {language}", "resetOverrides": "Réinitialiser les modifications locales", "overridesSaved": "Modifications de traduction sauvegardées localement", "overridesReset": "Modifications de traduction locales effacées", "imported": "Traductions {language} importées ({count} clé(s))" }, "plan": { "plannedProcedure": "Procédure planifiée", "metricsTitle": "Métriques {specialty}", "checklistTitle": "Checklist préopératoire" }, "workflow": { "patient": "Mon Patient", "analysis": "Analyse IA", "simulation": "Simulation", "or": "Bloc" }, "pipeline": { "loadingTitle": "Pipeline PACS → IA → Jumeau 3D en cours...", "realTitle": "ANATOMIE RÉELLE — Jumeau 3D Patient-Spécifique", "demoTitle": "MODE DÉMO — Anatomie Procédurale (Entraînement uniquement)", "estimateTitle": "ESTIMATION LOCALE — Backend de segmentation réelle indisponible (non clinique)" } , "wf3": { "title": "Workflow « 3 Clics » — Validation éclair", "step1": "1 · Aperçu", "step2": "2 · Ajustement", "step3": "3 · Validation", "step1Desc": "Structures auto-extraites dès l'arrivée de la série (J-1, zéro-saisie) avec volumes réels en mL.", "step2Desc": "Glissez la marge de sécurité — recalcul instantané du volume réséqué et du garde-fou.", "step3Desc": "Validez le plan puis exportez le compte-rendu DICOM SR et le PDF patient.", "noBackend": "Le Workflow « 3 Clics » nécessite le backend (upload DICOM / PACS). Configurez son URL dans Paramètres puis connectez-vous.", "noRuns": "Aucun run préparé pour ce patient. Déclenchez une préparation manuelle :", "triggerPrep": "Déclencher la préparation", "preparing": "Préparation en cours — le jumeau sera prêt sans action de votre part.", "prepDone": "Prêt — structures et simulation de marge disponibles.", "prepError": "Échec de la préparation : {error}", "sourceReal": "Voxels DICOM réels", "sourceEstimate": "Estimation métadonnées", "structuresTitle": "Structures détectées", "roleTarget": "Cible", "roleRisk": "Risque", "volumeMl": "mL", "marginLabel": "Marge de sécurité", "resectionVolume": "Volume réséqué simulé", "riskOverlap": "Chevauchement risque", "guardrailTitle": "Garde-fou déterministe", "guardrailOk": "Conforme aux seuils", "guardrailWarn": "Seuil(s) dépassé(s) — revoir la marge", "guideline": "Référence : {g}", "flagOk": "OK", "flagWarn": "Avertissement", "validate": "Valider le plan", "confirmValidate": "Valider le plan chirurgical et figer la marge ?", "validatedBy": "Validé par", "validatedAt": "le", "exportSr": "Exporter DICOM SR", "srExported": "DICOM SR exporté — {title}", "srUnavailable": "Export DICOM SR indisponible.", "exportPdf": "Télécharger le PDF", "pdfUnavailable": "Export PDF indisponible (reportlab non installé).", "recalcDone": "Marge mise à jour : {mm} mm — recalcul instantané.", "recalcFailed": "Opération impossible.", "patient": "Patient", "series": "Série", "source": "Source", "trigger": "Déclencheur", "auto": "auto", "manual": "manuel", "run": "Run", "loadFailed": "Chargement impossible : {msg}", "selectRun": "Choisissez un run préparé :", "notReady": "En préparation — la marge sera ajustable dès la fin." } }, "ar": { "meta": { "locale": "ar", "name": "Arabic", "nativeName": "العربية", "flag": "🇩🇿", "dir": "rtl", "intl": "ar-DZ" }, "common": { "close": "إغلاق", "cancel": "إلغاء", "save": "حفظ", "apply": "تطبيق", "export": "تصدير", "import": "استيراد", "edit": "تعديل", "delete": "حذف", "loading": "جارٍ التحميل…", "search": "بحث…", "yes": "نعم", "no": "لا", "warning": "تنبيه", "error": "خطأ", "success": "تم بنجاح", "info": "معلومة", "notImplemented": "غير مُنفَّذ في هذا النموذج الأولي", "notCalculated": "لم يُحسب بعد", "none": "لا شيء", "unknown": "غير معروف" }, "nav": { "workflow3": "سير عمل 3 نقرات", "plan": "المخطط", "dicom": "DICOM", "twin": "التوأم الرقمي", "ar": "الواقع المعزز", "audit": "سجل التدقيق", "surgai": "المساعد الجراحي الذكي", "surgsim": "المحاكاة الجراحية", "surgor": "ذكاء غرفة العمليات", "surgnav": "الملاحة الجراحية", "surgvoice": "المساعد الصوتي", "mdrFda": "المطابقة التنظيمية", "researchToggle": "وضع البحث — يُظهر الوحدات الاستكشافية غير المعتمدة سريريًا (المراحل M21-M40)", "dashToggle": "لوحة تحكم غرفة العمليات", "orToggle": "وضع غرفة العمليات (شاشة مشتركة)", "touchToggle": "وضع اللمس (أهداف مكبّرة)", "readonlyToggle": "وضع القراءة فقط (فريق غرفة العمليات)", "themeToggle": "المظهر", "hubToggle": "تغيير الوحدة / التخصص", "settingsToggle": "الإعدادات التقنية (Gemini، الخادم الخلفي) — لوضع البحث/الصيانة فقط", "patientsToggle": "المرضى", "exitOr": "الخروج من وضع غرفة العمليات", "exitDash": "الخروج من لوحة التحكم", "researchBanner": "🔬 وضع البحث مُفعّل — الوحدات المعروضة أعلاه استكشافية (المراحل M21-M40)، غير معتمدة سريريًا، ويجب عدم استخدامها لاتخاذ القرار داخل غرفة العمليات." }, "lang": { "selectorLabel": "اللغة", "en": "English", "fr": "Français", "ar": "العربية", "nl": "Nederlands", "changed": "تم تغيير اللغة إلى {language}" }, "sidebar": { "ageSex": "العمر / الجنس", "weightHeight": "الوزن / الطول", "diagnosis": "التشخيص", "orPlanning": "جدول غرفة العمليات", "notScheduledToday": "غير مبرمج اليوم", "urgencyRed": "🔴 عاجل", "urgencyOrange": "🟠 شبه عاجل", "urgencyGreen": "🟢 مبرمج", "switchModule": "تغيير الوحدة", "room": "القاعة {n}", "statusOngoing": "جارٍ", "statusDone": "منتهٍ", "statusPlanned": "مقرَّر" }, "toolbar": { "importDicom": "استيراد DICOM", "realSegmentation": "تجزئة ذكاء اصطناعي حقيقية", "realSegmentationTitle": "يشغّل استدلال تجزئة حقيقي (TotalSegmentator) على الخادم الخلفي ويحمّل النماذج ثلاثية الأبعاد الحقيقية الناتجة", "pacs": "نظام أرشفة الصور (PACS)", "pacsTitle": "البحث عن دراسة في نظام PACS (QIDO-RS) واستيراد سلسلة صور (WADO-RS)", "threshold3d": "عتبة العرض ثلاثي الأبعاد", "voxelsToggle": "إظهار/إخفاء العضو المُجسَّم من DICOM في المشهد ثلاثي الأبعاد", "recenter": "إعادة توسيط", "recenterTitle": "إعادة توسيط الكاميرا على عضو DICOM (المفتاح R)", "reset": "إعادة ضبط", "resetTitle": "إعادة ضبط الدوران والتكبير (مفتاح المسافة)", "spin": "دوران", "spinTitle": "تفعيل/إيقاف الدوران التلقائي" }, "analysis": { "sectionTitle": "قياس الحجم (محسوب من الحجم ثلاثي الأبعاد الحالي)", "organVolume": "حجم العضو", "resectionVolume": "حجم الاستئصال المقدَّر", "remnant": "الجزء الوظيفي المتبقي", "realSegmentationBadge": "🏥 تجزئة حقيقية", "proceduralBadge": "⚠ تقدير إجرائي، غير سريري", "proceduralNote": "تقدير مُستمَد من الحجم المجسّم المعروض، وليس من تجزئة معتمَدة بالذكاء الاصطناعي. استخدم « 🔬 تجزئة ذكاء اصطناعي حقيقية » لحساب مبني على TotalSegmentator.", "riskScoreTitle": "مؤشر الخطورة الجراحية", "riskScoreBadge": "⚠ معادلة داخلية، غير معتمَدة سريريًا", "riskScoreBasedOn": "مبني على {count} مؤشر(ات) خارج النطاق، العمر، والاستعجال — معادلة داخلية، وليست مقياس خطورة معتمدًا (مثل POSSUM أو ASA)", "riskLow": "منخفض", "riskModerate": "متوسط", "riskHigh": "مرتفع", "scenarios": "السيناريوهات التنبؤية", "scenarioOptimistic": "متفائل", "scenarioExpected": "متوقَّع", "scenarioUnfavorable": "غير مواتٍ", "remnantFunctional": "{pct}% جزء وظيفي متبقٍ", "recalculate": "↻ إعادة الحساب", "recalculated": "تمت إعادة حساب التحليل", "exportPlan": "⭳ تصدير المخطط (DICOM SR / JSON)" }, "staging": { "tnmTitle": "🔬 تصنيف TNM", "tField": "T (الورم)", "nField": "N (العقد اللمفاوية)", "mField": "M (النقائل)", "hbpParams": "🏥 معايير الكبد والمرارة والبنكرياس", "bclcField": "تصنيف BCLC", "childPughField": "تصنيف Child-Pugh", "colorectalParams": "🏥 معايير القولون والمستقيم", "crmField": "الهامش الشعاعي المحيطي (CRM)", "thoracicParams": "🫁 المعايير الصدرية", "vemsField": "الحجم الزفيري بالثانية الأولى (قبل الجراحة)", "volumetryTitle": "📊 قياس الحجم", "volumetryRealBadge": "🏥 حقيقي", "volumetryEstimateBadge": "⚠ تقدير", "organVolumeReal": "حجم العضو (تجزئة ذكاء اصطناعي حقيقية)", "organVolumeEstimate": "حجم العضو (الحجم الحالي، تقدير)", "tumorVolume": "حجم الورم المُجزَّأ", "noSegmentation": "(لا توجد تجزئة)", "computeResectability": "🔄 حساب قابلية الاستئصال", "auditLogTitle": "📋 سجل التدقيق ({count} إدخال)", "auditLogEmpty": "لم يُسجَّل أي إجراء.", "resectable": "✅ قابل للاستئصال — الجراحة مُوصى بها", "notResectable": "❌ غير قابل للاستئصال حاليًا — يجب مناقشة بديل", "exportReport": "⭳ تصدير ملخص التصنيف", "reportExported": "تم تصدير تقرير التصنيف (JSON)" }, "dicom": { "importing": "جارٍ قراءة {count} ملف(ات)…", "resampling": "إعادة أخذ العينات: {n}³ فوكسل…", "loaded": "تم تحميل {count} مقطع(مقاطع) DICOM — عجلة الفأرة=تصفح، WW={ww} WL={wl}", "reconstructing": "جارٍ إعادة البناء ثلاثي الأبعاد…", "voxelizing": "جارٍ التجسيم عند عتبة {threshold} وحدة هاونسفيلد…", "realVolumeShown": "✓ تم عرض حجم DICOM الحقيقي ثلاثي الأبعاد — عتبة {threshold} HU، {count} فوكسل ضمن {chunks} كتلة/كتل", "noVolume": "لا يوجد حجم DICOM لعرضه", "noVoxelsAboveThreshold": "لا توجد وحدات فوكسل ≥ {threshold} HU — اخفض العتبة في الشريط 🎚", "hidden": "تم إخفاء وحدات DICOM — تمت استعادة التشريح الإجرائي", "shown": "تم عرض وحدات DICOM الحقيقية", "reconstructionFailed": "فشلت إعادة البناء ثلاثي الأبعاد: {error}" }, "settings": { "title": "الإعدادات", "geminiKey": "مفتاح واجهة برمجة Gemini", "geminiModel": "نموذج Gemini", "geminiModelHint": "يشير gemini-flash-latest دائمًا إلى أحدث إصدار من Flash (يتجنب التوقف). البدائل: {alt1}، {alt2}، أو {alt3} (يُغلق بتاريخ 2026-07-22).", "groqKey": "مفتاح واجهة برمجة Groq (احتياطي)", "backendUrl": "رابط الخادم الخلفي", "surgeonName": "اسم الجرّاح", "localAiTitle": "🔒 ذكاء اصطناعي محلي (بلا اتصال أولاً — صفر شبكة، صفر تسرّب بيانات)", "localAiHint": "إذا تمت التهيئة أدناه، يُجرَّب الذكاء الاصطناعي المحلي دائمًا أولاً، قبل Gemini/Groq/الخادم الخلفي — لا يغادر الطلب أو الرد الجهاز (WebGPU) أو الشبكة المحلية (الخادم) أبدًا.", "localServer": "خادم محلي (Ollama / llama.cpp، واجهة متوافقة مع OpenAI)", "localServerModel": "اسم النموذج على الخادم المحلي", "webgpuModel": "نموذج محلي داخل المتصفح (WebGPU، WebLLM)", "webgpuChecking": "جارٍ التحقق من دعم WebGPU…", "loadModel": "⬇ تحميل النموذج", "unloadModel": "✕ إلغاء التحميل", "webgpuHint": "التحميل الأول: ~1 إلى 5 غيغابايت (يُخزَّن مؤقتًا بواسطة المتصفح عبر IndexedDB — فوري بعد ذلك). يتطلب Chrome/Edge 113+ (حاسوب أو أندرويد حديث)؛ غير متوفر حاليًا على Safari/Firefox. بعد التحميل، لا يُرسَل أي طلب شبكي لتوليد رد.", "offlineCertifiedTitle": "📚 الوضع المعتمد بلا اتصال", "offlineCertifiedHint": "يفرض إجابات محسوبة مسبقًا، حتى لو تم تهيئة مفتاح ذكاء اصطناعي. لا يوجد أي اتصال شبكي بـ Gemini/Groq." }, "patients": { "title": "قاعدة بيانات المرضى", "searchPlaceholder": "البحث عن مريض…", "editCurrent": "✎ تعديل المريض الحالي", "updated": "تم تحديث بيانات المريض (محليًا)", "syncedBackend": "تمت المزامنة مع الخادم الخلفي" }, "audit": { "title": "📜 سجل التدقيق", "filterByPatient": "تصفية حسب المريض", "filterByUser": "تصفية حسب المستخدم" }, "ai": { "chatPlaceholder": "اطرح سؤالك…", "briefingTitle": "🤖 ملخص تلقائي بالذكاء الاصطناعي", "briefingProcedure": "يُوصى بإجراء {procedure} لهذا المريض.", "briefingRemnant": "الجزء الوظيفي المتبقي المقدَّر: {pct}% (عتبة الأمان: {threshold}%)", "briefingRisk": "الخطورة الجراحية:", "briefingWatch": "⚠️ للمراقبة: {metrics}", "briefingNoIssue": "✅ لم يُكتشف أي مؤشر خارج النطاق.", "respondInLanguage": "أجب حصريًا باللغة {language}." }, "modals": { "mdrFda": { "title": "🛡️ حالة المطابقة (نموذج أولي، غير معتمد) ومسودة إملاء CCAM", "notCertifiedBanner": "⚠️ نموذج أولي غير معتمد: لم يخضع هذا البرنامج لأي اعتماد CE MDR 2017/745، ولا لأي تقديم FDA 510(k)، ولا لأي تدقيق HIPAA رسمي. تصف المعلومات أدناه الحالة الفعلية للنموذج الأولي، وليست مطابقة تم الحصول عليها.", "regulatoryStateTitle": "📋 الوضع التنظيمي الفعلي", "dictationTitle": "🗣️ مسودة إملاء CCAM (عرض توضيحي)", "dictationHint": "⚠️ مطابقة كلمات مفتاحية على نص محدَّد مسبقًا — وليس محرك تعرّف صوتي أو معالجة لغة طبيعية حقيقي. يجب التحقق منه بالكامل قبل أي استخدام:", "reportPreviewTitle": "📄 مسودة تقرير (عرض توضيحي، وليس وثيقة قانونية):" }, "respCycle": { "title": "🌊 الدورة التنفسية — معادلة حركية مبسّطة، غير معتمَدة سريريًا", "banner": "🌊 معادلة حركية توضيحية: تقريب جيبي لحركة التنفس (14 دورة/دقيقة)، غير معايَرة على هذا المريض، وغير معتمَدة سريريًا — وليست حلاّلاً حقيقيًا بالعناصر المحدودة.", "launchLive": "▶ تشغيل الدورة الحية", "pause": "⏸️ إيقاف مؤقت", "displacementTitle": "📍 الإزاحة التشريحية (معادلة، وقت حقيقي)", "respiratoryPhase": "الطور التنفسي", "craniocaudalShift": "الإزاحة القحفية الذيلية (ΔZ)", "anteroposteriorShift": "الميلان الأمامي الخلفي (ΔY)", "registrationTitle": "🛠️ التسجيل المرن غير الجاسئ — غير مُنفَّذ", "registrationHint": "⚠️ لا يوجد حلّال تسجيل مرن مُنفَّذ في هذا النموذج الأولي (انظر backend/biomechanics_engine.py، النقطة `/elastic-registration`، التي تعيد الآن بصدق \"not_implemented\" بدلاً من مؤشرات ملفَّقة).", "pneumoPressure": "ضغط الاستنشاق الصفاقي (معامل)", "registerButton": "🔄 التسجيل على الرؤية المجسّمة المعزَّزة / الموجات فوق الصوتية (غير مُنفَّذ)" } }, "i18nAdmin": { "title": "🌐 محرّر الترجمات", "hint": "تُحفظ التعديلات محليًا (في المتصفح) كطبقة تجاوز، دون تعديل الملفات المصدرية. صدّر ملف JSON لتطبيقها بشكل دائم.", "keyColumn": "المفتاح", "exportLanguage": "تصدير JSON بلغة {language}", "importLanguage": "استيراد JSON بلغة {language}", "resetOverrides": "إعادة ضبط التعديلات المحلية", "overridesSaved": "تم حفظ تعديلات الترجمة محليًا", "overridesReset": "تم مسح تعديلات الترجمة المحلية", "imported": "تم استيراد ترجمات {language} ({count} مفتاح/مفاتيح)" }, "plan": { "plannedProcedure": "الإجراء المخطط له", "metricsTitle": "مؤشرات {specialty}", "checklistTitle": "قائمة التحقق قبل الجراحة" }, "workflow": { "patient": "مريضي", "analysis": "تحليل الذكاء الاصطناعي", "simulation": "المحاكاة", "or": "غرفة العمليات" }, "pipeline": { "loadingTitle": "خط معالجة PACS ← الذكاء الاصطناعي ← التوأم ثلاثي الأبعاد قيد التنفيذ...", "realTitle": "تشريح حقيقي — توأم ثلاثي الأبعاد خاص بالمريض", "demoTitle": "وضع العرض التوضيحي — تشريح إجرائي (للتدريب فقط)", "estimateTitle": "تقدير محلي — خادم التجزئة الحقيقية غير متاح (غير سريري)" } , "wf3": { "title": "سير عمل «3 نقرات» — تحقق سريع", "step1": "١ · نظرة عامة", "step2": "٢ · تعديل", "step3": "٣ · التحقق", "step1Desc": "هياكل مستخرجة تلقائيًا عند وصول السلسلة (J-1، بدون إدخال) مع أحجام حقيقية بالمليلتر.", "step2Desc": "اسحب هامش الأمان — إعادة حساب فورية لحجم الاستئصال ونظام الحماية.", "step3Desc": "تحقق من الخطة ثم صدّر تقرير DICOM SR وPDF الخاص بالمريض.", "noBackend": "يتطلب سير العمل «3 نقرات» الخادم الخلفي (رفع DICOM / PACS). قم بتعيين عنوانه في الإعدادات ثم سجّل الدخول.", "noRuns": "لا توجد عملية مُحضّرة لهذا المريض. يمكنك تشغيل التحضير يدويًا:", "triggerPrep": "تشغيل التحضير", "preparing": "التحضير جارٍ — سيكون التوأم الرقمي جاهزًا دون أي إجراء منك.", "prepDone": "جاهز — الهياكل ومحاكاة الهامش متاحة.", "prepError": "فشل التحضير: {error}", "sourceReal": "بكسلات DICOM حقيقية", "sourceEstimate": "تقدير من البيانات الوصفية", "structuresTitle": "الهياكل المكتشفة", "roleTarget": "هدف", "roleRisk": "خطر", "volumeMl": "مل", "marginLabel": "هامش الأمان", "resectionVolume": "حجم الاستئصال المحاكى", "riskOverlap": "تداخل الخطر", "guardrailTitle": "نظام الحماية الحتمي", "guardrailOk": "مطابق للعتبات", "guardrailWarn": "تم تجاوز العتبات — راجع الهامش", "guideline": "المرجع: {g}", "flagOk": "موافق", "flagWarn": "تحذير", "validate": "التحقق من الخطة", "confirmValidate": "هل تريد التحقق من الخطة الجراحية وتثبيت الهامش؟", "validatedBy": "تم التحقق بواسطة", "validatedAt": "في", "exportSr": "تصدير DICOM SR", "srExported": "تم تصدير DICOM SR — {title}", "srUnavailable": "تصدير DICOM SR غير متاح.", "exportPdf": "تنزيل PDF", "pdfUnavailable": "تصدير PDF غير متاح (reportlab غير مثبت).", "recalcDone": "تم تحديث الهامش: {mm} مم — إعادة حساب فورية.", "recalcFailed": "تعذّرت العملية.", "patient": "المريض", "series": "السلسلة", "source": "المصدر", "trigger": "الآلية", "auto": "تلقائي", "manual": "يدوي", "run": "تشغيل", "loadFailed": "تعذّر التحميل: {msg}", "selectRun": "اختر عملية مُحضّرة:", "notReady": "قيد التحضير — سيكون الهامش قابلاً للتعديل عند الانتهاء." } }, "nl": { "meta": { "locale": "nl", "name": "Dutch", "nativeName": "Nederlands", "flag": "🇳🇱", "dir": "ltr", "intl": "nl-NL" }, "common": { "close": "Sluiten", "cancel": "Annuleren", "save": "Opslaan", "apply": "Toepassen", "export": "Exporteren", "import": "Importeren", "edit": "Bewerken", "delete": "Verwijderen", "loading": "Laden…", "search": "Zoeken…", "yes": "Ja", "no": "Nee", "warning": "Waarschuwing", "error": "Fout", "success": "Gelukt", "info": "Info", "notImplemented": "Niet geïmplementeerd in dit prototype", "notCalculated": "Nog niet berekend", "none": "Geen", "unknown": "Onbekend" }, "nav": { "workflow3": "Workflow 3 klikken", "plan": "Plan", "dicom": "DICOM", "twin": "Digitale Tweeling", "ar": "Augmented Reality", "audit": "Auditlogboek", "surgai": "SurgAI", "surgsim": "SurgSim", "surgor": "OK-AI", "surgnav": "GPS-navigatie", "surgvoice": "Assistent", "mdrFda": "Conformiteit", "researchToggle": "Onderzoeksmodus — toont experimentele modules die niet klinisch gevalideerd zijn (mijlpalen M21-M40)", "dashToggle": "OK-dashboard", "orToggle": "Operatiekamermodus (gedeeld scherm)", "touchToggle": "Aanraakmodus (vergrote knoppen)", "readonlyToggle": "Alleen-lezen modus (OK-team)", "themeToggle": "Thema", "hubToggle": "Module/specialisme wisselen", "settingsToggle": "Technische instellingen (Gemini, backend) — alleen onderzoeks-/onderhoudsmodus", "patientsToggle": "Patiënten", "exitOr": "OK-modus verlaten", "exitDash": "Dashboard verlaten", "researchBanner": "🔬 ONDERZOEKSMODUS ACTIEF — de hierboven getoonde modules zijn experimenteel (mijlpalen M21-M40), niet klinisch gevalideerd, en mogen niet worden gebruikt voor besluitvorming in de operatiekamer." }, "lang": { "selectorLabel": "Taal", "en": "English", "fr": "Français", "ar": "العربية", "nl": "Nederlands", "changed": "Taal gewijzigd naar {language}" }, "sidebar": { "ageSex": "Leeftijd / Geslacht", "weightHeight": "Gewicht / Lengte", "diagnosis": "Diagnose", "orPlanning": "OK-planning", "notScheduledToday": "Vandaag niet ingepland", "urgencyRed": "🔴 Spoedeisend", "urgencyOrange": "🟠 Semi-spoedeisend", "urgencyGreen": "🟢 Gepland", "switchModule": "Module wisselen", "room": "Zaal {n}", "statusOngoing": "Bezig", "statusDone": "Voltooid", "statusPlanned": "Gepland" }, "toolbar": { "importDicom": "DICOM importeren", "realSegmentation": "Echte AI-segmentatie", "realSegmentationTitle": "Voert een echte segmentatie-inferentie (TotalSegmentator) uit op de backend en laadt de resulterende echte 3D-meshes", "pacs": "PACS", "pacsTitle": "Zoek een onderzoek in het PACS (QIDO-RS) en importeer een serie (WADO-RS)", "threshold3d": "3D-drempelwaarde", "voxelsToggle": "Het gevoxeliseerde DICOM-orgaan tonen/verbergen in de 3D-scène", "recenter": "Centreren", "recenterTitle": "Camera opnieuw centreren op het DICOM-orgaan (toets R)", "reset": "Reset", "resetTitle": "Rotatie + zoom resetten (spatiebalk)", "spin": "Draaien", "spinTitle": "Automatische rotatie in-/uitschakelen" }, "analysis": { "sectionTitle": "Volumetrie (berekend op het huidige 3D-volume)", "organVolume": "Orgaanvolume", "resectionVolume": "Geschat resectievolume", "remnant": "Functionele rest", "realSegmentationBadge": "🏥 echte segmentatie", "proceduralBadge": "⚠ procedurele schatting, niet-klinisch", "proceduralNote": "Schatting afgeleid van het weergegeven voxelvolume, geen gevalideerde AI-segmentatie. Gebruik “🔬 Echte AI-segmentatie” voor een berekening op basis van TotalSegmentator.", "riskScoreTitle": "Operatief risicoscore", "riskScoreBadge": "⚠ interne heuristiek, niet klinisch gevalideerd", "riskScoreBasedOn": "gebaseerd op {count} afwijkende meetwaarde(n), leeftijd, spoedeisendheid — interne formule, geen gevalideerde risicoschaal (bijv. POSSUM, ASA)", "riskLow": "Laag", "riskModerate": "Matig", "riskHigh": "Hoog", "scenarios": "Voorspellende scenario's", "scenarioOptimistic": "Optimistisch", "scenarioExpected": "Verwacht", "scenarioUnfavorable": "Ongunstig", "remnantFunctional": "{pct}% functionele rest", "recalculate": "↻ Herberekenen", "recalculated": "Analyse herberekend", "exportPlan": "⭳ Plan exporteren (DICOM SR / JSON)" }, "staging": { "tnmTitle": "🔬 TNM-stadiëring", "tField": "T (Tumor)", "nField": "N (Lymfeklieren)", "mField": "M (Metastasen)", "hbpParams": "🏥 HPB-parameters", "bclcField": "BCLC", "childPughField": "Child-Pugh", "colorectalParams": "🏥 Colorectale parameters", "crmField": "CRM", "thoracicParams": "🫁 Thoracale parameters", "vemsField": "Preoperatief FEV1", "volumetryTitle": "📊 Volumetrie", "volumetryRealBadge": "🏥 echt", "volumetryEstimateBadge": "⚠ schatting", "organVolumeReal": "Orgaanvolume (echte AI-segmentatie)", "organVolumeEstimate": "Orgaanvolume (huidig volume, schatting)", "tumorVolume": "Gesegmenteerd tumorvolume", "noSegmentation": "(geen segmentatie)", "computeResectability": "🔄 Resectabiliteit berekenen", "auditLogTitle": "📋 Auditlogboek ({count} item{count, plural, one {} other {s}})", "auditLogEmpty": "Geen actie geregistreerd.", "resectable": "✅ Resectabel — Operatie geïndiceerd", "notResectable": "❌ Momenteel niet resectabel — Alternatief bespreken", "exportReport": "⭳ Stadiëringsoverzicht exporteren", "reportExported": "Stadiëringsrapport geëxporteerd (JSON)" }, "dicom": { "importing": "{count} bestand(en) lezen…", "resampling": "Resamplen van {n}³ voxels…", "loaded": "{count} DICOM-slice(s) geladen — Scrollen=navigeren, WW={ww} WL={wl}", "reconstructing": "3D-reconstructie…", "voxelizing": "Voxeliseren bij drempelwaarde {threshold} HU…", "realVolumeShown": "✓ Echt DICOM-volume in 3D weergegeven — drempelwaarde {threshold} HU, {count} voxel(s) in {chunks} chunk(s)", "noVolume": "Geen DICOM-volume om weer te geven", "noVoxelsAboveThreshold": "Geen voxel ≥ {threshold} HU — verlaag de drempelwaarde in de 🎚-balk", "hidden": "DICOM-voxels verborgen — procedurele anatomie hersteld", "shown": "Echte DICOM-voxels weergegeven", "reconstructionFailed": "3D-reconstructie mislukt: {error}" }, "settings": { "title": "Instellingen", "geminiKey": "Gemini API-sleutel", "geminiModel": "Gemini-model", "geminiModelHint": "gemini-flash-latest verwijst altijd naar de nieuwste Flash-release (voorkomt deprecaties). Alternatieven: {alt1}, {alt2}, of {alt3} (sluit op 22-07-2026).", "groqKey": "Groq API-sleutel (fallback)", "backendUrl": "Backend-URL", "surgeonName": "Naam chirurg", "localAiTitle": "🔒 Lokale AI (offline-first — geen netwerk, geen datalek)", "localAiHint": "Indien hieronder geconfigureerd, wordt de lokale AI ALTIJD als eerste geprobeerd, vóór Gemini/Groq/backend — de prompt en het antwoord verlaten nooit het apparaat (WebGPU) of het lokale netwerk (server).", "localServer": "Lokale server (Ollama / llama.cpp, OpenAI-compatibele API)", "localServerModel": "Modelnaam op de lokale server", "webgpuModel": "Lokaal model in de browser (WebGPU, WebLLM)", "webgpuChecking": "WebGPU-ondersteuning controleren…", "loadModel": "⬇ Model laden", "unloadModel": "✕ Verwijderen uit geheugen", "webgpuHint": "Eerste keer laden: ~1-5 GB download (gecachet door de browser via IndexedDB — daarna direct). Vereist Chrome/Edge 113+ (desktop of recente Android); nog niet beschikbaar op Safari/Firefox. Eenmaal geladen wordt er geen netwerkverzoek meer gedaan om een antwoord te genereren.", "offlineCertifiedTitle": "📚 Gecertificeerde offlinemodus", "offlineCertifiedHint": "Forceert vooraf berekende antwoorden, ook als er een AI-sleutel is geconfigureerd. Geen netwerkoproep naar Gemini/Groq." }, "patients": { "title": "Patiëntendatabase", "searchPlaceholder": "Zoek een patiënt…", "editCurrent": "✎ Huidige patiënt bewerken", "updated": "Patiënt bijgewerkt (lokaal)", "syncedBackend": "Gesynchroniseerd met backend" }, "audit": { "title": "📜 Auditlogboek", "filterByPatient": "Filteren op patiënt", "filterByUser": "Filteren op gebruiker" }, "ai": { "chatPlaceholder": "Stel uw vraag…", "briefingTitle": "🤖 Automatische AI-samenvatting", "briefingProcedure": "{procedure} aanbevolen voor deze patiënt.", "briefingRemnant": "Geschatte functionele rest: {pct}% (veiligheidsdrempel: {threshold}%)", "briefingRisk": "Operatief risico:", "briefingWatch": "⚠️ Aandachtspunten: {metrics}", "briefingNoIssue": "✅ Geen afwijkende meetwaarde gedetecteerd.", "respondInLanguage": "Antwoord uitsluitend in het {language}." }, "modals": { "mdrFda": { "title": "🛡️ Conformiteitsstatus (prototype, niet gecertificeerd) & concept CCAM-dictaat", "notCertifiedBanner": "⚠️ Niet-gecertificeerd prototype: deze software heeft GEEN CE MDR 2017/745-certificering, GEEN FDA 510(k)-indiening en GEEN formele HIPAA-audit ondergaan. Onderstaande informatie beschrijft de werkelijke status van het prototype, geen behaalde conformiteit.", "regulatoryStateTitle": "📋 Werkelijke regelgevingsstatus", "dictationTitle": "🗣️ Concept CCAM-dictaat (demonstratie)", "dictationHint": "⚠️ Trefwoordherkenning op een vooraf gedefinieerde tekst — GEEN echte spraakherkenning of NLP-engine. Volledig te valideren vóór elk gebruik:", "reportPreviewTitle": "📄 Conceptrapport (demonstratie, geen juridisch document):" }, "respCycle": { "title": "🌊 Ademhalingscyclus — vereenvoudigde kinematische formule, niet klinisch gevalideerd", "banner": "🌊 Illustratieve kinematische formule: sinusvormige benadering van de ademhalingsbeweging (14 cycli/min), niet gekalibreerd op deze patiënt, niet klinisch gevalideerd — geen echte eindige-elementenoplosser.", "launchLive": "▶ Live cyclus starten", "pause": "⏸️ Pauzeren", "displacementTitle": "📍 Anatomische verplaatsing (formule, realtime)", "respiratoryPhase": "Ademhalingsfase", "craniocaudalShift": "Craniocaudale verplaatsing (ΔZ)", "anteroposteriorShift": "Anteroposterieure kanteling (ΔY)", "registrationTitle": "🛠️ Niet-rigide registratie — niet geïmplementeerd", "registrationHint": "⚠️ Er is geen elastische registratie-oplosser geïmplementeerd in dit prototype (zie backend/biomechanics_engine.py `/elastic-registration`, dat nu eerlijk \"not_implemented\" teruggeeft in plaats van verzonnen waarden).", "pneumoPressure": "Pneumoperitoneumdruk (parameter)", "registerButton": "🔄 Registreren op AR-stereovisie / echografie (niet geïmplementeerd)" } }, "i18nAdmin": { "title": "🌐 Vertaaleditor", "hint": "Wijzigingen worden lokaal (browser) opgeslagen als overschrijvingslaag, zonder de bronbestanden te wijzigen. Exporteer de JSON om ze permanent toe te passen.", "keyColumn": "Sleutel", "exportLanguage": "{language}-JSON exporteren", "importLanguage": "{language}-JSON importeren", "resetOverrides": "Lokale wijzigingen resetten", "overridesSaved": "Vertaalwijzigingen lokaal opgeslagen", "overridesReset": "Lokale vertaalwijzigingen gewist", "imported": "{language}-vertalingen geïmporteerd ({count} sleutel(s))" }, "plan": { "plannedProcedure": "Geplande procedure", "metricsTitle": "{specialty}-metingen", "checklistTitle": "Preoperatieve checklist" }, "workflow": { "patient": "Mijn patiënt", "analysis": "AI-analyse", "simulation": "Simulatie", "or": "OK" }, "pipeline": { "loadingTitle": "PACS → AI → 3D-tweeling pipeline bezig...", "realTitle": "ECHTE ANATOMIE — Patiëntspecifieke 3D-tweeling", "demoTitle": "DEMOMODUS — Procedurele anatomie (alleen training)", "estimateTitle": "LOKALE SCHATTING — Backend voor echte segmentatie niet beschikbaar (niet-klinisch)" }, "wf3": { "title": "Workflow «3 klikken» — Snelle validatie", "step1": "1 · Overzicht", "step2": "2 · Aanpassen", "step3": "3 · Validatie", "step1Desc": "Structuren automatisch geëxtraheerd bij aankomst van de reeks (J-1, nul invoer) met echte volumes in ml.", "step2Desc": "Sleep de veiligheidsmarge — onmiddellijke herberekening van het resectievolume en de waarborg.", "step3Desc": "Valideer het plan en exporteer het DICOM SR-rapport en de PDF van de patiënt.", "noBackend": "De «3 klikken»-workflow vereist de backend (DICOM-upload / PACS). Configureer de URL in Instellingen en log in.", "noRuns": "Geen voorbereide run voor deze patiënt. Start handmatig een voorbereiding:", "triggerPrep": "Voorbereiding starten", "preparing": "Bezig met voorbereiden — de digitale tweeling is klaar zonder actie van u.", "prepDone": "Klaar — structuren en margesimulatie beschikbaar.", "prepError": "Voorbereiding mislukt: {error}", "sourceReal": "Echte DICOM-voxels", "sourceEstimate": "Schatting op basis van metadata", "structuresTitle": "Gedetecteerde structuren", "roleTarget": "Doelwit", "roleRisk": "Risico", "volumeMl": "ml", "marginLabel": "Veiligheidsmarge", "resectionVolume": "Gesimuleerd resectievolume", "riskOverlap": "Risico-overlap", "guardrailTitle": "Deterministische waarborg", "guardrailOk": "Voldoet aan drempels", "guardrailWarn": "Drempel(s) overschreden — pas de marge aan", "guideline": "Referentie: {g}", "flagOk": "OK", "flagWarn": "Waarschuwing", "validate": "Plan valideren", "confirmValidate": "Het chirurgisch plan valideren en de marge vastleggen?", "validatedBy": "Gevalideerd door", "validatedAt": "op", "exportSr": "DICOM SR exporteren", "srExported": "DICOM SR geëxporteerd — {title}", "srUnavailable": "DICOM SR-export niet beschikbaar.", "exportPdf": "PDF downloaden", "pdfUnavailable": "PDF-export niet beschikbaar (reportlab niet geïnstalleerd).", "recalcDone": "Marge bijgewerkt: {mm} mm — onmiddellijke herberekening.", "recalcFailed": "Bewerking mislukt.", "patient": "Patiënt", "series": "Reeks", "source": "Bron", "trigger": "Trigger", "auto": "automatisch", "manual": "handmatig", "run": "Run", "loadFailed": "Laden mislukt: {msg}", "selectRun": "Kies een voorbereide run:", "notReady": "Wordt voorbereid — de marge is aanpasbaar zodra klaar." } } };

          const I18N = (function () {
            const SUPPORTED = ['en', 'fr', 'ar', 'nl'];
            const FALLBACK_LOCALE = 'en';
            const STORAGE_LANG_KEY = 'gsp_lang';
            const STORAGE_OVERRIDES_KEY = 'gsp_i18n_overrides';

            let locale = FALLBACK_LOCALE;
            const dictCache = {};          // locale -> dictionnaire charge (fetch ou repli embarque)
            const missing = new Set();     // cles manquantes detectees (aide au suivi/extension)
            let overridesCache = null;     // cache memoire de la couche de surcharge (editeur de traductions)

            function getNested(obj, path) {
              return path.split('.').reduce((o, k) => (o && typeof o === 'object') ? o[k] : undefined, obj);
            }

            function getOverrides() {
              if (overridesCache === null) {
                try { overridesCache = JSON.parse(localStorage.getItem(STORAGE_OVERRIDES_KEY) || '{}'); }
                catch (e) { overridesCache = {}; }
              }
              return overridesCache;
            }
            function saveOverrides(ov) {
              overridesCache = ov;
              try { localStorage.setItem(STORAGE_OVERRIDES_KEY, JSON.stringify(ov)); } catch (e) { }
            }

            // Charge un dictionnaire : fetch(i18n/{locale}.json) si servi via http(s), sinon repli sur
            // la copie embarquee (I18N_EMBEDDED) -- garantit que l'app reste multilingue meme en
            // double-clic (file://).
            async function loadDict(loc) {
              if (dictCache[loc]) return dictCache[loc];
              let dict = null;
              try {
                const resp = await fetch(`i18n/${loc}.json`, { cache: 'no-store' });
                if (resp.ok) dict = await resp.json();
              } catch (e) { /* file:// ou hors-ligne : repli embarque ci-dessous */ }
              if (!dict) dict = I18N_EMBEDDED[loc] || I18N_EMBEDDED[FALLBACK_LOCALE];
              dictCache[loc] = dict;
              return dict;
            }

            // Sous-ensemble ICU pratique et sans dependance externe (coherent avec resilience.py,
            // "pas de dependance externe pour un logiciel medical, code auditable") : interpolation
            // {name} et pluriel {count, plural, one {..} other {..}}. Ne couvre pas la norme ICU
            // complete (ordinaux, select imbriques, skeletons de date) -- non necessaire ici.
            function formatICU(template, params) {
              if (typeof template !== 'string') return template;
              let out = template.replace(/\{(\w+),\s*plural,\s*one\s*\{([^{}]*)\}\s*other\s*\{([^{}]*)\}\}/g,
                (_, varName, one, other) => {
                  const n = Number(params && params[varName]);
                  return (Number.isFinite(n) && Math.abs(n) === 1) ? one : other;
                });
              out = out.replace(/\{(\w+)\}/g, (m, key) => {
                if (params && Object.prototype.hasOwnProperty.call(params, key)) return params[key];
                return m;
              });
              return out;
            }

            function t(key, params) {
              const dict = dictCache[locale] || I18N_EMBEDDED[locale];
              let val = dict ? getNested(dict, key) : undefined;
              const overrides = getOverrides();
              if (overrides[locale] && Object.prototype.hasOwnProperty.call(overrides[locale], key)) {
                val = overrides[locale][key];
              }
              if (val === undefined) {
                const fb = dictCache[FALLBACK_LOCALE] || I18N_EMBEDDED[FALLBACK_LOCALE];
                val = fb ? getNested(fb, key) : undefined;
                if (val === undefined) {
                  missing.add(key);
                  console.warn(`[I18N] Cle de traduction manquante : "${key}"`);
                  return key;
                }
              }
              return formatICU(val, params);
            }

            function applyTranslations(root) {
              root = root || document;
              root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
              root.querySelectorAll('[data-i18n-title]').forEach(el => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
              root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
            }

            function detectBrowserLocale() {
              const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
              if (nav.startsWith('fr')) return 'fr';
              if (nav.startsWith('ar')) return 'ar';
              if (nav.startsWith('nl')) return 'nl';
              return 'en';
            }

            function languageName(loc) {
              const dict = dictCache[loc || locale] || I18N_EMBEDDED[loc || locale];
              return (dict && dict.meta && dict.meta.nativeName) || 'English';
            }

            function formatDate(date, opts) {
              const dict = dictCache[locale] || I18N_EMBEDDED[locale];
              const intlLocale = (dict && dict.meta && dict.meta.intl) || 'en-US';
              try { return new Intl.DateTimeFormat(intlLocale, opts).format(date); }
              catch (e) { return date.toLocaleString(); }
            }
            function formatNumber(n, opts) {
              const dict = dictCache[locale] || I18N_EMBEDDED[locale];
              const intlLocale = (dict && dict.meta && dict.meta.intl) || 'en-US';
              try { return new Intl.NumberFormat(intlLocale, opts).format(n); }
              catch (e) { return String(n); }
            }

            // IMPORTANT securite clinique RTL : cette fonction ne touche QUE lang/dir sur <html> (chrome
            // UI). Aucune regle ne doit jamais inverser le viewport 3D ou les canvases MPR -- voir le
            // bloc CSS html[dir="rtl"] en fin de <style>, qui exclut explicitement #viewport-wrap et
            // .mpr-canvas. L'orientation d'une image medicale ne doit jamais dependre de la langue.
            async function setLocale(loc, opts) {
              opts = opts || {};
              if (SUPPORTED.indexOf(loc) === -1) loc = FALLBACK_LOCALE;
              await loadDict(loc);
              if (!dictCache[FALLBACK_LOCALE]) await loadDict(FALLBACK_LOCALE);
              locale = loc;
              const dict = dictCache[loc];
              const dir = (dict && dict.meta && dict.meta.dir) || 'ltr';
              document.documentElement.setAttribute('lang', loc);
              document.documentElement.setAttribute('dir', dir);
              document.body.classList.toggle('i18n-rtl', dir === 'rtl');
              try { localStorage.setItem(STORAGE_LANG_KEY, loc); } catch (e) { }
              applyTranslations(document);
              if (!opts.silent && typeof window !== 'undefined' && typeof window.onI18nLocaleChanged === 'function') window.onI18nLocaleChanged(loc);
            }

            function currentLocale() { return locale; }
            function currentIntl() {
              const dict = dictCache[locale] || I18N_EMBEDDED[locale];
              return (dict && dict.meta && dict.meta.intl) || 'en-US';
            }
            function reportMissing() { return Array.from(missing); }

            function flattenObj(obj, prefix) {
              const out = {};
              Object.keys(obj).forEach(k => {
                const full = prefix ? `${prefix}.${k}` : k;
                if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) Object.assign(out, flattenObj(obj[k], full));
                else out[full] = obj[k];
              });
              return out;
            }

            return {
              SUPPORTED, t, setLocale, currentLocale, currentIntl, detectBrowserLocale, applyTranslations,
              languageName, formatDate, formatNumber, reportMissing, getOverrides,
              setOverride(loc, key, value) {
                const ov = getOverrides();
                ov[loc] = ov[loc] || {};
                ov[loc][key] = value;
                saveOverrides(ov);
              },
              clearOverrides() { saveOverrides({}); },
              async exportLocale(loc) {
                await loadDict(loc);
                const base = JSON.parse(JSON.stringify(dictCache[loc] || {}));
                const ov = getOverrides()[loc] || {};
                Object.keys(ov).forEach(k => {
                  const parts = k.split('.'); let node = base;
                  for (let i = 0; i < parts.length - 1; i++) { node[parts[i]] = node[parts[i]] || {}; node = node[parts[i]]; }
                  node[parts[parts.length - 1]] = ov[k];
                });
                return base;
              },
              importLocale(loc, nested) {
                const flat = flattenObj(nested, '');
                const ov = getOverrides();
                ov[loc] = Object.assign({}, ov[loc] || {}, flat);
                saveOverrides(ov);
                return Object.keys(flat).length;
              }
            };
          })();

          const MODULES = {
            cataracte: {
              id: 'cataracte', name: 'Chirurgie de la Cataracte', short: 'Cataracte', icon: '👁️',
              color: '#4fc3f7', colorRgb: '79,195,247',
              desc: 'Planification de phacoémulsification avec implant de lentille intraoculaire, biométrie et calcul de puissance.',
              procedures: ['Phacoémulsification + LIO', 'Extraction extracapsulaire (EEC)', 'Chirurgie combinée cataracte-glaucome', 'Implantation secondaire de LIO', 'Capsulotomie postérieure au laser YAG'],
              metrics: [
                { key: 'LA', label: 'Longueur axiale', val: '23.5 mm', st: 'ok' },
                { key: 'Kmoy', label: 'Kératométrie moyenne', val: '43.75 D', st: 'ok' },
                { key: 'LIO', label: 'Puissance LIO (SRK/T)', val: '21.5 D', st: 'ok' },
                { key: 'LOCS', label: 'Grade nucléaire (LOCS III)', val: 'N4 (dense)', st: 'warn' }
              ],
              structures: [
                { name: 'Segment antérieur', open: true, children: ['Cornée', 'Chambre antérieure', 'Iris', 'Angle irido-cornéen'] },
                { name: 'Cristallin', open: true, children: ['Capsule antérieure', 'Cortex', 'Noyau', 'Capsule postérieure', 'Zonule de Zinn'] },
                { name: 'Vaisseaux / Nerfs', open: false, children: ['Artère centrale de la rétine', 'Nerf optique'] },
                { name: 'Structures adjacentes', open: false, children: ['Conjonctive', 'Corps ciliaire', 'Vitré antérieur'] }
              ],
              implants: [
                { name: 'LIO monofocale acrylique', ref: 'MONO-21.5D', tags: ['implant', 'chambre post.'], sel: true },
                { name: 'LIO torique', ref: 'TOR-2.5D', tags: ['astigmatisme'], sel: false },
                { name: 'Anneau de tension capsulaire', ref: 'CTR-12mm', tags: ['stabilisation', 'zonule'], sel: false }
              ],
              checklist: [
                { done: true, text: '<strong>Biométrie IOL-Master</strong> — Longueur axiale, kératométrie' },
                { done: true, text: '<strong>Formule de calcul LIO</strong> (SRK/T, Barrett Universal II)' },
                { done: true, text: '<strong>Comptage cellulaire endothélial</strong> — Réserve cornéenne' },
                { done: false, text: '<strong>Fond d\'œil dilaté</strong> — Éliminer pathologie rétinienne associée' },
                { done: false, text: '<strong>Arrêt anticoagulants</strong> — Selon protocole si chirurgie combinée' }
              ],
              patient: { id: '40521-CAT', nom: 'Haddad, Leïla', age: 74, sexe: 'F', poids: 64, taille: 160, diag: 'Cataracte corticonucléaire OD stade N4', urg: 'vert' },
              aiChips: ['Quelle puissance de LIO ?', 'Risque de rupture capsulaire ?', 'LIO torique nécessaire ?', 'Délai avant chirurgie du 2e œil ?'],
              hubProcs: ['Phacoémulsification', 'LIO torique', 'Chirurgie combinée', 'YAG capsulotomie']
            },
            glaucome: {
              id: 'glaucome', name: 'Chirurgie du Glaucome', short: 'Glaucome', icon: '💧',
              color: '#22c55e', colorRgb: '34,197,94',
              desc: 'Planification de chirurgie filtrante et de dispositifs de drainage avec évaluation de la pression intraoculaire et du champ visuel.',
              procedures: ['Trabéculectomie', 'Sclérectomie profonde non perforante', 'Implant de drainage (Ahmed/Baerveldt)', 'Trabéculoplastie sélective au laser (SLT)', 'Chirurgie MIGS (iStent, Xen)'],
              metrics: [
                { key: 'PIO', label: 'PIO actuelle', val: '28 mmHg', st: 'warn' },
                { key: 'CDR', label: 'Rapport cup/disc (C/D)', val: '0.8', st: 'warn' },
                { key: 'RNFL', label: 'Épaisseur RNFL moyenne (OCT)', val: '62 µm', st: 'warn' },
                { key: 'PACHY', label: 'Pachymétrie cornéenne centrale', val: '540 µm', st: 'ok' }
              ],
              structures: [
                { name: 'Angle irido-cornéen', open: true, children: ['Trabéculum', 'Canal de Schlemm', 'Éperon scléral', 'Ligne de Schwalbe'] },
                { name: 'Nerf optique', open: true, children: ['Excavation papillaire', 'Anneau neuro-rétinien', 'Fibres nerveuses péripapillaires'] },
                { name: 'Voies d\'écoulement', open: false, children: ['Veines épisclérales', 'Espace supra-choroïdien', 'Voie uvéo-sclérale'] },
                { name: 'Conjonctive / Sclère', open: false, children: ['Zone de filtration (bulle)', 'Capsule de Tenon', 'Sclérotomie postérieure'] }
              ],
              implants: [
                { name: 'Valve d\'Ahmed FP7', ref: 'AHM-FP7', tags: ['drainage', 'glaucome réfractaire'], sel: true },
                { name: 'Implant Baerveldt 350', ref: 'BVD-350', tags: ['drainage', 'grande surface'], sel: false },
                { name: 'Stent trabéculaire iStent inject', ref: 'IST-INJ-W', tags: ['MIGS', 'angle'], sel: false }
              ],
              checklist: [
                { done: true, text: '<strong>Champ visuel Humphrey 24-2</strong> — Déficit (MD, PSD)' },
                { done: true, text: '<strong>OCT papillaire (RNFL)</strong> — Épaisseur fibres nerveuses' },
                { done: true, text: '<strong>Pachymétrie + Gonioscopie</strong> — Épaisseur cornéenne, ouverture angle' },
                { done: false, text: '<strong>PIO cible individualisée</strong> — Selon stade et progression' },
                { done: false, text: '<strong>Arrêt antiagrégants/anticoagulants</strong> — Selon protocole' }
              ],
              patient: { id: '52918-GLA', nom: 'Belaïd, Omar', age: 68, sexe: 'M', poids: 80, taille: 176, diag: 'Glaucome primitif à angle ouvert avancé OG', urg: 'orange' },
              aiChips: ['PIO cible recommandée ?', 'Trabéculectomie ou implant de drainage ?', 'Risque de bulle de filtration ?', 'Suivi post-opératoire du champ visuel ?'],
              hubProcs: ['Trabéculectomie', 'Implant Ahmed/Baerveldt', 'SLT', 'MIGS']
            },
            retine: {
              id: 'retine', name: 'Chirurgie Vitréo-Rétinienne', short: 'Rétine', icon: '🔴',
              color: '#ef4444', colorRgb: '239,68,68',
              desc: 'Planification de vitrectomie pour décollement de rétine, membrane épirétinienne et pathologies maculaires.',
              procedures: ['Vitrectomie 25G/27G', 'Cerclage scléral', 'Rétinopexie pneumatique', 'Pelage de membrane épirétinienne', 'Chirurgie du trou maculaire'],
              metrics: [
                { key: 'EMC', label: 'Épaisseur maculaire centrale (OCT)', val: '410 µm', st: 'warn' },
                { key: 'DR', label: 'Extension du décollement', val: '2 quadrants', st: 'warn' },
                { key: 'PVR', label: 'Stade PVR', val: 'B', st: 'ok' },
                { key: 'AV', label: 'Acuité visuelle (LogMAR)', val: '0.8', st: 'warn' }
              ],
              structures: [
                { name: 'Vitré', open: true, children: ['Cortex vitréen postérieur', 'Base du vitré', 'Hyaloïde postérieure'] },
                { name: 'Rétine', open: true, children: ['Macula', 'Fovéa', 'Rétine périphérique', 'Ora serrata'] },
                { name: 'Vaisseaux rétiniens', open: false, children: ['Artère centrale de la rétine', 'Veine centrale de la rétine', 'Arcades temporales'] },
                { name: 'Déchirures / Trous', open: true, children: ['Déchirure temporale sup.', 'Trou maculaire', 'Zone de traction vitréo-maculaire'] }
              ],
              implants: [
                { name: 'Tamponnement gaz SF6', ref: 'GAS-SF6-20', tags: ['tamponnement', 'expansif'], sel: true },
                { name: 'Huile de silicone 1000cSt', ref: 'SIL-1000', tags: ['tamponnement', 'longue durée'], sel: false },
                { name: 'Bandelette de cerclage 2.5mm', ref: 'BND-SCL-25', tags: ['cerclage', 'scléral'], sel: false }
              ],
              checklist: [
                { done: true, text: '<strong>OCT maculaire</strong> — Statut fovéolaire (on/off)' },
                { done: true, text: '<strong>Schéma rétinien</strong> — Localisation horaire des déchirures' },
                { done: true, text: '<strong>Échographie en mode B</strong> — Si trouble des milieux' },
                { done: false, text: '<strong>Choix du tamponnement</strong> — Gaz vs huile de silicone' },
                { done: false, text: '<strong>Positionnement post-opératoire</strong> — Consignes selon la localisation' }
              ],
              patient: { id: '61147-RET', nom: 'Cissé, Fatou', age: 57, sexe: 'F', poids: 69, taille: 165, diag: 'Décollement de rétine rhegmatogène OD, macula off', urg: 'rouge' },
              aiChips: ['Statut maculaire on ou off ?', 'Choix du tamponnement ?', 'Risque de PVR post-opératoire ?', 'Délai chirurgical recommandé ?'],
              hubProcs: ['Vitrectomie', 'Cerclage scléral', 'Rétinopexie pneumatique', 'Pelage membrane']
            }
          };

          // ════════════════════════════════════════════════
          //  AUTO-CONFIGURATION PRODUCTION
          //  Pour un déploiement en production, ne montrez jamais la clé Gemini ni
          //  l'URL du backend au chirurgien. Injectez window.APP_CONFIG dans une
          //  balise script séparée, chargée AVANT ce fichier, avec par exemple :
          //    window.APP_CONFIG = {
          //      apiBase: 'https://backend.hopital.local/api',
          //      geminiKey: '', // laisser vide si le backend proxy Gemini
          //      chirurgien: 'Dr. Hadj'
          //    };
          //  Ces valeurs deviennent les réglages par défaut et le bouton ⚙ reste
          //  masqué (voir .admin-only) tant que le Mode Recherche n'est pas activé.
          // ════════════════════════════════════════════════
          const APP_CONFIG = (typeof window !== 'undefined' && window.APP_CONFIG) || {};

          // ════════════════════════════════════════════════
          //  STATE
          // ════════════════════════════════════════════════
          const state = {
            mod: null,
            light: false,
            or: false,
            researchMode: false,
            workflowStep: 0,
            dashboard: false,
            touchMode: false,
            readOnly: false,
            gemini: false,
            tab: 'plan',
            viewMode: '3d',
            timerRunning: true,
            timerSec: 0,
            timerInterval: null,
            settings: {
              geminiKey: APP_CONFIG.geminiKey || '',
              geminiModel: APP_CONFIG.geminiModel || 'gemini-flash-latest',
              groqKey: APP_CONFIG.groqKey || '',
              apiBase: APP_CONFIG.apiBase || '',
              localServerUrl: APP_CONFIG.localServerUrl || '',
              localServerModel: APP_CONFIG.localServerModel || 'llama3',
              chirurgien: APP_CONFIG.chirurgien || 'Dr. Hadj',
              offlineCertified: APP_CONFIG.offlineCertified || false
            },
            localEngine: null,      // instance MLCEngine (WebLLM) une fois chargée, sinon null
            localEngineModel: null, // id du modèle actuellement chargé en WebGPU
            // Authentification backend réelle (POST /auth/token) — remplace l'ancien
            // état `backendToken` unique par {token, username, expiresAt}, nécessaire
            // pour savoir QUI est connecté (affiché dans ⚙ Paramètres) et QUAND le
            // jeton expire (pour redéclencher l'écran de connexion sans attendre un
            // 401 serveur). Persisté en sessionStorage (pas localStorage : un jeton
            // JWT ne doit pas survivre à la fermeture de l'onglet sur un poste
            // partagé) — voir loadStoredAuth()/persistAuth() dans app-part3.js.
            auth: { token: null, username: null, expiresAt: null },
            // Biométrie saisie manuellement par patient (module Cataracte) pour le calcul
            // réel de puissance de LIO — voir srkIIPower()/computeIOLResult() dans
            // app-part3.js. Clé = mod.patient.id. Distinct des `metrics` figées de démo
            // dans MODULES : ceci est une vraie entrée utilisateur, jamais pré-remplie.
            biometryByPatient: {},
            aiBusy: false,
            mpr: {
              plane: { axial: 0, coronal: 0, sagittal: 0 },
              max: { axial: 63, coronal: 63, sagittal: 63 },
              ww: 400, wl: 40,
              dragging: null,
              dragStartY: 0, dragStartX: 0,
              volume: null,      // Float32Array 64^3, procedural or real
              volSize: 64,
              fromDicom: false,
              spacing: { x: 1, y: 1, z: 1 } // mm
            },
            patients: {},        // local cache of patients created/edited this session
            live: {
              history: [],        // [{role:'user'|'model', text}] — real multi-turn memory for Gemini Live
              voiceOn: false,
              listening: false,
              speaking: false,
              processingTurn: false,
              errorStreak: 0,
              stream: null,
              currentRecorder: null,
              recordingCancelled: false,
              pendingUtterances: 0,
              streamDone: false
            }
          };

          // ════════════════════════════════════════════════
          //  THREE.JS — 3D Viewport
          // ════════════════════════════════════════════════
          let scene, camera, renderer, organMesh, wireframeMesh, vesselGroup, clipPlane;
          let organParts = [];        // { mesh, name, kind } for the current module's anatomy
          let mouseDown = false, mouseX = 0, mouseY = 0, rotX = 0, rotY = 0;
          let instrumentRaycaster = null;
          let instrDragState = { active: false, instrIdx: -1, startMouse: null, startPos: null, plane: null };

          function initViewport() {
            const canvas = document.getElementById('gl-canvas');
            const wrap = document.getElementById('viewport-wrap');
            const w = wrap.clientWidth, h = wrap.clientHeight;

            renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
            renderer.setSize(w, h); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setClearColor(0x080c10);

            scene = new THREE.Scene();
            camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
            camera.position.set(0, 0, 5);

            const amb = new THREE.AmbientLight(0xffffff, 0.3);
            scene.add(amb);
            const p1 = new THREE.PointLight(0x4fc3f7, 1.2, 20); p1.position.set(3, 3, 3); scene.add(p1);
            const p2 = new THREE.PointLight(0xff6b35, 0.6, 20); p2.position.set(-3, -2, 4); scene.add(p2);

            buildOrgan();

            // Init du raycaster pour la sélection et le drag des instruments
            instrumentRaycaster = new THREE.Raycaster();

            canvas.addEventListener('mousedown', e => {
              if (twin.active && twin.deformMode) { twinGrabStart(e); return; }

              // — Clic sur un instrument : sélection par raycaster —
              const instrMeshes = instrumentManager.placedInstruments.map(p => p.mesh);
              if (instrMeshes.length > 0 && instrumentRaycaster) {
                const rect = renderer.domElement.getBoundingClientRect();
                const ndc = new THREE.Vector2(
                  ((e.clientX - rect.left) / rect.width) * 2 - 1,
                  -((e.clientY - rect.top) / rect.height) * 2 + 1
                );
                instrumentRaycaster.setFromCamera(ndc, camera);
                // On teste les enfants des groupes aussi
                const allChildren = [];
                instrMeshes.forEach(m => m.traverse(o => { if (o.isMesh) allChildren.push(o); }));
                const hits = instrumentRaycaster.intersectObjects(allChildren, true);
                if (hits.length > 0) {
                  // Remonter jusqu'à trouver quel groupe racine a été touché
                  let hitObj = hits[0].object;
                  let rootMesh = null;
                  while (hitObj) {
                    const found = instrumentManager.placedInstruments.findIndex(p => p.mesh === hitObj);
                    if (found >= 0) { rootMesh = found; break; }
                    hitObj = hitObj.parent;
                  }
                  if (rootMesh >= 0) {
                    instrumentManager.select(rootMesh);
                    // Débuter le drag
                    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
                    dragPlane.normal.copy(camera.getWorldDirection(new THREE.Vector3())).negate();
                    instrDragState = {
                      active: true, instrIdx: rootMesh, startMouse: { x: e.clientX, y: e.clientY },
                      startPos: instrumentManager.placedInstruments[rootMesh].mesh.position.clone(), plane: dragPlane
                    };
                    // Ouvrir le panneau si fermé
                    const panel = document.getElementById('instrument-panel');
                    if (panel && panel.style.display === 'none') toggleInstrumentPanel();
                    return; // Ne pas déclencher la rotation de la scène
                  }
                }
              }
              mouseDown = true; mouseX = e.clientX; mouseY = e.clientY;
            });
            canvas.addEventListener('mousemove', e => {
              if (twin.active && twin.deformMode) { twinGrabMove(e); return; }
              // Drag d'un instrument sélectionné
              if (instrDragState.active && instrDragState.instrIdx >= 0) {
                const entry = instrumentManager.placedInstruments[instrDragState.instrIdx];
                if (entry) {
                  const dx = (e.clientX - instrDragState.startMouse.x) * 0.005;
                  const dy = -(e.clientY - instrDragState.startMouse.y) * 0.005;
                  entry.mesh.position.x = instrDragState.startPos.x + dx * camera.position.z * 0.5;
                  const newY = instrDragState.startPos.y + dy * camera.position.z * 0.5;
                  entry._baseY = newY; // _baseY synchronisé pour animation non-cumulative
                  // Sync sliders
                  const ctrlX = document.getElementById('ctrl-x');
                  const ctrlY = document.getElementById('ctrl-y');
                  if (ctrlX) ctrlX.value = entry.mesh.position.x;
                  if (ctrlY) ctrlY.value = newY;
                }
                return;
              }
              if (!mouseDown) return;
              rotY += (e.clientX - mouseX) * 0.008; rotX += (e.clientY - mouseY) * 0.008;
              mouseX = e.clientX; mouseY = e.clientY;
            });
            canvas.addEventListener('mouseup', () => { mouseDown = false; twinGrabEnd(); instrDragState.active = false; });
            canvas.addEventListener('mouseleave', () => { mouseDown = false; twinGrabEnd(); instrDragState.active = false; });
            canvas.addEventListener('wheel', e => { camera.position.z = Math.max(2.5, Math.min(10, camera.position.z + e.deltaY * 0.005)) });

            animate();
          }

          // ── Seeded RNG so each module always renders the same anatomy shape ──
          function seedFromString(s) {
            let h = 0; for (let i = 0; i < s.length; i++) { h = (Math.imul(31, h) + s.charCodeAt(i)) | 0 }
            return h >>> 0;
          }
          function mulberry32(seed) {
            return function () {
              seed |= 0; seed = seed + 0x6D2B79F5 | 0;
              let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
              t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
              return ((t ^ t >>> 14) >>> 0) / 4294967296;
            };
          }

          // Lump-shape generator: a noisy blob whose silhouette is biased by `axisScale`
          // so different organs (compact gland vs elongated lung vs lobed liver) read distinctly.
          function makeLumpGeometry(radius, axisScale, rng, detail) {
            const geo = new THREE.IcosahedronGeometry(radius, detail || 3);
            const pos = geo.attributes.position;
            const fx = 2 + rng() * 2, fy = 2 + rng() * 2, fz = 2 + rng() * 2;
            const px = rng() * 10, py = rng() * 10, pz = rng() * 10;
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
              const noise = Math.sin(x * fx + px) * Math.cos(y * fy + py) * 0.16 + Math.sin(z * fz + pz) * 0.11;
              pos.setXYZ(i, x * (1 + noise) * axisScale.x, y * (1 + noise * 0.8) * axisScale.y, z * (1 + noise * 0.6) * axisScale.z);
            }
            geo.computeVertexNormals();
            return geo;
          }

          // Per-specialty base silhouette so cataracte/glaucome/rétine ne se ressemblent pas trop —
          // l'œil reste globalement sphérique, la variation reste donc plus subtile qu'entre organes.
          const SPECIALTY_SHAPE = {
            cataracte: { axis: { x: 1.05, y: 1.0, z: 0.95 }, lobes: 3, tubular: 0.3 },
            glaucome: { axis: { x: 1.0, y: 1.0, z: 1.0 }, lobes: 2, tubular: 0.4 },
            retine: { axis: { x: 0.95, y: 0.95, z: 1.1 }, lobes: 4, tubular: 0.5 }
          };

          // Words that hint a substructure should be rendered as a tube (vessel/nerve/duct)
          // vs. a small nodule cluster (ganglion/nodule) vs. a solid sub-lobe (default).
          function classifySubstructure(name) {
            const n = name.toLowerCase();
            if (/nerf|artère|art\.|veine|v\.|canal|urétère|coronaire|iva|circonflexe|aorte|pédicule|vaisseau/.test(n)) return 'tube';
            if (/ganglion|node|nodule|adénopathie/.test(n)) return 'nodule';
            return 'lobe';
          }

          function buildOrgan() {
            if (organMesh) { scene.remove(organMesh); scene.remove(wireframeMesh) }
            if (vesselGroup) { scene.remove(vesselGroup) }
            organParts = [];

            const mod = MODULES[state.mod];
            const color = new THREE.Color(mod.color);
            const shape = SPECIALTY_SHAPE[state.mod] || SPECIALTY_SHAPE.cataracte;
            const rng = mulberry32(seedFromString(state.mod));

            // ── Main organ body (lump shaped per specialty) ──
            const geo = makeLumpGeometry(1.25, shape.axis, rng, 4);
            const mat = new THREE.MeshPhongMaterial({ color: color, transparent: true, opacity: 0.42, shininess: 70, side: THREE.DoubleSide });
            organMesh = new THREE.Mesh(geo, mat);
            scene.add(organMesh);
            organParts.push({ mesh: organMesh, name: mod.name, kind: 'organe' });

            const wireMat = new THREE.MeshBasicMaterial({ color: color, wireframe: true, transparent: true, opacity: 0.09 });
            wireframeMesh = new THREE.Mesh(geo.clone(), wireMat);
            scene.add(wireframeMesh);

            // ── Group that holds every accessory structure (lobes/tubes/nodules), rotates with organ ──
            vesselGroup = new THREE.Group();

            // Flatten module.structures[].children into typed substructures, spread deterministically
            // around the organ body so each specialty renders a genuinely different anatomy.
            let items = [];
            (mod.structures || []).forEach(group => {
              (group.children || []).forEach(child => items.push({ group: group.name, name: child }));
            });
            if (items.length === 0) items = [{ group: mod.name, name: mod.name }];

            items.forEach((it, idx) => {
              const kind = classifySubstructure(it.name);
              const t = idx / Math.max(1, items.length);
              const theta = t * Math.PI * 2 + rng() * 0.6;
              const phi = (rng() - 0.5) * Math.PI * 0.7;
              const R = 0.55 + rng() * 0.55;
              const cx = Math.cos(theta) * Math.cos(phi) * R * shape.axis.x;
              const cy = Math.sin(phi) * R * shape.axis.y;
              const cz = Math.sin(theta) * Math.cos(phi) * R * shape.axis.z;

              let mesh;
              if (kind === 'tube') {
                const segs = [new THREE.Vector3(cx * 0.2, cy * 0.2, cz * 0.2)];
                const n = 3 + Math.floor(rng() * 2);
                for (let s = 1; s <= n; s++) {
                  const f = s / n;
                  segs.push(new THREE.Vector3(
                    cx * f + (rng() - 0.5) * 0.15,
                    cy * f + (rng() - 0.5) * 0.15,
                    cz * f + (rng() - 0.5) * 0.15
                  ));
                }
                const curve = new THREE.CatmullRomCurve3(segs);
                const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.02 + rng() * 0.025, 6, false);
                const tubeMat = new THREE.MeshPhongMaterial({ color: 0xff6b35, transparent: true, opacity: 0.8, shininess: 60 });
                mesh = new THREE.Mesh(tubeGeo, tubeMat);
              } else if (kind === 'nodule') {
                const nodGeo = new THREE.SphereGeometry(0.045 + rng() * 0.03, 10, 10);
                const nodMat = new THREE.MeshPhongMaterial({ color: 0xeab308, transparent: true, opacity: 0.85 });
                mesh = new THREE.Mesh(nodGeo, nodMat);
                mesh.position.set(cx, cy, cz);
              } else {
                const lobeGeo = makeLumpGeometry(0.28 + rng() * 0.16, { x: 1, y: 1, z: 1 }, rng, 1);
                const lobeMat = new THREE.MeshPhongMaterial({ color: color.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.15), transparent: true, opacity: 0.5 });
                mesh = new THREE.Mesh(lobeGeo, lobeMat);
                mesh.position.set(cx, cy, cz);
              }
              mesh.userData = { label: it.name, group: it.group, kind };
              vesselGroup.add(mesh);
              organParts.push({ mesh, name: it.name, kind });
            });
            scene.add(vesselGroup);

            // ── Lesion marker (from module.metrics — pick the metric that reads like a size/nodule) ──
            const lesionGeo = new THREE.SphereGeometry(0.16, 16, 16);
            const lesionMat = new THREE.MeshPhongMaterial({ color: 0xef4444, transparent: true, opacity: 0.55, emissive: 0x330000 });
            const lesionMesh = new THREE.Mesh(lesionGeo, lesionMat);
            lesionMesh.position.set(0.35 * shape.axis.x, 0.15 * shape.axis.y, 0.25 * shape.axis.z);
            lesionMesh.userData = { label: 'Lésion cible', kind: 'lesion' };
            vesselGroup.add(lesionMesh);
            organParts.push({ mesh: lesionMesh, name: 'Lésion cible', kind: 'lesion' });

            // ── Clip / resection plane visual ──
            const discGeo = new THREE.RingGeometry(0.2, 1.8, 32);
            const discMat = new THREE.MeshBasicMaterial({ color: 0xff6b35, transparent: true, opacity: 0.1, side: THREE.DoubleSide });
            clipPlane = new THREE.Mesh(discGeo, discMat);
            clipPlane.position.set(0.3, 0, 0);
            clipPlane.rotation.y = Math.PI / 2;
            scene.add(clipPlane);

            // Anatomy also drives the MPR procedural volume so both views stay consistent.
            buildProceduralVolume();
          }

          // ════════════════════════════════════════════════
          //  JUMEAU NUMÉRIQUE — tissu mou déformable (Position-Based Dynamics)
          // ════════════════════════════════════════════════
          // Position Based Dynamics (Müller et al., 2007) : au lieu d'intégrer des
          // forces (masse-ressort classique, instable à pas de temps grossier), on
          // déplace directement les particules pour satisfaire des contraintes de
          // distance, résolues itérativement. Choisi ici pour deux raisons concrètes :
          // (1) inconditionnellement stable même si le framerate du navigateur varie —
          // un masse-ressort explicite « explose » facilement dans ces conditions ;
          // (2) implémentation compacte et auditable (~120 lignes), sans dépendance
          // physique externe (cannon-es, ammo.js...) — important dans un logiciel
          // médical où chaque comportement doit pouvoir être relu et justifié.
          //
          // Portée honnête : ceci est une DÉMONSTRATION de déformation de tissu mou
          // (retour élastique après palpation/traction), PAS une simulation
          // biomécanique validée (pas de propriétés tissulaires réelles type
          // hyperélasticité de Mooney-Rivlin, pas de découpe/coagulation). Utile pour
          // montrer le principe et comme base d'itération, pas pour une décision
          // clinique.
          const twin = {
            active: false,
            deformMode: false,
            mesh: null,
            geometry: null,
            particles: [],       // {pos: Vector3, prev: Vector3, pinned: bool}
            constraints: [],      // {a, b, restLength}
            grabbed: null,         // index de la particule actuellement saisie, ou null
            grabPlane: null,
            raycaster: null,
            substeps: 6,           // itérations de résolution de contraintes par frame
            stiffness: 0.4,        // 0..1 — rigidité du tissu (0.2 très mou, 0.6 ferme)
            gravity: -0.35,
          };

          function buildTwinGeometry() {
            const shape = SPECIALTY_SHAPE[state.mod] || SPECIALTY_SHAPE.cataracte;
            const rng = mulberry32(seedFromString(state.mod));
            // Détail=2 → assez de sommets pour un rendu convaincant, assez peu pour
            // résoudre les contraintes PBD à 60 img/s en JavaScript pur (pas de GPU
            // compute ici). Le detail=4 utilisé pour l'organe "Plan" (10k+ sommets)
            // ferait chuter le framerate si on tentait d'y appliquer PBD tel quel.
            const raw = makeLumpGeometry(1.25, shape.axis, rng, 2);
            // BUG CORRIGÉ : THREE.IcosahedronGeometry n'est PAS indexée (geo.index ===
            // null) — chaque triangle a ses 3 sommets dupliqués en mémoire, même aux
            // arêtes partagées avec le triangle voisin. Sans fusion, buildTwinConstraints
            // (qui lit geo.index) ne trouve aucune arête et le "tissu" est un nuage de
            // triangles totalement déconnectés qui tombent indépendamment sous la
            // gravité dès la première frame — un bug bien pire que "maillage invisible".
            return mergeGeometryVertices(raw);
          }

          // Retourne le vrai maillage bas-poly du foie du patient (chargé par
          // loadRealMeshesIntoScene() lors d'une segmentation IA réelle réussie),
          // ou null s'il n'y en a pas encore — auquel cas enterDigitalTwin() retombe
          // sur l'anatomie procédurale (buildTwinGeometry()). Clone la géométrie
          // pour ne pas partager le même buffer entre plusieurs sessions Jumeau
          // successives (exit/enter/reset la modifient en place via la simulation PBD).
          function buildTwinGeometryFromRealLiverMesh() {
            return realLiverTwinGeometry ? realLiverTwinGeometry.clone() : null;
          }

          // Fusionne les sommets géométriquement coïncidents d'une géométrie non
          // indexée en une géométrie indexée équivalente (mêmes triangles, sommets
          // partagés). Nécessaire pour que buildTwinConstraints() puisse déduire la
          // topologie réelle du maillage (quels sommets sont voisins).
          function mergeGeometryVertices(geo, precision = 5) {
            const pos = geo.attributes.position;
            const map = new Map();
            const newPositions = [];
            const indices = new Array(pos.count);
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
              const key = x.toFixed(precision) + '_' + y.toFixed(precision) + '_' + z.toFixed(precision);
              let idx = map.get(key);
              if (idx === undefined) {
                idx = newPositions.length / 3;
                newPositions.push(x, y, z);
                map.set(key, idx);
              }
              indices[i] = idx;
            }
            const merged = new THREE.BufferGeometry();
            merged.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
            merged.setIndex(indices);
            merged.computeVertexNormals();
            return merged;
          }

          function buildTwinParticles(geo) {
            const pos = geo.attributes.position;
            const particles = [];
            for (let i = 0; i < pos.count; i++) {
              const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
              particles.push({ pos: v, prev: v.clone(), pinned: false });
            }
            // Ancrage : les sommets du côté -X restent fixes, comme un organe retenu
            // par son pédicule vasculaire/ligament suspenseur. Sans cela, l'organe
            // entier tomberait hors champ sous la gravité — pas réaliste, et ça
            // recréerait l'impression d'un « maillage disparu ».
            // Seuil PROPORTIONNEL à l'étendue du maillage (pas une constante absolue) :
            // nécessaire pour que l'ancrage ait un sens quelle que soit l'échelle —
            // anatomie procédurale (rayon ~1.25) ou vrai maillage patient bas-poly
            // (échelle différente selon le volume hépatique réel du patient).
            geo.computeBoundingBox();
            const bbox = geo.boundingBox;
            const pinThreshold = bbox.min.x + (bbox.max.x - bbox.min.x) * 0.12;
            particles.forEach(p => { if (p.pos.x < pinThreshold) p.pinned = true; });
            return particles;
          }

          function buildTwinConstraints(geo, particles) {
            const index = geo.index;
            const seen = new Set();
            const constraints = [];
            const addConstraint = (a, b) => {
              const key = a < b ? (a + '_' + b) : (b + '_' + a);
              if (seen.has(key)) return;
              seen.add(key);
              constraints.push({ a, b, restLength: particles[a].pos.distanceTo(particles[b].pos) });
            };
            if (index) {
              const arr = index.array;
              for (let i = 0; i < arr.length; i += 3) {
                addConstraint(arr[i], arr[i + 1]); addConstraint(arr[i + 1], arr[i + 2]); addConstraint(arr[i + 2], arr[i]);
              }
            }
            return constraints;
          }

          function enterDigitalTwin() {
            if (!scene || twin.active) return;
            twin.active = true;
            twin.deformMode = false;
            twin.grabbed = null;
            twin.raycaster = twin.raycaster || new THREE.Raycaster();
            twin.grabPlane = twin.grabPlane || new THREE.Plane();

            // On masque l'organe "Plan" (sans le détruire : on le retrouve intact, avec
            // sa rotation et ses sous-structures, en quittant le mode jumeau).
            if (organMesh) organMesh.visible = false;
            if (wireframeMesh) wireframeMesh.visible = false;
            if (vesselGroup) vesselGroup.visible = false;
            if (clipPlane) clipPlane.visible = false;

            // Vrai maillage du patient (segmentation IA réelle) si disponible,
            // sinon anatomie procédurale générique — voir buildTwinGeometryFromRealLiverMesh().
            const realGeo = buildTwinGeometryFromRealLiverMesh();
            twin.geometry = realGeo || buildTwinGeometry();
            twin.usingRealMesh = !!realGeo;
            twin.particles = buildTwinParticles(twin.geometry);
            twin.constraints = buildTwinConstraints(twin.geometry, twin.particles);

            const mod = MODULES[state.mod];
            const mat = new THREE.MeshPhongMaterial({
              color: new THREE.Color(mod.color), transparent: true, opacity: 0.6, shininess: 55,
              side: THREE.DoubleSide,
            });
            twin.mesh = new THREE.Mesh(twin.geometry, mat);
            scene.add(twin.mesh);

            // Marqueurs des points d'ancrage (pédicule) — enfants du mesh pour hériter
            // automatiquement sa rotation, pas de synchronisation manuelle nécessaire.
            const anchorGeo = new THREE.SphereGeometry(0.045, 8, 8);
            const anchorMat = new THREE.MeshBasicMaterial({ color: 0xff6b35 });
            twin.particles.forEach(p => {
              if (p.pinned) {
                const s = new THREE.Mesh(anchorGeo, anchorMat);
                s.position.copy(p.pos);
                twin.mesh.add(s);
              }
            });

            document.getElementById('vp-tools-normal').style.display = 'none';
            document.getElementById('vp-tools-twin').style.display = 'flex';
            document.getElementById('twin-hint').style.display = 'block';
            notify(twin.usingRealMesh
              ? `Jumeau numérique activé — maillage réel du patient (segmentation IA)`
              : `Jumeau numérique activé — ${mod.name} (anatomie procédurale générique, aucune segmentation réelle chargée)`,
              'ok');
          }

          function exitDigitalTwin() {
            if (!twin.active) return;
            twin.active = false;
            twin.deformMode = false;
            twin.grabbed = null;
            if (twin.mesh) {
              scene.remove(twin.mesh);
              twin.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
              twin.mesh = null;
            }
            twin.particles = []; twin.constraints = [];
            if (organMesh) organMesh.visible = true;
            if (wireframeMesh) wireframeMesh.visible = true;
            if (vesselGroup) vesselGroup.visible = true;
            if (clipPlane) clipPlane.visible = true;

            document.getElementById('vp-tools-normal').style.display = 'flex';
            document.getElementById('vp-tools-twin').style.display = 'none';
            document.getElementById('twin-hint').style.display = 'none';
          }

          function resetDigitalTwin() {
            if (!twin.active) return;
            exitDigitalTwin();
            enterDigitalTwin();
          }

          function setTwinInteraction(mode) {
            twin.deformMode = (mode === 'deform');
            document.getElementById('twin-btn-rotate').classList.toggle('on', !twin.deformMode);
            document.getElementById('twin-btn-deform').classList.toggle('on', twin.deformMode);
          }

          function stepTwinPhysics(dt) {
            if (!twin.active || !twin.particles.length) return;
            const g = twin.gravity;
            twin.particles.forEach((p, i) => {
              if (p.pinned || i === twin.grabbed) return;
              const vx = (p.pos.x - p.prev.x) * 0.98, vy = (p.pos.y - p.prev.y) * 0.98 + g * dt * dt, vz = (p.pos.z - p.prev.z) * 0.98;
              p.prev.copy(p.pos);
              p.pos.x += vx; p.pos.y += vy; p.pos.z += vz;
            });

            for (let iter = 0; iter < twin.substeps; iter++) {
              for (const c of twin.constraints) {
                const pa = twin.particles[c.a], pb = twin.particles[c.b];
                const aFixed = pa.pinned || c.a === twin.grabbed;
                const bFixed = pb.pinned || c.b === twin.grabbed;
                if (aFixed && bFixed) continue;
                const delta = new THREE.Vector3().subVectors(pb.pos, pa.pos);
                const dist = delta.length() || 1e-6;
                const diff = (dist - c.restLength) / dist;
                const wa = aFixed ? 0 : 1, wb = bFixed ? 0 : 1, wSum = wa + wb;
                const corr = delta.multiplyScalar(twin.stiffness * diff / wSum);
                if (!aFixed) pa.pos.add(corr.clone().multiplyScalar(wa));
                if (!bFixed) pb.pos.sub(corr.clone().multiplyScalar(wb));
              }
            }

            const posAttr = twin.geometry.attributes.position;
            twin.particles.forEach((p, i) => posAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z));
            posAttr.needsUpdate = true;
            twin.geometry.computeVertexNormals();
          }

          function twinNdcFromEvent(e) {
            const rect = renderer.domElement.getBoundingClientRect();
            return new THREE.Vector2(
              ((e.clientX - rect.left) / rect.width) * 2 - 1,
              -((e.clientY - rect.top) / rect.height) * 2 + 1
            );
          }

          function twinGrabStart(e) {
            if (!twin.mesh) return;
            twin.raycaster.setFromCamera(twinNdcFromEvent(e), camera);
            const hit = twin.raycaster.intersectObject(twin.mesh)[0];
            if (!hit) return;
            const localPoint = twin.mesh.worldToLocal(hit.point.clone());
            let best = -1, bestD = Infinity;
            twin.particles.forEach((p, i) => {
              if (p.pinned) return;
              const d = p.pos.distanceTo(localPoint);
              if (d < bestD) { bestD = d; best = i; }
            });
            if (best < 0) return;
            twin.grabbed = best;
            const worldNormal = camera.getWorldDirection(new THREE.Vector3());
            twin.grabPlane.setFromNormalAndCoplanarPoint(worldNormal, hit.point);
          }

          function twinGrabMove(e) {
            if (twin.grabbed == null) return;
            twin.raycaster.setFromCamera(twinNdcFromEvent(e), camera);
            const target = new THREE.Vector3();
            if (twin.raycaster.ray.intersectPlane(twin.grabPlane, target)) {
              const local = twin.mesh.worldToLocal(target.clone());
              const p = twin.particles[twin.grabbed];
              p.pos.copy(local);
              p.prev.copy(local); // vitesse nulle pendant la saisie -> pas de "lancer" involontaire
            }
          }

          function twinGrabEnd() {
            twin.grabbed = null;
          }

          function animate() {
            requestAnimationFrame(animate);
            const t = Date.now() * 0.001;

            if (twin.active) {
              if (!twin.deformMode) {
                twin.mesh.rotation.y += 0.002;
                twin.mesh.rotation.y += rotY * 0.02; twin.mesh.rotation.x += rotX * 0.02;
                rotX *= 0.95; rotY *= 0.95;
              }
              stepTwinPhysics(1 / 60);
            } else if (organMesh) {
              organMesh.rotation.y += 0.002;
              organMesh.rotation.y += rotY * 0.02; organMesh.rotation.x += rotX * 0.02;
              wireframeMesh.rotation.copy(organMesh.rotation);
              vesselGroup.rotation.copy(organMesh.rotation);
              clipPlane.rotation.copy(organMesh.rotation);
              rotX *= 0.95; rotY *= 0.95;
            }

            // — L'isosurface DICOM voxelisée partage la même rotation que l'organe procédural —
            if (typeof dicomIsoMesh !== 'undefined' && dicomIsoMesh && !twin.active) {
              // Spin auto uniquement si activé
              if (typeof dicomSpinEnabled === 'undefined' || dicomSpinEnabled) {
                dicomIsoMesh.rotation.y += (typeof dicomSpinSpeed !== 'undefined' ? dicomSpinSpeed : 0.002);
              }
              dicomIsoMesh.rotation.y += rotY * 0.02; dicomIsoMesh.rotation.x += rotX * 0.02;
            }

            // — Animation des instruments 3D —
            if (typeof instrumentManager !== 'undefined' && instrumentManager.placedInstruments.length > 0) {
              instrumentManager.placedInstruments.forEach((entry, i) => {
                if (!entry.mesh) return;
                // Initialise la position de base au premier passage (non-cumulative)
                if (!entry._baseY) entry._baseY = entry.mesh.position.y;
                const isSelected = (i === instrumentManager.selectedIdx);
                // Flottement sinusoïdal autour de la position de base (non-cumulatif)
                const freq = 0.5 + i * 0.13;
                const amp = isSelected ? 0.12 : 0.06;
                if (!instrDragState.active || instrDragState.instrIdx !== i) {
                  entry.mesh.position.y = entry._baseY + Math.sin(t * freq + i * 1.2) * amp;
                  // Rotation Y continue et clairement visible
                  entry.mesh.rotation.y = t * (isSelected ? 1.2 : 0.6) + i * Math.PI * 0.4;
                  // Inclinaison oscillante sur X (effet de balançage)
                  entry.mesh.rotation.x = Math.sin(t * 0.4 + i) * 0.08;
                }
                // Pulsation emissive sur l'instrument sélectionné
                if (isSelected) {
                  entry.mesh.traverse(o => {
                    if (o.material && o.material.emissive) {
                      o.material.emissiveIntensity = 0.2 + 0.18 * Math.sin(t * 4);
                    }
                  });
                }
              });
            }

            renderer.render(scene, camera);
          }

          function onResize() {
            if (!renderer) return;
            const wrap = document.getElementById('viewport-wrap');
            const w = wrap.clientWidth, h = wrap.clientHeight;
            renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
          }

          // ════════════════════════════════════════════════
          //  LIBRAIRIE D'INSTRUMENTS CHIRURGICAUX 3D
          //  Assets procéduraux Three.js + moteur de placement interactif
          // ════════════════════════════════════════════════

          // Catalogue complet de la librairie d'instruments
          const INSTRUMENT_LIBRARY = [
            // ── ENDOSCOPIE & IMAGERIE ──
            {
              id: 'laparoscope_hd', name: 'Laparoscope HD 30°', category: 'endo',
              icon: '📷', color: 0x374151, emissive: 0x001133,
              desc: 'Optique 10mm, éclair. LED, champ 30°',
              build(THREE) {
                const g = new THREE.Group();
                // Corps cylindrique principal
                const bodyGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 16);
                const bodyMat = new THREE.MeshPhongMaterial({ color: 0x1f2937, shininess: 120 });
                const body = new THREE.Mesh(bodyGeo, bodyMat);
                body.rotation.z = Math.PI / 2; g.add(body);
                // Tête optique (sphère bleutée)
                const lensGeo = new THREE.SphereGeometry(0.055, 16, 16);
                const lensMat = new THREE.MeshPhongMaterial({ color: 0x1e40af, emissive: 0x001133, transparent: true, opacity: 0.9, shininess: 200 });
                const lens = new THREE.Mesh(lensGeo, lensMat); lens.position.set(0.62, 0, 0); g.add(lens);
                // Anneau de lumiere LED
                const ringGeo = new THREE.TorusGeometry(0.05, 0.008, 8, 24);
                const ringMat = new THREE.MeshPhongMaterial({ color: 0xfef3c7, emissive: 0x554400, shininess: 80 });
                const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.set(0.58, 0, 0); ring.rotation.y = Math.PI / 2; g.add(ring);
                // Câble lumiere froide
                const cableGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.4, 8);
                const cableMat = new THREE.MeshPhongMaterial({ color: 0x111827 });
                const cable = new THREE.Mesh(cableGeo, cableMat); cable.position.set(-0.4, -0.08, 0); cable.rotation.z = Math.PI / 4; g.add(cable);
                return g;
              }
            },
            {
              id: 'camera_4k', name: 'Tête de caméra 4K 3D', category: 'endo',
              icon: '🎬', color: 0x111827, emissive: 0x000011,
              desc: 'Caméra 3D 4K, 2 capteurs 1/2.3"',
              build(THREE) {
                const g = new THREE.Group();
                const bodyGeo = new THREE.BoxGeometry(0.22, 0.12, 0.12);
                const bodyMat = new THREE.MeshPhongMaterial({ color: 0x111827, shininess: 150 });
                g.add(new THREE.Mesh(bodyGeo, bodyMat));
                // Deux objectifs (stéréo)
                [-0.04, 0.04].forEach(oy => {
                  const lenGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12);
                  const lenMat = new THREE.MeshPhongMaterial({ color: 0x1e40af, emissive: 0x000066, transparent: true, opacity: 0.92, shininess: 220 });
                  const l = new THREE.Mesh(lenGeo, lenMat); l.rotation.z = Math.PI / 2; l.position.set(0.12, oy, 0); g.add(l);
                });
                // Logo LED
                const indGeo = new THREE.SphereGeometry(0.012, 8, 8);
                const indMat = new THREE.MeshPhongMaterial({ color: 0x10b981, emissive: 0x005522 });
                const ind = new THREE.Mesh(indGeo, indMat); ind.position.set(-0.09, 0.05, 0.06); g.add(ind);
                return g;
              }
            },
            // ── INSTRUMENTS DE COUPE ──
            {
              id: 'bistouri_lame', name: 'Bistouri lame #22', category: 'coupe',
              icon: '🔪', color: 0xd1d5db, emissive: 0x000000,
              desc: 'Manche INOX, lame acier carbone #22',
              build(THREE) {
                const g = new THREE.Group();
                // Manche
                const handleGeo = new THREE.CylinderGeometry(0.018, 0.014, 0.9, 12);
                const handleMat = new THREE.MeshPhongMaterial({ color: 0xd1d5db, shininess: 180 });
                const handle = new THREE.Mesh(handleGeo, handleMat); handle.rotation.z = Math.PI / 2; g.add(handle);
                // Garde
                const guardGeo = new THREE.BoxGeometry(0.028, 0.06, 0.02);
                const guardMat = new THREE.MeshPhongMaterial({ color: 0x9ca3af, shininess: 160 });
                const guard = new THREE.Mesh(guardGeo, guardMat); guard.position.set(0.42, 0, 0); g.add(guard);
                // Lame (profil triangulaire plat — curviléaire)
                const bladeShape = new THREE.Shape();
                bladeShape.moveTo(0, 0); bladeShape.lineTo(0.35, 0.0); bladeShape.lineTo(0.22, 0.04); bladeShape.closePath();
                const bladeGeo = new THREE.ShapeGeometry(bladeShape);
                const bladeMat = new THREE.MeshPhongMaterial({ color: 0xe5e7eb, side: THREE.DoubleSide, shininess: 240 });
                const blade = new THREE.Mesh(bladeGeo, bladeMat); blade.position.set(0.45, 0, 0); g.add(blade);
                return g;
              }
            },
            {
              id: 'ciseau_mayo', name: 'Ciseaux de Mayo courbés', category: 'coupe',
              icon: '✂️', color: 0xe5e7eb, emissive: 0x000000,
              desc: 'Ciseaux dissection INOX, 17 cm',
              build(THREE) {
                const g = new THREE.Group();
                const mat = new THREE.MeshPhongMaterial({ color: 0xd1d5db, shininess: 200 });
                // Anneau gauche
                const r1Geo = new THREE.TorusGeometry(0.055, 0.012, 8, 24); const r1 = new THREE.Mesh(r1Geo, mat); r1.position.set(-0.4, 0, 0); g.add(r1);
                // Anneau droit
                const r2Geo = new THREE.TorusGeometry(0.055, 0.012, 8, 24); const r2 = new THREE.Mesh(r2Geo, mat); r2.position.set(-0.25, 0.08, 0); g.add(r2);
                // Branche 1
                const b1Geo = new THREE.CylinderGeometry(0.009, 0.009, 0.9, 8); const b1 = new THREE.Mesh(b1Geo, mat); b1.rotation.z = Math.PI / 2; b1.position.set(0.08, 0.025, 0); g.add(b1);
                // Branche 2 (légèrement écartée)
                const b2Geo = new THREE.CylinderGeometry(0.009, 0.009, 0.9, 8); const b2 = new THREE.Mesh(b2Geo, mat); b2.rotation.z = Math.PI / 2; b2.position.set(0.08, -0.02, 0.01); g.add(b2);
                return g;
              }
            },
            {
              id: 'pince_dissection', name: 'Pince de dissection endo', category: 'coupe',
              icon: '🥺', color: 0x9ca3af, emissive: 0x000000,
              desc: 'Pince Maryland 5mm, rotation 360°',
              build(THREE) {
                const g = new THREE.Group();
                const mat = new THREE.MeshPhongMaterial({ color: 0x6b7280, shininess: 160 });
                // Tige d'insertion
                const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.0, 12); const shaft = new THREE.Mesh(shaftGeo, mat); shaft.rotation.z = Math.PI / 2; g.add(shaft);
                // Mâchoire 1 (prong)
                const jaw1Geo = new THREE.CylinderGeometry(0.007, 0.003, 0.18, 8); const jaw1 = new THREE.Mesh(jaw1Geo, mat); jaw1.rotation.z = Math.PI / 2 + 0.15; jaw1.position.set(0.56, 0.04, 0); g.add(jaw1);
                // Mâchoire 2
                const jaw2Geo = new THREE.CylinderGeometry(0.007, 0.003, 0.18, 8); const jaw2 = new THREE.Mesh(jaw2Geo, mat); jaw2.rotation.z = Math.PI / 2 - 0.15; jaw2.position.set(0.56, -0.04, 0); g.add(jaw2);
                // Pivot
                const pivotGeo = new THREE.SphereGeometry(0.028, 12, 12); const pivot = new THREE.Mesh(pivotGeo, mat); pivot.position.set(0.5, 0, 0); g.add(pivot);
                return g;
              }
            },
            // ── ROBOTIQUE CHIRURGICALE ──
            {
              id: 'davinci_arm', name: 'Bras Da Vinci 5 (EndoWrist)', category: 'robot',
              icon: '🤖', color: 0x6366f1, emissive: 0x110022,
              desc: '7 DDL, serrage 1N-40N, ech. 10:1',
              build(THREE) {
                const g = new THREE.Group();
                // Segment proximal
                const s1Mat = new THREE.MeshPhongMaterial({ color: 0x4338ca, shininess: 140 });
                const s1Geo = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 12); const s1 = new THREE.Mesh(s1Geo, s1Mat); s1.rotation.z = Math.PI / 2; s1.position.set(-0.2, 0, 0); g.add(s1);
                // Coude 1
                const e1Geo = new THREE.SphereGeometry(0.045, 12, 12); const e1 = new THREE.Mesh(e1Geo, s1Mat); e1.position.set(0.1, 0, 0); g.add(e1);
                // Segment distal (incliné)
                const s2Mat = new THREE.MeshPhongMaterial({ color: 0x4f46e5, shininess: 160 });
                const s2Geo = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 12); const s2 = new THREE.Mesh(s2Geo, s2Mat); s2.rotation.z = Math.PI / 2 + 0.35; s2.position.set(0.32, 0.07, 0); g.add(s2);
                // Poignet (wrist)
                const wGeo = new THREE.SphereGeometry(0.033, 12, 12); const w = new THREE.Mesh(wGeo, s2Mat); w.position.set(0.52, 0.16, 0); g.add(w);
                // Effecteur (pinces)
                const eMat = new THREE.MeshPhongMaterial({ color: 0x818cf8, shininess: 200 });
                [0.035, -0.035].forEach(oy => {
                  const eGeo = new THREE.CylinderGeometry(0.01, 0.005, 0.14, 8); const e = new THREE.Mesh(eGeo, eMat); e.rotation.z = Math.PI / 2 + 0.2; e.position.set(0.62 + Math.abs(oy), 0.22 + oy, 0); g.add(e);
                });
                // Bague LED de statut (verte = actif)
                const ledGeo = new THREE.TorusGeometry(0.046, 0.006, 6, 20); const ledMat = new THREE.MeshPhongMaterial({ color: 0x10b981, emissive: 0x004422 }); const led = new THREE.Mesh(ledGeo, ledMat); led.position.set(0.1, 0, 0); led.rotation.y = Math.PI / 2; g.add(led);
                return g;
              }
            },
            {
              id: 'hugo_trocar', name: 'Trocard Hugo RAS 8mm', category: 'robot',
              icon: '🔧', color: 0xf59e0b, emissive: 0x220800,
              desc: 'Accès mécanique robotisé, valve Hasson',
              build(THREE) {
                const g = new THREE.Group();
                const mat = new THREE.MeshPhongMaterial({ color: 0xd97706, shininess: 120 });
                // Canule principale
                const canGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.9, 16); const can = new THREE.Mesh(canGeo, mat); g.add(can);
                // Tête (poignée)
                const topGeo = new THREE.CylinderGeometry(0.075, 0.055, 0.1, 16); const top = new THREE.Mesh(topGeo, mat); top.position.y = 0.5; g.add(top);
                // Valve (anneau de maintien)
                const valveGeo = new THREE.TorusGeometry(0.042, 0.012, 8, 20); const valveMat = new THREE.MeshPhongMaterial({ color: 0xfbbf24, shininess: 100 }); const valve = new THREE.Mesh(valveGeo, valveMat); valve.position.y = 0.38; valve.rotation.x = Math.PI / 2; g.add(valve);
                // Stylet (retraiteraçon)
                const styletGeo = new THREE.CylinderGeometry(0.01, 0.005, 1.05, 8); const styletMat = new THREE.MeshPhongMaterial({ color: 0x9ca3af }); const stylet = new THREE.Mesh(styletGeo, styletMat); stylet.position.y = -0.03; g.add(stylet);
                g.rotation.x = Math.PI / 8;
                return g;
              }
            },
            // ── ÉNERGIE & HÉMOSTASE ──
            {
              id: 'coagulation_bipolaire', name: 'Pince bipolaire énergie', category: 'energie',
              icon: '⚡', color: 0xf59e0b, emissive: 0x331100,
              desc: 'Lig. vasculaire 7mm, 300 W bipol.',
              build(THREE) {
                const g = new THREE.Group();
                const mat = new THREE.MeshPhongMaterial({ color: 0x92400e, shininess: 140 });
                // Corps principal
                const bodyGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.0, 12); const body = new THREE.Mesh(bodyGeo, mat); body.rotation.z = Math.PI / 2; g.add(body);
                // Bandes d'énergie (jaunes)
                [-.3, 0, .3].forEach(x => {
                  const bGeo = new THREE.TorusGeometry(0.031, 0.006, 6, 20); const bMat = new THREE.MeshPhongMaterial({ color: 0xfbbf24, emissive: 0x221100 }); const b = new THREE.Mesh(bGeo, bMat); b.position.set(x, 0, 0); b.rotation.y = Math.PI / 2; g.add(b);
                });
                // Mâchoires (bipolaires)
                const jMat = new THREE.MeshPhongMaterial({ color: 0xfef3c7, shininess: 220 });
                [0.04, -0.04].forEach(oy => {
                  const jGeo = new THREE.BoxGeometry(0.22, 0.012, 0.012); const j = new THREE.Mesh(jGeo, jMat); j.position.set(0.61, oy, 0); g.add(j);
                });
                // Lueur d'énergie (emissive sphere)
                const glowGeo = new THREE.SphereGeometry(0.02, 8, 8); const glowMat = new THREE.MeshPhongMaterial({ color: 0xfef08a, emissive: 0x554400, transparent: true, opacity: 0.8 }); const glow = new THREE.Mesh(glowGeo, glowMat); glow.position.set(0.72, 0, 0); g.add(glow);
                return g;
              }
            },
            {
              id: 'electrocautere_monopolaire', name: 'Bistouri électrique monopolaire', category: 'energie',
              icon: '🔥', color: 0xef4444, emissive: 0x220000,
              desc: 'ESU monopolaire, 350W, mode coupe/coag',
              build(THREE) {
                const g = new THREE.Group();
                const mat = new THREE.MeshPhongMaterial({ color: 0xfef3c7, shininess: 120 });
                // Manche plastique jaune
                const hGeo = new THREE.BoxGeometry(0.9, 0.045, 0.045); const h = new THREE.Mesh(hGeo, mat); g.add(h);
                // Boutons de mode (rouge=coag, bleu=coupe)
                const r = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.018, 0.05), new THREE.MeshPhongMaterial({ color: 0xef4444 })); r.position.set(-0.12, 0.03, 0); g.add(r);
                const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.018, 0.05), new THREE.MeshPhongMaterial({ color: 0x3b82f6 })); b.position.set(-0.2, 0.03, 0); g.add(b);
                // Pointe active
                const tipGeo = new THREE.CylinderGeometry(0.005, 0.001, 0.18, 8); const tipMat = new THREE.MeshPhongMaterial({ color: 0x9ca3af, emissive: 0x330000, shininess: 240 }); const tip = new THREE.Mesh(tipGeo, tipMat); tip.rotation.z = Math.PI / 2; tip.position.set(0.54, 0, 0); g.add(tip);
                return g;
              }
            },
            {
              id: 'aspirateur_suction', name: 'Aspirateur-irrigateur CUSA', category: 'energie',
              icon: '💧', color: 0x06b6d4, emissive: 0x001122,
              desc: 'CUSA Excell, ultra-sons 23kHz, aspiration 500 mmHg',
              build(THREE) {
                const g = new THREE.Group();
                const mat = new THREE.MeshPhongMaterial({ color: 0x0891b2, shininess: 140 });
                // Tuyau principal
                const tGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.1, 12); const t = new THREE.Mesh(tGeo, mat); t.rotation.z = Math.PI / 2; g.add(t);
                // Raccord aspiration
                const rGeo = new THREE.TorusGeometry(0.04, 0.012, 8, 16); const rMat = new THREE.MeshPhongMaterial({ color: 0x22d3ee, shininess: 160 }); const r = new THREE.Mesh(rGeo, rMat); r.position.set(-0.3, 0, 0); r.rotation.y = Math.PI / 2; g.add(r);
                // Pointe ultrasonore
                const pGeo = new THREE.CylinderGeometry(0.012, 0.004, 0.2, 8); const pMat = new THREE.MeshPhongMaterial({ color: 0x67e8f9, shininess: 220 }); const p = new THREE.Mesh(pGeo, pMat); p.rotation.z = Math.PI / 2; p.position.set(0.62, 0, 0); g.add(p);
                return g;
              }
            }
          ];

          // ── Gestionnaire d'instruments 3D ──
          const instrumentManager = {
            placedInstruments: [],  // [{id, mesh, data, selected}]
            selectedIdx: -1,
            activeCategory: 'all',

            // Place un instrument dans la scène à une position par défaut intelligente
            place(instrData) {
              if (!scene || !renderer) { notify('Viewport 3D non initialisé — ouvrez la vue 3D', 'warn'); return; }
              const mesh = instrData.build(THREE);
              // Position initiale : disposition en étoile autour du jumeau, visible dans le champ caméra
              const count = this.placedInstruments.length;
              const angle = (count / Math.max(5, this.placedInstruments.length + 1)) * Math.PI * 2;
              const radius = 2.2;
              const baseY = (count % 3 - 1) * 0.5;
              mesh.position.set(
                Math.cos(angle) * radius,
                baseY,
                Math.sin(angle) * radius
              );
              mesh.scale.setScalar(0.9);
              mesh.userData = { instrId: instrData.id, name: instrData.name };
              scene.add(mesh);
              // _baseY mémorisé immédiatement pour l'animation sinusoïdale non-cumulative
              const entry = { id: instrData.id, mesh, data: instrData, selected: false, _baseY: baseY };
              this.placedInstruments.push(entry);
              // Mise à jour compteur
              this._updateCount();
              this.select(this.placedInstruments.length - 1);
              notify(`🔪 ${instrData.name} ajouté à la scène — cliquez dessus pour le déplacer`, 'ok');
            },

            // Sélectionne un instrument placé
            select(idx) {
              // Désélectionne l'ancien
              if (this.selectedIdx >= 0 && this.placedInstruments[this.selectedIdx]) {
                this.placedInstruments[this.selectedIdx].selected = false;
                this._setHighlight(this.placedInstruments[this.selectedIdx].mesh, false);
              }
              this.selectedIdx = idx;
              if (idx < 0 || !this.placedInstruments[idx]) {
                document.getElementById('instrument-controls').style.display = 'none';
                return;
              }
              const entry = this.placedInstruments[idx];
              entry.selected = true;
              this._setHighlight(entry.mesh, true);
              document.getElementById('instrument-ctrl-title').textContent = entry.data.icon + ' ' + entry.data.name;
              document.getElementById('ctrl-x').value = entry.mesh.position.x;
              document.getElementById('ctrl-y').value = entry.mesh.position.y;
              document.getElementById('ctrl-z').value = entry.mesh.position.z;
              document.getElementById('ctrl-ry').value = entry.mesh.rotation.y;
              document.getElementById('ctrl-scale').value = entry.mesh.scale.x;
              document.getElementById('instrument-controls').style.display = 'block';
            },

            moveSelected(axis, val) {
              if (this.selectedIdx < 0) return;
              const entry = this.placedInstruments[this.selectedIdx];
              const m = entry.mesh;
              if (axis === 'x') m.position.x = val;
              if (axis === 'y') { entry._baseY = val; } // _baseY mis à jour pour que l'animation ne l'écrase pas
              if (axis === 'z') m.position.z = val;
            },

            rotateSelected(axis, val) {
              if (this.selectedIdx < 0) return;
              const m = this.placedInstruments[this.selectedIdx].mesh;
              if (axis === 'y') m.rotation.y = val;
            },

            scaleSelected(val) {
              if (this.selectedIdx < 0) return;
              this.placedInstruments[this.selectedIdx].mesh.scale.setScalar(val);
            },

            removeSelected() {
              if (this.selectedIdx < 0) return;
              const entry = this.placedInstruments.splice(this.selectedIdx, 1)[0];
              scene.remove(entry.mesh);
              entry.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
              this.selectedIdx = -1;
              this._updateCount();
              document.getElementById('instrument-controls').style.display = 'none';
              renderInstrumentList(this.activeCategory);
              notify(`🗑️ ${entry.data.name} retiré de la scène`, 'info');
            },

            clearAll() {
              [...this.placedInstruments].forEach(e => {
                scene.remove(e.mesh);
                e.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
              });
              this.placedInstruments = [];
              this.selectedIdx = -1;
              this._updateCount();
              document.getElementById('instrument-controls').style.display = 'none';
              notify('🗑️ Tous les instruments retirés de la scène', 'info');
            },

            _setHighlight(mesh, on) {
              mesh.traverse(o => {
                if (o.material) {
                  o.material.emissiveIntensity = on ? 0.4 : (o.material.emissiveIntensity > 0.35 ? 0.2 : 0);
                  if (on && o.material.color) o.material.emissive = new THREE.Color(0x1e1b4b);
                }
              });
            },

            _updateCount() {
              const el = document.getElementById('instrument-count-label');
              if (el) el.textContent = this.placedInstruments.length + ' instrument(s) en scène';
              // Met à jour la liste des instruments placés
              renderInstrumentList(this.activeCategory);
            }
          };

          function toggleInstrumentPanel() {
            const panel = document.getElementById('instrument-panel');
            const btn = document.getElementById('btn-instrument-lib');
            if (!panel) return;
            const open = panel.style.display !== 'none';
            panel.style.display = open ? 'none' : 'flex';
            if (btn) btn.classList.toggle('on', !open);
            if (!open) renderInstrumentList('all');
          }

          function filterInstruments(cat) {
            instrumentManager.activeCategory = cat;
            document.querySelectorAll('.instr-cat').forEach(b => {
              const isActive = b.id === 'icat-' + cat;
              b.style.background = isActive ? 'rgba(168,85,247,.25)' : 'var(--bg2)';
              b.style.color = isActive ? '#a855f7' : 'var(--text3)';
              b.style.borderColor = isActive ? 'rgba(168,85,247,.4)' : 'var(--border)';
            });
            renderInstrumentList(cat);
          }

          function renderInstrumentList(cat) {
            const list = document.getElementById('instrument-list');
            if (!list) return;
            const filtered = cat === 'all' ? INSTRUMENT_LIBRARY : INSTRUMENT_LIBRARY.filter(i => i.category === cat);
            const placedIds = instrumentManager.placedInstruments.map(e => e.id);

            list.innerHTML = filtered.map((instr, _) => {
              const placedEntries = instrumentManager.placedInstruments.filter(e => e.id === instr.id);
              const placedCount = placedEntries.length;
              const selectedEntry = placedEntries.find((e, i) => instrumentManager.placedInstruments.indexOf(e) === instrumentManager.selectedIdx);
              return `
      <div style="display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:6px;margin-bottom:3px;background:${placedCount > 0 ? 'rgba(168,85,247,.08)' : 'transparent'};border:1px solid ${placedCount > 0 ? 'rgba(168,85,247,.25)' : 'transparent'};cursor:pointer" onclick="instrumentManager.place(INSTRUMENT_LIBRARY.find(x=>x.id==='${instr.id}'))" title="Cliquer pour ajouter dans la scène">
        <span style="font-size:18px;min-width:22px">${instr.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:${placedCount > 0 ? '#a855f7' : 'var(--text1)'};font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${instr.name}</div>
          <div style="color:var(--text3);font-size:8.5px">${instr.desc}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
          <button onclick="event.stopPropagation();instrumentManager.place(INSTRUMENT_LIBRARY.find(x=>x.id==='${instr.id}'))" style="background:#a855f7;color:#fff;border:none;padding:3px 7px;border-radius:4px;font-size:9px;cursor:pointer;white-space:nowrap">${placedCount > 0 ? '+' : 'Ajouter'}</button>
          ${placedCount > 0 ? `<span style="font-size:8px;color:#a855f7">${placedCount} en scène</span>` : ''}
        </div>
      </div>`;
            }).join('');
          }

          // ════════════════════════════════════════════════
          //  MPR Canvases
          // ════════════════════════════════════════════════
          // ════════════════════════════════════════════════
          //  VOLUME — procedural (demo) or real (DICOM upload)
          // ════════════════════════════════════════════════
          // Builds a 64³ Hounsfield-like volume so the 3 MPR planes are true orthogonal
          // slices of ONE coherent 3D dataset — not three independently-drawn canvases.
          function buildProceduralVolume() {
            const N = state.mpr.volSize;
            const vol = new Float32Array(N * N * N);
            const shape = SPECIALTY_SHAPE[state.mod] || SPECIALTY_SHAPE.cataracte;
            const rng = mulberry32(seedFromString(state.mod + '-vol'));
            // A handful of random blob centers for vessel-like high-density streaks
            const streaks = [];
            for (let i = 0; i < 5; i++) {
              streaks.push({
                a: [(rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6],
                b: [(rng() - 0.5) * 0.15, (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.15],
                r: 0.03 + rng() * 0.02
              });
            }
            const lesionC = [0.18, 0.08, 0.13];

            for (let z = 0; z < N; z++) {
              const nz = z / N - 0.5;
              for (let y = 0; y < N; y++) {
                const ny = y / N - 0.5;
                for (let x = 0; x < N; x++) {
                  const nx = x / N - 0.5;
                  const ex = nx / (0.36 * shape.axis.x), ey = ny / (0.36 * shape.axis.y), ez = nz / (0.36 * shape.axis.z);
                  const dist = Math.sqrt(ex * ex + ey * ey + ez * ez);
                  const wobble = Math.sin(nx * 22 + nz * 9) * 0.03 + Math.cos(ny * 18) * 0.02;
                  let hu = 0; // air/background
                  if (dist < 1.0 + wobble) {
                    hu = 38 + Math.sin(nx * 30) * Math.cos(ny * 26) * 6 + Math.sin(nz * 20) * 5; // soft tissue
                  }
                  // vessel/duct streaks: distance from point to segment a-b
                  for (const s of streaks) {
                    const px = nx - s.a[0], py = ny - s.a[1], pz = nz - s.a[2];
                    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], dz = s.b[2] - s.a[2];
                    const len2 = dx * dx + dy * dy + dz * dz || 1e-6;
                    let t = (px * dx + py * dy + pz * dz) / len2; t = Math.max(0, Math.min(1, t));
                    const cx = s.a[0] + dx * t, cy = s.a[1] + dy * t, cz = s.a[2] + dz * t;
                    const d2 = (nx - cx) ** 2 + (ny - cy) ** 2 + (nz - cz) ** 2;
                    if (d2 < s.r * s.r) hu = 210;
                  }
                  // lesion: small dense sphere
                  const dl = (nx - lesionC[0]) ** 2 + (ny - lesionC[1]) ** 2 + (nz - lesionC[2]) ** 2;
                  if (dl < 0.018) hu = 130;
                  vol[z * N * N + y * N + x] = hu;
                }
              }
            }
            state.mpr.volume = vol;
            state.mpr.fromDicom = false;
            state.mpr.plane = { axial: Math.floor(N / 2), coronal: Math.floor(N / 2), sagittal: Math.floor(N / 2) };
            state.mpr.max = { axial: N - 1, coronal: N - 1, sagittal: N - 1 };
          }

          function sampleVolume(x, y, z) {
            const N = state.mpr.volSize;
            x = Math.max(0, Math.min(N - 1, x | 0)); y = Math.max(0, Math.min(N - 1, y | 0)); z = Math.max(0, Math.min(N - 1, z | 0));
            return state.mpr.volume ? state.mpr.volume[z * N * N + y * N + x] : 0;
          }

          function initMPR() {
            if (!state.mpr.volume) buildProceduralVolume();
            ['axial', 'coronal', 'sagittal'].forEach(plane => {
              const canvas = document.getElementById('mpr-' + plane);
              const ctx = canvas.getContext('2d');
              const rect = canvas.parentElement.getBoundingClientRect();
              canvas.width = rect.width; canvas.height = rect.height;
              drawMPRSlice(ctx, canvas.width, canvas.height, plane);
              updateMprSliceLabel(plane);

              canvas.onmousemove = e => {
                const r = canvas.getBoundingClientRect();
                const x = Math.round((e.clientX - r.left) / r.width * state.mpr.volSize);
                const y = Math.round((e.clientY - r.top) / r.height * state.mpr.volSize);
                document.getElementById('mpr-' + plane + '-coords').textContent = `X:${x} Y:${y}`;
                if (state.mpr.dragging === plane) {
                  const dWW = (e.clientX - state.mpr.dragStartX) * 4;
                  const dWL = (state.mpr.dragStartY - e.clientY) * 2;
                  state.mpr.ww = Math.max(20, state.mpr.ww0 + dWW);
                  state.mpr.wl = state.mpr.wl0 + dWL;
                  ['axial', 'coronal', 'sagittal'].forEach(refreshMprCanvas);
                }
              };
              canvas.onmousedown = e => {
                state.mpr.dragging = plane;
                state.mpr.dragStartX = e.clientX; state.mpr.dragStartY = e.clientY;
                state.mpr.ww0 = state.mpr.ww; state.mpr.wl0 = state.mpr.wl;
              };
              window.addEventListener('mouseup', () => state.mpr.dragging = null);
              canvas.onwheel = e => {
                e.preventDefault();
                const dir = e.deltaY > 0 ? -1 : 1;
                state.mpr.plane[plane] = Math.max(0, Math.min(state.mpr.max[plane], state.mpr.plane[plane] + dir));
                refreshMprCanvas(plane);
                updateMprSliceLabel(plane);
              };
            });
          }

          function refreshMprCanvas(plane) {
            const canvas = document.getElementById('mpr-' + plane);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            drawMPRSlice(ctx, canvas.width, canvas.height, plane);
          }

          function updateMprSliceLabel(plane) {
            const el = document.getElementById('mpr-' + plane + '-slice');
            if (el) el.textContent = `${state.mpr.plane[plane]}/${state.mpr.max[plane]}`;
          }

          function drawMPRSlice(ctx, w, h, plane) {
            const N = state.mpr.volSize;
            const imgData = ctx.createImageData(w, h);
            const d = imgData.data;
            const mod = MODULES[state.mod];
            const col = new THREE.Color(mod.color);
            const idx = state.mpr.plane[plane];
            const ww = state.mpr.ww, wl = state.mpr.wl;
            const lo = wl - ww / 2, hi = wl + ww / 2;

            for (let py = 0; py < h; py++) {
              const vy = Math.floor(py / h * N);
              for (let px = 0; px < w; px++) {
                const vx = Math.floor(px / w * N);
                let hu;
                if (plane === 'axial') hu = sampleVolume(vx, vy, idx);
                else if (plane === 'coronal') hu = sampleVolume(vx, idx, vy);
                else hu = sampleVolume(idx, vy, vx);

                // window/level normalisation
                let g = (hu - lo) / (hi - lo); g = Math.max(0, Math.min(1, g));
                const isVessel = hu > 180 && hu < 230;
                const isLesion = hu >= 120 && hu <= 150;
                const i = (py * w + px) * 4;
                if (isVessel) {
                  d[i] = 255; d[i + 1] = 107; d[i + 2] = 53;
                } else if (isLesion) {
                  d[i] = 239; d[i + 1] = 68; d[i + 2] = 68;
                } else {
                  const base = g * 220;
                  d[i] = base * 0.5 + col.r * g * 60;
                  d[i + 1] = base * 0.5 + col.g * g * 60;
                  d[i + 2] = base * 0.5 + col.b * g * 60;
                }
                d[i + 3] = 255;
              }
            }
            ctx.putImageData(imgData, 0, 0);

            // Crosshair (position of the other two planes' current slice) for spatial context
            ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
            ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
            ctx.stroke();

            // Overlay labels
            ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(w - 64, h - 22, 60, 18);
            ctx.fillStyle = mod.color; ctx.font = '9px JetBrains Mono';
            ctx.fillText(plane.toUpperCase(), w - 60, h - 9);
            ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(2, 2, 74, 14);
            ctx.fillStyle = '#94a3b8'; ctx.font = '8px JetBrains Mono';
            ctx.fillText(`WW${Math.round(ww)} WL${Math.round(wl)}`, 5, 12);
            if (state.mpr.fromDicom) {
              ctx.fillStyle = 'rgba(34,197,94,.85)'; ctx.font = '8px JetBrains Mono';
              ctx.fillText('DICOM', w - 64, 12);
            }
          }

          // ════════════════════════════════════════════════
          //  SEGMENTATION IA RÉELLE — TotalSegmentator (backend) → maillages GLB réels
          //  Remplace/enrichit l'anatomie procédurale par de vrais maillages issus
          //  d'une inférence nnU-Net, quand le backend est configuré et équipé.
          //
          //  IMPORTANT : le pipeline réel (backend/segmentation_service.py) appelle
          //  TotalSegmentator avec les tâches liver_segments/liver_vessels/total —
          //  un modèle entraîné pour l'imagerie abdominale, qui n'a AUCUNE tâche pour
          //  les structures oculaires (cornée, cristallin, rétine ne font pas partie
          //  de son répertoire d'organes). Lancer ce pipeline sur une image ophtalmo
          //  ne produirait pas une "erreur propre" mais un résultat trompeur (ex.
          //  volume hépatique ≈ 0 mL présenté comme un résultat de segmentation valide
          //  pour un patient qui n'a pas de foie dans le champ d'acquisition). On
          //  bloque donc explicitement AVANT tout appel réseau, plutôt que de laisser
          //  l'utilisateur découvrir le problème après ~15 min d'attente.
          // ════════════════════════════════════════════════
          const REAL_SEGMENTATION_SUPPORTED_SPECIALTIES = []; // liver_segments/liver_vessels — aucun module ophtalmo actuel n'est couvert
          function realSegmentationUnavailableMessage() {
            const modName = (MODULES[state.mod] && MODULES[state.mod].name) || state.mod;
            return `Segmentation IA réelle indisponible pour « ${modName} » : le pipeline serveur (TotalSegmentator) est entraîné pour l'imagerie abdominale (foie) et n'a pas de tâche pour les structures oculaires. Seule l'anatomie procédurale est disponible pour ce module. Voir README « Limites connues ».`;
          }
          const gltfLoader = (typeof THREE !== 'undefined' && THREE.GLTFLoader) ? new THREE.GLTFLoader() : null;
          let realMeshGroup = null; // groupe Three.js contenant les maillages réels chargés
          // Géométrie bas-poly du foie réel (liver_total_lowpoly.glb), recentrée sur
          // l'origine — alimente le Jumeau numérique PBD à la place de l'anatomie
          // procédurale quand une segmentation réelle est disponible pour ce patient.
          let realLiverTwinGeometry = null;

          function setRealSegStatus(text) {
            const el = document.getElementById('real-seg-status');
            if (el) el.textContent = text;
          }

          async function runRealSegmentation(fileList) {
            if (guardReadOnly('lancement de segmentation')) return;
            if (!REAL_SEGMENTATION_SUPPORTED_SPECIALTIES.includes(state.mod)) {
              notify(realSegmentationUnavailableMessage(), 'warn');
              return;
            }
            const files = Array.from(fileList || []);
            if (!files.length) return;
            if (!state.settings.apiBase) {
              notify('Configurez l\'URL du backend dans ⚙ Paramètres pour utiliser la segmentation IA réelle.', 'warn');
              return;
            }
            const base = state.settings.apiBase.replace(/\/+$/, '');

            // Vérifie d'abord ce qui est réellement disponible côté serveur, pour un message honnête
            try {
              const cap = await (await fetch(base + '/segmentation/capabilities')).json();
              if (!cap.ready_for_real_segmentation) {
                const missing = ['totalsegmentator', 'dicom2nifti', 'nibabel'].filter(k => !cap[k]);
                notify('Segmentation réelle indisponible sur ce serveur (manque: ' + missing.join(', ') + '). Voir requirements-segmentation.txt.', 'warn');
                return;
              }
            } catch (e) {
              notify('Impossible de joindre le backend pour vérifier ses capacités : ' + e.message, 'warn');
              return;
            }

            const mod = MODULES[state.mod];
            // Correctif de sécurité patient : un job de segmentation peut prendre jusqu'à ~15 min
            // (pollSegmentationJob). Rien n'empêchait le chirurgien de changer de patient/module pendant
            // l'attente — le résultat, une fois prêt, s'appliquait alors AVEUGLÉMENT au patient affiché à
            // ce moment-là, pas à celui pour lequel le job avait été lancé (même famille de bug que
            // resetPatientState()/switchModule(), mais via une race condition asynchrone plutôt qu'un état
            // non réinitialisé). On capture l'ID patient au lancement et on revérifie à la réception.
            const startedForPatientId = mod.patient.id;
            setRealSegStatus('Envoi des fichiers...');
            showLoader('Segmentation IA réelle', 'Envoi des données au serveur (TotalSegmentator)...');

            try {
              const form = new FormData();
              files.forEach(f => form.append('files', f, f.name));
              const startResp = await fetch(`${base}/segmentation/auto?patient_id=${encodeURIComponent(mod.patient.id)}`, { method: 'POST', body: form });
              if (!startResp.ok) throw new Error('Démarrage du job échoué (' + startResp.status + ')');
              const { job_id } = await startResp.json();
              notify('Job de segmentation démarré (' + job_id + ') — inférence nnU-Net en cours...', 'info');

              const result = await pollSegmentationJob(base, job_id);

              hideLoader();
              const currentPatientId = MODULES[state.mod] && MODULES[state.mod].patient && MODULES[state.mod].patient.id;
              if (currentPatientId !== startedForPatientId) {
                notify(`⚠️ Segmentation de ${startedForPatientId} terminée, mais un autre patient (${currentPatientId}) est maintenant affiché — résultat ignoré pour éviter de mélanger les dossiers. Relancez la segmentation sur le patient ${startedForPatientId} si besoin.`, 'warn');
                setRealSegStatus('Résultat ignoré (patient changé pendant le calcul)');
                return;
              }
              await loadRealMeshesIntoScene(result, base);
              notify(`✓ Segmentation réelle chargée — ${result.segments.length} structure(s), foie total ${result.liver_total_ml} mL`, 'ok');
              setRealSegStatus('Segmentation IA réelle chargée ✓');
            } catch (e) {
              hideLoader();
              notify('Segmentation réelle échouée : ' + e.message, 'warn');
              setRealSegStatus('Échec — voir notification');
            }
          }

          // Polling partagé entre runRealSegmentation (upload direct) et
          // segmentExistingSeries (série déjà importée, PACS ou upload manuel) — pour
          // que le comportement d'attente (délai, messages de progression) ne diverge
          // pas entre les deux points d'entrée.
          async function pollSegmentationJob(base, job_id) {
            for (let i = 0; i < 180; i++) { // jusqu'à ~15 min de patience (180 * 5s)
              await new Promise(r => setTimeout(r, 5000));
              const st = await (await fetch(`${base}/segmentation/status/${job_id}`)).json();
              setRealSegStatus(st.progress || st.status);
              showLoader('Segmentation IA réelle', st.progress || 'Traitement en cours...');
              if (st.status === 'done') return st.result;
              if (st.status === 'error') throw new Error(st.error || 'Échec du job de segmentation.');
            }
            throw new Error('Délai dépassé — le job tourne peut-être encore côté serveur.');
          }

          // Segmente directement une série DÉJÀ IMPORTÉE (upload manuel, PACS DICOMweb
          // ou DIMSE) sans avoir à re-sélectionner les fichiers depuis l'ordinateur —
          // le pont entre l'import DICOM/PACS et le viewer 3D.
          async function segmentExistingSeries(seriesId, btn) {
            if (guardReadOnly('lancement de segmentation')) return;
            if (!REAL_SEGMENTATION_SUPPORTED_SPECIALTIES.includes(state.mod)) {
              notify(realSegmentationUnavailableMessage(), 'warn');
              return;
            }
            if (!state.settings.apiBase) {
              notify('Configurez l\'URL du backend dans ⚙ Paramètres pour utiliser la segmentation IA réelle.', 'warn');
              return;
            }
            const base = state.settings.apiBase.replace(/\/+$/, '');
            const originalText = btn.textContent;
            btn.disabled = true; btn.textContent = 'Démarrage...';
            // Même correctif de sécurité patient que runRealSegmentation() : ce job peut prendre jusqu'à
            // ~15 min, pendant lesquelles le chirurgien peut changer de patient/module.
            const startedForPatientId = MODULES[state.mod] && MODULES[state.mod].patient && MODULES[state.mod].patient.id;
            try {
              const token = await getBackendToken();
              const startResp = await fetch(`${base}/segmentation/from-series/${encodeURIComponent(seriesId)}`,
                { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
              if (!startResp.ok) {
                const body = await startResp.json().catch(() => ({}));
                throw new Error(body.detail || ('HTTP ' + startResp.status));
              }
              const { job_id } = await startResp.json();
              notify('Job de segmentation démarré (' + job_id + ') depuis la série importée...', 'info');
              showLoader('Segmentation IA réelle', 'Conversion DICOM → NIfTI puis inférence...');
              closeModal('dicom-viewer');

              const result = await pollSegmentationJob(base, job_id);

              hideLoader();
              const currentPatientId = MODULES[state.mod] && MODULES[state.mod].patient && MODULES[state.mod].patient.id;
              if (currentPatientId !== startedForPatientId) {
                notify(`⚠️ Segmentation de ${startedForPatientId} terminée, mais un autre patient (${currentPatientId}) est maintenant affiché — résultat ignoré pour éviter de mélanger les dossiers.`, 'warn');
                setRealSegStatus('Résultat ignoré (patient changé pendant le calcul)');
                btn.disabled = false; btn.textContent = originalText;
                return;
              }
              await loadRealMeshesIntoScene(result, base);
              notify(`✓ Segmentation chargée depuis la série importée — ${result.segments.length} structure(s)`, 'ok');
              setRealSegStatus('Segmentation IA réelle chargée ✓');
            } catch (e) {
              hideLoader();
              notify('Échec de la segmentation : ' + e.message, 'warn');
              btn.disabled = false; btn.textContent = originalText;
            }
          }

          // Extrait une géométrie unique, indexée et recentrée sur l'origine, à
          // partir d'un Object3D chargé via GLTFLoader (potentiellement plusieurs
          // sous-meshes). `applyMatrix4(child.matrixWorld)` fige l'échelle/position
          // déjà appliquées à l'objet racine (ex. le scale 0.012 mm->scène utilisé
          // ci-dessous) directement dans les positions des sommets. Contrairement à
          // la vue "Plan" (décalée de -0.6 pour cohabiter avec l'organe procédural),
          // le Jumeau n'a pas d'offset : on recentre donc sur (0,0,0).
          function extractRecenteredGeometryFromObject3D(object3D) {
            object3D.updateWorldMatrix(true, true);
            const geometries = [];
            object3D.traverse((child) => {
              if (child.isMesh && child.geometry && child.geometry.attributes.position) {
                const g = child.geometry.clone();
                g.applyMatrix4(child.matrixWorld);
                geometries.push(g);
              }
            });
            if (!geometries.length) return null;

            const merged = (geometries.length > 1 && THREE.BufferGeometryUtils)
              ? THREE.BufferGeometryUtils.mergeBufferGeometries(geometries, false)
              : geometries[0];
            if (!merged) return null;

            const indexed = mergeGeometryVertices(merged);
            indexed.computeBoundingBox();
            const center = new THREE.Vector3();
            indexed.boundingBox.getCenter(center);
            indexed.translate(-center.x, -center.y, -center.z);
            return indexed;
          }

          async function loadRealMeshesIntoScene(result, base) {
            if (!gltfLoader) { notify('THREE.GLTFLoader non chargé — impossible d\'afficher les maillages réels.', 'warn'); return; }

            if (realMeshGroup) { scene.remove(realMeshGroup); }
            realMeshGroup = new THREE.Group();
            realMeshGroup.name = 'realSegmentationMeshes';

            // Une fois de vrais maillages chargés, on estompe l'anatomie procédurale
            // pour laisser la vraie segmentation prendre le dessus visuellement.
            if (organMesh) organMesh.material.opacity = 0.08;
            if (wireframeMesh) wireframeMesh.material.opacity = 0.03;
            if (vesselGroup) vesselGroup.visible = false;

            const allEntries = [...(result.segments || []), ...(result.vessels || [])];
            let loaded = 0;
            for (const entry of allEntries) {
              if (!entry.mesh_url) continue;
              const url = base + entry.mesh_url;
              try {
                const gltf = await new Promise((resolve, reject) => gltfLoader.load(url, resolve, undefined, reject));
                const obj = gltf.scene;
                obj.userData = { label: entry.label || entry.name || entry.organ, kind: 'real-mesh', volume_ml: entry.volume_ml };
                // Les maillages sortent du pipeline en mm réels — on les ramène à l'échelle
                // de la scène (~1-2 unités) de façon cohérente avec l'anatomie procédurale.
                obj.scale.set(0.012, 0.012, 0.012);
                obj.position.set(-0.6, 0, 0);
                realMeshGroup.add(obj);
                loaded++;
              } catch (e) {
                console.warn('Maillage non chargé:', entry.label, e);
              }
            }
            scene.add(realMeshGroup);
            notify(`${loaded} maillage(s) 3D réel(s) chargé(s) dans la scène`, loaded > 0 ? 'ok' : 'warn');

            // Maillage bas-poly du foie, dédié au Jumeau numérique PBD (voir
            // segmentation_service.py:_maybe_build_lowpoly_twin_mesh) — chargé
            // séparément du groupe ci-dessus car recentré différemment (pas
            // d'offset -0.6) et beaucoup plus léger (~1500 faces, PBD-friendly).
            realLiverTwinGeometry = null;
            const liverEntry = (result.segments || []).find(e => e.organ === 'liver' && e.mesh_url_lowpoly);
            if (liverEntry) {
              try {
                const gltf = await new Promise((resolve, reject) =>
                  gltfLoader.load(base + liverEntry.mesh_url_lowpoly, resolve, undefined, reject));
                // Même conversion mm réels -> échelle scène que dans la boucle
                // ci-dessus (obj.scale.set(0.012,...)) : sans elle, le maillage
                // resterait à l'échelle réelle (~100-200 unités de rayon) au lieu
                // de ~1-2 unités, complètement disproportionné dans la scène du Jumeau.
                gltf.scene.scale.set(0.012, 0.012, 0.012);
                realLiverTwinGeometry = extractRecenteredGeometryFromObject3D(gltf.scene);
              } catch (e) {
                console.warn('Maillage bas-poly (Jumeau numérique) non chargé:', e);
              }
            }
            // Si l'onglet Jumeau est déjà ouvert, on le rafraîchit avec le vrai
            // maillage qui vient de finir de charger, au lieu d'attendre un
            // changement d'onglet.
            if (typeof twin !== 'undefined' && twin.active) { resetDigitalTwin(); }
          }

          // ════════════════════════════════════════════════
          //  PACS — recherche QIDO-RS + import WADO-RS (priorité 4 feuille de route)
          //  Réutilise getBackendToken() (déclaré plus bas, hissé par le parseur JS
          //  comme toute function declaration du même bloc <script>).
          // ════════════════════════════════════════════════
          function openPacsPanel() {
            if (!state.settings.apiBase) {
              notify('Configurez l\'URL du backend dans ⚙ Paramètres pour utiliser le connecteur PACS.', 'warn');
              return;
            }
            const mod = MODULES[state.mod];
            document.getElementById('pacs-active-patient').textContent = `${mod.patient.nom} (${mod.patient.id})`;
            document.getElementById('pacs-filter-patientid').value = '';
            document.getElementById('pacs-filter-name').value = '';
            document.getElementById('pacs-filter-date').value = '';
            document.getElementById('pacs-results').innerHTML = '';
            openModal('pacs');
          }

          async function pacsAuthedFetch(path, opts = {}) {
            const base = state.settings.apiBase.replace(/\/+$/, '');
            const token = await getBackendToken();
            const headers = Object.assign({ 'Authorization': 'Bearer ' + token }, opts.headers || {});
            const r = await fetch(base + path, Object.assign({}, opts, { headers }));
            if (!r.ok) {
              let detail = r.status;
              try { detail = (await r.json()).detail || detail; } catch (e) { }
              throw new Error(String(detail));
            }
            return r.json();
          }

          async function searchPacsStudies() {
            const results = document.getElementById('pacs-results');
            results.innerHTML = '<div style="color:var(--text3)">Recherche en cours (QIDO-RS)...</div>';
            const qidoUrl = document.getElementById('pacs-qido-url').value.trim();
            const params = new URLSearchParams();
            const pid = document.getElementById('pacs-filter-patientid').value.trim();
            const name = document.getElementById('pacs-filter-name').value.trim();
            const date = document.getElementById('pacs-filter-date').value.trim();
            if (pid) params.set('patient_id', pid);
            if (name) params.set('patient_name', name);
            if (date) params.set('study_date', date);
            if (qidoUrl) params.set('qido_url', qidoUrl);
            try {
              const studies = await pacsAuthedFetch('/pacs/studies?' + params.toString());
              if (!studies.length) { results.innerHTML = '<div style="color:var(--text3)">Aucune étude trouvée.</div>'; return; }
              results.innerHTML = studies.map((s, i) => `
      <div style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:6px">
        <div><strong>${s.patient_name || '?'}</strong> — ${s.patient_id || '?'} — ${s.study_date || '?'}</div>
        <div style="color:var(--text3)">${s.study_description || ''} ${s.accession_number ? ('· Acc. ' + s.accession_number) : ''}</div>
        <button class="btn btn-secondary" style="margin-top:6px" onclick="loadPacsSeries('${s.study_uid}', this)">Voir les séries</button>
        <div class="pacs-series-list" style="margin-top:6px"></div>
      </div>`).join('');
            } catch (e) {
              results.innerHTML = `<div style="color:#ef4444">Échec de la recherche PACS : ${e.message}</div>`;
            }
          }

          async function loadPacsSeries(studyUid, btn) {
            const container = btn.parentElement.querySelector('.pacs-series-list');
            container.innerHTML = 'Chargement des séries (QIDO-RS)...';
            const qidoUrl = document.getElementById('pacs-qido-url').value.trim();
            const q = qidoUrl ? ('?qido_url=' + encodeURIComponent(qidoUrl)) : '';
            try {
              const series = await pacsAuthedFetch(`/pacs/studies/${encodeURIComponent(studyUid)}/series${q}`);
              if (!series.length) { container.innerHTML = '<span style="color:var(--text3)">Aucune série.</span>'; return; }
              container.innerHTML = series.map(s => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-top:1px solid var(--border)">
        <span>${s.modality || '?'} — ${s.series_description || 'sans description'} (${s.num_instances || '?'} instance(s))</span>
        <button class="btn btn-primary" style="font-size:9px;padding:3px 8px" onclick="importPacsSeries('${studyUid}','${s.series_uid}', this)">⬇ Importer (WADO-RS)</button>
      </div>`).join('');
            } catch (e) {
              container.innerHTML = `<span style="color:#ef4444">Échec : ${e.message}</span>`;
            }
          }

          async function importPacsSeries(studyUid, seriesUid, btn) {
            const mod = MODULES[state.mod];
            btn.disabled = true; btn.textContent = 'Import en cours...';
            const qidoUrl = document.getElementById('pacs-qido-url').value.trim();
            try {
              const body = { patient_id: mod.patient.id, study_uid: studyUid, series_uid: seriesUid };
              if (qidoUrl) body.qido_url = qidoUrl;
              const result = await pacsAuthedFetch('/pacs/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
              notify(`✓ Série importée (${result.num_instances} instance(s), ${result.modality}) — visible dans /dicom/${mod.patient.id}`, 'ok');
              btn.textContent = '✓ Importée';
            } catch (e) {
              notify('Échec de l\'import PACS : ' + e.message, 'warn');
              btn.disabled = false; btn.textContent = '⬇ Importer (WADO-RS)';
            }
          }

          // ════════════════════════════════════════════════
          //  AUDIT TRAIL — jusqu'ici l'onglet de nav ne faisait rien du tout
          //  (même défaut que "Jumeau Num." avant correction). Le backend expose déjà
          //  GET /audit et l'écrit à chaque action sensible : il manquait juste un
          //  panneau pour le consulter.
          // ════════════════════════════════════════════════
          function openAuditTrail() {
            if (!state.settings.apiBase) {
              notify('Configurez l\'URL du backend dans ⚙ Paramètres pour consulter le journal d\'audit.', 'warn');
              return;
            }
            const mod = MODULES[state.mod];
            document.getElementById('audit-filter-patient').value = mod && mod.patient ? mod.patient.id : '';
            document.getElementById('audit-filter-user').value = '';
            openModal('audit');
            loadAuditTrail();
          }

          async function loadAuditTrail() {
            const results = document.getElementById('audit-results');
            results.innerHTML = '<div style="color:var(--text3)">Chargement...</div>';
            const patientId = document.getElementById('audit-filter-patient').value.trim();
            const username = document.getElementById('audit-filter-user').value.trim();
            const params = new URLSearchParams({ limit: '100' });
            if (patientId) params.set('patient_id', patientId);
            if (username) params.set('username', username);
            try {
              const rows = await pacsAuthedFetch('/audit?' + params.toString());
              if (!rows.length) { results.innerHTML = '<div style="color:var(--text3)">Aucune entrée.</div>'; return; }
              results.innerHTML = `<table style="width:100%;border-collapse:collapse">
      <thead><tr style="text-align:left;border-bottom:1px solid var(--border);color:var(--text3)">
        <th style="padding:4px">Date/heure</th><th style="padding:4px">Utilisateur</th>
        <th style="padding:4px">Action</th><th style="padding:4px">Patient</th><th style="padding:4px">Statut</th>
      </tr></thead><tbody>
      ${rows.map(r => `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:4px;white-space:nowrap">${I18N.formatDate(new Date(r.created_at), { dateStyle: 'short', timeStyle: 'medium' })}</td>
        <td style="padding:4px">${r.username || '—'}</td>
        <td style="padding:4px">${r.action}${r.resource ? ` <span style="color:var(--text3)">(${r.resource})</span>` : ''}</td>
        <td style="padding:4px">${r.patient_id || '—'}</td>
        <td style="padding:4px;color:${r.niveau === 'error' ? '#ef4444' : r.niveau === 'ok' ? '#22c55e' : 'var(--text3)'}">${r.niveau}</td>
      </tr>`).join('')}
      </tbody></table>`;
            } catch (e) {
              results.innerHTML = `<div style="color:#ef4444">Échec du chargement : ${e.message}</div>`;
            }
          }

          // ════════════════════════════════════════════════
          //  DICOM — panneau listant les séries enregistrées (import manuel + PACS)
          // ════════════════════════════════════════════════
          function openDicomViewer() {
            if (!state.settings.apiBase) {
              notify('Configurez l\'URL du backend dans ⚙ Paramètres pour lister les séries DICOM.', 'warn');
              return;
            }
            const mod = MODULES[state.mod];
            document.getElementById('dicom-viewer-patient').textContent = mod.patient.nom + ' (' + mod.patient.id + ')';
            openModal('dicom-viewer');
            loadDicomSeriesList();
          }

          async function loadDicomSeriesList() {
            const results = document.getElementById('dicom-viewer-results');
            results.innerHTML = '<div style="color:var(--text3)">Chargement...</div>';
            const mod = MODULES[state.mod];
            try {
              const rows = await pacsAuthedFetch('/dicom/' + encodeURIComponent(mod.patient.id));
              if (!rows.length) { results.innerHTML = '<div style="color:var(--text3)">Aucune série enregistrée pour ce patient. Utilisez « 📁 Importer DICOM » ou « 📡 PACS » dans la vue Plan.</div>'; return; }
              results.innerHTML = rows.map(s => `
      <div style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:6px">
        <div><strong>${s.modality}</strong> — ${s.filename || 'sans nom'} — ${s.num_slices} coupe(s)</div>
        <div style="color:var(--text3)">${s.rows}×${s.cols}px · épaisseur ${s.slice_thickness_mm}mm · série ${s.series_uid.slice(0, 18)}...</div>
        ${s.local_path
                  ? `<button class="btn btn-primary" style="font-size:9px;padding:3px 8px;margin-top:6px" onclick="segmentExistingSeries('${s.id}', this)">🔬 Segmenter cette série</button>`
                  : `<div style="font-size:9px;color:var(--text3);margin-top:6px">⚠ Pixels non sauvegardés (série importée avant la correction) — réimportez-la pour pouvoir la segmenter.</div>`}
      </div>`).join('');
            } catch (e) {
              results.innerHTML = `<div style="color:#ef4444">Échec du chargement : ${e.message}</div>`;
            }
          }

          // ════════════════════════════════════════════════
          //  RÉALITÉ AUGMENTÉE — vraie détection/lancement WebXR, pas de simulation.
          //  Portée honnête : rendu AR sans suivi de marqueur ni recalage patient —
          //  affiche l'organe en surimpression, ce n'est pas un dispositif de
          //  navigation chirurgicale.
          // ════════════════════════════════════════════════
          async function openArPanel() {
            openModal('ar');
            const statusEl = document.getElementById('ar-status');
            const launchEl = document.getElementById('ar-launch');
            const unsupportedEl = document.getElementById('ar-unsupported');
            launchEl.style.display = 'none'; unsupportedEl.style.display = 'none';

            if (!navigator.xr) {
              statusEl.textContent = 'navigator.xr indisponible dans ce navigateur.';
              unsupportedEl.style.display = 'block';
              return;
            }
            try {
              const supported = await navigator.xr.isSessionSupported('immersive-ar');
              if (supported) {
                statusEl.textContent = '✓ Ce navigateur/appareil supporte la réalité augmentée WebXR.';
                launchEl.style.display = 'block';
              } else {
                statusEl.textContent = 'WebXR détecté, mais la session "immersive-ar" n\'est pas supportée ici.';
                unsupportedEl.style.display = 'block';
              }
            } catch (e) {
              statusEl.textContent = 'Impossible de vérifier le support AR : ' + e.message;
              unsupportedEl.style.display = 'block';
            }
          }

          let arSession = null;
          async function launchArSession() {
            try {
              arSession = await navigator.xr.requestSession('immersive-ar', { optionalFeatures: ['dom-overlay'], domOverlay: { root: document.body } });
              notify('Session WebXR AR démarrée — placez l\'appareil face à une surface.', 'ok');
              closeModal('ar');
              arSession.addEventListener('end', () => { notify('Session AR terminée.', 'info'); arSession = null; });
              // Rendu minimal : la scène/renderer existants ne sont pas configurés en
              // mode XR (renderer.xr.enabled=false par défaut) — brancher réellement
              // le rendu WebXR (base layer, boucle xrSession.requestAnimationFrame,
              // pose de la caméra) est un chantier à part entière, hors du périmètre
              // de cette session. Ce qui est livré ici est réel et honnête : une
              // vraie session immersive-ar démarre bel et bien sur un appareil
              // compatible ; le rendu de l'organe dedans reste à connecter.
            } catch (e) {
              notify('Échec du lancement de la session AR : ' + e.message, 'warn');
            }
          }

          // ════════════════════════════════════════════════
          //  DICOM — real slice loading (dicom-parser)
          // ════════════════════════════════════════════════
          // Utilitaire: laisse respirer le main thread (évite le freeze UI)
          function _yieldMainThread() {
            return new Promise(r => setTimeout(r, 0));
          }

          async function loadDicomFiles(fileList) {
            if (guardReadOnly('import DICOM')) return;
            if (!window.dicomParser) { notify('dicom-parser non chargé', 'warn'); return; }
            const files = Array.from(fileList);
            if (!files.length) return;
            showLoader('Import DICOM', I18N.t('dicom.importing', { count: files.length }));
            try {
              const slices = [];
              for (let fi = 0; fi < files.length; fi++) {
                const f = files[fi];
                const buf = new Uint8Array(await f.arrayBuffer());
                let ds;
                try { ds = dicomParser.parseDicom(buf); } catch (e) { console.warn('Erreur parsing DICOM:', e); continue; }

                // Vérifier si l'image est compressée (JPEG etc.)
                const ts = ds.string('x00020010');
                if (ts && ts.startsWith('1.2.840.10008.1.2.4.')) {
                  notify('Image DICOM compressée détectée. Décompression locale non supportée.', 'warn');
                  continue;
                }

                const rows = ds.uint16('x00280010'), cols = ds.uint16('x00280011');
                const pxElement = ds.elements.x7fe00010;
                if (!rows || !cols || !pxElement) continue;

                // Vérifier si PixelData est encapsulé
                if (pxElement.length === 4294967295) {
                  notify('Format DICOM encapsulé non supporté en local.', 'warn');
                  continue;
                }

                const bitsAlloc = ds.uint16('x00280100') || 16;
                const pixelRep = ds.uint16('x00280103') || 0; // 0=unsigned, 1=signed
                const intercept = parseFloat(ds.string('x00281052') || '0');
                const slope = parseFloat(ds.string('x00281053') || '1');
                const instanceStr = ds.string('x00200013');
                const instanceNum = instanceStr ? parseInt(instanceStr, 10) : 0;
                // Parse spacing tags
                const pixelSpacingStr = ds.string('x00280030');
                let spacingX = 1, spacingY = 1;
                if (pixelSpacingStr) {
                  const vals = pixelSpacingStr.split('\\').map(parseFloat);
                  if (vals.length >= 2) {
                    spacingX = vals[0];
                    spacingY = vals[1];
                  }
                }
                const sliceThickness = parseFloat(ds.string('x00180050') || '1');

                let pixels;
                const pxBuf = buf.buffer.slice(buf.byteOffset + pxElement.dataOffset, buf.byteOffset + pxElement.dataOffset + pxElement.length);
                if (bitsAlloc === 16) {
                  pixels = pixelRep === 1 ? new Int16Array(pxBuf) : new Uint16Array(pxBuf);
                } else {
                  pixels = new Uint8Array(pxBuf);
                }
                slices.push({ rows, cols, pixels, intercept, slope, z: instanceNum, spacingX, spacingY, sliceThickness });

                // Yield après chaque fichier (sécurité contre gros dossiers)
                if ((fi & 3) === 3) await _yieldMainThread();
              }
              if (!slices.length) { notify('Aucune image DICOM valide détectée', 'warn'); hideLoader(); return; }

              // Tri des coupes par numéro d'instance pour reconstruire le volume correctement
              slices.sort((a, b) => a.z - b.z);

              // Resample every slice into an N x N grid and stack into an N³ volume (HU values)
              // → fait par tranches Z avec yield entre chaque tranche pour ne pas freezer l'UI
              const N = state.mpr.volSize;
              const vol = new Float32Array(N * N * N);
              showLoader('Import DICOM', I18N.t('dicom.resampling', { n: N }));
              for (let z = 0; z < N; z++) {
                const s = slices[Math.min(slices.length - 1, Math.floor(z / N * slices.length))];
                for (let y = 0; y < N; y++) {
                  const sy = Math.floor(y / N * s.rows);
                  for (let x = 0; x < N; x++) {
                    const sx = Math.floor(x / N * s.cols);
                    let raw = s.pixels[sy * s.cols + sx];
                    if (raw === undefined || isNaN(raw)) raw = -1024;
                    const hu = raw * s.slope + s.intercept;
                    vol[z * N * N + y * N + x] = isNaN(hu) ? -1024 : hu;
                  }
                }
                // Yield toutes les 8 tranches Z (≈ 1ms chacune) → respiration UI
                if ((z & 7) === 7) await _yieldMainThread();
              }

              state.mpr.volume = vol;
              state.mpr.fromDicom = true;
              // Fenêtrage clinique standard (WW=400 HU, WL=40 HU)
              state.mpr.ww = 400;
              state.mpr.wl = 40;
              state.mpr.plane = { axial: Math.floor(N / 2), coronal: Math.floor(N / 2), sagittal: Math.floor(N / 2) };
              state.mpr.max = { axial: N - 1, coronal: N - 1, sagittal: N - 1 };
              // Set spacing from first slice (assumes uniform spacing)
              if (slices.length) {
                const first = slices[0];
                state.mpr.spacing = { x: first.spacingX, y: first.spacingY, z: first.sliceThickness };
                const spacingEls = document.querySelectorAll('.mpr-spacing');
                spacingEls.forEach(el => { el.textContent = `Spacing: ${first.spacingX}×${first.spacingY}×${first.sliceThickness} mm`; });
              }

              // Compute min/max HU for proper window/level
              let minHU = Infinity, maxHU = -Infinity;
              for (let i = 0; i < vol.length; i++) {
                const v = vol[i];
                if (v < minHU) minHU = v;
                if (v > maxHU) maxHU = v;
              }
              // Set window/level to cover full HU range (or a typical abdominal range)
              const ww = maxHU - minHU;
              const wl = (maxHU + minHU) / 2;
              state.mpr.ww = Math.max(80, Math.min(400, ww)); // clamp for UI sliders
              state.mpr.wl = Math.max(-200, Math.min(800, wl));
              // Update 3D threshold (tissu mou ~30 HU)
              const autoThreshold3D = 30;
              const sliderEl = document.getElementById('dicom3d-threshold');
              const sliderValEl = document.getElementById('dicom3d-threshold-val');
              if (sliderEl) { sliderEl.min = '-200'; sliderEl.max = '800'; sliderEl.value = autoThreshold3D; }
              if (sliderValEl) sliderValEl.textContent = autoThreshold3D;

              await _yieldMainThread();
              initMPR();
              notify(I18N.t('dicom.loaded', { count: slices.length, ww: state.mpr.ww.toFixed(0), wl: state.mpr.wl.toFixed(0) }), 'ok');

              // Reconstruction 3D — laissée à un setTimeout pour ne pas bloquer la notification
              setTimeout(() => {
                try {
                  showDicomIn3D(autoThreshold3D);
                  hideLoader();
                } catch (e) {
                  console.error('showDicomIn3D failed:', e);
                  notify(I18N.t('dicom.reconstructionFailed', { error: e.message }), 'warn');
                  hideLoader();
                }
              }, 50);

              // Re‑draw after layout settles (canvas may be 0‑size on first pass)
              setTimeout(() => {
                ['axial', 'coronal', 'sagittal'].forEach(plane => {
                  const c = document.getElementById('mpr-' + plane);
                  if (!c) return;
                  const rect = c.parentElement.getBoundingClientRect();
                  if (rect.width > 10) { c.width = rect.width; c.height = rect.height; }
                  drawMPRSlice(c.getContext('2d'), c.width, c.height, plane);
                });
              }, 500);
            } catch (e) {
              console.error(e);
              notify('Erreur de lecture DICOM: ' + e.message, 'warn');
              hideLoader();
            }
          }


          // ════════════════════════════════════════════════
          //  DICOM → VIEWER 3D — Voxel Mesh (BoxGeometry par chunk)
          //  Approche déterministe et fiable : chaque voxel au-dessus du seuil est rendu
          //  comme un petit cube. Pour limiter le nombre de meshes, on groupe les voxels
          //  en chunks 8×8×8 → 1 InstancedMesh par chunk.
          //  Résultat : visuel "minecraft-like" voxelisé, mais lisible cliniquement
          //  et surtout GARANTI visible dans la scène Three.js.
          // ════════════════════════════════════════════════
          let dicomIsoMesh = null;            // Group contenant les InstancedMesh chunks
          let dicomIsoEnabled = false;        // isosurface visible ou non
          let dicomIsoSize = 0;               // taille du cube (côté)
          let dicomIsoThreshold = 30;         // dernier seuil utilisé

          const DICOM_VOXEL_CHUNK = 8;        // taille d'un chunk (côtés)

          // BoxGeometry partagée : 1×1×1 cube (chaque instance aura sa propre position)
          let _dicomSharedBox = null;
          function _dicomGetSharedBox() {
            if (!_dicomSharedBox && typeof THREE !== 'undefined') {
              _dicomSharedBox = new THREE.BoxGeometry(1, 1, 1);
              _dicomSharedBox.computeVertexNormals();
            }
            return _dicomSharedBox;
          }

          function _dicomSafeScene() {
            return (typeof scene !== 'undefined' && scene) ? scene : null;
          }

          function _dicomDisposeIso() {
            const sc = _dicomSafeScene();
            if (dicomIsoMesh && sc) { sc.remove(dicomIsoMesh); }
            if (dicomIsoMesh) {
              dicomIsoMesh.traverse(o => {
                try { o.geometry && o.geometry.dispose && o.geometry.dispose(); } catch (e) { }
                try { o.material && o.material.dispose && o.material.dispose(); } catch (e) { }
              });
            }
            dicomIsoMesh = null;
          }

          // Construit le mesh voxel à partir de state.mpr.volume. Synchrone mais
          // chunké : on parcourt l'espace par blocs de 8×8×8 voxels. Chaque chunk
          // produit au pire 512 voxels → 1 InstancedMesh = 1 draw call.
          function _dicomBuildVoxelMesh(vol, N, threshold) {
            const sharedBox = _dicomGetSharedBox();
            if (!sharedBox) {
              console.warn('_dicomBuildVoxelMesh: THREE non disponible');
              return null;
            }
            const sc = _dicomSafeScene();
            if (!sc) return null;

            const group = new THREE.Group();
            group.name = 'dicom-voxel-group';
            const color = state.mod === 'cataracte' ? 0x4fc3f7 : (state.mod === 'retine' ? 0xef4444 : 0x22c55e);
            const mat = new THREE.MeshStandardMaterial({
              color, transparent: true, opacity: 0.85,
              roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide
            });

            // Compteur total de voxels actifs (pour la notification)
            let totalActive = 0;
            let chunksBuilt = 0;

            // Dimensions du cube en unités Three.js : 64 unités (1 voxel = 1 unité)
            // Centré sur l'origine.
            const half = N * 0.5;

            // Parcours par chunks
            for (let cz = 0; cz < N; cz += DICOM_VOXEL_CHUNK) {
              for (let cy = 0; cy < N; cy += DICOM_VOXEL_CHUNK) {
                for (let cx = 0; cx < N; cx += DICOM_VOXEL_CHUNK) {
                  // Compter les voxels actifs dans ce chunk
                  const positions = [];
                  for (let z = cz; z < Math.min(N, cz + DICOM_VOXEL_CHUNK); z++) {
                    for (let y = cy; y < Math.min(N, cy + DICOM_VOXEL_CHUNK); y++) {
                      for (let x = cx; x < Math.min(N, cx + DICOM_VOXEL_CHUNK); x++) {
                        if (vol[z * N * N + y * N + x] >= threshold) {
                          // Position centrée sur le voxel
                          positions.push(x - half + 0.5, y - half + 0.5, z - half + 0.5);
                        }
                      }
                    }
                  }
                  if (positions.length === 0) continue;
                  const count = positions.length / 3;
                  totalActive += count;

                  // InstancedMesh : 1 draw call pour tout le chunk
                  const inst = new THREE.InstancedMesh(sharedBox, mat, count);
                  inst.name = `dicom-chunk-${cx}-${cy}-${cz}`;
                  const m = new THREE.Matrix4();
                  for (let i = 0; i < count; i++) {
                    m.setPosition(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
                    inst.setMatrixAt(i, m);
                  }
                  inst.instanceMatrix.needsUpdate = true;
                  group.add(inst);
                  chunksBuilt++;
                }
              }
            }

            if (totalActive === 0) {
              return null; // aucun voxel au-dessus du seuil
            }
            return { group, totalActive, chunksBuilt };
          }

          async function showDicomIn3D(threshold) {
            const sc = _dicomSafeScene();
            if (!sc) {
              console.warn('showDicomIn3D: scène Three.js non initialisée (sélectionnez d\'abord un module)');
              notify('Sélectionnez d\'abord un module depuis le Hub', 'warn');
              return;
            }
            if (typeof THREE === 'undefined') {
              console.warn('showDicomIn3D: THREE non chargé');
              return;
            }
            if (!state.mpr.volume) {
              notify(I18N.t('dicom.noVolume'), 'warn');
              return;
            }

            const N = state.mpr.volSize;
            const vol = state.mpr.volume;
            dicomIsoSize = N;
            dicomIsoThreshold = threshold;

            _dicomDisposeIso();

            showLoader('Reconstruction 3D', I18N.t('dicom.voxelizing', { threshold }));
            // Petite pause pour afficher le loader
            await new Promise(r => setTimeout(r, 30));

            const built = _dicomBuildVoxelMesh(vol, N, threshold);
            if (!built) {
              hideLoader();
              notify(I18N.t('dicom.noVoxelsAboveThreshold', { threshold }), 'warn');
              return;
            }

            dicomIsoMesh = built.group;
            sc.add(dicomIsoMesh);
            dicomIsoEnabled = true;

            // Estompe l'anatomie procédurale pendant que les voxels DICOM RÉELS sont affichés — sans
            // ça, les deux se superposaient à l'écran (échelles et positions différentes), rendant les
            // voxels DICOM difficiles à distinguer de l'organe procédural. Même traitement que
            // loadRealMeshesIntoScene()/digitalTwinPipeline pour les vraies segmentations IA.
            if (organMesh) organMesh.material.opacity = 0.05;
            if (wireframeMesh) wireframeMesh.material.opacity = 0.02;
            if (vesselGroup) vesselGroup.visible = false;

            // Recentrer la caméra pour voir le cube 64³
            if (typeof camera !== 'undefined' && camera) {
              camera.position.set(0, 0, Math.max(N * 1.2, 4));
              camera.lookAt(0, 0, 0);
            }
            hideLoader();
            notify(I18N.t('dicom.realVolumeShown', { threshold, count: built.totalActive, chunks: built.chunksBuilt }), 'ok');
          }

          function hideDicomIn3D() {
            _dicomDisposeIso();
            dicomIsoEnabled = false;
            // Restaure l'anatomie procédurale estompée par showDicomIn3D().
            if (organMesh) organMesh.material.opacity = 0.42;
            if (wireframeMesh) wireframeMesh.material.opacity = 0.09;
            if (vesselGroup) vesselGroup.visible = true;
            notify(I18N.t('dicom.hidden'), 'info');
          }

          // ════════════════════════════════════════════════
          //  MANIPULATION DU MESH DICOM DANS LE VIEWER 3D
          //  Visibilité, recadrage caméra, reset, spin auto, raccourcis clavier
          // ════════════════════════════════════════════════
          let dicomSpinEnabled = true;          // rotation auto activée par défaut
          let dicomSpinSpeed = 0.002;           // rad/frame (même vitesse que organMesh)

          function toggleDicomIn3D() {
            if (!dicomIsoMesh) {
              // Pas encore construit : on (re)génère au seuil courant
              if (state.mpr.fromDicom && state.mpr.volume) {
                showDicomIn3D(dicomIsoThreshold || 30).catch(e => console.error(e));
              } else {
                notify(I18N.t('dicom.noVolume'), 'warn');
              }
              return;
            }
            if (dicomIsoMesh.visible) {
              dicomIsoMesh.visible = false;
              dicomIsoEnabled = false;
              if (organMesh) organMesh.material.opacity = 0.42;
              if (wireframeMesh) wireframeMesh.material.opacity = 0.09;
              if (vesselGroup) vesselGroup.visible = true;
              notify(I18N.t('dicom.hidden'), 'info');
            } else {
              dicomIsoMesh.visible = true;
              dicomIsoEnabled = true;
              if (organMesh) organMesh.material.opacity = 0.05;
              if (wireframeMesh) wireframeMesh.material.opacity = 0.02;
              if (vesselGroup) vesselGroup.visible = false;
              notify(I18N.t('dicom.shown'), 'ok');
            }
          }

          function recenterDicomIn3D() {
            if (typeof camera === 'undefined' || !camera) {
              notify('Caméra non initialisée', 'warn');
              return;
            }
            const N = (typeof dicomIsoSize !== 'undefined' && dicomIsoSize) ? dicomIsoSize : 64;
            // Cadre l'organe : distance ≈ 1.4 × la taille du cube
            const dist = N * 1.4;
            camera.position.set(0, 0, dist);
            camera.lookAt(0, 0, 0);
            // Remise à zéro des rotations utilisateur (souris)
            if (typeof rotX !== 'undefined') rotX = 0;
            if (typeof rotY !== 'undefined') rotY = 0;
            notify(`Caméra recadrée — distance ${dist.toFixed(0)} unités (touche R)`, 'ok');
          }

          function resetDicomView() {
            if (typeof camera === 'undefined' || !camera) return;
            // Réinitialise la caméra à sa position d'origine
            camera.position.set(0, 0, 5);
            camera.lookAt(0, 0, 0);
            // Réinitialise les rotations accumulées
            if (typeof rotX !== 'undefined') rotX = 0;
            if (typeof rotY !== 'undefined') rotY = 0;
            // Remet à zéro la rotation de l'organe DICOM et de l'organe procédural
            if (typeof dicomIsoMesh !== 'undefined' && dicomIsoMesh) {
              dicomIsoMesh.rotation.set(0, 0, 0);
            }
            if (typeof organMesh !== 'undefined' && organMesh) {
              organMesh.rotation.set(0, 0, 0);
            }
            notify('Vue réinitialisée (touche Espace)', 'ok');
          }

          function toggleDicomSpin() {
            dicomSpinEnabled = !dicomSpinEnabled;
            const btn = document.getElementById('dicom3d-spin');
            if (btn) {
              btn.classList.toggle('on', dicomSpinEnabled);
              btn.textContent = dicomSpinEnabled ? '🌀 Spin ON' : '🌀 Spin OFF';
            }
            notify('Rotation auto ' + (dicomSpinEnabled ? 'activée' : 'désactivée') + ' (touche S)', 'info');
          }

          // Raccourcis clavier globaux (Espace, R, V, S)
          document.addEventListener('keydown', (e) => {
            // Ignorer si l'utilisateur est dans un input/textarea
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            if (e.code === 'Space') { e.preventDefault(); resetDicomView(); }
            else if (e.key === 'r' || e.key === 'R') { recenterDicomIn3D(); }
            else if (e.key === 'v' || e.key === 'V') { toggleDicomIn3D(); }
            else if (e.key === 's' || e.key === 'S') { toggleDicomSpin(); }
          });

          // Branchement temps réel du slider
          function _wireDicomThresholdSlider() {
            const slider = document.getElementById('dicom3d-threshold');
            if (!slider || slider._wired) return;
            slider._wired = true;
            slider.addEventListener('input', () => {
              const v = parseFloat(slider.value);
              const lbl = document.getElementById('dicom3d-threshold-val');
              if (lbl) lbl.textContent = v;
              if (state.mpr.fromDicom && state.mpr.volume) {
                // Reconstruction voxel — fire-and-forget
                showDicomIn3D(v).catch(e => console.error('showDicomIn3D failed:', e));
              }
            });
          }

          // Initialisation au chargement
          document.addEventListener('DOMContentLoaded', () => {
            setTimeout(_wireDicomThresholdSlider, 50);
          });

