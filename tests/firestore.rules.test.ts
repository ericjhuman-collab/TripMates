import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, arrayUnion, arrayRemove,
} from 'firebase/firestore';

// Bump host/port if you customize firebase.json.
const PROJECT_ID = 'tripmates-rules-test';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

let testEnv: RulesTestEnvironment;

const ALICE = 'alice-uid';
const BOB = 'bob-uid';
const CAROL = 'carol-uid';
const TRIP_ID = 'BCNTRP';

const baseTrip = (overrides: Record<string, unknown> = {}) => ({
  id: TRIP_ID,
  name: 'Barcelona',
  type: 'Default Trip',
  createdBy: ALICE,
  adminIds: [ALICE],
  members: [ALICE, BOB],
  baseCurrency: 'SEK',
  inviteClosed: false,
  ...overrides,
});

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// Convenience wrappers
const asUser = (uid: string) => testEnv.authenticatedContext(uid).firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

// Seed trip + an expense + an activity using admin context (bypasses rules).
async function seedTrip(overrides: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'trips', TRIP_ID), baseTrip(overrides));
    await setDoc(doc(db, 'users', ALICE), { uid: ALICE, role: 'user', name: 'Alice', email: 'a@x', followers: [], following: [] });
    await setDoc(doc(db, 'users', BOB), { uid: BOB, role: 'user', name: 'Bob', email: 'b@x', followers: [], following: [] });
    await setDoc(doc(db, 'users', CAROL), { uid: CAROL, role: 'user', name: 'Carol', email: 'c@x', followers: [], following: [] });
  });
}

describe('default deny', () => {
  it('blocks reads on unknown collection', async () => {
    await assertFails(getDoc(doc(asUser(ALICE), 'unknownCollection/any')));
  });
  it('blocks writes on unknown collection', async () => {
    await assertFails(setDoc(doc(asUser(ALICE), 'unknownCollection/any'), { x: 1 }));
  });
});

describe('users/{uid}', () => {
  beforeEach(async () => {
    await seedTrip();
  });

  it('any authed user can read another user doc', async () => {
    await assertSucceeds(getDoc(doc(asUser(BOB), 'users', ALICE)));
  });

  it('anon cannot read user docs', async () => {
    await assertFails(getDoc(doc(asAnon(), 'users', ALICE)));
  });

  it('owner can update own profile fields', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(ALICE), 'users', ALICE), { name: 'Alice Updated' })
    );
  });

  it('user CANNOT promote self to admin', async () => {
    await assertFails(
      updateDoc(doc(asUser(ALICE), 'users', ALICE), { role: 'admin' })
    );
  });

  it('user cannot update someone else’s profile', async () => {
    await assertFails(
      updateDoc(doc(asUser(BOB), 'users', ALICE), { name: 'Hacked' })
    );
  });

  it('user CAN add self to another user’s followers (bilateral follow)', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(BOB), 'users', ALICE), { followers: arrayUnion(BOB) })
    );
  });

  it('user CAN add self as first follower (target has no followers field yet)', async () => {
    // Wipe followers on Alice, then Bob follows.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', ALICE),
        { uid: ALICE, role: 'user', name: 'Alice', email: 'a@x' });
    });
    await assertSucceeds(
      updateDoc(doc(asUser(BOB), 'users', ALICE), { followers: arrayUnion(BOB) })
    );
  });

  it('user CANNOT add someone else to a third party’s followers', async () => {
    await assertFails(
      updateDoc(doc(asUser(BOB), 'users', ALICE), { followers: arrayUnion(CAROL) })
    );
  });

  it('user cannot delete a user doc', async () => {
    await assertFails(deleteDoc(doc(asUser(ALICE), 'users', ALICE)));
  });
});

describe('users/{uid}/scanQuota — locked from clients', () => {
  it('owner cannot read own quota', async () => {
    await assertFails(getDoc(doc(asUser(ALICE), 'users', ALICE, 'scanQuota', '2026-04-26')));
  });
  it('owner cannot write own quota', async () => {
    await assertFails(setDoc(doc(asUser(ALICE), 'users', ALICE, 'scanQuota', '2026-04-26'), { count: 0 }));
  });
});

