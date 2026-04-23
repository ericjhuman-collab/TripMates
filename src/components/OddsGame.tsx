import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useOdds } from '../context/useOdds';
import { useTrip } from '../context/TripContext';
import { useAuth } from '../context/AuthContext';
import styles from './OddsGame.module.css';
import type { OddsSession } from '../services/odds';

// Firestore serverTimestamp() reads back as a Timestamp ({ toMillis }), not a Date/string.
const createdAtMs = (x: unknown): number => {
    if (!x) return 0;
    if (typeof x === 'object' && x !== null && 'toMillis' in x && typeof (x as { toMillis?: unknown }).toMillis === 'function') {
        return (x as { toMillis: () => number }).toMillis();
    }
    const d = new Date(x as string | number | Date);
    const t = d.getTime();
    return Number.isFinite(t) ? t : 0;
};

const RulesContent = () => {
    return (
        <div className={styles.modalBody}>
            <p className={styles.infoText}>
                <strong>The Odds</strong> is a classic party game where players dare each other to do fun or crazy challenges.
            </p>
            <ol className={styles.rulesList}>
                <li><strong>Propose:</strong> The Challenger prompts someone with a dare (e.g. "What are the odds you jump in the pool?").</li>
                <li><strong>Set the Odds:</strong> The Target replies with a range (like 1 in 20) and secretly locks in their number.</li>
                <li><strong>Guess:</strong> The Challenger guesses a number in that identical range.</li>
                <li><strong>Reveal:</strong> If both choose the same number, it's a MATCH and the Target must do it! If not, they safely dodge it.</li>
            </ol>
        </div>
    );
};

