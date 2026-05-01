# PII Hardening — Phone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close audit Critical #3 (phone PII) by moving `phoneNumber` off the publicly-readable user doc and into a `users/{uid}/private/contact` subcollection. The opt-in flag `sharePhoneNumber` stays on the public doc and acts as a real gate (rule-enforced, not just client-side).

**Architecture:** Subcollection-with-opt-in rule. Read access on `users/{uid}/private/{contactId}`:
1. Always allowed for `isMe(uid)`.
2. Allowed for any other authed user IFF the parent `users/{uid}.sharePhoneNumber == true`.

`Members.tsx` does N+1 fetches (one per trip member) — expected for ~5-10 members. Failures (rule denials) are caught and treated as "phone unavailable". `Profile.tsx` self-edit fetches its own `private/contact` and writes back to it; no AuthContext changes needed.

**Tech Stack:** Firebase Firestore, @firebase/rules-unit-testing, vitest, firebase-admin (migration script).

---

## File Structure

| File | Purpose |
|---|---|
| `firestore.rules` | Modify — add `users/{uid}/private/{contactId}` rule block |
| `tests/firestore.rules.test.ts` | Modify — add 4 tests for the new subcollection |
| `src/services/userContact.ts` | Create — small service for read/write of own + others' phone |
| `src/pages/Login.tsx` | Modify — write phone to subcollection at signup, drop from main doc |
| `src/pages/Profile.tsx` | Modify — fetch own phone from subcollection; write phone to subcollection on save |
| `src/pages/Members.tsx` | Modify — fetch each member's phone via getDoc, gracefully handle denials |
| `src/context/AuthContext.tsx` | Modify — drop `phoneNumber` from `AppUser` interface (keep `sharePhoneNumber`); strip phone from updateProfile call sites |
| `scripts/migrate-phone-to-private.mjs` | Create — copy phone to subcollection, then delete from main doc |
| `CLAUDE.md` | Modify — note phone has moved |

---

### Task 1: Subcollection rule + tests

- [ ] **Step 1: Add the rule block to `firestore.rules`**

Find the `match /users/{uid} { ... }` block and the line `allow update: if isAuthed() && !isMe(uid) ...` (the bilateral-follow rule). At the END of the `users/{uid}` block (before the closing `}`), add:

```
      // ── Subcollection: private contact details ─────────────────────────
      // Holds phone number (and any future contact PII) so it's NOT exposed
      // by the public users/{uid} doc. Read access:
      //   - always allowed for the owner,
      //   - allowed for any other authed user IFF the parent doc has
      //     sharePhoneNumber == true (opt-in by the owner).
      // Write access: owner only.
      match /private/{contactId} {
        allow read: if isMe(uid)
          || (isAuthed()
              && get(/databases/$(database)/documents/users/$(uid)).data.sharePhoneNumber == true);
        allow create, update, delete: if isMe(uid);
      }
```

- [ ] **Step 2: Add tests in tests/firestore.rules.test.ts**

Append a new describe block at the end of the file:

```ts
describe('users/{uid}/private/{contactId}', () => {
  beforeEach(async () => {
    await seedTrip();
  });

  it('owner can read and write own private contact', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(ALICE), 'users', ALICE, 'private', 'contact'),
        { phoneNumber: '+46700000000' })
    );
    await assertSucceeds(
      getDoc(doc(asUser(ALICE), 'users', ALICE, 'private', 'contact'))
    );
  });

  it('other authed user can read when sharePhoneNumber is true', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', ALICE), {
        uid: ALICE, role: 'user', name: 'Alice',
        sharePhoneNumber: true,
        followers: [], following: [],
      });
      await setDoc(doc(db, 'users', ALICE, 'private', 'contact'),
        { phoneNumber: '+46700000000' });
    });
    await assertSucceeds(
      getDoc(doc(asUser(BOB), 'users', ALICE, 'private', 'contact'))
    );
  });

  it('other authed user CANNOT read when sharePhoneNumber is false/missing', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', ALICE), {
        uid: ALICE, role: 'user', name: 'Alice',
        sharePhoneNumber: false,
        followers: [], following: [],
      });
      await setDoc(doc(db, 'users', ALICE, 'private', 'contact'),
        { phoneNumber: '+46700000000' });
    });
    await assertFails(
      getDoc(doc(asUser(BOB), 'users', ALICE, 'private', 'contact'))
    );
  });

  it('non-owner cannot write private contact', async () => {
    await assertFails(
      setDoc(doc(asUser(BOB), 'users', ALICE, 'private', 'contact'),
        { phoneNumber: '+46711111111' })
    );
  });
});
```

