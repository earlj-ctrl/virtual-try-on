"""Tests for new try-on favorite + pixel avatar + multi-view features."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = BASE_URL + "/api"

TINY_PNG_DATAURL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
)

TRYON_EMAIL = "tryon_test@example.com"
TRYON_PASSWORD = "newpass1234"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": TRYON_EMAIL, "password": TRYON_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def product_id():
    r = requests.get(f"{API}/products?limit=5", timeout=30)
    assert r.status_code == 200
    items = r.json()
    # try to pick a 'top' if available
    tops = [p for p in items if (p.get("category") or "").lower() == "top"]
    return (tops or items)[0]["id"]


@pytest.fixture(scope="module")
def tryon_session(sess, product_id):
    r = sess.post(
        f"{API}/tryon/generate",
        json={"photo_base64": TINY_PNG_DATAURL, "product_ids": [product_id], "adapter": "mock"},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_generate_has_side_and_rear_file_ids(tryon_session):
    d = tryon_session
    assert d["status"] == "COMPLETED"
    assert d["adapter"] == "MockDevelopmentAdapter"
    assert d.get("photo_file_id")
    assert d.get("result_file_id")
    assert d.get("side_file_id"), f"side_file_id missing: {d}"
    assert d.get("rear_file_id"), f"rear_file_id missing: {d}"
    assert d.get("is_favorite") is False
    assert d.get("pixel_avatar_id") in (None, "")


def test_side_and_rear_files_retrievable(sess, tryon_session):
    for k in ("side_file_id", "rear_file_id"):
        r = sess.get(f"{API}/files/{tryon_session[k]}", timeout=30)
        assert r.status_code == 200, f"{k}: {r.status_code}"
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 200


def test_favorite_first_call_creates_pixel_avatar(sess, tryon_session):
    sid = tryon_session["id"]
    r = sess.post(f"{API}/tryon/sessions/{sid}/favorite", timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["is_favorite"] is True
    assert d.get("pixel_avatar_id"), f"pixel_avatar_id missing: {d}"
    assert d.get("auto_pixel_created") is True
    pytest.fav_pixel_id = d["pixel_avatar_id"]


def test_favorite_second_call_is_idempotent(sess, tryon_session):
    sid = tryon_session["id"]
    r = sess.post(f"{API}/tryon/sessions/{sid}/favorite", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["is_favorite"] is True
    # auto_pixel_created must be false the second time
    assert d.get("auto_pixel_created") is False, d
    assert d.get("pixel_avatar_id") == getattr(pytest, "fav_pixel_id", None)


def test_favorites_list_contains_session(sess, tryon_session):
    r = sess.get(f"{API}/tryon/favorites", timeout=30)
    assert r.status_code == 200
    lst = r.json()
    assert isinstance(lst, list)
    ids = [x.get("id") for x in lst]
    assert tryon_session["id"] in ids, f"session not in favorites: {ids}"
    for x in lst:
        assert x.get("is_favorite") is True


def test_pixel_avatar_auto_generated_flag(sess):
    r = sess.get(f"{API}/pixel-avatars", timeout=30)
    assert r.status_code == 200
    lst = r.json()
    fav_id = getattr(pytest, "fav_pixel_id", None)
    assert fav_id, "prior test must run"
    match = [a for a in lst if a.get("id") == fav_id]
    assert match, f"auto avatar {fav_id} not in list"
    av = match[0]
    assert av.get("auto_generated") is True, av


def test_unfavorite_removes_from_favorites(sess, tryon_session):
    sid = tryon_session["id"]
    r = sess.post(f"{API}/tryon/sessions/{sid}/unfavorite", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    # server returns {"ok": True}; verify state via favorites list
    assert d.get("ok") is True or d.get("is_favorite") is False
    # confirm no longer in favorites list
    r2 = sess.get(f"{API}/tryon/favorites", timeout=30)
    assert r2.status_code == 200
    ids = [x.get("id") for x in r2.json()]
    assert sid not in ids
