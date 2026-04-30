import { useState } from 'react';
import { Check, X, Lock } from 'lucide-react';
import { format } from 'date-fns';
import {
    closePoll,
    deletePoll,
    isPollOpen,
    voteCounts,
    voterCount,
    votePoll,
    type Poll,
} from '../services/polls';
import styles from './PollCard.module.css';

interface Props {
    poll: Poll;
    tripId: string;
    currentUid: string;
    /** True when the viewer is the trip creator or in adminIds. */
    canManage: boolean;
    /** Optional: map of uid → display name for showing voter names. */
    memberNames?: Record<string, string>;
}

export const PollCard: React.FC<Props> = ({ poll, tripId, currentUid, canManage, memberNames }) => {
    const open = isPollOpen(poll);
    const myVote = poll.votes[currentUid] ?? [];
    const counts = voteCounts(poll);
    const totalVoters = voterCount(poll);
    const [submitting, setSubmitting] = useState(false);
    const [showVoters, setShowVoters] = useState(false);

    const handleToggleOption = async (optionId: string) => {
        if (!open || submitting) return;
        let next: string[];
        if (poll.allowMultipleChoice) {
            next = myVote.includes(optionId)
                ? myVote.filter(id => id !== optionId)
                : [...myVote, optionId];
        } else {
            // Single-choice: tapping the already-selected option clears it.
            next = myVote[0] === optionId ? [] : [optionId];
        }
        setSubmitting(true);
        try {
            await votePoll({ tripId, pollId: poll.id, voterUid: currentUid, optionIds: next });
        } catch (e) {
            console.error('Vote failed', e);
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = async () => {
        if (!confirm('Close this poll? Votes can no longer be changed.')) return;
        try {
            await closePoll(tripId, poll.id);
        } catch (e) {
            console.error('Close failed', e);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Delete this poll? This cannot be undone.')) return;
        try {
            await deletePoll(tripId, poll.id);
        } catch (e) {
            console.error('Delete failed', e);
        }
    };

    const votersFor = (optionId: string): string[] => {
        const uids: string[] = [];
        for (const [uid, ids] of Object.entries(poll.votes)) {
            if (ids.includes(optionId)) uids.push(uid);
        }
        return uids;
    };

    const dt = new Date(poll.createdAt);

    return (
        <div className={`${styles.card} ${!open ? styles.cardClosed : ''}`}>
            <div className={styles.header}>
                <div className={styles.creator}>
                    {poll.createdByAvatarUrl
                        ? <img src={poll.createdByAvatarUrl} alt="" className={styles.avatar} />
                        : <div className={styles.avatarFallback}>{(poll.createdByName || '?').charAt(0).toUpperCase()}</div>
                    }
                    <div className={styles.creatorMeta}>
                        <span className={styles.creatorName}>{poll.createdByName}</span>
                        <span className={styles.creatorTime}>{format(dt, 'MMM d, HH:mm')}</span>
                    </div>
                </div>
                {!open && (
                    <span className={styles.closedBadge}>
                        <Lock size={12} /> Closed
                    </span>
                )}
            </div>

            <h3 className={styles.question}>{poll.question}</h3>

            {poll.allowMultipleChoice && open && (
                <p className={styles.hint}>Pick one or more</p>
            )}

            <div className={styles.options}>
                {poll.options.map(opt => {
                    const isSelected = myVote.includes(opt.id);
                    const count = counts[opt.id] ?? 0;
                    const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0;
                    return (
                        <button
                            key={opt.id}
                            className={`${styles.option} ${isSelected ? styles.optionSelected : ''} ${!open ? styles.optionDisabled : ''}`}
                            onClick={() => handleToggleOption(opt.id)}
                            disabled={!open || submitting}
                            aria-pressed={isSelected}
                        >
                            <div className={styles.optionFill} style={{ width: `${pct}%` }} />
                            <div className={styles.optionContent}>
                                <span className={styles.optionLabel}>
                                    {isSelected && <Check size={14} className={styles.checkIcon} />}
                                    {opt.label}
                                </span>
                                <span className={styles.optionCount}>{count}</span>
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className={styles.footer}>
                <button
                    type="button"
                    className={styles.toggleVoters}
                    onClick={() => setShowVoters(s => !s)}
                >
                    {totalVoters} {totalVoters === 1 ? 'vote' : 'votes'}
                    {totalVoters > 0 && ` · ${showVoters ? 'hide who' : 'see who'}`}
                </button>
                {canManage && (
                    <div className={styles.adminRow}>
                        {open && (
                            <button type="button" onClick={handleClose} className={styles.closeBtn}>
                                Close
                            </button>
                        )}
                        <button type="button" onClick={handleDelete} className={styles.deleteBtn} aria-label="Delete poll">
                            <X size={14} />
                        </button>
                    </div>
                )}
            </div>

            {showVoters && totalVoters > 0 && (
                <div className={styles.votersList}>
                    {poll.options.map(opt => {
                        const voters = votersFor(opt.id);
                        if (voters.length === 0) return null;
                        return (
                            <div key={opt.id} className={styles.voterGroup}>
                                <span className={styles.voterGroupLabel}>{opt.label}</span>
                                <span className={styles.voterNames}>
                                    {voters.map(uid => memberNames?.[uid] ?? uid.slice(0, 6)).join(', ')}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
