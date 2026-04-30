import {
    initializeTestEnvironment,
    type RulesTestEnvironment,
    assertSucceeds,
    assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { ref, get, set, remove } from 'firebase/database';

// Mirrors tests/firestore.rules.test.ts. Uses the database emulator on the
// port declared in firebase.json. Run via `npm run test:rules:database`.
const PROJECT_ID = 'tripmates-rules-test';
const DATABASE_HOST = '127.0.0.1';
const DATABASE_PORT = 9000;

let testEnv: RulesTestEnvironment;

const ALICE = 'alice-uid';
const BOB = 'bob-uid';
const TRIP_ID = 'BCNTRP';

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        database: {
            host: DATABASE_HOST,
            port: DATABASE_PORT,
            rules: readFileSync(resolve(__dirname, '../database.rules.json'), 'utf8'),
        },
    });
});

afterAll(async () => {
    await testEnv.cleanup();
});

beforeEach(async () => {
    await testEnv.clearDatabase();
});

const asUser = (uid: string) => testEnv.authenticatedContext(uid).database();
const asAnon = () => testEnv.unauthenticatedContext().database();

const validEntry = (overrides: Record<string, unknown> = {}) => ({
    lat: 41.3851,
    lng: 2.1734,
    accuracy: 10,
    heading: null,
    updatedAt: Date.now(),
    expiresAt: Date.now() + 3 * 3600 * 1000,
    mode: '24h',
    ...overrides,
});

describe('default deny at root', () => {
    it('blocks reads on unknown paths', async () => {
        await assertFails(get(ref(asUser(ALICE), 'unknown')));
    });

    it('blocks writes on unknown paths', async () => {
        await assertFails(set(ref(asUser(ALICE), 'unknown'), { x: 1 }));
    });
});

describe('liveLocation reads', () => {
    it('allows authed users to read', async () => {
        await assertSucceeds(get(ref(asUser(ALICE), `liveLocation/${TRIP_ID}/${BOB}`)));
    });

    it('rejects anon reads', async () => {
        await assertFails(get(ref(asAnon(), `liveLocation/${TRIP_ID}/${BOB}`)));
    });
});

describe('liveLocation writes', () => {
    it('allows a user to write their own entry', async () => {
        await assertSucceeds(
            set(ref(asUser(ALICE), `liveLocation/${TRIP_ID}/${ALICE}`), validEntry()),
        );
    });

    it("rejects writing to another user's entry", async () => {
        await assertFails(
            set(ref(asUser(BOB), `liveLocation/${TRIP_ID}/${ALICE}`), validEntry()),
        );
    });

    it('rejects anon writes', async () => {
        await assertFails(
            set(ref(asAnon(), `liveLocation/${TRIP_ID}/${ALICE}`), validEntry()),
        );
    });

    it('allows the owner to delete (stop sharing)', async () => {
        // Seed via admin context, then delete as the owner.
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await set(ref(ctx.database(), `liveLocation/${TRIP_ID}/${ALICE}`), validEntry());
        });
        await assertSucceeds(remove(ref(asUser(ALICE), `liveLocation/${TRIP_ID}/${ALICE}`)));
    });

    it("rejects another user deleting someone's entry", async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await set(ref(ctx.database(), `liveLocation/${TRIP_ID}/${ALICE}`), validEntry());
        });
        await assertFails(remove(ref(asUser(BOB), `liveLocation/${TRIP_ID}/${ALICE}`)));
    });
});

describe('liveLocation validation', () => {
    it('rejects entries missing required fields', async () => {
        // No lat/lng/updatedAt/mode — the parent .validate fires.
        await assertFails(
            set(ref(asUser(ALICE), `liveLocation/${TRIP_ID}/${ALICE}`), { accuracy: 5 }),
        );
    });

    it('rejects out-of-range latitude', async () => {
        await assertFails(
            set(
                ref(asUser(ALICE), `liveLocation/${TRIP_ID}/${ALICE}`),
                validEntry({ lat: 95 }),
            ),
        );
    });

    it('rejects out-of-range longitude', async () => {
        await assertFails(
            set(
                ref(asUser(ALICE), `liveLocation/${TRIP_ID}/${ALICE}`),
                validEntry({ lng: -200 }),
            ),
        );
    });

    it("rejects mode = 'off' (off is represented by deletion, not a written value)", async () => {
        await assertFails(
            set(
                ref(asUser(ALICE), `liveLocation/${TRIP_ID}/${ALICE}`),
                validEntry({ mode: 'off' }),
            ),
        );
    });

    it('rejects unknown mode strings', async () => {
        await assertFails(
            set(
                ref(asUser(ALICE), `liveLocation/${TRIP_ID}/${ALICE}`),
                validEntry({ mode: 'forever' }),
            ),
        );
    });

    it("accepts mode = 'always' with expiresAt = null", async () => {
        await assertSucceeds(
            set(
                ref(asUser(ALICE), `liveLocation/${TRIP_ID}/${ALICE}`),
                validEntry({ mode: 'always', expiresAt: null }),
            ),
        );
    });

    it('rejects extra/unknown leaf keys ($other validate=false)', async () => {
        await assertFails(
            set(
                ref(asUser(ALICE), `liveLocation/${TRIP_ID}/${ALICE}`),
                { ...validEntry(), surprise: 'gotcha' },
            ),
        );
    });

    it('rejects non-numeric updatedAt', async () => {
        await assertFails(
            set(
                ref(asUser(ALICE), `liveLocation/${TRIP_ID}/${ALICE}`),
                validEntry({ updatedAt: 'now' as unknown as number }),
            ),
        );
    });
});
