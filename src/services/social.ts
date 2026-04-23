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

export interface SocialNotification {
    id: string;
    type: 'follow';
    fromUid: string;
    fromName: string;
    fromAvatarUrl?: string;
    createdAt: number;
    read: boolean;
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
