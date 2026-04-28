# Staging environment setup

A separate Firebase project so you can test rules, function deploys, and risky features without touching real users.

**Time to complete:** ~45 minutes (mostly waiting for service activation).
**Prerequisite:** Firebase Console access on the Google account that owns `alen-8797d`.

The code side is already prepared (`.firebaserc`, `src/services/firebase.ts`, `EnvBanner`). What follows is the one-time external setup.

---

## Step 1 — Create the Firebase project (5 min)

1. Open [Firebase Console](https://console.firebase.google.com) → click **Add project**.
2. **Project name:** `TripMates Staging` (display name only — internal ID is generated next).
3. **Project ID:** Firebase will suggest something like `tripmates-staging-XXXXX`. Either accept that or click "Edit" and pick `alen-staging` if available. Whatever you pick, **copy the project ID** — you'll need it in step 7.
4. **Disable Google Analytics** for this project (you don't need it for staging — keeps the setup faster and cheaper).
5. Click **Create project**, wait ~30 seconds, click **Continue**.

---

## Step 2 — Upgrade to Blaze plan (2 min, required for Cloud Functions)

Cloud Functions and Vertex AI both require the pay-as-you-go Blaze plan.

1. In the new project, **Settings (gear icon) → Usage and billing → Details & settings**.
2. Click **Modify plan** → choose **Blaze**.
3. Link a billing account. Set a **budget alert** at $5/month for staging — usage will be near zero, so this just protects against surprises.

(Staging traffic is yours alone, so cost will typically be a few cents/month.)

---

## Step 3 — Enable services (5 min)

Mirror what's enabled on prod. In the staging project:

| Service | Path | What to set |
|---|---|---|
| **Authentication** | Build → Authentication → Get started | Enable **Email/Password** sign-in. |
| **Firestore Database** | Build → Firestore Database → Create database | Region: **eur3 (europe-west)**. Start in **production mode** (rules will be deployed by us, not the wizard). |
| **Realtime Database** | Build → Realtime Database → Create database | Region: **Belgium (europe-west1)**. Locked rules. |
| **Storage** | Build → Storage → Get started | Region: **europe-west1**. Locked rules. |
| **Cloud Functions** | Build → Functions → Get started | Just acknowledge — no setup needed; functions deploy from CLI. |

> **Important — region match.** All four storage services must use **europe-west / europe-west1** to match prod. Mixing regions later requires a project recreate.

---

## Step 4 — Get the web-app config (2 min)

1. Project **Settings (gear) → General → Your apps**.
2. Click the **`</>` Web** icon → **Add app**.
3. **App nickname:** `TripMates Staging Web`.
4. **Do not** check "Also set up Firebase Hosting" (we'll do that next).
5. Click **Register app**. You'll see a JavaScript config block:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "alen-staging.firebaseapp.com",
     projectId: "alen-staging",
     storageBucket: "alen-staging.firebasestorage.app",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc...",
   };
   ```

6. **Copy the values.** You'll paste them into source in step 7.

---

## Step 5 — Enable Hosting (3 min)

1. Build → Hosting → Get started.
2. The setup wizard tells you to install firebase-tools — you already have it. Skip the prompts.
3. The default site is named after the project ID. You can add custom domains later.

After setup, your staging URL will be:

```
https://{your-staging-project-id}.web.app
```

---

## Step 6 — Wire Vertex AI (3 min, only if you want receipt OCR in staging)

Vertex AI needs to be enabled on each project separately. From a terminal:

```
gcloud config set project {your-staging-project-id}
gcloud services enable aiplatform.googleapis.com cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com
gcloud projects add-iam-policy-binding {your-staging-project-id} --member="serviceAccount:{PROJECT-NUMBER}-compute@developer.gserviceaccount.com" --role="roles/aiplatform.user"
```

Replace `{PROJECT-NUMBER}` with the number shown in Firebase Console → Settings → General (it's the `messagingSenderId` from step 4).

If you skip this step, the `scanReceipt` function will return a permission error in staging — the rest of the app works normally.

---

## Step 7 — Wire the code (5 min, one-time)

Open the repo locally.

### 7a. Update `.firebaserc`

Replace the placeholder with the real project ID from step 1:

```
"staging": "REPLACE_WITH_STAGING_PROJECT_ID"
```

becomes e.g.

```
"staging": "alen-staging"
```

### 7b. Update `src/services/firebase.ts`

Find the `STAGING_CONFIG` block and paste in the values you copied in step 4. All six fields (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`). The `databaseURL` should be `https://{project-id}-default-rtdb.europe-west1.firebasedatabase.app`.

### 7c. Verify

Run a quick typecheck and dry-run staging build to confirm there's no leftover placeholder.

```
npx tsc --noEmit -p tsconfig.app.json
VITE_FIREBASE_ENV=staging npm run build
```

The build will fail loudly if you forgot any placeholder — that's the safety net in `firebase.ts`.

### 7d. Commit

```
git add .firebaserc src/services/firebase.ts
git commit -m "chore: wire staging Firebase project config"
git push origin main
```

---

## Step 8 — First staging deploy (5 min)

```
firebase use staging
firebase deploy
```

The first deploy of all services takes ~5 minutes (Cloud Build builds the function container).

> If `firebase use staging` says "Permission denied" — you're logged in as the wrong Google account. Run `firebase logout && firebase login` and pick the account that owns the project.

After the deploy you have:

- A live staging copy at `https://{staging-id}.web.app`
- Independent Firestore data (empty)
- Independent Auth users (empty)

---

## Step 9 — Day-to-day use

| Goal | Command |
|---|---|
| Run dev server against **prod** (default) | `npm run dev` |
| Run dev server against **staging** | `npm run dev -- --mode staging` |
| Build for **prod** | `npm run build` |
| Build for **staging** | `VITE_FIREBASE_ENV=staging npm run build` |
| Switch CLI to prod | `firebase use prod` |
| Switch CLI to staging | `firebase use staging` |
| Deploy rules to staging | `firebase use staging && firebase deploy --only firestore:rules,storage` |
| Deploy functions to staging | `firebase use staging && firebase deploy --only functions` |
| Deploy hosting to staging | `firebase use staging && VITE_FIREBASE_ENV=staging npm run build && firebase deploy --only hosting` |

When the app runs against staging you'll see a thin **amber STAGING strip** at the top of the screen — that's your visual confirmation you're not poking prod.

---

## Step 10 — Recommended workflow going forward

1. New rule changes → `firebase use staging && firebase deploy --only firestore:rules` → smoke-test → `firebase use prod && firebase deploy --only firestore:rules`.
2. New Cloud Functions → same pattern.
3. New UI features → for risky ones, push the build to staging hosting first, click around, then prod.
4. Backfill / migration scripts → run against staging first with `GOOGLE_APPLICATION_CREDENTIALS` pointing at the staging service account, verify the row counts, then point at prod.

---

## Troubleshooting

**`Error: Failed to authenticate, have you run firebase login?`**
You're logged into a Google account that doesn't have access to the staging project. `firebase logout && firebase login` and pick the right account.

**Staging app boots but says "API key not valid"**
The `apiKey` in `STAGING_CONFIG` is wrong or has an extra space. Copy from Firebase Console → Settings → General again.

**`PERMISSION_DENIED` when calling `scanReceipt` in staging**
You skipped step 6. Either run those gcloud commands or accept that receipt OCR is prod-only for now.

**Amber STAGING strip shows in prod**
Something is leaking `VITE_FIREBASE_ENV=staging` into the prod build. Check the build command and any environment variables on the host (Firebase Hosting, GitHub Actions, etc.).

---

When you've completed this guide, mark Fas 1 #11 as ✅ done.
