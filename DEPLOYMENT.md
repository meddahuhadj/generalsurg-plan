# Déploiement — OphtalmoSurg Plan

Guide pour déployer la stack complète (reverse proxy HTTPS + backend + PostgreSQL + PACS Orthanc) sur un serveur que vous contrôlez (VPS, serveur hospitalier on-prem...).

⚠️ **Rappel** : ce logiciel est un prototype de démonstration, non certifié CE MDR / FDA. Ne pas utiliser pour de vraies décisions cliniques.

---

## Option A — Render.com (démo gratuite, 5 minutes)

Le moyen le plus rapide pour une démo publique sans infrastructure. Utilise `render.yaml` + `Dockerfile.render` (stack allégée : SQLite, 1 worker, pas de PACS/Orthanc/GPU).

### Étape 1 — Créer le service

1. Aller sur [render.com](https://render.com) → **New → Blueprint**
2. Connecter votre dépôt GitHub
3. Render détecte `render.yaml` automatiquement → cliquer **Apply**
4. Attendre la fin du premier build (~5 min)
5. L'app est disponible sur `https://ophtalmosurg-plan.onrender.com`

> ⚠️ Sur le plan gratuit, le service s'endort après 15 min d'inactivité et met ~30s à répondre au premier accès (cold start). Normal pour une démo.

### Étape 2 — CI/CD automatique (GitHub Actions)

À chaque `git push main`, le pipeline `.github/workflows/deploy.yml` :
1. Lance `pytest` — si les tests échouent, **le déploiement est bloqué**
2. Appelle le Render Deploy Hook pour redéployer automatiquement

**Configuration du Deploy Hook :**

1. Sur Render → votre service → **Settings → Deploy Hook** → copier l'URL
2. Sur GitHub → repo → **Settings → Secrets and variables → Actions** → **New secret** :
   - Nom : `RENDER_DEPLOY_HOOK_URL`
   - Valeur : l'URL copiée à l'étape 1

Ensuite, chaque `git push main` déclenche tests + déploiement automatiquement.

---

## Option C — Vercel (frontend statique + API légère serverless, gratuit)

Sépare le frontend (statique, servi par le CDN Vercel) d'une API serverless
réduite (`api/index.py`) qui ne couvre QUE l'authentification, les patients,
le chat IA et l'audit. **DICOM, volumétrie, segmentation, PACS/DICOMweb et
HL7 restent indisponibles sur ce déploiement** — ces flux ont besoin de
sockets TCP persistants (DIMSE, MLLP) et de traitement lourd (TotalSegmentator/
torch) incompatibles avec le serverless. Pour ces fonctionnalités, gardez
Option A (Render) ou B (VPS Docker) comme backend, et utilisez Vercel
uniquement pour le frontend (sans déployer `api/`).

### Étape 1 — Base de données (obligatoire)

Le filesystem des fonctions Vercel n'est pas persistant : SQLite (le défaut
en dev) perdrait toutes ses données à chaque invocation. Créez une base
Postgres gratuite, par exemple sur [neon.tech](https://neon.tech) (free tier
serverless), et récupérez son `DATABASE_URL`
(`postgresql+psycopg2://user:password@host/dbname?sslmode=require`).

### Étape 2 — Importer le projet sur Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → importer ce
   dépôt GitHub.
2. Framework Preset : **Other** (aucun build nécessaire pour le frontend
   statique ; `vercel.json` + `api/index.py` gèrent le reste automatiquement).
