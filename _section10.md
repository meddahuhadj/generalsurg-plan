

## 10. API complètes (REST, WebSocket, gRPC)

### 10.1 Conventions transverses

#### 10.1.1 Versionnement

- Préfixe obligatoire : `/v1/`, `/v2/`.
- Aucune suppression ou modification de contrat dans la même version majeure.
- Annonce de dépréciation 6 mois avant, header `Sunset:` et `Deprecation:` (RFC 8594).

#### 10.1.2 Authentification

- Header `Authorization: Bearer <jwt>` pour REST.
- Sous-protocole `bearer` pour WebSocket.
- Certificat client mTLS (optionnel) pour les communications service-à-service sensibles.
- `X-Request-Id: <uuid>` recommandé pour la traçabilité (généré si absent).
- `Idempotency-Key: <uuid>` (RFC 1) pour POST/PUT/DELETE non-idempotents.

#### 10.1.3 Codes d'erreur (RFC 7807 — Problem Details for HTTP APIs)

```json
{
  "type": "https://errors.ophtalmosurg.eu/validation-error",
  "title": "Validation failed",
  "status": 422,
  "detail": "margin_cm must be between 0 and 5",
  "instance": "/v1/twin/P-0001/snapshot",
  "errors": [
    {"field": "margin_cm", "code": "out_of_range", "message": "must be between 0 and 5"}
  ],
  "trace_id": "0af7651916cd43dd8448eb211c80319c",
  "support_id": "ERR-2026-07-06-ABCD12"
}
```

Codes utilisés :
- `400` requête malformée
- `401` authentification requise
- `403` authentification valide mais autorisation refusée
- `404` ressource introuvable
- `409` conflit (version, contrainte unique)
- `410` Gone (ressource supprimée)
- `412` precondition failed (If-Match)
- `422` validation sémantique
- `429` rate-limit
- `500` erreur interne
- `502/503/504` dépendances indisponibles
- `507` stockage plein

#### 10.1.4 Pagination

- **Curseur opaque** : `?cursor=eyJpZCI6IjEyMyJ9&limit=50`.
- Réponse : `{ "items": [...], "next_cursor": "...", "has_more": true }`.
- Cap : `limit <= 200`.

#### 10.1.5 Format date/temps

- ISO 8601 en UTC : `2026-07-06T14:23:11.123Z`.
- Fuseau explicite dans les payloads : `+02:00` accepté en entrée, normalisé en sortie.

#### 10.1.6 Rate limiting

- Headers standards `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`.
- Politique par défaut : 100 req/s par utilisateur, 1000 req/s par IP, 10 000 req/s par tenant.
- Routes IA : 5 req/s par utilisateur (coût GPU), burst 20.
- Routes DICOM pixel (WADO) : 50 req/s par utilisateur.

### 10.2 Auth Service

```
POST   /v1/auth/login                          # username + password, returns 2FA challenge or full token
POST   /v1/auth/login/2fa                      # 2FA code + pre_auth_token, returns full token
POST   /v1/auth/refresh                        # refresh token rotation
POST   /v1/auth/logout                         # revoke current token
POST   /v1/auth/passkey/register/begin         # WebAuthn ceremony
POST   /v1/auth/passkey/register/finish
POST   /v1/auth/passkey/login/begin
POST   /v1/auth/passkey/login/finish
POST   /v1/auth/oidc/{provider}/login          # SSO OIDC initiation
GET    /v1/auth/oidc/{provider}/callback       # SSO callback
POST   /v1/auth/saml/{idp}/login               # SAML AuthnRequest
POST   /v1/auth/saml/{idp}/acs                 # SAML assertion consumer
GET    /v1/auth/me                             # current user
GET    /v1/auth/sessions                       # list active sessions
DELETE /v1/auth/sessions/{id}                  # revoke session
POST   /v1/auth/break-glass                    # emergency access with justification, audit renforcé
GET    /v1/auth/audit/self                     # my audit trail
```

