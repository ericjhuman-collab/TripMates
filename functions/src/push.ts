import { getMessaging, type MulticastMessage } from 'firebase-admin/messaging';
import { getFirestore } from 'firebase-admin/firestore';

export type NotificationCategory =
    | 'chat'
    | 'tripInvite'
    | 'games'
    | 'polls'
    | 'activityReminder'
    | 'follow';

export interface PushPayload {
    title: string;
    body: string;
    /** Free-form data attached to the notification — used by the client to
     *  deep-link or render in-app context. Values must be strings (FCM constraint). */
    data?: Record<string, string>;
}

/**
 * Read the user's per-category prefs. A missing field == "on" (matches
 * the client's `isCategoryEnabled` default).
 */
async function isCategoryAllowed(uid: string, category: NotificationCategory): Promise<boolean> {
    const db = getFirestore();
    const snap = await db.doc(`users/${uid}/private/notifications`).get();
    if (!snap.exists) return true;
    const data = snap.data() ?? {};
    const v = (data as Record<string, unknown>)[category];
    return v !== false;
}

/**
 * List the user's stored FCM tokens.
 */
async function getUserTokens(uid: string): Promise<string[]> {
    const db = getFirestore();
    const snap = await db.collection(`users/${uid}/fcmTokens`).get();
    return snap.docs.map(d => d.id);
}

/**
 * Drop tokens that came back as unregistered/invalid from FCM. Stale
 * tokens accumulate forever otherwise (uninstalls, simulator wipes,
 * account switches on the same device).
 */
async function pruneTokens(uid: string, badTokens: string[]): Promise<void> {
    if (badTokens.length === 0) return;
    const db = getFirestore();
    await Promise.all(badTokens.map(t =>
        db.doc(`users/${uid}/fcmTokens/${t}`).delete().catch(() => undefined),
    ));
}

/**
 * Send a notification to a single user, gated on their category preference.
 * Cleans up unregistered tokens automatically.
 */
export async function sendToUser(
    uid: string,
    category: NotificationCategory,
    payload: PushPayload,
): Promise<void> {
    if (!(await isCategoryAllowed(uid, category))) return;
    const tokens = await getUserTokens(uid);
    if (tokens.length === 0) return;

    const message: MulticastMessage = {
        tokens,
        notification: { title: payload.title, body: payload.body },
        data: { category, ...(payload.data ?? {}) },
        apns: {
            payload: {
                aps: {
                    sound: 'default',
                    'mutable-content': 1,
                },
            },
        },
        android: {
            priority: 'high',
            notification: { channelId: 'default' },
        },
    };

    try {
        const res = await getMessaging().sendEachForMulticast(message);
        const bad: string[] = [];
        res.responses.forEach((r, i) => {
            if (r.success) return;
            const code = r.error?.code ?? '';
            if (
                code === 'messaging/registration-token-not-registered' ||
                code === 'messaging/invalid-registration-token' ||
                code === 'messaging/invalid-argument'
            ) {
                bad.push(tokens[i]);
            }
        });
        if (bad.length) await pruneTokens(uid, bad);
    } catch (err) {
        console.warn('[push] sendToUser failed for', uid, category, err);
    }
}

/**
 * Convenience: fan out the same payload to many users. Skips the actor.
 */
export async function sendToUsers(
    uids: string[],
    category: NotificationCategory,
    payload: PushPayload,
    excludeUid?: string,
): Promise<void> {
    const targets = excludeUid ? uids.filter(u => u !== excludeUid) : uids;
    await Promise.all(targets.map(u => sendToUser(u, category, payload)));
}
