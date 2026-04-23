import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface BingoSquare {
    id: number;
    task: string;
    completedBy: string | null;
}

export interface BingoBoard {
    squares: BingoSquare[];
}

export const getBingoBoard = async (tripId: string): Promise<BingoBoard | null> => {
    const ref = doc(db, 'bingo', `trip_${tripId}`);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        return snap.data() as BingoBoard;
    }
    return null;
}

export const initBingoBoard = async (tripId: string) => {
    const squares: BingoSquare[] = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        task: `Tap to edit task`,
        completedBy: null
    }));
    const ref = doc(db, 'bingo', `trip_${tripId}`);
    await setDoc(ref, { squares });
    return { squares };
}

export const saveBingoBoard = async (tripId: string, squares: BingoSquare[]) => {
    const ref = doc(db, 'bingo', `trip_${tripId}`);
    await setDoc(ref, { squares }, { merge: true });
}
