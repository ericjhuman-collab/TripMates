# GDPR Data Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Self-service data export (GDPR Art. 20 right to portability) so users can download a structured JSON of their personal data without contacting support. Closes audit High #10.

**Architecture:** Cloud Function `exportUserData` (callable, auth-required). Aggregates the user's profile + private contact + username + trip memberships + their own gallery uploads + their own expenses + payments they're party to + follow relationships, and returns one JSON object. Client wrapper turns the response into a downloadable `tripmates-data-<uid>-<date>.json` file. UI button sits next to Delete in Profile's danger zone.

**Out of scope for this plan:** ZIP packaging, image binary export (only image URLs are included), notifications. These can come later if the data set grows.

**Tech Stack:** Firebase Functions v2 (Node 22), firebase-admin, browser Blob/URL.createObjectURL.

---

## File Structure

| File | Purpose |
|---|---|
| `functions/src/index.ts` | Modify — append `exportUserData` callable |
| `src/services/userAccount.ts` | Modify — add `downloadMyDataExport()` wrapper |
| `src/pages/Profile.tsx` | Modify — add "Download my data" button + handler |
| `CLAUDE.md` | Modify — note data export exists |

---

### Task 1: Cloud Function `exportUserData`

**Files:**
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Append the new callable**

At the end of `functions/src/index.ts`, append:

```ts
/**
 * Self-service data export.
 *
 * Returns the requesting user's owned records as a single JSON object.
 * Includes: profile, private contact, username, trip memberships, the
 * user's own gallery uploads / expenses / payments / follow relationships.
 * Does NOT include image binaries (URLs only) or notifications.
 *
 * Designed for browser-side download — keeps response under a few MB
 * for typical accounts. minInstances: 0 since exports are infrequent.
 */
export const exportUserData = onCall({ minInstances: 0 }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
        throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const exportPayload: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        uid,
        email: req.auth?.token?.email ?? null,
    };

    // 1. Public user doc
    const userSnap = await db.doc(`users/${uid}`).get();
    exportPayload.profile = userSnap.exists ? userSnap.data() : null;

    // 2. Private contact subcollection
    const privateSnap = await db.collection(`users/${uid}/private`).get();
    exportPayload.privateContact = privateSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 3. Username reservation (looked up via the user doc)
    const username = userSnap.exists ? (userSnap.data()?.username as string | undefined) : undefined;
    if (username) {
        const usernameSnap = await db.doc(`usernames/${username}`).get();
        exportPayload.username = usernameSnap.exists
            ? { handle: usernameSnap.id, ...usernameSnap.data() }
            : null;
    } else {
        exportPayload.username = null;
    }

    // 4. Trip memberships (full trip docs the user is a member of)
    const tripsSnap = await db.collection('trips')
        .where('members', 'array-contains', uid)
        .get();
    exportPayload.trips = tripsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const tripIds = tripsSnap.docs.map(d => d.id);

    // 5. Gallery uploads in any of the user's trips that THIS user uploaded
    const galleryUploads: unknown[] = [];
    for (const tripId of tripIds) {
        const gSnap = await db.collection(`trips/${tripId}/gallery`)
            .where('uploadedBy', '==', uid)
            .get();
        for (const g of gSnap.docs) {
            galleryUploads.push({ tripId, id: g.id, ...g.data() });
        }
    }
    exportPayload.galleryUploads = galleryUploads;

    // 6. Expenses created or paid by the user (top-level collection)
    const expensesByCreator = await db.collection('expenses')
        .where('creatorId', '==', uid)
        .get();
    const expensesByPayer = await db.collection('expenses')
        .where('payerId', '==', uid)
        .get();
    const expenseMap = new Map<string, Record<string, unknown>>();
    for (const e of expensesByCreator.docs) expenseMap.set(e.id, { id: e.id, ...e.data() });
    for (const e of expensesByPayer.docs) expenseMap.set(e.id, { id: e.id, ...e.data() });
    exportPayload.expenses = Array.from(expenseMap.values());

    // 7. Payments where user is sender or receiver
    const paymentsFrom = await db.collection('payments')
        .where('fromUid', '==', uid)
        .get();
    const paymentsTo = await db.collection('payments')
        .where('toUid', '==', uid)
        .get();
    const paymentMap = new Map<string, Record<string, unknown>>();
    for (const p of paymentsFrom.docs) paymentMap.set(p.id, { id: p.id, ...p.data() });
    for (const p of paymentsTo.docs) paymentMap.set(p.id, { id: p.id, ...p.data() });
    exportPayload.payments = Array.from(paymentMap.values());

    // 8. Follow relationships (just the arrays — pointers, not the followed users' data)
    const data = userSnap.exists ? userSnap.data() ?? {} : {};
    exportPayload.follows = {
        following: Array.isArray(data.following) ? data.following : [],
        followers: Array.isArray(data.followers) ? data.followers : [],
        friends: Array.isArray(data.friends) ? data.friends : [],
    };

    return exportPayload;
});
```

