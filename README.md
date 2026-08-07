# OphtalmoSurg Plan (ex-GeneralSurg Plan MIMO) — Ophtalmologie

Plateforme de planification chirurgicale dédiée à l'ophtalmologie (Cataracte,
Glaucome, Chirurgie Vitréo-Rétinienne) : moteur 3D data-driven, MPR volumétrique
réel, IA connectée, analyse prédictive calculée, backend FastAPI générique.

> Cette version est une transformation front-end du prototype multi-spécialités
> `GeneralSurg Plan MIMO` original (HBP, Colorectal, Gastrique, Thyroïde,
> Thoracique, Cardiaque, Urologie) vers l'ophtalmologie. Les 3 modules
> (`MODULES` dans `assets/app-part1.js`), l'anatomie 3D procédurale, le panneau
> d'évaluation clinique (LOCS III / Hodapp / PVR, ex-staging TNM), les
> guidelines (ESCRS/EGS/EVRS), la base de connaissances IA hors-ligne, les
> commandes vocales et les codes CCAM de démonstration ont été réécrits pour
> l'ophtalmologie. Le **backend reste générique et inchangé** (patients, DICOM,
> auth, volumétrie) — voir « Limites connues » plus bas pour le détail de ce
> qui n'a volontairement pas été retouché (panneaux « Recherche » spéculatifs
> et pipeline de segmentation hépatique avancé, hors périmètre de cette passe).

## Contenu

- `index.html` — page d'entrée du front (HTML + CSS/JS externes dans `assets/`, aucun build requis)
- `assets/` — CSS (`styles.css`) et JS (`app-part1.js`, `app-part2.js`, `app-part3.js`, `app-bootstrap.js`) du front, extraits du HTML monolithique d'origine pour rester lisibles/diffables
- `backend/` — API FastAPI (auth JWT, patients, DICOM, volumétrie, IA)

## Ce qui a été enrichi par rapport au prototype MIMO initial

1. **Anatomie 3D par spécialité (Three.js)** — `buildOrgan()` construit désormais
   une anatomie réellement différente par module, générée à partir des données
   `MODULES[x].structures` déjà présentes dans le fichier (nerfs/artères → tubes,
   ganglions/nodules → petites sphères, sous-lobes → volumes). Chaque spécialité a
   une silhouette propre (`SPECIALTY_SHAPE`), un rendu seedé donc reproductible.
   Cliquer un élément de l'arbre anatomique (panneau gauche) fait pulser la
   structure correspondante dans la scène 3D (`highlightStructure`).

2. **MPR volumétrique réel** — les 3 vues (axial/coronal/sagittal) échantillonnent
   maintenant un **seul** volume 3D cohérent (`buildProceduralVolume`, 64³), avec
   molette = navigation de coupe, glisser = fenêtrage (WW/WL), au lieu de bruit
   aléatoire indépendant par canvas.

3. **Import DICOM réel** — bouton « Importer DICOM » : lit de vrais fichiers
   `.dcm` via `dicom-parser`, reconstruit un volume 3D à partir des coupes
   fournies et l'affiche dans les 3 plans MPR avec fenêtrage.

4. **IA connectée** — `askAI()` remplace les réponses factices par de vrais
   appels réseau, avec ordre de priorité configurable dans **Paramètres** :
   clé Gemini directe → clé Groq directe → backend proxy (`/chat`, avec
   auto-authentification JWT) → réponse hors-ligne clairement étiquetée comme
   telle. Partagé par le chat du panneau droit et la barre « Gemini Live ».

5. **Onglet Analyse** (nouveau, 4ᵉ onglet du panneau droit) — volumétrie calculée
   à partir du volume voxel réel (pas une constante), score de risque calculé à
   partir des métriques `warn/ok` du module + âge + urgence du patient, et
   3 scénarios prédictifs. Bouton d'export du plan (JSON local, ou DICOM SR via
   le backend si configuré).

6. **Fiche patient éditable** — dans la modale « Base Patients », un formulaire
   permet d'éditer le patient du module actif ; si un backend est configuré,
   la modification est aussi synchronisée via `PUT/POST /patients`.

7. **Backend FastAPI générique** (`backend/main.py`) — adapté du backend HBP
   de GeneralSurgPlan3D-4 : auth JWT, CRUD patients (avec champ `specialty`),
   segments anatomiques génériques, upload DICOM, volumétrie (générique +
   calcul FLR/TLV spécifique quand `specialty=hbp`), proxy IA Gemini/Groq,
   chat streaming en WebSocket, export DICOM SR.

## Fonctionnalités backend (résumé)

Au-delà du CRUD patients/DICOM/volumétrie de base, le backend a accumulé au
fil des sessions :

- **Sécurité** : JWT + 2FA TOTP opt-in, audit trail complet (`GET /audit`).
- **Persistance** : SQLite zero-config en dev, PostgreSQL + migrations Alembic
  en production (`backend/migrations/`).
- **Imagerie** : import DICOM manuel, connecteurs PACS DICOMweb (QIDO/WADO-RS)
  et DIMSE classique (C-FIND/C-GET), pont direct import → segmentation IA →
  viewer 3D sans re-upload.
