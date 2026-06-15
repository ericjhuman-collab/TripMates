import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface Activity {
    id?: string;
    day?: string; // Optional for saved templates
    title: string;
    description: string;
    time?: string; // Optional for saved templates
    endTime?: string;
    locationName: string;
    address: string;
    location: { lat: number; lng: number } | null;
    votes?: Record<string, string>;
    enableVoting?: boolean;
    voteQuestion?: string;
    votingClosed?: boolean;
    /** UIDs that have RSVP'd as 'going'. Pre-populated for members with autoJoinActivities=true. */
    attendees?: string[];
    mapIcon?: string;
    imageUrl?: string;
    tripId?: string; // Optional for saved templates
    category?: 'Restaurant' | 'Cafe' | 'Bar' | 'Museum' | 'Activity' | 'Other';
    createdBy?: string;
    /** Derived from `day` + `time` at write time. Used by the 1h-before reminder
     *  Cloud Function. Interpreted as the writer's local timezone. */
    scheduledStartAt?: Timestamp;

    // Attributes for the Saved Library
    isSavedActivity?: boolean;
    ownerId?: string;
    savedListId?: string; // Mapped to a specific library list folder
    usedInTrips?: string[];
}

/**
 * Derive a Timestamp from `day` (YYYY-MM-DD) + `time` (HH:MM). Returns
 * undefined if either is missing or unparseable. Treated as the writer's
 * local timezone — fine for v1 since trips are usually planned in one TZ.
 */
function deriveScheduledStartAt(day: string | undefined, time: string | undefined): Timestamp | undefined {
    if (!day || !time) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
    if (!/^\d{1,2}:\d{2}$/.test(time)) return undefined;
    const d = new Date(`${day}T${time.padStart(5, '0')}:00`);
    if (Number.isNaN(d.getTime())) return undefined;
    return Timestamp.fromDate(d);
}

export const getActivitiesByDay = async (tripId: string, dayString: string): Promise<Activity[]> => {
    let mockData: Activity[] = [];
    if (['BCNTRP', 'PRSTPR', 'TKYRTR', 'LNDNTR', 'AMSTRD', 'BLITRP', 'NYCTRP'].includes(tripId)) {
        mockData = getMockActivities().filter(a => a.tripId === tripId && a.day === dayString);
    }

    try {
        const q = query(
            collection(db, 'activities'),
            where('tripId', '==', tripId),
            where('day', '==', dayString)
        );
        const snapshot = await getDocs(q);
        const firestoreDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
        const combined = [...mockData, ...firestoreDocs];
        return combined.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
    } catch {
        console.warn('Firestore fetch failed for day activities.');
        return mockData.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
    }
};

export const getAllActivities = async (tripId: string): Promise<Activity[]> => {
    let mockData: Activity[] = [];
    if (['BCNTRP', 'PRSTPR', 'TKYRTR', 'LNDNTR', 'AMSTRD', 'BLITRP', 'NYCTRP'].includes(tripId)) {
        mockData = getMockActivities().filter(a => a.tripId === tripId);
    }

    try {
        const q = query(collection(db, 'activities'), where('tripId', '==', tripId));
        const snapshot = await getDocs(q);
        const firestoreDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
        const combined = [...mockData, ...firestoreDocs];
        return combined.sort((a, b) => {
            if (a.day === b.day) return (a.time ?? '').localeCompare(b.time ?? '');
            return (a.day ?? '').localeCompare(b.day ?? '');
        });
    } catch {
        console.warn('Firestore fetch failed for all activities.');
        return mockData.sort((a, b) => {
            if (a.day === b.day) return (a.time ?? '').localeCompare(b.time ?? '');
            return (a.day ?? '').localeCompare(b.day ?? '');
        });
    }
};

const sortByDayThenTime = (list: Activity[]) =>
    list.slice().sort((a, b) => {
        if (a.day === b.day) return (a.time ?? '').localeCompare(b.time ?? '');
        return (a.day ?? '').localeCompare(b.day ?? '');
    });

const sortByTime = (list: Activity[]) =>
    list.slice().sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));

const isMockTrip = (tripId: string) =>
    ['BCNTRP', 'PRSTPR', 'TKYRTR', 'LNDNTR', 'AMSTRD', 'BLITRP', 'NYCTRP'].includes(tripId);

/**
 * Live subscription to all activities for a trip. Returns the unsubscribe
 * function. Mock trip ids resolve from the mock fixtures and never hit
 * Firestore — the callback fires once synchronously-ish via setTimeout 0
 * so callers can treat both paths uniformly.
 */
