# Production-Readiness Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three independently valuable infrastructure pieces — global error boundary, composite Firestore indexes, prod console-stripping — so subsequent launch-readiness work has a solid base.

**Architecture:** Pure additive changes, no migrations. Error boundary wraps the existing `<App>` provider tree. Indexes are declared in `firestore.indexes.json` and deployed via `firebase deploy --only firestore:indexes`. Console-stripping uses Vite's built-in `esbuild.drop` for prod builds only.

**Tech Stack:** React 19 + react-error-boundary 6, Firebase Firestore CLI, Vite 8 / esbuild.

---

## File Structure

| File | Purpose |
|---|---|
| `src/components/AppErrorBoundary.tsx` | New — fallback UI + reset handler, wraps the route tree |
| `src/App.tsx` | Modify — wrap `<Router>` content with `<AppErrorBoundary>` |
| `firestore.indexes.json` | Modify — declare 3 composite indexes for known queries |
| `vite.config.ts` | Modify — add `esbuild.drop` for prod console suppression |

---

### Task 1: Global Error Boundary

**Files:**
- Create: `src/components/AppErrorBoundary.tsx`
- Modify: `src/App.tsx` (wrap inside `<Router>`)

- [ ] **Step 1: Create the boundary component**

`src/components/AppErrorBoundary.tsx`:
```tsx
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';

function Fallback({ error, resetErrorBoundary }: FallbackProps) {
    return (
        <div role="alert" style={{
            padding: '2rem',
            maxWidth: 480,
            margin: '4rem auto',
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 8px 30px rgba(30, 58, 95, 0.08)',
            textAlign: 'center',
        }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem', color: '#1e3a5f' }}>
                Något gick fel
            </h1>
            <p style={{ color: '#6b7280', marginBottom: '1.25rem' }}>
                Appen råkade ut för ett oväntat fel. Försök igen — om det återkommer, kontakta support.
            </p>
            {import.meta.env.DEV && (
                <pre style={{
                    textAlign: 'left',
                    background: '#fef2f2',
                    color: '#991b1b',
                    padding: '0.75rem',
                    borderRadius: 8,
                    fontSize: '0.75rem',
                    overflow: 'auto',
                    maxHeight: 200,
                    marginBottom: '1rem',
                }}>{error.message}</pre>
            )}
            <button
                onClick={resetErrorBoundary}
                style={{
                    background: '#1e3a5f', color: '#fff', border: 'none',
                    padding: '0.75rem 1.5rem', borderRadius: 999, cursor: 'pointer',
                    fontSize: '0.95rem', fontWeight: 600,
                }}
            >
                Försök igen
            </button>
        </div>
    );
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
    return (
        <ErrorBoundary
            FallbackComponent={Fallback}
            onError={(error, info) => {
                // Production hook for Sentry / Crashlytics later.
                console.error('Unhandled app error:', error, info.componentStack);
            }}
        >
            {children}
        </ErrorBoundary>
    );
}
```

- [ ] **Step 2: Wire it into `src/App.tsx`**

Modify `src/App.tsx` — add import alongside existing component imports:
```tsx
import { AppErrorBoundary } from './components/AppErrorBoundary';
```

Wrap the existing `<Router>` body. Replace:
```tsx
<Router>
  <AuthProvider>
```
with:
```tsx
<Router>
  <AppErrorBoundary>
    <AuthProvider>
```
And add the matching closer immediately before `</Router>`:
```tsx
        </OddsProvider>
      </EvenProvider>
    </TripProvider>
  </AuthProvider>
  </AppErrorBoundary>
</Router>
```

(Indent existing lines one level to match.)

- [ ] **Step 3: Smoke-test it manually**

Temporarily throw inside `<Home>`:
```tsx
// in src/pages/Home.tsx, very top of the component body
throw new Error('Boundary smoke-test');
```

Run: `npm run dev`. Open `http://localhost:5173` after login. Expected: fallback UI renders, "Försök igen"-button visible. Click resets state.

Remove the throw before commit.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: exit code 0, no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppErrorBoundary.tsx src/App.tsx
git commit -m "feat(stability): add global ErrorBoundary fallback

