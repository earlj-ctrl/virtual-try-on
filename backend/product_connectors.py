"""Product source connectors.

Per PDF: modular interface, connectors replaceable. Every connector reports
its status honestly — no fabricated success.

Included:
- JSONFeedConnector: paste a JSON list of products.
- CSVFeedConnector: upload a CSV file.
- LazadaConnector / ShopeeConnector: best-effort HTML scrape via httpx + BS4
  parsing JSON-LD product schema. Both sites are JS-heavy and anti-bot; expect
  frequent failures. The connectors report failures with an explicit status.
"""
from __future__ import annotations
import csv
import io
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Optional

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("atelier-ai.connectors")

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


@dataclass
class NormalizedProduct:
    name: str
    image_url: str
    category: str = "top"
    brand: str = ""
    description: str = ""
    price: float = 0.0
    currency: str = "PHP"
    source_platform: str = "manual"
    source_url: Optional[str] = None
    source_id: Optional[str] = None
    style: list = field(default_factory=list)
    tags: list = field(default_factory=list)
    color: Optional[str] = None
    subcategory: Optional[str] = None


@dataclass
class ImportOutcome:
    source: str
    imported: int = 0
    updated: int = 0
    skipped: int = 0
    duplicates: int = 0
    errors: int = 0
    error_samples: list = field(default_factory=list)
    products: list[NormalizedProduct] = field(default_factory=list)
    status: str = "success"  # success | partial | failed
    message: str = ""


def _guess_category(text: str) -> str:
    t = (text or "").lower()
    if any(w in t for w in ["dress", "gown", "terno"]): return "dress"
    if any(w in t for w in ["jacket", "blazer", "coat", "outerwear"]): return "jacket"
    if any(w in t for w in ["jeans", "pants", "trouser", "short", "skirt"]): return "bottom"
    if any(w in t for w in ["shoe", "sneaker", "boot", "heel", "loafer"]): return "shoes"
    if any(w in t for w in ["ring", "necklace", "earring", "bracelet", "pendant"]): return "jewelry"
    if any(w in t for w in ["bag", "belt", "hat", "watch", "sunglass"]): return "accessory"
    return "top"


# -------------------- Manual feeds --------------------
def import_json_feed(payload: str) -> ImportOutcome:
    out = ImportOutcome(source="json_feed")
    try:
        data = json.loads(payload)
        if not isinstance(data, list):
            out.status = "failed"; out.message = "Expected a JSON array of products"; return out
    except Exception as e:
        out.status = "failed"; out.message = f"Invalid JSON: {e}"; return out

    for i, row in enumerate(data):
        try:
            p = NormalizedProduct(
                name=str(row["name"]),
                image_url=str(row["image_url"]),
                category=str(row.get("category") or _guess_category(row.get("name", ""))),
                brand=str(row.get("brand", "")),
                description=str(row.get("description", "")),
                price=float(row.get("price", 0) or 0),
                currency=str(row.get("currency", "PHP")),
                source_platform=str(row.get("source_platform", "json_feed")),
                source_url=row.get("source_url"),
                source_id=row.get("source_id"),
                style=list(row.get("style", []) or []),
                tags=list(row.get("tags", []) or []),
                color=row.get("color"),
                subcategory=row.get("subcategory"),
            )
            out.products.append(p)
            out.imported += 1
        except KeyError as e:
            out.errors += 1
            out.error_samples.append(f"row {i}: missing {e}")
        except Exception as e:
            out.errors += 1
            out.error_samples.append(f"row {i}: {e}")

    if out.errors and out.imported:
        out.status = "partial"
    elif out.errors and not out.imported:
        out.status = "failed"
    out.message = f"Parsed {out.imported} products, {out.errors} errors"
    return out


def import_csv_feed(payload: str) -> ImportOutcome:
    out = ImportOutcome(source="csv_feed")
    try:
        reader = csv.DictReader(io.StringIO(payload))
        for i, row in enumerate(reader):
            try:
                p = NormalizedProduct(
                    name=row["name"],
                    image_url=row["image_url"],
                    category=row.get("category") or _guess_category(row.get("name", "")),
                    brand=row.get("brand", ""),
                    description=row.get("description", ""),
                    price=float(row.get("price", 0) or 0),
                    currency=row.get("currency", "PHP") or "PHP",
                    source_platform=row.get("source_platform", "csv_feed"),
                    source_url=row.get("source_url") or None,
                    source_id=row.get("source_id") or None,
                    style=[s.strip() for s in (row.get("style", "") or "").split(",") if s.strip()],
                    tags=[t.strip() for t in (row.get("tags", "") or "").split(",") if t.strip()],
                    color=row.get("color") or None,
                    subcategory=row.get("subcategory") or None,
                )
                out.products.append(p); out.imported += 1
            except KeyError as e:
                out.errors += 1; out.error_samples.append(f"row {i}: missing {e}")
            except Exception as e:
                out.errors += 1; out.error_samples.append(f"row {i}: {e}")
    except Exception as e:
        out.status = "failed"; out.message = f"CSV parse error: {e}"; return out

    if out.errors and out.imported: out.status = "partial"
    elif out.errors and not out.imported: out.status = "failed"
    out.message = f"Parsed {out.imported} products, {out.errors} errors"
    return out


