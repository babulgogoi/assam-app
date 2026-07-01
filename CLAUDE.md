# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project

**assam.org** — Node.js/Express news portal about Assam, India. Forked from `assamtimes-app`.

- **Port:** 3004. PM2 name: `assam-org`. **Never touch port 3000 (GDM) or 3002 (assamtimes).**
- **Stack:** Node.js + Express 5 + EJS + PostgreSQL 14 + connect-pg-simple sessions
- **Public root:** `/home/assam/web/assam.org/public_html/`
- **Brand:** Assam Portal — Gateway to Assam. Primary `#1A00AC`, dark `#130082`, secondary `#6B5CE0`, tint bg `#F0EEFB`, tint border `#D9D4F5`.

---

## Commands

```bash
# Development (nodemon, foreground)
npm run dev

# Production via PM2
pm2 start ecosystem.config.js   # first start
pm2 reload assam-org             # zero-downtime reload after code changes
pm2 restart assam-org            # full restart
pm2 logs assam-org --lines 50 --nostream

# Run a migration
PGPASSWORD=golaghat1 psql -U assam_user -d assam_db -h localhost -f migrations/NNN_name.sql

# DB shell
PGPASSWORD=golaghat1 psql -U assam_user -d assam_db -h localhost

# Create first superadmin
node scripts/create-superadmin.js

# Backfill scripts — use NODE_PATH to merge migration mysql2 with app pg:
NODE_PATH=/home/assam/web/assam.org/private/migration/node_modules:/home/assam/web/assam.org/private/app/node_modules \
  node scripts/backfill-d9-dates.js
```

No test runner or linter is configured.

---

## Architecture

### Request flow

```
server.js
  → express-session (PostgreSQL store, table: session)
  → public routes  (src/routes/public.js)   — no auth
  → admin routes   (src/routes/admin.js)    — requireAdmin middleware gate
```

**Public routes** (`/`, `/news`, `/article/:slug`, `/category/:cat`, `/search`, `/page/:slug`, `/page/:slug/revisions`, `/research`, `/research/:topicSlug`, `/books`, `/book/:slug`, `/author/:username`) are handled by `src/controllers/publicController.js` and `src/controllers/publicBooksController.js`. Every public request loads `menuItems` and `footerHtml` from the DB via a router-level middleware.

**Admin routes** all live under `/admin`. After login the session stores `req.session.adminUser` (id, username, displayName, roles, permissions, isSuperAdmin). The `requireAdmin` middleware in `src/middleware/roleAuth.js` guards the entire admin subtree. Individual routes additionally use `requirePermission(module, action)` for write operations.

### Multi-role admin auth

Admin users are in `admin_users` (separate from the `authors` table, which holds 3,629 D9 byline authors). Roles and permissions live in `admin_roles`, `admin_permissions`, `admin_user_roles`.

Modules: `stories`, `pages`, `books`, `authors`, `comments`, `settings`, `users`.  
Built-in roles: `superadmin`, `editor`, `stories_editor`, `pages_editor`, `books_editor`, `contributor`.

`requirePermission('stories', 'can_update')` returns an async middleware that checks `admin_user_roles → admin_permissions`. Superadmin bypasses all checks. `own_only` flag is set on `req.ownOnly` for controllers to filter accordingly.

**Slug field security:** Only superadmins can see or edit slug fields in admin forms (pages, articles, books, authors, publishers). Non-superadmins get a hidden input preserving the existing slug. Enforced server-side in all relevant controllers — `buildPageData()`, `buildArticleData()`, and the three book update handlers all check `req.session.adminUser.isSuperAdmin` before accepting a new slug.

### Data layer

All DB access goes through model files in `src/models/`. Models export plain async functions — no ORM, raw `pg` pool queries. The pool is a singleton in `src/config/db.js`.

Key model methods to know:
- `articles.getLatestPublished`, `articles.getOnThisDay`, `articles.getMostViewed`, `articles.getBySlug`
- `pages.getLatestPublished`, `pages.getBySlug`, `pages.getById`, `pages.getAllForAdmin`, `pages.listTopicsAdmin`
- `adminUsers.getByUsername`, `adminUsers.create`, `adminUsers.update`, `adminUsers.listWithRoles`
- `books.*` — full CRUD + author/publisher/category relations in `src/models/books.js`

### Views

EJS with `express-ejs-layouts`. Public pages use `views/layout.ejs` (the shell). Admin pages set `res.locals.layout = 'admin/layout'` per-handler. The admin layout gets `adminUser` from `res.locals` (set by the `setAdminLocals` middleware in `src/routes/admin.js`).

### Static files / uploads

All upload directories are outside the app root at `public_html/uploads/`. Each directory is mounted as a separate `express.static` route configured via `.env`. `/uploads/legacy` serves migrated D9 images. `/sites/assam.org/files` is a fallback for unrewritten D9 body paths. `/uploads/pdfs` serves PDF attachments for research pages.

---

## Database