- [ ] **Step 2: Build**

Run: `npm --prefix functions run build`
Expected: exit 0.

- [ ] **Step 3: Deploy**

Run: `firebase deploy --only functions:exportUserData`
Expected: ends with `✔  Deploy complete!`. (~1-2 min for cold deploy.)

- [ ] **Step 4: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat(functions): exportUserData callable for GDPR portability

Returns the caller's profile + private contact + username + trip
memberships + own gallery uploads + own expenses + payments party-to
+ follow relationships as a single JSON object. Excludes image
binaries (URLs only) and notifications. minInstances: 0 since
exports are infrequent.

Closes audit High #10 (no self-service GDPR export)."
```

---

### Task 2: Client wrapper

**Files:**
- Modify: `src/services/userAccount.ts` (add new export, don't touch existing one)

- [ ] **Step 1: Append `downloadMyDataExport` to userAccount.ts**

Open `src/services/userAccount.ts`. Add this import to the existing import block:
```ts
import { httpsCallable, FunctionsError } from 'firebase/functions';
```
(Already present — just verify.)

At the end of the file, append:

```ts
const exportUserDataCallable = httpsCallable<void, Record<string, unknown>>(functions, 'exportUserData');

/**
 * Triggers a JSON file download with the caller's data export. The file is
 * named `tripmates-data-{uid}-{YYYY-MM-DD}.json` and uses a Blob URL so no
 * server round-trip beyond the function call. Throws on failure; the
 * caller can show the message inline.
 */
