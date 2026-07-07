# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project

**assam.org** — Node.js/Express news portal about Assam, India. Forked from `assamtimes-app`.

- **Port:** 3004. PM2 name: `assam` (the live process was started under this name; `ecosystem.config.js` says `assam-org` — check `pm2 list` if a reload reports "not found"). **Never touch port 3000 (GDM) or 3002 (assamtimes).**
- **Stack:** Node.js + Express 5 + EJS + PostgreSQL 14 + connect-pg-simple sessions
- **Public root:** `/home/assam/web/assam.org/public_html/`
- **Brand:** Assam Portal — Gateway to Assam. Primary `#1A00AC`, dark `#130082`, secondary `#6B5CE0`, tint bg `#F0EEFB`, tint border `#D9D4F5`.

---

## Commands

```bash
# Development (nodemon, foreground)
npm run dev

# Production via PM2 (live process name is `assam`, not `assam-org`)
pm2 start ecosystem.config.js   # first start
pm2 reload assam                 # zero-downtime reload after code changes
pm2 restart assam                # full restart
pm2 logs assam --lines 50 --nostream

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

**Public routes** (`/`, `/news`, `/article/:slug`, `/category/:cat`, `/search`, `/page/:slug`, `/page/:slug/revisions`, `/research`, `/research/:topicSlug`, `/books`, `/book/:slug`, `/author/:username`, `/blog`, `/blog/:slug`) are handled by `src/controllers/publicController.js`, `src/controllers/publicBooksController.js`, and `src/controllers/blogController.js`. Every public request loads `menuItems` and `footerHtml` from the DB via a router-level middleware (plus `res.locals.adminUser` for the contextual edit bars). `POST /api/track` (click-tracking beacon) is registered BEFORE that middleware so beacons skip the menu/footer DB queries. A few routes are inline handlers in the router itself rather than in a controller: `/page/:slug/revisions`, `/books/publish`, and `/node/:nid` — the D9 legacy fallback that 301-redirects old Drupal node URLs to the migrated article/page via `old_node_id`.

**Admin routes** all live under `/admin`. After login the session stores `req.session.adminUser` (id, username, displayName, roles, permissions, isSuperAdmin). The `requireAdmin` middleware in `src/middleware/roleAuth.js` guards the entire admin subtree. Individual routes additionally use `requirePermission(module, action)` for write operations.

### Multi-role admin auth

Admin users are in `admin_users` (separate from the `authors` table, which holds 3,629 D9 byline authors). Roles and permissions live in `admin_roles`, `admin_permissions`, `admin_user_roles`.

Modules: `stories`, `pages`, `books`, `authors`, `comments`, `settings`, `users`, `blog`.  
Built-in roles (after migration 025): `superadmin` (everything), `editor` (all content modules, NO settings/users), `stories_editor`, `pages_editor`, `books_editor` (books + blog — the `booknook` user's role), `contributor` (own content only), `authenticated` (zero admin permissions, reserved for future public users).

Permissions are loaded into the session ONCE at login (`adminUsersModel.loadPermissions` in the login handler) — role/permission changes in the DB take effect only after the affected user logs out and back in.

**Dashboard & nav:** `GET /admin` renders a stats dashboard (`adminDashboardController.js` + `views/admin/dashboard.ejs`) for content roles; books-focused roles (no stories/pages read) are redirected straight to `/admin/books` (or blog/users). The admin nav (`views/admin/layout.ejs`) is four hover dropdowns, each permission-gated — Content (Pages / Topics / News / The Assam Review), Books (All Books / Authors / Publishers), People (Users / Authors), System (Analytics / Settings / Menu / Redirects). The Topics route is `/admin/page-topics` (NOT `/admin/topics`), and there is no `/admin/book-categories` route — don't add nav links to either of those phantom paths. Active states come from `res.locals.activePath` (set as `req.baseUrl + req.path` in the admin router middleware). Logout is a POST form (`.nav-logout-form`), not a GET link.

`requirePermission('stories', 'can_update')` returns an async middleware that checks `admin_user_roles → admin_permissions`. Superadmin bypasses all checks. `own_only` flag is set on `req.ownOnly` for controllers to filter accordingly.

**Slug field security:** Only superadmins can see or edit slug fields in admin forms (pages, articles, books, authors, publishers, blog posts). Non-superadmins get a hidden input preserving the existing slug. Enforced server-side in all relevant controllers — `buildPageData()`, `buildArticleData()`, `buildPostData()`, and the three book update handlers all check `req.session.adminUser.isSuperAdmin` before accepting a new slug.

### Data layer

All DB access goes through model files in `src/models/`. Models export plain async functions — no ORM, raw `pg` pool queries. The pool is a singleton in `src/config/db.js`.

Key model methods to know:
- `articles.getLatestPublished`, `articles.getOnThisDay`, `articles.getMostViewed`, `articles.getBySlug`
- `pages.getLatestPublished`, `pages.getBySlug`, `pages.getById`, `pages.getAllForAdmin`, `pages.listTopicsAdmin`
- `adminUsers.getByUsername`, `adminUsers.create`, `adminUsers.update`, `adminUsers.listWithRoles`
- `books.*` — full CRUD + author/publisher/category relations in `src/models/books.js`; `getLanguages()` and a `language` filter param on `getLatest`/`countActive`/`search`/`searchCount`
- `blogPosts.*` — blog CRUD in `src/models/blogPosts.js`; JOINs `authors` for byline and (via LATERAL) the linked `books_authors` profile — deliberately does NOT join `admin_users` (`admin_user_id` is audit-only, never displayed); also `getAdjacent(slug)` for prev/next and `getByAdminUser(id)` for the public author page
- `adminUsers.listBasic()` — id/username/email of active admins, for "link admin user" dropdowns
- `authors.getAllWithCounts({ q, limit, offset })`, `authors.countAll`, `authors.deleteById` — paginated admin list with article + blog post counts

### Views

EJS with `express-ejs-layouts`. Public pages use `views/layout.ejs` (the shell). Admin pages set `res.locals.layout = 'admin/layout'` per-handler. The admin layout gets `adminUser` from `res.locals` (set by the `setAdminLocals` middleware in `src/routes/admin.js`).

**Contextual edit bars:** every public content page shows a permission-gated "✏️ Edit this …" bar to logged-in admins (`res.locals.adminUser` is set for all public routes in `src/routes/public.js`). Article and blog post pages use the shared partial `views/partials/contextualEdit.ejs` (params: `editModule`, `editUrl`, `editLabel` — shown when the role has `can_update` on the module); page/book/book-author/book-publisher pages have equivalent inline bars (`.contextual-edit-bar`, styled in `style.css`). Page bars also link "Manage topics".

**Header logos** (`views/partials/header.ejs`): two stacked imgs crossfaded on scroll — `logo-assam.jpg` (regular, 151×80) and `logo-small.jpg` (sticky, 270×40). Sizes are set in BOTH the img `width`/`height` attributes and `.site-logo-img--regular`/`--sticky` CSS rules in `public/css/style.css` (plus a mobile `@media (max-width: 768px)` block) — change all of them together.

### Static files / uploads

All upload directories are outside the app root at `public_html/uploads/`. Each directory is mounted as a separate `express.static` route configured via `.env`. `/uploads/legacy` serves migrated D9 images. `/sites/assam.org/files` is a fallback for unrewritten D9 body paths. `/uploads/pdfs` serves PDF attachments for research pages. `/uploads/blog` serves blog featured images. `/uploads/publishers` serves publisher logos; book-author photos share `/uploads/authors` with byline author photos.

**Upload permission gotcha:** sharp's `toFile()` can write files with broken permissions (`---x-----T`) depending on process umask — files exist but won't serve. Every sharp save (`saveCoverImage` / `saveResizedImage` in `adminBooksController.js`, `saveBlogImage` in `adminBlogController.js`) must call `fs.chmodSync(path, 0o644)` after the `.tmp` rename.

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
| `books` | Books catalogue. Has cover image variants (-sm, -md), `amazon_url` (affiliate link), `d9_created_at`/`d9_updated_at` if migrated. |
| `books_authors` | Authors for the books catalogue (not the same as `authors`). `admin_user_id` FK → `admin_users` links a profile to an admin login (drives blog byline fallback + "Blog posts by" on the public author page). |
| `books_publishers` | Publishers |
| `books_categories` / `books_book_categories` | Category taxonomy for books + junction |
| `books_book_authors` | Book↔author junction. PK `(book_id, author_id)`, so real duplicates are impossible — a "duplicate author" symptom is a query fan-out (see Books catalogue). |
| `blog_posts` | "The Assam Review" blog. `author_id` FK → `authors` (public byline), `admin_user_id` → `admin_users` (silent audit). Featured image variants: full (1200px) + `-sm` (400px). `video_url` for embedded video. |
| `menu_items` | DB-driven nav: Home, Blog (`/blog`), BookNook (`/books`, children: Browse Books + Publish Your Book), About Us (inactive) |
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

Migrations in `migrations/` are numbered `001`–`027`. Applied sequentially.

- 008: `gallery_images` added as JSONB (articles had no TEXT[] to convert).
- 020: Adds `update_needed`, `update_needed_note` to `pages`.
- 021: Creates `page_history` table; adds `editors_note` to `pages`; adds `admin_user_id` column to `page_history`.
- 022: Creates `blog_posts` table; inserts `blog` module RBAC permissions.
- 023: Adds `author_id` FK (→ `authors`) to `blog_posts`.
- 024: Adds `video_url` to `blog_posts`.
- 025: RBAC cleanup — `books_editor` gains `blog`; `editor` loses `settings`; explicit superadmin rows for all modules; adds `authenticated` role; drops unused `userbooknook` role.
- 026: Adds `admin_user_id` FK (→ `admin_users`, SET NULL) to `books_authors` — links admin logins to public book-author profiles; drives blog byline fallback and the "Blog posts by" section on `/books/author/:slug`.
- 027: First-party click/view tracking — `click_events` (+ indexes), `click_daily_summary` (reserved for rollups), `views` columns on `books`/`blog_posts`/`pages`.

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

- **Language filter** — pills on `/books` (via `?lang=`), rendered whenever at least one language exists. `lang` param is carried through search and pagination. The admin book form's Language field is a dropdown (Assamese/English/Hindi/Bengali/Bodo/Khasi/Mising/Karbi/Dimasa/Other); an unlisted legacy value on an existing book is appended as an extra option so saving doesn't silently reset it to English.
- **Homepage book blocks** — the homepage's ONLY book sections (the old featured/latest section was removed, and `settings.books_section_title`/`books_section_show_featured` are no longer used): (1) অসমীয়া কিতাপ / Assamese Books — one row of 6 via `getLatestByLanguage('Assamese', 6)`, ALWAYS shown (renders a "coming soon" placeholder when no Assamese books exist); (2) "Books on Assam" — latest 6 across all languages via `getLatestAll(6)`, header link "Browse all N books →" with live `countActive()`. Both use `views/partials/book-card.ejs` (which carries the `data-track-click` attrs). Grid: `.home-book-row` — exactly 6 columns (4/3/2 responsive). `getLatestByLanguage` also takes `{ exclude: true }` for an "everything except this language" list (currently unused).
- **Amazon affiliate button** — `books.amazon_url` renders an orange "Buy on Amazon" button (`.btn-buy-now`) on the book detail page, before the regular Buy Now button, with `rel="noopener nofollow sponsored"`.
- **Author/publisher images** — file uploads (not URL fields): `uploadAuthorImage` / `uploadPublisherLogo` in `src/middleware/upload.js` (memory storage, 5MB, JPEG/PNG/WebP) → `saveResizedImage()` in `adminBooksController.js` (author photo 400px → `/uploads/authors`, publisher logo 600px → `/uploads/publishers`, JPEG 80%). On update with no new file, controllers preserve the existing DB value — `buildAuthorData`/`buildPublisherData` no longer receive it from the form.
- **Linked Admin User** — the book-author admin form has an optional dropdown storing `books_authors.admin_user_id`. When linked, that admin's blog posts (saved without an explicit byline) carry the profile's name/photo, and `/books/author/:slug` shows a "Blog posts by ‹name›" section.
- **`BOOK_SELECT` fan-out gotcha** — `src/models/books.js` joins both the authors and categories junctions, so rows multiply. `authors` is aggregated via a correlated subquery (ordered by `sort_order`) and `categories` via `json_agg(DISTINCT …)`. Don't convert `authors` back to a plain `json_agg` over the join — with 2+ categories every author appears twice (that was the "duplicate author on save" bug; the DB was never actually duplicated). The joins must stay because `search()` filters on `ba.name` and `getByCategory()` on `bc.slug`.

---

## Blog — "The Assam Review"

Public at `/blog` (list, tag filter, 6 posts/page) and `/blog/:slug`. Admin CRUD at `/admin/blog`, guarded by `requirePermission('blog', …)`. Nav label is just "Blog"; the list page carries the branding (`section-label` eyebrow "Blogs" + H1 "The Assam Review" + subtitle).

- **Author byline** — priority order: (1) explicit `author_id` → `authors` (picked via autocomplete against `/admin/authors/search?q=`), rendered as plain text; (2) the saving admin's linked book-author profile (`books_authors.admin_user_id`, migration 026) — shows name + photo linking to `/books/author/:slug`; (3) NOTHING. There is deliberately NO fallback to the admin user's display name — "By Super Admin" must never appear publicly, and the `blogPosts` shared SELECT intentionally does not join `admin_users` (that FK is audit-only). The linked profile comes from a LATERAL join (`linked_author_*` fields). Don't reorder — explicit per-post bylines must always beat the account-level link.
- **Post page layout** — hero image → tags/title/byline (`.post-hero-meta`) → body → video embed → footer (published date, tags, prev/next via `blogPosts.getAdjacent(slug)`, back link).
- **Video embeds** — `blog_posts.video_url` (admin form field) is parsed by `parseVideoUrl()` in `src/utils/videoEmbed.js` (YouTube incl. youtu.be/shorts, X/Twitter status URLs, Facebook watch/videos) and rendered by `views/partials/videoEmbed.ejs` at the END of the post body. **helmet gotcha:** the default `Referrer-Policy: no-referrer` breaks YouTube embeds (Error 153 — the player needs a Referer to validate the embedding site); `server.js` sets `referrerPolicy: strict-origin-when-cross-origin`. Don't revert it.
- **Publish buttons** — submit buttons are `name="submit_action"` (values `draft`/`published`), NOT `name="status"` — a `<select name="status">` also exists in the form, and duplicate names make Express parse the value as an array, silently breaking the publish check.
- **View/Edit tabs** — the admin edit form has top-right tabs; View shows the live post in an iframe (reloaded on each switch).
- **Featured image** — multer `memoryStorage` → sharp: full (1200px) + `-sm` (400px), stored at `public_html/uploads/blog/`.

## Click & view tracking (first-party analytics)

All data stays in `assam_db.click_events` — no third-party analytics. IPs are stored only as `SHA256(ip + SESSION_SECRET)` truncated hashes; DNT (`DNT: 1`) and bot user-agents (`BOT_RE` in `src/middleware/trackPageView.js`) are always skipped, as are logged-in admins.

- **Page views** — `trackView(type, content, req)` from `trackPageView.js`, called fire-and-forget in `articleDetail`, `pageDetail`, `bookDetail`, `showPost`. It also increments the content's own `views` column — EXCEPT for articles, which already increment `articles.views_count` via `articlesModel.incrementViewCount` (don't double-count).
- **Searches** — recorded in `searchPage` (page 1 only) with `result_count`.
- **Client events** — `public/js/track.js` (in `views/layout.ejs`) sends beacons to `POST /api/track` (whitelisted event types, rate-limited, registered BEFORE the menu/footer middleware in `src/routes/public.js` so beacons skip those DB queries). Outbound links are auto-detected; content cards use `data-track-click` + `data-content-*` attrs; filter pills use `data-track-filter`. The Amazon/Buy buttons get context from `data-content-*` on the wrapping `.book-buy-actions` div.
- **Reporting** — `src/models/clickEvents.js` (`getTopContent`, `getTopSearches`, `getTopOutbound`, `getDailyViews`, `getSummaryStats`). Admin UI at `/admin/analytics` (`requirePermission('settings','can_read')` → superadmin-only; linked in the System dropdown), with 7/30/90-day tabs and a pure-CSS bar chart.
- **Retention** — `scripts/cleanup_tracking.js` deletes events older than 365 days; scheduled monthly in the `assam` user's crontab.

## Authors admin

`/admin/authors` — paginated list (50/page) of the 3,629 byline authors with server-side search, article + blog post counts, and delete (blocked when the author has articles). Autocomplete endpoint `/admin/authors/search?q=` is shared by news articles and blog posts.

---

## Known issues / TODO

- [ ] `featured_image` is NULL for all 544 migrated articles — hero/cards show placeholder
- [ ] `category` is NULL for all articles — assign via admin for category pages to work
- [ ] VAPID keys not set — run `npx web-push generate-vapid-keys`, add to `.env`
- [ ] Google Analytics — add `GA4_MEASUREMENT_ID` to `.env` when assam.org GA property is ready
- [ ] Menu item "About Us" is inactive — create page, then link in /admin/menu
- [ ] D6-era `/pimages/` and `/images/` body paths are unresolvable — those files are gone
