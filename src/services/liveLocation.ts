import { ref, onValue, set, remove, serverTimestamp, off } from 'firebase/database';
import type { Unsubscribe, DataSnapshot } from 'firebase/database';
import { rtdb } from './firebase';

// ── Mode types ─────────────────────────────────────────────────────────────
// `off` is the not-sharing state. The other four are share-with-an-end:
// 3h / 24h / until trip end / until manual stop.
export type LiveLocationMode = 'off' | '3h' | '24h' | 'trip' | 'always';

export const LIVE_LOCATION_MODES: LiveLocationMode[] = ['off', '3h', '24h', 'trip', 'always'];

export const MODE_LABELS: Record<LiveLocationMode, string> = {
    off: 'Off',
    '3h': '3h',
    '24h': '24h',
    trip: 'Whole trip',
    always: 'Always on',
};

// ── RTDB shape ─────────────────────────────────────────────────────────────
// /liveLocation/{tripId}/{uid} = { lat, lng, accuracy, heading, updatedAt, expiresAt, mode }
//
// `expiresAt` is null for `always` (never auto-expires) and a unix-ms
// timestamp otherwise. The cleanup Cloud Function removes entries whose
// expiresAt has passed (with a small grace period).
export interface LiveLocationEntry {
    lat: number;
    lng: number;
    accuracy: number | null;
    heading: number | null;
    updatedAt: number;
    expiresAt: number | null;
    mode: LiveLocationMode;
}

// ── Per-trip mode storage (localStorage) ──────────────────────────────────
// Mode is a device-level decision ("share from this phone for the next 3h"),
// so it lives in localStorage and isn't synced across devices.
const MODE_KEY = (tripId: string) => `liveLocation:${tripId}:mode`;
const LAST_ON_KEY = (tripId: string) => `liveLocation:${tripId}:lastOn`;

const isMode = (v: unknown): v is LiveLocationMode =>
    typeof v === 'string' && (LIVE_LOCATION_MODES as string[]).includes(v);

export const getMode = (tripId: string): LiveLocationMode => {
    try {
        const raw = localStorage.getItem(MODE_KEY(tripId));
        return isMode(raw) ? raw : 'off';
    } catch {
        return 'off';
    }
};

// Last-non-off choice for this trip. Used as the default when re-enabling
// from Off — so a user who picked 24h, then Off, then taps the picker again
// sees 24h pre-selected, not "Off".
export const getLastOnMode = (tripId: string): Exclude<LiveLocationMode, 'off'> => {
    try {
        const raw = localStorage.getItem(LAST_ON_KEY(tripId));
        if (isMode(raw) && raw !== 'off') return raw;
    } catch { /* ignore */ }
    return '24h';
};

const subscribers = new Set<() => void>();

const notify = () => { for (const cb of subscribers) cb(); };

export const setMode = (tripId: string, mode: LiveLocationMode) => {
    try {
        localStorage.setItem(MODE_KEY(tripId), mode);
        if (mode !== 'off') localStorage.setItem(LAST_ON_KEY(tripId), mode);
    } catch { /* ignore quota errors */ }
    notify();
};

// Subscribe to mode changes (any trip) on this device. The broadcaster reads
// getMode() per trip on each tick, so it picks up the latest value naturally.
export const subscribeToModeChanges = (cb: () => void): (() => void) => {
    subscribers.add(cb);
    return () => { subscribers.delete(cb); };
};

// Cross-tab sync: storage events fire only in *other* tabs, so this catches
// changes the broadcaster wouldn't otherwise see when the user has the app
// open in two tabs.
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('liveLocation:')) notify();
    });
}

// ── Expiry computation ────────────────────────────────────────────────────
const HOUR_MS = 3600 * 1000;

export const computeExpiresAt = (
    mode: LiveLocationMode,
    tripEndDate: string | undefined,
    now: number = Date.now()
): number | null => {
    switch (mode) {
        case 'off': return now;
        case '3h': return now + 3 * HOUR_MS;
        case '24h': return now + 24 * HOUR_MS;
        case 'trip': {
            if (!tripEndDate) return now + 24 * HOUR_MS;
            // End of trip's last day in local time. Trips are short-duration
            // and this gives a human-meaningful "ends tonight" cutoff.
            const end = new Date(`${tripEndDate}T23:59:59`);
            return end.getTime();
        }
        case 'always': return null;
    }
};

// ── RTDB read/write ───────────────────────────────────────────────────────
const entryRef = (tripId: string, uid: string) =>
    ref(rtdb, `liveLocation/${tripId}/${uid}`);

const tripRef = (tripId: string) => ref(rtdb, `liveLocation/${tripId}`);

export const writeLiveLocation = async (
    tripId: string,
    uid: string,
    entry: Omit<LiveLocationEntry, 'updatedAt'> & { updatedAt?: number | object }
): Promise<void> => {
    await set(entryRef(tripId, uid), {
        ...entry,
        updatedAt: entry.updatedAt ?? serverTimestamp(),
    });
};

export const stopLiveLocation = async (tripId: string, uid: string): Promise<void> => {
    await remove(entryRef(tripId, uid));
};

// Subscribe to all members' live locations for a trip. Callback fires with
// the full map every time anything changes (RTDB delivers in one snapshot).
export const subscribeToTripLocations = (
    tripId: string,
    cb: (entries: Record<string, LiveLocationEntry>) => void
): Unsubscribe => {
    const r = tripRef(tripId);
    const handler = (snap: DataSnapshot) => {
        const val = (snap.val() ?? {}) as Record<string, LiveLocationEntry>;
        cb(val);
    };
    onValue(r, handler);
    return () => off(r, 'value', handler);
};

// ── Throttling thresholds (used by broadcaster) ───────────────────────────
// Spec: write at most every 30s OR every 50m moved.
export const MIN_INTERVAL_MS = 30 * 1000;
export const MIN_DISTANCE_M = 50;

export const distanceMeters = (
    a: { lat: number; lng: number },
    b: { lat: number; lng: number }
): number => {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
};