export async function downloadMyDataExport(): Promise<void> {
    let payload: Record<string, unknown>;
    try {
        const result = await exportUserDataCallable();
        payload = result.data;
    } catch (err) {
        if (err instanceof FunctionsError) {
            throw new Error(err.message);
        }
        throw err;
    }

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const uid = typeof payload.uid === 'string' ? payload.uid : 'me';
    const filename = `tripmates-data-${uid}-${today}.json`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
```

- [ ] **Step 2: Type-check + commit**

```
npx tsc --noEmit -p tsconfig.app.json
```
Expected: exit 0.

```bash
git add src/services/userAccount.ts
git commit -m "feat(services): downloadMyDataExport wrapper

Calls exportUserData, packages the response as a JSON Blob, and
triggers a browser download via a synthetic <a download>. Filename
includes uid + ISO date for traceability."
```

---

### Task 3: Profile button + handler

**Files:**
- Modify: `src/pages/Profile.tsx`

- [ ] **Step 1: Add export-state and handler near the delete-account ones**

In `src/pages/Profile.tsx`, in the same area where you added `showDeleteModal` etc, add:

```tsx
    const [exportInProgress, setExportInProgress] = useState(false);
    const [exportError, setExportError] = useState('');
```

Add a handler near `handleDeleteAccount`:
```tsx
    const handleDownloadDataExport = async () => {
        setExportError('');
        setExportInProgress(true);
        try {
            const { downloadMyDataExport } = await import('../services/userAccount');
            await downloadMyDataExport();
        } catch (err) {
            console.error('Data export failed', err);
            setExportError(err instanceof Error ? err.message : 'Could not download export.');
        } finally {
            setExportInProgress(false);
        }
    };
```

- [ ] **Step 2: Add a button at the top of the Danger zone block**

In Profile.tsx, find the danger-zone block you added in Plan 7 (`<h3 className={styles.dangerZoneTitle}>Danger zone</h3>`). Right BEFORE that `<h3>` (so the export sits visually separate from the destructive action), add:

```tsx
                        <div className={styles.exportZone}>
                            <h3 className={styles.exportZoneTitle}>Export your data</h3>
                            <p className={styles.exportZoneText}>
                                Download a JSON copy of your profile, trips, gallery uploads,
                                expenses, payments and follow relationships.
                            </p>
                            <button
                                type="button"
                                className={`btn ${styles.exportBtn}`}
                                onClick={handleDownloadDataExport}
                                disabled={exportInProgress}
                            >
                                {exportInProgress ? 'Preparing…' : 'Download my data'}
                            </button>
                            {exportError && <p className={styles.exportError}>{exportError}</p>}
                        </div>
                        <hr className={styles.divider} />
```

- [ ] **Step 3: Add CSS**

Append to `src/pages/Profile.module.css`:

```css
/* ── Export your data ─────────────────────── */
.exportZone {
    margin-top: 1.5rem;
    padding: 1rem;
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 12px;
}

.exportZoneTitle {
    margin: 0 0 0.5rem;
    color: #075985;
    font-size: 1rem;
    font-weight: 700;
}

.exportZoneText {
    margin: 0 0 0.75rem;
    color: #075985;
    font-size: 0.85rem;
    line-height: 1.5;
}

.exportBtn {
    background: #0284c7;
    color: #fff;
    border: none;
    border-radius: 999px;
    padding: 0.6rem 1.25rem;
    font-size: 0.9rem;
    font-weight: 600;
}

.exportBtn:hover:not(:disabled) {
    background: #0369a1;
}

.exportBtn:disabled {
    opacity: 0.6;
    cursor: wait;
}

.exportError {
    color: #991b1b;
    font-size: 0.85rem;
    margin: 0.5rem 0 0;
}
```

- [ ] **Step 4: Type-check + commit**

```
npx tsc --noEmit -p tsconfig.app.json
```
Expected: exit 0.

```bash
git add src/pages/Profile.tsx src/pages/Profile.module.css
git commit -m "feat(profile): self-service data export button

Adds a 'Download my data' button in Profile settings that calls the
new exportUserData Cloud Function and saves the JSON locally.
Errors surface inline beneath the button."
```

---

### Task 4: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the GDPR posture line**

Find:
```markdown
- **GDPR posture**: see [src/pages/Privacy.tsx](src/pages/Privacy.tsx) — the policy is marked as draft. Self-service account deletion is wired (Profile → Settings → Danger zone → calls the `deleteUserAccount` Cloud Function in [functions/src/index.ts](functions/src/index.ts)). Data export is still TODO.
```

Replace with:
```markdown
- **GDPR posture**: see [src/pages/Privacy.tsx](src/pages/Privacy.tsx) — the policy is marked as draft. Self-service account deletion (`deleteUserAccount`) and data export (`exportUserData`) are both wired through Profile → Settings → Danger zone, calling Cloud Functions in [functions/src/index.ts](functions/src/index.ts).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note self-service data export in CLAUDE.md"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Cloud Function (Task 1)
- ✅ Client wrapper with browser download (Task 2)
- ✅ UI button + handler (Task 3)
- ✅ Docs (Task 4)
- N/A: Notifications, image binaries, ZIP — explicitly out of scope.

**2. Placeholder scan:** No "TBD" / "appropriate" / "etc." in any task body. ✓

**3. Type/path consistency:**
- `httpsCallable<void, Record<string, unknown>>` matches the function's flexible return type ✓
- Blob URL revoked after 60s so we don't leak (download.click is synchronous) ✓
- Filename includes ISO date so re-exports don't overwrite ✓
- Both `creatorId` and `payerId` queries on expenses (and `fromUid`/`toUid` on payments) use a Map to dedupe doc ids ✓

---

## Execution Handoff

4 tasks, ~2-3h. **Inline execution** — same shape as Plan 7.