### 10.3 Patient Service

```
GET    /v1/patients?cursor=&limit=&specialty=&search=&sort=
POST   /v1/patients
GET    /v1/patients/{id}
PUT    /v1/patients/{id}
DELETE /v1/patients/{id}
GET    /v1/patients/{id}/timeline
GET    /v1/patients/{id}/consent
PUT    /v1/patients/{id}/consent
GET    /v1/patients/{id}/history               # all versions of patient
GET    /v1/patients/{id}/export                # FHIR $everything
POST   /v1/patients/{id}/merge                 # merge two patient records
POST   /v1/patients/{id}/lock                  # administrative lock
GET    /v1/patients/{id}/segments
POST   /v1/patients/{id}/segments
DELETE /v1/patients/{id}/segments/{segment_id}
```

### 10.4 DICOM Ingest & PACS Federation

```
POST   /v1/dicom/stow                          # STOW-RS push
GET    /v1/dicom/qido/studies?PatientID=&PatientName=&StudyDate=&...
GET    /v1/dicom/qido/studies/{study_uid}/series
GET    /v1/dicom/qido/studies/{study_uid}/series/{series_uid}/instances
GET    /v1/dicom/wado/studies/{study_uid}      # multipart/related
GET    /v1/dicom/wado/studies/{study_uid}/series/{series_uid}
GET    /v1/dicom/wado/studies/{study_uid}/series/{series_uid}/instances/{instance_uid}
POST   /v1/dicom/ups                           # UPS-RS create workitem
GET    /v1/dicom/ups/{uid}
PUT    /v1/dicom/ups/{uid}/state               # UPS-RS state change
POST   /v1/dicom/ups/{uid}/progress            # UPS-RS progress event
GET    /v1/dicom/mpps/{uid}                    # MPPS retrieve
POST   /v1/dicom/mpps                          # create MPPS
PUT    /v1/dicom/mpps/{uid}                    # update MPPS
GET    /v1/dicom/dimse/echo                    # C-ECHO connectivity check
POST   /v1/dicom/dimse/find                    # C-FIND wrapper
POST   /v1/dicom/dimse/get                     # C-GET wrapper
POST   /v1/dicom/dimse/move                    # C-MOVE wrapper
POST   /v1/dicom/anonymize/{series_id}         # anonymize a series
GET    /v1/dicom/storage/quota                 # storage usage
POST   /v1/dicom/storage/cleanup               # GC old data
```

### 10.5 Twin Service

```
GET    /v1/twin/{patient_id}                   # current twin snapshot
POST   /v1/twin/{patient_id}/build             # start a build job
GET    /v1/twin/{patient_id}/status            # build status
POST   /v1/twin/{patient_id}/snapshot          # create scenario snapshot
GET    /v1/twin/{patient_id}/snapshots
GET    /v1/twin/{patient_id}/snapshots/{sid}
GET    /v1/twin/{patient_id}/diff?a={sid1}&b={sid2}
GET    /v1/twin/{patient_id}/biomech
PUT    /v1/twin/{patient_id}/biomech
GET    /v1/twin/{patient_id}/perfusion
GET    /v1/twin/{patient_id}/variants
GET    /v1/twin/{patient_id}/structures/{sid}
PUT    /v1/twin/{patient_id}/structures/{sid}  # manual override
POST   /v1/twin/{patient_id}/export            # GLTF / STL / OBJ export
GET    /v1/twin/{patient_id}/quality           # quality metrics
```

### 10.6 Simulation Service

