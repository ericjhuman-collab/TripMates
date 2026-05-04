import { useEffect, useState } from 'react';
import {
    ALL_NOTIFICATION_CATEGORIES,
    getNotificationPrefs,
    isCategoryEnabled,
    setNotificationPref,
    type NotificationCategory,
    type NotificationPrefs,
} from '../services/notificationPrefs';
import { useAuth } from '../context/AuthContext';
import styles from './NotificationSettings.module.css';

const LABELS: Record<NotificationCategory, { title: string; help: string }> = {
    chat: { title: 'Chat', help: 'New messages in your trips.' },
    tripInvite: { title: 'Trip invites', help: 'When you are added to a trip.' },
    games: { title: 'Games', help: 'Odds challenges and results.' },
    polls: { title: 'Polls', help: 'New polls in your trips.' },
    activityReminder: { title: 'Activity reminder', help: '1 hour before a planned activity starts.' },
    follow: { title: 'New follower', help: 'When someone follows your profile.' },
};

export default function NotificationSettings() {
    const { currentUser } = useAuth();
    const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState<NotificationCategory | null>(null);

    useEffect(() => {
        if (!currentUser) return;
        let cancelled = false;
        (async () => {
            const loaded = await getNotificationPrefs(currentUser.uid);
            if (!cancelled) {
                setPrefs(loaded ?? {});
                setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [currentUser]);

    if (!currentUser) return null;

    const onToggle = async (category: NotificationCategory, next: boolean) => {
        setSavingKey(category);
        setPrefs(prev => ({ ...(prev ?? {}), [category]: next }));
        try {
            await setNotificationPref(currentUser.uid, category, next);
        } catch (err) {
            console.warn('[notification-prefs] save failed', err);
            setPrefs(prev => ({ ...(prev ?? {}), [category]: !next }));
        } finally {
            setSavingKey(null);
        }
    };

    if (loading) {
        return <p className={styles.loading}>Loading…</p>;
    }

    return (
        <div className={styles.list}>
            {ALL_NOTIFICATION_CATEGORIES.map(cat => {
                const enabled = isCategoryEnabled(prefs, cat);
                return (
                    <label key={cat} className={styles.row}>
                        <span className={styles.text}>
                            <span className={styles.title}>{LABELS[cat].title}</span>
                            <span className={styles.help}>{LABELS[cat].help}</span>
                        </span>
                        <input
                            type="checkbox"
                            checked={enabled}
                            disabled={savingKey === cat}
                            onChange={e => onToggle(cat, e.target.checked)}
                        />
                    </label>
                );
            })}
        </div>
    );
}
