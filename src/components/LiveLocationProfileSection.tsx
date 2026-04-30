import { useEffect, useState } from 'react';
import { useTrip } from '../context/TripContext';
import {
    LIVE_LOCATION_MODES,
    MODE_LABELS,
    computeExpiresAt,
    getMode,
    setMode,
    subscribeToModeChanges,
    type LiveLocationMode,
} from '../services/liveLocation';
import styles from './LiveLocationProfileSection.module.css';

const formatExpiry = (expiresAt: number | null): string => {
    if (expiresAt === null) return 'never expires';
    const now = Date.now();
    const diff = expiresAt - now;
    if (diff <= 0) return 'expired';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        return `expires in ~${days}d`;
    }
    if (hours >= 1) return `expires in ${hours}h ${minutes}m`;
    return `expires in ${minutes}m`;
};

export const LiveLocationProfileSection: React.FC = () => {
    const { userTrips } = useTrip();
    const [, setTick] = useState(0);

    useEffect(() => subscribeToModeChanges(() => setTick(t => t + 1)), []);

    // Re-render once a minute so the "expires in" text stays fresh.
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 60000);
        return () => clearInterval(id);
    }, []);

    if (userTrips.length === 0) {
        return (
            <p className={styles.empty}>
                Join or create a trip to start sharing your live location.
            </p>
        );
    }

    return (
        <div className={styles.list}>
            {userTrips.map(trip => {
                const mode = getMode(trip.id);
                const expiresAt = mode === 'off' ? null : computeExpiresAt(mode, trip.endDate);
                const isOn = mode !== 'off';
                return (
                    <div key={trip.id} className={styles.tripRow}>
                        <div className={styles.tripHeader}>
                            <div className={styles.tripName}>{trip.name}</div>
                            <div className={styles.tripStatus}>
                                <span
                                    className={styles.statusDot}
                                    data-on={isOn}
                                />
                                <span className={isOn ? styles.statusOn : styles.statusOff}>
                                    {MODE_LABELS[mode]}
                                </span>
                                {isOn && (
                                    <span className={styles.expiresLabel}>
                                        · {formatExpiry(expiresAt)}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className={styles.controlsRow}>
                            <div className={styles.segmented} role="radiogroup">
                                {LIVE_LOCATION_MODES.map(m => (
                                    <button
                                        key={m}
                                        role="radio"
                                        aria-checked={mode === m}
                                        className={`${styles.segment} ${mode === m ? styles.segmentActive : ''}`}
                                        onClick={() => setMode(trip.id, m as LiveLocationMode)}
                                    >
                                        {MODE_LABELS[m]}
                                    </button>
                                ))}
                            </div>
                            {isOn && (
                                <button
                                    type="button"
                                    className={styles.stopBtn}
                                    onClick={() => setMode(trip.id, 'off')}
                                >
                                    Stop
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
