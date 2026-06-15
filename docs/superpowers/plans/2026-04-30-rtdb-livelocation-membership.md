# RTDB Live-Location Membership Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the read rule on `/liveLocation` in Realtime Database so an authenticated user can only read live-location entries for trips they're a member of. Today the rule is `"auth != null"`, which means any signed-in user who knows a `tripId` and a target `uid` can read that user's live position without being on the trip. Practical exploitability is low (trip codes are 6 chars, UIDs are long random Firebase auth identifiers), but a leaked invite link or an enumeration attack is enough to weaken the privacy guarantee live-location was sold on.

**Architecture:** RTDB security rules cannot query Firestore, so we mirror the *minimum* membership data into RTDB at `/tripMembers/{tripId}/{uid} = true` and check that path from the rule. The mirror is written from the existing trip-mutation code paths (createTrip / joinTrip / leaveTrip / removeMember in `TripContext.tsx`, `TripAdmin.tsx`) and a one-shot backfill script seeds the existing trips. Reads stay real-time (still Firebase RTDB SDK) — no callable-Function detour.

**Why not a callable Cloud Function for reads:** would force every Map-page tile update through a function invocation, breaking the real-time onValue subscription model. The mirror approach keeps the cost profile flat and matches how the rest of the app handles cross-collection rule checks.

**Tech Stack:** Firebase Realtime Database (rules + writes), Firestore admin SDK (one-shot backfill script), Node 22 for the script.

---

## File Structure

| File | Purpose |
|---|---|
| `database.rules.json` | Modify — gate `/liveLocation/$tripId` reads on `root.child('tripMembers').child($tripId).child(auth.uid).exists()`; add a separate `/tripMembers` subtree with its own rules (read by self, write only via Cloud Function or admin SDK to prevent client tampering) |
| `src/context/TripContext.tsx` | Modify — when a trip is created, joined, or left, mirror the membership change to RTDB `/tripMembers/{tripId}/{uid}` |
| `src/pages/TripAdmin.tsx` | Modify — when an admin removes a member from a trip, mirror the removal to RTDB |
| `functions/src/index.ts` | Modify — add `mirrorTripMembership` Firestore-trigger Cloud Function on `trips/{tripId}` writes; this is the *authoritative* mirror that catches cases the client paths miss (server-side trip edits, recovery from offline drift) |
| `scripts/backfill-trip-members-to-rtdb.mjs` | Create — one-shot Node script using firebase-admin that reads every Firestore `trips/*` doc and writes its `members[]` to RTDB `/tripMembers/{tripId}/{uid} = true` |
| `CLAUDE.md` | Modify — document the membership mirror invariant and the trigger Function's role |

---

### Task 1: Add the mirror Cloud Function (write side)

**Files:**
- Modify: `functions/src/index.ts`

The trigger Function is the source of truth — even if a client write path is missed, this catches it. Implement it first so backfill writes also flow through it correctly.

- [ ] **Step 1: Add the `mirrorTripMembership` trigger**

In `functions/src/index.ts`, after `liveLocationCleanup`, add an `onDocumentWritten` trigger for `trips/{tripId}`. On each write, diff the `members` array between `before` and `after` snapshots, and apply the delta to RTDB:
- Members added → `set(tripMembers/{tripId}/{uid}, true)`
- Members removed → `remove(tripMembers/{tripId}/{uid})`
- Trip deleted → `remove(tripMembers/{tripId})` entirely

Use `getDatabase()` from `firebase-admin/database` (already imported by the cleanup function).

- [ ] **Step 2: Verify the function deploys and triggers**

Locally: `npm --prefix functions run build` then `firebase emulators:start --only functions,firestore,database`. Edit a trip's members array via Firestore emulator UI and confirm the RTDB tree updates.

---

### Task 2: Tighten RTDB rules

**Files:**
- Modify: `database.rules.json`

- [ ] **Step 1: Add `/tripMembers` subtree rules**

Allow reads only by uids listed under that trip; deny client writes entirely (the trigger Function uses admin privileges, which bypass rules).

```json
"tripMembers": {
  "$tripId": {
    "$uid": {
      ".read": "auth != null && auth.uid == $uid",
      ".write": false,
      ".validate": "newData.isBoolean() || !newData.exists()"
    }
  }
}
```

- [ ] **Step 2: Gate `/liveLocation` reads on membership**

