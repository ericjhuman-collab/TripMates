import { useEffect, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import {
    MIN_DISTANCE_M,
    MIN_INTERVAL_MS,
    computeExpiresAt,
    distanceMeters,
    getMode,
    stopLiveLocation,
    subscribeToModeChanges,
    writeLiveLocation,
} from '../services/liveLocation';
import type { LiveLocationMode } from '../services/liveLocation';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

// The plugin only ships TypeScript definitions; the JS implementation is
// registered by Capacitor at runtime per the README.
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

// ── LiveLocationDaemon ────────────────────────────────────────────────────
// Mounted once, near the top of the tree (inside TripProvider). Watches all
// trips the user is a member of, broadcasts position to RTDB for each trip
// whose per-device mode is non-off, and stops cleanly on mode change / expiry.
//
// Why a daemon (rather than logic on Map page): location streaming must
// continue when the user is on other pages (or the app is backgrounded), so
// the lifecycle is decoupled from any single screen.

type ActiveTripState = {
    tripId: string;
    mode: LiveLocationMode;
    expiresAt: number | null;
    timeoutId: ReturnType<typeof setTimeout> | null;
};

type LastEmit = {
    at: number;
    lat: number;
    lng: number;
};

type Position = {
    lat: number;
    lng: number;
    accuracy: number | null;
    heading: number | null;
};

export const LiveLocationDaemon: React.FC = () => {
    const { appUser } = useAuth();
    const { userTrips } = useTrip();
    const [tick, setTick] = useState(0); // bumps on mode change to re-evaluate
    const lastEmitRef = useRef<LastEmit | null>(null);
    const watcherIdRef = useRef<string | null>(null);
    const webWatchIdRef = useRef<number | null>(null);
    const activeTripsRef = useRef<Map<string, ActiveTripState>>(new Map());

    useEffect(() => subscribeToModeChanges(() => setTick(t => t + 1)), []);

    useEffect(() => {
        const uid = appUser?.uid;
        if (!uid || appUser?.shareLocation === false) {
            // Master kill switch: stop any active broadcasting and bail.
            void teardown(activeTripsRef.current, uid, watcherIdRef, webWatchIdRef);
            return;
        }

        const desired = new Map<string, ActiveTripState>();

        for (const trip of userTrips) {
            if (!trip.members.includes(uid)) continue;
            const mode = getMode(trip.id);
            if (mode === 'off') continue;
            const expiresAt = computeExpiresAt(mode, trip.endDate);
            // If `trip` mode but the trip already ended, treat as off.
            if (expiresAt !== null && expiresAt <= Date.now()) continue;
            desired.set(trip.id, { tripId: trip.id, mode, expiresAt, timeoutId: null });
        }

        // Stop any trips no longer desired (mode flipped to off, user removed
        // from trip, or expiry already past).
        for (const [tripId, state] of activeTripsRef.current) {
            if (!desired.has(tripId)) {
                if (state.timeoutId) clearTimeout(state.timeoutId);
                void stopLiveLocation(tripId, uid).catch(() => { /* offline ok */ });
                activeTripsRef.current.delete(tripId);
            }
        }

        // Add/refresh desired trips.
        for (const [tripId, target] of desired) {
            const existing = activeTripsRef.current.get(tripId);
            if (existing && existing.timeoutId) clearTimeout(existing.timeoutId);

            // Schedule auto-stop at expiry. `always` mode has no timeout.
            let timeoutId: ReturnType<typeof setTimeout> | null = null;
            if (target.expiresAt !== null) {
                const ms = Math.max(0, target.expiresAt - Date.now());
                timeoutId = setTimeout(() => {
                    void stopLiveLocation(tripId, uid).catch(() => { /* ignore */ });
                    activeTripsRef.current.delete(tripId);
                    setTick(t => t + 1);
                }, ms);
            }
            activeTripsRef.current.set(tripId, { ...target, timeoutId });
        }

        // Start the platform watcher iff at least one trip is active and we
        // don't already have one running.
        if (activeTripsRef.current.size > 0) {
            void ensureWatcherStarted({
                onPosition: (pos) => onLocation(pos, uid, activeTripsRef.current, lastEmitRef),
                onError: (err) => {
                    console.warn('[LiveLocationDaemon] watcher error:', err);
                },
                watcherIdRef,
                webWatchIdRef,
            });
        } else {
            void teardown(activeTripsRef.current, uid, watcherIdRef, webWatchIdRef);
        }

        // The ref is copied into a local so the cleanup observes the snapshot
        // we just configured; React's exhaustive-deps lint flags reading
        // refs in cleanup as a footgun (DOM nodes can change), but here the
        // ref points to a Map, and cleanup only runs after the effect has
        // finished mutating it.
        const activeAtSetup = activeTripsRef.current;
        return () => {
            for (const [, state] of activeAtSetup) {
                if (state.timeoutId) clearTimeout(state.timeoutId);
            }
            void teardown(activeAtSetup, uid, watcherIdRef, webWatchIdRef);
        };
        // tick is intentionally a dep — it's the signal that user-trips +
        // localStorage modes need re-evaluation.
    }, [appUser?.uid, appUser?.shareLocation, userTrips, tick]);

    return null;
};

// ── Watcher lifecycle ─────────────────────────────────────────────────────

const ensureWatcherStarted = async (args: {
    onPosition: (p: Position) => void;
    onError: (e: unknown) => void;
    watcherIdRef: React.MutableRefObject<string | null>;
    webWatchIdRef: React.MutableRefObject<number | null>;
}) => {
    const { onPosition, onError, watcherIdRef, webWatchIdRef } = args;
    if (Capacitor.isNativePlatform()) {
        if (watcherIdRef.current) return;
        try {
            const id = await BackgroundGeolocation.addWatcher(
                {
                    backgroundMessage: 'TripMates is sharing your live location with your trip.',
                    backgroundTitle: 'Live location active',
                    requestPermissions: true,
                    stale: false,
                    distanceFilter: MIN_DISTANCE_M,
                },
                (location, error) => {
                    if (error) { onError(error); return; }
                    if (!location) return;
                    onPosition({
                        lat: location.latitude,
                        lng: location.longitude,
                        accuracy: location.accuracy ?? null,
                        heading: location.bearing ?? null,
                    });
                }
            );
            watcherIdRef.current = id;
        } catch (e) {
            onError(e);
        }
        return;
    }

    // Web fallback — works in dev / browser preview, no background support.
    if (webWatchIdRef.current !== null) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    webWatchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => onPosition({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
            heading: typeof pos.coords.heading === 'number' ? pos.coords.heading : null,
        }),
        (err) => onError(err),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
};

const teardown = async (
    active: Map<string, ActiveTripState>,
    uid: string | undefined,
    watcherIdRef: React.MutableRefObject<string | null>,
    webWatchIdRef: React.MutableRefObject<number | null>,
) => {
    // Null the refs *synchronously* before awaiting removeWatcher. Otherwise,
    // a follow-up effect run that calls ensureWatcherStarted while teardown
    // is mid-flight would see the old ref and skip creating a fresh watcher,
    // leaving the daemon with no active source of position updates.
    const nativeId = watcherIdRef.current;
    const webId = webWatchIdRef.current;
    watcherIdRef.current = null;
    webWatchIdRef.current = null;

    if (Capacitor.isNativePlatform() && nativeId) {
        try {
            await BackgroundGeolocation.removeWatcher({ id: nativeId });
        } catch { /* ignore */ }
    }
    if (webId !== null) {
        navigator.geolocation.clearWatch(webId);
    }
    if (uid) {
        for (const [tripId] of active) {
            void stopLiveLocation(tripId, uid).catch(() => { /* ignore */ });
        }
    }
    active.clear();
};

// ── Per-position handler ──────────────────────────────────────────────────

const onLocation = (
    pos: Position,
    uid: string,
    active: Map<string, ActiveTripState>,
    lastEmitRef: React.MutableRefObject<LastEmit | null>,
) => {
    if (active.size === 0) return;

    // Throttle: emit if 30s have passed OR moved 50m since last write. The
    // background-geolocation plugin already applies a `distanceFilter`, but
    // the time-based bound covers stationary devices that wouldn't otherwise
    // refresh and look stale on the map.
    const now = Date.now();
    const last = lastEmitRef.current;
    const movedEnough = !last || distanceMeters(last, pos) >= MIN_DISTANCE_M;
    const elapsedEnough = !last || now - last.at >= MIN_INTERVAL_MS;
    if (last && !movedEnough && !elapsedEnough) return;

    lastEmitRef.current = { at: now, lat: pos.lat, lng: pos.lng };

    for (const [tripId, state] of active) {
        // Skip writes after expiry — the scheduled stop will tear down soon.
        if (state.expiresAt !== null && state.expiresAt <= now) continue;
        void writeLiveLocation(tripId, uid, {
            lat: pos.lat,
            lng: pos.lng,
            accuracy: pos.accuracy,
            heading: pos.heading,
            expiresAt: state.expiresAt,
            mode: state.mode,
        }).catch(() => { /* offline writes are queued by Firebase SDK */ });
    }
};
