import { db } from './firebase';
import { doc, setDoc, updateDoc, collection, serverTimestamp, getDocs, query, where } from 'firebase/firestore';

export type OddsState = 'pending_target' | 'pending_challenger' | 'resolved' | 'expired';

export interface OddsSession {
    id: string;
    tripId: string;
    challengerId: string;
    targetId: string;
    dare: string;
    state: OddsState;
    oddsRange: number | null;
    targetNumber: number | null;
    challengerNumber: number | null;
    isMatch: boolean | null;
    proofUrl?: string;
    isCompleted?: boolean;
    createdAt: unknown;
    updatedAt: unknown;
}

const generateId = () => Math.random().toString(36).substring(2, 10);

export const createOddsChallenge = async (tripId: string, challengerId: string, targetId: string, dare: string): Promise<string> => {
    const id = `ODDS_${generateId()}`;
    const session: OddsSession = {
        id,
        tripId,
        challengerId,
        targetId,
        dare,
        state: 'pending_target',
        oddsRange: null,
        targetNumber: null,
        challengerNumber: null,
        isMatch: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    
    await setDoc(doc(db, 'odds', id), session);
    return id;
};

export const setTargetOdds = async (sessionId: string, oddsRange: number, targetNumber: number) => {
    if (oddsRange < 2 || oddsRange > 1000) throw new Error('Range must be between 2 and 1000');
    if (targetNumber < 1 || targetNumber > oddsRange) throw new Error('Number out of range');

    await updateDoc(doc(db, 'odds', sessionId), {
        oddsRange,
        targetNumber,
        state: 'pending_challenger',
        updatedAt: serverTimestamp()
    });
};

export const submitChallengerGuess = async (sessionId: string, challengerNumber: number, isMatch: boolean) => {
    await updateDoc(doc(db, 'odds', sessionId), {
        challengerNumber,
        isMatch,
        state: 'resolved',
        updatedAt: serverTimestamp()
    });
};

export const getOddsForTrip = async (tripId: string): Promise<OddsSession[]> => {
    if (!tripId) return [];
    try {
        const q = query(collection(db, 'odds'), where('tripId', '==', tripId));
        const snap = await getDocs(q);
        return snap.docs.map(doc => doc.data() as OddsSession);
    } catch (err) {
        console.error("Failed to fetch odds:", err);
        return [];
    }
};

export const markOddsCompleted = async (sessionId: string) => {
    await updateDoc(doc(db, 'odds', sessionId), {
        isCompleted: true,
        updatedAt: serverTimestamp()
    });
};
