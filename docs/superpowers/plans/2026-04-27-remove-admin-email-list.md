# Remove Hardcoded Admin Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close audit finding Critical #2 by removing the hardcoded `ADMIN_EMAILS` list from [AuthContext.tsx:8](src/context/AuthContext.tsx#L8). Admin grants must come from server-side writes only (Firebase Console or future Cloud Function), not from a client-side email match.

**Architecture:** The Firestore rules already block role escalation from clients (`firestore.rules:55` allows update only when `request.resource.data.role == resource.data.role`). The `ADMIN_EMAILS` list in `AuthContext` therefore *signals* an insecure intent without actually granting admin (the writes fail silently against the current rules). Removing it removes the false promise. New users get `role: 'user'`. Existing admins keep whatever role they already have on their user doc — no migration needed.

**Tech Stack:** TypeScript, Firebase Auth + Firestore, no new dependencies.

---

## File Structure

| File | Purpose |
|---|---|
| `src/context/AuthContext.tsx` | Modify — drop `ADMIN_EMAILS` and the three call sites (lines 9, 130, 166-167, 184) |
| `docs/admin-grants.md` | Create — short runbook on how to manually grant admin role via Firebase Console |
| `CLAUDE.md` | Modify — update the "two role concepts" section so future Claudes know admin role is server-only |

---

### Task 1: Remove ADMIN_EMAILS and its three call sites

**Files:**
- Modify: `src/context/AuthContext.tsx`

- [ ] **Step 1: Delete the constant declaration**

In `src/context/AuthContext.tsx` lines 7-9, delete the comment block + array:
```tsx
// ── Hardcoded admin emails ────────────────────────────────────────────────────
const ADMIN_EMAILS = ['charlie.nilsson@live.com', 'erichuman@me.com'];
```

- [ ] **Step 2: Simplify refreshAppUser (lines 128-141 area)**

Find this block:
```tsx
                const isAdmin = ADMIN_EMAILS.includes(currentUser.email || '');
                const existingData = userDoc.exists() ? userDoc.data() : {};

                const newUser: AppUser = {
                    uid: currentUser.uid,
                    email: currentUser.email || '',
                    name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Traveler',
                    fullName: existingData.fullName || '',
                    role: isAdmin ? 'admin' : 'user',
```

Replace with:
```tsx
                const existingData = userDoc.exists() ? userDoc.data() : {};

                const newUser: AppUser = {
                    uid: currentUser.uid,
                    email: currentUser.email || '',
                    name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Traveler',
                    fullName: existingData.fullName || '',
                    role: 'user',
```

- [ ] **Step 3: Drop the auto-promotion branch in onAuthStateChanged**

Find this block (around line 162-172):
```tsx
                    if (userDoc.exists() && userDoc.data().role) {
                        const data = { ...userDoc.data(), uid: user.uid } as AppUser;
                        // If the email is in the admin list, always ensure they have admin role
                        if (ADMIN_EMAILS.includes(user.email || '') && data.role !== 'admin') {
                            const updated = { ...data, role: 'admin' as const };
                            await setDoc(doc(db, 'users', user.uid), updated, { merge: true });
                            if (cancelled) return;
                            setAppUser(updated);
                        } else {
                            setAppUser(data);
                        }
```

Replace with:
```tsx
                    if (userDoc.exists() && userDoc.data().role) {
                        const data = { ...userDoc.data(), uid: user.uid } as AppUser;
                        setAppUser(data);
```

- [ ] **Step 4: Simplify the first-login branch**

Find this block (around line 180-194):
```tsx
                    } else {
                        // First login OR partial creation from Login.tsx — auto-assign defaults.
                        // Preserve any existing fields (trips/activeTripId/etc) from a prior partial doc.
                        const isAdmin = ADMIN_EMAILS.includes(user.email || '');
                        const existingData = userDoc.exists() ? userDoc.data() : {};

                        const newUser: AppUser = {
                            uid: user.uid,
                            email: user.email || '',
                            name: user.displayName || user.email?.split('@')[0] || 'Traveler',
                            fullName: existingData.fullName || '',
                            role: isAdmin ? 'admin' : 'user',
```

Replace with:
```tsx
                    } else {
                        // First login OR partial creation from Login.tsx — auto-assign defaults.
                        // Preserve any existing fields (trips/activeTripId/etc) from a prior partial doc.
                        // Role is always 'user'; admin is granted server-side only (see docs/admin-grants.md).
                        const existingData = userDoc.exists() ? userDoc.data() : {};

                        const newUser: AppUser = {
                            uid: user.uid,
                            email: user.email || '',
                            name: user.displayName || user.email?.split('@')[0] || 'Traveler',
                            fullName: existingData.fullName || '',
                            role: 'user',
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: exit code 0, no output.

If `noUnusedLocals` complains about `isAdmin` — re-grep the file: `grep -n ADMIN_EMAILS src/context/AuthContext.tsx`. Expected: no matches.

- [ ] **Step 6: Commit (with the runbook from Task 2 — keep them together)**

Defer commit until after Task 2.

---

### Task 2: Create admin-grant runbook

**Files:**
- Create: `docs/admin-grants.md`

- [ ] **Step 1: Write the runbook**

`docs/admin-grants.md`:
```markdown
# Granting Admin Role

