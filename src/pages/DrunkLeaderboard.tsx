import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../services/firebase';
import { getAllActivities, type Activity } from '../services/activities';
import { getAllMemberPrefs } from '../services/memberPrefs';
import { Beer, Trophy, Medal, Trash2 } from 'lucide-react';
import { useAuth, type AppUser } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import styles from './DrunkLeaderboard.module.css';

export const DrunkLeaderboard: React.FC = () => {
    const { effectiveRole } = useAuth();
    const { activeTrip } = useTrip();
    const isAdmin = effectiveRole === 'admin';
    const [users, setUsers] = useState<AppUser[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [hiddenUids, setHiddenUids] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const usersSnapshot = await getDocs(collection(db, 'users'));
                const usersList = usersSnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as AppUser));
                setUsers(usersList);

                if (activeTrip) {
                    const [activitiesList, prefsMap] = await Promise.all([
                        getAllActivities(activeTrip.id),
                        getAllMemberPrefs(activeTrip.id),
                    ]);
                    setActivities(activitiesList);
                    // Members who explicitly opted out of being shown on leaderboards.
                    const hidden = new Set<string>();
                    prefsMap.forEach((p, uid) => {
                        if (p.showOnLeaderboard === false) hidden.add(uid);
                    });
                    setHiddenUids(hidden);
                } else {
                    setActivities([]);
                    setHiddenUids(new Set());
                }
            } catch (error) {
                console.error('Error fetching leaderboard data:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTrip?.id]);

    if (loading) {
        return (
            <div className={styles.loadingWrapper}>
                <Beer style={{ animation: 'bounce 1s infinite' }} />
                <span className={styles.loadingText}>Tallying votes...</span>
            </div>
        );
    }

    const voteCounts: Record<string, number> = {};
    users.forEach(u => voteCounts[u.uid] = 0);

    activities.forEach(activity => {
        const totalMembers = users.length;
        const totalVotes = activity.votes ? Object.keys(activity.votes).length : 0;
        const isVotingClosed = activity.votingClosed || (totalMembers > 0 && totalVotes >= totalMembers);

        if (activity.votes && isVotingClosed) {
            Object.values(activity.votes).forEach(votedUserId => {
                if (voteCounts[votedUserId] !== undefined) {
                    voteCounts[votedUserId]++;
                } else {
                    voteCounts[votedUserId] = 1;
                }
            });
        }
    });

    const leaderboard = users
        .filter(user => !hiddenUids.has(user.uid))
        .map(user => ({
            ...user,
            votes: voteCounts[user.uid] || 0
        }))
        .sort((a, b) => b.votes - a.votes);

    const handleReset = async () => {
        if (!isAdmin) return;
        const confirm = window.confirm('Are you sure you want to reset the entire leaderboard? This will permanently delete everyone\'s votes for all activities.');
        if (!confirm) return;

        setLoading(true);
        try {
            const updatePromises = activities.map(async (activity) => {
                if (activity.votes && Object.keys(activity.votes).length > 0) {
                    const actRef = doc(db, 'activities', activity.id!);
                    await updateDoc(actRef, { votes: deleteField() });
                }
            });
            await Promise.all(updatePromises);
            setActivities(prev => prev.map(a => ({ ...a, votes: {} })));
            alert('Leaderboard has been reset.');
        } catch (error) {
            console.error('Error resetting leaderboard:', error);
            alert('Failed to reset leaderboard.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`animate-fade-in ${styles.page}`}>
            <div className={styles.pageHeader}>
                <div className={styles.titleRow}>
                    <h2 className={styles.pageTitle}>Drunk Leaderboard</h2>
                </div>
                {isAdmin && (
                    <button onClick={handleReset} className={`btn-icon ${styles.resetBtn}`} title="Reset Leaderboard" aria-label="Reset Leaderboard">
                        <Trash2 size={24} />
                    </button>
                )}
            </div>

            <p className={styles.description}>
                Who has been the drunkest during the trip? Votes are tallied from every completed activity!
            </p>

            <div className={styles.list}>
                {leaderboard.map((user, index) => {
                    let rankColor = 'var(--color-text-muted)';
                    let rankIcon = null;
                    let avatarClass = styles.avatarDefault;
                    let rowClass = styles.userRowDefault;

                    if (user.votes > 0) {
                        if (index === 0) {
                            rankColor = '#fbbf24';
                            rankIcon = <Trophy size={20} color={rankColor} />;
                            avatarClass = styles.avatarGold;
                            rowClass = styles.userRowGold;
                        } else if (index === 1) {
                            rankColor = '#9ca3af';
                            rankIcon = <Medal size={20} color={rankColor} />;
                            avatarClass = styles.avatarSilver;
                        } else if (index === 2) {
                            rankColor = '#b45309';
                            rankIcon = <Medal size={20} color={rankColor} />;
                            avatarClass = styles.avatarBronze;
                        }
                    }

                    return (
                        <div key={user.uid} className={`${styles.userRow} ${rowClass}`}>
                            <div className={styles.leftGroup}>
                                <div className={styles.rank} style={{ color: rankColor }}>
                                    #{index + 1}
                                </div>
                                <img
                                    src={user.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`}
                                    alt={user.name}
                                    className={`${styles.avatar} ${avatarClass}`} loading="lazy" />
                                <div>
                                    <div className={styles.userName}>{user.name}</div>
                                </div>
                            </div>

                            <div className={`${styles.voteBadge} ${index === 0 && user.votes > 0 ? styles.voteBadgeGold : styles.voteBadgeDefault}`}>
                                {rankIcon}
                                <span>{user.votes} {user.votes === 1 ? 'vote' : 'votes'}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
