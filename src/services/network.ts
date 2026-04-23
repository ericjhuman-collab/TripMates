import { doc, getDoc, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from './firebase';
import type { AppUser } from '../context/AuthContext';

export const followUser = async (currentUid: string, targetUid: string) => {
    if (currentUid === targetUid) throw new Error("Cannot follow yourself");

    const batch = writeBatch(db);
    const currentUserRef = doc(db, 'users', currentUid);
    const targetUserRef = doc(db, 'users', targetUid);

    batch.update(currentUserRef, {
        following: arrayUnion(targetUid)
    });
    batch.update(targetUserRef, {
        followers: arrayUnion(currentUid)
    });

    await batch.commit();
};

export const unfollowUser = async (currentUid: string, targetUid: string) => {
    if (currentUid === targetUid) return;

    const batch = writeBatch(db);
    const currentUserRef = doc(db, 'users', currentUid);
    const targetUserRef = doc(db, 'users', targetUid);

    batch.update(currentUserRef, {
        following: arrayRemove(targetUid)
    });
    batch.update(targetUserRef, {
        followers: arrayRemove(currentUid)
    });

    await batch.commit();
};

export const fetchPopulatedUsers = async (uids: string[]): Promise<AppUser[]> => {
    if (!uids || uids.length === 0) return [];

    // Since 'in' queries are limited to 10 items, fetch them individually if > 10, or batch them.
    // For simplicity locally, let's just Promise.all getDocs
    const promises = uids.map(uid => getDoc(doc(db, 'users', uid)));
    const snaps = await Promise.all(promises);
    return snaps.filter(s => s.exists()).map(s => s.data() as AppUser);
};
