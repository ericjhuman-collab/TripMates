import { ref, set, onValue, off, serverTimestamp } from 'firebase/database';
import { rtdb } from './firebase';

export interface UserLocation {
    uid: string;
    name: string;
    lat: number;
    lng: number;
    timestamp: number;
}

export const updateUserLocation = (tripId: string, uid: string, name: string, lat: number, lng: number) => {
    const locRef = ref(rtdb, `trips/${tripId}/locations/${uid}`);
    set(locRef, {
        uid,
        name,
        lat,
        lng,
        timestamp: serverTimestamp()
    });
};

export const listenToAllLocations = (tripId: string, callback: (locations: UserLocation[]) => void) => {
    const locRef = ref(rtdb, `trips/${tripId}/locations`);
    onValue(locRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const locations = Object.values(data) as UserLocation[];
            callback(locations);
        } else {
            callback([]);
        }
    });

    return () => off(locRef);
};