| Table | Notes |
|---|---|
| `articles` | 544 migrated from D9. `category` and `featured_image` are NULL for all. Slugs: `{alias}-{nid}`. Has `d9_created_at`, `d9_updated_at` (backfilled from D9 MySQL). |
| `pages` | 101 migrated from D9. Research-style wiki pages. Has `topic_id`, `pdf_attachment`, `pdf_label`, `update_needed`, `update_needed_note`, `editors_note`, `d9_created_at`, `d9_updated_at`. |
| `page_topics` | Research page topic taxonomy (icon, name, slug, description). |
| `page_history` | Revision log for pages — auto-written on every save via `logHistory()`. Columns: `page_id`, `admin_user_id`, `editor_name`, `action`, `editor_note`, `body_snapshot_hash`, `word_count_before`, `word_count_after`. Action types: `created`, `edited`, `reviewed`, `update_needed_flagged`. |
| `authors` | 3,629 D9 users — byline only, not admin login |
| `admin_users` | Admin panel logins (separate from authors) |
| `admin_roles` / `admin_permissions` / `admin_user_roles` | RBAC tables |
| `books` | Books catalogue. Has cover image variants (-sm, -md), `d9_created_at`/`d9_updated_at` if migrated. |
| `book_authors` | Authors for the books catalogue (not the same as `authors`) |
| `book_publishers` | Publishers |
| `book_categories` / `book_category_map` | Category taxonomy for books |
| `menu_items` | 3 rows: Home active, About/Contact inactive |
| `site_settings` | Singleton row: `footer_html`, `featured_category`, `publish_custom_html`, `publish_custom_html_enabled` |
| `session` | Created by connect-pg-simple on first run |

**All article `category` values are NULL** — D9 had no category taxonomy migrated. Assign via admin. Homepage uses hardcoded topic pills.

### `PAGE_SELECT` (pages model)

The shared SELECT in `src/models/pages.js` explicitly lists columns — remember to add new columns here when altering the `pages` table, otherwise they won't appear in public or admin views:

```sql
SELECT p.id, p.slug, p.title, p.body, p.status,
       p.excerpt, p.featured_image, p.featured_image_caption,
       p.references_text, p.tags, p.topic_id, p.author_id,
       p.pdf_attachment, p.pdf_label,
       p.update_needed, p.update_needed_note,
       p.editors_note,
       p.d9_created_at, p.d9_updated_at,
       p.created_at, p.updated_at,
       pt.name AS topic_name, pt.slug AS topic_slug, pt.icon AS topic_icon,
       a.display_name AS author_name, a.username AS author_username
FROM pages p
LEFT JOIN page_topics pt ON pt.id = p.topic_id
LEFT JOIN authors a ON a.id = p.author_id
```

---

## Migration history

Migrations in `migrations/` are numbered `001`–`021`. Applied sequentially.

- 008: `gallery_images` added as JSONB (articles had no TEXT[] to convert).
- 020: Adds `update_needed`, `update_needed_note` to `pages`.
- 021: Creates `page_history` table; adds `editors_note` to `pages`; adds `admin_user_id` column to `page_history`.

All 544 article slugs had a `-news-` prefix bug (D9 aliases were `/news/slug`); fixed in DB and in `scripts/migrate-assam.js`.

D9 original dates backfilled: `scripts/backfill-d9-dates.js` reads `node_field_data` from `assam_db1` MySQL and writes `d9_created_at`/`d9_updated_at` to both `pages` and `articles`. 100% match rate (101 pages, 544 articles).

---

## Research pages system

Research pages are wiki-style articles managed under `/admin/pages`. Key behaviours:

- **TOC** — injected by JS (`page.ejs`) before the first `<h2>`, floats right, content wraps beside it. `h2` inside `.wiki-page__body` does NOT have `clear: both`. Clearfix is via `::after` on the body container.
- **Revisions tab** — public `/page/:slug/revisions` shows D9 original dates (`d9_created_at`/`d9_updated_at`) with fallback to `created_at`/`updated_at`. Admin `/admin/pages/:id/revisions` shows full history with editor names.
- **History logging** — `logHistory()` in `adminPagesController.js` runs on every save. Compares MD5 hash of old vs new body; skips entry if body unchanged AND no editor note.
- **Editor's Note** — persistent note on the page (stored in `pages.editors_note`), shown in amber box in admin form and on the public Revisions tab.
- **Revision Note** — per-save note stored in `page_history.editor_note`, not on the page itself.
- **Update Needed flag** — `update_needed` + `update_needed_note` on pages; shows ⚠️ in admin list and a notice on public Revisions tab.
- **PDF attachment** — uploaded via multer `memoryStorage`, stored at `public_html/uploads/pdfs/`, served at `/uploads/pdfs`. Label field provides hyperlink title.
- **Topic/Category** — required field; `page_topics` table. Admin list shows Topic column (not Slug).

### File upload middleware

`src/middleware/upload.js` exports `uploadPageFiles` = `pageUpload.fields([{name:'featured_image'},{name:'pdf_attachment'}])`. Use `req.files['featured_image'][0]` pattern (not `req.file`).

---

## Books catalogue

Full CRUD at `/admin/books`, `/admin/book-authors`, `/admin/book-publishers`. Public at `/books`, `/book/:slug`, `/books/author/:slug`, `/books/publisher/:slug`, `/books/category/:slug`.

Cover images are processed by sharp into three variants: full (800px), `-md` (300px), `-sm` (200px), stored in `public_html/uploads/books/`.

Author search uses `/admin/book-authors/search?q=` endpoint (returns JSON).

---

## Known issues / TODO

- [ ] `featured_image` is NULL for all 544 migrated articles — hero/cards show placeholder
- [ ] `category` is NULL for all articles — assign via admin for category pages to work
- [ ] Logo at `/uploads/branding/logo.jpg` is an ImageMagick placeholder — replace with real asset
- [ ] VAPID keys not set — run `npx web-push generate-vapid-keys`, add to `.env`
- [ ] Google Analytics — add `GA4_MEASUREMENT_ID` to `.env` when assam.org GA property is ready
- [ ] Menu items "About Us" and "Contact" are inactive — create pages, then link in /admin/menu
- [ ] D6-era `/pimages/` and `/images/` body paths are unresolvable — those files are gone
