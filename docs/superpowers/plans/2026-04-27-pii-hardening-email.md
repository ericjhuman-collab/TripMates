# PII Hardening — Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop leaking email addresses from `users/{uid}` to every authenticated reader (audit Critical #3, partial). Email is redundant on the user doc — it's already on `auth.currentUser.email` which Firebase Auth manages — so we can drop it from new writes, switch the few self-display sites to read from auth, and run a one-shot cleanup script to remove the field from existing docs.

**Architecture:** Firebase Auth's `currentUser.email` is the single source of truth for the signed-in user's email. The legacy `users/{uid}.email` field was duplicated for convenience but never displayed for *other* users (verified via grep — only Profile.tsx reads it, all for self). After this plan, no email value lives in Firestore-readable form.

**Phone is intentionally out of scope** — it has legitimate cross-user reads in Members.tsx that require a more involved schema split (subcollection + opt-in rule). Tracked as future Plan 6.

**Tech Stack:** Firebase Auth, Firestore admin SDK (for the cleanup script), Node 22.

---

## File Structure

| File | Purpose |
|---|---|
| `src/context/AuthContext.tsx` | Modify — drop `email: ...` from the two `newUser` objects; remove `email` from `AppUser` interface |
| `src/pages/Login.tsx` | Modify — drop `email: cred.user.email \|\| email` from the signup setDoc |
| `src/pages/Profile.tsx` | Modify — read `auth.currentUser.email` instead of `appUser.email` (3 sites) |
| `scripts/cleanup-email-from-users.mjs` | Create — one-shot Node script using firebase-admin to delete the `email` field from all existing user docs |
| `CLAUDE.md` | Modify — note that user-doc email is gone; auth is the source |

---

### Task 1: Drop `email` from AppUser interface and write paths

**Files:**
- Modify: `src/context/AuthContext.tsx`
- Modify: `src/pages/Login.tsx`

- [ ] **Step 1: Remove `email` from the AppUser interface**

In `src/context/AuthContext.tsx`, find the `AppUser` interface. Remove this line:
```tsx
    email: string;
```

(It's around line 12.) The interface still has all other fields.

- [ ] **Step 2: Remove `email: ...` from refreshAppUser's newUser**

In the `refreshAppUser` callback, find the `newUser` object. Remove the line:
```tsx
                    email: currentUser.email || '',
```

(It's around line 131.) Keep the `name`, `fullName`, etc. lines.

- [ ] **Step 3: Remove `email: ...` from the first-login newUser**

In `onAuthStateChanged`, find the second `newUser` object (the first-login branch). Remove:
```tsx
                            email: user.email || '',
```

(Around line 177.)

- [ ] **Step 4: Drop `email` from Login.tsx signup setDoc**

In `src/pages/Login.tsx`, find the `setDoc` call inside the signup branch. Remove the line:
```tsx
                        email: cred.user.email || email,
```

(Around line 181.)

- [ ] **Step 5: Update mock user object**

In `src/context/AuthContext.tsx`, find `loginAsMock`. The mock user object still has `email: ...`. Either remove it (preferred — match the interface) or cast — pick remove.

Find:
```tsx
            email: `mock${role}@test.com`,
```
Delete it.

Then in the same file, find:
```tsx
        ? ({ uid: mockUser.uid, email: mockUser.email } as User)
```
Replace with:
```tsx
        ? ({ uid: mockUser.uid, email: `mock-${mockUser.role}@test.com` } as User)
```

(That `User` cast represents Firebase Auth's `currentUser`, which always has an email — we synthesize one for the mock to satisfy the type. The mock-only path is dev-only so the synthetic email is fine.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: exit code 0.

If errors: probably someone else reads `appUser.email`. Grep:
```
grep -rn "appUser\.email\|appUser?\.email" src
```
For each hit, switch to `auth.currentUser?.email`. Profile.tsx is the known site (Task 2 below).

- [ ] **Step 7: Commit**

```bash
git add src/context/AuthContext.tsx src/pages/Login.tsx
git commit -m "refactor(auth): drop email field from user doc writes

email was duplicated on users/{uid}.email despite being the source
of truth on auth.currentUser.email. Removing the duplicate from new
writes; existing docs still carry the field until the cleanup script
runs (next commit). Self-display sites switch to currentUser in the
following commit."
```

---

### Task 2: Switch Profile.tsx self-display reads to auth.currentUser

**Files:**
- Modify: `src/pages/Profile.tsx`

- [ ] **Step 1: Drop email from editForm initial state**

Find around line 194:
```tsx
    const [editForm, setEditForm] = useState({ name: '', phoneNumber: '', email: '', avatarUrl: '', sharePhoneNumber: false, shareLocation: true });
```
Replace with:
```tsx
    const [editForm, setEditForm] = useState({ name: '', phoneNumber: '', avatarUrl: '', sharePhoneNumber: false, shareLocation: true });
```

- [ ] **Step 2: Drop the email line from the editForm sync**

Find around line 316:
```tsx
                email: appUser.email || '',
```
Delete the entire line. The surrounding object becomes one line shorter.

- [ ] **Step 3: Switch handlePasswordReset to auth.currentUser.email**

Find around line 388-396:
```tsx
    const handlePasswordReset = async () => {
        if (!appUser?.email) return;
        try {
            await sendPasswordResetEmail(auth, appUser.email);
            alert(`A password reset link has been sent to ${appUser.email}.`);
```
Replace with:
```tsx
    const handlePasswordReset = async () => {
        const email = auth.currentUser?.email;
        if (!email) return;
        try {
            await sendPasswordResetEmail(auth, email);
            alert(`A password reset link has been sent to ${email}.`);
```

- [ ] **Step 4: Drop the email input from the edit form (around line 835)**

Find the `<input value={editForm.email} ...>` line. The email field on edit form was likely showing read-only — drop the whole input + label. Search the file for `editForm.email`:
```
grep -n "editForm\.email" src/pages/Profile.tsx
```
For each hit, decide:
- If it's a display-only span: replace with `{auth.currentUser?.email}`
- If it's an `<input>`: delete the input (with surrounding label if any)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Profile.tsx
git commit -m "refactor(profile): use auth.currentUser.email for self-display

Profile reads its own email three places (editForm sync, password
reset handler, edit-form input). Switch all to auth.currentUser.email
since users/{uid}.email is no longer written. Same UX for the user;
no leak of other users' emails (none ever displayed cross-user)."
```

---

### Task 3: One-shot cleanup of existing user docs

**Files:**
- Create: `scripts/cleanup-email-from-users.mjs`

- [ ] **Step 1: Write the cleanup script**

`scripts/cleanup-email-from-users.mjs`:
```js
// One-shot: remove the legacy `email` field from every users/{uid} doc.
// Run with: node scripts/cleanup-email-from-users.mjs
//
// Requires service-account credentials. Two options:
//  1. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON file
//     downloaded from
//     https://console.firebase.google.com/project/alen-8797d/settings/serviceaccounts/adminsdk
//  2. Run from a machine where `gcloud auth application-default login` has
//     been done with an account that has Firestore admin access.
//
// Idempotent — safe to re-run; only deletes the field if present.

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

    let cleaned = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.email !== undefined) {
            await doc.ref.update({ email: FieldValue.delete() });
            cleaned++;
            console.log(`✓ removed email from users/${doc.id}`);
        }
    }
    console.log(`\nDone. Cleaned ${cleaned} of ${snap.size} docs.`);
}

