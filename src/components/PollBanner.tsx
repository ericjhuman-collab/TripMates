import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Vote, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import { hasVoted, isPollOpen, subscribeToTripPolls, type Poll } from '../services/polls';
import { OPEN_POLLS_EVENT } from '../utils/pollEvents';
import styles from './PollBanner.module.css';

// Renders a top-of-app banner whenever the active trip has at least one
// open poll the current user hasn't voted on yet. Tap → opens the Polls
// tab on Home. The banner self-dismisses for the session via the X.
//
// The session-scoped dismiss is intentional: skipping a poll today
// shouldn't make it disappear forever — it should reappear next session
// while it's still open and the user still hasn't answered.

export const PollBanner: React.FC = () => {
    const { appUser } = useAuth();
    const { activeTrip } = useTrip();
    const navigate = useNavigate();
    const location = useLocation();
    const [polls, setPolls] = useState<Poll[]>([]);
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!activeTrip?.id) return;
        return subscribeToTripPolls(activeTrip.id, setPolls);
    }, [activeTrip?.id]);

    if (!appUser?.uid || !activeTrip) return null;

    const pending = polls.filter(p =>
        isPollOpen(p)
        && !hasVoted(p, appUser.uid)
        && !dismissedIds.has(p.id),
    );
    if (pending.length === 0) return null;

    const top = pending[0];
    const moreCount = pending.length - 1;

    const handleOpen = () => {
        // If already on Home, dispatch a CustomEvent so Home flips to the
        // Polls tab without depending on router timing. Otherwise navigate
        // to Home with the deep-link query — Home reads it on mount.
        if (location.pathname === '/') {
            window.dispatchEvent(new CustomEvent(OPEN_POLLS_EVENT, { detail: { pollId: top.id } }));
        } else {
            navigate(`/?tab=polls&pollId=${top.id}`);
        }
    };

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDismissedIds(prev => new Set(prev).add(top.id));
    };

    return (
        <div
            className={styles.banner}
            role="button"
            tabIndex={0}
            onClick={handleOpen}
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') handleOpen();
            }}
        >
            <div className={styles.iconBox}>
                <Vote size={18} />
            </div>
            <div className={styles.body}>
                <div className={styles.title}>
                    <span className={styles.from}>{top.createdByName}</span>{' '}
                    asked
                    {moreCount > 0 && <span className={styles.moreLabel}> · +{moreCount} more</span>}
                </div>
                <div className={styles.question}>{top.question}</div>
            </div>
            <button
                type="button"
                className={styles.cta}
                onClick={(e) => { e.stopPropagation(); handleOpen(); }}
            >
                Vote
            </button>
            <button
                type="button"
                className={styles.dismiss}
                onClick={handleDismiss}
                aria-label="Dismiss for now"
            >
                <X size={16} />
            </button>
        </div>
    );
};
