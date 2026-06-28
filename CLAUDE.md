# assam.org — CLAUDE.md

Project context and history for AI-assisted development.

---

## What this is

**assam.org** is a Node.js/Express news and information portal about Assam, India.
Forked from `assamtimes-app` (port 3002). Runs on **port 3004**.

- **Live URL:** https://ww2.assam.org (staging) / https://www.assam.org (production)
- **App root:** `/home/assam/web/assam.org/private/app/`
- **Public HTML:** `/home/assam/web/assam.org/public_html/`
- **PM2 process name:** `assam-org`
- **Stack:** Node.js + Express 5 + EJS templates + PostgreSQL
- **Do NOT touch:** port 3000 (GDM) or port 3002 (assamtimes)

---

## Brand

| Key | Value |
|---|---|
| Site name | Assam Portal |
| Tagline | Gateway to Assam |
| Primary color | `#2D6A4F` (forest green) |
| Hover/dark shade | `#1d5238` |
| Old color (replaced) | `#FF6600` orange — from assamtimes fork |
| Logo | Text-based: `assam<strong>.org</strong>` — no image yet |

---

## Database

| Key | Value |
|---|---|
| Engine | PostgreSQL 14 |
| Database | `assam_db` |
| User | `assam_user` |
| Password | `golaghat1` (also in `.env`) |
| Host | `localhost:5432` |

### Tables

| Table | Rows | Notes |
|---|---|---|
| `articles` | 544 | Migrated from D9 `story` nodes |
| `pages` | 101 | Migrated from D9 `page` nodes |
| `authors` | 3,629 | Migrated from D9 `users_field_data` |
| `menu_items` | 3 | Home + 2 inactive placeholders |
| `session` | — | Created by `connect-pg-simple` on first run |
| `site_settings` | 1 | Singleton: `footer_html`, `featured_category` |

### All categories are NULL

D9 content had no category taxonomy migrated. The `category` column on `articles` is empty for all 544 rows. Use admin to assign categories. The homepage uses hardcoded portal topic pills in the meantime.

### Connect

```bash
PGPASSWORD=golaghat1 psql -U assam_user -d assam_db -h localhost
```

---

## Migration — D9 MySQL → PostgreSQL

### Source

- MySQL DB: `assam_db1`, user: `assam_db1`
- Password: `A212312JJHHg-gghssGHGF6777a`
- Dump: `/home/assam/web/assam.org/private/migration/db.sql`

### Scripts

- Runnable: `/home/assam/web/assam.org/private/migration/migrate-assam.js` (has `node_modules/`)
- Git copy: `scripts/migrate-assam.js`

### Key migration decisions

