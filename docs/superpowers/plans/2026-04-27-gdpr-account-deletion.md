# GDPR Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Self-service account deletion (GDPR Art. 17 right to erasure) so users can remove themselves without contacting support. Closes audit High #9.

**Architecture:** Cloud Function `deleteUserAccount` (callable, auth-required). Hard-deletes user-identifying docs + auth account; leaves financial / shared-trip data untouched (settle-up correctness). Trip memberships are removed via member/adminId array splice. UI in Profile shows a confirmation modal requiring the user to type "DELETE" before the call fires.

**What gets hard-deleted:**
- `users/{uid}` doc
- `users/{uid}/private/{*}` subcollection
- `usernames/{handle}` reservation (looked up from the user doc)
- `avatars/{uid}/*` in Storage
- Firebase Auth account

**What stays (with dangling uid references):**
- Trip docs (the user is removed from `members[]` and `adminIds[]`, trip itself stays for other members)
- Gallery photos uploaded by the user
- Expenses / payments the user created or paid
- (App displays "Unknown user" gracefully when uid resolution fails)

**Tech Stack:** Firebase Functions v2 (Node 22), firebase-admin, React 19.

---

## File Structure

| File | Purpose |
|---|---|
| `functions/src/index.ts` | Modify — add `deleteUserAccount` callable |
| `src/services/userAccount.ts` | Create — client wrapper for the callable |
| `src/pages/Profile.tsx` | Modify — add a "Danger zone" section with the delete button + modal |
| `src/pages/Profile.module.css` | Modify — styles for the danger zone block |
| `CLAUDE.md` | Modify — note self-service deletion exists |

---

### Task 1: Cloud Function `deleteUserAccount`

**Files:**
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Append the new callable to `functions/src/index.ts`**

At the end of the file, append:

```ts
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

/**
 * Self-service account deletion.
 *
 * Hard-deletes user-identifying records (user doc + private subcollection +
 * username reservation + avatar storage + auth account) and removes the
 * user from every trip they're a member of. Financial / shared-trip
 * artefacts (expenses, payments, gallery photos) keep their original uid
 * references so cross-user balances and history stay correct; the UI
 * displays "Unknown user" wherever the uid no longer resolves.
 *
 * The auth account is deleted last so a partial failure leaves the user
 * able to retry from the same session.
 */
export const deleteUserAccount = onCall(async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
        throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : null;

    // 1. Remove uid from every trip they belong to.
    const tripsSnap = await db.collection('trips')
        .where('members', 'array-contains', uid)
        .get();
    if (tripsSnap.size > 0) {
        const batch = db.batch();
        for (const trip of tripsSnap.docs) {
            batch.update(trip.ref, {
                members: FieldValue.arrayRemove(uid),
                adminIds: FieldValue.arrayRemove(uid),
            });
        }
        await batch.commit();
    }

    // 2. Delete private subcollection (currently a single 'contact' doc).
    const privateSnap = await userRef.collection('private').get();
    if (privateSnap.size > 0) {
        const batch = db.batch();
        for (const d of privateSnap.docs) batch.delete(d.ref);
        await batch.commit();
    }

    // 3. Release the username reservation, if any.
    const username = userData && typeof userData.username === 'string' ? userData.username : null;
    if (username) {
        await db.doc(`usernames/${username}`).delete().catch(() => undefined);
    }

    // 4. Delete the user doc itself.
    await userRef.delete();

    // 5. Wipe the avatar folder in Storage. Best-effort — failures don't
    //    block deletion of identity records.
    try {
        const bucket = getStorage().bucket();
        await bucket.deleteFiles({ prefix: `avatars/${uid}/` });
    } catch (err) {
        console.warn('Avatar storage cleanup failed', err);
    }

    // 6. Delete the auth account last. After this the client's auth state
    //    becomes invalid; the UI signs out and redirects.
    try {
        await getAuth().deleteUser(uid);
    } catch (err) {
        console.error('Auth user deletion failed', err);
        throw new HttpsError(
            'internal',
            'Profile data was removed but the auth account could not be deleted. Contact support.',
        );
    }

    return { ok: true };
});
```

- [ ] **Step 2: Build the functions package**

Run: `npm --prefix functions run build`
Expected: exit 0, no TS errors.

- [ ] **Step 3: Deploy**

