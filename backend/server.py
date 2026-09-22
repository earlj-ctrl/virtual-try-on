from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any, Annotated

import bcrypt
import jwt
import uuid as _uuid
import httpx as _httpx
import csv as _csv
import io as _io
import asyncio
import base64
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, status, Query, Header
from fastapi.responses import StreamingResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, EmailStr, BeforeValidator

import storage_client
from tryon_adapters import MockDevelopmentAdapter, HFIDMVTONAdapter, get_adapter, _decode_data_url
from product_connectors import (
    import_json_feed, import_csv_feed, scrape_lazada, scrape_shopee, scrape_generic_url,
    NormalizedProduct,
)
from email_service import send_email, password_reset_html
from pixel_avatar import make_pixel_avatar

# -------------------- Config --------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Atelier AI Virtual Try-On API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("atelier-ai")


# -------------------- Helpers --------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60 * 24),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=60 * 60 * 24, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=60 * 60 * 24 * 7, path="/")


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def serialize_doc(doc: dict) -> dict:
    if not doc:
        return doc
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    doc.pop("password_hash", None)
    return doc


async def get_token_payload(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user(request: Request) -> dict:
    payload = await get_token_payload(request)
    try:
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user id")
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return serialize_doc(user)


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# -------------------- Models --------------------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    chest_cm: Optional[float] = None
    waist_cm: Optional[float] = None
    hips_cm: Optional[float] = None
    preferred_fit: Optional[str] = None
    preferred_styles: Optional[List[str]] = None
    avatar_url: Optional[str] = None


class ProductInput(BaseModel):
    name: str
    description: Optional[str] = ""
    brand: Optional[str] = ""
    category: str  # top, bottom, dress, jacket, shoes, jewelry, accessory
    subcategory: Optional[str] = None
    style: Optional[List[str]] = []
    color: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = "PHP"
    image_url: str
    source_platform: Optional[str] = "manual"
    source_url: Optional[str] = None
    tags: Optional[List[str]] = []
    active: bool = True


class WardrobeItemInput(BaseModel):
    product_id: str


class OutfitInput(BaseModel):
    name: str
    items: dict  # {top: product_id, bottom: product_id, ...}


class TryOnInput(BaseModel):
    photo_base64: str  # user photo (data URL or base64)
    product_ids: List[str]
    adapter: Optional[str] = "mock"  # "mock" | "hf" (real IDM-VTON)


class ImportJSONInput(BaseModel):
    payload: str
    auto_save: bool = True


class ImportURLInput(BaseModel):
    url: str
    auto_save: bool = True


class ForgotPasswordInput(BaseModel):
    email: EmailStr


class ResetPasswordInput(BaseModel):
    token: str
    password: str = Field(min_length=6)


class GoogleCallbackInput(BaseModel):
    session_id: str


class PixelAvatarInput(BaseModel):
    session_id: str
    pixel_size: int = 48
    posterize_bits: int = 3


class ShoppingClick(BaseModel):
    product_id: str
    platform: str


# -------------------- Startup --------------------
async def seed_admin_and_data():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded admin user")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}},
        )

    # Seed products if empty
    count = await db.products.count_documents({})
    if count == 0:
        sample = [
            {"name": "Minimalist Tailored Trench Blazer", "brand": "Kultura", "category": "jacket", "style": ["Minimalist", "Formal"], "color": "Beige", "price": 4500, "currency": "PHP",
             "image_url": "https://images.unsplash.com/photo-1551232864-3f0890e580d9?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
             "source_platform": "Zalora PH", "source_url": "https://www.zalora.com.ph/", "tags": ["outerwear", "editorial"]},
            {"name": "Monochrome Oversized Suit Set", "brand": "Bench", "category": "top", "style": ["Modern", "Smart Casual"], "color": "Charcoal", "price": 3200, "currency": "PHP",
             "image_url": "https://images.pexels.com/photos/5745783/pexels-photo-5745783.jpeg?auto=compress&cs=tinysrgb&w=800",
             "source_platform": "Shopee", "source_url": "https://shopee.ph/", "tags": ["monochrome", "suit"]},
            {"name": "Earthy Knit Top", "brand": "Penshoppe", "category": "top", "style": ["Casual", "Minimalist"], "color": "Cream", "price": 890, "currency": "PHP",
             "image_url": "https://images.pexels.com/photos/35675692/pexels-photo-35675692.jpeg?auto=compress&cs=tinysrgb&w=800",
             "source_platform": "Lazada", "source_url": "https://www.lazada.com.ph/", "tags": ["knit"]},
            {"name": "Slim Denim Jeans", "brand": "Bench", "category": "bottom", "style": ["Casual", "Streetwear"], "color": "Indigo", "price": 1490, "currency": "PHP",
             "image_url": "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
             "source_platform": "Zalora PH", "source_url": "https://www.zalora.com.ph/", "tags": ["denim"]},
            {"name": "Linen Wide-Leg Trousers", "brand": "Kultura", "category": "bottom", "style": ["Minimalist", "Formal"], "color": "Sand", "price": 1990, "currency": "PHP",
             "image_url": "https://images.unsplash.com/photo-1548883354-94bcfe321cbb?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
             "source_platform": "Shopee", "source_url": "https://shopee.ph/", "tags": ["linen"]},
            {"name": "Silk Slip Dress", "brand": "Kashieca", "category": "dress", "style": ["Formal", "Modern"], "color": "Emerald", "price": 2790, "currency": "PHP",
             "image_url": "https://images.unsplash.com/photo-1595777457583-95e059d581b8?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
             "source_platform": "Lazada", "source_url": "https://www.lazada.com.ph/", "tags": ["silk", "evening"]},
            {"name": "Filipiniana Modern Terno", "brand": "Kultura", "category": "dress", "style": ["Filipiniana", "Formal"], "color": "Ivory", "price": 6890, "currency": "PHP",
             "image_url": "https://images.unsplash.com/photo-1566174053879-31528523f8ae?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
             "source_platform": "Kultura", "source_url": "https://kulturafilipino.com/", "tags": ["filipiniana", "traditional"]},
            {"name": "Metallic Structured Tote", "brand": "SM Accessories", "category": "accessory", "subcategory": "bag", "style": ["Modern"], "color": "Silver", "price": 1990, "currency": "PHP",
             "image_url": "https://images.unsplash.com/photo-1589363358751-ab05797e5629?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
             "source_platform": "Shopee", "source_url": "https://shopee.ph/", "tags": ["bag"]},
            {"name": "Gold Geometric Pendant", "brand": "Suyen Jewelry", "category": "jewelry", "subcategory": "necklace", "style": ["Minimalist"], "color": "Gold", "price": 1290, "currency": "PHP",
             "image_url": "https://images.unsplash.com/photo-1721103418218-416182aca079?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
             "source_platform": "Lazada", "source_url": "https://www.lazada.com.ph/", "tags": ["gold"]},
            {"name": "Tiered Gold Rings Set", "brand": "Aldo PH", "category": "jewelry", "subcategory": "ring", "style": ["Modern"], "color": "Gold", "price": 890, "currency": "PHP",
             "image_url": "https://images.unsplash.com/photo-1543294001-f7cd5d7fb516?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
             "source_platform": "Zalora PH", "source_url": "https://www.zalora.com.ph/", "tags": ["rings"]},
            {"name": "White Leather Sneakers", "brand": "World Balance", "category": "shoes", "style": ["Casual", "Streetwear"], "color": "White", "price": 1590, "currency": "PHP",
             "image_url": "https://images.unsplash.com/photo-1549298916-b41d501d3772?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
             "source_platform": "Shopee", "source_url": "https://shopee.ph/", "tags": ["sneakers"]},
            {"name": "Leather Ankle Boots", "brand": "Rusty Lopez", "category": "shoes", "style": ["Formal", "Modern"], "color": "Black", "price": 2490, "currency": "PHP",
             "image_url": "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?crop=entropy&cs=srgb&fm=jpg&w=800&q=80",
             "source_platform": "Lazada", "source_url": "https://www.lazada.com.ph/", "tags": ["boots"]},
        ]
        now = datetime.now(timezone.utc).isoformat()
        for p in sample:
            p.setdefault("description", "")
            p.setdefault("subcategory", None)
            p.setdefault("tags", [])
            p["active"] = True
            p["created_at"] = now
            p["updated_at"] = now
        await db.products.insert_many(sample)
        logger.info(f"Seeded {len(sample)} products")


