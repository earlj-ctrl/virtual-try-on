# AtelierAI — Virtual Try-On Research Platform

## Original problem statement
Build a Web-Based AI Virtual Fashion Try-On System (research/thesis project) with automated product localization, fashion catalog import, wardrobe management, and admin analytics. Full-stack React + FastAPI + MongoDB. Honest AI status (No Fake AI rule), strict user privacy, modular architecture ready for VITON-HD integration, PH shopping partners (Lazada, Shopee, Zalora PH, Bench, Kultura), external redirects only — no internal checkout.

## User choices
- Auth: JWT-based custom (email/password, httpOnly cookies, 2FA-ready)
- Storage: base64-in-Mongo for MVP (documented as WARN in Admin System Health; migration to Emergent Object Storage on backlog)
- Try-On AI: Development Placeholder Adapter (MockDevelopmentAdapter) — clearly labeled
- Product Import: manual admin add (modular architecture, connectors deferred)
- First-build scope: Auth + Profile + Catalog + Try-On (mock) + Wardrobe + Basic Admin

## Personas
- **Shopper / research participant**: browses catalog, tries garments on, builds outfits, saves to wardrobe
- **Admin (single super-admin)**: manages products, monitors KPIs & service health, reviews audit logs; cannot view user photos/measurements

## Core requirements (static)
- Modular architecture (frontend / backend API / DB + storage)
- Strict privacy: user photos + measurements are owner-only
- No Fake AI — placeholder adapter clearly labeled
- No internal checkout — external partner redirects with tracked clicks
- Admin route protection enforced server-side
- Multi-language ready structure (deferred implementation)

## What's implemented (2026-02)
- **Auth**: JWT httpOnly cookies (access 24h, refresh 7d), register/login/logout/me, admin role, seed on startup (`admin@atelierai.ph` / `Admin@123`)
- **Products**: MongoDB collection with 12 seeded PH-brand items (Kultura, Bench, Penshoppe, Kashieca, etc.), filter by category + style + search
- **Wardrobe**: saved items, saved outfits, saved try-on sessions — all with `user_id` ownership checks
- **Try-On (Mock adapter)**: `/api/tryon/generate` returns composed preview with fields `adapter=MockDevelopmentAdapter`, `adapter_label`, `notes`, `confidence` (marked "not real inference")
- **Outfit Builder**: 7 slots (top/bottom/dress/jacket/shoes/jewelry/accessory), running total, save-as-outfit
- **Admin console**: KPIs, service health, catalog breakdown, product CRUD dialog, users listing (no private data), audit logs
- **Shopping click tracking**: `/api/shopping/click` records aggregate events; product detail routes to Lazada/Shopee/Zalora PH with `rel="noopener noreferrer"`
- **Theme**: light/dark, class-based, persisted in localStorage (`atelier-theme`)
- **Design system**: Playfair Display serif + Plus Jakarta Sans body + JetBrains Mono; obsidian & champagne palette; grain overlay accent; bento grid hero

## Backlog (prioritized)
- **P0**: Migrate user photos to Emergent Object Storage (currently base64 in Mongo)
- **P1**: Product import connectors (Lazada/Shopee product feeds), pixel/emoticon feature, forgot/reset password flow
- **P1**: 2FA (structure exists, TOTP not wired), brute-force lockout
- **P2**: Multi-view / 360° approximation viewer, product localization match confidence UI, analytics charts (Recharts), CSV/JSON export for research data, multi-language (i18n)
- **P2**: Real VITON-HD adapter (swap `MockDevelopmentAdapter` → `VitonHDAdapter`)

## Test credentials
See `/app/memory/test_credentials.md`

## API endpoints (summary)
- `POST /api/auth/{register,login,logout}`, `GET /api/auth/me`, `PUT /api/auth/profile`
- `GET /api/products`, `GET /api/products/{id}`
- `GET/POST/DELETE /api/wardrobe/items`, `/api/wardrobe/outfits`
- `POST /api/tryon/generate`, `GET/DELETE /api/tryon/sessions[/{id}]`
- `POST /api/shopping/click`
- Admin: `/api/admin/{stats,products,users,audit-logs}` (403 for non-admin)
