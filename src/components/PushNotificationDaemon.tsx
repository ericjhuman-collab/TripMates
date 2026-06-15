import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { initPushNotifications, teardownPushNotifications } from '../services/pushNotifications';

/**
 * Mounted once at app root. When auth resolves to a real user, requests
 * notification permission (native only) and registers the device's FCM
 * token under users/{uid}/fcmTokens/{token}. On sign-out, tears down the
 * token so subsequent push deliveries to this device stop.
 */
export function PushNotificationDaemon() {
    const { currentUser } = useAuth();
    const lastUid = useRef<string | null>(null);

    useEffect(() => {
        const uid = currentUser?.uid ?? null;
        if (uid === lastUid.current) return;

        if (lastUid.current && !uid) {
            void teardownPushNotifications(lastUid.current);
        }
        if (uid) {
            void initPushNotifications(uid);
        }
        lastUid.current = uid;
    }, [currentUser]);

    return null;
}
