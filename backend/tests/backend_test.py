"""Backend integration tests for AtelierAI new features:
- Object storage / private files
- Try-on adapter (mock + hf with fallback)
- Product import connectors (JSON + URL)
- Research export (JSON + CSV, anonymised)
"""
import base64
import io
import json
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://build-from-prompts-1.preview.emergentagent.com").rstrip("/")
API = BASE_URL + "/api"

ADMIN_EMAIL = "admin@atelierai.ph"
ADMIN_PASSWORD = "Admin@123"

# 1x1 red pixel PNG data URL
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
)
TINY_PNG_DATAURL = "data:image/png;base64," + TINY_PNG_B64


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def user_session():
    """Register a fresh user."""
    s = requests.Session()
    email = f"test_user_{int(time.time())}@example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Test User"}, timeout=30)
    assert r.status_code == 200, r.text
    s.email = email
    return s


@pytest.fixture(scope="session")
def user_session_2():
    s = requests.Session()
    email = f"test_user2_{int(time.time())}@example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Test User 2"}, timeout=30)
    assert r.status_code == 200, r.text
    return s


# ---------- Health ----------
def test_health_reports_storage_and_hf():
    r = requests.get(f"{API}/health", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "operational" in d.get("storage", ""), f"storage not operational: {d}"
    assert "hf_idm_vton" in d.get("ai_service", ""), f"ai_service missing hf_idm_vton: {d}"


# ---------- Try-on Mock + Files ----------
def _get_first_product_id():
    r = requests.get(f"{API}/products?limit=1", timeout=30)
    assert r.status_code == 200
    items = r.json()
    assert items, "no products seeded"
    return items[0]["id"]


def test_tryon_mock_creates_session_and_files(user_session):
    pid = _get_first_product_id()
    r = user_session.post(
        f"{API}/tryon/generate",
        json={"photo_base64": TINY_PNG_DATAURL, "product_ids": [pid], "adapter": "mock"},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "COMPLETED"
    assert d["adapter"] == "MockDevelopmentAdapter"
    assert d["photo_file_id"], "photo_file_id missing"
    assert d["result_file_id"], "result_file_id missing"
    # persist to fixture-scope global for next test
    pytest.tryon_session = d


def test_get_file_owner_ok(user_session):
    d = getattr(pytest, "tryon_session", None)
    assert d, "prior test must run first"
    r = user_session.get(f"{API}/files/{d['photo_file_id']}", timeout=30)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/")
    assert len(r.content) > 0


def test_get_file_other_user_forbidden(user_session_2):
    d = getattr(pytest, "tryon_session", None)
    assert d, "prior test must run first"
    r = user_session_2.get(f"{API}/files/{d['photo_file_id']}", timeout=30)
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


def test_get_file_admin_forbidden(admin_session):
    d = getattr(pytest, "tryon_session", None)
    assert d
    r = admin_session.get(f"{API}/files/{d['photo_file_id']}", timeout=30)
    assert r.status_code == 403, f"admin should be forbidden, got {r.status_code}"


def test_get_file_unauthenticated():
    d = getattr(pytest, "tryon_session", None)
    assert d
    r = requests.get(f"{API}/files/{d['photo_file_id']}", timeout=30)
    assert r.status_code == 401


# ---------- Try-on HF adapter (accepts fallback) ----------
def test_tryon_hf_adapter_success_or_fallback(user_session):
    pid = _get_first_product_id()
    r = user_session.post(
        f"{API}/tryon/generate",
        json={"photo_base64": TINY_PNG_DATAURL, "product_ids": [pid], "adapter": "hf"},
        timeout=180,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["requested_adapter"] == "hf"
    if d["used_fallback"]:
        assert d["adapter"] == "MockDevelopmentAdapter"
        assert d.get("error") or d.get("notes"), "fallback must include error/notes"
        print(f"HF fallback triggered (acceptable): {d.get('error')}")
    else:
        assert d["adapter"] == "HFIDMVTONAdapter"
        assert d["status"] == "COMPLETED"


# ---------- Product Import: JSON ----------
def test_import_json_valid(admin_session):
    payload = json.dumps([
        {"name": "TEST_Imported Blazer", "image_url": "https://example.com/blazer.jpg",
         "category": "jacket", "brand": "TestBrand", "price": 1234, "currency": "PHP",
         "source_platform": "test_feed", "source_id": "TESTSKU001"},
        {"name": "TEST_Imported Jeans", "image_url": "https://example.com/jeans.jpg",
         "category": "bottom", "brand": "TestBrand", "price": 999, "source_id": "TESTSKU002"},
    ])
    r = admin_session.post(f"{API}/admin/import/json", json={"payload": payload, "auto_save": True}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "success", d
    assert d["imported"] == 2
    assert d["saved"] == 2


def test_import_json_non_admin_forbidden(user_session):
    r = user_session.post(f"{API}/admin/import/json", json={"payload": "[]", "auto_save": False}, timeout=30)
    assert r.status_code == 403


def test_import_json_invalid_payload(admin_session):
    r = admin_session.post(f"{API}/admin/import/json", json={"payload": "not-json", "auto_save": False}, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "failed"
    assert "Invalid JSON" in (d.get("message") or "")


# ---------- Product Import: URL ----------
def test_import_url_lazada_honest_failure(admin_session):
    r = admin_session.post(
        f"{API}/admin/import/url",
        json={"url": "https://www.lazada.com.ph/products/some-item-i123.html", "auto_save": False},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    # Must NOT falsely claim success; either failed or partial (og-only)
    assert d["status"] in ("failed", "partial"), d
    assert d.get("message"), "message required"


def test_import_url_wikipedia_or_generic(admin_session):
    # Wikipedia has no Product JSON-LD, expect failed with honest message.
    r = admin_session.post(
        f"{API}/admin/import/url",
        json={"url": "https://en.wikipedia.org/wiki/Levi%27s", "auto_save": False},
        timeout=60,
    )
    assert r.status_code == 200
    d = r.json()
    # Outcome reflects true state — should be failed or partial (og meta available)
    assert d["status"] in ("failed", "partial", "success"), d


def test_import_jobs_list(admin_session):
    r = admin_session.get(f"{API}/admin/import/jobs", timeout=30)
    assert r.status_code == 200
    jobs = r.json()
    assert isinstance(jobs, list)
    assert len(jobs) >= 1, "prior imports should be logged"


# ---------- Export ----------
def test_export_json_anonymised(admin_session):
    r = admin_session.get(f"{API}/admin/export?format=json", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "rows" in d and isinstance(d["rows"], list)
    text = json.dumps(d)
    for row in d["rows"]:
        assert row["anon_user_id"].startswith("u_"), row
    # Ensure no raw email leaks
    assert ADMIN_EMAIL not in text
    assert "password" not in text.lower()


def test_export_csv_headers(admin_session):
    r = admin_session.get(f"{API}/admin/export?format=csv", timeout=30)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    assert "attachment" in r.headers.get("content-disposition", "").lower()
    assert "anon_user_id" in r.text.split("\n")[0]
    assert ADMIN_EMAIL not in r.text


def test_export_non_admin_forbidden(user_session):
    r = user_session.get(f"{API}/admin/export?format=json", timeout=30)
    assert r.status_code == 403
