# Rules Tightening — Payments & Bingo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two security audit findings (Critical #4 payments + Medium #13 bingo) by limiting the writeable fields in each collection's update rule and adding regression tests.

**Architecture:** Pure Firestore rules tightening — no app code changes. Each rule moves from "any trip member can update any field" to "any trip member can only update the legitimate fields". Legitimate-field whitelist is derived from grep of actual call sites.

**Tech Stack:** firebase-tools, @firebase/rules-unit-testing, vitest.

---

## File Structure

| File | Purpose |
|---|---|
| `firestore.rules` | Modify — tighten payments and bingo update rules |
| `tests/firestore.rules.test.ts` | Modify — add tests for the new constraints |

---

### Task 1: Lock down payments updates to {status, date}

**Audit finding:** `firestore.rules:241` allowed any trip member to overwrite any payment field — amount, fromUid, toUid, currency. Only legitimate update path (Even.tsx:529) sets `{ status: 'COMPLETED', date }` to mark a payment as paid.

**Files:**
- Modify: `firestore.rules:235-248` (payments block)
- Modify: `tests/firestore.rules.test.ts` (extend payments describe block)

- [ ] **Step 1: Tighten the payments update rule**

Replace this block in `firestore.rules`:
```
      allow update: if isAuthed() && isTripMember(resource.data.tripId);
```

with:
```
      // Payments are append-only ledger entries. Trip members may only
      // toggle status and update the date when marking a settle-up
      // complete. Mutating amount/fromUid/toUid/currency post-create
      // would corrupt the balance ledger.
      allow update: if isAuthed()
        && isTripMember(resource.data.tripId)
        && request.resource.data.diff(resource.data).affectedKeys()
             .hasOnly(['status', 'date'])
        && request.resource.data.status in ['PENDING', 'COMPLETED'];
```

- [ ] **Step 2: Add tests in tests/firestore.rules.test.ts**

Find the `describe('payments/{paymentId}', ...)` block (search `payments/{paymentId}`). Inside it, before the closing `})`, append:

```ts
  it('trip member CAN mark a payment COMPLETED with a new date', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'payments', 'p1'), {
        tripId: TRIP_ID, fromUid: ALICE, toUid: BOB,
        amount: 1000, currency: 'SEK',
        date: '2026-01-01', createdAt: 0, status: 'PENDING',
      });
    });
    await assertSucceeds(
      updateDoc(doc(asUser(BOB), 'payments', 'p1'), {
        status: 'COMPLETED', date: '2026-04-27',
      })
    );
  });

  it('trip member CANNOT mutate amount on existing payment', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'payments', 'p1'), {
        tripId: TRIP_ID, fromUid: ALICE, toUid: BOB,
        amount: 1000, currency: 'SEK',
        date: '2026-01-01', createdAt: 0, status: 'PENDING',
      });
    });
    await assertFails(
      updateDoc(doc(asUser(BOB), 'payments', 'p1'), { amount: 99999 })
    );
  });

  it('trip member CANNOT redirect a payment to themselves', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'payments', 'p1'), {
        tripId: TRIP_ID, fromUid: ALICE, toUid: BOB,
        amount: 1000, currency: 'SEK',
        date: '2026-01-01', createdAt: 0, status: 'PENDING',
      });
    });
    await assertFails(
      updateDoc(doc(asUser(BOB), 'payments', 'p1'), { toUid: CAROL })
    );
  });
```

- [ ] **Step 3: Run rules tests**

Run: `npm run test:rules`
Expected: green for all (existing 62 tests + 3 new = 65 passing).

If failing — read which test fails, check the rule + test alignment, fix, re-run. Do not proceed until 65/65.

- [ ] **Step 4: Commit (do NOT deploy yet — bingo lands in same deploy)**

```bash
git add firestore.rules tests/firestore.rules.test.ts
git commit -m "fix(rules): payments update locked to {status, date} only

Previously any trip member could rewrite amount, fromUid, toUid,
currency on an existing payment doc — corrupting the balance ledger.
Tighten the rule with hasOnly(['status', 'date']) plus a status enum
check so the only legitimate mutation (mark settle-up complete) still
works while value-tampering is rejected."
```

---

### Task 2: Lock bingo writes to the squares field