@app.on_event("startup")
async def startup_event():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("category")
    await db.wardrobe_items.create_index("user_id")
    await db.saved_outfits.create_index("user_id")
    await db.try_on_sessions.create_index("user_id")
    await db.audit_logs.create_index("timestamp")
    await db.file_records.create_index([("user_id", 1), ("kind", 1)])
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.password_reset_tokens.create_index("token", unique=True)
    await db.pixel_avatars.create_index("user_id")
    await seed_admin_and_data()

    try:
        storage_client.init_storage()
    except Exception as e:
        logger.warning(f"Object storage init failed at startup (will retry on demand): {e}")

    # Write test credentials memory file
    creds_path = Path("/app/memory/test_credentials.md")
    creds_path.parent.mkdir(parents=True, exist_ok=True)
    creds_path.write_text(
        f"""# Test Credentials

## Admin
- Email: {os.environ['ADMIN_EMAIL']}
- Password: {os.environ['ADMIN_PASSWORD']}
- Role: admin

## Auth endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
"""
    )


@app.on_event("shutdown")
async def shutdown_event():
    client.close()


# -------------------- Health --------------------
@api.get("/")
async def root():
    return {"service": "Atelier AI Virtual Try-On", "status": "operational"}


@api.get("/health")
async def health():
    result = {"database": "unknown", "ai_service": "development_placeholder", "storage": "unknown"}
    try:
        await db.command("ping")
        result["database"] = "operational"
    except Exception:
        result["database"] = "unavailable"
    try:
        storage_client.init_storage()
        result["storage"] = "operational (emergent object storage)"
    except Exception:
        result["storage"] = "unavailable"
    result["ai_service"] = "mock + hf_idm_vton (free space, best-effort)"
    return result


