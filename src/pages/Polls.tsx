import { useEffect, useMemo, useState } from 'react';
import { Plus, Vote } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import { db } from '../services/firebase';
import { hasVoted, isPollOpen, subscribeToTripPolls, type Poll } from '../services/polls';
import { PollCard } from '../components/PollCard';
import { CreatePollModal } from '../components/CreatePollModal';
import styles from './Polls.module.css';

interface Props {
    /** Optional pollId from query string — when set, scrolls to that poll on mount. */
    focusPollId?: string;
}

export const Polls: React.FC<Props> = ({ focusPollId }) => {
    const { appUser } = useAuth();
    const { activeTrip } = useTrip();
    const [polls, setPolls] = useState<Poll[]>([]);
    const [createOpen, setCreateOpen] = useState(false);
    const [memberNames, setMemberNames] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!activeTrip?.id) return;
        return subscribeToTripPolls(activeTrip.id, setPolls);
    }, [activeTrip?.id]);

    // One-shot fetch of member display names so the "see who voted" view
    // can show "Anders, Bob" instead of raw uids. Cheap (≤ trip members).
    useEffect(() => {
        if (!activeTrip) return;
        let cancelled = false;
        (async () => {
            const next: Record<string, string> = {};
            for (const uid of activeTrip.members) {
                try {
                    const snap = await getDoc(doc(db, 'users', uid));
                    if (snap.exists()) next[uid] = snap.data().name || uid.slice(0, 6);
                } catch {
                    next[uid] = uid.slice(0, 6);
                }
            }
            if (!cancelled) setMemberNames(next);
        })();
        return () => { cancelled = true; };
    }, [activeTrip]);

    // Scroll the focused poll into view once polls have loaded.
    useEffect(() => {
        if (!focusPollId || polls.length === 0) return;
        const el = document.getElementById(`poll-${focusPollId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add(styles.focused);
            const t = setTimeout(() => el.classList.remove(styles.focused), 2000);
            return () => clearTimeout(t);
        }
    }, [focusPollId, polls]);

    const sorted = useMemo(() => {
        if (!appUser) return polls;
        // Order: open + I haven't voted → open + I have voted → closed.
        const score = (p: Poll): number => {
            if (!isPollOpen(p)) return 2;
            if (!hasVoted(p, appUser.uid)) return 0;
            return 1;
        };
        return [...polls].sort((a, b) => {
            const sa = score(a);
            const sb = score(b);
            if (sa !== sb) return sa - sb;
            return b.createdAt - a.createdAt;
        });
    }, [polls, appUser]);

    if (!activeTrip) return null;

    const canManage = (poll: Poll): boolean => {
        if (!appUser?.uid) return false;
        if (poll.createdBy === appUser.uid) return true;
        return activeTrip.adminIds?.includes(appUser.uid) ?? false;
    };

    const isAdmin = appUser?.uid ? activeTrip.adminIds?.includes(appUser.uid) ?? false : false;
    const canCreate = !!appUser?.uid && (
        isAdmin
        || activeTrip.allowMemberActivities === true
        || activeTrip.members.includes(appUser.uid)
    );

    return (
        <div className={`animate-fade-in ${styles.page}`}>
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>Polls</h2>
                    <p className={styles.subtitle}>Group decisions at a glance.</p>
                </div>
                {canCreate && (
                    <button
                        type="button"
                        className={`btn btn-primary ${styles.newBtn}`}
                        onClick={() => setCreateOpen(true)}
                    >
                        <Plus size={16} /> New
                    </button>
                )}
            </div>

            {sorted.length === 0 ? (
                <div className={styles.empty}>
                    <Vote size={32} className={styles.emptyIcon} />
                    <h3 className={styles.emptyTitle}>No polls yet</h3>
                    <p className={styles.emptyText}>
                        Ask the group "where to eat?" or "bar after dinner?" — everyone gets a notification and can vote in seconds.
                    </p>
                    {canCreate && (
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setCreateOpen(true)}
                        >
                            Start a poll
                        </button>
                    )}
                </div>
            ) : (
                <div className={styles.list}>
                    {sorted.map(p => (
                        <div key={p.id} id={`poll-${p.id}`}>
                            <PollCard
                                poll={p}
                                tripId={activeTrip.id}
                                currentUid={appUser!.uid}
                                canManage={canManage(p)}
                                memberNames={memberNames}
                            />
                        </div>
                    ))}
                </div>
            )}

            {appUser && (
                <CreatePollModal
                    open={createOpen}
                    onClose={() => setCreateOpen(false)}
                    tripId={activeTrip.id}
                    tripMemberUids={activeTrip.members}
                    creatorUid={appUser.uid}
                    creatorName={appUser.name}
                    creatorAvatarUrl={appUser.avatarUrl}
                />
            )}
        </div>
    );
};
