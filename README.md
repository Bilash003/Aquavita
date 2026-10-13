# AquaVita · Campus Water

A mobile-first bilingual water screening portal with a Firebase-authenticated admin dashboard, Express API, and Neon PostgreSQL database.

## Start here

For **Cloudflare Pages (free)**, start with **CLOUDFLARE_PAGES_SETUP.md**. The original **SETUP.md** describes the separate Node.js/Render deployment. The code is complete, but real authentication and persistence require your own configuration. The ChatGPT Sites deployment previews the interface; it does not run the Express API. No real Firebase or Neon credentials were supplied during development.

```bash
npm install
npm run build
npm run db:init
npm start
```

Node.js 22 or newer is required. Copy `.env.example` to `.env` for local development. On Render use environment variables instead of uploading `.env`.

## Public portal

- Full-screen water/nature animation with opt-in phone motion and touch ripples.
- Opening wave animation, logo/tagline reveal, Bangla/English choice, optional intro toggle.
- Database-backed buildings, source lists, labels, and bilingual building-name search.
- Shareable source reports with four screening states, tested date, next recommended screening, and uncropped sample evidence.
- Only published reports appear publicly. Original source codes remain unchanged across languages.
- No safety conclusions are inferred from missing tests or from screening status alone.

## Accounts and permissions

- `/login.html`: email/password sign-in, email verification, session persistence choice, and sign-out.
- `/admin.html`: responsive management dashboard.
- Email verification is required for dashboard access.
- The owner is identified by server-only `FIREBASE_OWNER_UID`.
- Additional admins are stored in the `admins` table; their access is rechecked on each request.
- Firebase Admin verifies ID tokens and checks revoked/disabled accounts server-side. No client-provided role is trusted.
- Owner-only user-account management can create accounts, update display names, disable sign-in, and delete accounts. Email-address changes remain in Firebase Console. Account creation in the dashboard does not send an email; users sign in and request verification themselves.

## Admin controls

| Area | Available actions |
|---|---|
| Buildings | Create, rename in English/Bangla, set type/order, delete empty buildings |
| Water sources | Create, rename code, move building, edit bilingual labels/order, delete sources without reports |
| Test reports | Create, edit, draft/publish, delete; all statuses, dates, images and optional measurements |
| Media library | Upload PNG/JPEG/WebP up to 5 MB, copy URLs, view originals, delete unused images |
| User accounts | Owner: create, edit name, enable/disable, delete; Firebase retains authentication records |
| Activity log | Latest 200 immutable audit entries |
| Export data | Download records/settings as JSON; image binary files are downloaded separately |

Source-code renames update related reports via a foreign key cascade. Previously shared old-code links are not redirected. Related records prevent accidental building/source deletion; delete reports before their source and sources before their building. Record revisions prevent one editor overwriting another editor's changes. Database initialization does not overwrite admin edits or recreate deleted sources on later restarts.

## Image storage

Small sample images are stored as PostgreSQL `BYTEA` in Neon and served by `/api/media/:id`; they survive Render restarts. This uses your Neon storage allowance. For a larger media collection, migrate to object storage. External direct HTTPS image links are also accepted. Images used by reports or the site logo cannot be deleted until those references are removed. Uploaded media URLs are public; do not upload private documents.

## Database

`database/schema.sql` creates/migrates tables. `database/init.js` seeds the initial 3 buildings and 24 sources only once using `app_migrations`. Test reports are never fabricated or automatically seeded. Re-running `npm run db:init` applies missing schema fields without resetting records.

The initial AB4-S1-F9 and AB4-S1-F(9) codes remain distinct until an admin intentionally changes them.

## API

Public: `/api/locations`, `/api/settings`, `/api/summary`, `/api/sources/:code/reports`, `/api/media/:id`, `/api/health`, `/api/auth/config`.

Authenticated: `/api/me`.

Admin: `/api/admin/locations`, `/api/admin/sources`, `/api/admin/reports` (GET/POST; PUT/DELETE by ID), `/api/admin/media`, `/api/admin/settings`, `/api/admin/audit`, `/api/admin/export`.

Owner: `/api/admin/admins`, `/api/admin/users`.

All privileged requests use `Authorization: Bearer <Firebase ID token>`. The browser SDK gets this token after sign-in. The old shared `ADMIN_API_KEY` publishing endpoint has been replaced with Firebase-authenticated routes.

## Checks and verification limits

```bash
npm run check
npm test
npm run build
```

Tests exercise real PostgreSQL-compatible SQL in PGlite and HTTP routes, with a test-only Firebase identity mock. They cover unauthorized access, owner/admin separation, public draft filtering, CRUD, stale revisions, source renaming, foreign-key delete protection, media persistence, and settings migration. Real Firebase sign-in/email delivery, Neon connectivity, and mobile browser visuals require verification after deployment with your credentials. No mocked identity mechanism is present in production routes.
