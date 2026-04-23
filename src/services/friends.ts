import { db } from './firebase';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion, arrayRemove, getDoc } from 'firebase/firestore';
import { type AppUser } from '../context/AuthContext';

/**
 * Searches for a user exactly by their email address.
 * Returns the user data if found, otherwise null.
 */
export const searchUserByEmail = async (email: string): Promise<AppUser | null> => {
    if (!email) return null;
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', email.toLowerCase()));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            return { uid: userDoc.id, ...userDoc.data() } as AppUser;
        }
        return null; // Not found
    } catch (error) {
        console.error("Error searching user by email:", error);
        throw error;
    }
};

/**
 * Adds a friend's UID to the current user's friends list.
 */
export const addFriend = async (currentUserUid: string, friendUid: string): Promise<void> => {
    if (!currentUserUid || !friendUid) return;
    try {
        const userRef = doc(db, 'users', currentUserUid);
        await updateDoc(userRef, {
            friends: arrayUnion(friendUid)
        });
    } catch (error) {
        console.error("Error adding friend:", error);
        throw error;
    }
};

/**
 * Removes a friend's UID from the current user's friends list.
 */
export const removeFriend = async (currentUserUid: string, friendUid: string): Promise<void> => {
    if (!currentUserUid || !friendUid) return;
    try {
        const userRef = doc(db, 'users', currentUserUid);
        await updateDoc(userRef, {
            friends: arrayRemove(friendUid)
        });
    } catch (error) {
        console.error("Error removing friend:", error);
        throw error;
    }
};

/**
 * Fetches the AppUser data for an array of friend UIDs.
 */
export const getFriendsData = async (friendUids: string[]): Promise<AppUser[]> => {
    if (!friendUids || friendUids.length === 0) return [];

    try {
        const friendsData: AppUser[] = [];
        // Fetch each friend's document.
        // If the list gets very large, consider batching with `in` queries (max 10).
        for (const uid of friendUids) {
            const friendDoc = await getDoc(doc(db, 'users', uid));
            if (friendDoc.exists()) {
                friendsData.push({ uid: friendDoc.id, ...friendDoc.data() } as AppUser);
            }
        }
        return friendsData;
    } catch (error) {
        console.error("Error fetching friends data:", error);
        throw error;
    }
};

/**
 * Adds a friend to a specific trip.
 */
export const addFriendToTrip = async (friendUid: string, tripId: string): Promise<void> => {
    if (!friendUid || !tripId) return;
    try {
        const tripRef = doc(db, 'trips', tripId);
        const userRef = doc(db, 'users', friendUid);

        await updateDoc(tripRef, {
            members: arrayUnion(friendUid)
        });

        await updateDoc(userRef, {
            trips: arrayUnion(tripId)
        });
    } catch (error) {
        console.error("Error adding friend to trip:", error);
        throw error;
    }
};
