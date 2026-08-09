# -*- coding: utf-8 -*-
"""
test_user_management.py — Tests de routers/users.py (admin), du rate limiting
ajouté sur /auth/2fa/verify et /auth/register, du flag ALLOW_SELF_REGISTRATION,
et du mécanisme d'administrateur de bootstrap (BOOTSTRAP_ADMIN_*).

Utilise la fixture `client` partagée (tests/conftest.py) pour tout ce qui ne
dépend pas de variables lues à l'import de main.py ; les scénarios
bootstrap-admin nécessitent un process frais (voir tests/_subprocess_boot.py),
exactement comme test_production_guardrail.py.
"""

from test_auth_patients_dicom import _demo_login, _register_and_login, _unique

from _subprocess_boot import BACKEND_DIR, run_boot_script


def _admin_headers(client):
    return _demo_login(client, "dr.hadj")


def _surgeon_headers(client):
    return _demo_login(client, "dr.benali")


# ---------------------------------------------------------------------------
# POST /users — création (admin uniquement)
# ---------------------------------------------------------------------------
def test_admin_can_create_user(client):
    headers = _admin_headers(client)
    username = _unique("nurse")
    r = client.post("/users", json={"username": username, "password": "NursePass123", "role": "surgeon"}, headers=headers)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["username"] == username
    assert body["role"] == "surgeon"
    assert "hashed_password" not in body
    assert "totp_secret" not in body


def test_non_admin_cannot_create_user(client):
    headers = _surgeon_headers(client)
    r = client.post("/users", json={"username": _unique("blocked"), "password": "BlockedPass123"}, headers=headers)
    assert r.status_code == 403


def test_create_user_requires_authentication(client):
    r = client.post("/users", json={"username": _unique("anon"), "password": "AnonPass123"})
    assert r.status_code == 401


def test_create_user_rejects_duplicate_username(client):
    headers = _admin_headers(client)
    username, _ = _register_and_login(client)
    r = client.post("/users", json={"username": username, "password": "AnotherPass123"}, headers=headers)
    assert r.status_code == 400


def test_create_user_rejects_invalid_role(client):
    headers = _admin_headers(client)
    r = client.post("/users", json={"username": _unique("badrole"), "password": "BadRolePass123", "role": "superuser"}, headers=headers)
    assert r.status_code == 422


