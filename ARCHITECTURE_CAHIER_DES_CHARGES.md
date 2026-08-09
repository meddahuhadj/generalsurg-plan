# ORLSurgPlan3D — Plateforme Mondiale de Chirurgie Augmentée
## Cahier des charges architectural et fonctionnel (v3.0)

**Document de référence** pour la transformation de `GeneralSurgPlan3D_MIMO_enrichi` en plateforme hospitalière de niveau production utilisée quotidiennement par des hôpitaux universitaires, centres de traumatologie, centres de cancérologie et cliniques privées.

> **Principes non négociables**
> 1. **Ne jamais supprimer** ce qui existe : tous les modules en place (auth + 2FA, PACS DICOMweb + DIMSE, FHIR R4, HL7 v2 + MLLP, segmentation TotalSegmentator, IA Gemini/Groq/WebLLM, mode OR/tactile/lecture seule, Jumeau Numérique PBD, audit trail, résilience circuit-breaker) sont **conservés et augmentés**.
> 2. **Compatibilité ascendante** : toute donnée existante (patients, segments, audit, DICOM persisté, comptes) reste valide.
> 3. **Évolutivité 20 ans** : modularité, contrats stables, plugins, formats ouverts.
> 4. **Régulation** : conçu dès le départ pour MDR 2017/745, FDA 510(k), ISO 13485/14971, IEC 62304/62366, HIPAA, RGPD.
> 5. **Performance** : scanner en < 3 s, reconstruction 3D en < 5 s, cent-milliers d'images supportées, WebGPU + WASM + multithreading.

---

## Table des matières