# -------------------- Auth --------------------
@api.post("/auth/register")
async def register(input: RegisterInput, response: Response):
    email = input.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_doc = {
        "email": email,
        "password_hash": hash_password(input.password),
        "name": input.name,
        "role": "user",
        "profile": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(user_doc)
    uid = str(result.inserted_id)
    access = create_access_token(uid, email, "user")
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"id": uid, "email": email, "name": input.name, "role": "user"}


@api.post("/auth/login")
async def login(input: LoginInput, response: Response):
    email = input.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(input.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    uid = str(user["_id"])
    access = create_access_token(uid, email, user.get("role", "user"))
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return serialize_doc(user)


@api.post("/auth/logout")
async def logout(response: Response, _user: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.put("/auth/profile")
async def update_profile(update: ProfileUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in update.model_dump().items() if v is not None}
    if updates:
        set_ops = {f"profile.{k}": v for k, v in updates.items() if k != "name"}
        if "name" in updates:
            set_ops["name"] = updates["name"]
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": set_ops})
    updated = await db.users.find_one({"_id": ObjectId(user["id"])})
    return serialize_doc(updated)


# -------------------- Password Reset --------------------
@api.post("/auth/google/callback")
async def google_callback(input: GoogleCallbackInput, response: Response):
    """Exchange Emergent Auth session_id for a user session.

    Backend calls Emergent Auth's session-data endpoint (never the frontend).
    We match/create the user by email and then issue our normal JWT cookies so
    the rest of the app (which already uses cookie-based JWT) works unchanged.
    """
    try:
        async with _httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": input.session_id},
            )
        if r.status_code >= 400:
            logger.warning(f"Emergent Auth exchange failed: {r.status_code} {r.text[:200]}")
            raise HTTPException(status_code=401, detail="Google sign-in failed")
        data = r.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Emergent Auth network error: {e}")
        raise HTTPException(status_code=502, detail="Auth provider unreachable")

    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture") or ""
    google_id = data.get("id") or ""

    existing = await db.users.find_one({"email": email})
    now = datetime.now(timezone.utc).isoformat()
    if existing:
        await db.users.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "google_id": google_id,
                "avatar_url": picture or existing.get("avatar_url"),
                "last_login_at": now,
                "auth_provider": existing.get("auth_provider") or "google",
            }},
        )
        uid = str(existing["_id"])
        role = existing.get("role", "user")
    else:
        insert_doc = {
            "email": email,
            "name": name,
            "role": "user",
            "google_id": google_id,
            "avatar_url": picture,
            "auth_provider": "google",
            "password_hash": hash_password(secrets.token_urlsafe(32)),  # random unusable pw
            "profile": {},
            "created_at": now,
            "last_login_at": now,
        }
        r2 = await db.users.insert_one(insert_doc)
        uid = str(r2.inserted_id)
        role = "user"

    access = create_access_token(uid, email, role)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    user = await db.users.find_one({"_id": ObjectId(uid)})
    return serialize_doc(user)


