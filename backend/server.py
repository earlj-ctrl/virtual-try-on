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
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, status, Query
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, EmailStr, BeforeValidator

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
    await seed_admin_and_data()

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
    try:
        await db.command("ping")
        return {"database": "operational", "ai_service": "development_placeholder", "storage": "operational"}
    except Exception as e:
        return {"database": "unavailable", "error": str(e)}


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


# -------------------- Try-On (Development Placeholder Adapter) --------------------
@api.post("/tryon/generate")
async def generate_tryon(input: TryOnInput, user: dict = Depends(get_current_user)):
    """
    Development / Integration Placeholder Adapter.
    This does NOT run a real VITON-HD model. It creates a try-on session record
    that returns a composed preview using the provided user photo and selected garment(s).
    The frontend clearly labels this as a placeholder adapter.
    """
    if not input.photo_base64:
        raise HTTPException(status_code=400, detail="Photo is required")
    if not input.product_ids:
        raise HTTPException(status_code=400, detail="At least one product required")
    products = []
    for pid in input.product_ids:
        try:
            p = await db.products.find_one({"_id": ObjectId(pid)})
            if p:
                products.append(serialize_doc(p))
        except Exception:
            continue
    session = {
        "user_id": user["id"],
        "adapter": "MockDevelopmentAdapter",
        "adapter_label": "Development / Integration Placeholder",
        "status": "COMPLETED",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "duration_ms": 1200,
        "confidence": 0.62,
        "product_ids": input.product_ids,
        "products_snapshot": products,
        "user_photo": input.photo_base64,
        "notes": "This output is composed from user photo + product images. It is NOT VITON-HD.",
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


# -------------------- Register routes and CORS --------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