3. **Environment Variables** :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | URL Postgres de l'étape 1 |
| `JWT_SECRET` | générez avec `openssl rand -hex 32` |
| `APP_ENV` | `development` (ou `production` si vous retirez `SEED_DEMO_USERS` et durcissez le reste) |
| `SEED_DEMO_USERS` | `true` pour garder dr.hadj/dr.benali en démo, sinon `false` |
| `ALLOWED_ORIGINS` | `https://<votre-projet>.vercel.app` (l'URL que Vercel attribue) |
| `GEMINI_KEY` / `GROQ_KEY` | optionnel, pour que `/chat` fonctionne côté backend plutôt qu'en clé directe navigateur |

4. **Deploy**. Vercel construit `api/index.py` comme fonction Python
   (dépendances : `api/requirements.txt`, volontairement réduites — pas de
   `nibabel`/`trimesh`/`pydicom`/`pynetdicom`) et sert `index.html` + `assets/`
   + `i18n/` en statique depuis la racine du dépôt.

### Étape 3 — Connecter le frontend à cette API

Dans l'app (⚙ Paramètres), renseignez **URL du backend** (`apiBase`) avec
l'URL Vercel elle-même, ex. `https://votre-projet.vercel.app` (le frontend et
l'API partagent le même domaine ici, donc pas de souci CORS). Rechargez : la
connexion/patients/chat passent par `api/index.py` ; toute action DICOM/
volumétrie renverra une 404 (routers non montés) — attendu sur ce
déploiement.

### Limites connues

- Pas de DICOM, segmentation, PACS DICOMweb, export FHIR/HL7.
- `/ws/chat-stream` (chat en streaming) ne fonctionne pas en serverless — le
  frontend retombe automatiquement sur `/chat` (REST) sans action requise.
- Cold start Python à chaque invocation après inactivité (comparable au plan
  gratuit Render).
- Migrations Alembic à appliquer manuellement sur la base Neon (`alembic
  upgrade head` depuis votre poste, avec `DATABASE_URL` pointé dessus) — pas
  d'étape CI/CD automatisée fournie pour cette option.

---

## Option B — Stack complète VPS / on-prem (Docker Compose)

Guide pour déployer la stack complète (reverse proxy HTTPS + backend + PostgreSQL + PACS Orthanc) sur un serveur que vous contrôlez (VPS, serveur hospitalier on-prem...).

### Prérequis

- Un serveur Linux avec [Docker](https://docs.docker.com/engine/install/) et le plugin Docker Compose (`docker compose version` doit répondre).
- Un nom de domaine dont l'enregistrement DNS (A/AAAA) pointe déjà vers l'IP publique de ce serveur — Caddy en a besoin pour obtenir automatiquement un certificat TLS Let's Encrypt.
- Ports ouverts sur le pare-feu du serveur : **80** et **443** (HTTPS, via Caddy), et **4242** (protocole DICOM C-STORE vers Orthanc, si vous connectez un vrai PACS/modalité). Rien d'autre ne doit être exposé publiquement — PostgreSQL, le backend et l'interface HTTP d'Orthanc restent internes au réseau Docker.

## 1. Cloner le dépôt et configurer les secrets

```bash
git clone <url-de-votre-remote> ophtalmosurg-plan
cd ophtalmosurg-plan
cp .env.example .env
```

Éditez `.env` et renseignez de vraies valeurs (voir les commentaires dans le fichier) :

| Variable | Description |
|---|---|
| `DOMAIN` | Le nom de domaine qui pointe vers ce serveur, ex. `ophtalmosurg.mondomaine.fr` |
| `ACME_EMAIL` | Email de contact Let's Encrypt (alertes d'expiration de certificat) |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL — générez-en un avec `openssl rand -hex 24` |
| `JWT_SECRET` | Secret de signature des jetons — générez-en un avec `openssl rand -hex 32` |
| `BOOTSTRAP_ADMIN_USERNAME` | Identifiant du premier compte admin réel (pas un compte de démo) |
| `BOOTSTRAP_ADMIN_PASSWORD` | Mot de passe de ce compte — générez-en un avec `openssl rand -hex 16` |

**N'utilisez jamais les valeurs d'exemple en production.** Sans ces 6 variables définies, `docker compose up` refuse de démarrer (garde-fous explicites dans `docker-compose.yml` et dans `backend/main.py`).

⚠️ **Fixez toujours `BOOTSTRAP_ADMIN_USERNAME`/`BOOTSTRAP_ADMIN_PASSWORD` dès le tout premier déploiement.** `docker-compose.yml` fixe `SEED_DEMO_USERS=false` et `ALLOW_SELF_REGISTRATION=false` en dur (pas de comptes de démo, pas d'auto-inscription) — sans ce compte de bootstrap, une base vide ne laisse plus personne se connecter, y compris vous-même. Une fois ce premier compte créé (au premier démarrage, base non vide), provisionnez les comptes suivants via `POST /users` (réservé au rôle admin, voir `backend/routers/users.py`) plutôt que de recréer un bootstrap — vous pouvez alors vider ces 2 valeurs dans `.env` par hygiène.

## 2. Lancer la stack

```bash
docker compose up -d --build
```

Ceci construit l'image backend (FastAPI + pipeline de segmentation TotalSegmentator) et démarre 4 services : `caddy`, `backend`, `postgres`, `orthanc`. Le premier build peut prendre plusieurs minutes (dépendances lourdes : TotalSegmentator, torch CPU).

Suivez les logs :

```bash
docker compose logs -f backend
docker compose logs -f caddy   # vérifie l'obtention du certificat TLS
```

## 3. Vérifier le déploiement

```bash
curl https://votredomaine/health   # liveness — doit répondre {"status":"ok",...}
curl https://votredomaine/readyz   # readiness — doit répondre {"status":"ready",...}
```

Ouvrez `https://votredomaine/` dans un navigateur : l'app doit se charger, et un bandeau d'installation (« Installer l'application ») peut apparaître 4 secondes après le chargement — c'est la PWA (voir `manifest.webmanifest` / `sw.js`) qui se déclare installable une fois servie en HTTPS.

## 4. Schéma de base de données

Au premier démarrage, `backend/main.py` crée automatiquement les tables manquantes (filet de sécurité `init_db()`, voir `backend/migrations/README.md`). Pour un suivi rigoureux des évolutions de schéma en production, appliquez plutôt les migrations Alembic versionnées :

```bash
docker compose exec backend alembic -c backend/migrations/alembic.ini upgrade head
```

## 5. Sauvegardes

La donnée qui compte vraiment vit dans deux volumes Docker :

```bash
# Sauvegarde de la base PostgreSQL
docker compose exec postgres pg_dump -U surguser ophtalmosurg_db | gzip > backup-$(date +%Y%m%d).sql.gz

# Sauvegarde des fichiers DICOM/maillages (volume surg_storage)
docker run --rm -v ophtalmosurg-plan_surg_storage:/data -v "$PWD":/backup alpine \
  tar czf /backup/surg_storage-$(date +%Y%m%d).tar.gz /data
```

Automatisez ces deux commandes via une tâche cron régulière, et copiez les archives hors du serveur.

## 6. Mettre à jour l'application

```bash
git pull
docker compose up -d --build
```

Les conteneurs `postgres` et `orthanc` ne sont pas reconstruits (seule l'image `backend` change) ; leurs volumes persistent.

## 7. Limites connues de ce déploiement

- **Pas de GPU** par défaut : l'image installe volontairement un `torch` CPU-only (`--build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu`, déjà la valeur par défaut du Dockerfile) — les wheels PyPI standard de torch embarquent sinon ~1,5 Go de paquets CUDA inutiles sans passage GPU configuré. La segmentation TotalSegmentator tourne donc sur CPU (quelques minutes par série au lieu de ~10s). Pour un vrai déploiement GPU : reconstruire avec `docker compose build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu121 backend` (adapter l'index CUDA à votre matériel) ET ajouter le runtime NVIDIA Container Toolkit + une section `deploy.resources.reservations.devices` dans `docker-compose.yml` — non inclus ici.
- **Un seul serveur** : cette stack ne couvre pas la haute disponibilité (pas de réplication PostgreSQL, pas de load balancing multi-serveur). `backend` tourne avec 4 workers Uvicorn sur une seule machine.
- **DICOM DIMSE classique** : Orthanc expose le port 4242 pour le C-STORE standard ; si votre PACS hospitalier a besoin de C-FIND/C-MOVE plus poussés, consultez la documentation Orthanc pour la configuration réseau associée.

## 8. Mise à jour du Service Worker PWA

À chaque déploiement, mettez à jour la constante `CACHE_VERSION` dans `sw.js` (ligne ~29) :

```js
// Format : generalsurg-shell-v2-YYYYMMDD
const CACHE_VERSION = 'generalsurg-shell-v2-20260801';
```

Cette clé force la purge du cache chez tous les utilisateurs et déclenche le toast « Mise à jour disponible — Actualiser ? » dans l'interface. Sans cette mise à jour, les utilisateurs continuent de voir l'ancienne version depuis leur cache local.

**Automatisation en CI/CD :** dans `.github/workflows/deploy.yml`, remplacez la clé statique par :

```yaml
- name: Mettre à jour la version du cache SW
  run: |
    $ts = Get-Date -Format "yyyyMMddHHmmss"
    (Get-Content sw.js) -replace 'generalsurg-shell-v2-\d+', "generalsurg-shell-v2-$ts" |
      Set-Content sw.js
```

Voir aussi [ADMIN_MANUAL_PACS_HL7.md](ADMIN_MANUAL_PACS_HL7.md) pour la configuration PACS/HL7, et [README.md](README.md) pour le mode développement local (sans Docker).


## Prérequis

- Un serveur Linux avec [Docker](https://docs.docker.com/engine/install/) et le plugin Docker Compose (`docker compose version` doit répondre).
- Un nom de domaine dont l'enregistrement DNS (A/AAAA) pointe déjà vers l'IP publique de ce serveur — Caddy en a besoin pour obtenir automatiquement un certificat TLS Let's Encrypt.
- Ports ouverts sur le pare-feu du serveur : **80** et **443** (HTTPS, via Caddy), et **4242** (protocole DICOM C-STORE vers Orthanc, si vous connectez un vrai PACS/modalité). Rien d'autre ne doit être exposé publiquement — PostgreSQL, le backend et l'interface HTTP d'Orthanc restent internes au réseau Docker.

## 1. Cloner le dépôt et configurer les secrets

```bash
git clone <url-de-votre-remote> ophtalmosurg-plan
cd ophtalmosurg-plan
cp .env.example .env
```

Éditez `.env` et renseignez de vraies valeurs (voir les commentaires dans le fichier) :

| Variable | Description |
|---|---|
| `DOMAIN` | Le nom de domaine qui pointe vers ce serveur, ex. `ophtalmosurg.mondomaine.fr` |
| `ACME_EMAIL` | Email de contact Let's Encrypt (alertes d'expiration de certificat) |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL — générez-en un avec `openssl rand -hex 24` |
| `JWT_SECRET` | Secret de signature des jetons — générez-en un avec `openssl rand -hex 32` |
| `BOOTSTRAP_ADMIN_USERNAME` | Identifiant du premier compte admin réel (pas un compte de démo) |
| `BOOTSTRAP_ADMIN_PASSWORD` | Mot de passe de ce compte — générez-en un avec `openssl rand -hex 16` |

**N'utilisez jamais les valeurs d'exemple en production.** Sans ces 6 variables définies, `docker compose up` refuse de démarrer (garde-fous explicites dans `docker-compose.yml` et dans `backend/main.py`).

⚠️ **Fixez toujours `BOOTSTRAP_ADMIN_USERNAME`/`BOOTSTRAP_ADMIN_PASSWORD` dès le tout premier déploiement.** `docker-compose.yml` fixe `SEED_DEMO_USERS=false` et `ALLOW_SELF_REGISTRATION=false` en dur (pas de comptes de démo, pas d'auto-inscription) — sans ce compte de bootstrap, une base vide ne laisse plus personne se connecter, y compris vous-même. Une fois ce premier compte créé (au premier démarrage, base non vide), provisionnez les comptes suivants via `POST /users` (réservé au rôle admin, voir `backend/routers/users.py`) plutôt que de recréer un bootstrap — vous pouvez alors vider ces 2 valeurs dans `.env` par hygiène.

## 2. Lancer la stack

```bash
docker compose up -d --build
```

Ceci construit l'image backend (FastAPI + pipeline de segmentation TotalSegmentator) et démarre 4 services : `caddy`, `backend`, `postgres`, `orthanc`. Le premier build peut prendre plusieurs minutes (dépendances lourdes : TotalSegmentator, torch CPU).

Suivez les logs :

```bash
docker compose logs -f backend
docker compose logs -f caddy   # vérifie l'obtention du certificat TLS
```

## 3. Vérifier le déploiement

```bash
curl https://votredomaine/health   # liveness — doit répondre {"status":"ok",...}
curl https://votredomaine/readyz   # readiness — doit répondre {"status":"ready",...}
```

Ouvrez `https://votredomaine/` dans un navigateur : l'app doit se charger, et un bandeau d'installation ("Installer l'application") peut apparaître — c'est la PWA (voir `manifest.webmanifest` / `sw.js`) qui se déclare installable une fois servie en HTTPS.

## 4. Schéma de base de données

Au premier démarrage, `backend/main.py` crée automatiquement les tables manquantes (filet de sécurité `init_db()`, voir `backend/migrations/README.md`). Pour un suivi rigoureux des évolutions de schéma en production, appliquez plutôt les migrations Alembic versionnées :

```bash
docker compose exec backend alembic -c backend/migrations/alembic.ini upgrade head
```

## 5. Sauvegardes

La donnée qui compte vraiment vit dans deux volumes Docker :

```bash
# Sauvegarde de la base PostgreSQL
docker compose exec postgres pg_dump -U surguser ophtalmosurg_db | gzip > backup-$(date +%Y%m%d).sql.gz

# Sauvegarde des fichiers DICOM/maillages (volume surg_storage)
docker run --rm -v ophtalmosurg-plan_surg_storage:/data -v "$PWD":/backup alpine \
  tar czf /backup/surg_storage-$(date +%Y%m%d).tar.gz /data
```

Automatisez ces deux commandes via une tâche cron régulière, et copiez les archives hors du serveur.

## 6. Mettre à jour l'application

```bash
git pull
docker compose up -d --build
```

Les conteneurs `postgres` et `orthanc` ne sont pas reconstruits (seule l'image `backend` change) ; leurs volumes persistent.

## 7. Limites connues de ce déploiement

- **Pas de GPU** par défaut : l'image installe volontairement un `torch` CPU-only (`--build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu`, déjà la valeur par défaut du Dockerfile) — les wheels PyPI standard de torch embarquent sinon ~1,5 Go de paquets CUDA inutiles sans passage GPU configuré. La segmentation TotalSegmentator tourne donc sur CPU (quelques minutes par série au lieu de ~10s). Pour un vrai déploiement GPU : reconstruire avec `docker compose build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu121 backend` (adapter l'index CUDA à votre matériel) ET ajouter le runtime NVIDIA Container Toolkit + une section `deploy.resources.reservations.devices` dans `docker-compose.yml` — non inclus ici.
- **Un seul serveur** : cette stack ne couvre pas la haute disponibilité (pas de réplication PostgreSQL, pas de load balancing multi-serveur). `backend` tourne avec 4 workers Uvicorn sur une seule machine.
- **DICOM DIMSE classique** : Orthanc expose le port 4242 pour le C-STORE standard ; si votre PACS hospitalier a besoin de C-FIND/C-MOVE plus poussés, consultez la documentation Orthanc pour la configuration réseau associée.

Voir aussi [ADMIN_MANUAL_PACS_HL7.md](ADMIN_MANUAL_PACS_HL7.md) pour la configuration PACS/HL7, et [README.md](README.md) pour le mode développement local (sans Docker).