# -------------------- Password Reset --------------------
@api.post("/auth/forgot-password")
async def forgot_password(input: ForgotPasswordInput):
    email = input.email.lower()
    user = await db.users.find_one({"email": email})
    # Don't leak whether the account exists
    if user:
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.password_reset_tokens.insert_one({
            "token": token, "user_id": str(user["_id"]), "email": email,
            "expires_at": expires, "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        reset_url = f"{FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
        try:
            result = await send_email(
                to=email,
                subject="Reset your AtelierAI password",
                html=password_reset_html(user.get("name", ""), reset_url),
            )
            logger.info(f"Password reset email for {email}: {result}")
        except Exception as e:
            logger.error(f"Password reset send error for {email}: {e}")
        # Always log to backend log so devs can retrieve the link if email is unset
        logger.warning(f"[PASSWORD RESET] URL for {email}: {reset_url}")
    return {"ok": True, "message": "If that email is registered, a reset link has been sent."}


@api.post("/auth/reset-password")
async def reset_password(input: ResetPasswordInput):
    rec = await db.password_reset_tokens.find_one({"token": input.token, "used": False})
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    # Compare timezone-aware
    expires = rec["expires_at"]
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expired")
    await db.users.update_one(
        {"_id": ObjectId(rec["user_id"])},
        {"$set": {"password_hash": hash_password(input.password)}},
    )
    await db.password_reset_tokens.update_one(
        {"_id": rec["_id"]}, {"$set": {"used": True}}
    )
    return {"ok": True}


# -------------------- Products (public read) --------------------
@api.get("/products")
async def list_products(
    category: Optional[str] = None,
    style: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(60, le=200),
):
    q: dict = {"active": True}
    if category:
        q["category"] = category
    if style:
        q["style"] = style
    if search:
        q["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}},
            {"tags": {"$regex": search, "$options": "i"}},
        ]
    cursor = db.products.find(q).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [serialize_doc(d) for d in docs]


@api.get("/products/{product_id}")
async def get_product(product_id: str):
    try:
        doc = await db.products.find_one({"_id": ObjectId(product_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    return serialize_doc(doc)


# -------------------- Wardrobe (auth) --------------------
@api.get("/wardrobe/items")
async def list_wardrobe_items(user: dict = Depends(get_current_user)):
    docs = await db.wardrobe_items.find({"user_id": user["id"]}).to_list(length=500)
    result = []
    for d in docs:
        prod = None
        try:
            prod = await db.products.find_one({"_id": ObjectId(d["product_id"])})
        except Exception:
            pass
        item = serialize_doc(d)
        item["product"] = serialize_doc(prod) if prod else None
        result.append(item)
    return result


@api.post("/wardrobe/items")
async def add_wardrobe_item(input: WardrobeItemInput, user: dict = Depends(get_current_user)):
    existing = await db.wardrobe_items.find_one({"user_id": user["id"], "product_id": input.product_id})
    if existing:
        return serialize_doc(existing)
    doc = {
        "user_id": user["id"],
        "product_id": input.product_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = await db.wardrobe_items.insert_one(doc)
    doc["_id"] = r.inserted_id
    return serialize_doc(doc)


@api.delete("/wardrobe/items/{item_id}")
async def remove_wardrobe_item(item_id: str, user: dict = Depends(get_current_user)):
    try:
        r = await db.wardrobe_items.delete_one({"_id": ObjectId(item_id), "user_id": user["id"]})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# -------------------- Outfits --------------------
@api.get("/wardrobe/outfits")
async def list_outfits(user: dict = Depends(get_current_user)):
    docs = await db.saved_outfits.find({"user_id": user["id"]}).sort("created_at", -1).to_list(length=200)
    return [serialize_doc(d) for d in docs]


@api.post("/wardrobe/outfits")
async def save_outfit(input: OutfitInput, user: dict = Depends(get_current_user)):
    doc = {
        "user_id": user["id"],
        "name": input.name,
        "items": input.items,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = await db.saved_outfits.insert_one(doc)
    doc["_id"] = r.inserted_id
    return serialize_doc(doc)


@api.delete("/wardrobe/outfits/{outfit_id}")
async def delete_outfit(outfit_id: str, user: dict = Depends(get_current_user)):
    try:
        r = await db.saved_outfits.delete_one({"_id": ObjectId(outfit_id), "user_id": user["id"]})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# -------------------- Files (private, owner-only) --------------------
async def save_bytes_for_user(user_id: str, kind: str, data: bytes, content_type: str) -> dict:
    """Upload to object storage and record in DB. Returns file record."""
    ext = {
        "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
        "image/webp": "webp", "image/gif": "gif",
    }.get(content_type, "bin")
    filename = f"{_uuid.uuid4()}.{ext}"
    path = storage_client.user_path(user_id, kind, filename)
    result = storage_client.put_object(path, data, content_type)
    record = {
        "user_id": user_id,
        "kind": kind,
        "storage_path": result["path"],
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = await db.file_records.insert_one(record)
    record["_id"] = r.inserted_id
    return record


@api.get("/files/{file_id}")
async def get_file(file_id: str, user: dict = Depends(get_current_user)):
    try:
        rec = await db.file_records.find_one({"_id": ObjectId(file_id), "is_deleted": False})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file id")
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    if rec["user_id"] != user["id"] and user.get("role") != "admin":
        # Admins never access private user photos even so — enforce strict rule
        raise HTTPException(status_code=403, detail="Forbidden")
    # Admin cannot view private photos (per PDF policy)
    if user.get("role") == "admin" and rec["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Admin cannot access private user files")
    data, ct = storage_client.get_object(rec["storage_path"])
    return Response(content=data, media_type=rec.get("content_type", ct))


# -------------------- Try-On --------------------
@api.post("/tryon/generate")
async def generate_tryon(input: TryOnInput, user: dict = Depends(get_current_user)):
    """Runs the selected adapter. HF real adapter falls back to Mock on failure.
    All artefacts (user photo + result render) go to private Object Storage."""
    if not input.photo_base64:
        raise HTTPException(status_code=400, detail="Photo is required")
    if not input.product_ids:
        raise HTTPException(status_code=400, detail="At least one product required")

    products = []
    for pid in input.product_ids:
        try:
            p = await db.products.find_one({"_id": ObjectId(pid)})
            if p: products.append(serialize_doc(p))
        except Exception:
            continue
    if not products:
        raise HTTPException(status_code=404, detail="No valid products")

    # Store user photo in object storage
    user_bytes, user_ct = _decode_data_url(input.photo_base64)
    try:
        photo_rec = await save_bytes_for_user(user["id"], "photos", user_bytes, user_ct)
    except Exception as e:
        logger.error(f"Photo upload failed: {e}")
        raise HTTPException(status_code=500, detail="Could not store photo")
    photo_file_id = str(photo_rec["_id"])

    # Fetch garment image bytes (first product) for the model
    garment = products[0]
    async with _httpx.AsyncClient(timeout=20) as c:
        try:
            gr = await c.get(garment["image_url"])
            gr.raise_for_status()
            garment_bytes = gr.content
        except Exception:
            garment_bytes = user_bytes  # graceful

    # Pick adapter
    requested = (input.adapter or "mock").lower()
    adapter = get_adapter(requested)
    # Run in a thread since gradio_client / bcrypt are blocking
    result = await asyncio.to_thread(
        adapter.run, input.photo_base64, garment_bytes, garment.get("name", "")
    )

    # If HF failed, fall back to Mock so the user still sees a preview
    used_fallback = False
    if result.status == "FAILED" and requested != "mock":
        used_fallback = True
        result = await asyncio.to_thread(
            MockDevelopmentAdapter().run, input.photo_base64, garment_bytes, garment.get("name", "")
        )

    # Store rendered result (front + side/rear approximations)
    result_file_id = None
    side_file_id = None
    rear_file_id = None
    if result.result_image_bytes:
        try:
            rrec = await save_bytes_for_user(
                user["id"], "renders", result.result_image_bytes, result.result_content_type
            )
            result_file_id = str(rrec["_id"])
        except Exception as e:
            logger.warning(f"Render upload failed: {e}")
    if result.side_image_bytes:
        try:
            srec = await save_bytes_for_user(user["id"], "renders", result.side_image_bytes, "image/png")
            side_file_id = str(srec["_id"])
        except Exception as e:
            logger.warning(f"Side view upload failed: {e}")
    if result.rear_image_bytes:
        try:
            rrec2 = await save_bytes_for_user(user["id"], "renders", result.rear_image_bytes, "image/png")
            rear_file_id = str(rrec2["_id"])
        except Exception as e:
            logger.warning(f"Rear view upload failed: {e}")

    session = {
        "user_id": user["id"],
        "adapter": result.adapter,
        "adapter_label": result.adapter_label,
        "requested_adapter": requested,
        "used_fallback": used_fallback,
        "status": result.status,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "duration_ms": result.duration_ms,
        "confidence": result.confidence,
        "error": result.error,
        "notes": result.notes,
        "product_ids": input.product_ids,
        "products_snapshot": products,
        "photo_file_id": photo_file_id,
        "result_file_id": result_file_id,
        "side_file_id": side_file_id,
        "rear_file_id": rear_file_id,
        "is_favorite": False,
        "pixel_avatar_id": None,
    }
    r = await db.try_on_sessions.insert_one(session)
    session["_id"] = r.inserted_id
    return serialize_doc(session)


@api.get("/tryon/sessions")
async def list_sessions(user: dict = Depends(get_current_user)):
    docs = await db.try_on_sessions.find({"user_id": user["id"]}).sort("started_at", -1).to_list(length=100)
    return [serialize_doc(d) for d in docs]


@api.get("/tryon/sessions/{session_id}")
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    try:
        doc = await db.try_on_sessions.find_one({"_id": ObjectId(session_id), "user_id": user["id"]})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return serialize_doc(doc)


@api.delete("/tryon/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    try:
        r = await db.try_on_sessions.delete_one({"_id": ObjectId(session_id), "user_id": user["id"]})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@api.post("/tryon/sessions/{session_id}/favorite")
async def favorite_session(session_id: str, user: dict = Depends(get_current_user)):
    """Mark a try-on session as favorite AND auto-generate a pixel-art mini."""
    try:
        session = await db.try_on_sessions.find_one({
            "_id": ObjectId(session_id), "user_id": user["id"],
        })
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    if not session:
        raise HTTPException(status_code=404, detail="Not found")

    already_favorite = bool(session.get("is_favorite"))
    pixel_avatar_id = session.get("pixel_avatar_id")

    # Auto-create pixel avatar if not already generated
    if not pixel_avatar_id:
        source_file_id = session.get("result_file_id") or session.get("photo_file_id")
        if source_file_id:
            try:
                src_rec = await db.file_records.find_one({"_id": ObjectId(source_file_id)})
                if src_rec:
                    src_bytes, _ = storage_client.get_object(src_rec["storage_path"])
                    png = await asyncio.to_thread(make_pixel_avatar, src_bytes, 40, 384, 3)
                    rec = await save_bytes_for_user(user["id"], "pixels", png, "image/png")
                    now = datetime.now(timezone.utc).isoformat()
                    avatar_doc = {
                        "user_id": user["id"],
                        "session_id": session_id,
                        "file_id": str(rec["_id"]),
                        "pixel_size": 40,
                        "posterize_bits": 3,
                        "auto_generated": True,
                        "created_at": now,
                    }
                    r = await db.pixel_avatars.insert_one(avatar_doc)
                    pixel_avatar_id = str(r.inserted_id)
            except Exception as e:
                logger.warning(f"Auto pixel avatar failed: {e}")

    await db.try_on_sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {
            "is_favorite": True,
            "favorited_at": datetime.now(timezone.utc).isoformat(),
            "pixel_avatar_id": pixel_avatar_id,
        }},
    )
    updated = await db.try_on_sessions.find_one({"_id": ObjectId(session_id)})
    return {
        **serialize_doc(updated),
        "auto_pixel_created": bool(pixel_avatar_id) and not already_favorite,
    }


@api.post("/tryon/sessions/{session_id}/unfavorite")
async def unfavorite_session(session_id: str, user: dict = Depends(get_current_user)):
    try:
        r = await db.try_on_sessions.update_one(
            {"_id": ObjectId(session_id), "user_id": user["id"]},
            {"$set": {"is_favorite": False}},
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    updated = await db.try_on_sessions.find_one({"_id": ObjectId(session_id)})
    return serialize_doc(updated)


@api.get("/tryon/favorites")
async def list_favorites(user: dict = Depends(get_current_user)):
    docs = await db.try_on_sessions.find(
        {"user_id": user["id"], "is_favorite": True}
    ).sort("favorited_at", -1).to_list(length=200)
    return [serialize_doc(d) for d in docs]


# -------------------- Pixel Avatar --------------------
@api.post("/pixel-avatars")
async def create_pixel_avatar(input: PixelAvatarInput, user: dict = Depends(get_current_user)):
    """Convert a saved try-on render into a pixel-art avatar and store as a new file."""
    try:
        session = await db.try_on_sessions.find_one({
            "_id": ObjectId(input.session_id), "user_id": user["id"],
        })
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session id")
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    source_file_id = session.get("result_file_id") or session.get("photo_file_id")
    if not source_file_id:
        raise HTTPException(status_code=400, detail="Session has no rendered image")
    src_rec = await db.file_records.find_one({"_id": ObjectId(source_file_id)})
    if not src_rec:
        raise HTTPException(status_code=404, detail="Source file missing")
    src_bytes, _ = storage_client.get_object(src_rec["storage_path"])

    pixel_size = max(16, min(input.pixel_size, 128))
    posterize = max(1, min(input.posterize_bits, 8))
    png = await asyncio.to_thread(make_pixel_avatar, src_bytes, pixel_size, 384, posterize)
    rec = await save_bytes_for_user(user["id"], "pixels", png, "image/png")

    doc = {
        "user_id": user["id"],
        "session_id": input.session_id,
        "file_id": str(rec["_id"]),
        "pixel_size": pixel_size,
        "posterize_bits": posterize,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    r = await db.pixel_avatars.insert_one(doc)
    doc["_id"] = r.inserted_id
    return serialize_doc(doc)


@api.get("/pixel-avatars")
async def list_pixel_avatars(user: dict = Depends(get_current_user)):
    docs = await db.pixel_avatars.find({"user_id": user["id"]}).sort("created_at", -1).to_list(length=200)
    return [serialize_doc(d) for d in docs]


@api.delete("/pixel-avatars/{avatar_id}")
async def delete_pixel_avatar(avatar_id: str, user: dict = Depends(get_current_user)):
    try:
        doc = await db.pixel_avatars.find_one({"_id": ObjectId(avatar_id), "user_id": user["id"]})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    # Soft-delete the file record
    if doc.get("file_id"):
        try:
            await db.file_records.update_one(
                {"_id": ObjectId(doc["file_id"])},
                {"$set": {"is_deleted": True}},
            )
        except Exception:
            pass
    await db.pixel_avatars.delete_one({"_id": doc["_id"]})
    return {"ok": True}


# -------------------- Shopping Click Tracking --------------------
@api.post("/shopping/click")
async def track_click(input: ShoppingClick, request: Request):
    doc = {
        "product_id": input.product_id,
        "platform": input.platform,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    # Track user id if authenticated (optional)
    try:
        payload = await get_token_payload(request)
        doc["user_id"] = payload.get("sub")
    except HTTPException:
        pass
    await db.shopping_clicks.insert_one(doc)
    return {"ok": True}


# -------------------- Admin --------------------
@api.get("/admin/stats")
async def admin_stats(_admin: dict = Depends(require_admin)):
    users = await db.users.count_documents({"role": "user"})
    products = await db.products.count_documents({})
    tryons = await db.try_on_sessions.count_documents({})
    clicks = await db.shopping_clicks.count_documents({})
    outfits = await db.saved_outfits.count_documents({})
    # Top categories by product count
    pipe = [{"$group": {"_id": "$category", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}]
    cats_cursor = db.products.aggregate(pipe)
    categories = [{"category": d["_id"], "count": d["count"]} async for d in cats_cursor]
    return {
        "total_users": users,
        "total_products": products,
        "total_tryons": tryons,
        "total_shopping_clicks": clicks,
        "total_outfits": outfits,
        "categories": categories,
    }


@api.get("/admin/products")
async def admin_list_products(_admin: dict = Depends(require_admin), limit: int = 200):
    docs = await db.products.find({}).sort("created_at", -1).to_list(length=limit)
    return [serialize_doc(d) for d in docs]


@api.post("/admin/products")
async def admin_create_product(input: ProductInput, admin: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc).isoformat()
    doc = input.model_dump()
    doc["created_at"] = now
    doc["updated_at"] = now
    r = await db.products.insert_one(doc)
    await db.audit_logs.insert_one({
        "admin_id": admin["id"], "action": "product.create", "resource_id": str(r.inserted_id),
        "timestamp": now, "status": "success",
    })
    doc["_id"] = r.inserted_id
    return serialize_doc(doc)


@api.put("/admin/products/{product_id}")
async def admin_update_product(product_id: str, input: ProductInput, admin: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc).isoformat()
    doc = input.model_dump()
    doc["updated_at"] = now
    try:
        r = await db.products.update_one({"_id": ObjectId(product_id)}, {"$set": doc})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await db.audit_logs.insert_one({
        "admin_id": admin["id"], "action": "product.update", "resource_id": product_id,
        "timestamp": now, "status": "success",
    })
    updated = await db.products.find_one({"_id": ObjectId(product_id)})
    return serialize_doc(updated)


@api.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: str, admin: dict = Depends(require_admin)):
    try:
        r = await db.products.delete_one({"_id": ObjectId(product_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await db.audit_logs.insert_one({
        "admin_id": admin["id"], "action": "product.delete", "resource_id": product_id,
        "timestamp": datetime.now(timezone.utc).isoformat(), "status": "success",
    })
    return {"ok": True}


@api.get("/admin/users")
async def admin_users(_admin: dict = Depends(require_admin)):
    docs = await db.users.find({}, {"password_hash": 0}).to_list(length=500)
    return [serialize_doc(d) for d in docs]


@api.get("/admin/audit-logs")
async def admin_audit(_admin: dict = Depends(require_admin), limit: int = 100):
    docs = await db.audit_logs.find({}).sort("timestamp", -1).to_list(length=limit)
    return [serialize_doc(d) for d in docs]


# -------------------- Admin: Product Import Connectors --------------------
async def _persist_imported(products, admin_id: str, source: str) -> int:
    """Upsert by (source_platform + source_id) if id present, else by (name + brand)."""
    now = datetime.now(timezone.utc).isoformat()
    saved = 0
    for p in products:
        doc = {
            "name": p.name, "description": p.description, "brand": p.brand,
            "category": p.category, "subcategory": p.subcategory,
            "style": p.style, "color": p.color, "price": p.price, "currency": p.currency,
            "image_url": p.image_url, "source_platform": p.source_platform,
            "source_url": p.source_url, "source_id": p.source_id,
            "tags": p.tags, "active": True, "updated_at": now, "imported_at": now,
            "created_by_admin": admin_id,
        }
        if p.source_id:
            filt = {"source_platform": p.source_platform, "source_id": p.source_id}
        else:
            filt = {"name": p.name, "brand": p.brand}
        existing = await db.products.find_one(filt)
        if existing:
            # respect admin-corrections: skip fields flagged as admin_edited
            if not existing.get("admin_edited"):
                await db.products.update_one({"_id": existing["_id"]}, {"$set": doc})
        else:
            doc["created_at"] = now
            await db.products.insert_one(doc)
        saved += 1
    if saved:
        await db.audit_logs.insert_one({
            "admin_id": admin_id, "action": f"import.{source}", "resource_id": None,
            "timestamp": now, "status": "success", "metadata": {"count": saved},
        })
    return saved


@api.post("/admin/import/json")
async def admin_import_json(input: ImportJSONInput, admin: dict = Depends(require_admin)):
    outcome = import_json_feed(input.payload)
    saved = 0
    if input.auto_save and outcome.products:
        saved = await _persist_imported(outcome.products, admin["id"], "json_feed")
    await db.import_jobs.insert_one({
        "admin_id": admin["id"], "source": "json_feed", "status": outcome.status,
        "imported": outcome.imported, "saved": saved, "errors": outcome.errors,
        "error_samples": outcome.error_samples, "message": outcome.message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    return {
        "status": outcome.status, "imported": outcome.imported, "saved": saved,
        "errors": outcome.errors, "error_samples": outcome.error_samples,
        "message": outcome.message,
    }


@api.post("/admin/import/url")
async def admin_import_url(input: ImportURLInput, admin: dict = Depends(require_admin)):
    outcome = await asyncio.to_thread(scrape_generic_url, input.url)
    saved = 0
    if input.auto_save and outcome.products:
        saved = await _persist_imported(outcome.products, admin["id"], outcome.source)
    await db.import_jobs.insert_one({
        "admin_id": admin["id"], "source": outcome.source, "status": outcome.status,
        "url": input.url, "imported": outcome.imported, "saved": saved,
        "errors": outcome.errors, "error_samples": outcome.error_samples,
        "message": outcome.message, "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    return {
        "status": outcome.status, "source": outcome.source, "imported": outcome.imported,
        "saved": saved, "errors": outcome.errors, "error_samples": outcome.error_samples,
        "message": outcome.message,
        "products_preview": [
            {"name": p.name, "brand": p.brand, "price": p.price, "image_url": p.image_url,
             "category": p.category, "source_url": p.source_url}
            for p in outcome.products[:5]
        ],
    }


@api.get("/admin/import/jobs")
async def admin_import_jobs(_admin: dict = Depends(require_admin), limit: int = 50):
    docs = await db.import_jobs.find({}).sort("timestamp", -1).to_list(length=limit)
    return [serialize_doc(d) for d in docs]


# -------------------- Admin: Research Export --------------------
def _anon(user_id: str) -> str:
    """Deterministic anonymised user id (research-friendly)."""
    import hashlib
    return "u_" + hashlib.sha256((user_id + JWT_SECRET).encode()).hexdigest()[:12]


async def _build_export_rows() -> list[dict]:
    rows = []
    async for s in db.try_on_sessions.find({}):
        rows.append({
            "type": "tryon",
            "anon_user_id": _anon(s.get("user_id", "")),
            "adapter": s.get("adapter"),
            "status": s.get("status"),
            "duration_ms": s.get("duration_ms"),
            "confidence": s.get("confidence"),
            "used_fallback": s.get("used_fallback"),
            "product_count": len(s.get("product_ids") or []),
            "product_categories": ",".join(sorted({p.get("category", "") for p in (s.get("products_snapshot") or [])})),
            "timestamp": s.get("started_at"),
            "target_product_id": None,
            "platform": None,
        })
    async for c in db.shopping_clicks.find({}):
        rows.append({
            "type": "shopping_click",
            "anon_user_id": _anon(c.get("user_id") or "anonymous"),
            "adapter": None, "status": None, "duration_ms": None, "confidence": None,
            "used_fallback": None, "product_count": None, "product_categories": None,
            "timestamp": c.get("timestamp"),
            "target_product_id": c.get("product_id"),
            "platform": c.get("platform"),
        })
    async for o in db.saved_outfits.find({}):
        rows.append({
            "type": "saved_outfit",
            "anon_user_id": _anon(o.get("user_id", "")),
            "adapter": None, "status": None, "duration_ms": None, "confidence": None,
            "used_fallback": None,
            "product_count": len(o.get("items") or {}),
            "product_categories": ",".join(sorted((o.get("items") or {}).keys())),
            "timestamp": o.get("created_at"),
            "target_product_id": None, "platform": None,
        })
    return rows


@api.get("/admin/export")
async def admin_export(format: str = Query("json"), _admin: dict = Depends(require_admin)):
    rows = await _build_export_rows()
    if format.lower() == "csv":
        buf = _io.StringIO()
        cols = [
            "type", "anon_user_id", "timestamp", "adapter", "status", "duration_ms",
            "confidence", "used_fallback", "product_count", "product_categories",
            "target_product_id", "platform",
        ]
        w = _csv.DictWriter(buf, fieldnames=cols)
        w.writeheader()
        for r in rows: w.writerow({k: r.get(k) for k in cols})
        return PlainTextResponse(
            buf.getvalue(),
            headers={"Content-Disposition": 'attachment; filename="atelier_export.csv"'},
            media_type="text/csv",
        )
    return {"count": len(rows), "rows": rows}


# -------------------- Register routes and CORS --------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
