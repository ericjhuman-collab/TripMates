import {
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    limit as firestoreLimit,
    serverTimestamp,
    Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export interface SpinRecord {
    id?: string;
    /** UID of the chosen member. */
    winnerUid: string;
    /** Display name at spin time (denormalised so the history reads even
     *  if the winner later changes their profile name). */
    winnerName: string;
    /** UIDs that were on the wheel at spin time. */
    participants: string[];
    /** Server timestamp when the spin was recorded. */
    createdAt: Timestamp;
    /** UID of the user who triggered the spin. */
    createdBy: string;
}

const HISTORY_LIMIT = 20;

export const subscribeToSpins = (
    tripId: string,
    callback: (spins: SpinRecord[]) => void,
): (() => void) => {
    const q = query(
        collection(db, 'trips', tripId, 'spins'),
        orderBy('createdAt', 'desc'),
        firestoreLimit(HISTORY_LIMIT),
    );
    return onSnapshot(
        q,
        snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as SpinRecord))),
        e => console.warn('Spins subscription error', e),
    );
};

export const addSpin = async (
    tripId: string,
    record: Omit<SpinRecord, 'id' | 'createdAt'>,
): Promise<string> => {
    const ref = await addDoc(collection(db, 'trips', tripId, 'spins'), {
        ...record,
        createdAt: serverTimestamp(),
    });
    return ref.id;
};
