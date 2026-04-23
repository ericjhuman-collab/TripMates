import React, { useState, useEffect } from 'react';
import { createOddsChallenge, setTargetOdds, submitChallengerGuess, getOddsForTrip, markOddsCompleted } from '../services/odds';
import type { OddsSession } from '../services/odds';
import { useTrip } from './TripContext';
import { useAuth } from './AuthContext';
import { OddsContext } from './useOdds';

export const OddsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { activeTrip } = useTrip();
    const { appUser } = useAuth();
    const [activeOdds, setActiveOdds] = useState<OddsSession[]>([]);
    const [loading, setLoading] = useState(true);

    const isMock = activeTrip?.members?.some(id => id.startsWith('mock_')) || false;

    const buildMockOdds = (tripId: string, uid: string): OddsSession[] => ([
        { id: 'MOCK_ODDS_1', tripId, challengerId: 'mock_Bob', targetId: uid,
          dare: 'Jump into the pool with all clothes on!', state: 'pending_target',
          oddsRange: null, targetNumber: null, challengerNumber: null, isMatch: null,
          createdAt: new Date(), updatedAt: new Date() },
        { id: 'MOCK_ODDS_2', tripId, challengerId: uid, targetId: 'mock_Alice',
          dare: 'Wear the flamingo hat for the entire club night.', state: 'pending_challenger',
          oddsRange: 20, targetNumber: 13, challengerNumber: null, isMatch: null,
          createdAt: new Date(), updatedAt: new Date() },
        { id: 'MOCK_ODDS_3', tripId, challengerId: 'mock_Charlie', targetId: 'mock_Bob',
          dare: 'Take a shot of hot sauce!', state: 'resolved',
          oddsRange: 10, targetNumber: 7, challengerNumber: 7, isMatch: true,
          createdAt: new Date(), updatedAt: new Date() }
    ]);

    const refreshOdds = async () => {
        if (!activeTrip) {
            setActiveOdds([]);
            setLoading(false);
            return;
        }
        if (isMock) {
            if (appUser) setActiveOdds(prev => prev.length === 0 ? buildMockOdds(activeTrip.id, appUser.uid) : prev);
            setLoading(false);
            return;
        }
        const fetched = await getOddsForTrip(activeTrip.id);
        setActiveOdds(fetched);
        setLoading(false);
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!activeTrip) {
                await Promise.resolve();
                if (cancelled) return;
                setActiveOdds([]);
                setLoading(false);
                return;
            }
            if (isMock) {
                await Promise.resolve();
                if (cancelled) return;
                if (appUser) setActiveOdds(prev => prev.length === 0 ? buildMockOdds(activeTrip.id, appUser.uid) : prev);
                setLoading(false);
                return;
            }
            const fetched = await getOddsForTrip(activeTrip.id);
            if (cancelled) return;
            setActiveOdds(fetched);
            setLoading(false);
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTrip?.id, isMock, appUser?.uid]);

    const issueDare = async (targetId: string, dare: string) => {
        if (!activeTrip || !appUser) return;
        
        const newSession: OddsSession = {
            id: `ODDS_${Math.random().toString(36).substring(2, 10)}`,
            tripId: activeTrip.id,
            challengerId: appUser.uid,
            targetId,
            dare,
            state: 'pending_target',
            oddsRange: null,
            targetNumber: null,
            challengerNumber: null,
            isMatch: null,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        if (isMock) {
            setActiveOdds(prev => [...prev, newSession]);
            return;
        }

        await createOddsChallenge(activeTrip.id, appUser.uid, targetId, dare);
        await refreshOdds();
    };

    const respondRange = async (sessionId: string, range: number, targetSecret: number) => {
        if (isMock) {
            setActiveOdds(prev => prev.map(s => 
                s.id === sessionId 
                    ? { ...s, oddsRange: range, targetNumber: targetSecret, state: 'pending_challenger', updatedAt: new Date() }
                    : s
            ));
            return;
        }
        await setTargetOdds(sessionId, range, targetSecret);
        await refreshOdds();
    };

    const submitGuess = async (sessionId: string, guess: number): Promise<boolean> => {
        const session = activeOdds.find(s => s.id === sessionId);
        if (!session || !session.targetNumber) return false;

        const isMatch = guess === session.targetNumber;

        if (isMock) {
            setActiveOdds(prev => prev.map(s => 
                s.id === sessionId 
                    ? { ...s, challengerNumber: guess, isMatch, state: 'resolved', updatedAt: new Date() }
                    : s
            ));
            return isMatch;
        }

        await submitChallengerGuess(sessionId, guess, isMatch);
        await refreshOdds();
        return isMatch;
    };

    const markCompleted = async (sessionId: string) => {
        if (isMock) {
            setActiveOdds(prev => prev.map(s => 
                s.id === sessionId 
                    ? { ...s, isCompleted: true, updatedAt: new Date() }
                    : s
            ));
            return;
        }

        await markOddsCompleted(sessionId);
        await refreshOdds();
    };

    return (
        <OddsContext.Provider value={{ activeOdds, loading, refreshOdds, issueDare, respondRange, submitGuess, markCompleted }}>
            {children}
        </OddsContext.Provider>
    );
};
