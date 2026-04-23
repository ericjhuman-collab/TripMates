import { createContext, useContext } from 'react';
import type { OddsSession } from '../services/odds';

export interface OddsContextType {
    activeOdds: OddsSession[];
    loading: boolean;
    refreshOdds: () => Promise<void>;
    issueDare: (targetId: string, dare: string) => Promise<void>;
    respondRange: (sessionId: string, range: number, targetSecret: number) => Promise<void>;
    submitGuess: (sessionId: string, guess: number) => Promise<boolean>;
    markCompleted: (sessionId: string) => Promise<void>;
}

export const OddsContext = createContext<OddsContextType>({} as OddsContextType);
export const useOdds = () => useContext(OddsContext);