**Audit finding:** `firestore.rules:265-268` allows any trip member unrestricted read/write on the bingo doc. Legitimate use ([src/services/bingo.ts:36](src/services/bingo.ts#L36)) only writes `squares`.

**Files:**
- Modify: `firestore.rules` (bingo block)
- Modify: `tests/firestore.rules.test.ts`

- [ ] **Step 1: Replace the bingo rule block**

Replace:
```
    match /bingo/{key} {
      allow read, write: if isAuthed()
        && key.matches('trip_.+')
        && isTripMember(key.split('_')[1]);
    }
```

with:
```
    match /bingo/{key} {
      // Read: any trip member.
      allow read: if isAuthed()
        && key.matches('trip_.+')
        && isTripMember(key.split('_')[1]);

      // Create: any trip member may initialize the board.
      allow create: if isAuthed()
        && key.matches('trip_.+')
        && isTripMember(key.split('_')[1])
        && request.resource.data.keys().hasOnly(['squares'])
        && request.resource.data.squares.size() <= 30;

      // Update: only the squares array may change, capped at 30 entries
      // (matches initBingoBoard's 30-square layout). Prevents trip
      // members from polluting the doc with arbitrary fields or
      // ballooning storage by writing huge arrays.
      allow update: if isAuthed()
        && key.matches('trip_.+')
        && isTripMember(key.split('_')[1])
        && request.resource.data.diff(resource.data).affectedKeys()
             .hasOnly(['squares'])
        && request.resource.data.squares.size() <= 30;

      // Delete: trip admin only.
      allow delete: if isAuthed()
        && key.matches('trip_.+')
        && isTripAdmin(key.split('_')[1]);
    }
```

- [ ] **Step 2: Add bingo tests in tests/firestore.rules.test.ts**

Append a new describe block at the end of the file:

```ts
describe('bingo/trip_{tripId}', () => {
  beforeEach(async () => {
    await seedTrip();
  });

  it('trip member can create a 30-square board', async () => {
    const squares = Array.from({ length: 30 }, (_, i) => ({
      id: i, task: 'task', completedBy: null,
    }));
    await assertSucceeds(
      setDoc(doc(asUser(BOB), 'bingo', `trip_${TRIP_ID}`), { squares })
    );
  });

  it('trip member can update squares', async () => {
    const initial = Array.from({ length: 30 }, (_, i) => ({
      id: i, task: 'old', completedBy: null,
    }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bingo', `trip_${TRIP_ID}`), { squares: initial });
    });
    const next = initial.map((s, i) => i === 0 ? { ...s, task: 'updated' } : s);
    await assertSucceeds(
      updateDoc(doc(asUser(BOB), 'bingo', `trip_${TRIP_ID}`), { squares: next })
    );
  });

  it('trip member CANNOT add foreign fields', async () => {
    const initial = Array.from({ length: 30 }, (_, i) => ({
      id: i, task: 'task', completedBy: null,
    }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bingo', `trip_${TRIP_ID}`), { squares: initial });
    });
    await assertFails(
      updateDoc(doc(asUser(BOB), 'bingo', `trip_${TRIP_ID}`), {
        squares: initial,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ['adminBackdoor' as any]: true,
      } as Record<string, unknown>)
    );
  });

  it('non-member cannot read or write bingo', async () => {
    await assertFails(getDoc(doc(asUser(CAROL), 'bingo', `trip_${TRIP_ID}`)));
    const squares = Array.from({ length: 30 }, (_, i) => ({
      id: i, task: 'x', completedBy: null,
    }));
    await assertFails(
      setDoc(doc(asUser(CAROL), 'bingo', `trip_${TRIP_ID}`), { squares })
    );
  });
});
```

- [ ] **Step 3: Run rules tests**

Run: `npm run test:rules`
Expected: green for all (62 + 3 payments + 4 bingo = 69 passing).

- [ ] **Step 4: Commit**

```bash
git add firestore.rules tests/firestore.rules.test.ts
git commit -m "fix(rules): bingo locked to squares field only, capped at 30

Previously any trip member could write any field on the bingo doc,
making it a shared mutable scratch space. Constrain create/update to
the squares array (capped at 30 entries to match initBingoBoard) and
move delete behind isTripAdmin. Read access unchanged."
```

---

### Task 3: Deploy both changes

- [ ] **Step 1: Deploy rules**

Run: `firebase deploy --only firestore:rules`
Expected: ends with `✔ Deploy complete!`. The rules go live immediately.

- [ ] **Step 2: Sanity-spot-check in console**

Open https://console.firebase.google.com/project/alen-8797d/firestore/rules
Verify the published rules show the new payments + bingo blocks.

- [ ] **Step 3: Verify no commit needed**

Deploy is a Firebase action, not a git change. Working tree should already be clean from Task 1 + 2 commits.

Run: `git status -s`
Expected: empty output.

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Payments field-locking (Task 1)
- ✅ Bingo field-locking (Task 2)
- ✅ Deploy both (Task 3)

**2. Placeholder scan:** No "TBD" / "appropriate" / "etc." in any task body. ✓

**3. Type/path consistency:**
- `affectedKeys().hasOnly([...])` matches existing pattern in firestore.rules:138 ✓
- Test setup uses same `asUser`, `seedTrip()`, `TRIP_ID`, `ALICE/BOB/CAROL` constants as existing tests ✓
- `Even.tsx:529` confirmed as the only updatePayment call-site, only mutating `status` + `date` — rule whitelist matches ✓

---

## Execution Handoff

3 small tasks, ~1.5h total, all rules-only. **Inline execution** is the right pick — same shape as Plan 1 and worked smoothly there.