```
GET    /v1/sim/scenarios?patient_id=
POST   /v1/sim/scenarios
GET    /v1/sim/scenarios/{sid}
PUT    /v1/sim/scenarios/{sid}
DELETE /v1/sim/scenarios/{sid}
POST   /v1/sim/scenarios/{sid}/actions         # cut, suture, coagulate, implant, ...
GET    /v1/sim/scenarios/{sid}/undo
GET    /v1/sim/scenarios/{sid}/redo
POST   /v1/sim/scenarios/{sid}/branch          # create branch (A/B)
POST   /v1/sim/scenarios/{sid}/merge           # merge two branches
GET    /v1/sim/scenarios/{sid}/metrics         # current volumes, margins, distances, risks
POST   /v1/sim/scenarios/{sid}/metrics/recompute
POST   /v1/sim/scenarios/{sid}/video           # render a video of the simulation
WS     /v1/sim/scenarios/{sid}/realtime        # bi-di WebSocket for interactive simulation
```

### 10.7 IA Decision Service

```
POST   /v1/ia/decision/plan                    # full plan
POST   /v1/ia/decision/approach                # which surgical approach
POST   /v1/ia/decision/margins                 # margin recommendation
POST   /v1/ia/decision/risks                   # risk estimation
POST   /v1/ia/decision/sequence                # ordered steps
POST   /v1/ia/decision/alternatives            # alternative strategies
POST   /v1/ia/decision/explain                 # explain a given decision
GET    /v1/ia/decision/{decision_id}           # retrieve a past decision
GET    /v1/ia/decision/{decision_id}/audit     # full audit of this decision
GET    /v1/ia/decision/models                  # list of model versions
POST   /v1/ia/decision/feedback                # user feedback (thumbs up/down + text)
```

### 10.8 IA Predictive Service

```
POST   /v1/ia/predict/mortality                # 30/90 day
POST   /v1/ia/predict/morbidity                # Clavien-Dindo ≥ III
POST   /v1/ia/predict/specific                 # specific event (fistula, conversion, ...)
POST   /v1/ia/predict/duration                 # surgical duration
POST   /v1/ia/predict/blood-loss
POST   /v1/ia/predict/transfusion
POST   /v1/ia/predict/los                      # length of stay
POST   /v1/ia/predict/readmission              # 30-day
POST   /v1/ia/predict/recurrence               # 1/3/5 year
POST   /v1/ia/predict/reintervention
POST   /v1/ia/predict/batch                    # batch predictions
GET    /v1/ia/predict/{prediction_id}/shap     # SHAP explanation
GET    /v1/ia/predict/models                   # models + versions + metrics
GET    /v1/ia/predict/models/{name}/drift      # drift report
```

### 10.9 IA Conversational Service

```
POST   /v1/ia/chat                             # text chat (REST)
WS     /v1/ia/chat/stream                      # text chat streaming
WS     /v1/ia/voice/live                       # bidirectional audio + video
POST   /v1/ia/voice/transcribe                 # single-shot transcription
POST   /v1/ia/voice/synthesize                 # TTS
GET    /v1/ia/conversations                    # list my conversations
GET    /v1/ia/conversations/{id}               # retrieve
DELETE /v1/ia/conversations/{id}               # right to erasure
POST   /v1/ia/tools/execute                    # direct tool execution (for tests)
GET    /v1/ia/tools                            # list available tools
```

### 10.10 OR Service

