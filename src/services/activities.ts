import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
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
    mapIcon?: string;
    imageUrl?: string;  
    tripId?: string; // Optional for saved templates
    category?: 'Restaurant' | 'Cafe' | 'Bar' | 'Museum' | 'Activity' | 'Other';
    createdBy?: string;

    // Attributes for the Saved Library
    isSavedActivity?: boolean;
    ownerId?: string;     
    savedListId?: string; // Mapped to a specific library list folder
    usedInTrips?: string[]; 
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
    const docRef = await addDoc(collection(db, 'activities'), activity);
    return docRef.id;
};

export const updateActivity = async (id: string, updates: Partial<Activity>) => {
    const ref = doc(db, 'activities', id);
    return await updateDoc(ref, updates);
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