- [ ] **Step 3: Run rules tests**

Run: `npm run test:rules`
Expected: green (69 + 4 = 73 passing).

- [ ] **Step 4: Deploy the rule and commit**

```bash
firebase deploy --only firestore:rules
git add firestore.rules tests/firestore.rules.test.ts
git commit -m "feat(rules): private contact subcollection with opt-in cross-read

users/{uid}/private/{contactId} holds phone number (and future PII).
Read rules: owner always; others only if users/{uid}.sharePhoneNumber
== true. Write: owner only. Backed by 4 new rules tests."
```

---

### Task 2: Service helper for phone read/write

- [ ] **Step 1: Create `src/services/userContact.ts`**

```ts
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { db } from './firebase';

/** The single doc id we use under users/{uid}/private/. */
const CONTACT_DOC_ID = 'contact';

export interface PrivateContact {
    phoneNumber?: string;
}

/**
 * Read a user's private contact doc. Returns null if the doc doesn't exist
 * OR the rules deny access (e.g. sharePhoneNumber is false). Callers should
 * treat null as "no number available".
 */
export async function getPrivateContact(uid: string): Promise<PrivateContact | null> {
    try {
        const snap = await getDoc(doc(db, 'users', uid, 'private', CONTACT_DOC_ID));
        if (!snap.exists()) return null;
        return snap.data() as PrivateContact;
    } catch {
        return null;
    }
}

/**
 * Owner writes their phone number. Pass empty string to clear it.
 * Caller must be authenticated as `uid` (rules enforce this).
 */
export async function setOwnPhoneNumber(uid: string, phoneNumber: string): Promise<void> {
    const ref = doc(db, 'users', uid, 'private', CONTACT_DOC_ID);
    if (phoneNumber.trim() === '') {
        await setDoc(ref, { phoneNumber: deleteField() }, { merge: true });
    } else {
        await setDoc(ref, { phoneNumber: phoneNumber.trim() }, { merge: true });
    }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/services/userContact.ts
git commit -m "feat(services): userContact helper for phone read/write

Wraps the users/{uid}/private/contact subcollection. Read returns null
on rule denial so call-sites can use a single 'no phone available'
fallback path. Write is owner-only (rule-enforced)."
```

---

### Task 3: Update write paths — Login signup + AuthContext

- [ ] **Step 1: Update Login.tsx signup**

In `src/pages/Login.tsx`, find the `setDoc(doc(db, 'users', cred.user.uid), { ... })` call. Remove this line:
```tsx
                        ...(trimmedPhone ? { phoneNumber: trimmedPhone } : {}),
```

Right after the `setDoc(...)` call returns, add (before `generateAndClaimUsername`):
```tsx
                if (trimmedPhone) {
                    const { setOwnPhoneNumber } = await import('../services/userContact');
                    await setOwnPhoneNumber(cred.user.uid, trimmedPhone);
                }
```

(Dynamic import avoids a top-level import for a one-shot path.)

- [ ] **Step 2: Update AuthContext.AppUser interface**

In `src/context/AuthContext.tsx`, find the `AppUser` interface and remove this line:
```tsx
    phoneNumber?: string;
```

`sharePhoneNumber?: boolean` stays — it's still on the public doc.

- [ ] **Step 3: Drop phoneNumber from AuthContext.updateProfile signature use sites**

If anything currently calls `updateProfile({ phoneNumber: ... })`, that needs splitting. Grep:
```
grep -rn "updateProfile.*phoneNumber" src
```

Expected hits: only `Profile.tsx`. Handled in Task 4.

- [ ] **Step 4: Type-check (will reveal Task 4 work)**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: errors in Profile.tsx (and possibly Members.tsx) referencing `appUser.phoneNumber` / `member.phoneNumber`. These are fixed in Tasks 4 and 5. **Do not commit yet.**

---

### Task 4: Update Profile.tsx self-read + write

- [ ] **Step 1: Add a useEffect to fetch own phone**

In `src/pages/Profile.tsx`, near the other state declarations (around line 192-194), add:
```tsx
    const [myPhoneNumber, setMyPhoneNumber] = useState<string>('');
```

Near the other useEffects, add:
```tsx
    useEffect(() => {
        let cancelled = false;
        if (!appUser?.uid || !isOwner) return;
        (async () => {
            const { getPrivateContact } = await import('../services/userContact');
            const data = await getPrivateContact(appUser.uid);
            if (!cancelled) setMyPhoneNumber(data?.phoneNumber ?? '');
        })();
        return () => { cancelled = true; };
    }, [appUser?.uid, isOwner]);
```