def test_create_user_can_assign_admin_role(client):
    headers = _admin_headers(client)
    username = _unique("newadmin")
    r = client.post("/users", json={"username": username, "password": "NewAdminPass123", "role": "admin"}, headers=headers)
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "admin"
    # Preuve que le rôle admin est réellement actif (accès /audit)
    token = client.post("/auth/token", data={"username": username, "password": "NewAdminPass123"}).json()["access_token"]
    r2 = client.get("/audit", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200


# ---------------------------------------------------------------------------
# GET /users — liste (admin uniquement)
# ---------------------------------------------------------------------------
def test_admin_can_list_users(client):
    headers = _admin_headers(client)
    r = client.get("/users", headers=headers)
    assert r.status_code == 200
    users = r.json()
    assert any(u["username"] == "dr.hadj" for u in users)
    assert all("hashed_password" not in u for u in users)


def test_non_admin_cannot_list_users(client):
    headers = _surgeon_headers(client)
    r = client.get("/users", headers=headers)
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# PATCH /users/{id} — is_active / role (admin uniquement)
# ---------------------------------------------------------------------------
def test_admin_can_deactivate_user(client):
    headers = _admin_headers(client)
    username = _unique("todeactivate")
    created = client.post("/users", json={"username": username, "password": "ToDeactivate123"}, headers=headers).json()

    r = client.patch(f"/users/{created['id']}", json={"is_active": False}, headers=headers)
    assert r.status_code == 200
    assert r.json()["is_active"] is False

    r2 = client.post("/auth/token", data={"username": username, "password": "ToDeactivate123"})
    assert r2.status_code == 401


def test_admin_cannot_deactivate_own_account(client):
    headers = _admin_headers(client)
    me = client.get("/users", headers=headers).json()
    my_id = next(u["id"] for u in me if u["username"] == "dr.hadj")
    r = client.patch(f"/users/{my_id}", json={"is_active": False}, headers=headers)
    assert r.status_code == 400


def test_admin_can_change_role(client):
    headers = _admin_headers(client)
    username = _unique("promoteme")
    created = client.post("/users", json={"username": username, "password": "PromoteMe123", "role": "surgeon"}, headers=headers).json()
    r = client.patch(f"/users/{created['id']}", json={"role": "dpo"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["role"] == "dpo"


def test_patch_unknown_user_returns_404(client):
    headers = _admin_headers(client)
    r = client.patch("/users/999999", json={"is_active": False}, headers=headers)
    assert r.status_code == 404


def test_non_admin_cannot_patch_user(client):
    surgeon_headers = _surgeon_headers(client)
    admin_headers = _admin_headers(client)
    username = _unique("targetuser")
    created = client.post("/users", json={"username": username, "password": "TargetUser123"}, headers=admin_headers).json()
    r = client.patch(f"/users/{created['id']}", json={"is_active": False}, headers=surgeon_headers)
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Rate limiting — /auth/2fa/verify, /auth/register
# ---------------------------------------------------------------------------
def test_2fa_verify_rate_limited_after_ten_attempts(client):
    import resilience
    resilience.TWOFA_VERIFY_RATE_LIMITER._hits.clear()
    for _ in range(10):
        r = client.post("/auth/2fa/verify", json={"pre_auth_token": "x" * 20, "code": "000000"})
        assert r.status_code == 401
    r = client.post("/auth/2fa/verify", json={"pre_auth_token": "x" * 20, "code": "000000"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers


def test_register_rate_limited_after_five_attempts_per_minute(client):
    import resilience
    resilience.REGISTER_RATE_LIMITER._hits.clear()
    for _ in range(5):
        r = client.post("/auth/register", json={"username": _unique("ratelimited"), "password": "RateLimited123"})
        assert r.status_code == 200
    r = client.post("/auth/register", json={"username": _unique("ratelimited"), "password": "RateLimited123"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers


def test_registration_disabled_returns_403(client, monkeypatch):
    # ALLOW_SELF_REGISTRATION est lu une seule fois à l'import du module
    # (comme SEED_DEMO_USERS/APP_ENV dans main.py) : un simple `os.environ`
    # n'a aucun effet une fois le module déjà importé par la fixture `client`
    # (session-scoped) — il faut patcher directement l'attribut du module.
    import routers.auth as auth_router
    monkeypatch.setattr(auth_router, "ALLOW_SELF_REGISTRATION", False)
    r = client.post("/auth/register", json={"username": _unique("shouldfail"), "password": "ShouldFailPass123"})
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Administrateur de bootstrap (BOOTSTRAP_ADMIN_*) — process frais requis
# ---------------------------------------------------------------------------
def test_bootstrap_admin_created_when_table_empty(tmp_path):
    db_path = tmp_path / "bootstrap_test.db"
    script = (
        f"import sys; sys.path.insert(0, {str(BACKEND_DIR)!r})\n"
        "from fastapi.testclient import TestClient\n"
        "import main\n"
        "with TestClient(main.app) as c:\n"
        "    r = c.post('/auth/token', data={'username': 'bootstrap.admin', 'password': 'BootstrapPass123'})\n"
        "    assert r.status_code == 200, r.text\n"
        "    headers = {'Authorization': 'Bearer ' + r.json()['access_token']}\n"
        "    assert c.get('/audit', headers=headers).status_code == 200\n"
        "print('OK')\n"
    )
    result = run_boot_script(script, {
        "APP_ENV": "development",
        "DATABASE_URL": f"sqlite:///{db_path.as_posix()}",
        "SEED_DEMO_USERS": "false",
        "BOOTSTRAP_ADMIN_USERNAME": "bootstrap.admin",
        "BOOTSTRAP_ADMIN_PASSWORD": "BootstrapPass123",
    })
    assert result.returncode == 0, result.stdout + result.stderr
    assert "OK" in result.stdout


def test_bootstrap_admin_takes_precedence_over_seed_demo_users(tmp_path):
    db_path = tmp_path / "bootstrap_precedence.db"
    script = (
        f"import sys; sys.path.insert(0, {str(BACKEND_DIR)!r})\n"
        "from fastapi.testclient import TestClient\n"
        "import main\n"
        "with TestClient(main.app) as c:\n"
        "    assert c.post('/auth/token', data={'username': 'dr.hadj', 'password': 'changeme'}).status_code == 401\n"
        "    assert c.post('/auth/token', data={'username': 'bootstrap.admin', 'password': 'BootstrapPass123'}).status_code == 200\n"
        "print('OK')\n"
    )
    result = run_boot_script(script, {
        "APP_ENV": "development",
        "DATABASE_URL": f"sqlite:///{db_path.as_posix()}",
        "SEED_DEMO_USERS": "true",  # les deux définis à la fois — prouve l'ordre de précédence
        "BOOTSTRAP_ADMIN_USERNAME": "bootstrap.admin",
        "BOOTSTRAP_ADMIN_PASSWORD": "BootstrapPass123",
    })
    assert result.returncode == 0, result.stdout + result.stderr
    assert "OK" in result.stdout


def test_bootstrap_admin_not_created_when_password_too_short(tmp_path):
    db_path = tmp_path / "bootstrap_short_pw.db"
    script = (
        f"import sys; sys.path.insert(0, {str(BACKEND_DIR)!r})\n"
        "from fastapi.testclient import TestClient\n"
        "import main\n"
        "with TestClient(main.app) as c:\n"
        "    assert c.post('/auth/token', data={'username': 'short.admin', 'password': 'short12'}).status_code == 401\n"
        "print('OK')\n"
    )
    result = run_boot_script(script, {
        "APP_ENV": "development",
        "DATABASE_URL": f"sqlite:///{db_path.as_posix()}",
        "SEED_DEMO_USERS": "false",
        "BOOTSTRAP_ADMIN_USERNAME": "short.admin",
        "BOOTSTRAP_ADMIN_PASSWORD": "short12",  # < 8 caractères
    })
    assert result.returncode == 0, result.stdout + result.stderr
    assert "OK" in result.stdout