export const subscribeToActivities = (
    tripId: string,
    callback: (activities: Activity[]) => void,
): (() => void) => {
    if (isMockTrip(tripId)) {
        const mockData = getMockActivities().filter(a => a.tripId === tripId);
        const t = setTimeout(() => callback(sortByDayThenTime(mockData)), 0);
        return () => clearTimeout(t);
    }
    const q = query(collection(db, 'activities'), where('tripId', '==', tripId));
    return onSnapshot(
        q,
        snapshot => {
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Activity));
            callback(sortByDayThenTime(docs));
        },
        e => console.warn('Activities subscription error', e),
    );
};

/**
 * Live subscription to a single day's activities for a trip. Same shape
 * as subscribeToActivities.
 */
export const subscribeToActivitiesByDay = (
    tripId: string,
    dayString: string,
    callback: (activities: Activity[]) => void,
): (() => void) => {
    if (isMockTrip(tripId)) {
        const mockData = getMockActivities().filter(a => a.tripId === tripId && a.day === dayString);
        const t = setTimeout(() => callback(sortByTime(mockData)), 0);
        return () => clearTimeout(t);
    }
    const q = query(
        collection(db, 'activities'),
        where('tripId', '==', tripId),
        where('day', '==', dayString),
    );
    return onSnapshot(
        q,
        snapshot => {
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Activity));
            callback(sortByTime(docs));
        },
        e => console.warn('Activities-by-day subscription error', e),
    );
};

const getMockActivities = (): Activity[] => {
    const now = new Date();
    const fmtDayStr = (d: Date) => d.toISOString().split('T')[0];
    
    // Create base dates for our mock trips relative to today
    const bcnStart = new Date(now.getTime() - 3 * 86400000); 
    const parisStart = new Date(now.getTime() + 30 * 86400000);
    const londonStart = new Date(now.getTime() - 20 * 86400000);

    return [
        {
            id: 'mock1', tripId: 'BCNTRP', day: fmtDayStr(bcnStart), 
            title: 'Arrival & Check-in', description: 'Arrive at BCN Airport and check into Hotel Arts.',
            time: '14:00', endTime: '15:30', locationName: 'Hotel Arts', address: '', location: null
        },
        {
            id: 'mock2', tripId: 'BCNTRP', day: fmtDayStr(bcnStart),
            title: 'Tapas Dinner', description: 'Welcome dinner at Tickets Bar.',
            time: '20:30', endTime: '23:00', locationName: 'Tickets Bar', address: '', location: null, category: 'Restaurant'
        },
        {
            id: 'mock3', tripId: 'BCNTRP', day: fmtDayStr(new Date(bcnStart.getTime() + 86400000)),
            title: 'Sagrada Familia', description: 'Guided tour of Gaudi\'s masterpiece.',
            time: '10:00', endTime: '12:30', locationName: 'Sagrada Familia', address: '', location: null, category: 'Activity'
        },
        {
            id: 'mock4', tripId: 'BCNTRP', day: fmtDayStr(new Date(bcnStart.getTime() + 86400000)),
            title: 'Beach Time', description: 'Relax at Barceloneta beach.',
            time: '14:00', endTime: '17:00', locationName: 'Barceloneta Beach', address: '', location: null, category: 'Activity'
        },
        // Current day (if overlapping)
        {
            id: 'mock5', tripId: 'BCNTRP', day: fmtDayStr(now),
            title: 'Lunch in Gothic Quarter', description: 'Explore local cafes.',
            time: '13:00', endTime: '14:30', locationName: 'Gothic Quarter', address: '', location: null, category: 'Restaurant'
        },
        {
            id: 'mock6', tripId: 'PRSTPR', day: fmtDayStr(parisStart),
            title: 'Eiffel Tower Tour', description: 'Skip the line tickets.',
            time: '16:00', endTime: '18:00', locationName: 'Eiffel Tower', address: '', location: null, category: 'Activity'
        },
        {
            id: 'mock7', tripId: 'LNDNTR', day: fmtDayStr(londonStart),
            title: 'Pub Crawl', description: 'Starting in Soho.',
            time: '19:00', endTime: '02:00', locationName: 'Soho', address: '', location: null, category: 'Bar'
        }
    ];
};

export const addActivity = async (activity: Omit<Activity, 'id'>) => {
    const scheduledStartAt = deriveScheduledStartAt(activity.day, activity.time);
    const payload = scheduledStartAt ? { ...activity, scheduledStartAt } : activity;
    const docRef = await addDoc(collection(db, 'activities'), payload);
    return docRef.id;
};

