/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ── Hardcoded admin emails ────────────────────────────────────────────────────
const ADMIN_EMAILS = ['charlie.nilsson@live.com', 'erichuman@me.com'];

export interface AppUser {
    uid: string;
    email: string;
    name: string;
    fullName?: string;
    role: 'admin' | 'user';
    hasAgreed: boolean;
    avatarUrl?: string;
    phoneNumber?: string;
    sharePhoneNumber?: boolean;
    trips?: string[];
    activeTripId?: string | null;
    friends?: string[];
    bucketlist?: string[];
    following?: string[];
    followers?: string[];
    initialsStyle?: { bg: string; color: string };
    manualVisitedCountries?: string[]; // Countries manually added by user via globe
    
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
            email: `mock${role}@test.com`,
            name: role === 'admin' ? 'Albert Einstein' : 'Nikola Tesla',
            role: role,
            hasAgreed: true,
            avatarUrl: role === 'admin' ? '/einstein.png' : '/tesla.png',
            phoneNumber: role === 'admin' ? '+1 555-0198' : '+1 555-0123',
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
            await setDoc(userRef, data, { merge: true });
            setAppUser(prev => prev ? { ...prev, ...data } : null);
        } catch (e) {
            console.error("Failed to update profile", e);
            throw e;
        }
    }, [currentUser]);

    const refreshAppUser = useCallback(async () => {
        if (!currentUser) return;
        try {
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc.exists() && userDoc.data().role) {
                setAppUser({ ...userDoc.data(), uid: currentUser.uid } as AppUser);
            } else {
                const isAdmin = ADMIN_EMAILS.includes(currentUser.email || '');
                const existingData = userDoc.exists() ? userDoc.data() : {};

                const newUser: AppUser = {
                    uid: currentUser.uid,
                    email: currentUser.email || '',
                    name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Traveler',
                    fullName: existingData.fullName || '',
                    avatarUrl: existingData.avatarUrl,
                    role: isAdmin ? 'admin' : 'user',
                    hasAgreed: false,
                    trips: [],
                    activeTripId: null,
                    friends: []
                };
                await setDoc(doc(db, 'users', currentUser.uid), newUser, { merge: true });
                setAppUser(newUser);
            }
        } catch (e) {
            console.error("Failed to load app user:", e);
        }
    }, [currentUser]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);
            if (user) {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists() && userDoc.data().role) {
                    const data = { ...userDoc.data(), uid: user.uid } as AppUser;
                    // If the email is in the admin list, always ensure they have admin role
                    if (ADMIN_EMAILS.includes(user.email || '') && data.role !== 'admin') {
                        const updated = { ...data, role: 'admin' as const };
                        await setDoc(doc(db, 'users', user.uid), updated, { merge: true });
                        setAppUser(updated);
                    } else {
                        setAppUser(data);
                    }
                } else {
                    // First login OR partial creation from Login.tsx — auto-assign defaults
                    const isAdmin = ADMIN_EMAILS.includes(user.email || '');
                    const existingData = userDoc.exists() ? userDoc.data() : {};
                    
                    const newUser: AppUser = {
                        uid: user.uid,
                        email: user.email || '',
                        name: user.displayName || user.email?.split('@')[0] || 'Traveler',
                        fullName: existingData.fullName || '',
                        avatarUrl: existingData.avatarUrl,
                        role: isAdmin ? 'admin' : 'user',
                        hasAgreed: false,
                        trips: [],
                        activeTripId: null,
                        friends: []
                    };
                    await setDoc(doc(db, 'users', user.uid), newUser, { merge: true });
                    setAppUser(newUser);
                }
            } else {
                setAppUser(null);
                setViewAsUser(false);
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const effectiveAppUser = mockUser || appUser;
    const effectiveCurrentUser = mockUser
        ? ({ uid: mockUser.uid, email: mockUser.email } as User)
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