- D9 URL aliases were `/news/slug` — migration now strips `/news/` prefix (and `pages|content|story|node`). Leading/trailing dashes also stripped.
- All 544 article slugs had `-news-` prefix bug (fixed with DB UPDATE, and fixed in script).
- Article slugs: `{alias}-{nid}` e.g. `rongaali-bihu-celebrations-uae-1234`
- Body HTML: `/sites/assam.org/files/` → `/uploads/legacy/` (rewritten during migration)
- Absolute `http://assam.org/...` body URLs → relative `/...` (fixed with DB UPDATE on 1 article)
- `featured_image` column is NULL for all migrated articles (D9 didn't export this separately)

### Migrations applied (in order)

```
001_add_author_password_hash.sql
002_add_search_vector.sql
003_create_pages_table.sql          ← table already existed, skipped
004_create_menu_items_table.sql
005_create_site_settings_table.sql
006_add_featured_category_to_site_settings.sql
007_add_likes_count_to_articles.sql
008_gallery_images_to_jsonb.sql     ← adapted: no TEXT[] to migrate, added JSONB directly
009_add_featured_image_caption.sql
010_add_media_columns_to_articles.sql  ← video_url, audio_file, pdf_file
```

Run pending migrations:
```bash
PGPASSWORD=golaghat1 psql -U assam_user -d assam_db -h localhost -f migrations/NNN_name.sql
```

---

## Running the app

```bash
# Start
pm2 start ecosystem.config.js

# Reload after code changes (zero-downtime)
pm2 reload assam-org

# Restart (full stop/start)
pm2 restart assam-org

# Logs
pm2 logs assam-org --lines 50 --nostream

# Status
pm2 status
```

Dev mode (foreground, auto-restart on changes):
```bash
npm run dev
```

---

## Static file serving

All served by Express static middleware in `server.js`:

| URL prefix | Filesystem path |
|---|---|
| `/uploads/articles` | `public_html/uploads/articles/` |
| `/uploads/audio` | `public_html/uploads/audio/` |
| `/uploads/documents` | `public_html/uploads/documents/` |
| `/uploads/defaults` | `public_html/uploads/defaults/` |
| `/uploads/branding` | `public_html/uploads/branding/` |
| `/uploads/authors` | `public_html/uploads/authors/` |
| `/uploads/legacy` | `public_html/uploads/legacy/` ← D9 migrated images |
| `/sites/assam.org/files` | `public_html/sites/assam.org/files/` ← D9 originals (fallback) |

### Default images (generated with ImageMagick)

- `/uploads/defaults/at-news.png` — article placeholder (800×450, green `#2D6A4F`)
- `/uploads/defaults/avatar.png` — author avatar placeholder
- `/uploads/branding/logo.jpg` — placeholder logo (200×60, green)

These are placeholders. Replace with real assets when available.

### Legacy image paths

D9 articles reference `/pimages/` and `/images/` paths (Drupal 6 era) — those files are gone, not recoverable.

---

## Homepage layout (portal style)

`views/public/home.ejs` — four sections:

1. **Hero** — full-width latest article with gradient overlay
2. **Two-column** — 2×3 latest stories (left 65%) + On This Day + Most Read top-3 (right sidebar)
3. **Browse Topics** — 16 hardcoded category pill links
4. **In Depth** — latest 3 published pages as bordered cards

Controller: `src/controllers/publicController.js` → `home()`
Data: `lead`, `grid` (6 articles), `mostViewed` (3), `onThisDay` (4), `latestPages` (3)

---

## Key files

```
app/
├── server.js                         Entry point, static mounts, session
├── ecosystem.config.js               PM2 config (name: assam-org, port: 3004)
├── .env                              Secrets — not in git
├── src/
│   ├── config/
│   │   ├── db.js                     pg Pool
│   │   └── validateEnv.js            Required env vars check
│   ├── controllers/
│   │   ├── publicController.js       Public pages logic
│   │   └── adminController.js        Admin CRUD
│   ├── models/
│   │   ├── articles.js               getLatestPublished, getOnThisDay, getMostViewed, getBySlug, …
│   │   ├── pages.js                  getBySlug, getLatestPublished, …
│   │   ├── authors.js
│   │   ├── menuItems.js
│   │   └── siteSettings.js
│   ├── routes/
│   │   ├── public.js                 /, /news, /article/:slug, /category/:cat, /search, /page/:slug
│   │   └── admin.js                  /admin/…
│   └── middleware/
│       ├── redirects.js              Old Drupal URL fallback
│       └── errorHandler.js
├── views/
│   ├── layout.ejs                    Shell — GA conditional on GA4_MEASUREMENT_ID env var
│   ├── partials/
│   │   ├── header.ejs                Text logo: assam<strong>.org</strong>
│   │   ├── footer.ejs                Assam Portal branding
│   │   └── sidebar-*.ejs
│   └── public/
│       ├── home.ejs                  Portal homepage (4 sections)
│       ├── article.ejs
│       ├── news.ejs
│       ├── category.ejs
│       ├── page.ejs
│       ├── author.ejs
│       └── search.ejs
├── public/
│   ├── css/
│   │   ├── style.css                 Public styles — brand green #2D6A4F
│   │   └── admin.css
│   └── js/
│       └── header.js                 Mobile menu toggle
├── migrations/                       SQL migration files (001–010)
└── scripts/
    ├── migrate-assam.js              D9 → PostgreSQL migration script (git copy)
    └── set-admin-password.js         Set /admin login password
```

---

## Environment variables (.env)

```
PORT=3004
NODE_ENV=production
SITE_NAME=Assam Portal
SITE_TAGLINE=Gateway to Assam
SITE_URL=https://www.assam.org
SITE_EMAIL=webmaster@assam.org
SITE_BRAND_COLOR=#2D6A4F
DB_HOST=localhost
DB_PORT=5432
DB_NAME=assam_db
DB_USER=assam_user
DB_PASSWORD=golaghat1
SESSION_SECRET=<generated 96-char hex>
UPLOADS_ARTICLES_DIR=…/public_html/uploads/articles
UPLOADS_AUDIO_DIR=…/public_html/uploads/audio
UPLOADS_DOCUMENTS_DIR=…/public_html/uploads/documents
UPLOADS_DEFAULTS_DIR=…/public_html/uploads/defaults
UPLOADS_BRANDING_DIR=…/public_html/uploads/branding
UPLOADS_AUTHORS_DIR=…/public_html/uploads/authors
UPLOADS_LEGACY_DIR=…/public_html/uploads/legacy
D9_FILES_DIR=…/public_html/sites/assam.org/files
ADSENSE_ENABLED=false
TWITTER_ENABLED=false
VAPID_CONTACT_EMAIL=mailto:webmaster@assam.org
# Not yet set (add when ready):
# GA4_MEASUREMENT_ID=
# SENDPULSE_API_USER_ID=
# SENDPULSE_API_SECRET=
# SENDPULSE_LIST_ID=
# ADSENSE_CLIENT_ID=
# VAPID_PUBLIC_KEY=
# VAPID_PRIVATE_KEY=
# CF_API_TOKEN=
# CF_ZONE_ID=
# HCAPTCHA_SITE_KEY=
# HCAPTCHA_SECRET_KEY=
```

---

## Known issues / TODO

- [ ] All article `featured_image` values are NULL — homepage hero and cards use placeholder
- [ ] All article `category` values are NULL — assign via admin, then category pages will work
- [ ] `/pimages/` and `/images/` body image paths are broken (D6-era files, gone)
- [ ] Logo is a green ImageMagick placeholder — replace with real SVG/PNG
- [ ] Admin password not set — run `node scripts/set-admin-password.js`
- [ ] VAPID keys not generated — run `npx web-push generate-vapid-keys` and add to `.env`
- [ ] Menu items (About Us, Contact) are inactive — create pages in /admin/pages, then link in /admin/menu
- [ ] Google Analytics — add `GA4_MEASUREMENT_ID` to `.env` when assam.org GA property is ready
- [ ] Copy legacy images that exist on disk: `cp -r public_html/sites/assam.org/files/ public_html/uploads/legacy/` (already done)

---

## Git

Repo is at `/home/assam/web/assam.org/private/app/` (only this directory, not the parent).

```bash
git log --oneline -10
git status
git add <files> && git commit -m "message"
```

Commit history:
```
initial: fork from assamtimes-app for assam.org
assam.org migration: D9 stories+pages → PostgreSQL
configure assam-org for port 3004, rename from assamtimes fork
fix image paths: serve D9 legacy files, fix body image URLs
fix image paths: serve D9 legacy files, fix body image URLs   ← slug -news- fix + placeholders
fix missing DB columns and branding: video_url, audio_file, pdf_file, logo
assam portal: green theme, portal homepage, text logo, D9 categories in nav
```
