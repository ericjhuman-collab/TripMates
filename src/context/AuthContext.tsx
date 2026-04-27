/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { deriveUserSearchFields } from '../utils/searchFields';

export interface AppUser {
    uid: string;
    name: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    /** Lowercase, diacritic-stripped derivative of `name`. Used for prefix search. */
    nameLower?: string;
    /** Lowercase, diacritic-stripped derivative of `lastName` (or last token of `name`). */
    lastNameLower?: string;
    role: 'admin' | 'user';
    hasAgreed: boolean;
    avatarUrl?: string;
    sharePhoneNumber?: boolean;
    /** Globally unique handle for @-mentions and search. Lowercase, 3-20 chars. */
    username?: string;
    /** ISO 639-1 (e.g. 'sv', 'en'). UI is not yet i18n; this stores the preference. */
    language?: 'sv' | 'en';
    /** ISO 3166-1 alpha-2 (e.g. 'SE', 'NO'). User's home country. */
    country?: string;
    trips?: string[];
    activeTripId?: string | null;
    friends?: string[];
    bucketlist?: string[];
    following?: string[];
    followers?: string[];
    initialsStyle?: { bg: string; color: string };
    manualVisitedCountries?: string[]; // Countries manually added by user via globe
    bucketlistCountries?: string[]; // Countries the user wants to visit (separate from visited)
    
    // B2B & Groups additions
    accountType?: 'personal' | 'business'; // To determine active dashboard
    managedBusinessIds?: string[]; // Businesses this user can admin
    groups?: string[]; // IDs of groups the user belongs to

    // Live Location Tracking
    shareLocation?: boolean;
    lastKnownLocation?: {
        lat: number;
        lng: number;
        timestamp: number;
    };
}

interface AuthContextType {
    currentUser: User | null;
    appUser: AppUser | null;
    /** The effective role after applying viewAsUser toggle */
    effectiveRole: 'admin' | 'user';
    /** True if the real user is admin but currently previewing as user */
    viewAsUser: boolean;
    setViewAsUser: (v: boolean) => void;
    loading: boolean;
    refreshAppUser: () => Promise<void>;
    loginAsMock: (role: 'admin' | 'user') => void;
    logoutMock: () => void;
    updateProfile: (data: Partial<AppUser>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [appUser, setAppUser] = useState<AppUser | null>(null);
    const [mockUser, setMockUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewAsUser, setViewAsUser] = useState(false);

    const loginAsMock = (role: 'admin' | 'user') => {
        setMockUser({
            uid: `mock-${role}-uid`,
            name: role === 'admin' ? 'Albert Einstein' : 'Nikola Tesla',
            role: role,
            hasAgreed: true,
            avatarUrl: role === 'admin' ? '/einstein.png' : '/tesla.png',
            sharePhoneNumber: true,
            trips: ['TEST_TRIP_ID'],
            activeTripId: 'TEST_TRIP_ID',
            friends: []
        });
    };

    const logoutMock = () => {
        setMockUser(null);
        setViewAsUser(false);
    };

    const updateProfile = useCallback(async (data: Partial<AppUser>) => {
        if (!currentUser) return;
        try {
            const userRef = doc(db, 'users', currentUser.uid);
            const payload: Partial<AppUser> = { ...data };
            if (data.name !== undefined || data.lastName !== undefined) {
                Object.assign(payload, deriveUserSearchFields({
                    name: data.name ?? appUser?.name,
                    lastName: data.lastName ?? appUser?.lastName,
                }));
            }
            await setDoc(userRef, payload, { merge: true });
            setAppUser(prev => prev ? { ...prev, ...payload } : null);
        } catch (e) {
            console.error("Failed to update profile", e);
            throw e;
        }
    }, [currentUser, appUser]);

    const refreshAppUser = useCallback(async () => {
        if (!currentUser) return;
        try {
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc.exists() && userDoc.data().role) {
                setAppUser({ ...userDoc.data(), uid: currentUser.uid } as AppUser);
            } else {
                const existingData = userDoc.exists() ? userDoc.data() : {};

                const newUser: AppUser = {
                    uid: currentUser.uid,
                    name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Traveler',
                    fullName: existingData.fullName || '',
                    role: 'user',
                    hasAgreed: existingData.hasAgreed ?? false,
                    trips: existingData.trips || [],
                    activeTripId: existingData.activeTripId ?? null,
                    friends: existingData.friends || [],
                    ...(existingData.avatarUrl ? { avatarUrl: existingData.avatarUrl } : {}),
                };
                Object.assign(newUser, deriveUserSearchFields({ name: newUser.name, lastName: existingData.lastName }));
                await setDoc(doc(db, 'users', currentUser.uid), newUser, { merge: true });
                setAppUser(newUser);
            }
        } catch (e) {
            console.error("Failed to load app user:", e);
        }
    }, [currentUser]);

    useEffect(() => {
        let cancelled = false;
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (cancelled) return;
            setCurrentUser(user);
            try {
                if (user) {
                    const userDoc = await getDoc(doc(db, 'users', user.uid));
                    if (cancelled) return;
                    if (userDoc.exists() && userDoc.data().role) {
                        const data = { ...userDoc.data(), uid: user.uid } as AppUser;
                        setAppUser(data);
                        // Backfill search fields for legacy docs that predate them.
                        if (!userDoc.data().nameLower) {
                            const searchFields = deriveUserSearchFields({ name: data.name, lastName: data.lastName });
                            if (searchFields.nameLower || searchFields.lastNameLower) {
                                await setDoc(doc(db, 'users', user.uid), searchFields, { merge: true });
                            }
                        }
                    } else {
                        // First login OR partial creation from Login.tsx — auto-assign defaults.
                        // Preserve any existing fields (trips/activeTripId/etc) from a prior partial doc.
                        // Role is always 'user'; admin is granted server-side only (see docs/admin-grants.md).
                        const existingData = userDoc.exists() ? userDoc.data() : {};

                        const newUser: AppUser = {
                            uid: user.uid,
                            name: user.displayName || user.email?.split('@')[0] || 'Traveler',
                            fullName: existingData.fullName || '',
                            role: 'user',
                            hasAgreed: existingData.hasAgreed ?? false,
                            trips: existingData.trips || [],
                            activeTripId: existingData.activeTripId ?? null,
                            friends: existingData.friends || [],
                            ...(existingData.avatarUrl ? { avatarUrl: existingData.avatarUrl } : {}),
                        };
                        Object.assign(newUser, deriveUserSearchFields({ name: newUser.name, lastName: existingData.lastName }));
                        await setDoc(doc(db, 'users', user.uid), newUser, { merge: true });
                        if (cancelled) return;
                        setAppUser(newUser);
                    }
                } else {
                    setAppUser(null);
                    setViewAsUser(false);
                }
            } catch (e) {
                console.error('AuthContext: failed to sync user doc', e);
            }
            setLoading(false);
        });

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, []);

    const effectiveAppUser = mockUser || appUser;
    const effectiveCurrentUser = mockUser
        ? ({ uid: mockUser.uid, email: `mock-${mockUser.role}@test.com` } as User)
        : currentUser;

    // When viewAsUser is on, override the role to 'user' for UI checks
    const effectiveRole: 'admin' | 'user' =
        viewAsUser ? 'user' : (effectiveAppUser?.role ?? 'user');

    return (
        <AuthContext.Provider value={{
            currentUser: effectiveCurrentUser,
            appUser: effectiveAppUser,
            effectiveRole,
            viewAsUser,
            setViewAsUser,
            loading,
            refreshAppUser,
            loginAsMock,
            logoutMock,
            updateProfile
        }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
