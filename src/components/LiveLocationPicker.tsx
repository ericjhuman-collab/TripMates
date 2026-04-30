import { useState, useSyncExternalStore } from 'react';
import {
    LIVE_LOCATION_MODES,
    MODE_LABELS,
    getMode,
    setMode,
    subscribeToModeChanges,
    type LiveLocationMode,
} from '../services/liveLocation';
import styles from './LiveLocationPicker.module.css';

interface Props {
    tripId: string;
    /** When true, shows compact "pill" layout for the map overlay. */
    compact?: boolean;
}

export const LiveLocationPicker: React.FC<Props> = ({ tripId, compact = false }) => {
    // useSyncExternalStore handles both mount-read and subscription-driven
    // updates, and re-reads automatically when `tripId` changes.
    const mode = useSyncExternalStore<LiveLocationMode>(
        subscribeToModeChanges,
        () => getMode(tripId),
    );
    const [open, setOpen] = useState(false);

    const handlePick = (m: LiveLocationMode) => {
        setMode(tripId, m);
        setOpen(false);
    };

    if (compact) {
        const isOn = mode !== 'off';
        return (
            <div className={styles.compactWrap}>
                <button
                    className={`glass-btn ${styles.compactBtn} ${isOn ? styles.compactBtnOn : ''}`}
                    onClick={() => setOpen(o => !o)}
                    aria-haspopup="menu"
                    aria-expanded={open}
                >
                    <span className={styles.dot} data-on={isOn} />
                    <span className={styles.compactLabel}>{MODE_LABELS[mode]}</span>
                </button>
                {open && (
                    <div className={styles.menu} role="menu">
                        {LIVE_LOCATION_MODES.map(m => (
                            <button
                                key={m}
                                role="menuitemradio"
                                aria-checked={mode === m}
                                className={`${styles.menuItem} ${mode === m ? styles.menuItemActive : ''}`}
                                onClick={() => handlePick(m)}
                            >
                                {MODE_LABELS[m]}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={styles.segmented} role="radiogroup" aria-label="Live location sharing">
            {LIVE_LOCATION_MODES.map(m => (
                <button
                    key={m}
                    role="radio"
                    aria-checked={mode === m}
                    className={`${styles.segment} ${mode === m ? styles.segmentActive : ''}`}
                    onClick={() => handlePick(m)}
                >
                    {MODE_LABELS[m]}
                </button>
            ))}
        </div>
    );
};
