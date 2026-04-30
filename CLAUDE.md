# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server on http://localhost:5173
npm run build        # tsc -b && vite build (typecheck blocks build)
npm run lint         # ESLint (flat config, eslint.config.js)
npm run test:rules   # Firestore rules tests via @firebase/rules-unit-testing
                     # Spins up firestore + auth emulators, runs vitest
npm run test:rules:database  # RTDB rules tests for /liveLocation
                     # Spins up the database emulator, runs vitest

# Run a single rules test
firebase emulators:exec --only firestore,auth --project tripmates-rules-test \
  "vitest run tests/firestore.rules.test.ts -t 'submanager CANNOT'"

# Type-check only (no build)
npx tsc --noEmit -p tsconfig.app.json

# Deploy
firebase deploy --only firestore:rules
firebase deploy --only storage
firebase deploy --only functions     # builds functions/ first via predeploy hook
firebase deploy --only hosting       # builds dist/ from `npm run build`
```

There is **no app-level test suite** — only `tests/firestore.rules.test.ts` covers security rules. Don't promise React component tests pass; we have none.

A **staging Firebase project** alias (`staging`) is declared in `.firebaserc` and the web SDK supports an env switch via `VITE_FIREBASE_ENV=staging` (see [src/services/firebase.ts](src/services/firebase.ts)). The actual project still has to be created in Firebase Console and the placeholder values in `STAGING_CONFIG` filled in — see [docs/staging-setup.md](docs/staging-setup.md). Until that's done, every deploy still hits prod (`alen-8797d`); treat rule and function deploys with care. When staging is wired, an amber `STAGING` strip ([EnvBanner.tsx](src/components/EnvBanner.tsx)) renders at the top of the app to disambiguate.

Cloud Functions live in `functions/` as a separate npm package (Node 22, region `europe-west1`). Currently only `scanReceipt` (Gemini-based OCR for expense receipts).

## Architecture

### Stack
- **React 19 + TypeScript strict** (incl. `noUnusedLocals`, `noUnusedParameters`)
- **Vite 8**, ESLint 9 flat config
- **Firebase 12**: Auth, Firestore, Storage, Realtime DB, Functions — initialized in [src/services/firebase.ts](src/services/firebase.ts) with hardcoded web API key
- **react-router-dom 7**, **react-globe.gl** + Three.js for the country globe, **leaflet** + Google Maps loader for trip maps, **recharts** (powers the INSIGHTS tab in [src/components/InsightsTab.tsx](src/components/InsightsTab.tsx))

### Routing topology — non-obvious
[src/App.tsx](src/App.tsx) has two distinct trees of protected routes:

1. **Layout-wrapped pages** (Home, Games, Explore, Profile, Gallery, etc.) — render inside `<Layout>` which provides the floating bottom-nav + the standard header with trip dropdown, search button, and hamburger menu. The `<Outlet>` renders the page.
2. **Admin pages outside Layout** (`/admin/:tripId`, activity editor) — render without the Layout wrapper. Uses its own back-button + slot pattern.

Layout decides header style via `isProfilePage = path.startsWith('/profile') || path.startsWith('/admin')` — but `/admin/*` doesn't actually go through Layout, so that check only really gates `/profile` styling. Profile pages portal a hamburger button into a header slot (`#profile-header-slot`) defined by Layout.

### Provider stack
Four contexts wrap the app, in order: `AuthProvider → TripProvider → EvenProvider → OddsProvider`. Hooks: `useAuth`, `useTrip`, `useEven`, `useOdds`. New users always get `role: 'user'`; admin grants are server-side only (see [docs/admin-grants.md](docs/admin-grants.md)). The Firestore rule on `users/{uid}` rejects role escalation from any authenticated client write, so even a compromised account cannot self-promote.

### Error tracking
Sentry is wired via [src/services/errorTracker.ts](src/services/errorTracker.ts) and initialised in [src/main.tsx](src/main.tsx). The SDK is **dynamically imported** so it's only downloaded when `VITE_SENTRY_DSN` is set — otherwise initialisation is a no-op and no `@sentry/react` code reaches the bundle. `AppErrorBoundary`'s `onError` calls `reportError()`. To enable: create a Sentry project, copy the DSN, set `VITE_SENTRY_DSN` in `.env.local` (dev) and the deploy environment (prod / staging). See [.env.example](.env.example).

### Firestore data model & rules
Two role concepts — don't conflate:
- `users/{uid}.role: 'admin' | 'user'` — global app role; admin is granted server-side only (see [docs/admin-grants.md](docs/admin-grants.md)).
- `trips/{tripId}.adminIds[]` — per-trip admin list. The trip's `createdBy` is the "head admin"; everyone else in `adminIds` is a "Submanager".

Rule helpers in [firestore.rules](firestore.rules): `isTripMember(tripId)`, `isTripAdmin(tripId)`. The trip update rule is split:
- **Creator** (`createdBy == uid`) — full update.
- **Submanager** (in `adminIds` but not creator) — may update everything *except* `createdBy`, `adminIds`, `members`. May not delete the trip.

When adding new mutating call paths on trips, keep in mind that `isTripAdmin` does not differentiate the creator. If your rule cares about it, check `resource.data.createdBy == request.auth.uid`.

Gallery has three update rules layered: like-toggle (only `likes`), uploader/admin tag edit (activityId/Name/taggedMembers), and **any-trip-member tag-people-only** (just `taggedMembers`). The third was added so members can tag friends in photos they didn't upload.

User-doc email field is intentionally absent — `auth.currentUser.email` is the only source of truth. Phone has the same posture: `phoneNumber` lives in `users/{uid}/private/contact` (rule: owner always; others iff `sharePhoneNumber == true`); only `sharePhoneNumber` (the opt-in flag) remains on the public doc. Use `services/userContact.ts` for read/write — never touch the subcollection directly.

### Search
[src/utils/searchFields.ts](src/utils/searchFields.ts) derives `nameLower` and `lastNameLower` (lowercase + diacritic-stripped) at user-doc write time. Layout's user search ([Layout.tsx](src/components/Layout.tsx) `runSearch`) queries those two fields plus the `usernames/{handle}` collection in parallel and merges by uid. Email and phone are deliberately not searchable (GDPR + enumeration risk). When you add a new write path that touches `name`/`lastName`, call `deriveUserSearchFields` and merge the result into the payload — otherwise the doc disappears from search.

### Module CSS convention
Every component has `Foo.tsx` + `Foo.module.css` colocated. Global styles live in [src/App.css](src/App.css) (theme variables, `.input-field`, `.btn`, `.glass-panel`) and [src/index.css](src/index.css) (resets, `.app-container`). The app is themed via classes on the body (`theme-default-trip`, `theme-bachelor-party`) that swap `--color-*` CSS variables. Mobile-first, hard-capped to `max-width: 480px` on `.app-container`.

### Storage layout
- `avatars/{uid}/avatar.{ext}` — 10 MB cap, authenticated read.
- `trips/{tripId}/...` — 25 MB cap, authenticated read.

Storage reads now require `request.auth != null`. Trade-off: link-preview bots (iMessage, Slack, Twitter, etc.) can't fetch the underlying images, so Open Graph / Twitter card previews on shared TripMates URLs render without the trip image. The text/title still works since `index.html` is publicly served. This was a deliberate choice — keeping trip galleries and avatars private wins over previews.

### Live location (RTDB-backed)
Real-time member-position sharing on the Map page. Architecture:

- **Per-device mode** (`Off / 3h / 24h / Whole trip / Always on`) is stored in `localStorage` (`liveLocation:{tripId}:mode`). Not synced across devices — picking "always on" on your phone doesn't auto-share from your laptop.
- **`<LiveLocationDaemon>`** in [src/components/LiveLocationDaemon.tsx](src/components/LiveLocationDaemon.tsx) is mounted once at app root (inside `TripProvider`). It iterates all `userTrips`, broadcasts position to RTDB at `liveLocation/{tripId}/{uid}` for trips with mode ≠ off, schedules auto-stop at expiry, and stops cleanly on master-switch flip / mode change. Throttles to 30s OR 50m moved (`MIN_INTERVAL_MS` / `MIN_DISTANCE_M` in [src/services/liveLocation.ts](src/services/liveLocation.ts)).
- **Native vs web**: on Capacitor (iOS/Android), uses `@capacitor-community/background-geolocation` with a foreground-service notification that lets the watcher continue while the app is backgrounded. iOS needs `NSLocationAlwaysAndWhenInUseUsageDescription` + `UIBackgroundModes: [location]` in Info.plist; Android needs `ACCESS_BACKGROUND_LOCATION` + `FOREGROUND_SERVICE_LOCATION` in the manifest. On the web (dev preview), falls back to `navigator.geolocation.watchPosition` — no background support there, but the foreground UX matches.
- **Map rendering**: [src/pages/MapPage.tsx](src/pages/MapPage.tsx) subscribes to `liveLocation/{activeTrip.id}` via `subscribeToTripLocations()` for live pins, and falls back to the Firestore `users/{uid}.lastKnownLocation` field for a dimmed "last seen HH:MM" pin once a session has expired.
- **`liveLocationCleanup` Cloud Function** ([functions/src/index.ts](functions/src/index.ts)) runs on a 10-minute schedule. For every RTDB entry whose `expiresAt` has passed (with a 60s grace window), it copies the position to Firestore `users/{uid}.lastKnownLocation` *first*, then deletes the RTDB entry. This is what makes "pin doesn't disappear at expiry" work without paying per-tick Firestore writes — Firestore is touched once at session end, not on every position update. The function uses `minInstances: 0` (overrides the codebase-wide `setGlobalOptions({ minInstances: 1 })`) since cold start is invisible for a scheduled job.
- **RTDB rules** ([database.rules.json](database.rules.json)): default-deny at root; `/liveLocation/{tripId}/{uid}` is writable only by `auth.uid == $uid`, validated for lat/lng range and the four allowed mode strings (`'off'` is intentionally rejected — off is represented by deletion, never a written value); reads are gated on `auth != null` only (NOT trip membership — RTDB rules can't query Firestore. See [docs/superpowers/plans/2026-04-30-rtdb-livelocation-membership.md](docs/superpowers/plans/2026-04-30-rtdb-livelocation-membership.md) for the planned hardening).
- **Picker UI**: [src/components/LiveLocationPicker.tsx](src/components/LiveLocationPicker.tsx) is rendered on the Map page (compact pill) and embedded in [src/components/LiveLocationProfileSection.tsx](src/components/LiveLocationProfileSection.tsx) for per-trip overview in Profile/Settings. The compact menu closes on outside-pointerdown and Escape. When the master kill switch (`appUser.shareLocation === false`) is off, the pill renders inactive (no green dot) and the menu shows a hint pointing at Profile → Settings.

When adding new write paths into `liveLocation/{...}`: the rules validate `$other: false`, so any extra leaf key is rejected — keep payloads on the documented shape (`lat`, `lng`, `accuracy`, `heading`, `updatedAt`, `expiresAt`, `mode`).

## Conventions worth knowing

- **TypeScript strict + noUnused everything**. Don't leave parameters unused; prefix with `_` or remove.
- **Type-check before claiming done**: `npx tsc --noEmit -p tsconfig.app.json` is the canonical quick check; build re-runs it.
- **Don't add component tests** unless asked — the suite is rules-only and adding a flaky React test runner without consensus creates noise.
- **GDPR posture**: see [src/pages/Privacy.tsx](src/pages/Privacy.tsx) — the policy is marked as draft. Self-service account deletion (`deleteUserAccount`) and data export (`exportUserData`) are both wired through Profile → Settings → Danger zone, calling Cloud Functions in [functions/src/index.ts](functions/src/index.ts).
- **No PWA manifest** despite the apple-mobile-web-app meta tags. The app behaves like a webapp; install-as-app is not yet wired.
- **Onboarding humans**: [ONBOARDING.md](ONBOARDING.md) is for non-technical contributors (GitHub Desktop, Xcode, Capacitor for iOS/Android beta). Don't duplicate that content here.