describe('trips/{tripId}', () => {
  beforeEach(async () => {
    await seedTrip();
  });

  it('member can read trip', async () => {
    await assertSucceeds(getDoc(doc(asUser(ALICE), 'trips', TRIP_ID)));
  });

  it('non-member cannot read trip', async () => {
    await assertFails(getDoc(doc(asUser(CAROL), 'trips', TRIP_ID)));
  });

  it('admin can update trip', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(ALICE), 'trips', TRIP_ID), { name: 'New Name' })
    );
  });

  it('non-admin member cannot update arbitrary trip fields', async () => {
    await assertFails(
      updateDoc(doc(asUser(BOB), 'trips', TRIP_ID), { name: 'Hacked' })
    );
  });

  it('non-member CAN join via arrayUnion(self)', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(CAROL), 'trips', TRIP_ID), { members: arrayUnion(CAROL) })
    );
  });

  it('non-member cannot join when inviteClosed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'trips', TRIP_ID), { inviteClosed: true });
    });
    await assertFails(
      updateDoc(doc(asUser(CAROL), 'trips', TRIP_ID), { members: arrayUnion(CAROL) })
    );
  });

  it('user cannot join by adding someone ELSE to members', async () => {
    await assertFails(
      updateDoc(doc(asUser(CAROL), 'trips', TRIP_ID), { members: arrayUnion('mallory') })
    );
  });

  it('member can leave (remove self)', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(BOB), 'trips', TRIP_ID), { members: arrayRemove(BOB) })
    );
  });

  it('member cannot kick another member', async () => {
    await assertFails(
      updateDoc(doc(asUser(BOB), 'trips', TRIP_ID), { members: arrayRemove(ALICE) })
    );
  });

  it('admin can delete trip; non-admin cannot', async () => {
    await assertFails(deleteDoc(doc(asUser(BOB), 'trips', TRIP_ID)));
    await assertSucceeds(deleteDoc(doc(asUser(ALICE), 'trips', TRIP_ID)));
  });

  it('create trip succeeds when self is creator/admin/member', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(CAROL), 'trips', 'NEWTRP'), {
        id: 'NEWTRP', name: 'My Trip', type: 'Default',
        createdBy: CAROL, adminIds: [CAROL], members: [CAROL],
      })
    );
  });

  it('create trip fails when claiming someone else as createdBy', async () => {
    await assertFails(
      setDoc(doc(asUser(CAROL), 'trips', 'NEWTRP'), {
        id: 'NEWTRP', name: 'Sneaky', type: 'Default',
        createdBy: ALICE, adminIds: [CAROL], members: [CAROL],
      })
    );
  });
});

describe('expenses/{expenseId}', () => {
  beforeEach(async () => {
    await seedTrip();
  });

  it('trip member can create expense if creatorId == self', async () => {
    await assertSucceeds(
      addDoc(collection(asUser(BOB), 'expenses'), {
        tripId: TRIP_ID, creatorId: BOB, payerId: BOB, amount: 1000, currency: 'SEK',
        description: 'Coffee', date: '2026-04-26', participants: [], splitType: 'EQUAL',
      })
    );
  });

  it('non-member cannot create expense', async () => {
    await assertFails(
      addDoc(collection(asUser(CAROL), 'expenses'), {
        tripId: TRIP_ID, creatorId: CAROL, payerId: CAROL, amount: 1000, currency: 'SEK',
        description: 'Coffee', date: '2026-04-26', participants: [], splitType: 'EQUAL',
      })
    );
  });

  it('cannot spoof creatorId', async () => {
    await assertFails(
      addDoc(collection(asUser(BOB), 'expenses'), {
        tripId: TRIP_ID, creatorId: ALICE, payerId: ALICE, amount: 1000, currency: 'SEK',
        description: 'Spoof', date: '2026-04-26', participants: [], splitType: 'EQUAL',
      })
    );
  });

  it('payer can update; admin can update; random member cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'expenses', 'exp1'), {
        tripId: TRIP_ID, creatorId: ALICE, payerId: ALICE, amount: 1000, currency: 'SEK',
        description: 'Coffee', date: '2026-04-26', participants: [], splitType: 'EQUAL',
      });
    });
    // ALICE is payer + admin: ok
    await assertSucceeds(updateDoc(doc(asUser(ALICE), 'expenses', 'exp1'), { amount: 1100 }));
    // BOB is just a trip member, neither payer nor creator nor admin: blocked
    await assertFails(updateDoc(doc(asUser(BOB), 'expenses', 'exp1'), { amount: 1200 }));
    // CAROL outsider: blocked
    await assertFails(updateDoc(doc(asUser(CAROL), 'expenses', 'exp1'), { amount: 1300 }));
  });
});

