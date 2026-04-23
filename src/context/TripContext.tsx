/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, writeBatch } from 'firebase/firestore';
import { useAuth } from './AuthContext';

export interface TripDestination {
    id: string; // unique ID for the stop
    destination: string;
    accommodation?: string;
    startDate?: string;
    endDate?: string;
}

export interface Trip {
    id: string; // e.g. short code 6 letters
    name: string;
    type: string; // 'Default Trip', 'Bachelor Party', etc.
    startDate?: string; // YYYY-MM-DD
    endDate?: string;
    adminIds: string[];
    members: string[]; // array of UIDs
    destination?: string; // The city/location such as 'Milano'
    imageUrl?: string; // Cover image for the trip destination
    activeGames?: string[];
    defaultGame?: string;
    accommodation?: string;        // Display name (e.g. "Hotel Arts")
    accommodationAddress?: string;  // Full formatted address from Google
    accommodationLocation?: { lat: number; lng: number } | null; // For map pin
    destinations?: TripDestination[];
    activityVoting?: {
        drunkest?: boolean;
        drunkestAfter?: boolean;
        bestFoodAndBev?: boolean;
    };
    createdBy?: string;
    theme?: string;
    baseCurrency?: string;
    inviteClosed?: boolean;
    businessId?: string; // If this is a whitelabeled B2B event
    invitedGroups?: string[]; // Groups specifically invited to this trip
    bingoReward?: string; // Configurable text for bingo reward banner
    allowMemberActivities?: boolean; // If true, regular members can add activities
}

export type TripCategory = 'current' | 'future' | 'past' | 'bucketlist';

export const categorizeTrip = (trip: Trip): TripCategory => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const start = trip.startDate ? new Date(trip.startDate) : null;
    const end = trip.endDate ? new Date(trip.endDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    if (start && end && start <= now && end >= now) return 'current';
    if (start && start > now) return 'future';
    if (end && end < now) return 'past';
    return 'bucketlist';
};

export const categorizeTrips = (trips: Trip[]): Record<TripCategory, Trip[]> => {
    const grouped: Record<TripCategory, Trip[]> = { current: [], future: [], past: [], bucketlist: [] };
    trips.forEach(t => grouped[categorizeTrip(t)].push(t));
    return grouped;
};

interface TripContextType {
    activeTrip: Trip | null;
    userTrips: Trip[];
    loading: boolean;
    switchTrip: (tripId: string) => Promise<void>;
    createTrip: (tripData: Omit<Trip, 'id' | 'adminIds' | 'members'>) => Promise<string>;
    joinTrip: (tripId: string) => Promise<boolean>;
    leaveTrip: (tripId: string) => Promise<void>;
    updateTrip: (tripId: string, data: Partial<Trip>) => Promise<void>;
    deleteTrip: (tripId: string) => Promise<void>;
}

const TripContext = createContext<TripContextType>({} as TripContextType);

export const useTrip = () => useContext(TripContext);

const generateShortCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

