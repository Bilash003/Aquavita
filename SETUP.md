# AquaVita: Firebase + Neon + Render setup

Use the files in this new package to replace the older files in your GitHub repository. Include `backend/`, `client/`, `database/`, `dist/`, `scripts/`, `package.json`, and `package-lock.json`. Never commit a `.env` file or Firebase service-account JSON.

## 1. Create or reuse your Neon project

In Neon Console open your project, click **Connect**, choose your database, and copy the complete PostgreSQL URL. Keep all SSL parameters. The application uses the `pg` driver. No Render Postgres database is needed.

Save this value for Render as `DATABASE_URL`.

## 2. Create a Firebase project

Open https://console.firebase.google.com/ and create or choose your project.

### Enable email/password login

Open **Build → Authentication → Get started → Sign-in method**. Enable **Email/Password**. The current app uses email/password; Google login is not required.

### Register the website

Open **Project settings → General → Your apps**, add a **Web app** (the `</>` icon), and copy these values from the configuration snippet:

| Firebase config property | Render variable |
|---|---|
| `apiKey` | `FIREBASE_API_KEY` |
| `authDomain` | `FIREBASE_AUTH_DOMAIN` |
| `projectId` | `FIREBASE_PROJECT_ID` |
| `appId` | `FIREBASE_APP_ID` |

These are web-app configuration values. Do not confuse them with the private service-account key below.

### Configure server verification

Open **Project settings → Service accounts → Generate new private key**. Firebase downloads a JSON file.

In Render create `FIREBASE_SERVICE_ACCOUNT_JSON` and paste the complete JSON contents as its value. Do not add wrapping quotation marks around it in Render. This value stays on the server. Keep it out of GitHub and frontend files. As an alternative, use a Render secret file and `GOOGLE_APPLICATION_CREDENTIALS` pointing to that file; the server supports that method too.

Use the same Firebase project for the web configuration and service account.

## 3. Create the Render Web Service

Connect your GitHub repository at https://dashboard.render.com/ and choose **New → Web Service**.

| Setting | Value |
|---|---|
| Runtime | Node |
| Root directory | Blank if package.json is at repository root; otherwise that subfolder |
| Build command | `npm ci && npm run build` |
| Start command | `npm run db:init && npm start` |
| Health check path | `/api/health` |
| Instance | Free if available for your account |

Set these environment variables before deploying:

```text
DATABASE_URL                 = Your complete Neon URL
NODE_ENV                     = production
FIREBASE_API_KEY              = Firebase web apiKey
FIREBASE_AUTH_DOMAIN          = Firebase web authDomain
FIREBASE_PROJECT_ID           = Firebase projectId
FIREBASE_APP_ID               = Firebase web appId
FIREBASE_SERVICE_ACCOUNT_JSON = Complete private JSON contents
TRUST_PROXY_HOPS              = 1
```

Add `FIREBASE_OWNER_UID` in Step 5. Without it, nobody automatically becomes the owner. Render supplies its port; do not hardcode `PORT` for Render.

Deploy. Successful logs include:

```text
Database migrations complete; initial directory seeded only once.
AquaVita server ready
```

## 4. Authorize your Render domain in Firebase

Copy the deployed hostname (for example `aquavita-example.onrender.com`).

In **Firebase Authentication → Settings → Authorized domains**, add the hostname without `https://` or a trailing slash. Add your custom domain too if you use one. For local development, add `localhost` if it is not already authorized.

## 5. Create your owner account

1. Open `https://YOUR-SITE.onrender.com/login.html`.
2. Choose **Create an account**, then register with your email and password.
3. Open the verification email and verify your address.
4. In **Firebase Authentication → Users**, find your account and copy its **User UID**.
5. In Render add `FIREBASE_OWNER_UID` with that exact UID. This is not your email address.
6. Save and redeploy.
7. Sign in again, then open `https://YOUR-SITE.onrender.com/admin.html`.

The owner can manage content, user accounts, and admin access. Do not grant ownership by editing browser code or setting a frontend flag.

## 6. Use the dashboard

- **Buildings:** add English/Bangla names and display order.
- **Water sources:** choose a building and add/change source codes or labels.
- **Test reports:** choose a source, one of the four screening statuses, test dates, and an image. Save as a draft or select **Publish this report**.
- **Media library:** upload test photos. Images retain their full frame.
- **User accounts:** owner can create, edit names, disable, or delete accounts. Users created here must sign in and request email verification. Use Firebase Console to change account email addresses.
- **Activity log:** review recorded changes.

Buildings/source lists and settings now load from Neon. Refresh the public site to see saved changes. Published reports are fetched when a source is opened. You no longer need to edit `dist/data.js` for normal directory changes.

## 7. Verify the connection

Open `/api/summary` on your Render domain. Add and publish a real report through the dashboard, then reopen its public source page and check the outcome, dates, and full image. Save another report as a draft and confirm it does not appear publicly.

`/api/health` confirms configuration is present; it does not prove a successful database query. A successful dashboard load and `/api/summary` query verify database access more directly.

## Troubleshooting

| Symptom | What to check |
|---|---|
| “Firebase is not configured” | Four web config variables plus the server service-account credential; redeploy after changes |
| “Verify your email” | Open the verification link, then use “I’ve verified my email” on the account screen |
| “No admin access” | Copy the exact UID to `FIREBASE_OWNER_UID`, or ask the owner to grant admin access |
| SQL relation/column error | Ensure the start command runs `npm run db:init` with the correct DATABASE_URL |
| Old content after deploy | Confirm GitHub has the new backend and frontend files and refresh the public page |
| Image upload rejected | PNG/JPEG/WebP only, maximum 5 MB per file |
| Cannot delete a building/source | Remove dependent reports/sources first |
| “Record changed” | Another edit occurred; reload the record before saving |
| Service sleeps on the free plan | Render may pause idle services; the next visit starts it again |

This package does not include your Firebase keys or a live Neon connection. The public ChatGPT Sites preview is for reviewing the interface; admin mutations are disabled there. Use your Render deployment for actual login and administration.