```
GET    /v1/or/rooms
POST   /v1/or/rooms
GET    /v1/or/rooms/{id}
PUT    /v1/or/rooms/{id}
GET    /v1/or/rooms/{id}/schedule?from=&to=
GET    /v1/or/surgeries?date=&surgeon=&room=&status=
POST   /v1/or/surgeries
GET    /v1/or/surgeries/{id}
PUT    /v1/or/surgeries/{id}
DELETE /v1/or/surgeries/{id}                   # soft cancel with reason
POST   /v1/or/surgeries/{id}/reschedule
POST   /v1/or/surgeries/{id}/timeline-event
GET    /v1/or/surgeries/{id}/timeline
GET    /v1/or/surgeries/{id}/checklist
PUT    /v1/or/surgeries/{id}/checklist/{item}
POST   /v1/or/surgeries/{id}/checklist/scan    # RFID/GS1 scan
GET    /v1/or/surgeries/{id}/consumables
POST   /v1/or/surgeries/{id}/consumables
GET    /v1/or/surgeries/{id}/implants
POST   /v1/or/surgeries/{id}/implants
GET    /v1/or/surgeries/{id}/staff
POST   /v1/or/surgeries/{id}/staff
GET    /v1/or/staff
POST   /v1/or/staff
GET    /v1/or/staff/{id}/competences
PUT    /v1/or/staff/{id}/competences
GET    /v1/or/staff/{id}/rest
GET    /v1/or/inventory
POST   /v1/or/inventory/replenish
GET    /v1/or/inventory/lots/{udi}
GET    /v1/or/cleaning-cycles
POST   /v1/or/cleaning-cycles
PUT    /v1/or/cleaning-cycles/{id}/complete
POST   /v1/or/optimize?from=&to=&strategy=    # run solver
GET    /v1/or/conflicts?from=&to=
POST   /v1/or/urgency/fasttrack                # create emergency surgery
```

### 10.11 Navigation Service

```
POST   /v1/nav/sessions                        # create session
GET    /v1/nav/sessions/{id}
DELETE /v1/nav/sessions/{id}                   # end session
GET    /v1/nav/sessions/{id}/state             # current pose + jitter + drift
POST   /v1/nav/sessions/{id}/recalibrate
POST   /v1/nav/sessions/{id}/fiducial          # add fiducial
POST   /v1/nav/sessions/{id}/target            # define a target
GET    /v1/nav/sessions/{id}/trajectory
GET    /v1/nav/sessions/{id}/replay?from=&to=
WS     /v1/nav/sessions/{id}/stream            # low-latency bi-di
GET    /v1/nav/sessions/{id}/audit
```

### 10.12 AR / VR Services

```
GET    /v1/ar/sessions                         # list active AR sessions
POST   /v1/ar/sessions
GET    /v1/ar/sessions/{id}
PUT    /v1/ar/sessions/{id}/overlay            # change overlay
POST   /v1/ar/sessions/{id}/calibrate          # spatial anchor
GET    /v1/ar/sessions/{id}/snapshot
POST   /v1/ar/sessions/{id}/measure            # measure distance in scene

GET    /v1/vr/scenarios?specialty=&difficulty=
GET    /v1/vr/scenarios/{id}
POST   /v1/vr/sessions
GET    /v1/vr/sessions/{id}
POST   /v1/vr/sessions/{id}/event
PUT    /v1/vr/sessions/{id}/finish
GET    /v1/vr/sessions/{id}/report
GET    /v1/vr/sessions/{id}/replay
WS     /v1/vr/sessions/{id}/live               # live event stream
```

### 10.13 Formation Service

```
GET    /v1/formation/programs
GET    /v1/formation/programs/{id}/curriculum
GET    /v1/formation/quizzes?specialty=&difficulty=
GET    /v1/formation/quizzes/{id}
POST   /v1/formation/quizzes/{id}/submit
GET    /v1/formation/exams?specialty=&status=
POST   /v1/formation/exams
GET    /v1/formation/exams/{id}
PUT    /v1/formation/exams/{id}/answer
POST   /v1/formation/exams/{id}/finish
GET    /v1/formation/exams/{id}/report
GET    /v1/formation/cohorts/{program_id}/stats
GET    /v1/formation/certifications/me
GET    /v1/formation/certifications/{user_id}
POST   /v1/formation/certifications/{id}/verify
```

### 10.14 Base Mondiale Service

```
GET    /v1/world/stats?specialty=&country=&year=     # Open Data
GET    /v1/world/cohorts                             # predefined cohorts
GET    /v1/world/cohorts/{id}
POST   /v1/world/cases/search                        # governance-gated
POST   /v1/world/cases/{id}/access-request
GET    /v1/world/access-requests                     # for committee
PUT    /v1/world/access-requests/{id}/decision
GET    /v1/world/publications
```

### 10.15 Analytics Service

