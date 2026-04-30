import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
    /** When true, the picker is interactive but the dot stays grey and a
     *  short helper line explains why nothing actually broadcasts. Used when
     *  the master "Allow live location sharing" toggle in Profile is off. */
    masterDisabled?: boolean;
}

export const LiveLocationPicker: React.FC<Props> = ({ tripId, compact = false, masterDisabled = false }) => {
    // useSyncExternalStore handles both mount-read and subscription-driven
    // updates, and re-reads automatically when `tripId` changes.
    const mode = useSyncExternalStore<LiveLocationMode>(
        subscribeToModeChanges,
        () => getMode(tripId),
    );
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    // Close the compact menu on outside-click or Escape so it doesn't get
    // stuck open after the user taps elsewhere on the map.
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const handlePick = (m: LiveLocationMode) => {
        setMode(tripId, m);
        setOpen(false);
    };

    if (compact) {
        // When the master kill switch is off, the picker still shows the
        // user's selection (so it's not lost) but presents as inactive — no
        // green dot, no primary background — to make it obvious nothing is
        // actually broadcasting.
        const isOn = mode !== 'off' && !masterDisabled;
        return (
            <div className={styles.compactWrap} ref={wrapRef}>
                <button
                    className={`glass-btn ${styles.compactBtn} ${isOn ? styles.compactBtnOn : ''}`}
                    onClick={() => setOpen(o => !o)}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    title={masterDisabled ? 'Live location is disabled in Profile settings' : undefined}
                >
                    <span className={styles.dot} data-on={isOn} />
                    <span className={styles.compactLabel}>{MODE_LABELS[mode]}</span>
                </button>
                {open && (
                    <div className={styles.menu} role="menu">
                        {masterDisabled && (
                            <p className={styles.menuHint}>
                                Live location is off in Profile → Settings. Turn it on there to start sharing.
                            </p>
                        )}
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