# -------------------- Web scraper (best-effort) --------------------
def _fetch(url: str) -> str:
    with httpx.Client(headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"},
                      timeout=20, follow_redirects=True) as c:
        r = c.get(url)
        r.raise_for_status()
        return r.text


def _extract_ldjson_products(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    products = []
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or "{}")
        except Exception:
            continue
        for obj in (data if isinstance(data, list) else [data]):
            if not isinstance(obj, dict):
                continue
            t = obj.get("@type")
            if (t == "Product") or (isinstance(t, list) and "Product" in t):
                products.append(obj)
    return products


def _price_from_offer(offer) -> tuple[float, str]:
    if isinstance(offer, list):
        offer = offer[0] if offer else {}
    if not isinstance(offer, dict): return 0.0, "PHP"
    price = offer.get("price") or offer.get("lowPrice") or 0
    try: price_f = float(price)
    except Exception: price_f = 0.0
    return price_f, offer.get("priceCurrency", "PHP") or "PHP"


def _scrape_generic(url: str, platform: str) -> ImportOutcome:
    out = ImportOutcome(source=platform)
    try:
        html = _fetch(url)
    except Exception as e:
        out.status = "failed"
        out.message = f"HTTP fetch failed: {e}. {platform} blocks non-JS/bots aggressively."
        out.errors = 1
        out.error_samples.append(str(e)[:300])
        return out

    ldjson = _extract_ldjson_products(html)
    if not ldjson:
        # Try meta tags fallback (og:*)
        soup = BeautifulSoup(html, "lxml")
        og_image = soup.find("meta", property="og:image")
        og_title = soup.find("meta", property="og:title")
        if og_image and og_title:
            out.products.append(NormalizedProduct(
                name=og_title.get("content", "Unknown"),
                image_url=og_image.get("content", ""),
                category=_guess_category(og_title.get("content", "")),
                source_platform=platform,
                source_url=url,
            ))
            out.imported = 1
            out.status = "partial"
            out.message = f"No JSON-LD found. Extracted only OG meta from {platform}."
            return out
        out.status = "failed"
        out.errors = 1
        out.message = (
            f"{platform} returned HTML without JSON-LD schema. This site loads product data "
            "via JavaScript, which basic scraping cannot access. Consider using their "
            "official partner/affiliate API."
        )
        return out

    for obj in ldjson:
        try:
            price, currency = _price_from_offer(obj.get("offers"))
            img = obj.get("image")
            if isinstance(img, list): img = img[0] if img else ""
            name = obj.get("name") or "Unknown"
            out.products.append(NormalizedProduct(
                name=str(name),
                image_url=str(img or ""),
                category=_guess_category(str(name) + " " + str(obj.get("category", ""))),
                brand=str((obj.get("brand") or {}).get("name") if isinstance(obj.get("brand"), dict) else obj.get("brand") or ""),
                description=str(obj.get("description", ""))[:500],
                price=price,
                currency=currency,
                source_platform=platform,
                source_url=url,
                source_id=str(obj.get("sku") or obj.get("productID") or ""),
            ))
            out.imported += 1
        except Exception as e:
            out.errors += 1
            out.error_samples.append(str(e)[:200])

    out.status = "success" if out.imported and not out.errors else ("partial" if out.imported else "failed")
    out.message = f"Extracted {out.imported} products from {platform} JSON-LD"
    return out


def scrape_lazada(url: str) -> ImportOutcome:
    if "lazada.com" not in url:
        out = ImportOutcome(source="lazada", status="failed", message="URL is not a lazada.com URL")
        return out
    return _scrape_generic(url, "lazada")


def scrape_shopee(url: str) -> ImportOutcome:
    if "shopee." not in url:
        out = ImportOutcome(source="shopee", status="failed", message="URL is not a shopee URL")
        return out
    return _scrape_generic(url, "shopee")


def scrape_generic_url(url: str) -> ImportOutcome:
    """Try to detect and use the correct connector."""
    if "lazada." in url: return scrape_lazada(url)
    if "shopee." in url: return scrape_shopee(url)
    return _scrape_generic(url, "generic")
