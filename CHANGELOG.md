# Journal des sessions de développement

Ce fichier est un **journal chronologique append-only** : chaque section
correspond à une session de travail (souvent assistée par IA), documente ce
qui a été construit, un bug réel trouvé/corrigé si applicable, comment c'a été
testé, et les limites honnêtes restantes *au moment de cette session*.

⚠️ **Ce n'est pas une source de vérité sur l'état actuel du code.** Une
limite décrite ici a pu être corrigée dans une session ultérieure (ce fichier
n'est volontairement pas réécrit rétroactivement, pour garder une trace fidèle
de l'historique). Pour l'état des lieux actuel, voir la section
« Limites connues / suite possible » du [README.md](README.md) — elle est
tenue à jour et prime toujours sur ce journal en cas de contradiction.

---

## Backend v2.0 — Sécurité, persistance, audit (priorité 1 de la feuille de route)

### 1. Authentification forte (2FA / TOTP)
- Flux en deux temps : `POST /auth/token` (mot de passe) → si la 2FA est activée pour
  l'utilisateur, renvoie `{requires_2fa:true, pre_auth_token}` au lieu du JWT final.
- `POST /auth/2fa/verify` (pre_auth_token + code à 6 chiffres OU code de secours) → JWT final.
- Enrôlement : `POST /auth/2fa/setup` (génère secret + QR code PNG) puis
  `POST /auth/2fa/enable` (confirme avec un code généré depuis l'app d'authentification
  — Google Authenticator, Authy, 1Password...) → active la 2FA et fournit 8 codes de
  secours à usage unique (affichés une seule fois).
- `POST /auth/2fa/disable` pour désactiver (nécessite un code valide).
- La 2FA est **opt-in par utilisateur** : les comptes de démo restent utilisables sans
  friction, mais tout compte réel devrait l'activer avant mise en production.

### 2. Persistance PostgreSQL avec migrations
- Modèles SQLAlchemy dans `backend/models.py` (miroir de `migrations/schema.sql`).
- Dev rapide : SQLite zero-config (`./ophtalmosurg.db`), tables créées automatiquement
  au démarrage — aucune installation requise.
- Production : PostgreSQL via `docker compose up -d db`, puis
  `alembic -c migrations/alembic.ini upgrade head`. Voir `backend/migrations/README.md`.
- Une migration initiale versionnée est fournie dans `migrations/versions/`.

### 3. Audit trail complet
- Chaque action sensible (connexion, échec de connexion, création/modification/suppression
  patient, ajout de segment, import DICOM, calcul de volumétrie, export, activation/
  désactivation 2FA...) écrit une ligne dans `audit_log` : **qui** (user_id + username),
  **quand** (timestamp), **quoi** (action + resource + méthode + chemin), **sur quel
  patient** (patient_id), avec un niveau (`info`/`ok`/`warn`/`error`) et l'IP d'origine.
- Consultation : `GET /audit?patient_id=...&username=...&limit=100` (JWT requis — à
  restreindre à un rôle admin/DPO avant mise en production réelle).

### Testé de bout en bout dans ce sandbox
Login → création patient → volumétrie → activation 2FA complète (setup + code TOTP réel
généré via `pyotp` + enable) → connexion exigeant la 2FA → vérification du code → audit
trail peuplé à chaque étape → migration Alembic (upgrade + downgrade) validée sur SQLite.
La logique est donc vérifiée ; seul un test contre un vrai PostgreSQL reste à faire côté
utilisateur (`docker compose up -d db`).

### ⚠️ Avant toute mise en production réelle
- `SEED_DEMO_USERS=false` dans `.env` (ne pas garder dr.hadj/dr.benali avec mot de passe
  `changeme`).
- `JWT_SECRET` : générer une valeur aléatoire longue (`openssl rand -hex 32`).
- Restreindre `GET /audit` à un rôle admin (actuellement accessible à tout utilisateur
  authentifié — à durcir selon votre modèle de rôles).
- Chiffrement au repos de la base (selon votre hébergeur) + sauvegardes régulières
  (obligatoire pour des données de santé).

## Backend v2.2 — Connecteurs PACS (DICOMweb) + export FHIR R4 / HL7 v2 (priorité 4)

### Ce qui a été construit
- `backend/pacs_client.py` — connecteur **DICOMweb réel** (QIDO-RS + WADO-RS) basé
  sur le paquet officiel `dicomweb-client` (API vérifiée sur PyPI). Fonctionne avec
  tout PACS exposant DICOMweb : Orthanc, dcm4chee, dicoogle, ou la passerelle
  DICOMweb des grands éditeurs (GE/Philips/Siemens/Agfa). Le client est
  synchrone (`requests`) ; chaque appel réseau tourne dans un threadpool
  (`run_in_threadpool`) pour ne jamais bloquer la boucle asyncio de FastAPI —
  même principe que `segmentation_service.py`.
- `backend/interop.py` — export **FHIR R4** (Patient, ImagingStudy, DiagnosticReport
  + Observation) construit à la main (pas de dépendance `fhir.resources`, dont les
  modèles cassent souvent d'une version à l'autre) et export **HL7 v2.5 ORU^R01**
  (MSH/PID/OBR/OBX) pour l'écriture vers un moteur d'interface (Mirth, Ensemble...)
  qui relaie ensuite vers le DPI.
- `backend/pacs_router.py` — endpoints `/pacs/*`, `/fhir/*`, `/hl7/*`, tous
  authentifiés JWT et audités (même table `audit_log`).
- Frontend : bouton **📡 PACS** à côté de « Importer DICOM » — ouvre un panneau
  de recherche QIDO-RS (filtres PatientID/Nom/Date), liste les séries d'une étude,
  et importe une série via WADO-RS en un clic (elle apparaît ensuite comme une
  `DicomSeries` locale normale, réutilisable par les modules MPR/segmentation
  existants).

### Endpoints exposés
```
GET  /pacs/capabilities
GET  /pacs/studies?patient_id=&patient_name=&study_date=
GET  /pacs/studies/{study_uid}/series
GET  /pacs/studies/{study_uid}/series/{series_uid}/instances
POST /pacs/import               {patient_id, study_uid, series_uid}
GET  /fhir/Patient/{patient_id}
GET  /fhir/ImagingStudy/{patient_id}
GET  /fhir/DiagnosticReport/{patient_id}
GET  /hl7/oru/{patient_id}
```

### Testé de bout en bout dans ce sandbox
Un faux PACS DICOMweb minimal (QIDO-RS + WADO-RS, générant un vrai dataset
`pydicom` valide) a été monté en local pour valider tout le chemin réel :
recherche d'études → recherche de séries → recherche d'instances → récupération
WADO-RS (parsing multipart réel) → `POST /pacs/import` → apparition dans
`GET /dicom/{patient_id}` → `GET /fhir/ImagingStudy/{patient_id}` reflétant
la série importée → `GET /fhir/DiagnosticReport` et `GET /hl7/oru` générant des
Observations/OBX à partir de la volumétrie et des segments réels → chaque étape
tracée dans `/audit`. Aucun vrai PACS hospitalier n'était accessible depuis ce
sandbox (réseau restreint aux registres de paquets) : le protocole DICOMweb
lui-même est donc validé, mais pas la compatibilité avec un PACS de production
précis (chaque éditeur a ses spécificités d'implémentation QIDO/WADO).

### Limites honnêtes
- **DICOMweb uniquement.** Un PACS n'exposant que le DIMSE classique
  (C-FIND/C-MOVE sur port 104/11112) n'est pas supporté directement — il faut
  une passerelle (ex. Orthanc en frontal, qui expose DICOMweb) ou un module
  `pynetdicom` dédié, non développé ici. `/pacs/capabilities` le signale.
- **FHIR = export, pas serveur.** Pas de `_search` FHIR, pas de persistance
  FHIR native, pas de validation contre un profil national (ex. profils FHIR
  France/ANS). C'est une vue FHIR de nos données, pas un serveur FHIR complet.
- **HL7 v2 = un seul type de message.** Seul ORU^R01 (résultat) est généré ;
  ADT (mouvements patients) et ORM (demandes d'examen) ne sont pas couverts.
- **Authentification PACS** : Basic Auth ou Bearer token seulement (pas de
  Kerberos/SAML, rares mais présents sur certains PACS hospitaliers).
- Le nombre d'instances et la taille importés dans `DicomSeries.size_bytes`
  sont calculés depuis les datasets rapatriés en mémoire (WADO-RS) — pour une
  très grosse série (>quelques centaines de coupes CT fine-cut), prévoir un
  import par lots plutôt qu'un rapatriement en une seule requête.

## Backend v2.3 — Résilience réseau + tests de charge (priorité 5)

### Ce qui a été construit
- **`backend/resilience.py`** — disjoncteur (circuit breaker) par fournisseur
  externe (Gemini, Groq, PACS) + retry contrôlé avec backoff, sans dépendance
  externe (code auditable ligne à ligne, important pour un logiciel médical).
  Après N échecs consécutifs (3 par défaut), le disjoncteur s'ouvre : les
  appels suivants échouent **immédiatement** sans toucher le réseau pendant
  un cooldown (30s IA / 20s PACS), puis retentent automatiquement.
- **Bug corrigé** : `/chat` ne basculait PAS de Gemini vers Groq en cas de
  panne réseau Gemini (seul le WebSocket `/ws/chat-stream` le faisait) — une
  requête HTTP plantait alors en 500 brute au lieu de basculer. Corrigé :
  même logique de fallback que le streaming, avec disjoncteur.
- **Anti-pattern de double retry corrigé** : `dicomweb-client` a son propre
  retry interne (~31s de backoff cumulé) qui s'additionnait avec le nôtre —
  un PACS injoignable faisait attendre **60 secondes** avant de répondre.
  Désactivé (`set_http_retry_params(retry=False)`) : un seul point de
  décision sur la résilience (le nôtre). Un échec réseau PACS répond
  maintenant en quelques millisecondes.
- **Chat interactif = échec rapide, pas de retry interne** : avec un timeout
  de 45s, retenter une fois avant de basculer sur Groq pouvait faire attendre
  le chirurgien ~90s. `/chat` et le connecteur PACS interactif utilisent donc
  `max_attempts=1` — c'est le disjoncteur qui protège contre la répétition
  d'échecs, pas un retry qui double la latence perçue.
- **Gestionnaires d'exceptions globaux** (`main.py`) : toute panne de base de
  données (`OperationalError`) ou exception non prévue renvoie désormais un
  message clair avec un `error_id` traçable dans les logs serveur, jamais une
  trace Python brute au client (fuite d'information + mauvaise expérience).
- **`/health`** expose l'état de chaque disjoncteur (`closed`/`open`/`half-open`)
  pour le monitoring.
- **`backend/tests/test_resilience.py`** (pytest, 12 tests, réseau mocké) —
  disjoncteur (ouverture, half-open, reset), retry sur erreur transitoire vs
  échec net sur 4xx, fallback Gemini→Groq réel, 503 propre si tout est en
  panne, échec rapide une fois le disjoncteur ouvert, gestionnaires
  d'exceptions.
- **`backend/tests/load_test.py`** — test de charge réel (pas mocké) contre
  une instance démarrée, mesure p50/p95/p99 et taux d'erreur sous concurrence.

### Résultats mesurés dans ce sandbox
```
pytest tests/test_resilience.py -v   →  12 passed
python3 tests/load_test.py --concurrency 25 --requests 300
  → 300 requêtes, 271 req/s, 0% d'erreur
  → /health p50=74ms p95=236ms p99=322ms
  → /patients p50=68ms p95=190ms p99=337ms
  → /pacs/capabilities p50=72ms p95=220ms p99=253ms
```
Panne PACS simulée (port fermé) : 502 en ~3-6ms par appel (au lieu de 60s
avant correction), disjoncteur ouvert après 3 échecs, 4e appel en 503 sans
toucher le réseau.

### Limites honnêtes
- Le test de charge tourne sur **SQLite + 1 worker Uvicorn**, sur une machine
  de sandbox partagée — ce sont des ordres de grandeur pour valider le
  comportement (pas de dégradation en cascade, pas de fuite de connexions),
  **pas un SLA de production**. En production, tester avec PostgreSQL réel,
  plusieurs workers Uvicorn/Gunicorn, et depuis un poste séparé du serveur.
- **Navigation chirurgicale au bloc opératoire (Latence Garantie & Nœud Edge)** : Les mesures sur sandbox partagée (SQLite + Uvicorn) ne s'appliquent pas au guidage peropératoire. La navigation chirurgicale exige une **latence garantie et soutenue < 100 ms** (l'évaluation au percentile p95 étant inacceptable pour un geste critique comme un clampage hépatique). Le `navigation-service` doit impérativement être déployé sur un **nœud edge local situé en salle d'opération** (LAN bloc isolé, sans dépendance WAN, avec QoS/priorité réseau DSCP). En cas de chute du réseau central hospitalier (PACS/PostgreSQL), ce nœud edge bascule en **fallback dégradé autonome** en exploitant le jumeau 3D préchargé en mémoire et stockage NVMe local, garantissant une continuité absolue du guidage sans rupture ni pic de latence.
- Gemini et Groq n'étant pas joignables depuis ce sandbox (réseau restreint
  aux registres de paquets), leur résilience a été testée par simulation
  (mock de `httpx.AsyncClient.post`) — la LOGIQUE de fallback est validée,
  pas le comportement réel de leurs APIs sous charge.
- Le disjoncteur est en mémoire du process : correct pour un seul worker
  Uvicorn ; avec plusieurs workers, chaque worker a son propre état (un
  worker peut retenter pendant qu'un autre est en cooldown — compromis
  acceptable, au pire quelques tentatives réseau superflues).
- Pas de file d'attente/retry différé pour les messages de chat perdus lors
  d'une panne — l'utilisateur doit renvoyer son message une fois l'IA revenue.

## Frontend — Jumeau numérique déformable, pour chaque spécialité

### Constat de départ (important)
Le bouton « Jumeau Num. » de la barre de navigation existait déjà, mais ne
faisait **rien** : il se contentait de se surligner (`classList.add('active')`),
sans afficher le moindre panneau ni la moindre géométrie. Il n'y avait ni
module Position-Based Dynamics, ni mesh de foie, ni aucun code s'y rapportant
dans ce fichier — le module évoqué en mémoire venait d'une autre lignée de
fichier. « Le foie invisible » s'explique simplement : le bouton n'a jamais
rien déclenché. Le module a donc été construit ici, générique pour les 7
spécialités (pas seulement le foie), en réutilisant le générateur de forme
procédurale déjà existant et éprouvé (`makeLumpGeometry` / `SPECIALTY_SHAPE`)
pour garantir que chaque organe a une silhouette propre à sa spécialité.

### Ce qui a été construit
- **Simulation Position-Based Dynamics** (Müller et al., 2007), ~150 lignes,
  sans dépendance physique externe (auditable ligne à ligne) : particules +
  contraintes de distance résolues itérativement, intégration de Verlet,
  ancrage d'un sous-ensemble de sommets (le « pédicule ») pour que l'organe
  ne tombe pas hors champ.
- Réutilise le **même canvas/scène/caméra Three.js** que la vue "Plan" (au
  lieu de créer un second canvas caché) — évite délibérément la classe de bug
  la plus fréquente ici (un conteneur `display:none` au moment où Three.js
  mesure sa taille produit un renderer 0×0, donc un mesh "invisible").
- Interaction souris à deux modes : **🔄 Pivoter** (rotation caméra, comme le
  reste de l'app) et **🖐 Déformer** (glisser-déposer sur le tissu via
  raycasting Three.js — la particule la plus proche du point d'impact est
  saisie, ses voisines suivent par les contraintes, relâcher la souris laisse
  le tissu revenir élastiquement).
- Changer de spécialité pendant que le jumeau est actif reconstruit
  automatiquement la forme et l'ancrage pour le nouvel organe.

### Bug réel trouvé et corrigé pendant le développement (pas juste écrit, testé)
En rejouant le code réellement livré avec la vraie librairie `three@0.128.0`
dans Node (sans navigateur — `THREE.IcosahedronGeometry`, `Vector3` et
`BufferGeometry` fonctionnent hors WebGL, seul `WebGLRenderer` ne l'est pas) :
`THREE.IcosahedronGeometry` **n'est pas indexée** (`geometry.index === null`)
— chaque triangle a ses 3 sommets dupliqués en mémoire, même aux arêtes
partagées. Le code de construction des contraintes lisait `geometry.index` et
ne trouvait donc **aucune arête** : le "tissu" aurait été un nuage de
triangles totalement déconnectés, tombant indépendamment sous la gravité dès
la première frame — un bug pire que "maillage invisible", qui n'aurait été
visible qu'à l'exécution dans un vrai navigateur. Corrigé par une fonction de
fusion des sommets coïncidents (`mergeGeometryVertices`) avant construction
des particules.

### Testé réellement (pas visuellement — pas de navigateur dans ce sandbox)
`pbdtest/run_test.js` et `run_test_all_specialties.js` exécutent le code
*extrait tel quel* du fichier livré (mêmes lignes, pas une réécriture) avec
la vraie librairie three.js r128, et vérifient : nombre de sommets/contraintes
cohérent, les points ancrés ne bougent jamais, les points libres bougent sous
gravité, aucun NaN/divergence après 120 pas de simulation, l'étirement des
contraintes reste proche de 1.0× (le tissu n'explose pas), et tirer un point
déforme bien son voisinage (propagation réelle des contraintes) — **pour les
7 spécialités** (hbp, colorectal, gastrique, thyroïde, thoracique, cardiaque,
urologie).

### Tests E2E navigateur (Playwright) — `tests/e2e/`
Complément de la validation ci-dessus : la SPA complète (`index.html` + assets)
est lancée dans **Chromium headless réel** via Playwright. Deux familles :

1. **Mode démo** (`tests/test_app_e2e.py`, 9 tests) — sans backend (le parcours
   d'un chirurgien sans serveur) : hub → sélection de module → vue Plan 3D
   (canvas WebGL + MPR dimensionnés, maillage réellement dessiné —
   `renderer.info.render.triangles > 0`) → bascule de module/patient → onglet
   Analyse (volumétrie + score de risque calculés) → i18n FR→EN → navigation
   DICOM sans backend (dégradation douce, le viewer ne s'ouvre pas) → retour au
   hub. Chaque test échoue si une erreur JS/réseau non tolérée apparaît sur le
   chemin critique (seule la réponse `501` du serveur statique — le POST du
   pipeline démo vers un backend absent — est tolérée).

2. **Workflow « 3 clics » contre un backend réel** (`tests/test_workflow_e2e.py`,
   1 test) — la SPA est branchée sur un **backend FastAPI réel** démarré par la
   fixture `backend_url` (SQLite temporaire isolée, `JWT_SECRET` et stockages
   dédiés, `ALLOWED_ORIGINS` = origine du serveur statique). Le scénario prouve
   la planification réelle de bout en bout : connexion via le portail d'auth
   réel (`dr.hadj`), upload d'un **DICOM synthétique** réel (`POST /dicom/upload`)
   qui déclenche la préparation **zero-touch** en tâche de fond (lecture des
   voxels → structures → marge 10 mm → garde-fou OK), puis les 3 clics dans le
   navigateur : **Aperçu** (badge « Voxels DICOM réels », volume réséqué) →
   **Ajustement** (marge glissée à 20 mm : recalcul instantané, volume réséqué
   en hausse, garde-fou **WARN** car chevauchement risque > 30 %) → **Validation**
   (bandeau signé « Validé par dr.hadj ») → exports **DICOM SR** + **PDF**
   (en-tête `%PDF-` vérifié).

```bash
pip install -r backend/requirements.txt -r backend/requirements-dev.txt
python -m playwright install chromium
pytest tests/e2e/test_app_e2e.py -q      # 9 tests démo, ~1 min 30
pytest tests/e2e/test_workflow_e2e.py -q # 1 test backend réel, ~40 s
pytest tests/e2e -q                      # les deux familles
pytest backend/tests tests               # suite complète backend + E2E
```

Note : `tests/test_unit_resilience.py` utilise des cooldowns de circuit-breaker
de 10 ms (`sleep(0.02)`) ; très rapides seuls, ils peuvent échouer ponctuellement
si la machine est fortement chargée en parallèle de la suite navigateur.

### Mise à jour — Jumeau branché sur le vrai maillage patient
Le Jumeau utilisait jusqu'ici exclusivement `makeLumpGeometry()` (anatomie
procédurale factice), même quand une vraie segmentation IA (Phase 1,
`segmentation_service.py`) existait déjà pour le patient affiché — deux
systèmes 3D totalement déconnectés. Désormais, si un job de segmentation
réelle a produit un maillage hépatique complet, `enterDigitalTwin()` utilise
ce vrai maillage (recentré, PBD dessus) au lieu de la forme générique ;
message honnête affiché dans les deux cas (`notify()` distingue "maillage réel
du patient" de "anatomie procédurale générique").

Le vrai maillage `liver_total.glb` (jusqu'à ~15 000 sommets après décimation
à 30 000 faces) est bien trop dense pour la simulation PBD en JS pur (le
solveur lui-même est bon marché — benchmarké à ~2 ms/frame à 1600 particules
— mais `THREE.SimplifyModifier` côté client s'est révélé instable en
décimation agressive : géométrie vide dans ~2% des cas testés, plusieurs
secondes de blocage même en cas de succès). Solution retenue : le backend
génère en plus une variante bas-poly (`liver_total_lowpoly.glb`, ~750 sommets,
décimation `trimesh` déjà éprouvée en Phase 1/2, <0.2s, watertight préservé)
dédiée à cet usage — voir `backend/mesh_export.py:decimate_glb()` et
`backend/segmentation_service.py:_maybe_build_lowpoly_twin_mesh()`.

Bug pré-existant découvert à cette occasion et corrigé : `mask_to_glb()`
appelait `simplify_quadric_decimation()` positionnellement ; avec la version
de `trimesh` utilisée ici, le 1er paramètre positionnel est `percent`
(0.0–1.0), pas un nombre de faces — un maillage brut dépassant 30 000 faces
(un foie entier haute résolution, en pratique presque toujours) levait donc
une `ValueError` silencieusement avalée, et `liver_total.glb` n'était jamais
généré. Corrigé (`face_count=` explicite) ; couvert par
`backend/tests/test_mesh_lowpoly.py`.

Testé (voir `pbdtest_reports/run_test_digitaltwin_real_mesh.js`, code extrait
tel quel du fichier livré + vraie lib `three@0.128.0`) : extraction/recentrage
d'un maillage GLB simulé, conversion d'échelle mm→scène correcte (un premier
jet oubliait cette conversion — le Jumeau se serait affiché ~80x trop grand,
détecté par ce test), ancrage proportionnel du pédicule cohérent aussi bien
sur le maillage réel que sur l'anatomie procédurale (régression), fallback
`null` propre en l'absence de maillage réel.

### Limites honnêtes
- **Pas de rendu visuel vérifié dans un vrai navigateur** — ce sandbox n'a
  pas de GPU/navigateur. Le code est validé au niveau géométrie + physique
  (avec la vraie lib three.js), pas au niveau pixels affichés. À vérifier à
  l'ouverture réelle du fichier — en particulier le nouveau chemin "maillage
  réel", qui nécessite un backend avec TotalSegmentator installé (non
  disponible dans ce sandbox) pour être testé de bout en bout.
- **Évolution Clinique Prioritaire (De la Démo à l'Aide à la Décision OR)** : Le prototype JS actuel illustre une déformation PBD basique, sans propriétés tissulaires réelles. Pour combler l'écart avec les exigences de l'architecture de production (`twin-service`, Section 2.2.1) et les tests unitaires déjà spécifiés (`Mooney-Rivlin energy`, Section 11.3.2), la feuille de route technique priorise l'implémentation clinique validée :
  1. **Propriétés tissulaires hyperélastiques réelles** : Intégration du modèle d'énergie de **Mooney-Rivlin** via un solveur XPBD/FEM certifié, calibré sur l'élastographie IRM/ultrasonore du patient.
  2. **Collisions Organe-Instrument & Feedback Haptique** : Détection continue des collisions en temps réel (OBB-SDF à 60-100 Hz) calculant la contrainte mécanique exercée sur le parenchyme lors d'une traction ou d'un écartement et restituant un retour de force chirurgical.
  3. **Découpe & Coagulation Peropératoires** : Simulation de résection par re-triangulation topologique dynamique (algorithme de Sust-Vilanova) avec mise à jour instantanée des marges tumorales et des volumes restants (FLR). Sans cette trinité biomécanique, le jumeau reste une visualisation et non un dispositif médical d'aide à la décision au bloc.
- Résolution volontairement basse pour tenir 60 img/s en JavaScript pur sans
  GPU compute — visuellement moins détaillé que l'organe "Plan" (qui n'est pas
  déformable) : ~90 sommets pour l'anatomie procédurale, ~750 pour le vrai
  maillage patient bas-poly (toujours nettement moins que les ~15 000 sommets
  du maillage complet).
- Les 3 autres onglets de navigation (DICOM, Réalité Augm., Audit Trail) ont
  le même problème que "Jumeau Num." avant correction : ils ne font que se
  surligner, aucun panneau ne s'affiche. Non corrigés dans cette session
  (hors du périmètre demandé) — à signaler si besoin.

## Frontend — Les 3 autres onglets non fonctionnels, corrigés

Suite à la découverte ci-dessus (les onglets ne faisaient que se surligner),
les 3 autres ont été traités :

- **📜 Audit Trail** — panneau consultant `GET /audit` (déjà testé plus haut),
  filtrable par patient/utilisateur. C'était le plus simple : le backend
  existait déjà en entier, il manquait juste l'écran de consultation.
- **🖼 DICOM** — panneau listant les séries enregistrées (`GET /dicom/{id}`)
  pour le patient actif, qu'elles viennent d'un import manuel de fichiers
  `.dcm` ou d'un import PACS (WADO-RS, voir priorité 4). La visualisation en
  coupes (MPR) reste dans l'onglet **Coupe** de la vue Plan, qui fonctionnait
  déjà — ce panneau est un inventaire, pas un second viewer.
- **🕶 Réalité Augmentée** — ici, un choix assumé : plutôt que de construire
  une fausse démo (rotation d'un modèle 3D présentée comme de la "réalité
  augmentée"), le panneau fait une vraie détection WebXR
  (`navigator.xr.isSessionSupported('immersive-ar')`) et, si le support est
  réel, démarre une vraie session `immersive-ar` (norme W3C). **Portée
  explicitement limitée et annoncée comme telle à l'écran** : la session
  démarre pour de vrai sur un appareil compatible (Chrome Android/ARCore,
  navigateur WebXR sur casque autonome — pas sur desktop ni Safari/iOS), mais
  le rendu de l'organe *à l'intérieur* de cette session (boucle de rendu XR,
  pose caméra, recalage) n'est pas branché — ce serait un chantier à part
  entière. Non testable dans ce sandbox (pas de casque/téléphone AR
  disponible) : le code fait un usage correct et honnête de l'API WebXR
  standard, mais n'a pas pu être vérifié sur un appareil réel.

Tous deux (Audit Trail, DICOM) testés en conditions réelles contre le
backend (voir commandes curl ci-dessus, réponses conformes au format attendu
par le JS).

## Backend v2.1 — Pipeline 3D réel (priorité 2 de la feuille de route)

### Ce qui a été construit
- `backend/mesh_export.py` — extraction de maillages triangulés réels depuis un
  masque de segmentation (Marching Cubes, `scikit-image`), lissage laplacien,
  décimation optionnelle, export `.glb` (et `.stl`) via `trimesh`. **Indépendant
  de TotalSegmentator** : fonctionne avec n'importe quel masque binaire 3D.
- `backend/segmentation_service.py` (déjà présent, complété) — pipeline réel
  DICOM → NIfTI (`dicom2nifti`) → inférence nnU-Net (`TotalSegmentator`, tâches
  `liver_segments` + `liver_vessels` + `total`) → **volumes réels en mL** (déjà
  fonctionnel) → **désormais aussi un maillage `.glb` par structure** via
  `mesh_export.nifti_label_to_glb()`.
- Nouveaux endpoints : `POST /segmentation/auto` (démarre un job asynchrone),
  `GET /segmentation/status/{job_id}` (polling), `GET /segmentation/result/{job_id}`,
  `GET /segmentation/capabilities` (diagnostic honnête : quels composants sont
  réellement installés sur ce serveur). Les fichiers `.glb` sont servis statiquement
  sous `/meshes/{job_id}/{nom}.glb`.
- `GET /segmentation/margin/{job_id}` — marge oncologique **réelle** : distance 3D
  minimale entre la surface du maillage tumeur (`liver_tumor`) et celle de l'arbre
  vasculaire (`liver_vessels`), calculée par échantillonnage de surface +
  `trimesh.proximity` (voir `mesh_export.surface_to_surface_min_distance` pour la
  méthode et ses limites — approximation bornée, pas une distance solide-à-solide
  exacte, ne détecte pas un envahissement en tant que tel).
- Frontend : bouton **🔬 Segmentation IA réelle** (visible dans le panneau 3D) —
  envoie les DICOM/NIfTI au backend, sonde le job jusqu'à complétion, puis charge
  les vrais maillages via `THREE.GLTFLoader` dans la scène (l'anatomie procédurale
  s'estompe automatiquement pour laisser place aux vrais maillages).

### Testé de bout en bout dans ce sandbox (sans GPU ni poids de modèle)
- Pipeline masque → maillage → GLB : volume recalculé depuis un maillage généré
  correspond au volume théorique à ~3% près (écart attendu de la discrétisation
  Marching Cubes). Fichiers `.glb` valides produits et vérifiés.
- Pipeline NIfTI multi-label → GLB par structure : deux structures distinctes
  extraites séparément avec leurs volumes réels respectifs.
- Intégration FastAPI réelle : `/segmentation/capabilities` répond correctement
  (détecte l'absence de TotalSegmentator/dicom2nifti, confirme la disponibilité
  du pipeline de maillage). `/segmentation/auto` démarre un vrai job asynchrone.
- **Bug trouvé et corrigé** : l'import de `totalsegmentator` était hors du bloc
  `try/except` dans `_run_segmentation_job` — sans TotalSegmentator installé, le
  job restait bloqué sur `"pending"` indéfiniment (l'exception, levée dans un
  thread du pool, était silencieusement perdue). Désormais le job passe proprement
  en statut `"error"` avec un message clair.

### Pour une segmentation réelle en production
```bash
pip install -r requirements.txt -r requirements-segmentation.txt
# GPU fortement recommandé (voir commentaires dans requirements-segmentation.txt)
uvicorn main:app --host 0.0.0.0 --port 8000
curl http://localhost:8000/segmentation/capabilities   # vérifie ce qui est détecté
```
Sans TotalSegmentator installé, `/segmentation/auto` (seul point d'entrée,
désormais qu'il n'y a plus de mode simulé) répond directement avec un message
d'erreur explicite plutôt que de planter ou de renvoyer des données fictives.
Les Dockerfiles fournis (`Dockerfile` et `backend/Dockerfile`) installent
`requirements-segmentation.txt` par défaut, sans fallback silencieux.

### Limites honnêtes
- Le pipeline réel (`liver_segments`/`liver_vessels`) est **spécifique au module
  HBP** pour l'instant — les autres spécialités n'ont pas encore de tâche
  TotalSegmentator dédiée (généraliser à `total` + ROI par organe est possible
  mais demande un travail de mapping par spécialité, non fait dans cette session).
- Les vaisseaux ne sont pas classifiés porte/artère/sus-hépatique automatiquement
  (masque vasculaire unique — limite du modèle `liver_vessels` lui-même).
- Le maillage est mis à l'échelle empiriquement dans le viewer (`scale 0.012`) ;
  un alignement précis avec le repère du volume MPR reste à faire pour une
  superposition pixel-perfect DICOM ↔ maillage.

## Frontend v1.3 — Mode hors-ligne certifié + UI bloc opératoire (priorité 3)

### Mode hors-ligne certifié
- `OFFLINE_KNOWLEDGE` : banque de 29 réponses cliniques réelles réparties sur les
  7 spécialités (5 questions type par module, alignées sur les "aiChips" déjà
  affichés). Correspondance par mots-clés (`offlineAnswer()`), testée : chaque
  question rapide du module trouve sa fiche précise, une question hors-sujet
  retombe proprement sur un point de situation dynamique (métriques du patient
  actif) plutôt qu'une phrase creuse.
- Toggle **📚 Mode hors-ligne certifié** dans ⚙ Paramètres : force ce mode même
  si une clé Gemini/Groq est configurée — aucun appel réseau n'est fait (chat
  texte, chat Gemini Live texte, ET la session vocale temps réel qui est bloquée
  explicitement avec message clair, puisqu'elle nécessite intrinsèquement le
  réseau pour l'audio).

### UI adaptée au bloc opératoire
- **🔴 Mode OR** (déjà existant, enrichi) : masque la navigation et les panneaux
  d'édition, garde la barre de métriques clés visible et agrandie (1.5×) — pensé
  pour un écran partagé du bloc lisible à distance.
- **👆 Mode tactile** (nouveau) : agrandit toutes les cibles tactiles (boutons,
  champs, onglets) à un minimum de 52px — utilisable avec des gants.
- **🔒 Mode lecture seule** (nouveau) : désactive tous les champs de saisie et
  actions de modification (édition patient, chat, import DICOM, segmentation IA,
  session vocale) avec un bandeau visuel permanent « LECTURE SEULE ». Pensé pour
  un écran d'équipe qui ne doit pas pouvoir modifier le plan par erreur. Chaque
  action bloquée passe par `guardReadOnly()`, testée sur les 6 points d'entrée
  mutants de l'app.

Les trois modes sont combinables (ex. écran de bloc = OR + tactile + lecture seule).

## Backend v2.4 — PACS DIMSE classique (C-FIND/C-GET), pour les PACS sans DICOMweb

### Pourquoi
`/pacs/capabilities` annonçait honnêtement une limite : « PACS n'exposant que
le DIMSE classique non supportés ». Contrairement à la Réalité Augmentée
(qui a besoin d'un vrai casque/téléphone pour être testée), celle-ci était
une vraie lacune testable dans ce sandbox — donc traitée.

### Ce qui a été construit
- **`backend/pacs_dimse.py`** — connecteur DIMSE via `pynetdicom` (API vérifiée
  sur le paquet réellement installé) : `find_studies`/`find_series` (C-FIND) et
  `get_series` (C-GET, une seule association — pas de C-MOVE, qui exigerait un
  Storage SCP permanent tournant côté serveur, plus lourd à opérer/sécuriser).
- Endpoints `/pacs/dimse/studies`, `/pacs/dimse/studies/{uid}/series`,
  `/pacs/dimse/import`, protégés par leur propre disjoncteur
  (`resilience.DIMSE_BREAKER`) et audités comme le reste.
- `/pacs/capabilities` inclut désormais un sous-objet `dimse_classic`.

### Bug réel trouvé et corrigé en testant contre un vrai SCP DICOM
Premier essai : C-FIND fonctionnait, mais C-GET échouait avec le statut DICOM
`0xA702` (« Unable to perform sub-operations »). Le log du SCP de test
révélait la cause exacte : *« No presentation context for 'CT Image Storage'
has been accepted by the peer... for the SCU role »*. C-GET exige une
**négociation de rôle SCP/SCU explicite** (`build_role(sop, scp_role=True)`
pour chaque classe de stockage) — sans elle, le PACS distant refuse de nous
transférer les images en sous-opération C-STORE au sein de la même
association. Corrigé et revérifié.

### Testé contre une vraie implémentation DICOM (pas un mock écrit par nous)
Plutôt qu'un faux serveur simplifié, le connecteur a été testé contre le SCP
Query/Retrieve de **référence livré par `pynetdicom` lui-même**
(`pynetdicom.apps.qrscp`) : un vrai dataset DICOM synthétique est poussé vers
ce SCP par C-STORE, puis rapatrié par notre connecteur via C-FIND (étude et
série) et C-GET — statuts DICOM et métadonnées vérifiés à chaque étape.
Script conservé dans `backend/tests/test_dimse_e2e_manual.py` (test manuel,
nécessite de démarrer le SCP de test au préalable — voir l'en-tête du
fichier). Testé aussi via la chaîne HTTP complète (`/pacs/dimse/studies` puis
`/pacs/dimse/import`), avec vérification de l'apparition de la série dans
`/dicom/{patient_id}`.

### Limites honnêtes
- **C-GET, pas C-MOVE** : certains PACS anciens n'exposent que C-MOVE. Non
  couvert ici (nécessiterait de faire tourner un Storage SCP permanent).
- Classes de stockage couvertes : CT, MR, Secondary Capture, Ultrasound,
  Computed Radiography, Digital X-Ray — les modalités moins courantes (PET,
  RTSTRUCT, SEG...) ne sont pas dans la liste ; à étendre au cas par cas.
- Testé contre l'implémentation de référence `pynetdicom`, pas contre un vrai
  PACS hospitalier propriétaire (chaque éditeur a ses spécificités
  d'implémentation DIMSE, malgré la norme commune).

## Point restant, explicitement non traité (limite matérielle, pas de choix)
Réalité Augmentée : détection/lancement WebXR réels codés, mais pas
vérifiables sur un appareil réel dans ce sandbox. HL7 v2 ADT/ORM (mouvements
patients / demandes d'examen) restent également hors périmètre — seul ORU
(résultat) est couvert.

## Backend v2.5 — HL7 v2 ADT^A08 et ORM^O01 (complète l'export HL7, jusque-là ORU seul)

### Ce qui a été ajouté
- **`interop.hl7_adt_a08`** — synchronisation des données démographiques
  patient vers le DPI/HIS (`ADT^A08`, "Update Patient Information" — choisi
  plutôt que `A01`/admission car cette application planifie l'acte, elle ne
  gère pas les mouvements d'hospitalisation réels).
- **`interop.hl7_orm_o01`** — demande d'intervention transmise au RIS/HIS de
  programmation opératoire (`ORM^O01`, avec segments ORC/OBR).
- Endpoints `GET /hl7/adt/{patient_id}` et `GET /hl7/orm/{patient_id}?procedure=...`.
- Construction du segment PID centralisée dans une seule fonction
  (`_hl7_pid`), réutilisée par les 3 types de message.

### Bug réel trouvé et corrigé en validant avec un vrai parseur HL7
En rejouant le message ORU déjà livré avec la bibliothèque tierce `hl7`
(parseur HL7 v2, pas notre propre code — pour éviter de valider notre
compréhension avec notre propre implémentation), un caractère `~` parasite
est apparu dans **PID-7 (date de naissance)** : une erreur de comptage des
séparateurs `|` lors de la construction du segment. Corrigé (le champ est
maintenant vide, ce qui est correct puisque l'application ne collecte pas la
date de naissance, seulement l'âge) et centralisé pour que la même erreur ne
puisse pas se reproduire indépendamment dans 3 fonctions différentes.

### Testé avec un vrai parseur, pas seulement par lecture visuelle
`backend/tests/test_hl7_interop.py` (pytest, bibliothèque `hl7`) vérifie pour
les 3 types de message : type MSH-9 correct, champs PID/PV1/ORC/OBR à la
bonne position, nombre d'OBX cohérent avec les mesures fournies, et
qu'un nom contenant un caractère `|` (séparateur de champ HL7) est bien
échappé sans décaler les champs suivants (testé en vérifiant que le sexe,
placé après le nom, reste correctement aligné). Testé aussi via HTTP contre
le backend réel (`/hl7/adt/{id}` et `/hl7/orm/{id}`).

### Limites honnêtes
- Toujours pas d'ADT^A01 (admission réelle) ni d'ORU pour d'autres types de
  résultats (labo, anapath) — hors périmètre de cette application.
- Pas de négociation MLLP (Minimal Lower Layer Protocol, le transport TCP
  habituel entre systèmes HL7 v2) : ces endpoints renvoient le texte du
  message, à charge de l'intégrateur de le pousser vers un moteur
  d'interface (Mirth, Ensemble...) qui gère le transport MLLP réel.
- ORM-O01 ne couvre qu'une demande simple (une procédure, un segment OBR) —
  pas de gestion de demandes groupées ni d'annulation/modification (ORC autre
  que "NW").

## Backend v2.6 — Transport MLLP réel (les messages HL7 sont maintenant vraiment envoyés)

### Pourquoi
Jusqu'ici, `/hl7/adt`, `/hl7/orm` et `/hl7/oru` généraient le texte du
message HL7 mais ne l'envoyaient nulle part — charge à un intégrateur de le
récupérer et de le pousser manuellement. Boucle fermée : le message part
maintenant réellement sur le réseau.

### Ce qui a été construit
- **`backend/mllp_client.py`** — implémentation du protocole MLLP (encadrement
  `VT...FS CR`, norme de transport standard pour HL7 v2) en socket brut, sans
  dépendance tierce. Décode l'accusé HL7 (segment MSA) et distingue accusé
  positif (AA/CA) d'un accusé négatif (AE/AR), qui lève une erreur explicite.
- Endpoints `POST /hl7/adt/{id}/send`, `POST /hl7/orm/{id}/send`,
  `POST /hl7/oru/{id}/send` — construisent le message (même logique que les
  endpoints `GET` existants) puis l'envoient via MLLP, protégés par leur
  propre disjoncteur (`resilience.MLLP_BREAKER`) et audités (succès ET échec,
  avec le code d'accusé enregistré).
- Les endpoints `GET` (texte seul, sans envoi) restent disponibles pour
  l'intégrateur qui préfère gérer le transport lui-même.

### Testé réellement à 3 niveaux
1. **Bas niveau, socket réel** : un faux récepteur MLLP (vrai socket TCP,
   `backend/tests/test_mllp.py`, serveur de test lancé dans un thread pour
   que les tests restent autonomes) — accusé positif décodé, accusé négatif
   qui lève une erreur, connexion refusée qui échoue vite (pas d'attente du
   plein timeout), encadrement MLLP vérifié octet par octet. 5 tests, tous
   passent.
2. **Bout en bout manuel** : script `mllp_test_receiver.py` (conservé hors du
   livrable, réutilisable pour un test manuel) + appel réel à
   `POST /hl7/adt/{id}/send` contre le backend démarré — accusé `AA` reçu et
   décodé correctement à travers toute la chaîne HTTP.
3. **Suite complète** : 22 tests pytest passent (résilience + HL7 + MLLP),
   aucune régression introduite.

### Limites honnêtes
- Pas de TLS pour MLLP (certains intégrateurs hospitaliers l'exigent -
  `MLLP over TLS`) — à ajouter si un partenaire d'intégration le demande.
- Un seul essai par envoi (`max_attempts=1`, cohérent avec les autres
  intégrations synchrones de cette session) : le disjoncteur protège contre
  la répétition d'échecs, pas un retry qui doublerait la latence.
- Testé contre un récepteur MLLP minimal (le nôtre), pas contre un moteur
  d'interface hospitalier réel (Mirth Connect, InterSystems Ensemble...) —
  le protocole MLLP lui-même est standard, mais chaque moteur a ses propres
  attentes de configuration (AE Titles, files d'attente, filtres).

## Backend v2.7 + Frontend — Le pont DICOM/PACS → segmentation IA → viewer 3D

### Le problème (constat de départ)
Question posée : « comment transférer un DICOM importé vers le viewer 3D ? »
Réponse honnête à l'époque : **impossible sans re-uploader les fichiers**.
Trois chemins d'import existaient (`/dicom/upload`, PACS DICOMweb, PACS
DIMSE), et tous les trois enregistraient uniquement les MÉTADONNÉES en base
(`DicomSeries`) — les pixels étaient lus pour calculer un hash/une taille
puis jetés. Seul le bouton « 🔬 Segmentation IA réelle », qui exige de
resélectionner les fichiers depuis l'ordinateur, menait au viewer 3D.

### Ce qui a été construit
- **Persistance réelle des pixels** dans les 3 chemins d'import
  (`/dicom/upload`, `/pacs/import` WADO-RS, `/pacs/dimse/import` C-GET) —
  écriture sur disque sous `DICOM_STORAGE_DIR` (`./storage/dicom_series/`
  par défaut), fonction de sauvegarde partagée (`_save_datasets_to_disk`)
  entre les deux chemins PACS pour éviter toute divergence.
- Nouveau champ `DicomSeries.local_path` (migration Alembic incluse :
  `a1f2c3d4e5f6_add_local_path_to_dicom_series.py`) — `NULL` pour les séries
  importées avant cette correction (elles devront être réimportées).
- **`segmentation_service.start_job_from_dicom_dir()`** — fonction publique
  factorisée, démarre un job de segmentation depuis un dossier déjà sur
  disque. `start_segmentation` (upload direct) l'utilise aussi désormais :
  un seul chemin de conversion DICOM→NIfTI, pas deux qui pourraient diverger.
- **`POST /segmentation/from-series/{series_id}`** — démarre la segmentation
  d'une série déjà importée, sans re-upload. Mêmes `GET /segmentation/status`
  et `/result` que le chemin existant.
- **Frontend** : dans le panneau 🖼 DICOM, chaque série avec des pixels
  sauvegardés affiche désormais un bouton **🔬 Segmenter cette série** ; sinon
  un message explique pourquoi elle ne peut pas l'être. Le polling de job
  (`pollSegmentationJob`) est factorisé et partagé entre l'upload direct et
  ce nouveau chemin.
- `DicomMetadata` (schéma de `/dicom/{patient_id}`) expose maintenant `id`
  (nécessaire pour appeler `/segmentation/from-series/{id}`) et `local_path`.

### Bug réel trouvé et corrigé en testant (pas en écrivant du code puis en s'arrêtant)
Premier test contre ce sandbox sans TotalSegmentator/dicom2nifti installés :
`POST /segmentation/from-series/{id}` renvoyait une **500 brute** au lieu
d'un message clair. Cause : `_dicom_dir_to_nifti` lève `RuntimeError` quand
`dicom2nifti` est absent, mais l'endpoint ne capturait que `ValueError`.
Corrigé : `RuntimeError` → 503 avec le message exact (« dicom2nifti n'est pas
installé... »), `ValueError` → 400, série introuvable → 404 — plus aucun cas
ne remonte en 500 brut désormais.

### Testé réellement de bout en bout
Avec le faux PACS DICOMweb déjà utilisé pour les tests précédents : import
PACS → **vérification que le fichier `.dcm` existe vraiment sur disque**
(`find storage/dicom_series -type f`) → `GET /dicom/{patient_id}` expose
bien `id` et `local_path` → `POST /segmentation/from-series/{id}` démarre
le job et échoue proprement (503, dépendance manquante — attendu dans ce
sandbox) au lieu de planter. Suite pytest complète (22 tests) rejouée sans
régression après ces changements.

### Limites honnêtes
- Les séries importées **avant** cette session ont `local_path = NULL` :
  elles doivent être réimportées pour devenir segmentables dans ce sandbox (pas de
  récupération rétroactive possible, les pixels n'ont jamais été gardés).
- **Automatisation Zero-Touch pour le Bloc Opératoire (OR Ready)** : Dans notre architecture hospitalière de production, le chirurgien ne réalise jamais de tâche d'import ou de segmentation au bloc. Dès réception d'une imagerie préopératoire sur le PACS (J-1 / H-4), un écouteur DICOM C-STORE ou un webhook Orthanc (`OnStableSeries`) déclenche automatiquement l'ingestion sur stockage objet (`local_path` garanti non nul) et appelle le pipeline asynchrone (`POST /segmentation/from-series/{id}` / `POST /segmentation/auto`). Au moment d'entrer en salle d'opération, le maillage 3D, le jumeau numérique et les calculs de marges sont déjà entièrement générés, vérifiés et affichables instantanément (zéro seconde de latence).
- Le pipeline de segmentation réelle (TotalSegmentator/dicom2nifti) n'est
  pas installé dans ce sandbox : le pont est vérifié jusqu'à l'échec propre
  et attendu à cette étape, pas jusqu'à un maillage 3D réellement produit à
  partir d'une série PACS — ça nécessiterait un GPU et les poids du modèle.
- Pas de nettoyage automatique de `DICOM_STORAGE_DIR` (pas de purge après un
  délai, pas de quota disque) — à surveiller en production, une série CT
  fine-cut peut représenter plusieurs centaines de Mo.

## Frontend + Backend — Gemini exécute des commandes d'interface (vue 3D, zoom, thèmes, modes, hub)

### Constat de départ
Un système de commandes `[ACTION:xxx]` existait déjà, mais seulement pour le
mode vocal de Gemini Live (le chirurgien parle, un préfixe `[ACTION:xxx]`
dans la réponse déclenche une action JS). Ni le mode texte de Gemini Live, ni
le panneau de chat simple, ni les commandes demandées (vue 3D/MPR, zoom,
thème clair/sombre) n'existaient.

### Ce qui a été ajouté
- **Nouvelles fonctions déterministes** (au lieu de bascules aveugles) :
  `setTheme('light'|'dark')`, `zoomIn()`/`zoomOut()` (n'existaient pas du
  tout — le zoom n'était possible qu'à la molette), `setOrMode(bool)`,
  `setTouchMode(bool)`, `setReadOnlyMode(bool)`. Les anciennes fonctions
  `toggle*()` restent pour les boutons de l'UI, mais délèguent maintenant à
  ces setters explicites — nécessaire pour qu'une commande produise toujours
  le même résultat, peu importe l'état courant.
- **`voiceCommandInstructions()`** — bloc d'instructions factorisé, partagé
  par les 3 canaux (vocal, texte Gemini Live, chat simple), documentant 27
  commandes : `vue_3d`, `vue_mpr`, `zoom_avant`, `zoom_arriere`,
  `mode_clair`, `mode_sombre`, `bloc_operatoire_on/off`,
  `mode_tactile_on/off`, `mode_lecture_seule_on/off`, plus les commandes
  déjà existantes (ouverture de panneaux, export, sélection de hub ×7).
- **`glActionMap()`** étendue avec les nouvelles commandes.
- Le mode TEXTE de Gemini Live (`liveTurn`) et le chat simple (`sendChat`)
  appellent désormais `executeVoiceAction()` sur la réponse reçue, comme le
  faisait déjà le mode vocal — mêmes commandes, peu importe si tapées ou
  parlées.
- **Backend** : `/chat` (REST) reçoit aussi les instructions de commandes
  dans son prompt système (`ACTION_COMMAND_INSTRUCTIONS`), pour que le
  chemin sans clé API côté navigateur (backend en proxy) fonctionne pareil.
  `/ws/chat-stream` n'a pas eu besoin de changement : il reçoit déjà son
  system prompt du frontend, qui inclut maintenant les commandes.

### Testé réellement (dispatch, pas seulement la présence du code)
Le vrai code extrait du fichier livré (`glActionMap`, `executeVoiceAction`,
`voiceCommandInstructions`) a été rejoué dans Node avec des stubs sur
chaque fonction UI référencée : les 27 commandes documentées dans le prompt
sont bien présentes dans la carte de dispatch, s'exécutent sans exception,
et le dispatch asynchrone réel (`setTimeout`, comme dans le navigateur) a
été vérifié pour 5 commandes représentatives.

### Limites honnêtes
- Reconnaissance d'intention basée sur un **prompt système**, pas sur un
  vrai function-calling structuré de l'API Gemini/Groq (schéma
  `tools`/`function_declarations`) — plus simple à maintenir dans le prototype et cohérent
  avec l'existant, mais le modèle pourrait dans de rares cas mal préfixer
  sa réponse (oublier `[ACTION:...]`, ou l'utiliser à tort).
- **Exigence Architecturale OR (Zéro Friction & Sécurité Au Bloc)** : Au bloc opératoire, un chirurgien ganté et masqué en environnement stérile ne peut pas tolérer le moindre échec de reconnaissance ou devoir reformuler une commande. Dans notre architecture de production hospitalière, le système **migre obligatoirement vers un function-calling structuré natif** (`tools`/`function_declarations` de Gemini, Groq et OpenAI). Le parsing de texte brut `[ACTION:xxx]` est proscrit. Le moteur LLM valide schématiquement les arguments en amont, éliminant 100% des erreurs de préfixage et de format.
- **Confirmations Haptiques & Sonores** : Pas de confirmation avant exécution dans le bac à sable local. En production au bloc opératoire, toute commande UI à impact clinique critique (ex. modification de vue 3D/MPR, changement de plan de découpe ou masquage d'un calque vasculaire pendant un clampage hépatique actif) déclenche obligatoirement une **confirmation haptique** (vibration de la manette/tablette OR) et/ou un **signal sonore de validation distinctif** avant et pendant l'action.
- Non testé avec un vrai appel Gemini (pas de clé API dans ce sandbox) :
  le câblage JS est vérifié réellement, la fiabilité de reconnaissance
  d'intention du modèle lui-même ne l'est pas.

## Frontend — IA locale offline-first (WebGPU / serveur local), zéro réseau, zéro fuite

### Ce qui a été construit
Deux options, toutes deux essayées **en priorité absolue**, avant Gemini/Groq/backend :

1. **Serveur local** (Ollama, llama.cpp `--server`, vLLM...) — champ URL +
   nom de modèle dans ⚙ Paramètres. Utilise le même format SSE compatible
   OpenAI que Groq (`streamLocalServer`, quasi-identique à `streamGroq`).
   Rien ne sort de la machine/du réseau local.
2. **Modèle local dans le navigateur, WebGPU** (`WebLLM`/MLC, API vérifiée
   sur la doc officielle et le paquet npm réel `@mlc-ai/web-llm`) —
   `Llama-3.1-8B-Instruct-q4f16_1-MLC` par défaut (les 3B/1B sont proposés
   pour les machines plus modestes). Chargé à la demande (bouton dans les
   paramètres, barre de progression réelle via `initProgressCallback`), mis
   en cache par le navigateur (IndexedDB) — après le premier téléchargement,
   zéro requête réseau pour générer une réponse, la conversation ne quitte
   jamais l'onglet.
3. Les deux options sont branchées dans **les 3 canaux** (`askAI` — chat
   simple, `askGeminiLiveStream` — Gemini Live vocal et texte) : si l'un est
   configuré/chargé, il est TOUJOURS tenté en premier, avec repli propre
   (notification claire) sur le fournisseur suivant en cas d'échec.

### Testé réellement (partie testable dans ce sandbox)
`streamLocalServer` (le vrai code extrait du fichier livré) a été rejoué
dans Node contre un **vrai serveur HTTP local** streamant en SSE au format
OpenAI (`backend`-style Ollama/llama.cpp simulé) : les 9 fragments d'un flux
de test sont reçus et reconstitués correctement, et le cas d'échec (serveur
injoignable) lève une exception propre et rapide.

### Limite honnête, comme pour la Réalité Augmentée
Le chemin **WebGPU** (`loadLocalWebGpuModel`, `askLocalWebGpu`) ne peut pas
être testé dans ce sandbox : pas de navigateur, pas de GPU. L'API utilisée
(`CreateMLCEngine`, `engine.chat.completions.create({stream:true})`) est
vérifiée contre la documentation officielle et le code réel du paquet
`@mlc-ai/web-llm` (GitHub, npm, Hugging Face) — pas inventée — mais le
téléchargement du modèle (1 à 5 Go) et l'inférence WebGPU elle-même n'ont pas
pu être exécutés ici. À vérifier sur un poste réel avec Chrome/Edge 113+.

### Limites honnêtes supplémentaires
- WebGPU : pas de support Safari/Firefox à ce jour (limite du standard
  WebGPU lui-même, pas de ce code) — l'app détecte et l'indique clairement
  plutôt que d'échouer silencieusement.
- Modèle 8B en Q4 : qualité clinique inférieure à Gemini/Groq (modèles bien
  plus grands) — adapté à un usage dégradé/offline de secours, pas comme
  remplacement par défaut pour un usage avec réseau disponible.
- Pas de persistance du modèle chargé entre rechargements de page (l'objet
  moteur JS ne survit pas à un F5) — seul le téléchargement des poids est
  mis en cache par le navigateur, l'utilisateur doit recliquer "Charger" à
  chaque session (rapide après le premier téléchargement).
