import { db } from './firebase';
import {
    doc,
    updateDoc,
    arrayUnion,
    arrayRemove,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    serverTimestamp,
    writeBatch,
} from 'firebase/firestore';

export type NotificationType =
    | 'follow'
    | 'trip:new_activity'
    | 'trip:new_expense'
    | 'trip:settled_up'
    | 'trip:photo_tag'
    | 'trip:invite';

export interface SocialNotification {
    id: string;
    type: NotificationType;
    fromUid: string;
    fromName: string;
    fromAvatarUrl?: string;
    createdAt: number;
    read: boolean;
    /** For trip-scoped notifications: id of the trip the event happened in. */
    tripId?: string;
    /** Free-form message body shown to the user. */
    message?: string;
    /** Optional in-app link target (e.g. /admin/{tripId} or /even). */
    linkUrl?: string;
}

export interface TripNotificationPayload {
    type: Exclude<NotificationType, 'follow'>;
    tripId: string;
    fromUid: string;
    fromName: string;
    fromAvatarUrl?: string;
    message: string;
    linkUrl?: string;
}

/** Follow a user: updates both sides' arrays + writes a notification. */
export async function followUser(
    currentUid: string,
    targetUid: string,
    currentName: string,
    currentAvatarUrl?: string,
) {
    const batch = writeBatch(db);

    // Add targetUid to current user's following[]
    batch.update(doc(db, 'users', currentUid), {
        following: arrayUnion(targetUid),
    });

    // Add currentUid to target user's followers[]
    batch.update(doc(db, 'users', targetUid), {
        followers: arrayUnion(currentUid),
    });

    await batch.commit();

    // Add a notification for the target user
    await addDoc(collection(db, 'users', targetUid, 'notifications'), {
        type: 'follow',
        fromUid: currentUid,
        fromName: currentName,
        fromAvatarUrl: currentAvatarUrl || '',
        createdAt: serverTimestamp(),
        read: false,
    });
}

/** Unfollow a user: removes from both sides' arrays. */
export async function unfollowUser(currentUid: string, targetUid: string) {
    const batch = writeBatch(db);

    batch.update(doc(db, 'users', currentUid), {
        following: arrayRemove(targetUid),
    });

    batch.update(doc(db, 'users', targetUid), {
        followers: arrayRemove(currentUid),
    });

    await batch.commit();
}

/** Load a user's notification feed (most recent first). */
export async function getNotifications(uid: string): Promise<SocialNotification[]> {
    const ref = collection(db, 'users', uid, 'notifications');
    const q = query(ref, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<SocialNotification, 'id'>),
        createdAt: d.data().createdAt?.toMillis?.() ?? Date.now(),
    }));
}

/** Mark a notification as read. */
export async function markNotificationRead(uid: string, notifId: string) {
    await updateDoc(doc(db, 'users', uid, 'notifications', notifId), { read: true });
}

import { getMemberPrefs } from './memberPrefs';

/**
 * Send a trip-scoped notification to a single member, IF they have not muted
 * notifications for this trip. The mute pref lives at trips/{tripId}/memberPrefs/{uid}.
 *
 * Safe to call even if the recipient has muted — it simply no-ops.
 */
export async function notifyTripMember(uid: string, payload: TripNotificationPayload): Promise<void> {
    if (uid === payload.fromUid) return; // Don't notify yourself about your own action.
    try {
        const prefs = await getMemberPrefs(payload.tripId, uid);
        if (prefs.muteNotifications) return;
    } catch (e) {
        // If we can't read prefs (e.g. they've never been set), default to NOT muted.
        console.warn('Could not read member prefs; sending notification anyway', e);
    }
    await addDoc(collection(db, 'users', uid, 'notifications'), {
        type: payload.type,
        tripId: payload.tripId,
        fromUid: payload.fromUid,
        fromName: payload.fromName,
        fromAvatarUrl: payload.fromAvatarUrl || '',
        message: payload.message,
        ...(payload.linkUrl ? { linkUrl: payload.linkUrl } : {}),
        createdAt: serverTimestamp(),
        read: false,
    });
}

/** Fan-out: send the same payload to many recipients in parallel, respecting each one's mute pref. */
export async function notifyTripMembers(uids: string[], payload: TripNotificationPayload): Promise<void> {
    await Promise.all(uids.map(uid => notifyTripMember(uid, payload).catch(e =>
        console.warn(`Failed to notify ${uid}:`, e)
    )));
}
