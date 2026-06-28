# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project

**assam.org** — Node.js/Express news portal about Assam, India. Forked from `assamtimes-app`.

- **Port:** 3004. PM2 name: `assam-org`. **Never touch port 3000 (GDM) or 3002 (assamtimes).**
- **Stack:** Node.js + Express 5 + EJS + PostgreSQL 14 + connect-pg-simple sessions
- **Public root:** `/home/assam/web/assam.org/public_html/`
- **Brand:** Assam Portal — Gateway to Assam. Color `#2D6A4F` (forest green). Hover: `#1d5238`.

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

**Public routes** (`/`, `/news`, `/article/:slug`, `/category/:cat`, `/search`, `/page/:slug`, `/author/:username`) are handled by `src/controllers/publicController.js`. Every public request loads `menuItems` and `footerHtml` from the DB via a router-level middleware.

**Admin routes** all live under `/admin`. After login the session stores `req.session.adminUser` (id, username, displayName, roles, permissions, isSuperAdmin). The `requireAdmin` middleware in `src/middleware/roleAuth.js` guards the entire admin subtree. Individual routes additionally use `requirePermission(module, action)` for write operations.

### Multi-role admin auth

Admin users are in `admin_users` (separate from the `authors` table, which holds 3,629 D9 byline authors). Roles and permissions live in `admin_roles`, `admin_permissions`, `admin_user_roles`.

Modules: `stories`, `pages`, `books`, `authors`, `comments`, `settings`, `users`.  
Built-in roles: `superadmin`, `editor`, `stories_editor`, `pages_editor`, `books_editor`, `contributor`.

`requirePermission('stories', 'can_update')` returns an async middleware that checks `admin_user_roles → admin_permissions`. Superadmin bypasses all checks. `own_only` flag is set on `req.ownOnly` for controllers to filter accordingly.

### Data layer

All DB access goes through model files in `src/models/`. Models export plain async functions — no ORM, raw `pg` pool queries. The pool is a singleton in `src/config/db.js`.

Key model methods to know:
- `articles.getLatestPublished`, `articles.getOnThisDay`, `articles.getMostViewed`, `articles.getBySlug`
- `pages.getLatestPublished`, `pages.getBySlug`
- `adminUsers.getByUsername`, `adminUsers.create`, `adminUsers.update`, `adminUsers.listWithRoles`

### Views

EJS with `express-ejs-layouts`. Public pages use `views/layout.ejs` (the shell). Admin pages set `res.locals.layout = 'admin/layout'` per-handler. The admin layout gets `adminUser` from `res.locals` (set by the `setAdminLocals` middleware in `src/routes/admin.js`).

### Static files / uploads

All upload directories are outside the app root at `public_html/uploads/`. Each directory is mounted as a separate `express.static` route configured via `.env`. `/uploads/legacy` serves migrated D9 images. `/sites/assam.org/files` is a fallback for unrewritten D9 body paths.

---

## Database

| Table | Notes |
|---|---|
| `articles` | 544 migrated from D9. `category` and `featured_image` are NULL for all. Slugs: `{alias}-{nid}`. |
| `pages` | 101 migrated from D9 |
| `authors` | 3,629 D9 users — byline only, not admin login |
| `admin_users` | Admin panel logins (separate from authors) |
| `admin_roles` / `admin_permissions` / `admin_user_roles` | RBAC tables |
| `menu_items` | 3 rows: Home active, About/Contact inactive |
| `site_settings` | Singleton row: `footer_html`, `featured_category` |
| `session` | Created by connect-pg-simple on first run |

**All article `category` values are NULL** — D9 had no category taxonomy migrated. Assign via admin. Homepage uses hardcoded topic pills.

---

## Migration history

Migrations in `migrations/` are numbered `001`–`011`. Applied sequentially. Migration 008 was adapted (articles had no `gallery_images TEXT[]` column to convert — added JSONB directly). All 544 article slugs had a `-news-` prefix bug (D9 aliases were `/news/slug`); fixed in DB and in `scripts/migrate-assam.js`.

---

## Known issues / TODO

- [ ] `featured_image` is NULL for all 544 migrated articles — hero/cards show placeholder
- [ ] `category` is NULL for all articles — assign via admin for category pages to work
- [ ] Logo at `/uploads/branding/logo.jpg` is an ImageMagick placeholder — replace with real asset
- [ ] VAPID keys not set — run `npx web-push generate-vapid-keys`, add to `.env`
- [ ] Google Analytics — add `GA4_MEASUREMENT_ID` to `.env` when assam.org GA property is ready
- [ ] Menu items "About Us" and "Contact" are inactive — create pages, then link in /admin/menu
- [ ] D6-era `/pimages/` and `/images/` body paths are unresolvable — those files are gone