Run: `firebase deploy --only functions:deleteUserAccount`
Expected: ends with `✔ Deploy complete!`. (First deploy of the function may take ~1-2 minutes.)

- [ ] **Step 4: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat(functions): deleteUserAccount callable for GDPR erasure

Hard-deletes user/{uid} + private subcollection + username reservation
+ avatar storage + auth account. Removes uid from every trip's
members[]/adminIds[] arrays. Leaves financial/shared-trip artefacts
intact (expenses, payments, gallery photos) so settle-up math stays
correct; UI shows 'Unknown user' wherever the uid no longer resolves.

Closes audit High #9 (no self-service GDPR deletion)."
```

---

### Task 2: Client wrapper

**Files:**
- Create: `src/services/userAccount.ts`

- [ ] **Step 1: Create the wrapper**

```ts
import { httpsCallable, FunctionsError } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { auth, functions } from './firebase';

const deleteUserAccountCallable = httpsCallable<void, { ok: boolean }>(functions, 'deleteUserAccount');

/**
 * Calls the Cloud Function then signs the user out locally. Throws if the
 * server reports an error; throws nothing on success (the caller should
 * navigate to /login).
 */
export async function deleteMyAccount(): Promise<void> {
    try {
        await deleteUserAccountCallable();
    } catch (err) {
        if (err instanceof FunctionsError) {
            throw new Error(err.message);
        }
        throw err;
    }
    // Auth user is already gone server-side; this clears the local cache.
    await signOut(auth).catch(() => undefined);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/services/userAccount.ts
git commit -m "feat(services): deleteMyAccount wrapper for the new callable

Wraps deleteUserAccount + signOut so callers get a single Promise to
await before navigating to /login."
```

---

### Task 3: Profile danger-zone UI

**Files:**
- Modify: `src/pages/Profile.tsx`
- Modify: `src/pages/Profile.module.css`

- [ ] **Step 1: Add danger-zone state + handler**

In `src/pages/Profile.tsx`, near other modal/state declarations, add:
```tsx
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleteInProgress, setDeleteInProgress] = useState(false);
    const [deleteError, setDeleteError] = useState('');
```

Add a handler near `handlePasswordReset`:
```tsx
    const handleDeleteAccount = async () => {
        setDeleteError('');
        setDeleteInProgress(true);
        try {
            const { deleteMyAccount } = await import('../services/userAccount');
            await deleteMyAccount();
            navigate('/login', { replace: true });
        } catch (err) {
            console.error('Account deletion failed', err);
            setDeleteError(err instanceof Error ? err.message : 'Could not delete account.');
            setDeleteInProgress(false);
        }
    };
```

- [ ] **Step 2: Render a danger zone in the settings tab**

Find the settings tab section in Profile.tsx (search for `Password Reset` or similar). After the password reset block, add:

```tsx
                            <div className={styles.dangerZone}>
                                <h3 className={styles.dangerZoneTitle}>Danger zone</h3>
                                <p className={styles.dangerZoneText}>
                                    Permanently delete your account. Your profile, username, avatar,
                                    and contact details are removed. Trip data you contributed
                                    (photos, expenses) stays so other members can still see their
                                    history; your name will appear as "Unknown user".
                                </p>
                                <button
                                    type="button"
                                    className={styles.dangerBtn}
                                    onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setDeleteError(''); }}
                                >
                                    Delete my account
                                </button>
                            </div>
