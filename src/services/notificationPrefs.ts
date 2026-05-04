import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const PREFS_DOC_ID = 'notifications';

export type NotificationCategory =
    | 'chat'
    | 'tripInvite'
    | 'games'
    | 'polls'
    | 'activityReminder'
    | 'follow';

export type NotificationPrefs = Partial<Record<NotificationCategory, boolean>>;

export const ALL_NOTIFICATION_CATEGORIES: NotificationCategory[] = [
    'chat',
    'tripInvite',
    'games',
    'polls',
    'activityReminder',
    'follow',
];

/**
 * A missing field == "on". This matches the server-side default in
 * functions/src/push.ts and lets new users receive everything until
 * they opt out.
 */
export function isCategoryEnabled(prefs: NotificationPrefs | null, category: NotificationCategory): boolean {
    if (!prefs) return true;
    const v = prefs[category];
    return v !== false;
}

export async function getNotificationPrefs(uid: string): Promise<NotificationPrefs | null> {
    try {
        const snap = await getDoc(doc(db, 'users', uid, 'private', PREFS_DOC_ID));
        if (!snap.exists()) return null;
        return snap.data() as NotificationPrefs;
    } catch {
        return null;
    }
}

export async function setNotificationPref(
    uid: string,
    category: NotificationCategory,
    enabled: boolean,
): Promise<void> {
    await setDoc(
        doc(db, 'users', uid, 'private', PREFS_DOC_ID),
        { [category]: enabled },
        { merge: true },
    );
}