```
GET    /v1/analytics/dashboards?audience=
GET    /v1/analytics/dashboards/{id}
POST   /v1/analytics/dashboards
PUT    /v1/analytics/dashboards/{id}
GET    /v1/analytics/widgets/{id}/data?from=&to=&filters=
GET    /v1/analytics/kpis/surgical?surgeon_id=&from=&to=
GET    /v1/analytics/kpis/room-occupancy?room_id=&from=&to=
GET    /v1/analytics/kpis/or-quality?from=&to=
GET    /v1/analytics/kpis/formation?program_id=
GET    /v1/analytics/exports/{type}?from=&to=        # PDF/Excel/CSV
POST   /v1/analytics/alerts/subscribe
GET    /v1/analytics/alerts/me
```

### 10.16 Collab Service

```
POST   /v1/collab/sessions
GET    /v1/collab/sessions/{id}
PUT    /v1/collab/sessions/{id}/state
POST   /v1/collab/sessions/{id}/invite
DELETE /v1/collab/sessions/{id}/invite/{token}
GET    /v1/collab/sessions/{id}/participants
POST   /v1/collab/sessions/{id}/kick/{user_id}
POST   /v1/collab/sessions/{id}/annotations
GET    /v1/collab/sessions/{id}/annotations
WS     /v1/collab/sessions/{id}/sync                 # CRDT sync
WS     /v1/collab/sessions/{id}/rtc                  # WebRTC signalling
WS     /v1/collab/sessions/{id}/chat                 # chat
GET    /v1/collab/sessions/{id}/replay
```

### 10.17 Document Service

```
POST   /v1/documents/reports                         # generate a report
GET    /v1/documents/reports/{id}
GET    /v1/documents/reports/{id}/pdf
GET    /v1/documents/reports/{id}/html
POST   /v1/documents/reports/{id}/sign               # electronic signature
POST   /v1/documents/reports/{id}/countersign
POST   /v1/documents/consent                         # generate consent form
GET    /v1/documents/templates?type=
POST   /v1/documents/templates
GET    /v1/documents/dicom-sr/{encounter_id}         # emit DICOM SR
GET    /v1/documents/dicom-seg/{series_id}           # emit DICOM SEG
```

### 10.18 Consent Service

```
GET    /v1/consent/{patient_id}
PUT    /v1/consent/{patient_id}
POST   /v1/consent/{patient_id}/grant                # grant a specific consent
POST   /v1/consent/{patient_id}/revoke
GET    /v1/consent/{patient_id}/history
POST   /v1/consent/{patient_id}/verify               # verify consent before action
```

### 10.19 Audit Service

```
GET    /v1/audit?patient_id=&user_id=&from=&to=&action=&level=&cursor=
GET    /v1/audit/{id}
GET    /v1/audit/integrity                           # chain hash verification
POST   /v1/audit/export/{from}/{to}                  # export WORM
GET    /v1/audit/{id}/verify                         # cryptographic proof
POST   /v1/audit/retention/policy                    # set retention policy
GET    /v1/audit/retention/policy
```

### 10.20 Notification Service

```
GET    /v1/notifications/me?cursor=
PUT    /v1/notifications/{id}/read
POST   /v1/notifications/push/register               # register push token
POST   /v1/notifications/sms/send                    # internal use
POST   /v1/notifications/email/send
POST   /v1/notifications/webhook/fire                # outgoing webhook
GET    /v1/notifications/preferences/me
PUT    /v1/notifications/preferences/me
```

### 10.21 Plugin Host

```
GET    /v1/plugins
GET    /v1/plugins/{name}
POST   /v1/plugins/install                           # signed package
DELETE /v1/plugins/{name}/uninstall
PUT    /v1/plugins/{name}/enable
PUT    /v1/plugins/{name}/disable
POST   /v1/plugins/{name}/invoke                     # execute plugin with args
GET    /v1/plugins/{name}/permissions
GET    /v1/plugins/abi/version
```

