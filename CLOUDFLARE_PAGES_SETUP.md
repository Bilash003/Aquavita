# AquaVita — Cloudflare Pages deployment (correct GitHub project)

This version repairs the missing Cloudflare `/api/*` routes. It was built from the uploaded `AquaVita(1).zip`, **not** from the previously supplied ZIP. It preserves the original frontend and has a Pages Functions API adapter for core public and admin endpoints.

## 1. Copy these files into your existing GitHub checkout

Extract the repaired ZIP. Open its `AquaVita` folder. Copy its contents into your local project folder (e.g., `D:\DOT_NET\AquaVita`), replacing files when asked. Do **not** delete your original `.git` directory; the repaired ZIP intentionally does not contain `.git`. Do not upload `service_acc_json.json` or `.env`.

The key additions and edits are:

- `functions/api/[[path]].js` — Cloudflare Pages backend API.
- `wrangler.toml` — Pages output path and modern runtime date.
- `client/firebase-client.js` — informative JSON/API errors and Firebase initialization.
- `dist/config.js` — enables calls to Cloudflare API.
- `CLOUDFLARE_PAGES_SETUP.md` — this guide.

## 2. Send the change to GitHub

In Git Bash:

```bash
cd /d/DOT_NET/AquaVita
git status
git add .
git status
# Confirm .env, service_acc_json.json and node_modules do NOT appear under staged changes.
git commit -m "Add AquaVita Cloudflare Pages API"
git push origin main
```

## 3. Check Cloudflare Pages build settings

Cloudflare → Workers & Pages → **your Pages project** (not the old Worker) → Settings:

- Framework: **None**
- Root directory: repository root
- Build command: `npm run build`
- Build output directory: `dist`
- Production branch: `main`

`wrangler.toml` sets the Pages compatibility date to `2026-10-13`. This supports the Node.js API needed by the existing `pg` PostgreSQL library. If your Cloudflare dashboard shows a compatibility date below `2026-08-04`, update it to `2026-10-13` for the Pages project in Settings → Functions, then redeploy.

## 4. Configure the backend in Cloudflare (important)

Cloudflare → Workers & Pages → Pages project → Settings → **Variables and Secrets**.

Add these to **Production**:

| Name | What to set |
|---|---|
| `FIREBASE_API_KEY` | Firebase Console → Project settings → Your apps → Web config `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | Web config `authDomain` |
| `FIREBASE_PROJECT_ID` | Web config `projectId` |
| `FIREBASE_APP_ID` | Web config `appId` |
| `DATABASE_URL` | Full Neon Postgres connection string, with `sslmode=require` (make it an encrypted Secret) |
| `FIREBASE_OWNER_UID` | UID of the email-verified account that owns the AquaVita admin dashboard |

Don't put the old service account private JSON in your website. This Pages API uses Firebase's authenticated `accounts:lookup` endpoint to validate user tokens without a private key. If GitHub previously blocked your service account credential, **revoke that leaked key** in Firebase/Google Cloud.

After saving variables, go to **Deployments → latest deployment → Retry deployment** (or make a fresh Git push). They won't necessarily be available in an already-built deployment until redeployed.

## 5. Configure Firebase

Firebase Console → Authentication → Sign-in method → enable **Email/Password**.
Firebase Console → Authentication → Settings → Authorized domains: add `aquavita-4fh.pages.dev` (or your actual current Pages hostname), without `https://`.
Firebase Console → Authentication → Users: make sure your own admin user exists and is email-verified. Copy that user's UID into `FIREBASE_OWNER_UID` in Cloudflare Pages.

## 6. Initialize Neon's database once

Your original project contains `database/schema.sql` and `database/init.js`. If you have not already run the migration against your live Neon database, run this on your own PC inside the project folder:

```bash
npm install
npm run db:init
```

The local `.env` should contain the complete `DATABASE_URL` (do not upload it). The initialization script creates the database schema and seeds the default water points only once; it doesn't fabricate any laboratory report results.

## 7. Test three URLs after redeploying

Replace the hostname below if different:

- `https://aquavita-4fh.pages.dev/api/health` should return JSON, with database and authentication both `configured`.
- `https://aquavita-4fh.pages.dev/api/auth/config` should return JSON with `"configured":true`.
- `https://aquavita-4fh.pages.dev/api/locations` should return the list of locations, after database initialization.

Then open `https://aquavita-4fh.pages.dev/login.html`, sign in to your verified Firebase account, and go to `/admin.html`. The owner can edit buildings, sources, reports, settings, media, problem reports and audit records. All content is stored in Neon; data is not stored in the Cloudflare Pages static frontend.

## Known limitations and safety

- Account provisioning actions in the **User accounts** tab are intentionally unavailable in this Pages adapter (`501` with an explanation). Create, disable, or delete Firebase accounts in Firebase Console instead. Other admin modules are included. Admin UID grants in the `admins` table are owner-only, require verified Firebase login for use, and should be reviewed carefully.
- Cloudflare Pages Functions and direct PostgreSQL connections are subject to free-tier resource/CPU limits. This adapter is tested locally against PGlite; real Firebase, Neon, and Cloudflare runtime connectivity must be checked after deploying.
- Keep `DATABASE_URL` encrypted in Cloudflare and private keys out of Git. The zip excludes `.env`, `.git`, `node_modules`, and service-account files.
- If the browser displays a `503` instead of a JSON parsing error, check your Pages Function logs and the variable names listed above. Do not mark microbiology results confirmed merely because a photograph changes color.
