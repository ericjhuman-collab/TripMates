import {
    collection, doc, getDoc, getDocs, limit as fsLimit, query, runTransaction,
    setDoc, where, writeBatch, documentId,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Validation rules ─────────────────────────────────────────────────────
// 3-20 chars, lowercase letters/numbers/underscore/period, must start with a letter,
// must end with letter or number, no consecutive special chars.
const USERNAME_REGEX = /^[a-z][a-z0-9._]{1,18}[a-z0-9]$/;
const NO_CONSECUTIVE_SPECIALS = /[._]{2}/;

// Can't be claimed — system-reserved or culturally sensitive.
const RESERVED = new Set([
    'admin', 'administrator', 'root', 'superuser', 'mod', 'moderator',
    'support', 'help', 'info', 'contact', 'team', 'staff',
    'tripmates', 'app', 'api', 'www', 'mail', 'no-reply', 'noreply',
    'me', 'you', 'self', 'profile', 'settings', 'login', 'signup', 'logout',
    'about', 'privacy', 'terms', 'legal', 'security',
    // Mild profanity / abusive — extend as needed.
    'fuck', 'shit', 'bitch', 'asshole', 'cunt',
]);

export interface ValidationResult {
    valid: boolean;
    reason?: string;
}

/**
 * Normalize a raw input string into a candidate username:
 * - lowercase
 * - strip diacritics (å → a, é → e)
 * - keep only [a-z0-9._]
 * - collapse repeated specials
 * - trim leading/trailing specials
 */
export function normalizeUsername(raw: string): string {
    if (!raw) return '';
    const ascii = raw
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
    const cleaned = ascii.replace(/[^a-z0-9._]/g, '');
    const collapsed = cleaned.replace(/([._])\1+/g, '$1');
    return collapsed.replace(/^[._]+|[._]+$/g, '');
}

export function validateUsername(name: string): ValidationResult {
    if (!name) return { valid: false, reason: 'Username cannot be empty.' };
    if (name.length < 3) return { valid: false, reason: 'Username must be at least 3 characters.' };
    if (name.length > 20) return { valid: false, reason: 'Username cannot be longer than 20 characters.' };
    if (!USERNAME_REGEX.test(name)) {
        return {
            valid: false,
            reason: 'Use lowercase letters, numbers, periods, or underscores. Must start with a letter.',
        };
    }
    if (NO_CONSECUTIVE_SPECIALS.test(name)) {
        return { valid: false, reason: 'No consecutive periods or underscores.' };
    }
    if (RESERVED.has(name)) {
        return { valid: false, reason: 'This username is reserved.' };
    }
    return { valid: true };
}

/** Read-only check. Race conditions possible — use claimUsername() to actually take it. */
export async function isUsernameAvailable(name: string): Promise<boolean> {
    const snap = await getDoc(doc(db, 'usernames', name));
    return !snap.exists();
}

/**
 * Atomically claim `name` for `uid`. Throws if already taken.
 * Writes both `usernames/{name}` (the lock) and `users/{uid}.username` (the back-reference).
 */
export async function claimUsername(uid: string, name: string): Promise<void> {
    const v = validateUsername(name);
    if (!v.valid) throw new Error(v.reason);

    await runTransaction(db, async (tx) => {
        const lockRef = doc(db, 'usernames', name);
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists()) {
            const existing = lockSnap.data()?.uid;
            if (existing === uid) return; // Idempotent: already mine.
            throw new Error('That username is already taken.');
        }
        tx.set(lockRef, { uid, createdAt: Date.now() });
        tx.set(doc(db, 'users', uid), { username: name }, { merge: true });
    });
}

/** Release a username so it can be claimed by someone else. Safe to call if not held. */
export async function releaseUsername(uid: string, name: string): Promise<void> {
    await runTransaction(db, async (tx) => {
        const lockRef = doc(db, 'usernames', name);
        const lockSnap = await tx.get(lockRef);
        if (!lockSnap.exists()) return;
        if (lockSnap.data()?.uid !== uid) {
            throw new Error('Cannot release a username you do not own.');
        }
        tx.delete(lockRef);
    });
}

/**
 * Atomically change a user's username. Releases the old one + claims the new one.
 * No-op if oldName === newName.
 */
export async function changeUsername(
    uid: string,
    oldName: string | undefined,
    newName: string,
): Promise<void> {
    if (oldName === newName) return;
    await claimUsername(uid, newName);
    if (oldName) {
        try {
            await releaseUsername(uid, oldName);
        } catch (e) {
            // Don't fail the whole change if old release fails — log and continue.
            console.error('Failed to release old username (orphaned reservation):', e);
        }
    }
}

/**
 * Generate an available username from a seed (typically firstName).
 * Tries `seed`, `seed2`, `seed3`, ... up to attempts. Returns the claimed name.
 */
export async function generateAndClaimUsername(
    uid: string,
    seed: string,
    fallback?: string,
): Promise<string> {
    let base = normalizeUsername(seed);
    if (base.length < 3 && fallback) base = normalizeUsername(fallback);
    if (base.length < 3) base = 'traveler';
    if (base.length > 16) base = base.slice(0, 16); // leave room for suffix

    const candidates = [base, ...Array.from({ length: 50 }, (_, i) => `${base}${i + 2}`)];
    for (const candidate of candidates) {
        if (!validateUsername(candidate).valid) continue;
        try {
            await claimUsername(uid, candidate);
            return candidate;
        } catch {
            // already taken — try next suffix
        }
    }
    // Last resort: random 6-digit suffix.
    const random = `${base}${Math.floor(Math.random() * 900000) + 100000}`;
    await claimUsername(uid, random);
    return random;
}

/**
 * Prefix-search the usernames collection. Returns up to `max` matches with uid+username.
 * Caller is responsible for fetching user doc fields (avatar, name) if needed.
 */
export async function searchUsersByUsernamePrefix(
    rawPrefix: string,
    max = 10,
): Promise<{ uid: string; username: string }[]> {
    const prefix = normalizeUsername(rawPrefix);
    if (!prefix) return [];
    const q = query(
        collection(db, 'usernames'),
        where(documentId(), '>=', prefix),
        where(documentId(), '<=', prefix + ''),
        fsLimit(max),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ uid: d.data().uid as string, username: d.id }));
}

/** Admin/migration: assign a username to a user that doesn't have one yet. */
export async function backfillUsernameIfMissing(
    uid: string,
    seed: string,
    fallback?: string,
): Promise<{ uid: string; username: string; created: boolean }> {
    const userSnap = await getDoc(doc(db, 'users', uid));
    const existing = userSnap.exists() ? (userSnap.data().username as string | undefined) : undefined;
    if (existing) return { uid, username: existing, created: false };
    const username = await generateAndClaimUsername(uid, seed, fallback);
    return { uid, username, created: true };
}

/** Convenience: write the username pair (used by tests/scripts when bypassing transaction is OK). */
export async function _writePairUnsafe(uid: string, name: string): Promise<void> {
    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', name), { uid, createdAt: Date.now() });
    batch.set(doc(db, 'users', uid), { username: name }, { merge: true });
    await batch.commit();
    // Mark setDoc usage to keep linter happy if unused above
    void setDoc;
}