### 10.22 Mobile Companion endpoints (subset)

Les endpoints mobile utilisent la même gateway avec une authentification dédiée (appareil lié + push token + challenge).

```
GET    /v1/mobile/feed                               # personalized feed
GET    /v1/mobile/patients/recent
GET    /v1/mobile/patients/{id}/summary
POST   /v1/mobile/approvals/{request_id}             # approve action
GET    /v1/mobile/scan/parse                         # parse barcode/UDI from photo
POST   /v1/mobile/notifications/register
```

### 10.23 gRPC (services internes)

| Service | gRPC service | Méthodes principales |
|---|---|---|
| twin-service | `twin.TwinService` | `Build`, `Snapshot`, `Diff`, `Biomech`, `Perfusion`, `Stream` |
| simulation-service | `sim.SimulationService` | `StreamActions` (bi-di), `RecomputeMetrics` |
| navigation-service | `nav.NavigationService` | `Stream` (bi-di), `Recalibrate` |
| segmentation-service | `seg.SegmentationService` | `Start`, `Status`, `Result`, `Cancel` |
| mesh-pipeline | `mesh.MeshPipeline` | `Generate`, `Decimate`, `Repair` |
| or-service | `or.ORService` | `Optimize`, `CheckConflicts` |
| audit-service | `audit.AuditService` | `Write` (high throughput), `VerifyChain`, `Export` |
| search-service | `search.SearchService` | `Index`, `Query`, `Delete` |
| queue-service | `queue.QueueService` | `Enqueue`, `Subscribe`, `Ack` |

### 10.24 Exemples d'appels

#### 10.24.1 Créer un scénario et le simuler

```http
POST /v1/sim/scenarios
Authorization: Bearer <jwt>
Content-Type: application/json
Idempotency-Key: 6c0a8b5e-...

{
  "patient_id": "P-0001",
  "twin_id": "0af76519-16cd-43dd-8448-eb211c80319c",
  "name": "Bisegmentectomie VII-VIII",
  "description": "Hépatectomie droite laparoscopique"
}
```

```http
201 Created
Location: /v1/sim/scenarios/8a3f7c1e-...
```

```http
POST /v1/sim/scenarios/8a3f7c1e-.../actions
{
  "actions": [
    {"type": "cut", "target": "structure:portal_pedicle_right", "params": {"length_mm": 35}},
    {"type": "resect", "target": "structure:segments_VII_VIII", "params": {"margin_mm": 10}}
  ]
}
```

```http
200 OK
{
  "metrics": {
    "removed_ml": 287.3,
    "remnant_ml": 1162.7,
    "remnant_pct": 80.2,
    "flr_safe": true,
    "margins": {
      "to_vena_cava": 8.4,
      "to_portal_vein_right": 12.1,
      "to_hepatic_vein_right": 9.7
    },
    "perfusion": {
      "ischemic_territories_ml": 0,
      "congested_territories_ml": 12.4
    },
    "warnings": [
      "Marge VCI < 10mm, envisager clampage sélectif"
    ]
  },
  "snapshot_id": "sn_0af76519"
}
```

#### 10.24.2 Streamer une conversation IA

```
GET /v1/ia/chat/stream HTTP/1.1
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: ...
Sec-WebSocket-Protocol: bearer, <jwt>
```

```json
// Client → server
{"type": "start", "specialty": "hbp", "context": "patient_id=P-0001"}

// Server → client
{"type": "delta", "text": "Je vais analyser le dossier..."}
{"type": "delta", "text": " Le patient présente un CHC..."}
{"type": "tool_call", "name": "run_segmentation", "args": {"structure": "liver_segments"}}
{"type": "tool_result", "name": "run_segmentation", "result": {"volumes_ml": {...}}}
{"type": "delta", "text": " La segmentation confirme..."}
{"type": "done", "usage": {"input_tokens": 2104, "output_tokens": 532}}
```

---
