# Manuel Technique d'Administration Hospitalière & Ingénierie Biomédicale
## OphtalmoSurg Plan NextGen — Architecture & Interopérabilité (2026–2046)

**Version :** 2.4.0-Enterprise-MDR  
**Classification Réglementaire :** CE MDR 2017/745 Classe IIb / C & FDA 510(k) Equivalence  
**Cible :** Directeurs des Systèmes d'Information (DSI), Ingénieurs Biomédicaux & Administrateurs PACS hospitaliers.

---

## 1. Vue d'Ensemble de l'Infrastructure et Règlements de Sécurité
OphtalmoSurg Plan NextGen est conçu comme un micro-écosystème conteneurisé à haute disponibilité, déployable en centre de traumatologie ou en hôpital universitaire.

```
+-----------------------------------------------------------------------------------+
|                         RÉSEAU PRIVÉ HOSPITALIER (VLAN 172.28.0.0/16)             |
|                                                                                   |
|  [Moniteur Anesthésie] (Dräger/Mindray)                                            |
|       │                                                                           |
|       ├─ (IEEE 11073 / HL7 ORU_R01) ──┐                                           |
|       ▼                               ▼                                           |
|  +--------------------+      +--------------------+      +---------------------+  |
|  |   Orthanc PACS     |      |  Backend FastAPI   |      | PostgreSQL + vector |  |
|  |  (DICOMweb Server) |◄────►|  (Jumeaux 3D & IA) |◄────►|  (Audit SHA-256)    |  |
|  |   Port 4242/8042   |      |     Port 8000      |      |      Port 5432      |  |
|  +--------------------+      +--------------------+      +---------------------+  |
|                                       ▲                                           |
|                                       │ (WebGPU / HTTPS WSS TLS 1.3)              |
|                                       ▼                                           |
|                          [Navigateur Stérile au Bloc]                             |
+-----------------------------------------------------------------------------------+
```

### Exigences de Cybersécurité (HIPAA & RGPD Santé)
- **Chiffrement au Repos (Data at Rest) :** Tous les volumes de stockage (bases PostgreSQL et répertoires de maillages PACS) sont chiffrés en **AES-256-GCM**.
- **Chiffrement en Transit (Data in Transit) :** L'application n'accepte que les connexions **TLS 1.3** avec Perfect Forward Secrecy (PFS).
- **Inviolabilité Médico-Légale :** Chaque action (planification, dictée CCAM, clampage) est scellée par un hash **SHA-256** chaîné dans la table `audit_logs`. Toute altération manuelle en base rompt la chaîne et déclenche une alerte de sécurité.

---

## 2. Configuration PACS (DICOMweb & Orthanc)
Le serveur PACS intégré (Orthanc) communique de manière bidirectionnelle avec les modalités d'imagerie du centre (Scanner multibarrette, IRM 3 Tesla, Arceau 3D).

### Table des AE Titles et Ports
| Composant | AE Title | Adresse IP / Host | Port TCP | Protocole |
| :--- | :--- | :--- | :--- | :--- |
| **Orthanc PACS** | `GENERALSURG_PACS` | `orthanc` (ou IP serveur) | **4242** | DICOM C-STORE / C-FIND |
| **Passerelle WADO** | `GENERALSURG_WEB` | `localhost:8042` | **8042** | HTTP REST / DICOMweb (QIDO-RS / WADO-RS) |
| **Scanner Hospitalier** | `CT_TRAUMA_01` | *À définir par le biomédical* | 104 / 4006 | DICOM C-ECHO / C-STORE |

### Configuration d'importation automatique WADO-RS
Dans le fichier `orthanc.json` de l'hôpital, autorisez les requêtes du routeur PACS de OphtalmoSurg Plan :
```json
{
  "DicomWeb": {
    "Enable": true,
    "Root": "/dicom-web/",
    "EnableWadoRs": true,
    "EnableQidoRs": true
  },
  "RegisteredUsers": {
    "surgadmin": "SuperSecretSurgPwd2026"
  }
}
```

---

## 3. Connectivité HL7 v2.x & IEEE 11073 (Moniteurs d'Anesthésie)
Pour alimenter le module peropératoire **🏥 Bloc IA (SurgOR-AI)** et déclencher les alertes d'ischémie de clampage en temps réel :

1. **Protocole de Transport :** MLLP (Minimal Lower Layer Protocol) sur le port TCP `2575` ou flux REST FHIR Observation sur le port HTTPS `8000`.
2. **Types de Messages Reçus :** `ORU^R01` (Unsolicited Transmission of an Observation).
3. **Mapping des Codes LOINC vitales :**
   - Pression Artérielle Systolique/Diastolique : LOINC `8480-6` / `8462-4`
   - Fréquence Cardiaque : LOINC `8867-4`
   - Saturation SpO₂ : LOINC `2708-6`
   - Index Bispectral (BIS Anesthésie) : LOINC `80404-7`

---

## 4. Déploiement et Maintenance en Production (Docker / Kubernetes)

### Démarrage de la Stack Industrielle
Sur le serveur Linux GPU (NVIDIA RTX A6000 / L40S) du centre de calcul hospitalier :
```bash
# 1. Cloner le workspace clinique
cd /opt/ophtalmosurgplan

# 2. Lancer l'assemblage et le démarrage des conteneurs
docker compose -f docker-compose.yml up -d --build

# 3. Vérifier la santé du système et la conformité SHA-256
docker exec -it ophtalmosurg_app python backend/healthcheck_nextgen.py
```

### Procédure de Sauvegarde & Sauvetage Après Sinistre (Disaster Recovery)
Le chaînage cryptographique SHA-256 nécessite une sauvegarde cohérente et simultanée de la base de données et des maillages :
```bash
# Snapshot quotidien à chaud (sans interruption de service au bloc)
docker exec ophtalmosurg_db pg_dump -U surguser -d ophtalmosurg_db -F c -b -v -f /tmp/backup_db_$(date +%F).dump
tar -czf /mnt/nfs_hospital/backups/ophtalmosurg_backup_$(date +%F).tar.gz /tmp/backup_db_*.dump /tmp/storage/meshes_v2/
```

---

## 5. Support Technique et Maintenance Rétrocompatible (2026–2046)
Conformément au cahier des charges sur 20 ans, le noyau relationnel et les contrats d'API (`/api/v2/`) sont scellés. Les futures extensions (Phase 8+) devront impérativement s'enregistrer via des modules complémentaires (Plugins MONAI / Three.js WebGPU) sans modifier le schéma relationnel sous-jacent ni invalider les signatures SHA-256 historiques.
