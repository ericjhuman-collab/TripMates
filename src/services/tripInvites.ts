import {
    collection,
    doc,
    documentId,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    onSnapshot,
    query,
    where,
    limit,
    arrayUnion,
    updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { normalizeSearchInput } from '../utils/searchFields';
import { searchUsersByUsernamePrefix } from './username';
import type { AppUser } from '../context/AuthContext';

export interface TripInvite {
    id: string;
    tripId: string;
    tripName: string;
    tripDestination?: string;
    invitedUid: string;
    invitedBy: string;
    invitedByName: string;
    createdAt: number;
}

const inviteId = (tripId: string, invitedUid: string) => `${tripId}_${invitedUid}`;

export async function inviteUserToTrip(opts: {
    tripId: string;
    tripName: string;
    tripDestination?: string;
    invitedUid: string;
    invitedBy: string;
    invitedByName: string;
}): Promise<void> {
    const { tripId, invitedUid } = opts;
    const ref = doc(db, 'tripInvites', inviteId(tripId, invitedUid));
    const payload: Omit<TripInvite, 'id'> = {
        tripId,
        tripName: opts.tripName,
        tripDestination: opts.tripDestination,
        invitedUid,
        invitedBy: opts.invitedBy,
        invitedByName: opts.invitedByName,
        createdAt: Date.now(),
    };
    await setDoc(ref, payload);
}

export async function revokeTripInvite(tripId: string, invitedUid: string): Promise<void> {
    await deleteDoc(doc(db, 'tripInvites', inviteId(tripId, invitedUid)));
}

export function subscribeToPendingInvites(
    uid: string,
    cb: (invites: TripInvite[]) => void,
): () => void {
    const q = query(collection(db, 'tripInvites'), where('invitedUid', '==', uid));
    return onSnapshot(q, snap => {
        const invites = snap.docs.map(d => ({ ...(d.data() as Omit<TripInvite, 'id'>), id: d.id }));
        invites.sort((a, b) => b.createdAt - a.createdAt);
        cb(invites);
    });
}

/** Accept: self-add to trip.members, then delete the invite.
 *
 * Idempotent: if a previous attempt added the user to `trip.members` but
 * then failed before deleting the invite (e.g., transient network error
 * on the user-doc write), the next click would otherwise hit the trip
 * rule's `addedSelfTo` check — which fails because the user is already
 * in members — and surface "Could not join trip" forever. Detect that
 * case via the trip read (which succeeds *because* we're already a
 * member) and skip the redundant trip write. */
export async function acceptTripInvite(invite: TripInvite, currentUid: string): Promise<void> {
    const tripRef = doc(db, 'trips', invite.tripId);
    const userRef = doc(db, 'users', currentUid);

    let alreadyMember = false;
    try {
        const snap = await getDoc(tripRef);
        if (snap.exists()) {
            const data = snap.data() as { members?: string[] };
            alreadyMember = !!data.members?.includes(currentUid);
        }
    } catch {
        // Read denied — expected on first-time accept (we're not yet a
        // member, so the trip read rule rejects). Fall through to the
        // write, which is the correct path for that case.
    }

    // Step-tag each write so the toast surfaces *which* step failed —
    // permission-denied on the trip update means the invitee-join rule;
    // on the user doc means the owner-update rule; on the invite means
    // the invitee-delete rule. Saves a guessing game next time.
    if (!alreadyMember) {
        try {
            await updateDoc(tripRef, { members: arrayUnion(currentUid) });
        } catch (e) {
            const err = e as { code?: string; message?: string };
            throw new Error(`trip-update: ${err.code || err.message || 'unknown'}`);
        }
    }
    try {
        await updateDoc(userRef, { trips: arrayUnion(invite.tripId), activeTripId: invite.tripId });
    } catch (e) {
        const err = e as { code?: string; message?: string };
        throw new Error(`user-update: ${err.code || err.message || 'unknown'}`);
    }
    try {
        await deleteDoc(doc(db, 'tripInvites', invite.id));
    } catch (e) {
        const err = e as { code?: string; message?: string };
        throw new Error(`invite-delete: ${err.code || err.message || 'unknown'}`);
    }
}

export async function declineTripInvite(invite: TripInvite): Promise<void> {
    await deleteDoc(doc(db, 'tripInvites', invite.id));
}

/** Returns existing pending-invite uids for a trip, so the modal can hide them. */
export async function getPendingInviteUidsForTrip(tripId: string): Promise<string[]> {
    const q = query(collection(db, 'tripInvites'), where('tripId', '==', tripId));
    const snap = await getDocs(q);
    return snap.docs.map(d => (d.data() as TripInvite).invitedUid);
}

/**
 * Search users by name (nameLower / lastNameLower) and username, mirroring
 * the global Layout search. Excludes uids in `excludeUids`.
 */
export async function searchUsersForInvite(
    rawQuery: string,
    excludeUids: Set<string>,
    max = 10,
): Promise<AppUser[]> {
    const normalized = normalizeSearchInput(rawQuery);
    if (normalized.length < 2) return [];
    const upper = normalized + '';

    const nameQ = query(
        collection(db, 'users'),
        where('nameLower', '>=', normalized),
        where('nameLower', '<=', upper),
        limit(max),
    );
    const lastNameQ = query(
        collection(db, 'users'),
        where('lastNameLower', '>=', normalized),
        where('lastNameLower', '<=', upper),
        limit(max),
    );

    const [nameSnap, lastNameSnap, usernameHits] = await Promise.all([
        getDocs(nameQ),
        getDocs(lastNameQ),
        searchUsersByUsernamePrefix(rawQuery, max),
    ]);

    const merged = new Map<string, AppUser>();
    const addDoc = (id: string, data: AppUser) => {
        if (excludeUids.has(id)) return;
        if (merged.has(id)) return;
        merged.set(id, { ...data, uid: id });
    };
    nameSnap.docs.forEach(d => addDoc(d.id, d.data() as AppUser));
    lastNameSnap.docs.forEach(d => addDoc(d.id, d.data() as AppUser));

    const missingUids = usernameHits
        .map(h => h.uid)
        .filter(uid => uid && !excludeUids.has(uid) && !merged.has(uid));
    if (missingUids.length > 0) {
        const slice = missingUids.slice(0, 10);
        const userDocsQ = query(collection(db, 'users'), where(documentId(), 'in', slice));
        const userSnap = await getDocs(userDocsQ);
        userSnap.docs.forEach(d => addDoc(d.id, d.data() as AppUser));
    }

    return Array.from(merged.values()).slice(0, max);
}

/** Convenience: hydrate a list of uids into AppUser docs. */
export async function fetchUsersByUids(uids: string[]): Promise<AppUser[]> {
    if (uids.length === 0) return [];
    const out: AppUser[] = [];
    const slice = uids.slice(0, 30);
    const promises = slice.map(uid => getDoc(doc(db, 'users', uid)));
    const snaps = await Promise.all(promises);
    snaps.forEach(s => {
        if (s.exists()) out.push({ ...(s.data() as AppUser), uid: s.id });
    });
    return out;
}