- **Interop hospitalière** : export FHIR R4, HL7 v2 (ADT/ORM/ORU) avec envoi
  réel via MLLP.
- **Résilience** : circuit breakers + fallback Gemini→Groq→hors-ligne,
  gestionnaires d'exceptions globaux, tests de charge.

Détail de construction, bugs trouvés/corrigés et méthode de test de chacune
de ces briques : voir **[CHANGELOG.md](CHANGELOG.md)** (journal chronologique
des sessions — ne pas s'y fier pour l'état *actuel*, seulement l'historique ;
la section « Limites connues » ci-dessous fait foi).

## Démarrer le backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# éditer .env : GEMINI_KEY ou GROQ_KEY pour activer l'IA côté serveur
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Utilisateurs de démonstration : `dr.hadj` / `changeme`, `dr.benali` / `changeme`
(à remplacer par une vraie base utilisateurs avant toute mise en production).

## Utiliser le front

Depuis que le CSS/JS ont été extraits dans `assets/` (voir ci-dessus), un
double-clic direct sur `index.html` ne suffit plus de façon fiable : certains
navigateurs bloquent le chargement de fichiers `.js` locaux via `file://`
(restrictions CORS). Servez le dossier avec un petit serveur HTTP local, par
exemple :

```bash
python -m http.server 8080
# puis ouvrir http://localhost:8080/
```

(ou `npx serve`, ou tout autre serveur statique — aucun backend n'est requis
pour ce mode démo hors-ligne, juste un serveur de fichiers). Le backend
FastAPI sert aussi directement `index.html` (+ `assets/` en statique) sur
`GET /` une fois lancé (voir plus haut) — pratique si vous préférez tout
lancer d'un coup. Pour activer
l'IA en direct ou la persistance patients, ouvrez **⚙ Paramètres** et
renseignez :
- une clé API Gemini (https://aistudio.google.com/apikey), et/ou
- une clé API Groq, et/ou
- l'URL du backend (`http://localhost:8000` si lancé en local).

## Limites connues / suite possible

- La segmentation utilise le pipeline réel `backend/segmentation_service.py`
  (DICOM → NIfTI → TotalSegmentator → volumes voxel réels → maillage `.glb`) ;
  `requirements-segmentation.txt` (TotalSegmentator/dicom2nifti) est installé par
  défaut dans les Dockerfiles fournis. Vérifier l'état d'un déploiement via
  `GET /segmentation/capabilities`.
- ~~La base de données est en mémoire (redémarrage = perte des données)~~ —
  **corrigé** : persistance SQLite zero-config par défaut, PostgreSQL en
  production via `DATABASE_URL` + migrations Alembic (voir « Backend v2.0 »
  dans `CHANGELOG.md`).
- L'anatomie 3D est procédurale (silhouettes crédibles par spécialité, pas des
  maillages anatomiques importés depuis de vraies segmentations DICOM).
- **Transformation ophtalmologie (front)** : le cœur du parcours chirurgien
  (modules, anatomie 3D, staging clinique, guidelines, IA hors-ligne, vocal,
  CCAM) est entièrement réécrit pour l'ophtalmologie. Les panneaux « Mode
  Recherche » (SurgSim, découpe WebGPU, GenAI, robotique, bio-impression, BCI,
  nanorobots, autonomie L5, épigénétique, Raman/plasma, nsPEF/BNCT,
  organoïdes) ont aussi été repassés en texte ophtalmologique (perfusion
  rétinienne au lieu de FLR hépatique, quadrants rétiniens au lieu de segments
  de Couinaud, néovaisseaux choroïdiens/EPR/stroma cornéen au lieu de
  cible hépatique, etc.) ; ce sont des gadgets non cliniques réétiquetés,
  la logique géométrique sous-jacente (classification par octant, calcul de
  marge/volume) n'a pas été réécrite — seuls les libellés visibles au
  chirurgien ont changé.