Replace the existing `"liveLocation": { ".read": "auth != null", ... }` with a per-trip read check:

```json
"liveLocation": {
  "$tripId": {
    ".read": "auth != null && root.child('tripMembers').child($tripId).child(auth.uid).exists()",
    "$uid": { ... existing write rules unchanged ... }
  }
}
```

Note: the read rule moves *inside* `$tripId` so each trip's listener evaluates against the corresponding membership entry.

- [ ] **Step 3: Verify rules locally**

Add cases to the rules emulator: a non-member trying to read another trip's `/liveLocation/{tripId}` should get `permission_denied`. A member should read normally.

---

### Task 3: Mirror membership from client write paths

**Files:**
- Modify: `src/context/TripContext.tsx`
- Modify: `src/pages/TripAdmin.tsx`

The trigger Function from Task 1 is the authoritative mirror, but updating the client paths too gives the user immediate read access (no waiting for the trigger to fire) on the just-joined trip.

- [ ] **Step 1: Mirror in `createTrip`**

After `setDoc(doc(db, 'trips', newTripId), newTrip)`, add `set(ref(rtdb, \`tripMembers/${newTripId}/${currentUser.uid}\`), true)` (catch errors silently — the trigger will heal it).

- [ ] **Step 2: Mirror in `joinTrip`**

After the `arrayUnion(currentUser.uid)` updateDoc, add the same `set` call. Use the upper-cased `tripId.toUpperCase()` to match the trip key.

- [ ] **Step 3: Mirror in `leaveTrip`**

After the `arrayRemove`, add `remove(ref(rtdb, \`tripMembers/${tripId}/${currentUser.uid}\`))`.

- [ ] **Step 4: Mirror in TripAdmin's removeMember**

In `src/pages/TripAdmin.tsx`, find the member-removal flow (likely an `arrayRemove` on `members`). Add the corresponding RTDB `remove`.

---

### Task 4: Backfill existing trips

**Files:**
- Create: `scripts/backfill-trip-members-to-rtdb.mjs`

- [ ] **Step 1: Write the script**

Use `firebase-admin` initialized with a service-account key (or default ADC). Read all `trips/*` docs. For each trip, write `tripMembers/{tripId}/{uid} = true` for each `uid` in `members[]`.

- [ ] **Step 2: Dry-run first**

Add a `--dry-run` flag that logs what would be written without committing. Run against prod once, eyeball the output.

- [ ] **Step 3: Execute the backfill**

Run without `--dry-run`. Should complete in seconds for current trip count (<100).

- [ ] **Step 4: Spot-check in Firebase Console**

Open RTDB → `/tripMembers/...` → confirm shape `{tripId: {uid: true}}` and that membership matches the Firestore `trips/{tripId}.members` array for at least 3 random trips.

---

### Task 5: Document and verify

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the invariant**

Under "Architecture → Firestore data model & rules" (or a new "Realtime Database" subsection), add a note:

> `/tripMembers/{tripId}/{uid}` mirrors the trip's Firestore `members` array. The `mirrorTripMembership` Cloud Function is the authoritative writer; client paths in TripContext also write directly for read-after-write consistency. Live-location read rules depend on this mirror — if the mirror is stale or missing, members will see `permission_denied` on the Map page.

- [ ] **Step 2: End-to-end smoke test**

After deploying rules + function:
1. Sign in as user A. Pick "3h" mode on a trip A is in. Verify entry appears in `/liveLocation/{tripId}/{A.uid}`.
2. Sign in as user B (in same trip). Open Map page. Verify A's pin appears.
3. Sign in as user C (NOT in that trip). Try to read `/liveLocation/{tripId}` via the JS console. Should get `permission_denied`.

- [ ] **Step 3: Deploy in this order**

1. `firebase deploy --only functions:mirrorTripMembership` (creates the trigger)
2. Run the backfill script (seeds existing trips into the new mirror)
3. `firebase deploy --only database` (activates the new read rule — only safe *after* the mirror is populated, otherwise existing members lose access until the trigger catches up)

---

## Out of scope for this plan

- Encrypting live-location entries at rest (would require client-side crypto + key management; not warranted at current scale).
- Per-member opt-out from being shown to specific other members within a trip (a privacy refinement worth considering after beta feedback).
- Migrating the existing Firestore `lastKnownLocation` field to follow the same membership-gated pattern (it's currently readable by any authenticated user). Track as a separate plan if scope warrants.