`role: 'admin'` on a user doc unlocks app-wide privileges (gallery edit on
others' photos, payment delete, future moderation tools). It is **never**
written from the client — the Firestore rule on `users/{uid}` rejects role
escalation from any authenticated request.

The grant must come from one of two server-side paths:

## Option 1 — Manual Firebase Console flip

1. https://console.firebase.google.com/project/alen-8797d/firestore/data
2. Open the `users` collection.
3. Find the user document by uid (or filter by `email`).
4. Edit the `role` field — change from `user` to `admin`. Save.
5. The user must reload the app for the new role to take effect.

## Option 2 — Cloud Function (future)

When we build a moderation panel, an admin-only callable function will set
the role atomically with audit logging. Until then, Option 1 is the way.

## Revoking admin

Same as Option 1 but flip back to `user`. The Firestore rule lets the same
admin do this server-side via the console — no rule update needed.

## Why no client-side promotion?

Earlier the codebase had a hardcoded `ADMIN_EMAILS` array in `AuthContext`.
That signalled an insecure intent (compromise an email → get admin) and was
removed in commit history (see git log around 2026-04-27). The current
firestore.rules block role rewrites from any authenticated path, so admin
membership is governed entirely by who can write the user doc directly via
the Firebase Admin SDK / console.
```

- [ ] **Step 2: Commit Task 1 + Task 2 together**

```bash
git add src/context/AuthContext.tsx docs/admin-grants.md
git commit -m "fix(auth): remove ADMIN_EMAILS auto-promotion list

The hardcoded list in AuthContext signalled an insecure intent —
'compromise this email, get admin'. The accompanying client-side
setDoc(role: 'admin') was already failing silently against the
firestore.rules role-escalation guard, so removing the list closes
the conceptual hole without any behaviour change for legitimate
existing admins (their user doc keeps role: 'admin' from previous
manual writes).

New users always get role: 'user'. Admin grants now happen only via
server-side writes (Firebase Console or future Cloud Function); see
docs/admin-grants.md."
```

---

### Task 3: Update CLAUDE.md so future sessions know

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the "Provider stack" section**

In `CLAUDE.md`, find the paragraph that says:
```markdown
### Provider stack
Four contexts wrap the app, in order: `AuthProvider → TripProvider → EvenProvider → OddsProvider`. Hooks: `useAuth`, `useTrip`, `useEven`, `useOdds`. The auth context hardcodes admin emails ([AuthContext.tsx:8](src/context/AuthContext.tsx#L8)) — any user signing in with one of those addresses is auto-promoted to `role: 'admin'` on the user doc. There is no Firestore-side check that the role matches the email list; rotate carefully.
```

Replace with:
```markdown
### Provider stack
Four contexts wrap the app, in order: `AuthProvider → TripProvider → EvenProvider → OddsProvider`. Hooks: `useAuth`, `useTrip`, `useEven`, `useOdds`. New users always get `role: 'user'`; admin grants are server-side only (see [docs/admin-grants.md](docs/admin-grants.md)). The Firestore rule on `users/{uid}` rejects role escalation from any authenticated client write, so even a compromised account cannot self-promote.
```

- [ ] **Step 2: Verify CLAUDE.md is committed**

Run: `git status -s CLAUDE.md`

If `??` (untracked) — CLAUDE.md was created earlier in the session but never committed. Stage and commit it together with the update.

If `M` (modified) — just the update needs commit.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md after admin-emails removal

Future sessions need to know admin role is server-side only.
Removes the now-stale paragraph that warned about the hardcoded
ADMIN_EMAILS list (which is gone)."
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Remove constant + three call sites (Task 1)
- ✅ Document the new admin-grant flow (Task 2)
- ✅ Update CLAUDE.md (Task 3)

**2. Placeholder scan:** No "TBD" / "appropriate" / "etc." in any task body. ✓

**3. Type/path consistency:**
- `AuthContext.tsx` line numbers approximate (file may shift slightly during edits) — call sites are anchored by surrounding code blocks rather than exact line numbers ✓
- `docs/admin-grants.md` is new, no existing references ✓
- `CLAUDE.md` exists at repo root from earlier in session ✓

---

## Execution Handoff

3 tasks, ~1h, mix of code + docs. **Inline execution** is the right pick — same shape as the previous plans.