- **Ce qui reste structurellement lié au foie (backend, pas juste du texte)** :
  le pipeline de segmentation IA réelle (`backend/segmentation_service.py`,
  `backend/mesh_export.py`, ainsi que `backend/monai_pipeline_v2.py` en mode
  Recherche) appelle TotalSegmentator avec les tâches `liver_segments`/
  `liver_vessels`/`total` — un modèle entraîné pour l'imagerie abdominale, qui
  n'a **aucune tâche pour les structures oculaires** (cornée, cristallin,
  rétine ne font pas partie de son répertoire d'organes). Il n'existe pas
  d'équivalent « TotalSegmentator pour l'œil » open-source à brancher à la
  place. Plutôt que de laisser le bouton « 🔬 Real AI Segmentation » aboutir
  à un résultat trompeur (ex. un volume hépatique ≈ 0 mL présenté comme une
  segmentation valide pour un patient qui n'a pas de foie dans le champ
  d'acquisition), le front bloque désormais explicitement cette action pour
  les 3 modules ophtalmo (voir `REAL_SEGMENTATION_SUPPORTED_SPECIALTIES` dans
  `assets/app-part1.js`) : message clair côté utilisateur, aucun appel réseau
  inutile, aucun job de ~15 min lancé pour rien. Conséquence assumée : le
  workflow « zero-touch » (imagerie arrivée au PACS la veille → maillage 3D
  réel prêt le matin du bloc) **n'existe pas pour l'ophtalmologie** ; seule
  l'anatomie procédurale (`SPECIALTY_SHAPE` + `makeLumpGeometry`) est
  disponible. Généraliser ce pipeline à d'autres organes demande soit un
  modèle de segmentation oculaire dédié (rare, souvent recherche/propriétaire),
  soit un entraînement spécifique — hors de portée d'une session de code sans
  données d'entraînement ni GPU. Le calcul FLR/TLV spécifique
  `specialty=hbp` existe toujours côté API (code mort pour ce dépôt, plus
  jamais atteint par le front ophtalmo) mais n'est plus le défaut : **corrigé
  depuis** — `backend/specialties.py` liste désormais les 3 modules ophtalmo
  (`cataracte`/`glaucome`/`retine`), `schemas.py`/`models.py` en ont fait leur
  valeur par défaut, et la migration `c3d4e5f6a7b8_specialty_ophtalmologie.py`
  aligne la colonne `patients.specialty` (contrainte CHECK + remap des lignes
  existantes) ; un patient créé côté front avec un backend réel connecté
  reçoit donc bien `specialty=cataracte` par défaut, plus `hbp`.
- **Tests de charge (`backend/tests/load_test.py`)** : couvrent désormais,
  en plus de `/health`/`/patients`/`/pacs/capabilities`, les endpoints
  `/segmentation/capabilities` (interrogé par le front avant chaque tentative
  de segmentation réelle) et `/patients/{id}/volumetrie`+`/segments` (créés à
  la volée sur un patient de test dédié). Ce que ce script **ne mesure
  toujours pas**, et ne peut pas mesurer dans ce sandbox : l'exécution réelle
  du job `/segmentation/auto` (calcul nnU-Net potentiellement de plusieurs
  minutes, généralement sur GPU — pas de GPU disponible ici), le comportement
  sous charge GPU réelle, et le comportement sur un réseau hospitalier
  dégradé/WAN (latence variable, perte de paquets) qui nécessiterait un outil
  dédié (tc/netem, Toxiproxy) ou un test depuis un poste distant sur le réseau
  cible. Les chiffres produits restent des ordres de grandeur pour valider le
  comportement du backend lui-même, pas un SLA de production.

## Modules « Recherche » — prototypes non cliniques, déjà isolés à l'exécution

Une partie de `backend/` (`bci_cortical_service.py`, `nanorobotics_swarm_service.py`,
`organoid_biomimetic_assembly_service.py`, `pqc_bioprinting_service.py`,
`epigenetic_sonogenetics_service.py`, `cryo_ire_bnct_service.py`,
`raman_spectroscopy_plasma_service.py`, `autonomous_robotic_laser_service.py`,
`iknife_reims_theranostics_service.py`, `genai_microsurgery_service.py`,
`robotic_ras_service.py`, `monai_pipeline_v2.py`, `webxr_spatial_service.py`,
`real_patient_dicom_mesh_service.py`) sont des **démonstrateurs spéculatifs
réétiquetés pour l'ophtalmologie**, sans valeur clinique — voir le détail dans
« Limites connues » ci-dessus.

**Déjà géré au runtime** (`backend/main.py`, section « Services EXPLORATOIRES ») :
ces 14 routers ne sont chargés que si la variable d'environnement
`RESEARCH_MODE=true` est explicitement positionnée (défaut : `false`,
documenté comme tel dans `.env.example` — « ne jamais activer en production »
en toutes lettres) ; chaque import est isolé dans son propre `try/except` pour
qu'une erreur sur un module exploratoire n'affecte jamais les endpoints
cliniques réels. Le front (`assets/app-part3.js`) distingue lui aussi
explicitement, dans l'UI, une estimation locale simulée (`is_local_simulation`)
d'une vraie donnée patient — ce n'est donc pas seulement du texte réétiqueté,
c'est marqué comme tel jusque dans les réponses API.

Ce qui reste vrai malgré cette isolation logique : ces fichiers cohabitent
**dans le même dépôt et le même déploiement** que le cœur clinique, ce qui
alourdit la surface auditée (14 fichiers non cliniques sur ~30 dans `backend/`)
même s'ils ne tournent jamais par défaut. Un déplacement physique vers
`backend/research/` resterait un nettoyage utile pour la lisibilité du dépôt,
mais n'est plus une urgence de sécurité — le garde-fou qui compte (aucun appel
possible sans flag explicite) existe déjà.

## Historique détaillé

Chaque fonctionnalité ci-dessus a été construite au fil de sessions
successives, documentées une par une (ce qui a été fait, bug réel trouvé/
corrigé le cas échéant, comment c'a été testé, limites honnêtes à l'instant T)
dans **[CHANGELOG.md](CHANGELOG.md)**.
