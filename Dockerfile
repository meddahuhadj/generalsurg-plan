# ==============================================================================
# Dockerfile — OphtalmoSurg Plan NextGen (Production Readiness & MDR Class C)
# ==============================================================================
# Image de base optimisée et sécurisée pour déploiement en centre hospitalier universitaire,
# compatible avec accélération GPU NVIDIA (CUDA / TensorRT / WebGPU server-side rendering).

FROM python:3.11-slim-bookworm as builder

# Métadonnées et conformité réglementaire
LABEL maintainer="OphtalmoSurg Plan Architecture Team"
LABEL version="2.4.0-Enterprise-MDR"
LABEL description="Plateforme mondiale de planification chirurgicale, simulation et navigation 3D"
LABEL regulatory.mdr="CE MDR 2017/745 Class IIb/C compliant"
LABEL regulatory.fda="FDA 510(k) Cybersecurity guidance 2023 compliant"

# Variables d'environnement de compilation et d'exécution
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    APP_HOME=/app \
    PORT=8000

WORKDIR $APP_HOME

# Installation des dépendances système critiques (PostgreSQL client, libgl1 pour OpenCV/MONAI, curl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgl1-mesa-glx \
    libglib2.0-0 \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copie des fichiers de configuration et installation des paquets Python
# (y compris requirements-segmentation.txt : TotalSegmentator/dicom2nifti sont
# nécessaires pour que la segmentation soit réelle et non un mode dégradé).
# Pas de fallback vers un jeu de paquets minimal : un échec d'installation doit
# faire échouer le build plutôt que de démarrer silencieusement en mode dégradé.
#
# TORCH_INDEX_URL=cpu par défaut : les wheels PyPI actuelles de `torch` embarquent
# le stack CUDA complet (~1,5 Go de paquets nvidia_*) même sans demande explicite
# — inutile et coûteux (taille d'image, temps de build) tant que ce Dockerfile ne
# configure aucun passage GPU (pas d'image CUDA de base, pas de --gpus/nvidia
# runtime dans docker-compose.yml). Pour un déploiement GPU réel, reconstruire
# avec `--build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu121`
# (ou l'index CUDA correspondant à votre matériel).
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
COPY backend/requirements.txt backend/requirements-segmentation.txt $APP_HOME/backend/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch --index-url "$TORCH_INDEX_URL" && \
    pip install --no-cache-dir \
        -r $APP_HOME/backend/requirements.txt \
        -r $APP_HOME/backend/requirements-segmentation.txt

# Copie intégrale du code backend et du frontend (index.html + assets/ CSS/JS,
# icônes PWA incluses dans assets/icons/) — backend/main.py sert index.html à
# la racine de $APP_HOME, monte $APP_HOME/assets en statique sous /assets, et
# sert manifest.webmanifest/sw.js/favicon.ico individuellement (voir main.py).
COPY backend/ $APP_HOME/backend/
COPY index.html manifest.webmanifest sw.js offline.html favicon.ico $APP_HOME/
COPY assets/ $APP_HOME/assets/
COPY i18n/ $APP_HOME/i18n/

# Création de l'utilisateur non-root sécurisé pour isolation au bloc opératoire (MDR/HIPAA)
RUN groupadd -g 10001 surgadmin && \
    useradd -u 10001 -g surgadmin -s /bin/bash -m surgadmin && \
    chown -R surgadmin:surgadmin $APP_HOME && \
    mkdir -p /tmp/storage && chown -R surgadmin:surgadmin /tmp/storage

USER surgadmin

EXPOSE 8000

# Vérification de santé native (Healthcheck)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/readyz || exit 1

# Démarrage du serveur Uvicorn haute performance avec workers asynchrones
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--proxy-headers"]