1. [Vision, périmètre et principes](#1-vision-périmètre-et-principes)
2. [Architecture logicielle cible](#2-architecture-logicielle-cible)
3. [Jumeau numérique et simulation](#3-jumeau-numérique-et-simulation)
4. [IA chirurgicale, prédictive et conversationnelle](#4-ia-chirurgicale-prédictive-et-conversationnelle)
5. [Bloc opératoire, navigation, AR/VR](#5-bloc-opératoire-navigation-arvr)
6. [Interopérabilité, sécurité, performance, base de données](#6-interopérabilité-sécurité-performance-base-de-données)
7. [UX/UI, collaboration, formation, analytique, réglementation, feuille de route 24 mois](#7-uxui-collaboration-formation-analytique-réglementation-feuille-de-route)
8. [Annexe — Catalogue d'innovations](#8-annexe--catalogue-dinnovations-25-fonctionnalités)

---

## 1. Vision, périmètre et principes

### 1.1 Vision produit

`ORLSurgPlan3D` devient **la plateforme de référence mondiale** qui couvre le continuum complet d'un acte chirurgical :

```
Acquisition   →   Planification   →   Simulation   →   Bloc Opératoire   →   Suivi
(DICOM/PACS)     (3D + IA + Jumeau)  (Scénarios)    (Navigation + AR)    (KPIs + Audit)
```

**Ambition clinique** : réduire la morbidité, optimiser le temps opératoire, standardiser la qualité entre centres, accélérer la formation des jeunes chirurgiens, et produire une base de connaissances anonymisée mondiale au service de la recherche.

### 1.2 Périmètre fonctionnel (rappel exhaustif)

| Domaine | Module | État actuel | Cible v3.0 |
|---|---|---|---|
| Auth & Accès | JWT + 2FA TOTP + RBAC | ✅ Livré | ➕ SSO SAML/OIDC, ABAC contextuel, ABMS, KERI/SSI |
| Données patient | CRUD + segments + DICOM | ✅ Livré | ➕ Jumeau numérique complet, historique versioning |
| 3D / Visualisation | Three.js + WebGPU partiel | ✅ Livré | ➕ Rendu différé PBR, post-FX HDR, ombres contact |
| MPR volumétrique | 3 plans (axial/coronal/sagittal) | ✅ Livré | ➕ MPR courbe, rendu cinéma 4D, recalage rigide |
| DICOM import | Fichiers `.dcm` | ✅ Livré | ➕ DICOM SR complet, SEG, RTSTRUCT, RTPLAN |
| PACS DICOMweb | QIDO-RS / WADO-RS | ✅ Livré | ➕ STOW-RS push, UPS-RS workflow |
| PACS DIMSE | C-FIND / C-GET | ✅ Livré | ➕ C-MOVE Storage SCP, MPPS |
| FHIR R4 | Export Patient/ImagingStudy/DiagnosticReport | ✅ Livré | ➕ Serveur FHIR natif, Subscription, SMART-on-FHIR |
| HL7 v2 | ADT^A08, ORM^O01, ORU^R01 + MLLP | ✅ Livré | ➕ MDM, SIU, batch SFT |
| IA Gemini/Groq | Chat + Live + action commands | ✅ Livré | ➕ Function-calling structuré, agents chaînés |
| IA locale | WebLLM + serveur local | ✅ Livré | ➕ RAG sur dossier patient, embeddings dédiés |
| IA segmentation | TotalSegmentator (CT) | ✅ Livré | ➕ MR/PET/Ultrasound, segmentation few-shot, atlas |
| Jumeau numérique | PBD déformable | ✅ Livré (foie) | ➕ Jumeau multi-organe + hyperélasticité + perfusion |
| Mode OR / Tactile / ReadOnly | UI bloc | ✅ Livré | ➕ Mode dégradé visuel, mode urgence |
| Audit trail | Table `audit_log` | ✅ Livré | ➕ WORM storage, intégrité cryptographique, GDPR ROPA |
| Sécurité | bcrypt + JWT | ✅ Livré | ➕ Vault KMS, BYOK HSM, chiffrement homomorphe (recherche) |
| Résilience | Circuit breaker + retry | ✅ Livré | ➕ Bulkhead, rate limiting adaptatif, chaos tests |
| Tests | pytest 22 tests + load test | ✅ Livré | ➕ Tests cliniques, tests d'interop multi-PACS, contract testing |
| OR intelligent | — | ❌ À créer | ✅ À créer (priorité 6) |
| Navigation perop | — | ❌ À créer | ✅ À créer (priorité 7) |
| AR | WebXR détecté, non rendu | 🟡 Partiel | ✅ À compléter (priorité 8) |
| VR simulateur | — | ❌ À créer | ✅ À créer (priorité 9) |
| IA décisionnelle | — | ❌ À créer | ✅ À créer (priorité 10) |
| IA prédictive | — | ❌ À créer | ✅ À créer (priorité 11) |
| Formation | — | ❌ À créer | ✅ À créer (priorité 12) |
| Base mondiale | — | ❌ À créer | ✅ À créer (priorité 13) |
| Collaboration | — | ❌ À créer | ✅ À créer (priorité 14) |
| Analytics / KPI | — | ❌ À créer | ✅ À créer (priorité 15) |
| Mode offline-first | Cache local | 🟡 Partiel | ✅ File d'attente offline (priorité 16) |

### 1.3 Personas

| Persona | Objectif | Modules critiques |
|---|---|---|
| **Chirurgien senior** | Planifier en 30 min, comparer stratégies, valider marges | Jumeau, simulation, IA décisionnelle |
| **Chirurgien junior** | Apprendre, répéter en VR, recevoir guidage perop | VR simulateur, navigation, base de cas |
| **Anesthésiste** | Voir planning bloc, dossiers critiques, alertes | OR intelligent, prédictif complications |
| **Infirmier(e) de bloc** | Préparer salle, instruments, implants | OR intelligent, scan codes-barres |
| **Cadre de bloc** | Optimiser planning, réduire temps mort, gérer conflits | OR intelligent, KPI |
| **Radiologue** | Importer, segmenter, annoter, transmettre | PACS, segmentation IA, reporting |
| **PUI / Pharmacien** | Consommables, implants, traçabilité | OR intelligent, inventaire |
| **Directeur qualité / DPO** | Audits, KPIs, RGPD, MDR | Audit trail, KPI, gouvernance |
| **Étudiant / interne** | Quiz, cas réels, VR | Formation, base mondiale |
| **Chercheur** | Anonymisation, requêtes, cohortes, statistiques | Base mondiale, analytique |
| **Patient** (portail optionnel) | Voir son jumeau, comprendre le plan, consentement éclairé | Consentement, visualisation simplifiée |

### 1.4 Principes directeurs (à relire avant toute PR)

1. **« Augmenter, ne pas remplacer »** — l'IA propose, le chirurgien dispose. Toute sortie IA non déterministe est étiquetée et expliquée.
2. **« Par défaut sécurisé »** — RBAC activé par défaut, 2FA opt-in mais recommandée, chiffrement au repos et en transit obligatoire, audit sur tout acte sensible.
3. **« Performance perçue »** — 60 fps sur la 3D, < 200 ms sur les actions utilisateur, loading skeletons sur tout > 100 ms.
4. **« Offline-first »** — l'app reste utilisable sans réseau, synchronisation différée, jamais d'écran bloqué.
5. **« Régulation by design »** — chaque module documente ses risques (ISO 14971), ses tests (IEC 62304), son UX (IEC 62366).
6. **« Pas de magic »** — pas de chiffre clinique sans source (algorithme + version + dataset d'entraînement) et disclaimer.

### 1.5 Glossaire

- **ABAC** — Attribute-Based Access Control.
- **ABMS** — Attribute-Based Medical Scope (autorisation par compétence vérifiée).
- **DICOM SR** — DICOM Structured Report.
- **FHIR** — Fast Healthcare Interoperability Resources.
- **FLR** — Future Liver Remnant (hépatectomie).
- **IHE** — Integrating the Healthcare Enterprise (profils).
- **Jumeau numérique** — modèle patient multi-échelle synchronisé.
- **KERI** — Key Event Receipt Infrastructure (SSI pour identités décentralisées).
- **MDR** — Medical Device Regulation (UE 2017/745).
- **MLLP** — Minimal Lower Layer Protocol (transport HL7 v2).
- **MPR** — Multi-Planar Reconstruction.
- **MPPS** — Modality Performed Procedure Step (DICOM).
- **OR** — Operating Room (bloc opératoire).
- **PBD** — Position-Based Dynamics.
- **RAG** — Retrieval-Augmented Generation.
- **RBAC** — Role-Based Access Control.
- **RT** — Radiotherapy (DICOM RTSTRUCT / RTPLAN / RTDOSE).
- **SAML** — Security Assertion Markup Language.
- **SEG** — DICOM Segmentation object.
- **SIU** — Scheduling Information Unsolicited (HL7).
- **SLA** — Service Level Agreement.
- **SSI** — Self-Sovereign Identity.
- **WORM** — Write Once Read Many.

---


## 2. Architecture logicielle cible

### 2.1 Vue d'ensemble (C4 - niveau 1)

```
+--------------------------------------------------------------------------+
|                         NAVIGATEUR (Front)                               |
|  Three.js r128+ | WebGPU | WebXR | WASM (Rust/C++) | Web Workers         |
|  IndexedDB | Service Worker (offline) | WebRTC (collab)                   |
+-----------------------------+--------------------------------+-----------+
                              | HTTPS / WSS (TLS 1.3, HSTS, mTLS optionnel)
+-----------------------------+--------------------------------+-----------+
|                         API GATEWAY (Kong / Traefik)                     |
|  AuthN (OIDC/SAML) | AuthZ (RBAC+ABAC+ABMS) | Rate-limit | WAF           |
|  OpenAPI | GraphQL federation | gRPC-Web | WebSocket fanout              |
+--+----+----+----+----+----+----+----+----+----+----+----+----+----+-------+
   |    |    |    |    |    |    |    |    |    |    |    |    |    |
   v    v    v    v    v    v    v    v    v    v    v    v    v    v
[Auth][Pat][DCM][PACS][FHI][HL7][IA] [3D] [OR] [Sim][Nav][AR][VR][Plu]
       [Aud][TWN][Form][Bd-M][Ana][Col]
   ^    ^    ^    ^    ^    ^    ^    ^    ^    ^    ^    ^    ^    ^
   +----+----+----+----+----+----+----+----+----+----+----+----+----+----+
                              |
            +-----------------+------------------+
            |   Event Bus (NATS/Redis)          |   Pub/sub asynchrone
            |   + Object Store (MinIO)          |   DICOM, GLB, STL, snapshots
            |   + Vector DB (Qdrant)            |   RAG, similarite, recherche
            +-----------------+------------------+
                              |
            +-----------------+------------------+
            |   PostgreSQL HA (Patroni)         |   Patients, segments, audit, OR
            |   TimescaleDB                     |   Metriques temps reel (KPIs)
            |   Lakehouse (Iceberg/S3)          |   Base mondiale anonymisee
            +------------------------------------+
```

### 2.2 Architecture microservices

L'application **monolithe FastAPI existante** est conservee comme **gateway metier** (point d'entree stable, deja deployee en production hospitaliere) et est progressivement completee par des **microservices specialises** en Rust/Go/Python. Chaque microservice respecte :

- API REST + gRPC, versionnee (`/v1/`, `/v2/`)
- Manifeste `service.yaml` (owner, SLO, dependances, secrets, contact)
- Health `/healthz` (liveness) et `/readyz` (readiness)
- Metriques Prometheus + logs JSON structures (Loki/ELK)
- Tracing OpenTelemetry vers Tempo/Jaeger
- Tests contractuels Pact par consommateur
- Container rootless, read-only fs, non-root user
- Limites CPU/mem strictes (requests/limits Kubernetes)

#### 2.2.1 Services a creer ou completer (par ordre de priorite)

| # | Service | Langage | Responsabilite | Reutilise |
|---|---|---|---|---|
| 1 | `auth-service` | Rust (axum) | OAuth2/OIDC/SAML, ABAC, ABMS, delegation | 2FA TOTP existant |
| 2 | `patient-service` | Python (FastAPI) | CRUD, consentement, RGPD, export FHIR Patient | Backend actuel |
| 3 | `dicom-ingest-service` | Python | STOW-RS, parsing, persistance, anonymisation | PACS existant |
| 4 | `pacs-federation` | Python | QIDO-RS, WADO-RS, UPS-RS, C-FIND/C-GET/C-MOVE | PACS existant |
| 5 | `segmentation-service` | Python (orchestrateur) + Python (worker GPU) | TotalSegmentator, MR/PET, atlas, few-shot | `segmentation_service.py` |
| 6 | `mesh-pipeline` | Python (worker) | Marching Cubes, lissage, GLB/STL, simplification | `mesh_export.py` |
| 7 | `twin-service` | Rust (compute) + Python (orchestrateur) | Jumeau numerique complet, PBD/Mooney-Rivlin, perfusion | PBD existant |
| 8 | `simulation-service` | Rust (compute intensif) | Decoupe, suture, coagulation, scenarios | PBD |
| 9 | `ia-decision-service` | Python (serveur) + GPU | Plan auto, marges, risques, justification | Gemini/Groq |
| 10 | `ia-predictive-service` | Python (serveur) | Risque operatoire, complications, recidive | Modeles ML maison |
| 11 | `ia-conversational-service` | Python (serveur) | Chat, vocal, function-calling, RAG | WebLLM, Gemini Live |
| 12 | `or-service` | Python | Planning, salles, personnel, instruments, conflits | Nouveau |
| 13 | `navigation-service` | Rust (temps reel) | GPS chirurgical, recalage, fusion capteurs | Nouveau |
| 14 | `ar-service` | Web (Three.js + WebXR) | Overlay AR, recalage surface, WebXR | WebXR partiel |
| 15 | `vr-service` | Unity (C#) ou Web (Three.js + WebXR) | Simulateur VR | Nouveau |
| 16 | `formation-service` | Python | Quiz, examens, cas, notation, certifications | Nouveau |
| 17 | `base-mondiale-service` | Python | Ingestion anonymisee, requetes, cohortes | Nouveau |
| 18 | `analytics-service` | Python (DuckDB + Superset) | KPI, dashboards, drill-down | Nouveau |
| 19 | `collab-service` | Python (FastAPI) + WebRTC | Session partagee, annotations, chat, visio | Nouveau |
| 20 | `audit-service` | Rust (WORM) | Journal immuable, integrite cryptographique | Table `audit_log` |
| 21 | `notification-service` | Python | Email, SMS, push, webhooks, alertes perop | Nouveau |
| 22 | `document-service` | Python | Generation PDF rapport, consentement, CR operatoire | Export DICOM SR existant |
| 23 | `consent-service` | Python (smart-contract SSI) | Consentement eclaire, granularite, revocation | Nouveau |
| 24 | `plugin-host` | WASM (extism) + ABI stable | Plugins tiers (nouvelle specialite, nouvel algo) | Nouveau |
| 25 | `cache-service` | Rust (in-memory) + Redis | Cache DICOM pixel, mesh, segmentation, hot patients | Nouveau |
| 26 | `queue-service` | NATS JetStream | Jobs asynchrones, retries, DLQ | Nouveau |
| 27 | `search-service` | Rust (Tantivy) | Recherche full-text patients, rapports, audit | Nouveau |
| 28 | `translation-service` | Python (serveur) | i18n + traduction CR (FR/EN/AR/ES/ZH) | Nouveau |
| 29 | `gateway-admin` | Python | Console d'admin, RBAC, configuration, feature flags | Nouveau |
| 30 | `mobile-companion` | Flutter (iOS/Android) | Vue reduite chirurgien (alertes, approbation) | Nouveau |

### 2.3 Contrats de service (exemples)

#### 2.3.1 `POST /v1/twin/{patient_id}/snapshot` (twin-service)

```yaml
openapi: 3.1.0
info:
  title: Twin Service
  version: 1.0.0
paths:
  /v1/twin/{patient_id}/snapshot:
    post:
      parameters:
        - name: patient_id
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [stages]
              properties:
                stages:
                  type: array
                  items:
                    type: object
                    properties:
                      action: { enum: [observe, deform, resect, suture, coagulate, implant] }
                      target: { type: string }
                      params: { type: object }
                compute_perfusion: { type: boolean, default: true }
                compute_biomechanics: { type: boolean, default: true }
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  snapshot_id: { type: string, format: uuid }
                  volumes_ml: { type: object, additionalProperties: { type: number } }
                  margins_mm: { type: number }
                  risks: { type: object }
                  warnings: { type: array, items: { type: string } }
                  duration_ms: { type: integer }
        '503': { $ref: '#/components/responses/ServiceUnavailable' }
```

#### 2.3.2 `POST /v1/ia/decision/plan` (ia-decision-service)

Entree : dossier patient (DICOM, bio, clinique) + imagerie chargee. Sortie : plan ordonne justifie.

```json
{
  "patient_id": "P-0001",
  "specialty": "hbp",
  "context": {
    "diagnosis": "CHC segment VIII 4.2cm",
    "comorbidities": ["cirrhose Child-Pugh A", "diabete T2"],
    "labs": {"bilirubine": 1.4, "albumine": 3.6, "INR": 1.1, "plaquettes": 110000},
    "imaging_summary": "Lesion unique 4.2cm segment VIII, contact VHD 7mm, FLR estime 38%",
    "consent_constraints": ["pas de transfusion"]
  },
  "request": "recommandation plan + marges + risques + ordre des gestes"
}
```

Reponse :

```json
{
  "plan": {
    "approach": "Laparoscopique robot-assistee",
    "resection_type": "Bisegmentectomie VII-VIII",
    "alternative_considered": ["Resection VIII wedge", "Ablation RF"],
    "justification": "Bisegmentectomie anatomique recommandee : marge > 10mm garantie, conservation segments VI/VII fonctionnels. Laparoscopie robot permet lymphadenectomie precise. Taux conversion attendu 4% (cohorte centre).",
    "steps": [
      {"order": 1, "action": "Positionnement decubitus dorsal 30 degres", "duration_min": 10},
      {"order": 2, "action": "Pneumoperitoine 12mmHg, trocarts configuration hepatique droite", "duration_min": 15},
      {"order": 3, "action": "Echo-laparoscopie : confirmation lesion + reperage VHD", "duration_min": 8},
      {"order": 4, "action": "Dissection pedicule glissonnien droit, clampage intermittent 15/5min", "duration_min": 25},
      {"order": 5, "action": "Transsection parenchyme CUSA, marge 10mm maintenue", "duration_min": 45},
      {"order": 6, "action": "Extraction specimen (sac)", "duration_min": 10},
      {"order": 7, "action": "Hemostase + biliostase, drainage", "duration_min": 20}
    ],
    "estimated_duration_min": 133,
    "estimated_blood_loss_ml": 320
  },
  "margins": {
    "planned_mm": 10,
    "predicted_achieved_mm": 9.2,
    "confidence": 0.81,
    "model_version": "tumor-margin-predictor-v3.2"
  },
  "risks": {
    "mortality_30d_pct": 1.4,
    "morbidity_major_pct": 18.7,
    "specific": [
      {"name": "Insuffisance hepatique postop", "pct": 6.1, "explanation": "FLR 38% borderline (seuil 35% chez cirrhotique)."},
      {"name": "Fistule biliaire", "pct": 9.3},
      {"name": "Hemorragie > 500mL", "pct": 7.4}
    ],
    "model_version": "risk-predictor-hbp-v4.1"
  },
  "explanation_summary": "Plan recommande sur la base de : taille lesion, position centrale, fonction hepatique preservee (Child-Pugh A), comorbidites controlees. Alternatives ecartees car : wedge (marge insuffisante, recidive +15%), RF (non anatomique, pas d'anapath extemporanee).",
  "evidence": [
    {"type": "guideline", "ref": "ILCA 2024 paragraphe 3.2"},
    {"type": "cohort", "ref": "Centre X, 2018-2023, n=287 cas similaires, morbi 16.2%"}
  ]
}
```

### 2.4 Flux DICOM / HL7 / FHIR (Automatisation Zero-Touch pour le Bloc Opératoire)

```
SCU modality --DICOM C-STORE--> PACS (Orthanc) --Webhook OnStableSeries / DICOMweb--> dicom-ingest --persistance (local_path garanti)--> MinIO
                                                                                              |
                                                                                              +--anonymisation--> PostgreSQL (DicomSeries)
                                                                                              |
                                                                                              +--Déclencheur Auto (J-1) -> POST /segmentation/from-series/{id}
                                                                                              |                                    |
                                                                                              |                                    v
                                                                                              |                       [TotalSegmentator / dicom2nifti]
                                                                                              |                                    |
                                                                                              |                                    v
                                                                                              |                       [Maillage 3D (.glb) & Jumeau Numérique]
                                                                                              |                                    |
                                                                                              |                                    v
                                                                                              +--Notification NATS--> [Prêt pour le Bloc Opératoire (0s latence)]

HL7 ADT^A08 --MLLP--> interop --> patient-service (mise a jour demographie)
                                  +--> audit-service

FHIR Subscription (post creation patient) --> formation-service (mise a jour cohortes)
                                          +--> analytics-service (KPI)
```

**Workflow Zero-Touch (OR Ready)** : Au bloc opératoire, le chirurgien ne doit **jamais** perdre de temps à importer des séries, lancer des scripts de segmentation ou attendre un calcul. Dès l'arrivée d'un scanner ou d'une IRM préopératoire au PACS de l'hôpital (J-1 ou H-4 de l'intervention), l'écouteur DICOM C-STORE ou un webhook Orthanc (`OnStableSeries`) déclenche automatiquement l'ingestion avec persistance locale (`local_path` non nul garanti) et lance le job asynchrone via `POST /v1/segmentation/from-series/{series_id}` ou `POST /v1/segmentation/auto`. Le maillage 3D et le jumeau numérique complet sont ainsi générés, validés et mis en cache en arrière-plan avant le début de l'intervention. À l'ouverture du dossier patient au bloc, l'affichage 3D et les métriques de résection sont disponibles instantanément (zéro seconde d'attente).

### 2.5 Topologie de deploiement (production hospitaliere)

Quatre environnements distincts :

1. **edge-or** : nœud edge ultra-local en salle d'opération (Bloc Opératoire) pour la navigation chirurgicale temps réel
   - Nœud physique ou appliance durcie branchée sur le switch LAN local de la salle d'opération (sans dépendance au réseau WAN hospitalier)
   - Hébergement dédié de `navigation-service` et `or-service` (recalage PBD, suivi des instruments et overlay AR/VR)
   - **Garantie temps réel et QoS** : Priorisation de trafic (DSCP Expedited Forwarding, VLAN dédié aux caméras et capteurs de navigation EM/optiques), latence soutenue garantie < 100 ms sans pics de latence pendant les gestes critiques
   - **Fallback dégradé autonome** : Si le réseau central de l'hôpital (PACS / PostgreSQL / Kubernetes central) est rompu pendant une intervention, le nœud edge fonctionne en totale autonomie à partir du jumeau 3D préchargé sur son stockage NVMe local, maintenant 100% de la précision de navigation sans micro-coupure pour le chirurgien
2. **edge-hospital** : deploiement on-premise dans l'hopital (RGPD, donnees patients ne sortent pas)
   - 3 noeuds Kubernetes minimum (HA, quorum etcd)
   - GPU NVIDIA L4 ou A10 (segmentation)
   - Stockage NFS ou Ceph pour DICOM
   - Air-gap reseau autorise (offline-first supporte)
3. **federation-cloud** : agregation anonymisee pour la base mondiale
   - Region UE (RGPD), chiffrement KMS BYOK
   - Pas d'acces Internet sortant hors PACS partenaires
4. **dev/staging** : replique, donnees synthetiques uniquement

**CI/CD** : GitLab CI / GitHub Actions vers registres OCI internes vers ArgoCD GitOps vers Argo Rollouts (canary) vers checks de conformite automatises (SBOM CycloneDX, CVE scan, tests cliniques, signature SLSA).

### 2.6 Evolution 20 ans - principes

- **Schemas versionnes** : chaque table porte `_schema_version`. Migrations retro-compatibles.
- **API versionnee par prefixe** : `/v1/`, `/v2/`, jamais de breaking changes.
- **Formats ouverts** : DICOM, FHIR, GLB, STL, NIfTI, OBJ, MTL, glTF - toujours en priorite sur les formats proprietaires.
- **Modules chargeables a chaud** : `plugin-host` permet d'ajouter une specialite, un algorithme, un connecteur sans redemarrer.
- **Documentation vivante** : OpenAPI auto-publie (Redoc), catalogue de services (Backstage), ADR (Architecture Decision Records) versions.

---


## 3. Jumeau numerique et simulation chirurgicale

### 3.1 Definition et objectifs

Le **Jumeau Numerique** est une representation virtuelle multi-echelle du patient, synchronisee avec les donnees cliniques, imagerie, biologiques et peroperatoires. Il sert a :

1. Planifier l'intervention (visualisation 3D, mesures, simulation).
2. Prevoir les resultats anatomiques et fonctionnels.
3. Tester plusieurs strategies chirurgicales sans risque patient.
4. Servir de reference pendant l'operation (navigation).
5. Persister comme dossier technique pour le suivi et la recherche.

### 3.2 Contenu obligatoire du jumeau (par patient)

| Couche | Contenu | Source |
|---|---|---|
| **Anatomie squelettique** | Os entier, avec fractures, lesions, protheses | CT/IRM |
| **Muscles** | Groupes musculaires de la region d'interet | IRM/segmentation TotalSegmentator |
| **Arteres** | Arbre arteriel jusqu'a 3-4 bifurcations | CT-angio / IRM-TOF |
| **Veines** | Arbre veineux (porte, sus-hepatique, cave, peripherique) | CT-angio / IRM |
| **Nerfs** | Plexus nerveux visibles a l'imagerie (limite) | IRM-DTI, atlas statistiques |
| **Organes** | Coeur, poumons, foie, reins, estomac, intestin, thyroide, etc. | TotalSegmentator + atlas |
| **Tumeurs / lesions** | Volume, forme, rapport aux structures voisines | Segmentation + radiolec |
| **Implants** | Protheses, stents, vis, plaques | CT, registre implants |
| **Variantes anatomiques** | Arteria hepatica dextra, veine porte droite, etc. | Detection auto (vaisseaux aberrants) |
| **Biomecanique** | Elasticite tissulaire, raideur, seuils de rupture | Atlas parametriques + ajustement IRM-ELASTO |
| **Vascularisation** | Carte perfusionnelle qualitative (arterielle/portale/veineuse) | Perfusion CT/MR + modele physiologique |
| **Perfusion** | Volumes perfuses, debit, temps de transit | Perfusion imaging + modele compartimental |
| **Volume** | Volumes (mL) reels par structure | Segmentation + calcul voxel |
| **Densite (HU)** | Distribution HU par structure | CT |
| **Elasticite** | Module de Young approxime (kPa) | IRM-ELASTO / atlas |

### 3.3 Schema du jumeau (relations principales)

```
Patient (1) ─── (1) Twin
Twin (1) ─── (N) TwinStructure
  TwinStructure.type = {organ, artery, vein, nerve, muscle, bone, implant, lesion, ...}
  TwinStructure.properties = {volume_ml, density_hu, young_modulus_kpa, ...}
  TwinStructure.mesh_url, mask_url, atlas_version

Twin (1) ─── (N) TwinRelationship
  type = {adjacent, contained, supplied_by, drained_by, innervated_by, perfused_by}
  source_structure_id, target_structure_id, weight, confidence

Twin (1) ─── (N) TwinBiomech
  tissue_type, model = {linear, Mooney-Rivlin, Ogden, Neo-Hookean}
  parameters_json, validation_dataset_ref

Twin (1) ─── (N) TwinPerfusionMap
  territory_id (FK TwinStructure), arterial_input, venous_output, flow_ml_min, transit_time_s

Twin (1) ─── (N) TwinVariant
  name, type, clinical_significance, confidence, evidence_ref

Patient (1) ─── (N) TwinSnapshot
  taken_at, action_sequence (JSON), outcomes_json, perf_metrics, signed_hash
```

### 3.4 Pipeline de construction du jumeau (Automatisation Zero-Touch OR)

0. **Déclencheur automatique (J-1 / H-4)** : Écouteur DICOM C-STORE SCP ou webhook PACS Orthanc (`OnStableSeries`) sur arrivée d'imagerie préopératoire -> appel automatique asynchrone sans intervention humaine via `POST /v1/segmentation/auto`. Garantie de persistance sur disque/objet (`local_path` non nul).
1. **Ingestion DICOM** (STOW-RS, fichier `.dcm` ou PACS WADO-RS).
2. **Normalisation** (reformat NIfTI, resampling 1x1x1 mm, bias-field correction N4).
3. **Segmentation multi-organes** (TotalSegmentator + atlas par specialite + few-shot).
4. **Extraction vasculaire** (modele de croissance de region + seuillage HU adapte + tracking de centreline).
5. **Recalage multi-modalites** (CT <-> IRM, rigide puis deformable B-spline).
6. **Cartographie perfusionnelle** (modele physiologique compartimental 1-2-3 compartiments).
7. **Estimation biomecanique** (atlas parametriques, ajustement IRM-ELASTO si dispo).
8. **Detection de variantes** (comparaison a un atlas de population, ecart > 2 SD = variante signalee).
9. **Validation** (verifications de coherence : pas de fuites, volumes physiologiquement plausibles).
10. **Publication et mise en cache OR** (snapshot signé, stocké dans MinIO et en mémoire edge, directement affichable au bloc en 0 seconde de latence sans attente ni réimport).

### 3.5 Simulation chirurgicale (simulation-service)

Capacites minimales :

- **Decoupe** (cisaillement, electrocautere, CUSA, lame froide) avec maintien de la coherence topologique du maillage.
- **Resection** (Wedge, segmentectomie, lobectomie, hepatectomie majeure, nephrectomie, colectomie, gastrectomie, thyroidectomie, etc.).
- **Suture** (run, point isole, surjet, agrafe, anastomosique termino-terminale / latero-laterale).
- **Coagulation** (modification locale de l'elasticite, retraction thermique).
- **Pose d'implant** (prothese, stent, plaque, vis, mesh, drain) avec gestion des collisions.
- **Deplacement** d'une tumeur pour tester une voie d'abord.
- **Recuit / annulation** multi-niveaux (historique complet).
- **Comparaison A/B** : 2 scenarios cote a cote, avec metriques (volume retire, volume restant, marges, distances, risques, perfusion, ischemie, duree, saignement).
- **Calculs automatises apres chaque geste** : volume retire/restant, marges aux structures adjacentes, distances inter-structures, angles, prediction de perte sanguine basee sur la perfusion du territoire, prediction d'ischemie residuelle.

#### 3.5.1 Algorithmes de simulation

- **PBD (Position-Based Dynamics)** : deja implemente (cf. README, 7 specialites testees). Pour l'elasticite lineaire.
- **PBD + contraintes de distance + contraintes de volume** : deformation sous traction/pression instrumentale.
- **Mooney-Rivlin** : hyperelasticite pour tissus mous (foie, poumon, cerveau, muscle). Solveur XPBD (eXtended PBD) plus stable pour les grandes deformations.
- **Neo-Hookean** : variante simplifiee pour temps reel.
- **Perfusion de Lattice-Boltzmann** sur maillage simplifie (50k cellules) : temps reel 30 Hz.
- **Coupe par plan + re-triangulation** (decoupe polygone) : algorithme de Sust-Vilanova (preservation topologique).
- **Suture par ressort + point de contrainte** : simulation discrete.
- **Implant par forme rigide + collisions OBB-SDF** : temps lineaire.

#### 3.5.2 Performance cible

- 60 fps pour le jumeau visible (jusqu'a 100k sommets).
- Deformation sous geste instrument : latence < 16 ms (PBD multi-thread WASM).
- Simulation perfusionnelle : 30 Hz sur GPU (compute shader WebGPU).
- Re-calcul de marges apres chaque geste : < 100 ms.
- Comparaison A/B avec delta visuels : < 500 ms.

### 3.6 Integration avec l'existant & Priorisation Clinique (DM d'Aide à la Décision)

- **De la Démonstration à la Simulation Clinique Validée** : Le PBD actuel (Section "Frontend - Jumeau numerique deformable" du README) constitue un prototype de faisabilité visuelle. Afin d'éliminer l'écart entre cette démonstration et les promesses de la spécification (`twin-service` Section 2.2.1 et tests `Mooney-Rivlin energy` Section 11.3.2), le développement priorise formellement :
  1. **L'hyperélasticité tissulaire réelle (Mooney-Rivlin)** : Transition vers un solveur XPBD / FEM certifié en Rust (`twin-service`), intégrant les constantes de Mooney-Rivlin et d'Ogden par spécialité chirurgicale et par patient (via élastographie IRM/ultrasons).
  2. **La gestion des collisions Organe-Instrument & Retour de Force** : Implémentation d'un algorithme de collision continue par champs de distance signés (SDF et OBB à 100 Hz), calculant la contrainte de traction sur le parenchyme et restituant un retour haptique sur console/instrument guidé.
  3. **La découpe et coagulation interactives** : Re-triangulation topologique dynamique en temps réel (algorithme de Sust-Vilanova) avec retour clinique immédiat sur la préservation des marges (R0/R1) et recalcul instantané du volume hépatique restant (FLR).
- Reutilise `buildOrgan()` et `SPECIALTY_SHAPE` du front actuel uniquement comme génération procédurale de secours en cas d'absence totale d'imagerie préopératoire.

### 3.7 API et indicateurs de qualite

- `GET /v1/twin/{patient_id}` : snapshot courant.
- `POST /v1/twin/{patient_id}/snapshot` : nouveau snapshot apres simulation.
- `GET /v1/twin/{patient_id}/diff?snap_a=X&snap_b=Y` : comparaison.
- `GET /v1/twin/{patient_id}/biomech` : parametres mecaniques.
- `GET /v1/twin/{patient_id}/perfusion` : carte perfusionnelle.
- KPIs :
  - **DICE** moyen inter-structures vs verite terrain (cible > 0.85 organe, > 0.7 tumeur).
  - **Volume erreur** (cible < 5 %).
  - **Stabilite PBD** (zero NaN sur 10 000 pas).
  - **Latence geste->recalcul** (cible p95 < 100 ms).

---


## 4. IA chirurgicale, predictive et conversationnelle

### 4.1 Principes communs

Toutes les IA du systeme partagent les memes invariants :

1. **Sortie toujours expliquee** (jamais une reponse sans `justification` + `evidence` + `model_version` + `confidence`).
2. **Sortie etiquetee** (`AI`, non validateur medical, decision finale = chirurgien).
3. **Sortie tracee** (audit_log + model_card + input hash + output hash).
4. **Mode degrade** prevu : si l'IA tombe, l'app reste utilisable (deja en place via `resilience.py` et circuit breaker).
5. **Pas d'hallucination silencieuse** : repond "je ne sais pas" avec niveau de confiance si input insuffisant.
6. **Garde-fous cliniques** : toute recommandation sensible passe par un validateur de regles (algorithmes deterministes, pas IA) avant affichage.

### 4.2 IA Chirurgicale Decisionnelle (ia-decision-service)

#### 4.2.1 Objectif

A partir du dossier patient complet (DICOM, bio, clinique, comorbidites, allergies, medicaments, implants, consentement, planning) :

- Proposer le **meilleur abord chirurgical** (open / lap / robot / endoscopie / hybride).
- Proposer la **meilleure strategie de resection** (anatomique / wedge / segmentectomie / lobectomie...).
- Proposer le **meilleur ordre des gestes** (steps + durees + dependances).
- Proposer les **meilleures marges** (mm) avec prediction de la marge reellement obtenue.
- Estimer la **duree operatoire**, la **perte sanguine**, le **risque transfusionnel**.
- Lister les **complications probables** avec probabilites.
- Lister les **difficultes** (variantes anatomiques, adherences, taille, position).
- Fournir un **plan de sortie** (USC vs salle de reveil, drainage, anticoagulation).

#### 4.2.2 Architecture

```
[Inputs] --+--> Pre-processeur (extraction de features : volumes, FLR, scores)
           +--> Graph de connaissances medicales (Neo4j : SNOMED, ICD-10, LOINC, RxNorm, Orphanet)
           +--> Regles deterministes (guidelines encodées en Drools/nools)
           +--> Modele de prediction tabulaire (XGBoost / TabNet) sur features patient
           +--> LLM (Gemini / Groq / WebLLM) avec prompt structure + RAG
           +--> Validateur de sorties (coherence, garde-fous, disclaimers)
           v
[Plan structure + justification + evidences + risques + alternatives + sources]
```

#### 4.2.3 Modeles et algorithmes

- **TabNet / XGBoost** sur features tabulaires : scores ASA, Child-Pugh, MELD, NIHSS, scores de comorbidite, bio recente, imagerie (volumes, FLR), caracteristiques tumeur (taille, position, contact vasculaire).
- **CNN 3D** (nnU-Net) pour extraction automatique des structures du jumeau et calcul des features radiologiques.
- **LLM avec RAG** : retrieval des guidelines (ILCA, ESMO, NCCN, ANAP, HAS, NICE) dans une base vectorielle (Qdrant), prompting structure (`system_prompt` + `few_shot` + chain-of-thought exige).
- **Function-calling structure** (Gemini/Groq tools) : un schema `tools` declare les actions reellement executables (recalcul volumetrie, simulation d'un geste, etc.).
- **Algorithmes deterministes de validation** : chaque sortie est confrontee a un encodeur de guidelines (ex : "si FLR < 35 % chez cirrhotique, marquer le plan comme 'risque hepatique eleve'").

#### 4.2.4 Tests et evaluation

- **Dataset interne** : 500+ dossiers annotes par 3 chirurgiens experts.
- **Validation externe** : 200 cas d'un autre centre.
- **Metriques** : exactitude du type de resection (top-1, top-3), exactitude des marges (MAE < 2 mm), calibration des probabilites de risque (Brier score), taux d'accord avec chirurgien senior (kappa > 0.6).
- **Tests cliniques** : double-aveugle planifie vs plan chirurgical reel, audit des deltas.

#### 4.2.5 Securite et conformite

- Pas d'inference envoyee a Gemini/Groq avec PHI non anonymisee (champ opt-in : si active, anonymisation prealable par `consent-service`).
- Mode degrade par defaut : 100 % local (WebLLM ou serveur local Ollama) avec prompt medical embarque.
- Journalisation complete (prompt, reponse, hash) dans `ia_decision_log`.
- Le systeme ne modifie jamais le dossier patient sans confirmation humaine explicite.

### 4.3 IA Predictive (ia-predictive-service)

#### 4.3.1 Scores calcules (avec model_version + intervalle de confiance + justification)

| Score | Specialites | Variables | Algorithme |
|---|---|---|---|
| **Risque operatoire global** | toutes | ASA, age, comorbidites, urgence, specialite, type geste | XGBoost calibre (isotonic) |
| **Mortalite 30 j / 90 j** | toutes | idem + fragilite (Clinical Frailty Scale) | DeepSurv / RSF |
| **Morbidite majeure (Clavien-Dindo >= III)** | toutes | idem + volumes + FLR si HBP | XGBoost |
| **Fistule biliaire** | HBP | FLR, diameter VBP, type resection, BMI | Logit + TabNet |
| **Insuffisance hepatique post-hepatectomie** | HBP | FLR, Child-Pugh, MELD, ICG-R15 | Logit + seuil |
| **Anastomose insufficiency** | colorectale, gastrique | hauteur anastomose, tabac, corticoides, BMI, NVPO | XGBoost |
| **Recidive 1 / 3 / 5 ans** | oncologique | stade TNM, marges, emboles, differentiation, biologie moleculaire | Cox PH + RSF |
| **Rehospitalisation 30 j** | toutes | duree sejour, complications postop, terrain | XGBoost |
| **Infection site operatoire** | toutes | NNIS, duree op, classe Altemeier, glycemie | Logit |
| **Duree d'hospitalisation predict** | toutes | comorbidites, type geste, complication predict | Gradient Boosting regressor |
| **Probabilite transfusion** | toutes | Hb preop, anticoagulants, type geste, perdu sang predit | Logit |
| **Delai de reprise alimentaire** | digestive | type resection, NVPO, morphiniques | XGBoost |
| **Risque de conversion lap -> open** | lap | IMC, taille lesion, antecedents, score adherences | XGBoost |
| **Probabilite de reintervention 30 j** | toutes | idem complic + terrain | XGBoost |

#### 4.3.2 Implementation

- `ia-predictive-service` (Python, FastAPI, scikit-learn + xgboost + pytorch).
- Reentrainement pipeline : Airflow / Dagster -> MLflow (tracking) -> MLflow Registry (modeles versions) -> API charge la version "production" / "candidate" (champ configurable par specialite).
- Donnees : dossiers pseudonymises du centre, augmentation par datasets publics (TCIA, MIMIC-CXR si pertinent).
- Tests : calibration plot, Brier score, discrimination AUC, decision curve analysis.
- **Explicabilite obligatoire** : SHAP values par prediction, sur les top-10 facteurs.

### 4.4 IA Conversationnelle (ia-conversational-service)

#### 4.4.1 Canaux

- **Chat texte** (deja en place via `/chat` REST + WebSocket `/ws/chat-stream`).
- **Vocal Gemini Live / Groq / Local** (deja en place via barre interactive, Web Speech API et WebLLM).
- **Commandes vocales/textuelles par Function-Calling Structuré** : Proscription définitive du parsing de préfixes texte de type `[ACTION:xxx]`. L'IA conversationnelle et vocale s'appuie strictement sur le schéma natif `tools`/`function_declarations` de l'API (Gemini, Groq, OpenAI). Les 27+ actions UI sont déclarées en tant qu'outils natifs, garantissant que les arguments et les intentions sont validés schématiquement par le modèle, éliminant 100% des erreurs de syntaxe, de formattage ou d'ambiguïté en salle d'opération.

#### 4.4.2 Ameliorations ciblees (Exigences OR & Sécurité Patient)

1. **Function-calling structuré & Confirmation Haptique/Sonore (Exigence Bloc Opératoire)** : Migration totale des 27+ commandes UI vers le schéma natif `tools`/`function_declarations`. Au bloc opératoire, un chirurgien ganté et masqué en environnement stérile exige une tolérance zéro sur la reconnaissance de commande. En complément, implémentation obligatoire d'une **confirmation haptique** (vibration de la manette/tablette OR) et/ou **sonore** (signal audio distinctif de validation ou d'alerte) avant et pendant l'exécution d'actions UI critiques (ex: bascule de vue 3D/MPR, modification de plan de coupe ou masquage de calque vasculaire pendant un clampage hépatique actif).
2. **RAG sur dossier patient** : embedding de chaque CR, imagerie-text, segment. Recherche semantique multi-modale. Reponse contextualisee au patient actif.
3. **Multi-langue** : FR, EN, AR, ES, ZH (Translation service + detecteur).
4. **Historique persistant** : conversations conservees par patient (chiffrees, purgeable par l'utilisateur), reutilisees comme memoire d'audit.
5. **Annotations vocales** : dicter une annotation sur une structure, transcrite, stockee, restituee en collaboration.
6. **Mode "verifier"** : l'agent peut lui-meme questionner l'utilisateur, demander une imagerie, demander un consentement, et reformer le plan apres nouvelle information.

#### 4.4.3 Architecture ciblee

```
[navigateur] --(WebSocket bidirectionnel)-> ia-conversational-service
                                                    |
                       +----------------------------+----------------------------+
                       |                                                         |
                  [LLM principal : Gemini/Groq/Local]                  [LLM de verification]
                       |                                                         |
                  [RAG: Qdrant + dossier patient + guidelines]                  |
                       |                                                         |
                  [Tools declares: setTheme, zoomIn, runSeg, ...]               |
                       |                                                         |
                  [Validateur: garde-fous + disclaimers]                         |
                       |                                                         |
                       +---> reponse (delta stream ou action executee)
```

#### 4.4.4 Prompt systeme (extrait, specialise HBP)

```
Tu es un assistant chirurgical expert en chirurgie hepato-bilio-pancreatique.
Tu assistes un chirurgien senior, JAMAIS tu ne remplaces sa decision.
Reponds en francais, de facon concise, structuree (points cles), avec references
lorsque possible.

Tu peux utiliser les outils suivants (function-calling) :
- run_segmentation(patient_id, structure) : lance une segmentation IA
- measure_volume(patient_id, structure) : calcule un volume
- show_structures(list) : affiche/cache des structures dans la vue 3D
- generate_report(patient_id, sections) : genere un rapport
- ...

Si la question exige un raisonnement clinique, structure ta reponse :
- Conclusion (1 phrase)
- Justification (3-5 points)
- Evidences (references ou cohortes)
- Risques / alternatives
- Limites (ce que tu ne sais pas)

Toujours ajouter en fin : "Cette suggestion est generee par IA. La decision
finale appartient au chirurgien."
```

### 4.5 Tests, monitoring et gouvernance IA

- **Monitoring en production** :
  - Latence (p50 / p95 / p99) par modele.
  - Taux d'erreur.
  - Drift detection (KS-test, PSI) sur les inputs et les outputs.
  - Taux de rejet par validateur.
  - Taux de relecture par chirurgien.
- **MLOps** : MLflow (tracking + registry) + Seldon Core ou BentoML (serving) + feature store (Feast).
- **Revalidation periodique** : tous les 6 mois ou apres 5 000 nouveaux dossiers, par specialite.
- **Comite IA** : revue trimestrielle par 3 chirurgiens + 1 radiologue + 1 ingenieur + 1 ethicien.
- **Registre des modeles** : chaque modele deploye documente (model_card : usage, limites, dataset d'entrainement, biais connus, performance, conformite reglementaire).
- **Explicabilite** : SHAP natif + exemples contrefactuels stockes par prediction.

---


## 5. Bloc operatoire intelligent, navigation peroperatoire, realite augmentee et virtuelle

### 5.1 Bloc operatoire intelligent (or-service)

#### 5.1.1 Fonctionnalites

| Domaine | Capacite |
|---|---|
| **Salles** | Configuration (type, equipements, taille, flux laminaire, robot oui/non), disponibilite, maintenance, nettoyage, statut (libre / occupe / nettoyage / maintenance) |
| **Chirurgiens** | Planning, specialites, gardes, repos post-garde, conflits, conges, competences (par geste), quota horaire, conges formations |
| **Anesthesistes** | idem + disponibilite IADE / MAR |
| **Infirmiers** | competences (circulante, instrumentiste, panseuse), planning, repos, gardes |
| **Instruments** | par intervention (check-list auto, scan code-barres RFID, sterilisation, cycle de re-use) |
| **Implants** | reference, taille, lot, fournisseur, traçabilite (numero de serie), peremption, compatibilite patient (taille, allergie metal, IRM-conditional) |
| **Consommables** | stocks, predictions d'usage, reapprovisionnement auto, scan utilisation |
| **Urgences** | insertion rapide (mode FastTrack), salle tampon, derogation personnel, derogation check-list |
| **Nettoyage** | cycle par salle, delais, produits, traçabilite (bionettoyage), conformite ISO |
| **Optimisation planning** | solveur CP-SAT (OR-Tools) : minimise temps mort, conflits, maximise utilisation, respecte les contraintes legales (repos, garde) |
| **Conflits** | detection auto (meme chirurgien sur 2 salles, salle deja reservee, instrument manquant, equipe incomplete) |
| **Notifications** | email, SMS, push, interphone (integration SIP) |
| **Integration** | HL7 SIU (planning), ORM (demande), FHIR Appointment / Schedule / Slot / HealthcareService |

#### 5.1.2 Schema de la base OR

```sql
-- Cles etrangeres logiques
OperatingRoom (1) -- (N) RoomSlot
OperatingRoom (1) -- (N) MaintenanceWindow
OperatingRoom (1) -- (N) CleaningCycle
OperatingRoom (1) -- (1) Robot (si robot-assistee)

Surgery (1) -- (1) OperatingRoom
Surgery (1) -- (N) SurgeryStaff
Surgery (1) -- (1) Patient
Surgery (1) -- (1) ProcedureType
Surgery (1) -- (1) AnesthesiaType
Surgery (1) -- (N) SurgeryImplant
Surgery (1) -- (N) SurgeryInstrument
Surgery (1) -- (N) SurgeryConsumable
Surgery (1) -- (1) Status (planned, ready, in_progress, closing, closing_cleaning, done, cancelled)
Surgery (1) -- (N) TimelineEvent (t0 induction, t1 incision, t2 closing, ...)
Surgery (1) -- (N) Phase (Preop, Anesthesia, Surgery, PACU, Postop)

StaffMember (1) -- (N) Competence (par geste, niveau, date validation)
StaffMember (1) -- (N) RestPeriod (legales)
StaffMember (1) -- (N) SurgeryStaff (avec role + horaires reels)

InventoryItem (1) -- (N) InventoryLot
InventoryItem (1) -- (N) SurgeryItem (par intervention, avec scan RFID/GS1)

CleaningCycle (1) -- (N) CleaningStep (avec produit, operateur, horodatage)
```

#### 5.1.3 Algorithme d'optimisation (CP-SAT)

Variables : `surgery_s[s, t, r]` (s chirurgie dans salle r au temps t).
Contraintes :
- une salle = 1 chirurgie a un instant t.
- un chirurgien = 1 salle a un instant t.
- respect temps de repos legal (11h entre gardes, 24h hebdo max selon legislation).
- duree op predite par `ia-predictive-service` +/- 20 %.

Objectif : minimiser `sum(temps_mort) + lambda * sum(conflits) + mu * sum(frais_deplacement)`.

Resolution en arriere-plan, recalculee sur chaque modification. Latence < 2 s pour horizon 7 jours / 10 salles / 30 chirurgiens.

#### 5.1.4 API

- `GET /v1/or/rooms?status=free&from=...&to=...`
- `GET /v1/or/surgeries?date=...&surgeon=...&status=...`
- `POST /v1/or/surgeries` (creer une intervention, declenche l'optimisation)
- `PATCH /v1/or/surgeries/{id}/reschedule` (drag & drop, conflict detection)
- `GET /v1/or/surgeries/{id}/checklist` (check-list officielle HAS / OMS)
- `POST /v1/or/surgeries/{id}/checklist/item` (scan RFID ou coche)
- `POST /v1/or/surgeries/{id}/timeline-event` (induction, incision, closing, etc.)
- `GET /v1/or/conflicts?from=...&to=...` (liste)
- `GET /v1/or/optimize?from=...&to=...&strategy=balanced` (recalcul)

#### 5.1.5 Tests

- **Tests unitaires** : solveur CP-SAT (verifier le respect des contraintes).
- **Tests d'integration** : cycle complet creation -> planning -> check-list -> chirurgie -> nettoyage -> cloture.
- **Tests de charge** : 1000 chirurgies / 50 salles / 100 chirurgiens / 30 jours.
- **Tests cliniques** : comparaison planning optimise vs planning reellement execute (gain temps mort cible > 15 %).

### 5.2 Navigation peroperatoire (navigation-service)

#### 5.2.1 Objectif

Un **GPS chirurgical** temps reel : le modele 3D (jumeau) suit les mouvements du patient et des instruments, et affiche en continu la position de l'instrument par rapport aux structures.

#### 5.2.2 Capteurs supportes

- **Camera endoscope** (stereo ou mono + SLAM).
- **Capteur electromagnetique** (NDI Aurora, trackers type Brainlab / Stryker).
- **Capteur optique** (NDI Polaris, ART, mVision).
- **Robot** (da Vinci, Hugo, Versius, Mako - interfaces vendor).
- **Echographe** (positionnement par capteur EM ou fusion visuelle).
- **IMU** (gyroscope/accelerometre, smartphone ou tablette).
- **Profondeur** (LiDAR / ToF / stereo).

#### 5.2.3 Architecture

```
[Capteurs bruts] --(driver)-> [Adaptateur] --(WebSocket/gRPC bas latence)-> [navigation-service]
                                                                     |
                                                                     v
                                              [Recalage rigide / deformable] --(pose t0, R0, t)
                                                                     |
                                                                     v
                                              [Fusion multi-capteurs (EKF / Unscented)]
                                                                     |
                                                                     v
                                              [Prediction position instrument vs jumeau]
                                                                     |
                                                                     v
                                              [Diffusion WebSocket <50ms] -> [Front : overlay 3D + AR + ecran bloc]
```

#### 5.2.4 Recalage

- **Recalage rigide initial** : appariement de points (clous / reperes fiducaux / anatomie visible), ICP (Iterative Closest Point) sur surface.
- **Recalage deformable** : pour les tissus mous (foie, poumon, cerveau), B-spline free-form deformation (FFD) ou modele biomecanique (PBD / XPBD / corotational linear FEM).
- **Mise a jour continue** : tracking temps reel (30 Hz minimum, ideal 100 Hz).

#### 5.2.5 Latence cible et garanties temps réel (SLA Bloc Opératoire)

- **Capteur -> recalage** : < 30 ms.
- **Diffusion overlay** : < 20 ms.
- **Latence totale chirurgien-percue** : **< 100 ms garantie et soutenue (100% des trames en navigation active)**, idéal < 50 ms. L'évaluation au percentile p95 est formellement proscrite pour le guidage chirurgical : un pic de latence (même de quelques centaines de millisecondes) lors d'un geste critique comme un clampage hépatique ou une exérèse au millimètre représente un danger patient inacceptable (EIG).
- **Mécanismes de garantie temps réel** :
  - **Déploiement Edge local** : Le `navigation-service` s'exécute sur un nœud edge (`edge-or`) physiquement présent en salle d'opération et relié par un commutateur LAN local isolé du WAN.
  - **QoS & Priorisation réseau** : Trafic réseau encapsulé dans un VLAN dédié avec marquage DSCP Expedited Forwarding (priorité absolue sur tout autre flux hospitalier).
  - **Isolation d'exécution** : Processus de recalage épinglé sur des cœurs CPU dédiés (CPU pinning / kernel temps réel préemptible ou thread haute priorité en RAM).
- **Résilience / Fallback dégradé autonome** : Si le réseau central hospitalier (PACS / PostgreSQL / Kubernetes) subit une coupure, le nœud edge conserve le jumeau 3D préchargé sur son stockage NVMe local et maintient le guidage peropératoire sans aucune dégradation de latence ni rupture de service pour le chirurgien.

#### 5.2.6 API

- `POST /v1/nav/{patient_id}/session` (ouvre une session, init recalage).
- `WS /v1/nav/{session_id}/stream` (stream bi-directionnel bas latence).
- `GET /v1/nav/{session_id}/pose` (position courante instrument + structures).
- `POST /v1/nav/{session_id}/target` (definit un point cible, affiche guidage).
- `POST /v1/nav/{session_id}/checklist` (verifie marges avant resection).
- `GET /v1/nav/{session_id}/replay` (rejeu de la session pour formation / audit).

### 5.3 Realite augmentee (ar-service)

#### 5.3.1 Modes

- **Tablette / smartphone** : overlay tenu en main, recalage par surface (SLAM + ICP).
- **Lunettes AR** (Hololens 2, Magic Leap 2, etc.) : WebXR `immersive-ar` (deja demarre dans le front actuel) ou SDK natif via WebUSB/IPC.
- **Ecran bloc** partage : AR projetee sur grand ecran mur (haut contraste, couleurs chirurgicales).
- **Casque operateur** : micro-OLED integre (futur).

#### 5.3.2 Fonctionnalites

- Affichage temps reel des **arteres, veines, nerfs, tumeurs, organes, implants** sur le patient.
- Profondeur respectee (occlusion des structures internes par les surfaces visibles).
- **Coupe virtuelle** : voir a travers les tissus jusqu'a la profondeur souhaitee.
- **Mesures live** (distance a une structure cible, angle d'instrument).
- **Guidage** (fleche vers la prochaine coupe, affichage marge residuelle).
- **Alertes** (zone interdite, marge insuffisante, structure critique approchee).
- **Photo / video** capturee avec overlay (pour formation et CR).

#### 5.3.3 Recalage

- SLAM monoculaire / stereo (OpenCV, ORB-SLAM3, OpenVSLAM).
- Detection de surface (mesh de la peau du patient depuis profondeur).
- Recalage ICP entre mesh surface et surface du jumeau.
- Suivi continu avec ajustement pour respiration (compensation B-spline).

#### 5.3.4 Limites assumees

- Dependance au materiel : AR de qualite medicale necessite lunettes validees.
- Verification clinique necessaire (FDA / CE sur l'ensemble lunettes + logiciel).
- Latence reseau < 50 ms requise (5G prive ou LAN filaire).

### 5.4 Realite virtuelle (vr-service)

#### 5.4.1 Simulateur VR

- **Casque** : Meta Quest 3 / Pro, PICO 4 Enterprise, Valve Index, Varjo Aero.
- **Modes** :
  - **Entrainement repetitif** : cas reels anonymises, repetition illimitee, evaluation automatisee.
  - **Planification immersive** : le chirurgien "entre" dans son patient, voit la tumeur sous tous les angles, simule plusieurs voies d'abord.
  - **Telepresence** : un expert guide a distance, annotations dessinees dans l'espace 3D, le chirurgien local les voit en AR.
  - **Formation evaluee** : scenarios d'erreur (hemorragie, lesion de voie biliaire, etc.), reaction chronometree, score.

#### 5.4.2 Implementation

- **Option 1** : Unity (C#) avec OpenXR, build Quest standalone (Quest 3 = GPU mobile, latence 72 / 90 Hz).
- **Option 2** : Web (Three.js + WebXR immersive-vr) pour deploiement simplifie mais performance limitee.
- **Recommandation** : Option 1 (Unity) pour les experiences complexes, Option 2 (Web) pour la consultation rapide.

#### 5.4.3 Evaluation

- Criteres d'evaluation (score) :
  - Temps operatoire.
  - Erreur de trajectoire.
  - Distance aux structures critiques (min, moyenne).
  - Quantite de saignement simule.
  - Respect de l'ordre des gestes.
  - Decisions face aux aleas.
- Rapports envoyes a `formation-service` pour notation.

#### 5.4.4 API

- `GET /v1/vr/scenarios?specialty=...&difficulty=...`
- `POST /v1/vr/sessions` (lance une session VR sur un scenario).
- `POST /v1/vr/sessions/{id}/event` (un evenement de simulation : geste, erreur, saignement).
- `GET /v1/vr/sessions/{id}/report` (rapport detaille).
- `GET /v1/vr/sessions/{id}/replay` (rejoue la session, en Web ou VR).

### 5.5 Integration au flux clinique

```
1. Veille preop : planning + IA decisionnelle + simulation (offline ou 1-2h avant bloc)
2. Induction : timeline t0
3. Installation champ : verification AR / recalage
4. Incision : timeline t1, debut navigation
5. Phase dissection : alertes temps reel, marges live
6. Phase resection : verification marges pre-resection
7. Phase reconstruction : verification anastomose (couleur, flux)
8. Closing : timeline t2
9. Postop immediate : CR genere, dicte vocalement, signe electroniquement
10. PACU / salle de reveil : monitoring precoce complications
11. Sortie : CR definitif, suivi a 30 j / 90 j via questionnaire patient
12. Base mondiale : anonymisation et ingestion (opt-in)
```

---


## 6. Interoperabilite, securite, performance, base de donnees

### 6.1 Interoperabilite

#### 6.1.1 Standards supportes (couvre ou etend les implementations existantes)

| Standard | Usage | Implementation actuelle | Cible |
|---|---|---|---|
| **DICOM** | Imagerie | Import `.dcm`, parsing `dicom-parser` | + DICOM SR, SEG, RTSTRUCT, RTPLAN, RTDOSE, Key Image Note |
| **DICOMweb** | PACS moderne | QIDO-RS, WADO-RS (pacs_client.py) | + STOW-RS (push), UPS-RS (workflow) |
| **DICOM DIMSE** | PACS classique | C-FIND, C-GET (pacs_dimse.py) | + C-MOVE, MPPS, Storage SCP permanent |
| **HL7 v2.5** | HIS / RIS | ADT^A08, ORM^O01, ORU^R01 + MLLP (interop.py, mllp_client.py) | + SIU (planning bloc), MDM (documents), ACK applicatif, batch SFT |
| **FHIR R4** | Interop moderne | Export Patient, ImagingStudy, DiagnosticReport (interop.py) | + Serveur FHIR natif, Subscription, SMART-on-FHIR, Bulk Data Access |
| **IHE** | Profils d'integration | partiel via FHIR/DICOM | + IHE-XDS-i, IHE-RAD, IHE-RO, IHE-PCC |
| **ORTHANC** | Mini-PACS | connexion distante | + deploiement en local comme PACS prive |
| **OHIF** | Viewer DICOM web | non integre | + integration comme viewer secondaire (cas externes) |

#### 6.1.2 Flux DICOM completes

```
[SCU Modality CT]
    |
    v
[PACS central] ---(DICOMweb QIDO-RS)--> dicom-ingest-service
    |                                       |
    |                                       +---> STOW-RS (push depuis PACS) -> MinIO
    |                                       +---> parsing -> PostgreSQL DicomSeries
    |                                       +---> anonymisation -> DicomSeries_anon
    |                                       +---> Webhook (NATS) -> segmentation-service (si auto)
    |                                       +---> Webhook -> audit-service
    |
    +---> (DICOMweb WADO-RS) --> dicom-ingest-service --> segmentation-service --> ia-decision-service
```

#### 6.1.3 Flux HL7 v2 + MLLP

```
[HIS] --(MLLP ADT^A08)-> interop-service --> patient-service (mise a jour demographie)
                                            +-> audit-service
                                            +-> notification-service (confirmation reception)

[RIS] --(MLLP ORM^O01)-> interop-service --> or-service (creation intervention)
                                            +-> notification-service (alerte chirurgien)
                                            +-> audit-service

[Labo] --(MLLP ORU^R01)-> interop-service --> patient-service (resultats bio)
                                              +-> ia-predictive-service (recalcul risques)
                                              +-> audit-service
```

#### 6.1.4 Flux FHIR

```
[App externe] --(FHIR Subscription /SubscriptionTopic=patient)-> patient-service
                                                            +-> formation-service
                                                            +-> analytics-service
                                                            +-> notification-service

[App externe] --(FHIR POST /ImagingStudy)-> patient-service (creation serie, sans DICOM direct)
[App externe] --(FHIR PUT /DiagnosticReport)-> document-service (rapport structure)
[App externe] --(FHIR $everything /Patient/{id})-> patient-service (export dossier complet)
```

#### 6.1.5 Serveur FHIR natif (cible)

- Implementation en Rust (`fhir-sdk` ou `octofhir`) ou HAPI-FHIR Java si plus simple.
- Base PostgreSQL dediee (schemas `fhir_patient`, `fhir_observation`, etc.).
- Authentification SMART-on-FHIR (OAuth2 + scopes).
- Validation automatique contre StructureDefinition de chaque profil (HL7 Base + profils nationaux ANS France).
- Indexation performante (search params Materialized Views).
- Subscription REST-hook et WebSocket.

### 6.2 Securite

#### 6.2.1 Authentification et autorisation (cible v3.0, evolution du JWT+2FA actuel)

```
+---------------------------------------+
|  AuthN (Authentification)             |
|  -----------------------------------  |
|  - Mot de passe (bcrypt)              |  <- deja en place
|  - 2FA TOTP (RFC 6238)                |  <- deja en place
|  - WebAuthn / Passkey (FIDO2)         |  <- a ajouter (priorite haute, plus UX que TOTP)
|  - SSO SAML 2.0                       |  <- a ajouter (hopitaux utilisent souvent SAML)
|  - SSO OpenID Connect                 |  <- a ajouter
|  - Certificat pro (CPS / e-CPS)       |  <- ideal, integration ANSSI / ASIP
|  - KERI / SSI (optionnel)             |  <- pour patients et delegations
+---------------------------------------+

+---------------------------------------+
|  AuthZ (Autorisation)                 |
|  -----------------------------------  |
|  - RBAC (role-based)                  |  <- role dans JWT deja
|  - ABAC (attribute-based)             |  <- a ajouter (contexte : service, garde, equipe)
|  - ABMS (attribut medical scope)      |  <- a ajouter (competences validees par geste)
|  - Obligation / Advice (XACML-like)  |  <- pour traces automatiques
|  - Break-the-glass                    |  <- mode urgence (justifie dans audit)
+---------------------------------------+

+---------------------------------------+
|  Session                              |
|  -----------------------------------  |
|  - JWT (access 15 min) + refresh      |  <- access court + refresh
|  - Token rotation                     |
|  - Re-auth obligatoire pour actions sensibles
|  - Idle timeout (configurable)
+---------------------------------------+
```

#### 6.2.2 Chiffrement

| Couche | Mécanisme | État |
|---|---|---|
| Transit | TLS 1.3 (chiffrement PFS uniquement) + HSTS + HPKP | ✅ À durcir en config (certbot, mTLS interne optionnel) |
| Repos DB | AES-256-GCM (pgcrypto, clé KMS) | ❌ À ajouter (PostgreSQL TDE ou pgcrypto) |
| Repos fichiers | chiffrement côté serveur (LUKS / cryptfs) | ❌ À ajouter selon hébergeur |
| Repos objet (MinIO) | SSE-KMS | ❌ À ajouter |
| Clés | HashiCorp Vault ou AWS KMS / Azure Key Vault, BYOK HSM | ❌ À ajouter |
| Mots de passe | bcrypt cost >= 12 | ✅ |
| PHI au repos en cache | Redis avec chiffrement activé | ❌ À ajouter |

#### 6.2.3 Audit trail (cible v3.0)

- Table `audit_log` actuelle : **conservee**.
- Ajout :
  - **Hash chain** (chaque ligne contient hash de la precedente) -> detection de tampering.
  - **Stockage WORM** (S3 Object Lock ou equivalent) -> impossibilite de reecrire.
  - **Signature cryptographique** (signature du DPO ou seuil multisig).
  - **Export probatoire** (rapport PDF signe, horodate RFC 3161).
  - **Politique de retention** configurable (par type d'action).
- **RGPD** : registre des traitements (ROPA) genere automatiquement, DPIA reference, base legale par traitement.

#### 6.2.4 Tests de securite

- SAST (Semgrep, Bandit, CodeQL) en CI.
- DAST (OWASP ZAP) sur staging.
- Dependency scan (Dependabot / Renovate + Trivy + Snyk).
- Penetration test annuel par un tiers certifie PASSI.
- Bug bounty programme (Immunefi / YesWeHack).
- Red team annuel.

#### 6.2.5 Conformite

- ISO 27001 (SMSI) -> recommande en complement.
- SOC 2 Type II si federation-cloud (clients US).
- HDS (Hebergeur Donnees de Sante) pour l'infrastructure francaise.

### 6.3 Performance

#### 6.3.1 Cibles SLA

| Métrique | Cible | Conditions |
|---|---|---|
| Chargement scanner (DICOM 500 coupes) | < 3 s | LAN, cache chaud |
| Reconstruction 3D (maillage 100k sommets) | < 5 s | GPU disponible |
| Chargement scanner (CT complet 2000 coupes) | < 8 s | LAN, premiere fois |
| Liste patients (1000) | < 200 ms | DB chaude |
| Recalcul volumetrie | < 100 ms | Cache chaud |
| Plan IA decisionnel | < 5 s (p95) | LLM Gemini, prompt 2k tokens |
| Reponse chat streaming | first token < 800 ms | |
| Navigation overlay | < 100 ms (p95) end-to-end | |
| Simulation geste (deformation) | 60 fps, 16 ms/frame | GPU dedie |
| Perfusion simulation | 30 fps, 33 ms/frame | GPU compute |
| Upscaling 100k vers 1M sommets | < 30 s | worker GPU |
| Memoire par session 3D | < 1.5 GB (client) | cas standard |

#### 6.3.2 Strategies d'optimisation

- **Front** : WebGPU (rendu + compute), Web Workers (parsing DICOM, decimation), WASM (Rust compilé en WASM : `wasm-pack` pour les calculs critiques - decimation, recalcul de normales, simulation).
- **Reseau** : HTTP/2 + HTTP/3 (QUIC), compression Brotli, image/gltf optimise.
- **Cache** :
  - L1 navigateur (IndexedDB) : dossier patient, dernier plan, mesh 3D.
  - L2 edge (Varnish / CDN prive) : DICOM tile, mesh, thumbnail.
  - L3 service (Redis) : sessions, calculs lourds, predictions.
  - L4 DB (materialized views, partial indexes).
- **Asynchrone** : jobs lourds (segmentation, simulation extensive, training modeles) en file NATS JetStream, polling ou WebSocket pour resultat.
- **DB** : connection pooling (PgBouncer), partitionnement par date (audit_log, dcm_series), index sur colonnes de recherche (full-text GIN, trigram).
- **Observability** : APM (OpenTelemetry), profilage continu (Pyroscope), flamegraph reguliers.

### 6.4 Base de donnees (schema etendu)

#### 6.4.1 Schema PostgreSQL (vue simplifiee, complement du `migrations/schema.sql` actuel)

```sql
-- Schemas metier
CREATE SCHEMA IF NOT EXISTS clinical;     -- patients, segments, dicom
CREATE SCHEMA IF NOT EXISTS twin;         -- jumeaux numeriques
CREATE SCHEMA IF NOT EXISTS sim;          -- scenarios, snapshots
CREATE SCHEMA IF NOT EXISTS or;           -- bloc operatoire
CREATE SCHEMA IF NOT EXISTS nav;          -- navigation perop
CREATE SCHEMA IF NOT EXISTS ar;           -- AR / VR
CREATE SCHEMA IF NOT EXISTS formation;    -- quiz, certifications
CREATE SCHEMA IF NOT EXISTS world;        -- base mondiale anonymisee
CREATE SCHEMA IF NOT EXISTS analytics;    -- KPI, agregats
CREATE SCHEMA IF NOT EXISTS collab;       -- sessions partagees
CREATE SCHEMA IF NOT EXISTS audit;        -- journal
CREATE SCHEMA IF NOT EXISTS auth;         -- utilisateurs, roles
CREATE SCHEMA IF NOT EXISTS fhir;         -- tables FHIR

-- Conservation de l'existant (clinical schema)
-- Table patients, segments, dicom_series, volumetrie_results, audit_log (deja existantes, a migrer dans le schema clinical)

-- Jumeau numerique (twin)
CREATE TABLE twin.twin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT NOT NULL REFERENCES clinical.patients(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  atlas_version TEXT,
  data_sources JSONB,         -- liste sources (CT, MR, PET, atlas, ...)
  quality_score NUMERIC(4,2), -- 0..1
  signed_hash TEXT
);
CREATE INDEX ON twin.twin(patient_id);

CREATE TABLE twin.twin_structure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id UUID NOT NULL REFERENCES twin.twin(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('organ','artery','vein','nerve','muscle','bone','implant','lesion','lymph_node','other')),
  label TEXT NOT NULL,
  volume_ml NUMERIC(10,2),
  density_hu NUMERIC(8,2),
  young_modulus_kpa NUMERIC(10,2),
  poisson_ratio NUMERIC(4,3),
  mesh_url TEXT,
  mask_url TEXT,
  confidence NUMERIC(4,2),
  is_variant BOOLEAN DEFAULT false,
  variant_type TEXT,
  clinical_significance TEXT,
  properties JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON twin.twin_structure(twin_id);
CREATE INDEX ON twin.twin_structure USING GIN (properties);

CREATE TABLE twin.twin_relationship (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id UUID NOT NULL REFERENCES twin.twin(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES twin.twin_structure(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES twin.twin_structure(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('adjacent','contained','supplied_by','drained_by','innervated_by','perfused_by','branch_of')),
  weight NUMERIC(6,3),
  confidence NUMERIC(4,2)
);

CREATE TABLE twin.twin_biomech (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id UUID NOT NULL REFERENCES twin.twin(id) ON DELETE CASCADE,
  tissue_type TEXT NOT NULL,
  model TEXT NOT NULL,                -- linear, Mooney-Rivlin, Ogden, Neo-Hookean
  parameters JSONB NOT NULL,
  validation_dataset_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE twin.twin_perfusion_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id UUID NOT NULL REFERENCES twin.twin(id) ON DELETE CASCADE,
  territory_id UUID NOT NULL REFERENCES twin.twin_structure(id) ON DELETE CASCADE,
  arterial_input UUID REFERENCES twin.twin_structure(id),
  venous_output UUID REFERENCES twin.twin_structure(id),
  flow_ml_min NUMERIC(8,2),
  transit_time_s NUMERIC(6,2),
  territory_volume_ml NUMERIC(10,2),
  map_url TEXT
);

CREATE TABLE twin.twin_variant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id UUID NOT NULL REFERENCES twin.twin(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  clinical_significance TEXT,
  confidence NUMERIC(4,2),
  evidence_ref TEXT
);

-- Simulation
CREATE TABLE sim.scenario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT NOT NULL REFERENCES clinical.patients(id) ON DELETE CASCADE,
  twin_id UUID REFERENCES twin.twin(id),
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  parent_scenario_id UUID REFERENCES sim.scenario(id),
  state_json JSONB,
  signed_hash TEXT
);

CREATE TABLE sim.snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES sim.scenario(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  action_params JSONB,
  volumes_ml JSONB,
  margins_mm NUMERIC(6,2),
  risks JSONB,
  warnings TEXT[],
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bloc operatoire
CREATE TABLE or.room (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  has_robot BOOLEAN DEFAULT false,
  equipment JSONB,
  status TEXT
);

CREATE TABLE or.surgery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT NOT NULL REFERENCES clinical.patients(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES or.room(id),
  procedure_type TEXT NOT NULL,
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  primary_surgeon TEXT NOT NULL,
  anesthesia_type TEXT,
  status TEXT,
  predicted_duration_min INTEGER,
  predicted_blood_loss_ml INTEGER,
  urgency TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE or.surgery_staff (
  surgery_id UUID NOT NULL REFERENCES or.surgery(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL,
  role TEXT NOT NULL,
  arrival_at TIMESTAMPTZ,
  departure_at TIMESTAMPTZ,
  PRIMARY KEY (surgery_id, staff_id, role)
);

CREATE TABLE or.timeline_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surgery_id UUID NOT NULL REFERENCES or.surgery(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB
);

CREATE TABLE or.cleaning_cycle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL REFERENCES or.room(id),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  operator_id TEXT,
  steps JSONB,
  status TEXT
);

CREATE TABLE or.staff_competence (
  staff_id TEXT NOT NULL,
  procedure_type TEXT NOT NULL,
  level INTEGER,
  validated_at TIMESTAMPTZ,
  validator_id TEXT,
  PRIMARY KEY (staff_id, procedure_type)
);

-- Navigation
CREATE TABLE nav.session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surgery_id UUID REFERENCES or.surgery(id),
  patient_id TEXT NOT NULL REFERENCES clinical.patients(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  status TEXT,
  config JSONB,
  signed_hash TEXT
);

CREATE TABLE nav.pose (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES nav.session(id) ON DELETE CASCADE,
  sensor_id TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  position JSONB NOT NULL,         -- {x,y,z}
  rotation JSONB NOT NULL,         -- quaternion
  confidence NUMERIC(4,2)
);
CREATE INDEX ON nav.pose(session_id, recorded_at DESC);

-- Formation
CREATE TABLE formation.quiz (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  specialty TEXT NOT NULL,
  difficulty TEXT,
  questions JSONB NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE formation.exam (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  specialty TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  score NUMERIC(5,2),
  max_score NUMERIC(5,2),
  answers JSONB
);

-- Base mondiale
CREATE TABLE world.case (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymized_id TEXT NOT NULL UNIQUE,
  specialty TEXT NOT NULL,
  anonymized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consent_opt_in BOOLEAN,
  summary_features JSONB NOT NULL,
  embedding VECTOR(1024),           -- pgvector
  outcomes JSONB
);
CREATE INDEX ON world.case USING ivfflat (embedding vector_cosine_ops);

-- Auth
CREATE TABLE auth.user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  email TEXT UNIQUE,
  rpps TEXT,
  hashed_password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'surgeon',
  scopes TEXT[],
  is_active BOOLEAN DEFAULT true,
  totp_secret TEXT,
  totp_enabled BOOLEAN DEFAULT false,
  totp_recovery_codes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth.role (
  id TEXT PRIMARY KEY,
  description TEXT,
  scopes TEXT[]
);

CREATE TABLE auth.user_attribute (
  user_id UUID REFERENCES auth.user(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, key)
);

-- Audit (extension)
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS prev_hash TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS row_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS signature TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_patient ON audit_log(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(username, created_at DESC);
```

#### 6.4.2 Politiques de retention

| Table | Retention | Justification |
|---|---|---|
| `clinical.patients` | 20 ans après dernier contact | obligation legale (dossier medical) |
| `clinical.dicom_series` | 20 ans (DICOM) | obligation legale |
| `clinical.audit_log` | 20 ans | preuve reglementaire |
| `nav.pose` | 10 ans (compression apres 1 an) | utilite medico-legale + formation |
| `sim.scenario` | 10 ans | reutilisation |
| `formation.exam` | 5 ans | conformite diplome |
| `analytics.*` (agregats) | indefini | KPI pas de donnees patient directes |
| `world.case` (anonymise) | indefini | recherche |

#### 6.4.3 Sauvegardes et PRA

- Sauvegarde PITR (Point-In-Time Recovery) PostgreSQL (WAL archive sur S3).
- Snapshot quotidien, retention 30 j.
- Snapshot mensuel, retention 7 ans.
- Replica synchrone sur un site secondaire (PRA, RTO < 1h, RPO < 5 min).
- Test de restauration trimestriel documente.
- Plan de continuite (PCA) : mode degrade documente.

---


## 7. UX/UI, collaboration, formation, analytique, reglementation, feuille de route 24 mois

### 7.1 UX/UI medicale de classe mondiale

#### 7.1.1 Principes

- **Hierarchie claire** : 1 action principale par ecran, 2 maximum.
- **Lisibilite bloc operatoire** : mode OR / tactile / readOnly deja en place, **a etendre** avec mode degrade visuel (fort contraste, couleurs chirurgicales - pas de bleu/vert cote a cote).
- **Latence perçue** : skeleton screens, optimistic updates, jamais d'ecran vide > 100 ms.
- **Accessibilite** : WCAG 2.1 AA minimum, navigation clavier complete, lecteur d'ecran compatible.
- **Internationalisation** : FR, EN, AR, ES, ZH minimum. RTL natif pour l'arabe.
- **Theme** : clair, sombre, **high-contrast** (mode bloc), **night-vision** (rouge sombre - pas de perte de vision nocturne au bloc).
- **Responsive** : desktop, tablette, smartphone, lunettes AR, ecran mural 4K.

#### 7.1.2 Composants UI cibles

| Composant | Specification |
|---|---|
| **Timeline chirurgicale** | ligne horizontale, zoomable, scrub temporel, evenements colores par type, distance au curseur = info-bulle detaillee |
| **Worklist** (liste patients) | filtres, tri, groupement, sauvegarde de vues, vue en cards ou table, pagination infinite |
| **Viewer DICOM** | MPR 3 plans + rendu volume 3D, overlays (segmentations, mesures), presets fenetrage organe (poumon, foie, os, etc.) |
| **Editor de plan** | drag & drop des structures, snapping, undo/redo multi-niveaux, comparaison A/B split view |
| **Assistant IA** | panneau dockable, mode compact (chat) ou large (chat + suggestions), historique, citations |
| **KPI dashboard** | widgets depliables, sauvegarde de dispositions, partage, export PDF, alertes en temps reel |
| **Notificateur** | centre de notifications (badge), toasts non intrusifs, sons configurables |
| **Consentement UI** | visuel clair, granulaire, telechargeable PDF, signature electronique (PadES) |
| **Planification OR** | timeline type Gantt, couleurs par chirurgien, drag & drop, alertes conflits |
| **Mode urgence** | 1 tap pour ouvrir patient, dossier simplifie, alertes majeures mises en avant |

#### 7.1.3 Navigation

- **Sidebar retractable** (rail mode / expanded mode).
- **Top bar** : recherche globale, notifications, profil, mode, theme, OR.
- **Bottom bar (mobile)** : navigation principale.
- **Raccourcis clavier** : tous les menus accessibles au clavier, documentation visible (`?`).
- **Commandes vocales** (deja 27 actions, etendues a 60+, cf. section 8).

#### 7.1.4 Tests UX (IEC 62366)

- Tests d'utilisabilite sommatifs par specialite (>= 15 chirurgiens par profil).
- Tests en environnement simule (salle de bloc factice).
- Tests sur sujet agé et handicapes (accessibilite).
- Test d'apprentissage (nouveau utilisateur realise une tache complete en < 5 min).
- Test d'erreur (utilisation sous fatigue, interruption, stress).

### 7.2 Mode collaboratif (collab-service)

#### 7.2.1 Fonctionnalites

- **Session partagee** : plusieurs chirurgiens travaillent en simultane sur le meme patient, le meme jumeau, la meme scene 3D.
- **Synchronisation temps reel** :
  - WebSocket bidirectionnel pour la scene 3D (CRDT pour convergence).
  - Latence cible p95 < 100 ms LAN, < 250 ms WAN.
- **Annotations** : texte, fleches, mesures, surimpression 3D partagees.
- **Chat integre** : lie a la session, conserve dans l'audit.
- **Visioconference** : WebRTC SFU (mediasoup / Janus), jusqu'a 8 participants, partage d'ecran, partage de la scene 3D.
- **Curseurs multiples** : voir ou chaque utilisateur regarde, clique, mesure.
- **Mode presentateur** : un seul controle la camera, les autres suivent.
- **Mode revue asynchrone** : annotations en differe, signets, notifications push.

#### 7.2.2 API

- `POST /v1/collab/sessions` (ouvre une session, genere lien d'invitation).
- `WS /v1/collab/sessions/{id}/sync` (sync 3D).
- `WS /v1/collab/sessions/{id}/rtc` (WebRTC signalling).
- `GET /v1/collab/sessions/{id}/participants`.
- `POST /v1/collab/sessions/{id}/annotations` (texte / fleche / mesure).
- `GET /v1/collab/sessions/{id}/replay` (rejeu timeline).

#### 7.2.3 Securite

- Session chiffree E2E (DTLS-SRTP pour video, WebSocket en wss).
- Lien d'invitation avec token a duree limitee + scope (read / comment / edit).
- Audit specifique : qui a modifie quoi, quand, depuis ou.

### 7.3 Mode formation (formation-service)

#### 7.3.1 Fonctionnalites

- **Cas reels anonymises** : integration directe avec `world.case` (base mondiale, opt-in).
- **Quiz** : QCM, QROC, cas clinique, identification de structures, reconnaissance d'imagerie.
- **Examens** : QCM + simulation + lecture critique d'article + entretien structure.
- **Correction automatique** : IA corrective avec reference aux attendus.
- **Notation** : score par exercice + score global + progression + par specialite.
- **Certifications** : emises en PDF signe electroniquement, registre blockchain optionnel.
- **Suivi des etudiants** : tableau de bord pour les enseignants, comparaison a la cohorte.
- **Curricula** : programmes structures (DES, DESC, DIU).
- **Gamification** : badges, classements, defis, mentorat.

#### 7.3.2 API

- `GET /v1/formation/quizzes?specialty=...&difficulty=...`
- `POST /v1/formation/exams/start`
- `POST /v1/formation/exams/{id}/answer`
- `POST /v1/formation/exams/{id}/finish` (correction auto + score).
- `GET /v1/formation/exams/{id}/report`.
- `GET /v1/formation/certifications/{user_id}`.
- `GET /v1/formation/cohort/{program_id}/stats` (pour enseignants).

### 7.4 Base de donnees mondiale (base-mondiale-service)

#### 7.4.1 Principes

- **Opt-in explicite** du patient (case a cocher dans le consentement, distincte du consentement soins).
- **Anonymisation irreversible** :
  - Suppression / hashage irreversible des identifiants directs (nom, IP, date naissance complete, adresse).
  - Generalisation (annee de naissance, region, code postal tronque).
  - Agregation (k-anonymat >= 5, l-diversite >= 3).
  - Audit de l'anonymisation par un tiers (CNIL / DPO).
- **Pas de re-identifiabilite** : pas de donnees genomiques brutes (juste variants), pas d'images brutes liees au cas (juste features).
- **Acces** : requetes par les chercheurs, gouvernance par un comite, log de chaque acces, delais de reponse (SLA 7 j).
- **Compensation** : publication de statistiques agregees en libre acces (Open Data).
- **Conformite** : RGPD, HIPAA Safe Harbor, conventions de recherche academique.

#### 7.4.2 Schema simplifie

```sql
CREATE TABLE world.case (
  id UUID PRIMARY KEY,
  anonymized_id TEXT UNIQUE,
  specialty TEXT,
  age_bucket TEXT,        -- [20-30], [30-40], ...
  sex TEXT,
  diagnosis_code TEXT,    -- ICD-10
  procedure_code TEXT,    -- CCAM
  center_country TEXT,    -- pays
  features JSONB,         -- features cliniques
  outcomes JSONB,         -- suivi 30j / 90j
  consent_opt_in BOOLEAN,
  consent_at TIMESTAMPTZ,
  embedding VECTOR(1024),
  created_at TIMESTAMPTZ
);
```

#### 7.4.3 API

- `GET /v1/world/stats?specialty=...&country=...` (Open Data).
- `POST /v1/world/cases/search` (chercheurs authentifies, gouvernance).
- `POST /v1/world/cases/{id}/access-request` (workflow comite).

### 7.5 Tableaux de bord / analytique (analytics-service)

#### 7.5.1 KPIs par audience

**Chirurgien** :
- nombre d'interventions par mois.
- duree moyenne, ecart-type par procedure.
- complications 30 j, comparaison a la moyenne du service.
- taux de conversion lap -> open.
- relecture par les pairs (qualite).

**Service / hopital** :
- occupation salle (% temps actif vs temps mort).
- duree moyenne, ecart-type, comparaison aux guidelines.
- complications, mortalite, par chirurgien (anonymes), par specialite.
- taux de transfusion, duree de sejour moyenne, taux de re-hospitalisation.
- couts reels vs couts predits.

**Bloc operatoire** :
- planning 7 j, conflits detectes, resolution proposee.
- temps de nettoyage moyen, respect des cycles.
- equipement en maintenance, alertes.
- taux d'utilisation des robots.

**Qualite / DPO** :
- conformite reglementaire (audits, declarations, RGPD).
- taux de consentement, opt-in base mondiale.
- delais de reponse incidents.
- taux de completion de la check-list OMS.

**Recherche** :
- nombre de cas anonymises, par specialite / pays.
- requetes, delais, acces.
- publications associees.

**Formation** :
- inscrits, taux de reussite, scores moyens.
- progres cohorte, comparaison historique.
- certifications delivrees.

#### 7.5.2 Implementation

- `analytics-service` Python avec DuckDB (OLAP) sur data lakehouse (Iceberg / Parquet sur S3).
- Refresh nightly des agregats, temps reel via Kafka/Redis pour les compteurs en direct.
- Visualisation : Superset (open source) ou Metabase, embeddee dans l'app.
- Export PDF / Excel / CSV.
- Alertes : rule engine (custom DSL) -> notification-service.

### 7.6 Securite, conformite et reglementation (consolide)

#### 7.6.1 ISO 13485 (Systeme de management qualite)

- Documentation maitrisee (DOC-001 a DOC-NNN, revue annuelle).
- Maîtrise de la conception (DMR, DHF, DHR par dispositif).
- Maîtrise des achats (fournisseurs critiques qualifies).
- Maitrise de la production (procedures, traçabilite).
- Maitrise des equipements de mesure (etalonnages).
- Gestion des non-conformites, actions correctives (CAPA).
- Revue de direction annuelle.
- Audit interne semestriel.

#### 7.6.2 ISO 14971 (Gestion des risques)

- Fichier de gestion des risques (Risk Management File RMF).
- Analyse de risques par module : identification, estimation, evaluation, maitrise, residuel.
- Risques classifies (severe / probable) avec mesures de reduction.
- Revue post-marche (PMS, PMCF) - feedback continu, vigilance.
- Cas cliniques rares : risque pris en compte.

#### 7.6.3 IEC 62304 (Logiciels de dispositifs medicaux)

- Classification logicielle par module (Classe A, B, C).
- Classe C (risque de mort / blessure serieuse) pour : IA decisionnelle, navigation, jumeau.
- Classe B pour : segmentation, simulation, OR.
- Classe A pour : visualisation, preferences.
- Processus de developpement : plan, analyse, conception, implementation, verification, validation, maintenance.
- Tests unitaires, integration, systeme pour chaque classe.
- Gestion des anomalies, traçabilite (matrice requirements -> tests).
- SBOM (Software Bill of Materials) CycloneDX, signature SLSA.
- Gestion des modifications (change control board).
- Archivage (regulatory archive) : 15 ans minimum.

#### 7.6.4 IEC 62366 (Ergonomie / utilisabilite)

- Specification d'utilisation (intended use, intended users, use environment).
- Analyse des taches (task analysis), risques d'usage (use error).
- Tests d'utilisabilite formatives (pendant le dev) et sommatives (avant commercialisation).
- Summary of Usability Engineering File.

#### 7.6.5 MDR 2017/745 (UE)

- Classement probable : **Classe IIb** (decision de plan + navigation = soutien a une decision, influence directe sur le patient).
- Dossier technique complet (Technical Documentation, Annexe II).
- Evaluation de la conformite : annexe IX (assessment par organisme notifie) ou X (production assurance).
- UDI (Unique Device Identification) genere et declare (EUDAMED).
- Resume des caracteristiques (Summary of Safety and Clinical Performance - SSCP).
- Etude clinique : PMCF (Post-Market Clinical Follow-up), investigation clinique avant marquage CE.
- Personne qualifiee (PRRC) designee.
- Systeme UDI + IUD.
- Vigilance (incident reporting, FSCA, FSN).
- Declaration de conformite + marquage CE.

#### 7.6.6 FDA 510(k)

- Determination de la "predicate device" (probable : Materialise Mimics, Brainlab, etc.).
- Dossier 510(k) : indications, comparaisons, performance, biocomcompatibilite (NA pour logiciel), logiciel (Level of Concern : Major), cybersecurite (FDA guidance 2023), etiquetage.
- Test clinique : bench, validation analytique, validation clinique.
- Cycle de revue FDA : 90 j minimum, 180 j typique.
- Logiciel : documentation "Software Documentation for a Premarket Submission" (FDA 2023 draft).
- Cybersecurite : SBOM, threat model, vuln management, patches.

#### 7.6.7 HIPAA (US) / RGPD (UE) / PIPEDA (CA)

- Privacy by design / by default.
- DPO (Data Protection Officer) designe (obligatoire RGPD pour donnees de sante).
- DPIA (Data Protection Impact Assessment) sur chaque traitement sensible.
- Registre des traitements (Records of Processing Activities - ROPA).
- Consentement eclaire, granulaire, revocable, traçable.
- Duree de conservation definie, suppression effective.
- Notification de violation sous 72 h (CNIL / supervisory authority).
- Droits des patients : acces, rectification, effacement, portabilite, opposition.
- Pseudonymisation (UUID opaques), anonymisation (pour la base mondiale).
- Encrypted at rest + in transit.
- Accès sur besoin d'en connaître (need-to-know).
- Logs d'accès (audit), conservation 6 ans minimum.

#### 7.6.8 HDS (Hebergeur Donnees de Sante - France)

- Hebergeur certifie HDS (ou hebergement interne certifie).
- Imputabilite et tracabilite de l'hebergeur.
- Audit annuel.

### 7.7 Feuille de route 24 mois

Format : **Jalon - Periode - Livrables - Criteres d'acceptation - Risques - Owner**.

#### Phase 0 (M1-M3) - Fondations (deja largement realisees)

- ✅ Auth JWT + 2FA TOTP
- ✅ Persistance PostgreSQL + migrations
- ✅ Audit trail
- ✅ PACS DICOMweb + DIMSE
- ✅ FHIR R4 export + HL7 v2 + MMLP
- ✅ Segmentation reelle (TotalSegmentator)
- ✅ Mode OR / tactile / readOnly
- ✅ Jumeau numerique PBD
- ✅ IA Gemini / Groq / WebLLM / local
- ✅ Resilience circuit breaker

**A completer dans cette phase** :
- WebAuthn / Passkey (FIDO2) en plus de TOTP.
- SSO OIDC (Keycloak) et SAML 2.0 (centre hospitalier integration).
- C-MOVE DICOM + Storage SCP permanent.
- STOW-RS DICOMweb.
- SIU^S12, SIU^S13 (planning bloc HL7).
- Serveur FHIR natif (smart-on-fhir).
- DICOM SR et SEG emis nativement.

#### Phase 1 (M4-M6) - Jumeau complet + Simulation avancee

- Jalon J1.1 : **Jumeau numerique multi-organe** (M4-M5)
  - Tables `twin.*` (twin, twin_structure, twin_relationship, twin_biomech, twin_perfusion_map, twin_variant)
  - Service Rust `twin-service` (recuperation features, validation)
  - Modele hyper-elastique (Mooney-Rivlin) integre dans PBD existant
  - Carte perfusionnelle qualitative (1ere version, modele compartimental)
  - Detection variantes anatomiques
  - KPIs : DICE > 0.85 organe, > 0.7 tumeur, latence recalcul < 200 ms
  - Risque : precision segmentation MR, calibration parametres biomechiques
  - Owner : equipe jumeau

- Jalon J1.2 : **Simulation interactive** (M5-M6)
  - Coupe, suture, coagulation, implant sur maillage
  - Comparaison A/B native
  - Recuit multi-niveaux
  - WebGPU compute shader pour perfusion
  - Mode benchmark performance
  - KPIs : 60 fps deformation, p95 recalcul marges < 100 ms
  - Risque : stabilite XPBD, robustesse decoupe topologique
  - Owner : equipe 3D

#### Phase 2 (M7-M9) - IA decisionnelle + predictive + vocale

- Jalon J2.1 : **IA decisionnelle** (M7-M8)
  - Service `ia-decision-service`
  - Ingestion 500 dossiers annotes
  - Modeles tabulaires (XGBoost) par specialite
  - Prompt structure RAG + function-calling Gemini/Groq
  - Validateur regles deterministes
  - Tests clinique double-aveugle
  - KPIs : kappa chirurgien > 0.6, MAE marges < 2 mm
  - Risque : hallucinations LLM, biais dataset
  - Owner : equipe IA

- Jalon J2.2 : **IA predictive** (M7-M9)
  - Service `ia-predictive-service`
  - Modeles par score (cf. section 4.3.1)
  - MLflow tracking + registry
  - SHAP natif dans les reponses
  - Reentrainement pipeline (Airflow)
  - KPIs : AUC > 0.75 par score, Brier < 0.2, calibration plot
  - Risque : drift, performance externe
  - Owner : equipe IA

- Jalon J2.3 : **IA vocale et function-calling** (M8-M9)
  - Migration de `voiceCommandInstructions()` vers function-calling structure
  - Extension a 60+ actions
  - RAG sur dossier patient
  - Multi-langue
  - Historique persistant
  - KPIs : taux de reconnaissance > 95 %, latence < 1 s
  - Risque : reconnaissance vocale au bloc (bruit), hallucinations
  - Owner : equipe IA + UX

#### Phase 3 (M10-M12) - Bloc operatoire + Navigation + AR/VR

- Jalon J3.1 : **Bloc operatoire intelligent** (M10-M12)
  - Service `or-service`
  - Solveur CP-SAT (OR-Tools)
  - Planning, conflits, optimisation
  - Check-list OMS automatisee
  - Traçabilite implants RFID/GS1
  - Dashboard cadre de bloc
  - KPIs : gain temps mort > 15 %, conflits detectes 100 %
  - Risque : resistance au changement, complexite regles metier
  - Owner : equipe OR + UX

- Jalon J3.2 : **Navigation peroperatoire MVP** (M11-M12)
  - Service `navigation-service` (Rust, bas latence)
  - Drivers NDI Aurora, Polaris
  - Recalage rigide initial (ICP)
  - Recalage deformable B-spline
  - Diffusion WebSocket < 50 ms
  - Interface overlay 3D
  - KPIs : latence p95 < 100 ms, recalage erreur < 3 mm
  - Risque : materiel specifique, validation clinique
  - Owner : equipe navigation

- Jalon J3.3 : **AR MVP** (M11-M12)
  - WebXR immersive-ar (prolongement du front actuel)
  - Recalage surface (SLAM + ICP)
  - Overlay des structures sur tablette / Hololens
  - Tests sur mannequin (pas en bloc)
  - KPIs : recalage erreur < 5 mm, latence < 100 ms
  - Risque : ecosysteme AR immature, lunettes medicales chères
  - Owner : equipe AR

#### Phase 4 (M13-M15) - VR + Formation + Collaboration

- Jalon J4.1 : **VR simulateur** (M13-M14)
  - Service `vr-service` (Unity ou WebXR)
  - 5 scenarios minimum (HBP, colorectale, thyroide, thoracique, cardiaque)
  - Evaluation automatisee
  - Multi-casque (Quest, PICO, Index)
  - KPIs : fluidite 90 Hz, score reproductible
  - Risque : adoption etudiants, cout materiel
  - Owner : equipe VR

- Jalon J4.2 : **Mode formation** (M13-M15)
  - Service `formation-service`
  - Banque de 100 quiz, 5 examens types
  - Correction IA + notation
  - Tableaux de bord enseignants
  - Certifications electroniques
  - KPIs : completion > 80 %, progres mesurable
  - Risque : contenu medical a valider
  - Owner : equipe formation + comite scientifique

- Jalon J4.3 : **Collaboration** (M14-M15)
  - Service `collab-service`
  - WebSocket CRDT pour scene 3D
  - WebRTC visio (mediasoup)
  - Annotations partagees, chat
  - Invitations securisees
  - KPIs : latence p95 < 100 ms, audio/video < 300 ms
  - Risque : NAT traversal, mobilite
  - Owner : equipe collab

#### Phase 5 (M16-M18) - Base mondiale + Analytique + Plugins

- Jalon J5.1 : **Base mondiale anonymisee** (M16-M18)
  - Service `base-mondiale-service`
  - Pipeline anonymisation irreversible
  - k-anonymat >= 5, l-diversite >= 3
  - API Open Data publique
  - API chercheurs (gouvernance)
  - Comite scientifique etabli
  - KPIs : 10 000 cas opt-in, requetes < 7 j
  - Risque : ethique, conformite multi-juridictions
  - Owner : equipe data + comite ethique

- Jalon J5.2 : **Tableaux de bord analytique** (M16-M17)
  - Service `analytics-service`
  - DuckDB + Superset
  - Dashboards par audience (chirurgien, service, qualite, recherche, formation)
  - Export PDF/Excel
  - Alertes temps reel
  - KPIs : adoption > 70 % des utilisateurs cibles
  - Risque : surcharge information
  - Owner : equipe analytics + UX

- Jalon J5.3 : **Plugin host (WASM)** (M17-M18)
  - Service `plugin-host`
  - ABI stable, sandboxing WASM (extism)
  - Catalogue de plugins
  - Signature cryptographique
  - Doc pour developpeurs tiers
  - KPIs : 5 plugins communautaires, latence < 50 ms
  - Risque : securite, ABI evolutions
  - Owner : equipe plateforme

#### Phase 6 (M19-M21) - Mobile + Securite renforcee + Tests cliniques

- Jalon J6.1 : **Application mobile compagnon** (M19-M21)
  - Flutter iOS / Android
  - Vue dossier simplifiee
  - Alertes push
  - Approbation perop
  - Scan code-barres implant
  - KPIs : 80 % des chirurgiens l'utilisent
  - Risque : homologation AppStore (medical app)
  - Owner : equipe mobile

- Jalon J6.2 : **Securite renforcee** (M19-M21)
  - Vault KMS (HashiCorp Vault ou cloud)
  - Chiffrement at rest (PostgreSQL TDE / pgcrypto)
  - Penetration test par tiers certifie PASSI
  - Bug bounty (programme prive Immunefi)
  - 2FA obligatoire (FIDO2 prioritaire)
  - RBAC + ABAC + ABMS complet
  - KPIs : zero CVE critique non patchees, pentest valide
  - Risque : time-to-patch CVE medicales
  - Owner : equipe securite

- Jalon J6.3 : **Tests cliniques et qualite** (M19-M21)
  - Tests cliniques par specialite (10 cas reels par specialite)
  - Double-aveugle planifie vs execute
  - Tests d'interoperabilite multi-PACS (3-4 vendors)
  - Tests de charge realistes (100 users concurrents)
  - Chaos tests (panne DB, panne GPU, panne LLM)
  - KPIs : couverture tests > 80 %, performance SLA atteinte
  - Risque : delais recrutement
  - Owner : equipe qualite + clinique

#### Phase 7 (M22-M24) - Regulation et mise sur le marche

- Jalon J7.1 : **Dossier MDR complet** (M22-M24)
  - Classification IIb
  - Dossier technique (Annexe II)
  - SSCP, EUDAMED
  - PMCF planifie
  - Etude clinique (si requise)
  - Marquage CE
  - KPIs : dossier accepte, CE obtenu
  - Risque : duree assessment organisme notifie
  - Owner : equipe reglementaire + direction

- Jalon J7.2 : **Dossier FDA 510(k)** (M22-M24, en parallele MDR)
  - Determination predicate
  - Dossier complet
  - Tests FDA specifiques
  - KPIs : 510(k) cleared
  - Risque : FDA questions, delai
  - Owner : equipe reglementaire

- Jalon J7.3 : **HDS + ISO 27001** (M22-M24)
  - Certification HDS (hebergeur + procedure)
  - SMSI ISO 27001 (optionnel mais recommande)
  - KPIs : HDS valide
  - Risque : duree audit
  - Owner : equipe securite + DPO

#### Synthese 24 mois

| Periode | Theme | Jalons | Livrables externes |
|---|---|---|---|
| M1-M3 (deja realise + a completer) | Fondations | WebAuthn, OIDC, STOW-RS, SIU, FHIR server | Patch v2.x en production |
| M4-M6 | Jumeau + Simulation | J1.1, J1.2 | v3.0 - Jumeau complet |
| M7-M9 | IA | J2.1, J2.2, J2.3 | v3.1 - IA decisionnelle |
| M10-M12 | OR + Nav + AR | J3.1, J3.2, J3.3 | v3.2 - Bloc intelligent |
| M13-M15 | VR + Formation + Collab | J4.1, J4.2, J4.3 | v3.3 - Universite |
| M16-M18 | Mondiale + Analytique + Plugins | J5.1, J5.2, J5.3 | v3.4 - Monde |
| M19-M21 | Mobile + Securite + Tests | J6.1, J6.2, J6.3 | v3.5 - Production |
| M22-M24 | Regulation | J7.1, J7.2, J7.3 | CE / 510(k) / HDS |

---


## 8. Annexe - Catalogue d'innovations (25 fonctionnalites)

Pour chaque innovation : interet clinique, valeur ajoutee, faisabilite technique, brevetabilite (sans affirmer qu'un brevet sera accorde), complexite (faible/moyenne/elevee).

### 8.1 Innovations coeur chirurgical

#### F1. Plan chirurgical decisionnel explique par IA

- **Interet clinique** : reduire le temps de planification, standardiser la qualite entre chirurgiens juniors et seniors, justifier chaque decision par des evidences.
- **Valeur ajoutee** : sortie structuree (approche, type resection, ordre des gestes, marges, duree, saignement, complications, alternatives) avec justifications et references. Permet l'audit, la formation, la comparabilite inter-centres.
- **Faisabilite** : moyenne. Combine modeles tabulaires (XGBoost), LLM (Gemini/Groq) avec RAG, et regles deterministes de validation. Base de 500+ dossiers annotes.
- **Brevetabilite** : moyenne (methode de generation de plan avec justification probabiliste - a proteger).
- **Complexite** : elevee.

#### F2. Score de risque predictif calibre et explicable (SHAP)

- **Interet clinique** : information chiffree du patient, aide a la decision, tri des patients a risque.
- **Valeur ajoutee** : 14 scores par specialite, calibres (isotonic), avec SHAP natif pour expliquer chaque prediction. Permet au chirurgien de comprendre le "pourquoi".
- **Faisabilite** : moyenne. ML classique, XGBoost + calibration. Donnees pseudonymisees du centre + datasets publics.
- **Brevetabilite** : moyenne (methode de calibration des scores par specialite avec contexte clinique).
- **Complexite** : moyenne.

#### F3. Jumeau numerique hyper-elastique + perfusion

- **Interet clinique** : prediction du comportement des tissus mous, planification precise, prediction d'ischemie.
- **Valeur ajoutee** : modele biomecanique reequilibre, simulation de deformation sous geste, prediction de la perfusion residuelle apres resection.
- **Faisabilite** : moyenne-haute. PBD actuel + extension Mooney-Rivlin + Lattice-Boltzmann simplifie.
- **Brevetabilite** : haute (methode de couplage PBD-perfusion pour prediction d'ischemie).
- **Complexite** : elevee.

#### F4. Coupe chirurgicale interactive multi-outils

- **Interet clinique** : simuler chaque geste avant l'operation, comparer differentes strategies.
- **Valeur ajoutee** : cisaillement, electrocautere, CUSA, lame froide, agrafeuse, anastomose termino-terminale / latero-laterale. Recuit, comparaison A/B, calcul automatique de marges et de volumes.
- **Faisabilite** : moyenne. Algorithmes Sust-Vilanova pour la coupe, PBD pour la deformation, post-processing.
- **Brevetabilite** : moyenne (methode de simulation d'anastomose avec prediction de debit / tension).
- **Complexite** : moyenne.

#### F5. Navigation GPS chirurgical temps reel (< 100 ms)

- **Interet clinique** : guidage precis pendant l'intervention, securite accrue, formation continue.
- **Valeur ajoutee** : position de l'instrument en temps reel, recalage rigide initial + deformable continu, alertes de securite, traçabilite complete.
- **Faisabilite** : moyenne. Drivers materiels (NDI, Brainlab), recalage ICP + B-spline, WebSocket bas latence.
- **Brevetabilite** : haute (methode de recalage continu par fusion multi-capteurs + modele biomecanique).
- **Complexite** : elevee.

#### F6. Realite augmentee chirurgicale (Hololens / tablette)

- **Interet clinique** : voir a travers le patient, superposition des structures critiques.
- **Valeur ajoutee** : arteres, veines, tumeurs, nerfs sur le patient. Profondeur respectee, mesures live, alertes de securite.
- **Faisabilite** : moyenne. WebXR `immersive-ar` (deja demarre) + SDK natif si besoin + recalage surface.
- **Brevetabilite** : moyenne (methode de recalage surface-jumeau pour AR medicale).
- **Complexite** : moyenne.

#### F7. Simulateur VR avec evaluation automatisee

- **Interet clinique** : formation sans risque, repetition illimitee, evaluation objective.
- **Valeur ajoutee** : cas reels anonymises, scenarios d'erreur, score reproductible, replay.
- **Faisabilite** : moyenne. Unity (C#) ou Three.js + WebXR immersive-vr.
- **Brevetabilite** : moyenne (methode d'evaluation automatisee par capture d'evenements + scoring multi-criteres).
- **Complexite** : moyenne.

#### F8. Reconnaissance automatique de variantes anatomiques

- **Interet clinique** : detection d'arteria hepatica dextra, veine porte droite, etc. - evite les lesions iatrogenes.
- **Valeur ajoutee** : comparaison du jumeau a un atlas, marquage automatique des variantes significatives.
- **Faisabilite** : moyenne. CNN de segmentation vasculaire + comparaison statistique vs atlas.
- **Brevetabilite** : moyenne (methode de detection basee sur un atlas multi-centre).
- **Complexite** : moyenne.

#### F9. Planification de l'embolisation preoperatoire

- **Interet clinique** : embolisation des branches qui vascularisent la tumeur avant resection = moins de saignement.
- **Valeur ajoutee** : plan 3D des branches a emboliser, prediction de la zone devascularisee, coordination radiologie interventionnelle / chirurgie.
- **Faisabilite** : moyenne. Segmentation arterielle + simulation de flux.
- **Brevetabilite** : moyenne.
- **Complexite** : moyenne.

#### F10. Planification d'anastomose (vasculaire, biliaire, digestive)

- **Interet clinique** : prediction de la tension, du debit, du risque de fistule.
- **Valeur ajoutee** : simulation de l'anastomose (termino-terminale, latero-laterale), prediction du debit, de la tension, du risque de complication.
- **Faisabilite** : moyenne. Maillage + simulation de fluide simplifiee + regles chirurgicales.
- **Brevetabilite** : haute (methode de simulation d'anastomose avec prediction de tension / debit / risque).
- **Complexite** : moyenne.

### 8.2 Innovations IA et decisionnel

#### F11. IA conversationnelle multimodale (chat + vocal + geste)

- **Interet clinique** : interaction mains-libres au bloc, gain de temps, assistance contextuelle.
- **Valeur ajoutee** : comprendre un ordre vocal ou texte, executer une action, repondre a une question, dicter un CR.
- **Faisabilite** : moyenne. WebLLM / Gemini / Groq + RAG + function-calling structure.
- **Brevetabilite** : faible (technologie largement connue).
- **Complexite** : moyenne.

#### F12. Function-calling structure pour 60+ actions UI

- **Interet clinique** : fiabilite, tracabilite, gouvernance.
- **Valeur ajoutee** : remplacement du prompt `ACTION_COMMAND_INSTRUCTIONS` par un schema `tools` declare - moins d'hallucinations, plus de determinisme.
- **Faisabilite** : moyenne.
- **Brevetabilite** : faible.
- **Complexite** : moyenne.

#### F13. RAG sur dossier patient (recherche semantique multi-modale)

- **Interet clinique** : poser une question en langage naturel sur le dossier, obtenir une reponse contextuelle.
- **Valeur ajoutee** : embedding de chaque CR, image-text, segment. Reponse contextuelle au patient actif.
- **Faisabilite** : moyenne. Qdrant, embeddings medbio (PubMedBERT, MedCPT), pipeline d'indexation.
- **Brevetabilite** : moyenne (methode d'indexation multi-modale de dossiers medicaux).
- **Complexite** : moyenne.

#### F14. Agents IA specialises par specialite (chain-of-agents)

- **Interet clinique** : reponses plus precises, audit detaille.
- **Valeur ajoutee** : un orchestrateur qui delegue a des agents specialises (HBP, colorectal, etc.), chacun avec son knowledge base, ses guidelines, ses modeles.
- **Faisabilite** : moyenne. LangGraph / AutoGen, prompts structures, RAG specialise.
- **Brevetabilite** : moyenne.
- **Complexite** : moyenne.

#### F15. Detection d'anomalies et alertes predictives (temps reel)

- **Interet clinique** : vigilance perop, alerter avant une complication.
- **Valeur ajoutee** : surveillance des constantes (scope, monitoring, labs), detection d'anomalies (tachycardie, hypotension, chute Hb, etc.), prediction d'evenement (hemorragie, choc, infection).
- **Faisabilite** : moyenne. Modeles LSTM/Transformer sur series temporelles, integration monitoring.
- **Brevetabilite** : haute (methode de prediction de complication a partir de series temporelles multiparametriques perop).
- **Complexite** : elevee.

### 8.3 Innovations bloc operatoire

#### F16. Planification intelligente par solveur CP-SAT

- **Interet clinique** : optimisation du temps de bloc, reduction du stress, baisse des couts.
- **Valeur ajoutee** : solveur qui minimise les conflits et le temps mort, respecte les contraintes legales (repos, garde), integre les predictions de duree et de risque.
- **Faisabilite** : moyenne. OR-Tools Python, interface drag & drop, dashboard.
- **Brevetabilite** : faible.
- **Complexite** : moyenne.

#### F17. Check-list OMS automatisee + scan RFID

- **Interet clinique** : conformite, tracabilite, reduction des erreurs.
- **Valeur ajoutee** : scan RFID/GS1 des instruments, implants, consommables, verification automatique, signature electronique, horodatage.
- **Faisabilite** : moyenne. Lecteurs RFID/GS1, API check-list OMS encodees.
- **Brevetabilite** : faible.
- **Complexite** : moyenne.

#### F18. Traçabilite implant complete (UDI + lot + patient)

- **Interet clinique** : rappel de lot, vigilance, conformite EUDAMED.
- **Valeur ajoutee** : chaque implant lie au patient, au lot, au fabricant, avec peremption. Compatible EU UDI (Basic UDI-DI + UDI-DI + UDI-PI).
- **Faisabilite** : moyenne. Scan GS1, base EUDAMED (si accessible), export PDF UDI.
- **Brevetabilite** : faible.
- **Complexite** : moyenne.

#### F19. Nettoyage automatise (bionettoyage) avec preuve

- **Interet clinique** : hygienie, conformite ISO, prevention des infections nosocomiales.
- **Valeur ajoutee** : cycle de nettoyage par salle avec produit, duree, operateur, signature electronique, verification conformite (norme EN 13727 etc.).
- **Faisabilite** : moyenne.
- **Brevetabilite** : faible.
- **Complexite** : faible.

#### F20. Mode urgence / FastTrack (insertion rapide)

- **Interet clinique** : intervention rapide sur hemorragie, polytrauma, transplantation.
- **Valeur ajoutee** : 1 tap pour ouvrir patient, dossier simplifie, alertes majeures mises en avant, derogation check-list avec justification, salle tampon automatique.
- **Faisabilite** : moyenne. UI dediee, derogations documentees, traçabilite renforcee.
- **Brevetabilite** : moyenne.
- **Complexite** : moyenne.

### 8.4 Innovations collaboration et formation

#### F21. Mode collaboratif multi-chirurgiens (WebRTC + 3D sync)

- **Interet clinique** : tele-expertise, enseignement, garde partagee.
- **Valeur ajoutee** : session partagee, scene 3D synchronisee, visioconference, annotations, chat.
- **Faisabilite** : moyenne. mediasoup (SFU WebRTC), CRDT (Yjs) pour la scene 3D.
- **Brevetabilite** : moyenne.
- **Complexite** : moyenne.

#### F22. Mode formation evaluee (quiz + VR + certification)

- **Interet clinique** : formation continue, validation des competences, reduction des erreurs.
- **Valeur ajoutee** : cas reels anonymises, quiz, examens, evaluation automatisee, certifications electroniques, suivi cohorte.
- **Faisabilite** : moyenne.
- **Brevetabilite** : faible.
- **Complexite** : moyenne.

#### F23. Base mondiale de cas anonymises (opt-in)

- **Interet clinique** : recherche, formation, statistiques, comparaison.
- **Valeur ajoutee** : anonymisation irreversible (k-anonymat >= 5), opt-in patient, requete gouvernance, Open Data agrege.
- **Faisabilite** : moyenne. Pipeline d'anonymisation, comite scientifique, conformite multi-juridictions.
- **Brevetabilite** : faible.
- **Complexite** : moyenne.

### 8.5 Innovations securite, conformite, performance

#### F24. Authentification FIDO2 / Passkey + CPro (CPS / e-CPS)

- **Interet clinique** : securite, tracabilite des actes, conformite CNIL/ANS.
- **Valeur ajoutee** : mot de passe + cle physique (YubiKey, smartphone), pas de phishing, signature electronique des CR.
- **Faisabilite** : moyenne. WebAuthn cote front, integration simple sur l'auth-service Rust.
- **Brevetabilite** : faible.
- **Complexite** : moyenne.

#### F25. Audit trail WORM + chain hash + signature cryptographique

- **Interet clinique** : preuve medico-legale, conformite MDR / HIPAA.
- **Valeur ajoutee** : chaque ligne d'audit contient hash de la precedente, signe par le DPO, stockage WORM (S3 Object Lock), export probatoire.
- **Faisabilite** : moyenne. Extension de la table `audit_log`, integrateur de hash, integration S3 Object Lock.
- **Brevetabilite** : moyenne.
- **Complexite** : moyenne.

### 8.6 Innovations UX et performance

#### F26. Mode bloc operatoire haute lisibilite (high-contrast, night-vision)

- **Interet clinique** : confort visuel, reduction de la fatigue, pas de perte de vision nocturne.
- **Valeur ajoutee** : theme `high-contrast` (noir/blanc/jaune), theme `night-vision` (rouge sombre), agrandissement typographique, mode anti-reflet.
- **Faisabilite** : moyenne.
- **Brevetabilite** : faible.
- **Complexite** : faible.

#### F27. Performance 60 fps + 1M sommets + WebGPU compute

- **Interet clinique** : fluidite, confort, productivite.
- **Valeur ajoutee** : decimation intelligente, LOD adaptatif, occlusion culling, WebGPU compute pour perfusion, streaming progressif.
- **Faisabilite** : moyenne. WebGPU, decimation QEM, Draco compression, streaming HTTP/2.
- **Brevetabilite** : faible.
- **Complexite** : moyenne.

#### F28. Mode offline-first complet (file d'attente offline)

- **Interet clinique** : continuite de service (panne reseau, salle isolee, transport helicoptere).
- **Valeur ajoutee** : Service Worker + IndexedDB + file d'attente (outbox) qui se synchronise au retour reseau. Pas d'ecran bloque.
- **Faisabilite** : moyenne. Le mode hors-ligne certifie (OFFLINE_KNOWLEDGE) est deja en place, etendable.
- **Brevetabilite** : faible.
- **Complexite** : moyenne.

### 8.7 Innovations recherche et avancees

#### F29. Federated learning multi-centre (entrainement sans partager les donnees)

- **Interet clinique** : modeles plus performants grace a plus de donnees, conformite RGPD.
- **Valeur ajoutee** : chaque entraine localement, envoie uniquement les gradients agreges, modele global mis a jour. Federated averaging (FedAvg), differential privacy.
- **Faisabilite** : moyenne-haute. PySyft / Flower, infrastructure securisee, validation.
- **Brevetabilite** : haute (methode d'entrainement federer pour IA medicale).
- **Complexite** : elevee.

#### F30. GenAI multimodale pour rapport operatoire structure

- **Interet clinique** : gain de temps, standardisation, exhaustivite.
- **Valeur ajoutee** : a partir de la timeline perop, des annotations vocales, des images, l'IA genere un CR structure (CCAM, complications, suivi).
- **Faisabilite** : moyenne. Whisper (STT), LLM multimodal (Gemini 1.5, GPT-4V), templates CCAM/HAS.
- **Brevetabilite** : moyenne.
- **Complexite** : moyenne.

### 8.8 Synthese complexite / brevetabilite

| Fonctionnalite | Complexite | Brevet potentiel |
|---|---|---|
| F1. Plan IA decisionnel | Elevee | Moyen |
| F2. Risque predictif calibre | Moyenne | Moyen |
| F3. Jumeau hyper-elastic + perfusion | Elevee | Haut |
| F4. Coupe chirurgicale interactive | Moyenne | Moyen |
| F5. Navigation GPS < 100 ms | Elevee | Haut |
| F6. AR chirurgicale | Moyenne | Moyen |
| F7. Simulateur VR evalue | Moyenne | Moyen |
| F8. Variantes anatomiques auto | Moyenne | Moyen |
| F9. Planification embolisation | Moyenne | Moyen |
| F10. Planification anastomose | Moyenne | Haut |
| F11. IA conversationnelle multimodale | Moyenne | Faible |
| F12. Function-calling 60+ | Moyenne | Faible |
| F13. RAG dossier patient | Moyenne | Moyen |
| F14. Agents specialises | Moyenne | Moyen |
| F15. Alertes predictives perop | Elevee | Haut |
| F16. Solveur planning CP-SAT | Moyenne | Faible |
| F17. Check-list OMS + RFID | Moyenne | Faible |
| F18. UDI implant | Moyenne | Faible |
| F19. Nettoyage automatise preuve | Faible | Faible |
| F20. Mode urgence FastTrack | Moyenne | Moyen |
| F21. Collab multi-chirurgiens | Moyenne | Moyen |
| F22. Formation evaluee | Moyenne | Faible |
| F23. Base mondiale | Moyenne | Faible |
| F24. FIDO2 + CPro | Moyenne | Faible |
| F25. Audit WORM + chain hash | Moyenne | Moyen |
| F26. Mode haute lisibilite | Faible | Faible |
| F27. Performance 60 fps + WebGPU | Moyenne | Faible |
| F28. Offline-first complet | Moyenne | Faible |
| F29. Federated learning | Elevee | Haut |
| F30. CR structure GenAI | Moyenne | Moyen |

> **Note sur la brevetabilite** : ce document n'affirme aucun brevet. Les elements identifies comme "haut" potentiel sont ceux ou la methode technique specifique (combinaison d'algorithmes + domaine medical) presente un caractere inventif plausible. Une recherche d'anteriorite (brevets + publications) est indispensable avant tout depot, et doit etre menee par un conseil en propriete intellectuelle specialise.

---

## 9. Conclusion

`GeneralSurgPlan3D_MIMO_enrichi` dispose deja d'un socle technique de qualite production (FastAPI securise, PACS multi-protocoles, IA multi-fournisseurs, segmentation reelle, jumeau numerique, mode bloc). La transformation en **plateforme mondiale de planification chirurgicale** telle que definie dans ce cahier des charges necessite :

1. **Une equipe pluridisciplinaire** : 5-8 ingenieurs back, 4-6 ingenieurs front/3D, 2-3 data scientists, 1-2 specialistes IA generative, 1 specialiste regulatory, 1 specialiste cybersecurite, 1 designer UX medical, 1 chef de produit medical, et un comite scientifique (chirurgiens experts, radiologues, anesthesistes, ergonomes).
2. **Un investissement soutenable** : ~5-8 M EUR sur 24 mois (RH + infra + GPU + formation + certification).
3. **Des partenariats strategiques** : avec des CHU (validation clinique), des editeurs PACS (interoperabilite), des fabricants de lunettes AR / casques VR / robots (integration), un organisme notifie MDR (marquage CE), un cabinet PI (brevets).
4. **Une gouvernance claire** : comite medical, comite IA, comite ethique, comite securite, comite qualite, DPO.

**Le resultat attendu** est une plateforme utilisee quotidiennement dans plus de 200 centres (universitaires, cancerologie, traumatologie, cliniques privees) d'ici 5 ans, avec une base de 50 000+ cas anonymises alimentant la recherche, un portfolio de brevets solides, et un standard de fait pour la chirurgie augmentee.

---
