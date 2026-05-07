import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AppUser } from '../context/AuthContext';
import { addSpin, subscribeToSpins, type SpinRecord } from '../services/spinningWheel';
import styles from './SpinningWheel.module.css';

interface Props {
    tripId: string;
    members: AppUser[];
    currentUid: string;
}

/** Soft slate / sand palette tuned to the default-trip theme variables.
 *  Cycles when there are more participants than colours. */
const SEGMENT_COLOURS = [
    '#e2e8f0', // slate-200
    '#cbd5e1', // slate-300
    '#fde68a', // amber-200 (sand)
    '#d4d4d8', // zinc-300
    '#fef3c7', // amber-100 (light sand)
    '#94a3b8', // slate-400
    '#e7e5e4', // stone-200
    '#a8a29e', // stone-400
];

const SPIN_DURATION_MS = 4200;
const FULL_TURNS = 5;

const formatTimestamp = (record: SpinRecord): string => {
    if (!record.createdAt?.toDate) return '';
    const d = record.createdAt.toDate();
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Today, ${time}`;
    const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${date}, ${time}`;
};

const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const arcPath = (cx: number, cy: number, r: number, startDeg: number, endDeg: number): string => {
    const start = polarToCartesian(cx, cy, r, endDeg);
    const end = polarToCartesian(cx, cy, r, startDeg);
    const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
};