- [ ] **Step 2: Replace `appUser.phoneNumber` in editForm sync**

Find:
```tsx
                phoneNumber: appUser.phoneNumber || '',
```
Replace with:
```tsx
                phoneNumber: myPhoneNumber,
```

The useEffect that syncs editForm needs `myPhoneNumber` in its dependency array. Find the surrounding `useEffect` and add `myPhoneNumber` to its dep array.

- [ ] **Step 3: Update handleSaveProfile**

Find `handleSaveProfile` (around line 350-365). Currently:
```tsx
    const handleSaveProfile = async () => {
        try {
            await updateProfile({
                name: editForm.name,
                phoneNumber: editForm.phoneNumber,
                sharePhoneNumber: editForm.sharePhoneNumber,
                shareLocation: editForm.shareLocation,
                avatarUrl: editForm.avatarUrl,
                initialsStyle,
            } as Partial<AppUser>);
        } catch (err) {
```

Replace with:
```tsx
    const handleSaveProfile = async () => {
        try {
            await updateProfile({
                name: editForm.name,
                sharePhoneNumber: editForm.sharePhoneNumber,
                shareLocation: editForm.shareLocation,
                avatarUrl: editForm.avatarUrl,
                initialsStyle,
            } as Partial<AppUser>);
            if (appUser?.uid) {
                const { setOwnPhoneNumber } = await import('../services/userContact');
                await setOwnPhoneNumber(appUser.uid, editForm.phoneNumber);
                setMyPhoneNumber(editForm.phoneNumber);
            }
        } catch (err) {
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: Members.tsx still has errors (`member.phoneNumber`), but Profile-related errors are gone. **Do not commit yet — fix Members in Task 5.**

---

### Task 5: Update Members.tsx cross-user read

- [ ] **Step 1: Augment members with phone after fetching**

In `src/pages/Members.tsx`, find the `fetchMembers` async function. After `setMembers([...validMembers, ...mockUsers]);`, replace that line with augmenting logic:

Replace:
```tsx
                setMembers([...validMembers, ...mockUsers]);
```
With:
```tsx
                const all = [...validMembers, ...mockUsers];
                setMembers(all);

                // Fan out to load each member's phone (rule-gated by their
                // sharePhoneNumber flag). N+1 is acceptable for typical
                // 5-10 trip members; failures are silent.
                const { getPrivateContact } = await import('../services/userContact');
                const enriched = await Promise.all(all.map(async m => {
                    if (m.uid.startsWith('mock_')) return m; // mocks already have phone
                    const contact = await getPrivateContact(m.uid);
                    return contact?.phoneNumber
                        ? { ...m, phoneNumber: contact.phoneNumber }
                        : m;
                }));
                setMembers(enriched);
```

- [ ] **Step 2: Mock-user type augmentation**

The inline mock objects in `Members.tsx:45-54` still set `email: ''` and `phoneNumber: '...'` — both will fail typing now (email already gone, phoneNumber removed). Drop the `email: ''` line and replace `phoneNumber:` and `sharePhoneNumber:` (still legal — sharePhoneNumber stays on AppUser). Actually phoneNumber is no longer on AppUser. So:

Find:
```tsx
                const mockUsers: AppUser[] = mockUids.map(uid => ({
                    uid,
                    name: uid.replace('mock_', ''),
                    fullName: uid.replace('mock_', ''),
                    email: '',
                    role: 'user',
                    hasAgreed: true,
                    phoneNumber: '+15551234567',
                    sharePhoneNumber: true,
                }));
```

Replace with:
```tsx
                const mockUsers: (AppUser & { phoneNumber?: string })[] = mockUids.map(uid => ({
                    uid,
                    name: uid.replace('mock_', ''),
                    fullName: uid.replace('mock_', ''),
                    role: 'user',
                    hasAgreed: true,
                    phoneNumber: '+15551234567',
                    sharePhoneNumber: true,
                }));
```

- [ ] **Step 3: Update the local member type**

`members` state was `useState<AppUser[]>([])`. After enrichment it carries `phoneNumber` for some members. Change to:

Find:
```tsx
    const [members, setMembers] = useState<AppUser[]>([]);
```
Replace with:
```tsx
    const [members, setMembers] = useState<(AppUser & { phoneNumber?: string })[]>([]);
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: exit 0.

- [ ] **Step 5: Commit Tasks 3-5 together**