describe('payments/{paymentId}', () => {
  beforeEach(async () => seedTrip());

  it('trip member may create payment', async () => {
    await assertSucceeds(
      addDoc(collection(asUser(BOB), 'payments'), {
        tripId: TRIP_ID, fromUid: BOB, toUid: ALICE, amount: 500,
        currency: 'SEK', date: '2026-04-26', status: 'PENDING',
      })
    );
  });

  it('non-member cannot create payment', async () => {
    await assertFails(
      addDoc(collection(asUser(CAROL), 'payments'), {
        tripId: TRIP_ID, fromUid: CAROL, toUid: ALICE, amount: 500,
        currency: 'SEK', date: '2026-04-26', status: 'PENDING',
      })
    );
  });

  it('admin can delete COMPLETED payment; non-admin member cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'payments', 'pComplete'), {
        tripId: TRIP_ID, fromUid: BOB, toUid: ALICE, amount: 500,
        currency: 'SEK', date: '2026-04-26', status: 'COMPLETED',
      });
    });
    await assertFails(deleteDoc(doc(asUser(BOB), 'payments', 'pComplete')));
    await assertSucceeds(deleteDoc(doc(asUser(ALICE), 'payments', 'pComplete')));
  });

  it('any trip member can delete PENDING payment (for settle-up replace flow)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'payments', 'pPending'), {
        tripId: TRIP_ID, fromUid: BOB, toUid: ALICE, amount: 500,
        currency: 'SEK', date: '2026-04-26', status: 'PENDING',
      });
    });
    // Non-admin member BOB can delete a PENDING payment
    await assertSucceeds(deleteDoc(doc(asUser(BOB), 'payments', 'pPending')));
  });

  it('non-member cannot delete PENDING payment', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'payments', 'pPending2'), {
        tripId: TRIP_ID, fromUid: BOB, toUid: ALICE, amount: 500,
        currency: 'SEK', date: '2026-04-26', status: 'PENDING',
      });
    });
    await assertFails(deleteDoc(doc(asUser(CAROL), 'payments', 'pPending2')));
  });
});

describe('notifications subcollection', () => {
  beforeEach(async () => seedTrip());

  it('owner can read own notifications', async () => {
    await assertSucceeds(getDoc(doc(asUser(ALICE), 'users', ALICE, 'notifications', 'n1')));
  });

  it('non-owner cannot read another’s notifications', async () => {
    await assertFails(getDoc(doc(asUser(BOB), 'users', ALICE, 'notifications', 'n1')));
  });

  it('any authed user may create notif when fromUid == self', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(BOB), 'users', ALICE, 'notifications', 'n1'),
        { type: 'follow', fromUid: BOB, fromName: 'Bob', createdAt: Date.now(), read: false })
    );
  });

  it('user cannot spoof fromUid', async () => {
    await assertFails(
      setDoc(doc(asUser(BOB), 'users', ALICE, 'notifications', 'n1'),
        { type: 'follow', fromUid: CAROL, fromName: 'Carol', createdAt: Date.now(), read: false })
    );
  });
});