export const OddsGame: React.FC = () => {
    const { activeOdds, issueDare, respondRange, submitGuess, markCompleted } = useOdds();
    const { activeTrip } = useTrip();
    const { appUser } = useAuth();
    
    const [dareInput, setDareInput] = useState('');
    const [targetIdInput, setTargetIdInput] = useState('');
    
    // UI state for revealing
    const [revealingSession, setRevealingSession] = useState<OddsSession | null>(null);
    const [showTargetNum, setShowTargetNum] = useState(false);
    const [showChallengerNum, setShowChallengerNum] = useState(false);
    const [showResult, setShowResult] = useState(false);

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showRules, setShowRules] = useState(false);

    if (!activeTrip || !appUser) return null;

    const members = activeTrip.members.map(uid => ({
        uid,
        name: uid.startsWith('mock_') ? uid.replace('mock_', '').replace('_', ' ') : 'User',
        isMe: uid === appUser.uid
    }));

    const handleIssueDare = async () => {
        if (!dareInput || !targetIdInput) return;
        await issueDare(targetIdInput, dareInput);
        setDareInput('');
        setTargetIdInput('');
        setShowCreateForm(false);
    };

    const triggerReveal = (session: OddsSession) => {
        setRevealingSession({ ...session, state: 'resolved' }); // Force resolved state for overlay
        setShowTargetNum(false);
        setShowChallengerNum(false);
        setShowResult(false);
        
        setTimeout(() => setShowTargetNum(true), 1000);
        setTimeout(() => setShowChallengerNum(true), 2500);
        setTimeout(() => setShowResult(true), 4000);
    };

    const handleCloseReveal = () => {
        setRevealingSession(null);
    };

    return (
        <div className={styles.container}>
            <div className={styles.headerRow}>
                <h2 className={styles.mainTitle}>Dares</h2>
                <div className={styles.headerActions}>
                    <button className={styles.infoBtn} onClick={() => setShowRules(!showRules)} title="How to Play">
                        <i>i</i>
                    </button>
                    <button className={styles.addBtn} onClick={() => setShowCreateForm(!showCreateForm)} title="Issue a Dare">
                        {showCreateForm ? '✕' : '+'}
                    </button>
                </div>
            </div>

            {/* Rules Modal */}
            {showRules && createPortal(
                <div className={styles.modalOverlay} onClick={() => setShowRules(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.modalTitle}>
                            Information
                            <button className={styles.modalCloseBtn} onClick={() => setShowRules(false)}>&times;</button>
                        </h2>
                        
                        <RulesContent />
                        
                        <button className={styles.gotItBtn} onClick={() => setShowRules(false)}>Got it</button>
                    </div>
                </div>,
                document.body
            )}

            {/* Create Dare Card */}
            {showCreateForm && (
                <div className={`${styles.createCard} animate-fade-in`}>
                    <h3 className={styles.cardHeader}>Issue a Dare</h3>
                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Select Target</label>
                        <select 
                            className={styles.select} 
                            value={targetIdInput} 
                            onChange={e => setTargetIdInput(e.target.value)}
                            title="Select Target"
                        >
                            <option value="">-- Choose Member --</option>
                            {members.filter(m => !m.isMe).map(m => (
                                <option key={m.uid} value={m.uid}>{m.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className={styles.inputGroup}>
                        <label className={styles.label}>What's the Dare?</label>
                        <input 
                            className={styles.input} 
                            placeholder="e.g. Do a backflip into the pool..." 
                            value={dareInput}
                            onChange={e => setDareInput(e.target.value)}
                        />
                    </div>
                    <button 
                        className={styles.button} 
                        disabled={!dareInput || !targetIdInput}
                        onClick={handleIssueDare}
                    >
                        Challenge!
                    </button>
                </div>
            )}

            {/* Dares Sections */}
            {(() => {
                const pending = activeOdds
                    .filter(s =>
                        s.state !== 'resolved' ||
                        (s.state === 'resolved' && !localStorage.getItem(`revealed_${s.id}`)) ||
                        (s.state === 'resolved' && s.isMatch && !s.isCompleted)
                    )
                    .sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt));

                const resolved = activeOdds
                    .filter(s =>
                        s.state === 'resolved' &&
                        localStorage.getItem(`revealed_${s.id}`) &&
                        (!s.isMatch || s.isCompleted)
                    )
                    .sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt));


                return (
                    <>
                        {pending.length > 0 && (
                            <div className={styles.activeSessions}>
                            <h3 className={styles.sectionTitle}>Active Dares</h3>
                                {pending.map(session => (
                                    <SessionCard
                                        key={session.id}
                                        session={session}
                                        appUser={appUser}
                                        members={members}
                                        onRespond={respondRange}
                                        onSubmitGuess={async (sId: string, g: number) => {
                                            const isMatch = await submitGuess(sId, g);
                                            triggerReveal({ ...session, challengerNumber: g, isMatch });
                                        }}
                                        onShowResult={() => triggerReveal(session)}
                                        onMarkCompleted={markCompleted}
                                    />
                                ))}
                            </div>
                        )}
                        {resolved.length > 0 && (
                            <div className={`${styles.activeSessions} ${styles.resolvedSessions}`}>
                            <h3 className={styles.sectionTitle}>Dare History</h3>
                                {resolved.map(session => (
                                    <SessionCard
                                        key={session.id}
                                        session={session}
                                        appUser={appUser}
                                        members={members}
                                        onRespond={respondRange}
                                        onSubmitGuess={() => {}}
                                        onShowResult={() => triggerReveal(session)}
                                        onMarkCompleted={markCompleted}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                );
            })()}

            {revealingSession && (
                <div className={styles.revealOverlay}>
                    <div className={styles.revealTitle}>What are the odds?</div>
                    <div className={styles.numbersContainer}>
                        <div className={styles.numberBox}>
                            <span className={styles.numberLabel}>Target</span>
                            <div className={`${styles.numberValue} ${showTargetNum ? styles.numberRevealed : styles.numberHidden}`}>
                                {showTargetNum ? revealingSession.targetNumber : ''}
                            </div>
                        </div>
                        <div className={styles.numberBox}>
                            <span className={styles.numberLabel}>Challenger</span>
                            <div className={`${styles.numberValue} ${showChallengerNum ? styles.numberRevealed : styles.numberHidden}`}>
                                {showChallengerNum ? revealingSession.challengerNumber : ''}
                            </div>
                        </div>
                    </div>
                    {showResult && (
                        <div className={`${styles.resultText} ${revealingSession.isMatch ? styles.resultMatch : styles.resultSafe}`}>
                            {revealingSession.isMatch ? "GUILTY!" : "SAFE"}
                        </div>
                    )}
                    {showResult && (
                        <button className={styles.closeRevealBtn} onClick={handleCloseReveal}>Continue</button>
                    )}
                </div>
            )}
        </div>
    );
};

// Sub-component for individual dare cards
import { ChevronDown } from 'lucide-react';
import type { AppUser } from '../context/AuthContext';

interface TripMember { uid: string; name: string; isMe: boolean; }

interface SessionCardProps {
    session: OddsSession;
    appUser: AppUser;
    members: TripMember[];
    onRespond: (sessionId: string, range: number, targetSecret: number) => Promise<void>;
    onSubmitGuess: (sessionId: string, guess: number) => void | Promise<void>;
    onShowResult: () => void;
    onMarkCompleted: (sessionId: string) => Promise<void>;
}

const SessionCard = ({ session, appUser, members, onRespond, onSubmitGuess, onShowResult, onMarkCompleted }: SessionCardProps) => {
    const isChallenger = session.challengerId === appUser.uid;
    const isTarget = session.targetId === appUser.uid;
    
    // Dev overrides so we can click around mock features
    const isDevMockTarget = !isTarget && session.targetId.startsWith('mock_');
    const isDevMockChallenger = !isChallenger && session.challengerId.startsWith('mock_');

    const canActAsTarget = isTarget || isDevMockTarget;
    const canActAsChallenger = isChallenger || isDevMockChallenger;

    const [isExpanded, setIsExpanded] = useState(false);
    const [rangeInput, setRangeInput] = useState<number | ''>('');
    const [secretInput, setSecretInput] = useState<number | ''>('');
    const [guessInput, setGuessInput] = useState<number | ''>('');

    const targetName = members.find(m => m.uid === session.targetId)?.name || 'Someone';
    const challengerName = members.find(m => m.uid === session.challengerId)?.name || 'Someone';

    const [hasRevealed, setHasRevealed] = useState(() => {
        return localStorage.getItem(`revealed_${session.id}`) === 'true';
    });

    const getStatusStyles = () => {
        if (session.state === 'resolved') {
            if (!hasRevealed) return styles.statusReady;
            if (session.isMatch) return session.isCompleted ? styles.statusDodged : styles.statusMatch;
            return styles.statusDodged;
        }
        if (session.state === 'pending_target') return styles.statusPendingTarget;
        return styles.statusPendingChallenger;
    };

    const getStatusLabel = () => {
        if (session.state === 'resolved') {
            if (!hasRevealed) return 'Reveal';
            if (session.isMatch) return session.isCompleted ? 'Done' : 'Guilty!';
            return 'Dodged';
        }
        if (session.state === 'pending_target') return `Waiting on ${targetName}`;
        if (session.state === 'pending_challenger') return `Waiting on ${challengerName}`;
        return session.state;
    };

    return (
        <div className={styles.sessionCard}>
            {/* Tappable header row — always visible */}
            <button
                className={styles.cardHeader}
                onClick={() => setIsExpanded(e => !e)}
                aria-expanded={isExpanded}
            >
                <div className={styles.cardHeaderLeft}>
                    <p className={styles.dareTitle}>"{session.dare}"</p>
                    <span className={styles.dareSubtitle}>{challengerName} ➔ {targetName}</span>
                </div>
                <div className={styles.cardHeaderRight}>
                    <div className={`${styles.statusBadge} ${getStatusStyles()}`}>
                        {getStatusLabel()}
                    </div>
                    <ChevronDown
                        size={16}
                        className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}
                    />
                </div>
            </button>

            {/* Expandable action area */}
            {isExpanded && (
                <div className={styles.actionArea}>
                    {session.state === 'pending_target' && canActAsTarget && (
                        <>
                            {isDevMockTarget && <div className={styles.mockBanner}>Simulating Target View (Dev Mode)</div>}
                            <div className={styles.rangeInputs}>
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>Set the Odds</label>
                                    <input type="number" className={styles.input} placeholder="e.g. 50" value={rangeInput} onChange={e => setRangeInput(parseInt(e.target.value) || '')} />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>Your Number</label>
                                    <input type="number" className={styles.input} placeholder={`1 to ${rangeInput || '?'}`} value={secretInput} onChange={e => setSecretInput(parseInt(e.target.value) || '')} />
                                </div>
                            </div>
                            <button
                                className={`${styles.button} ${styles.fullWidth}`}
                                disabled={!rangeInput || !secretInput || secretInput > rangeInput || secretInput < 1}
                                onClick={() => onRespond(session.id, rangeInput as number, secretInput as number)}
                            >
                                Submit Odds
                            </button>
                        </>
                    )}

                    {session.state === 'pending_challenger' && canActAsChallenger && (
                        <>
                            {isDevMockChallenger && <div className={styles.mockBanner}>Simulating Challenger View (Dev Mode)</div>}
                            <p className={styles.infoText}>
                                {targetName} set the odds to <strong>1 in {session.oddsRange}</strong>.
                            </p>
                            <div className={styles.inputGroup}>
                                <label className={styles.label}>What's your guess?</label>
                                <input type="number" className={styles.input} placeholder={`1 to ${session.oddsRange}`} value={guessInput} onChange={e => setGuessInput(parseInt(e.target.value) || '')} />
                            </div>
                            <button
                                className={`${styles.button} ${styles.fullWidth}`}
                                disabled={!guessInput || guessInput > (session.oddsRange ?? 0) || guessInput < 1}
                                onClick={() => onSubmitGuess(session.id, guessInput as number)}
                            >
                                Lock in Guess
                            </button>
                        </>
                    )}

                    {session.state === 'resolved' && (
                        <div className={styles.centerText}>
                            {hasRevealed ? (
                                <>
                                    <p className={styles.noMargin} style={{ color: 'var(--color-text)', fontSize: '0.9rem', fontWeight: 500 }}>
                                        Odds: 1 in {session.oddsRange} · Numbers: <strong>{session.targetNumber}</strong> vs <strong>{session.challengerNumber}</strong>
                                    </p>
                                    {session.isMatch && !session.isCompleted && canActAsTarget && (
                                        <button
                                            className={`${styles.button} ${styles.fullWidth}`}
                                            style={{ marginTop: '0.75rem', background: '#0ea5e9' }}
                                            onClick={() => onMarkCompleted(session.id)}
                                        >
                                            Mark as Completed ✓
                                        </button>
                                    )}
                                </>
                            ) : (
                                <button
                                    className={`${styles.button} ${styles.fullWidth}`}
                                    onClick={() => {
                                        setHasRevealed(true);
                                        localStorage.setItem(`revealed_${session.id}`, 'true');
                                        onShowResult();
                                    }}
                                >
                                    Show Result 🎯
                                </button>
                            )}
                        </div>
                    )}

                    {/* Waiting — no action needed, just info */}
                    {session.state === 'pending_target' && !canActAsTarget && (
                        <p className={styles.infoText} style={{ margin: 0 }}>Waiting for {targetName} to set the odds…</p>
                    )}
                    {session.state === 'pending_challenger' && !canActAsChallenger && (
                        <p className={styles.infoText} style={{ margin: 0 }}>Waiting for {challengerName} to guess…</p>
                    )}
                </div>
            )}
        </div>
    );
};