```bash
git add src/pages/Login.tsx src/pages/Profile.tsx src/pages/Members.tsx \
        src/context/AuthContext.tsx
git commit -m "refactor(profile+members): read/write phone via private subcollection

- AppUser no longer has phoneNumber (sharePhoneNumber stays as a public
  opt-in flag).
- Login signup writes phone via setOwnPhoneNumber after the main user-doc
  setDoc completes.
- Profile fetches own phone via getPrivateContact in a useEffect; saves
  via setOwnPhoneNumber alongside updateProfile (which now only carries
  the public-doc fields).
- Members fan-out fetches each trip member's phone after the user list
  loads. Rule denials (sharePhoneNumber=false) silently yield no phone,
  matching the existing 'Number hidden' UX.
- Mock users in Members extend AppUser with phoneNumber locally.

Closes audit Critical #3 (phone PII) — phone field is gone from the
public users/{uid} doc."
```

---

### Task 6: Migration script + CLAUDE.md

- [ ] **Step 1: Create the migration script**

`scripts/migrate-phone-to-private.mjs`:
```js
// One-shot: copy users/{uid}.phoneNumber to users/{uid}/private/contact
// then deleteField from the main doc. Idempotent — skips users that
// already have no phoneNumber on the main doc.
//
// Run with:
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
//   node scripts/migrate-phone-to-private.mjs

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({
    credential: applicationDefault(),
    projectId: 'alen-8797d',
});

const db = getFirestore();

async function run() {
    const snap = await db.collection('users').get();
    console.log(`Found ${snap.size} user docs.`);

    let migrated = 0;
    let skipped = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        if (typeof data.phoneNumber !== 'string' || data.phoneNumber.trim() === '') {
            skipped++;
            continue;
        }

        // Write the private subcollection doc + delete the public field
        // in a single batch so partial state is impossible.
        const batch = db.batch();
        batch.set(
            doc.ref.collection('private').doc('contact'),
            { phoneNumber: data.phoneNumber },
            { merge: true },
        );
        batch.update(doc.ref, { phoneNumber: FieldValue.delete() });
        await batch.commit();

        migrated++;
        console.log(`✓ migrated phone for users/${doc.id}`);
    }
    console.log(`\nDone. Migrated ${migrated}, skipped ${skipped} of ${snap.size} docs.`);
}

run().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
```

- [ ] **Step 2: Update CLAUDE.md**

Find the paragraph about phone in `CLAUDE.md` (added in the email-PII commit):
```markdown
User-doc email field is intentionally absent — `auth.currentUser.email` is the only source of truth. Phone (`phoneNumber` + `sharePhoneNumber`) still lives on the user doc to support trip-member phone display in Members.tsx, but is a known PII gap pending a follow-up plan.
```

Replace with:
```markdown
User-doc email field is intentionally absent — `auth.currentUser.email` is the only source of truth. Phone has the same posture: `phoneNumber` lives in `users/{uid}/private/contact` (rule: owner always; others iff `sharePhoneNumber == true`); only `sharePhoneNumber` (the opt-in flag) remains on the public doc. Use `services/userContact.ts` for read/write — never touch the subcollection directly.
```

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-phone-to-private.mjs CLAUDE.md
git commit -m "chore: phone PII migration script + CLAUDE.md update

Run after the rules deploy to copy each user's existing phoneNumber
into the new users/{uid}/private/contact doc and atomically delete
the field from the main doc. Idempotent. CLAUDE.md notes the new
data-model split."
```

- [ ] **Step 4: Run the migration (manual — user action)**

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/Users/admin/Downloads/alen-8797d-firebase-adminsdk-...json
node scripts/migrate-phone-to-private.mjs
```

(Use the same service-account JSON. Re-download from Firebase Console if it was deleted after the email cleanup.)

After the run: `Done. Migrated <N>, skipped <M> of <total> docs.` Then delete the JSON.

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Subcollection rule + tests (Task 1)
- ✅ Service helper (Task 2)
- ✅ Write paths (Task 3)
- ✅ Profile self-read/write (Task 4)
- ✅ Members cross-user read (Task 5)
- ✅ Migration + docs (Task 6)

**2. Placeholder scan:** No "TBD" / "appropriate" / "etc." in any task body. ✓

**3. Type/path consistency:**
- `getPrivateContact` returns `null` on denial; `Members.tsx` uses optional chaining ✓
- `setOwnPhoneNumber` accepts empty string → deletes field ✓
- AppUser drops `phoneNumber`; Members.tsx state augments with `& { phoneNumber? }` ✓
- Profile useEffect dep array includes `myPhoneNumber` (mentioned in Task 4 step 2) ✓
- Migration script uses batch so write+delete is atomic ✓

---

## Execution Handoff

6 tasks, ~2.5h. **Inline execution.** Tasks 3-5 share a single commit (interlinked type changes) — type-check stays red between them.