run().catch(err => {
    console.error('Cleanup failed:', err);
    process.exit(1);
});
```

- [ ] **Step 2: Verify firebase-admin is available in the root project's node_modules**

Run: `ls node_modules/firebase-admin 2>&1 | head -1`

If "No such file or directory":
- Install ad-hoc for the script: `npm install --save-dev firebase-admin`
- (Or use `functions/node_modules/firebase-admin` from the existing functions package by running the script with `node --experimental-vm-modules functions/node_modules/firebase-admin/...` — too hacky; just install at root.)

- [ ] **Step 3: Document and commit (do NOT run yet — needs credentials)**

```bash
git add scripts/cleanup-email-from-users.mjs
# Add package.json/lock if firebase-admin was installed
git add package.json package-lock.json
git commit -m "chore: add one-shot script to remove legacy email field

Run on demand via 'node scripts/cleanup-email-from-users.mjs' after
GOOGLE_APPLICATION_CREDENTIALS is set, to scrub the duplicate email
field from existing users/{uid} docs. New writes already exclude
the field; this just cleans up the historical residue."
```

- [ ] **Step 4: Run the cleanup (manual — user action)**

This is a manual step the human partner does:

1. Download a service account key from
   https://console.firebase.google.com/project/alen-8797d/settings/serviceaccounts/adminsdk
   → Generate new private key → save the JSON somewhere.
2. Export the path:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
   ```
3. Run the script:
   ```bash
   node scripts/cleanup-email-from-users.mjs
   ```
4. Expected output ends with `Done. Cleaned <N> of <N> docs.`
5. Optionally — delete or move the service-account JSON. Do NOT commit it.

After the run, every existing user doc has the `email` field deleted. New signups never get it written. PII for email is now governed entirely by Firebase Auth, which doesn't expose email to other authed clients.

---

### Task 4: Update CLAUDE.md note

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a note in the "Firestore data model & rules" section**

Find the section. After the last paragraph of that section, append:

```markdown

User-doc email field is intentionally absent — `auth.currentUser.email` is the only source of truth. Phone (`phoneNumber` + `sharePhoneNumber`) still lives on the user doc to support trip-member phone display in Members.tsx, but is a known PII gap pending a follow-up plan.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note email PII removal + remaining phone gap"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Drop `email` from interface + write paths (Task 1)
- ✅ Switch self-display reads to auth (Task 2)
- ✅ Cleanup script for existing docs (Task 3)
- ✅ CLAUDE.md updated (Task 4)
- N/A: Phone — explicitly deferred.

**2. Placeholder scan:** No "TBD" / "appropriate" / "etc." in any task body. ✓

**3. Type/path consistency:**
- `AppUser` interface change cascades to mock user — handled in Task 1 step 5 ✓
- Profile.tsx three read sites all migrated in Task 2 ✓
- Cleanup script is idempotent (skips docs that already lack the field) ✓
- `firebase-admin` install is one-time and the lockfile gets committed ✓

---

## Execution Handoff

4 tasks, ~2h, mix of code + script + docs. **Inline execution** — same shape as previous plans.