import { getAllMemberPrefs } from './memberPrefs';
import { notifyTripMembers } from './social';

/**
 * Add an activity AND apply the trip's per-member preferences:
 *  - Pre-populate `attendees` with members who have `autoJoinActivities=true`
 *  - Notify all trip members (respecting their `muteNotifications` pref)
 *
 * `tripMembers` is the full member uid list from the trip doc; pass it from the caller
 * to avoid an extra round-trip.
 */
export const addTripActivityWithPrefs = async (
    activity: Omit<Activity, 'id'>,
    tripMembers: string[],
    actor: { uid: string; name: string; avatarUrl?: string },
): Promise<string> => {
    if (!activity.tripId) throw new Error('addTripActivityWithPrefs requires tripId on activity');

    const prefsMap = await getAllMemberPrefs(activity.tripId);

    // Auto-attend: anyone with autoJoinActivities=true (creator is implicit, no need to add)
    const autoAttendees = tripMembers.filter(uid => {
        if (uid === actor.uid) return false;
        const p = prefsMap.get(uid);
        return p?.autoJoinActivities === true;
    });

    const attendees = Array.from(new Set([
        actor.uid,
        ...(activity.attendees || []),
        ...autoAttendees,
    ]));

    const scheduledStartAt = deriveScheduledStartAt(activity.day, activity.time);
    const payload: Omit<Activity, 'id'> = scheduledStartAt
        ? { ...activity, attendees, scheduledStartAt }
        : { ...activity, attendees };
    const docRef = await addDoc(collection(db, 'activities'), payload);

    // Fan-out notifications (respects muteNotifications per member).
    notifyTripMembers(
        tripMembers.filter(uid => uid !== actor.uid),
        {
            type: 'trip:new_activity',
            tripId: activity.tripId,
            fromUid: actor.uid,
            fromName: actor.name,
            fromAvatarUrl: actor.avatarUrl,
            message: `${actor.name} added a new activity: ${activity.title}`,
            linkUrl: `/admin/${activity.tripId}`,
        },
    ).catch(e => console.warn('Activity notification fan-out failed', e));

    return docRef.id;
};

export const updateActivity = async (id: string, updates: Partial<Activity>) => {
    const ref = doc(db, 'activities', id);
    // Re-derive scheduledStartAt if the time fields change. We only set it
    // when both day+time end up populated; clearing isn't supported here
    // because Partial<Activity> can't carry a deleteField sentinel.
    const next: Partial<Activity> = { ...updates };
    if ('day' in updates || 'time' in updates) {
        const derived = deriveScheduledStartAt(updates.day, updates.time);
        if (derived) next.scheduledStartAt = derived;
    }
    return await updateDoc(ref, next);
};

export const deleteActivity = async (id: string) => {
    const ref = doc(db, 'activities', id);
    return await deleteDoc(ref);
};

// ── Saved Activities Library ───────────────────────────────

export interface ActivityList {
    id?: string;
    ownerId: string;
    title: string;
    isShared: boolean;
    icon?: string;
}

export const getSavedLists = async (userId: string): Promise<ActivityList[]> => {
    try {
        const q = query(collection(db, 'activityLists'), where('ownerId', '==', userId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityList));
    } catch (err) {
        console.error('Failed to fetch saved lists', err);
        return [];
    }
};

export const addSavedList = async (list: Omit<ActivityList, 'id'>) => {
    const docRef = await addDoc(collection(db, 'activityLists'), list);
    return docRef.id;
};

export const deleteSavedList = async (id: string) => {
    const ref = doc(db, 'activityLists', id);
    return await deleteDoc(ref);
};

export const getSavedActivities = async (userId: string, listId?: string): Promise<Activity[]> => {
    try {
        const constraints = [
            where('isSavedActivity', '==', true),
            where('ownerId', '==', userId)
        ];
        if (listId) {
            constraints.push(where('savedListId', '==', listId));
        }
        const q = query(collection(db, 'activities'), ...constraints);
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
    } catch (err) {
        console.error('Failed to fetch saved activities', err);
        return [];
    }
};

export const addSavedActivity = async (activity: Omit<Activity, 'id'>) => {
    const docRef = await addDoc(collection(db, 'activities'), {
        ...activity,
        isSavedActivity: true
    });
    return docRef.id;
};

export const deleteSavedActivity = async (id: string) => {
    return await deleteActivity(id);
};