export const TripProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { currentUser, appUser, refreshAppUser } = useAuth();
    const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
    const [userTrips, setUserTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);

    // ── Mock trips for local preview (remove when done) ──
    const MOCK_TRIPS: Trip[] = (() => {
        const now = new Date();
        const fmt = (d: Date) => d.toISOString().split('T')[0];
        const uid = currentUser?.uid || 'mock';
        return [
            { id: 'BCNTRP', name: 'Barcelona Getaway', type: 'Default Trip', destination: 'Barcelona', startDate: fmt(new Date(now.getTime() - 3 * 86400000)), endDate: fmt(new Date(now.getTime() + 4 * 86400000)), adminIds: [uid], members: [uid, 'mock_Alice', 'mock_Bob', 'mock_Charlie'], createdBy: uid, activeGames: ['bingo', 'cheers', 'odds'], defaultGame: 'bingo', accommodation: 'Hotel Arts', baseCurrency: 'SEK' },
            { id: 'PRSTPR', name: 'Paris Summer', type: 'Default Trip', destination: 'Paris', startDate: fmt(new Date(now.getTime() + 30 * 86400000)), endDate: fmt(new Date(now.getTime() + 37 * 86400000)), adminIds: [uid], members: [uid], createdBy: uid, activeGames: ['bingo'], defaultGame: 'bingo', baseCurrency: 'SEK' },
            { id: 'TKYRTR', name: 'Tokyo Adventure', type: 'Default Trip', destination: 'Tokyo', startDate: fmt(new Date(now.getTime() + 60 * 86400000)), endDate: fmt(new Date(now.getTime() + 74 * 86400000)), adminIds: [uid], members: [uid], createdBy: uid, baseCurrency: 'SEK' },
            { id: 'LNDNTR', name: 'London Weekend', type: 'Bachelor Party', destination: 'London', startDate: fmt(new Date(now.getTime() - 20 * 86400000)), endDate: fmt(new Date(now.getTime() - 14 * 86400000)), adminIds: [uid], members: [uid], createdBy: uid, activeGames: ['bingo', 'cheers'], defaultGame: 'bingo', accommodation: 'The Shard', baseCurrency: 'SEK' },
            { id: 'AMSTRD', name: 'Amsterdam Stag Do', type: 'Bachelor Party', destination: 'Amsterdam', startDate: fmt(new Date(now.getTime() - 67 * 86400000)), endDate: fmt(new Date(now.getTime() - 60 * 86400000)), adminIds: [uid], members: [uid], createdBy: uid, baseCurrency: 'SEK' },
            { id: 'BLITRP', name: 'Bali Dream Trip', type: 'Default Trip', destination: 'Bali', adminIds: [uid], members: [uid], createdBy: uid, baseCurrency: 'SEK' },
            { id: 'NYCTRP', name: 'New York City', type: 'Default Trip', destination: 'New York', adminIds: [uid], members: [uid], createdBy: uid, baseCurrency: 'SEK' },
        ];
    })();

    // Fetch all user trips + merge mock data
    useEffect(() => {
        const fetchUserTrips = async () => {
            let realTrips: Trip[] = [];
            if (appUser?.trips && appUser.trips.length > 0) {
                try {
                    const tripPromises = appUser.trips.map(id => getDoc(doc(db, 'trips', id)));
                    const tripDocs = await Promise.all(tripPromises);
                    realTrips = tripDocs.filter(d => d.exists()).map(d => ({ ...d.data(), id: d.id } as Trip));
                } catch (e) {
                    console.error('Failed to fetch user trips', e);
                }
            }
            // Stop merging mock trips so new users see a clean state
            const merged = [...realTrips];
            setUserTrips(merged);
        };
        fetchUserTrips();
    }, [appUser?.trips]);

    useEffect(() => {
        const loadTrip = async () => {
            if (!appUser || !currentUser) {
                setActiveTrip(null);
                setLoading(false);
                return;
            }

            if (appUser.activeTripId) {
                // First check if the active trip is a mock trip
                const mockMatch = MOCK_TRIPS.find(t => t.id === appUser.activeTripId);
                if (mockMatch) {
                    setActiveTrip(mockMatch);
                    setLoading(false);
                    return;
                }

                try {
                    const snap = await getDoc(doc(db, 'trips', appUser.activeTripId));
                    if (snap.exists()) {
                        setActiveTrip({ ...snap.data(), id: snap.id } as Trip);
                    } else {
                        setActiveTrip(null);
                        await updateDoc(doc(db, 'users', currentUser.uid), { activeTripId: null });
                        await refreshAppUser();
                    }
                } catch (e) {
                    console.error("Failed to load active trip", e);
                }
            } else if (userTrips.length > 0) {
                // Auto-default: pick best trip by priority Current → Future → Past → Bucketlist
                const grouped = categorizeTrips(userTrips);
                const autoTrip = grouped.current[0] || grouped.future[0] || grouped.past[0] || grouped.bucketlist[0];
                if (autoTrip) {
                    // If the auto trip is a mock, set it directly without Firestore
                    const isMock = MOCK_TRIPS.some(m => m.id === autoTrip.id);
                    if (isMock) {
                        setActiveTrip(autoTrip);
                        setLoading(false);
                        return;
                    }
                    await updateDoc(doc(db, 'users', currentUser.uid), { activeTripId: autoTrip.id });
                    await refreshAppUser();
                    return; // refreshAppUser will re-trigger this effect
                }
                setActiveTrip(null);
            } else {
                setActiveTrip(null);
            }
            setLoading(false);
        };

        loadTrip();
        // appUser / currentUser are intentionally omitted — only .activeTripId and .uid are
        // read (both included above). Adding them would cause re-runs on unrelated profile fields.
        // MOCK_TRIPS is a module-level constant and cannot change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appUser?.activeTripId, currentUser?.uid, userTrips, refreshAppUser]);

    const switchTrip = async (tripId: string) => {
        if (!currentUser) return;
        setLoading(true);
        // If switching to a mock trip, set it directly
        const mockMatch = MOCK_TRIPS.find(t => t.id === tripId);
        if (mockMatch) {
            setActiveTrip(mockMatch);
            setLoading(false);
            return;
        }
        await updateDoc(doc(db, 'users', currentUser.uid), { activeTripId: tripId });
        await refreshAppUser(); // this will trigger the useEffect to load the new activeTrip
    };

    const createTrip = async (data: Omit<Trip, 'id' | 'adminIds' | 'members' | 'createdBy'>) => {
        if (!currentUser && !appUser?.uid?.startsWith('mock')) throw new Error("Not authenticated");

        if (appUser && appUser.uid?.startsWith('mock')) {
            alert("Mock Mode: Simulating trip creation. Returning to profile.");
            return 'MOCK_NEW';
        }

        if (!currentUser) throw new Error("Not authenticated");

        let newTripId = '';
        let exists = true;
        // Generate a unique 6-character code
        while (exists) {
            newTripId = generateShortCode();
            const snap = await getDoc(doc(db, 'trips', newTripId));
            exists = snap.exists();
        }

        const newTrip: Trip = {
            ...data,
            id: newTripId,
            adminIds: [currentUser.uid],
            members: [currentUser.uid],
            createdBy: currentUser.uid,
            baseCurrency: data.baseCurrency || 'SEK'
        };

        await setDoc(doc(db, 'trips', newTripId), newTrip);

        // Add to user's trips list and switch to it immediately
        await updateDoc(doc(db, 'users', currentUser.uid), {
            trips: arrayUnion(newTripId),
            activeTripId: newTripId
        });

        await refreshAppUser();
        return newTripId;
    };

    const joinTrip = async (tripId: string) => {
        if (!currentUser) throw new Error("Not authenticated");

        const snap = await getDoc(doc(db, 'trips', tripId.toUpperCase()));
        if (!snap.exists()) return false;

        const tripData = snap.data();
        if (tripData?.inviteClosed) {
            throw new Error("This trip's invite code has been locked by the admin.");
        }

        const tripRef = doc(db, 'trips', tripId.toUpperCase());
        const userRef = doc(db, 'users', currentUser.uid);

        // Add user to trip members
        await updateDoc(tripRef, {
            members: arrayUnion(currentUser.uid)
        });

        // Add trip to user's trips and switch to it
        await updateDoc(userRef, {
            trips: arrayUnion(tripId.toUpperCase()),
            activeTripId: tripId.toUpperCase()
        });

        await refreshAppUser();
        return true;
    };

    const leaveTrip = async (tripId: string) => {
        if (!currentUser) return;
        const tripRef = doc(db, 'trips', tripId);
        const userRef = doc(db, 'users', currentUser.uid);

        await updateDoc(tripRef, { members: arrayRemove(currentUser.uid) });
        await updateDoc(userRef, { trips: arrayRemove(tripId) });

        if (activeTrip?.id === tripId) {
            await updateDoc(userRef, { activeTripId: null });
        }
        await refreshAppUser();
    };

    const updateTrip = async (tripId: string, data: Partial<Trip>) => {
        const tripRef = doc(db, 'trips', tripId);
        await updateDoc(tripRef, data);
        await refreshAppUser(); // If needed to refresh active trip if active
    };

    const deleteTrip = async (tripId: string) => {
        if (!currentUser) return;
        const batch = writeBatch(db);
        batch.delete(doc(db, 'trips', tripId));
        batch.update(doc(db, 'users', currentUser.uid), {
            trips: arrayRemove(tripId)
        });
        await batch.commit();

        if (activeTrip?.id === tripId) {
            await updateDoc(doc(db, 'users', currentUser.uid), { activeTripId: null });
        }
        await refreshAppUser();
    };

    return (
        <TripContext.Provider value={{ activeTrip, userTrips, loading, switchTrip, createTrip, joinTrip, leaveTrip, updateTrip, deleteTrip }}>
            {children}
        </TripContext.Provider>
    );
};