```

- [ ] **Step 3: Render the confirm modal**

Near other portalled modals at the end of Profile.tsx's return, add:

```tsx
            {showDeleteModal && createPortal(
                <div className={styles.deleteModalBackdrop} onClick={() => !deleteInProgress && setShowDeleteModal(false)}>
                    <div className={styles.deleteModalCard} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.deleteModalTitle}>Delete account?</h2>
                        <p className={styles.deleteModalBody}>
                            This action cannot be undone. Your profile, avatar, username and
                            contact details will be permanently removed. Type{' '}
                            <strong>DELETE</strong> below to confirm.
                        </p>
                        <input
                            type="text"
                            className="input-field"
                            value={deleteConfirmText}
                            onChange={e => setDeleteConfirmText(e.target.value)}
                            placeholder="DELETE"
                            disabled={deleteInProgress}
                            autoFocus
                        />
                        {deleteError && <p className={styles.deleteModalError}>{deleteError}</p>}
                        <div className={styles.deleteModalActions}>
                            <button
                                type="button"
                                className="btn"
                                onClick={() => setShowDeleteModal(false)}
                                disabled={deleteInProgress}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={styles.dangerBtn}
                                onClick={handleDeleteAccount}
                                disabled={deleteConfirmText !== 'DELETE' || deleteInProgress}
                            >
                                {deleteInProgress ? 'Deleting…' : 'Delete forever'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
```

- [ ] **Step 4: Add CSS**

Append to `src/pages/Profile.module.css`:

```css
/* ── Danger zone ──────────────────────────── */
.dangerZone {
    margin-top: 2rem;
    padding: 1rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 12px;
}

.dangerZoneTitle {
    margin: 0 0 0.5rem;
    color: #991b1b;
    font-size: 1rem;
    font-weight: 700;
}

.dangerZoneText {
    margin: 0 0 0.75rem;
    color: #7f1d1d;
    font-size: 0.85rem;
    line-height: 1.5;
}

.dangerBtn {
    background: #dc2626;
    color: #fff;
    border: none;
    border-radius: 999px;
    padding: 0.6rem 1.25rem;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
}

.dangerBtn:hover:not(:disabled) {
    background: #b91c1c;
}

.dangerBtn:disabled {
    opacity: 0.5;
    cursor: wait;
}

/* ── Delete confirm modal ─────────────────── */
.deleteModalBackdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.55);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
}

.deleteModalCard {
    background: #fff;
    border-radius: 16px;
    max-width: 400px;
    width: 100%;
    padding: 1.5rem;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}

.deleteModalTitle {
    margin: 0 0 0.75rem;
    color: #991b1b;
    font-size: 1.25rem;
    font-weight: 700;
}

.deleteModalBody {
    color: #4b5563;
    font-size: 0.9rem;
    line-height: 1.5;
    margin: 0 0 1rem;
}

.deleteModalError {
    color: #991b1b;
    font-size: 0.85rem;
    margin: 0.75rem 0 0;
}

.deleteModalActions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    justify-content: flex-end;
}
```

- [ ] **Step 5: Type-check + commit**

```
npx tsc --noEmit -p tsconfig.app.json
```
Expected: exit 0.

```bash
git add src/pages/Profile.tsx src/pages/Profile.module.css
git commit -m "feat(profile): self-service account deletion UI

Adds a danger-zone block in Profile settings with a typed-DELETE
confirmation modal. On confirm, calls the deleteUserAccount Cloud
Function via the userAccount service wrapper, then navigates to
/login. Errors surface inline in the modal."
```

---

### Task 4: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a note in the GDPR section**

Find the GDPR/privacy paragraph (or the closing "Conventions worth knowing" → GDPR posture line). Update it to mention self-service deletion exists.

In `CLAUDE.md`, find:
```markdown
- **GDPR posture**: see [src/pages/Privacy.tsx](src/pages/Privacy.tsx) — the policy is marked as draft and promises features (data export, account deletion) that aren't implemented yet. Keep that in mind when adding anything that collects new fields.
```

Replace with:
```markdown
- **GDPR posture**: see [src/pages/Privacy.tsx](src/pages/Privacy.tsx) — the policy is marked as draft. Self-service account deletion is wired (Profile → Settings → Danger zone → calls the `deleteUserAccount` Cloud Function in [functions/src/index.ts](functions/src/index.ts)). Data export is still TODO.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note self-service deletion in CLAUDE.md"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Cloud Function (Task 1)
- ✅ Client wrapper (Task 2)
- ✅ UI + modal + confirmation (Task 3)
- ✅ Docs update (Task 4)
- N/A: GDPR data export — separate plan.

**2. Placeholder scan:** No "TBD" / "appropriate" / "etc." in any task body. ✓

**3. Type/path consistency:**
- `httpsCallable<void, { ok: boolean }>` matches Function signature ✓
- Auth deletion happens LAST so partial failure is recoverable ✓
- Storage deletion is best-effort (avatar folder may be empty) ✓
- Settle-up arithmetic preserved by NOT touching expenses/payments ✓
- Trip member array splice uses arrayRemove (idempotent for non-members) ✓

---

## Execution Handoff

4 tasks, ~3h. **Inline execution.**