export const SpinningWheel: React.FC<Props> = ({ tripId, members, currentUid }) => {
    const [excludedUids, setExcludedUids] = useState<Set<string>>(new Set());
    const [rotation, setRotation] = useState(0);
    const [spinning, setSpinning] = useState(false);
    const [winner, setWinner] = useState<AppUser | null>(null);
    const [history, setHistory] = useState<SpinRecord[]>([]);
    const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!tripId) return;
        return subscribeToSpins(tripId, setHistory);
    }, [tripId]);

    useEffect(() => () => {
        if (settleTimer.current) clearTimeout(settleTimer.current);
    }, []);

    const participants = useMemo(
        () => members.filter(m => !excludedUids.has(m.uid)),
        [members, excludedUids],
    );

    const segmentAngle = participants.length > 0 ? 360 / participants.length : 0;

    const toggleParticipant = (uid: string) => {
        if (spinning) return;
        setExcludedUids(prev => {
            const next = new Set(prev);
            if (next.has(uid)) next.delete(uid);
            else next.add(uid);
            return next;
        });
    };

    const allOn = excludedUids.size === 0;
    const handleSelectAll = () => {
        if (spinning) return;
        setExcludedUids(allOn ? new Set(members.map(m => m.uid)) : new Set());
    };

    const handleSpin = () => {
        if (spinning || participants.length < 2) return;
        const winnerIndex = Math.floor(Math.random() * participants.length);
        const winnerCentreDeg = winnerIndex * segmentAngle + segmentAngle / 2;
        // Pointer sits at 0° (top). The wheel rotates clockwise; to bring the
        // winner's segment centre under the pointer we want the final rotation
        // mod 360 to equal (360 - winnerCentreDeg). Add FULL_TURNS spins on
        // top of the current angle so the animation always feels like a real
        // spin — never a tiny correction.
        const targetMod = (360 - winnerCentreDeg + 360) % 360;
        const currentMod = ((rotation % 360) + 360) % 360;
        const delta = (targetMod - currentMod + 360) % 360;
        const finalRotation = rotation + FULL_TURNS * 360 + delta;

        setSpinning(true);
        setWinner(null);
        setRotation(finalRotation);

        const winnerMember = participants[winnerIndex];
        settleTimer.current = setTimeout(() => {
            setSpinning(false);
            setWinner(winnerMember);
            addSpin(tripId, {
                winnerUid: winnerMember.uid,
                winnerName: winnerMember.fullName || winnerMember.name,
                participants: participants.map(p => p.uid),
                createdBy: currentUid,
            }).catch(e => console.error('Failed to record spin', e));
        }, SPIN_DURATION_MS);
    };

    const cx = 100;
    const cy = 100;
    const r = 96;

    return (
        <div className={styles.container}>
            <div className={styles.wheelOuter}>
                <div className={styles.pointer} aria-hidden />
                <svg
                    viewBox="0 0 200 200"
                    className={`${styles.wheelSvg} ${spinning ? styles.wheelSpinning : ''}`}
                    style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? undefined : 'none' }}
                >
                    {participants.length === 0 && (
                        <circle cx={cx} cy={cy} r={r} fill="var(--color-bg-card)" />
                    )}
                    {participants.length === 1 && (
                        <>
                            <circle cx={cx} cy={cy} r={r} fill={SEGMENT_COLOURS[0]} />
                            <text
                                x={cx}
                                y={cy + 4}
                                textAnchor="middle"
                                className={styles.wheelLabel}
                            >
                                {participants[0].fullName || participants[0].name}
                            </text>
                        </>
                    )}
                    {participants.length >= 2 && participants.map((m, i) => {
                        const start = i * segmentAngle;
                        const end = start + segmentAngle;
                        const mid = start + segmentAngle / 2;
                        const labelRadius = r * 0.62;
                        const labelPos = polarToCartesian(cx, cy, labelRadius, mid);
                        const colour = SEGMENT_COLOURS[i % SEGMENT_COLOURS.length];
                        const labelText = m.fullName || m.name;
                        // Rotate label so it's readable along the radial axis.
                        return (
                            <g key={m.uid}>
                                <path d={arcPath(cx, cy, r, start, end)} fill={colour} stroke="rgba(255,255,255,0.6)" strokeWidth={0.5} />
                                <text
                                    x={labelPos.x}
                                    y={labelPos.y}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    transform={`rotate(${mid} ${labelPos.x} ${labelPos.y})`}
                                    className={styles.wheelLabel}
                                >
                                    {labelText.length > 10 ? labelText.slice(0, 10) + '…' : labelText}
                                </text>
                            </g>
                        );
                    })}
                    <circle cx={cx} cy={cy} r={18} className={styles.wheelHub} />
                </svg>
            </div>

            <button
                className={`btn btn-primary ${styles.spinBtn}`}
                onClick={handleSpin}
                disabled={spinning || participants.length < 2}
            >
                {spinning ? 'Spinning…' : participants.length < 2 ? 'Need 2+ participants' : 'Click to spin'}
            </button>

            {winner && !spinning && (
                <div className={styles.winnerBanner}>
                    🎉 Winner
                    <div className={styles.winnerName}>{winner.fullName || winner.name}</div>
                </div>
            )}

            <div className={styles.participantsBlock}>
                <div className={styles.participantsHeader}>
                    <span className={styles.participantsTitle}>Participants ({participants.length}/{members.length})</span>
                    <button
                        className={styles.participantsAction}
                        onClick={handleSelectAll}
                        disabled={spinning}
                    >
                        {allOn ? 'Deselect all' : 'Select all'}
                    </button>
                </div>
                <div className={styles.chips}>
                    {members.map(m => {
                        const excluded = excludedUids.has(m.uid);
                        return (
                            <button
                                key={m.uid}
                                className={`${styles.chip} ${excluded ? styles.chipExcluded : ''}`}
                                onClick={() => toggleParticipant(m.uid)}
                                disabled={spinning}
                                title={excluded ? 'Tap to include' : 'Tap to exclude'}
                            >
                                {m.avatarUrl ? (
                                    <img src={m.avatarUrl} alt={m.name} className={styles.chipAvatar} loading="lazy" />
                                ) : (
                                    <span className={styles.chipAvatarFallback}>
                                        {(m.fullName || m.name).charAt(0).toUpperCase()}
                                    </span>
                                )}
                                {m.fullName || m.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className={styles.historyBlock}>
                <div className={styles.historyHeader}>Recent spins</div>
                {history.length === 0 ? (
                    <p className={styles.emptyHint}>No spins yet — give the wheel a tap!</p>
                ) : (
                    <div className={styles.historyList}>
                        {history.map(spin => {
                            const member = members.find(m => m.uid === spin.winnerUid);
                            return (
                                <div key={spin.id} className={styles.historyRow}>
                                    {member?.avatarUrl ? (
                                        <img src={member.avatarUrl} alt={spin.winnerName} className={styles.historyAvatar} loading="lazy" />
                                    ) : (
                                        <span className={styles.historyAvatarFallback}>
                                            {spin.winnerName.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                    <span className={styles.historyName}>{spin.winnerName}</span>
                                    <span className={styles.historyTime}>{formatTimestamp(spin)}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
