import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { doc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

let initializedForUid: string | null = null;
let listenersAttached = false;
let activeToken: string | null = null;

function tokenDoc(uid: string, token: string) {
    return doc(db, 'users', uid, 'fcmTokens', token);
}

async function persistToken(uid: string, token: string): Promise<void> {
    await setDoc(
        tokenDoc(uid, token),
        {
            platform: Capacitor.getPlatform(),
            createdAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
        },
        { merge: true },
    );
}

/**
 * Request permission, fetch the FCM token, save it under
 * users/{uid}/fcmTokens/{token}, and attach refresh / foreground listeners.
 *
 * No-op on web (we don't ship a service worker for FCM).
 * Idempotent for the same uid.
 */
export async function initPushNotifications(uid: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (initializedForUid === uid) return;
    initializedForUid = uid;

    try {
        const current = await FirebaseMessaging.checkPermissions();
        let status = current.receive;
        if (status === 'prompt' || status === 'prompt-with-rationale') {
            const requested = await FirebaseMessaging.requestPermissions();
            status = requested.receive;
        }
        if (status !== 'granted') return;

        const { token } = await FirebaseMessaging.getToken();
        if (token) {
            activeToken = token;
            await persistToken(uid, token);
        }

        if (!listenersAttached) {
            listenersAttached = true;
            await FirebaseMessaging.addListener('tokenReceived', async ({ token: refreshed }) => {
                if (!initializedForUid || !refreshed) return;
                activeToken = refreshed;
                try {
                    await persistToken(initializedForUid, refreshed);
                } catch (err) {
                    console.warn('[push] failed to persist refreshed token', err);
                }
            });
            await FirebaseMessaging.addListener('notificationReceived', () => {
                // Foreground delivery hook — left blank until we add an in-app toast.
            });
        }
    } catch (err) {
        console.warn('[push] init failed:', err);
    }
}

/**
 * Called on sign-out: drop the stored token doc so the device stops
 * receiving pushes for the previous account, then detach listeners.
 */
export async function teardownPushNotifications(uid: string | null): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const tokenToRemove = activeToken;
    const ownerUid = uid ?? initializedForUid;
    if (ownerUid && tokenToRemove) {
        try {
            await deleteDoc(tokenDoc(ownerUid, tokenToRemove));
        } catch {
            // best-effort
        }
    }
    try {
        await FirebaseMessaging.deleteToken();
    } catch {
        // best-effort
    }
    if (listenersAttached) {
        await FirebaseMessaging.removeAllListeners();
        listenersAttached = false;
    }
    initializedForUid = null;
    activeToken = null;
}
