# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server on http://localhost:5173
npm run build        # tsc -b && vite build (typecheck blocks build)
npm run lint         # ESLint (flat config, eslint.config.js)
npm run test:rules   # Firestore rules tests via @firebase/rules-unit-testing
                     # Spins up firestore + auth emulators, runs vitest

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

There is **no staging Firebase project** — `.firebaserc` only defines `alen-8797d` (prod). Anything you deploy hits real users. Treat rule and function deploys with care.

Cloud Functions live in `functions/` as a separate npm package (Node 22, region `europe-west1`). Currently only `scanReceipt` (Gemini-based OCR for expense receipts).

## Architecture

### Stack
- **React 19 + TypeScript strict** (incl. `noUnusedLocals`, `noUnusedParameters`)
- **Vite 8**, ESLint 9 flat config
- **Firebase 12**: Auth, Firestore, Storage, Realtime DB, Functions — initialized in [src/services/firebase.ts](src/services/firebase.ts) with hardcoded web API key
- **react-router-dom 7**, **react-globe.gl** + Three.js for the country globe, **leaflet** + Google Maps loader for trip maps, **recharts** (currently unused — flag candidate)

### Routing topology — non-obvious
[src/App.tsx](src/App.tsx) has two distinct trees of protected routes:

1. **Layout-wrapped pages** (Home, Games, Explore, Profile, Gallery, etc.) — render inside `<Layout>` which provides the floating bottom-nav + the standard header with trip dropdown, search button, and hamburger menu. The `<Outlet>` renders the page.
2. **Admin pages outside Layout** (`/admin/:tripId`, activity editor) — render without the Layout wrapper. Uses its own back-button + slot pattern.

Layout decides header style via `isProfilePage = path.startsWith('/profile') || path.startsWith('/admin')` — but `/admin/*` doesn't actually go through Layout, so that check only really gates `/profile` styling. Profile pages portal a hamburger button into a header slot (`#profile-header-slot`) defined by Layout.

### Provider stack
Four contexts wrap the app, in order: `AuthProvider → TripProvider → EvenProvider → OddsProvider`. Hooks: `useAuth`, `useTrip`, `useEven`, `useOdds`. New users always get `role: 'user'`; admin grants are server-side only (see [docs/admin-grants.md](docs/admin-grants.md)). The Firestore rule on `users/{uid}` rejects role escalation from any authenticated client write, so even a compromised account cannot self-promote.

### Firestore data model & rules
Two role concepts — don't conflate:
- `users/{uid}.role: 'admin' | 'user'` — global app role; admin is granted server-side only (see [docs/admin-grants.md](docs/admin-grants.md)).
- `trips/{tripId}.adminIds[]` — per-trip admin list. The trip's `createdBy` is the "head admin"; everyone else in `adminIds` is a "Submanager".

Rule helpers in [firestore.rules](firestore.rules): `isTripMember(tripId)`, `isTripAdmin(tripId)`. The trip update rule is split:
- **Creator** (`createdBy == uid`) — full update.
- **Submanager** (in `adminIds` but not creator) — may update everything *except* `createdBy`, `adminIds`, `members`. May not delete the trip.

When adding new mutating call paths on trips, keep in mind that `isTripAdmin` does not differentiate the creator. If your rule cares about it, check `resource.data.createdBy == request.auth.uid`.

Gallery has three update rules layered: like-toggle (only `likes`), uploader/admin tag edit (activityId/Name/taggedMembers), and **any-trip-member tag-people-only** (just `taggedMembers`). The third was added so members can tag friends in photos they didn't upload.

User-doc email field is intentionally absent — `auth.currentUser.email` is the only source of truth. Phone (`phoneNumber` + `sharePhoneNumber`) still lives on the user doc to support trip-member phone display in Members.tsx, but is a known PII gap pending a follow-up plan.

### Search
[src/utils/searchFields.ts](src/utils/searchFields.ts) derives `nameLower` and `lastNameLower` (lowercase + diacritic-stripped) at user-doc write time. Layout's user search ([Layout.tsx](src/components/Layout.tsx) `runSearch`) queries those two fields plus the `usernames/{handle}` collection in parallel and merges by uid. Email and phone are deliberately not searchable (GDPR + enumeration risk). When you add a new write path that touches `name`/`lastName`, call `deriveUserSearchFields` and merge the result into the payload — otherwise the doc disappears from search.

### Module CSS convention
Every component has `Foo.tsx` + `Foo.module.css` colocated. Global styles live in [src/App.css](src/App.css) (theme variables, `.input-field`, `.btn`, `.glass-panel`) and [src/index.css](src/index.css) (resets, `.app-container`). The app is themed via classes on the body (`theme-default-trip`, `theme-bachelor-party`) that swap `--color-*` CSS variables. Mobile-first, hard-capped to `max-width: 480px` on `.app-container`.

### Storage layout
- `avatars/{uid}/avatar.{ext}` — 10 MB cap, public read.
- `trips/{tripId}/...` — 25 MB cap, public read.

Public read on storage is currently a deliberate-or-accidental design choice — verify before depending on it.

## Conventions worth knowing

- **TypeScript strict + noUnused everything**. Don't leave parameters unused; prefix with `_` or remove.
- **Type-check before claiming done**: `npx tsc --noEmit -p tsconfig.app.json` is the canonical quick check; build re-runs it.
- **Don't add component tests** unless asked — the suite is rules-only and adding a flaky React test runner without consensus creates noise.
- **GDPR posture**: see [src/pages/Privacy.tsx](src/pages/Privacy.tsx) — the policy is marked as draft and promises features (data export, account deletion) that aren't implemented yet. Keep that in mind when adding anything that collects new fields.
- **No PWA manifest** despite the apple-mobile-web-app meta tags. The app behaves like a webapp; install-as-app is not yet wired.
- **Onboarding humans**: [ONBOARDING.md](ONBOARDING.md) is for non-technical contributors (GitHub Desktop, Xcode, Capacitor for iOS/Android beta). Don't duplicate that content here.