Wraps the provider/route tree so an unhandled render error shows a
recoverable fallback instead of a white screen. The onError hook is
the future plug-in point for Sentry / Crashlytics."
```

---

### Task 2: Composite Firestore Indexes

**Files:**
- Modify: `firestore.indexes.json`
- Verify against: `src/services/activities.ts:40-44`, `src/services/even.ts:121`, `src/services/gallery.ts:91-95`

The known production queries that combine `where(...) where(...)` or `where(...) orderBy(...)`:
1. `activities` collection: `tripId == X && day == Y` ([activities.ts:42-43](src/services/activities.ts#L42-L43))
2. `payments` collection: `tripId == X && status == "PENDING"` ([even.ts:121](src/services/even.ts#L121))
3. `trips/{tripId}/gallery` subcollection: `activityId == X` + `orderBy(createdAt desc)` ([gallery.ts:91-95](src/services/gallery.ts#L91-L95))

The single-`orderBy` queries on gallery (gallery.ts:121, 150) only sort by `createdAt` — no composite needed; auto-indexed.

- [ ] **Step 1: Replace `firestore.indexes.json` content**

Replace the entire current file (which is template comments + empty arrays) with:

```json
{
  "indexes": [
    {
      "collectionGroup": "activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "tripId", "order": "ASCENDING" },
        { "fieldPath": "day", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "payments",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "tripId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "gallery",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "activityId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 2: Validate JSON locally**

Run: `node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8'))"`
Expected: no output (success). On failure: `SyntaxError`.

- [ ] **Step 3: Deploy indexes**

Run: `firebase deploy --only firestore:indexes`
Expected output ends with `✔  Deploy complete!`. Index build takes a few minutes in the background — that's OK.

- [ ] **Step 4: Verify in console**

Open https://console.firebase.google.com/project/alen-8797d/firestore/indexes
Expected: three composite indexes listed, status `Building` or `Enabled`.

- [ ] **Step 5: Commit**

```bash
git add firestore.indexes.json
git commit -m "feat(firestore): declare composite indexes for known queries

Activities (tripId + day), payments (tripId + status), and gallery
(activityId + createdAt desc) all combine multiple constraints. Without
declared indexes the queries either fail or rely on auto-creation prompts
in the console — bad UX for users hitting them at runtime."
```

---

### Task 3: Strip console output in prod builds

**Files:**
- Modify: `vite.config.ts`
- Verify with: `npm run build`

The codebase has 113 `console.*` calls. In dev they help; in prod they pollute and obscure real Sentry events later. Vite's `esbuild.drop` removes them at build time only.

- [ ] **Step 1: Replace `vite.config.ts` content**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
  },
  esbuild: {
    // Strip console.log/debug/info/warn from production bundles. Keep
    // console.error so genuine failures still surface to the user agent
    // and to any future error-tracker (Sentry) hook.
    drop: ['debugger'],
    pure: ['console.log', 'console.debug', 'console.info', 'console.warn'],
  },
})
```

- [ ] **Step 2: Build and grep the output**

Run: `npm run build`
Expected: build completes (`dist/` produced).

Run: `grep -r "console.log\|console.warn\|console.info\|console.debug" dist/assets/*.js | head -5`
Expected: zero matches (calls have been treated as side-effect-free and removed).

Run: `grep -c "console.error" dist/assets/*.js | head -3`
Expected: positive number — `console.error` calls are intentionally preserved.

- [ ] **Step 3: Type-check (sanity)**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: exit code 0, no output.

- [ ] **Step 4: Smoke-test dev still logs**

Run: `npm run dev`. Open browser console on `http://localhost:5173`. Trigger any code path that has a `console.log` (e.g. interact normally). Expected: log appears (dev path is unaffected by `esbuild.drop`).

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts
git commit -m "build: strip console.log/info/debug/warn from prod bundles

Dev builds are unaffected — esbuild only treats those calls as pure (and
therefore dead-code-eliminates them) under build. console.error is kept
so genuine production failures still reach the browser console and any
future Sentry hook. Sourcemaps are also explicitly disabled for prod."
```

---

## Self-Review Checklist (run before handoff)

**1. Spec coverage:**
- ✅ Error Boundary (Task 1)
- ✅ Composite indexes (Task 2)
- ✅ Console stripping (Task 3)

**2. Placeholder scan:** No "TBD" / "appropriate" / "etc." in any task body. ✓

**3. Type/path consistency:**
- `AppErrorBoundary` named import matches export ✓
- `firestore.indexes.json` matches `firebase.json` declared path ✓
- File paths in queries match what was grep:ed ✓

---

## Execution Handoff

Two execution options:

1. **Subagent-Driven** — fresh subagent per task, review between tasks (recommended for plans with > 3 tasks; less critical here).
2. **Inline Execution** — run all three tasks sequentially in this session via `executing-plans`.

For this plan (3 small tasks, ~90min total), **inline execution is the right pick**. Each task ends in a commit so we have natural checkpoints already.