describe('trips/{tripId}/memberPrefs/{uid}', () => {
  beforeEach(async () => {
    await seedTrip();
  });

  it('member can write their own prefs', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(BOB), 'trips', TRIP_ID, 'memberPrefs', BOB),
        { shareLocation: true, sharePhoneNumber: false, updatedAt: 1 })
    );
  });

  it('member cannot write another member’s prefs', async () => {
    await assertFails(
      setDoc(doc(asUser(BOB), 'trips', TRIP_ID, 'memberPrefs', ALICE),
        { shareLocation: false, updatedAt: 1 })
    );
  });

  it('non-member cannot write prefs (even own uid)', async () => {
    await assertFails(
      setDoc(doc(asUser(CAROL), 'trips', TRIP_ID, 'memberPrefs', CAROL),
        { shareLocation: true, updatedAt: 1 })
    );
  });

  it('owner reads own prefs', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'trips', TRIP_ID, 'memberPrefs', BOB),
        { shareLocation: true });
    });
    await assertSucceeds(getDoc(doc(asUser(BOB), 'trips', TRIP_ID, 'memberPrefs', BOB)));
  });

  it('trip members can read each other’s prefs (to know what to display)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'trips', TRIP_ID, 'memberPrefs', BOB),
        { sharePhoneNumber: true });
    });
    await assertSucceeds(getDoc(doc(asUser(ALICE), 'trips', TRIP_ID, 'memberPrefs', BOB)));
  });

  it('non-members cannot read another member’s prefs', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'trips', TRIP_ID, 'memberPrefs', BOB),
        { sharePhoneNumber: true });
    });
    await assertFails(getDoc(doc(asUser(CAROL), 'trips', TRIP_ID, 'memberPrefs', BOB)));
  });
});

describe('usernames/{name} — uniqueness lock', () => {
  it('any authed user can read (availability check)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'usernames', 'taken'), { uid: ALICE });
    });
    await assertSucceeds(getDoc(doc(asUser(BOB), 'usernames', 'taken')));
  });
  it('anon cannot read', async () => {
    await assertFails(getDoc(doc(asAnon(), 'usernames', 'whatever')));
  });
  it('user can claim a fresh name with their own uid', async () => {
    await assertSucceeds(
      setDoc(doc(asUser(ALICE), 'usernames', 'alice'), { uid: ALICE, createdAt: 1 })
    );
  });
  it('user cannot claim a name on behalf of someone else', async () => {
    await assertFails(
      setDoc(doc(asUser(ALICE), 'usernames', 'bob'), { uid: BOB, createdAt: 1 })
    );
  });
  it('updates are blocked (must delete + create)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'usernames', 'foo'), { uid: ALICE });
    });
    await assertFails(
      updateDoc(doc(asUser(ALICE), 'usernames', 'foo'), { uid: BOB })
    );
  });
  it('owner can delete; non-owner cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'usernames', 'mine'), { uid: ALICE });
    });
    await assertFails(deleteDoc(doc(asUser(BOB), 'usernames', 'mine')));
    await assertSucceeds(deleteDoc(doc(asUser(ALICE), 'usernames', 'mine')));
  });
});

describe('gallery — like toggle', () => {
  beforeEach(async () => {
    await seedTrip();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'trips', TRIP_ID, 'gallery', 'img1'), {
        url: 'https://x', uploadedBy: ALICE, tripId: TRIP_ID, createdAt: 0, likes: [],
      });
    });
  });

  it('member can add own like', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(BOB), 'trips', TRIP_ID, 'gallery', 'img1'), { likes: arrayUnion(BOB) })
    );
  });

  it('member cannot like as someone else', async () => {
    await assertFails(
      updateDoc(doc(asUser(BOB), 'trips', TRIP_ID, 'gallery', 'img1'), { likes: arrayUnion(ALICE) })
    );
  });

  it('non-member cannot like', async () => {
    await assertFails(
      updateDoc(doc(asUser(CAROL), 'trips', TRIP_ID, 'gallery', 'img1'), { likes: arrayUnion(CAROL) })
    );
  });

  it('uploader CAN edit tags (activityId/activityName/taggedMembers) after upload', async () => {
    await assertSucceeds(
      updateDoc(doc(asUser(ALICE), 'trips', TRIP_ID, 'gallery', 'img1'),
        { activityId: 'a1', activityName: 'Lunch', taggedMembers: [BOB] })
    );
  });

  it('non-uploader, non-admin member CANNOT edit tags', async () => {
    await assertFails(
      updateDoc(doc(asUser(BOB), 'trips', TRIP_ID, 'gallery', 'img1'),
        { activityId: 'a1', activityName: 'Lunch', taggedMembers: [BOB] })
    );
  });

  it('uploader cannot sneak in other-field edits via the tag path', async () => {
    await assertFails(
      updateDoc(doc(asUser(ALICE), 'trips', TRIP_ID, 'gallery', 'img1'),
        { activityName: 'Lunch', uploadedBy: 'someoneElse' })
    );
  });
});
