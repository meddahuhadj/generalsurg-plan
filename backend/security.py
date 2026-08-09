# -*- coding: utf-8 -*-
"""
security.py — Authentification forte : mot de passe (bcrypt) + JWT + 2FA (TOTP).

Flux d'authentification à deux facteurs :
  1. POST /auth/token (username, password)
     → si l'utilisateur n'a PAS activé la 2FA : renvoie directement un JWT final.
     → si la 2FA EST activée : renvoie {requires_2fa: true, pre_auth_token: "..."}
       (jeton de courte durée, 5 min, scope="2fa_pending", ne donne accès à RIEN
       d'autre qu'à l'étape de vérification 2FA).
  2. POST /auth/2fa/verify (pre_auth_token, code TOTP à 6 chiffres OU code de secours)
     → renvoie le JWT final si le code est valide.

Enrôlement 2FA (utilisateur déjà connecté avec un JWT final) :
  3. POST /auth/2fa/setup    → génère un secret TOTP + QR code (PNG base64), état "en attente"
  4. POST /auth/2fa/enable   → confirme avec un code TOTP généré à partir du secret en attente
                                → active réellement la 2FA + génère les codes de secours
  5. POST /auth/2fa/disable  → désactive la 2FA (nécessite un code TOTP valide)
"""

import os
import io
import base64
import secrets
import hashlib
from datetime import UTC, datetime, timedelta
from typing import Optional

import pyotp
import qrcode
from jose import jwt, JWTError
from passlib.context import CryptContext

JWT_ALG = "HS256"
JWT_TTL_MIN = int(os.getenv("JWT_TTL_MIN", "480"))
PRE_AUTH_TTL_MIN = 5
TOTP_ISSUER = os.getenv("TOTP_ISSUER", "ORLSurgPlan3D")

# Sécurité : si aucun JWT_SECRET n'est fourni dans .env, on génère un secret
# aléatoire au démarrage (plutôt que la valeur publique "CHANGEZ-MOI-EN-PRODUCTION"
# visible dans le code source). Les sessions existantes seront révoquées au
# redémarrage — c'est le bon compromis pour éviter les secrets par défaut en prod.
#
# JWT_SECRET_EXPLICITLY_CONFIGURED (exposé, sans underscore) : main.py s'en sert
# pour bloquer le démarrage en APP_ENV=production si absent. Un secret généré
# aléatoirement est propre à CHAQUE PROCESS — avec plusieurs workers Uvicorn
# (ex. --workers 4, voir Dockerfile), un jeton signé par un worker serait
# rejeté par un autre (secret différent) : sans ce garde-fou, ce cassage
# d'authentification inter-workers serait silencieux en production.
_default_secret = "CHANGEZ-MOI-EN-PRODUCTION"
_jwt_secret_from_env = os.getenv("JWT_SECRET", "")
JWT_SECRET_EXPLICITLY_CONFIGURED = bool(_jwt_secret_from_env)
if _jwt_secret_from_env:
    JWT_SECRET = _jwt_secret_from_env
    # Bug corrigé (audit tests de production) : cette branche renvoyait
    # auparavant `False` sans condition, donc le garde-fou APP_ENV=production
    # de main.py ne détectait JAMAIS un JWT_SECRET explicitement laissé à sa
    # valeur par défaut publique — seul le cas "variable absente" était couvert
    # (via JWT_SECRET_EXPLICITLY_CONFIGURED, un contrôle différent).
    _JWT_SECRET_IS_DEFAULT = (_jwt_secret_from_env == _default_secret)
else:
    import secrets as _secrets
    JWT_SECRET = _secrets.token_hex(32)
    _JWT_SECRET_IS_DEFAULT = False  # généré dynamiquement, pas le défaut public

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Mots de passe
# ---------------------------------------------------------------------------
def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------
def create_token(sub: str, scope: str = "full", extra: Optional[dict] = None, ttl_min: Optional[int] = None) -> str:
    payload = {"sub": sub, "scope": scope, "exp": datetime.now(UTC) + timedelta(minutes=ttl_min or JWT_TTL_MIN)}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def create_pre_auth_token(username: str) -> str:
    """Jeton temporaire émis après vérification du mot de passe, en attente du code 2FA."""
    return create_token(username, scope="2fa_pending", ttl_min=PRE_AUTH_TTL_MIN)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


# ---------------------------------------------------------------------------
# 2FA — TOTP (RFC 6238), compatible Google Authenticator / Authy / 1Password
# ---------------------------------------------------------------------------
def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(username: str, secret: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(name=username, issuer_name=TOTP_ISSUER)


def totp_qr_png_base64(uri: str) -> str:
    """Génère un QR code PNG (base64) à afficher/scanner pour l'enrôlement."""
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    totp = pyotp.TOTP(secret)
    # valid_window=1 tolère un léger décalage d'horloge (+/- 30s)
    return totp.verify(code.strip().replace(" ", ""), valid_window=1)


def generate_recovery_codes(n: int = 8) -> list[str]:
    """Codes de secours à usage unique (affichés UNE fois en clair à l'utilisateur)."""
    return [secrets.token_hex(4) for _ in range(n)]


def hash_recovery_code(code: str) -> str:
    return hashlib.sha256(code.strip().lower().encode()).hexdigest()


def verify_recovery_code(hashed_list: list[str], code: str) -> bool:
    return hash_recovery_code(code) in (hashed_list or [])
