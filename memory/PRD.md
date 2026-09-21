# AtelierAI — Virtual Try-On Research Platform

## Original problem statement
Web-Based AI Virtual Fashion Try-On (research/thesis project) with automated product localisation, catalog import, wardrobe management, and admin analytics. Strict user privacy, honest AI status (No Fake AI), modular architecture ready for VITON-HD integration, PH shopping partners, external redirects only.

## User choices
- Auth: JWT-based custom (email/password, httpOnly cookies, 2FA-ready)
- Storage: **Emergent Object Storage** (private, owner-only access via /api/files/{id})
- Try-On AI: **HF IDM-VTON (free)** via gradio_client + Mock fallback
- Product Import: **Best-effort scraper** (JSON-LD) + JSON feed; failures reported honestly
- Research Export: CSV/JSON with anonymised user IDs (SHA-256 pseudonyms)

## Personas
- **Shopper / research participant**: browses catalog, tries garments on, builds outfits, saves to wardrobe
- **Admin (single super-admin)**: manages products, imports feeds, monitors KPIs & service health, exports research data; cannot view user photos/measurements

## Core requirements (static)
- Modular architecture (frontend / backend API / DB + storage)
- Strict privacy: user photos + measurements are owner-only, admin cannot access other users' files (server-enforced)
- No Fake AI — placeholder adapter clearly labelled; fallback banner surfaces truthfully
- No fabricated import success — every job records true status
- No internal checkout — external partner redirects with tracked clicks
- Admin route protection enforced server-side

## What's implemented
### 2026-02 (iteration 4)
- **Emergent Google Sign-In** alongside existing JWT auth:
  - Backend `/api/auth/google/callback` exchanges Emergent Auth `session_id` server-side, finds-or-creates user by email, sets `google_id`/`avatar_url`/`auth_provider=google`, then issues the **same JWT cookies** used by email auth (existing `get_current_user` works unchanged)
  - Frontend: `AppRouter` intercepts `#session_id=` synchronously (uses `useLocation().hash`, not `window.location.hash`), routes to `<AuthCallback />` with `useRef` guard; `AuthContext` skips `/auth/me` when callback is in progress
  - `GoogleSignInButton` on Login & Signup redirects to `https://auth.emergentagent.com/?redirect={window.location.origin}/catalog` — redirect URL derived from browser location, NOT hardcoded
  - Users created via Google get a random unusable password hash so email-login can't accidentally succeed for them

### 2026-02 (iteration 3)
- **Pixel Avatar**: `/api/pixel-avatars` — Pillow-based pixelator (downscale-LANCZOS → posterise → upscale-NEAREST); stored as private file `kind=pixels`; UI action on every Try-On session card + dedicated Wardrobe tab with Save (download PNG) + Share (Web Share API fallback to download)
- **Password Reset**: `/api/auth/forgot-password` + `/api/auth/reset-password` — bcrypt hashed, single-use tokens with TTL index (60 min); Resend-managed email via `email_service.send_email` (with G1–G5 gate); reset URL also logged to backend log as a fallback. Front-end: `/forgot-password` + `/reset-password` pages, "Forgot password?" link on Login
- **Email service**: `email_service.py` implements full Emergent Resend integration playbook — safety-gated HTML template, non-blocking `httpx.AsyncClient`, sender `AtelierAI` display name

### 2026-02 (iteration 2)
- **Emergent Object Storage**: user photos + try-on renders uploaded via `storage_client.py`; ownership checks on `/api/files/{id}`; frontend uses `PrivateImage` blob-URL pattern (no auth in URL)
- **Real Try-On adapter**: `HFIDMVTONAdapter` calls free HuggingFace Space `yisol/IDM-VTON` via gradio_client; graceful fallback to `MockDevelopmentAdapter` on failure with `used_fallback=true` banner
- **Product Import**:
  - `POST /api/admin/import/json` — validates & upserts, honours `admin_edited` flag
  - `POST /api/admin/import/url` — best-effort scrape via `httpx + BeautifulSoup` extracting JSON-LD Product schema; falls back to OG meta
  - `LazadaConnector` / `ShopeeConnector` route to generic scraper; both surface honest failure with actionable message
  - `import_jobs` collection logs every attempt; UI shows in Admin Import page
- **Research Export**: `/api/admin/export?format={json|csv}` — anonymised rows (try-ons, saved outfits, shopping clicks) using `_anon(user_id) = SHA256(user_id + JWT_SECRET)`; NEVER exports raw ids, photos, or measurements
- **Admin console**: navigation extended with Import + Research Export

### 2026-02 (iteration 1)
- **Auth**: JWT httpOnly cookies (access 24h, refresh 7d), register/login/logout/me, admin role, seed on startup
- **Products**: 12 PH-brand seeded items, filter by category/style/search
- **Wardrobe**: saved items, saved outfits, saved try-on sessions — all with `user_id` ownership checks
- **Outfit Builder**: 7 slots, running total, save-as-outfit
- **Admin console**: KPIs, service health, catalog breakdown, product CRUD, users listing, audit logs
- **Shopping click tracking**: aggregate events; product detail redirects to Lazada/Shopee/Zalora PH
- **Theme**: light/dark, class-based, persisted
- **Design system**: Playfair Display + Plus Jakarta Sans + JetBrains Mono; obsidian & champagne palette

## Test result (iteration 2)
Backend 16/16 pytest pass · Frontend 100% pass · No blocking issues · Auto-testing summary at `/app/test_reports/iteration_2.json`

## Backlog (prioritized)
- **P1**: 2FA (TOTP), forgot/reset password flow, brute-force lockout hardening
- **P1**: Refactor `server.py` (947 lines) into `auth_routes.py`, `admin_routes.py`, `tryon_routes.py`
- **P2**: Wrap blocking storage calls in `asyncio.to_thread`; add `asyncio.wait_for` timeout on HF adapter
- **P2**: Multi-view / 360° approximation viewer, product localisation match confidence UI
- **P2**: Pixel/emoticon feature, analytics charts (Recharts), multi-language (i18n)
- **P3**: Real VITON-HD self-host adapter (swap `HFIDMVTONAdapter` → `VitonHDAdapter` when GPU server provisioned)

## Test credentials
See `/app/memory/test_credentials.md`
