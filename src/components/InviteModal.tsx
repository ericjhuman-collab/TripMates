import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Loader2, Check } from 'lucide-react';
import { useAuth, type AppUser } from '../context/AuthContext';
import {
    inviteUserToTrip,
    revokeTripInvite,
    getPendingInviteUidsForTrip,
    searchUsersForInvite,
    fetchUsersByUids,
} from '../services/tripInvites';
import { useToast } from './useToast';
import styles from './InviteModal.module.css';

interface Props {
    open: boolean;
    onClose: () => void;
    tripId: string;
    tripName: string;
    tripDestination?: string;
    members: string[];
}

const avatarFor = (u: AppUser) =>
    u.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.name || u.uid)}`;

export const InviteModal: React.FC<Props> = ({ open, onClose, tripId, tripName, tripDestination, members }) => {
    const { appUser } = useAuth();
    const toast = useToast();

    const [followingUsers, setFollowingUsers] = useState<AppUser[]>([]);
    const [pendingUids, setPendingUids] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<AppUser[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [busyUid, setBusyUid] = useState<string | null>(null);

    const memberSet = useMemo(() => new Set(members), [members]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const load = async () => {
            try {
                const [follows, pending] = await Promise.all([
                    appUser?.following?.length ? fetchUsersByUids(appUser.following) : Promise.resolve([] as AppUser[]),
                    getPendingInviteUidsForTrip(tripId),
                ]);
                if (cancelled) return;
                setFollowingUsers(follows.filter(u => !memberSet.has(u.uid)));
                setPendingUids(new Set(pending));
            } catch (e) {
                console.error('Failed to load invite modal data', e);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [open, tripId, appUser?.following, memberSet]);

    useEffect(() => {
        if (!open) {
            setSearchQuery('');
            setSearchResults([]);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(async () => {
            const trimmed = searchQuery.trim();
            if (trimmed.length < 2) {
                setSearchResults([]);
                return;
            }
            setIsSearching(true);
            try {
                const exclude = new Set<string>([...memberSet]);
                if (appUser?.uid) exclude.add(appUser.uid);
                const results = await searchUsersForInvite(trimmed, exclude, 10);
                setSearchResults(results);
            } catch (e) {
                console.error('Invite search failed', e);
            } finally {
                setIsSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, open, memberSet, appUser?.uid]);

    if (!open) return null;

    const handleInvite = async (target: AppUser) => {
        if (!appUser) return;
        setBusyUid(target.uid);
        try {
            await inviteUserToTrip({
                tripId,
                tripName,
                tripDestination,
                invitedUid: target.uid,
                invitedBy: appUser.uid,
                invitedByName: appUser.fullName || appUser.name || 'Someone',
            });
            setPendingUids(prev => {
                const next = new Set(prev);
                next.add(target.uid);
                return next;
            });
            toast.success(`Invited ${target.name}`);
        } catch (e) {
            console.error('Invite failed', e);
            toast.error('Could not send invite');
        } finally {
            setBusyUid(null);
        }
    };

    const handleRevoke = async (target: AppUser) => {
        setBusyUid(target.uid);
        try {
            await revokeTripInvite(tripId, target.uid);
            setPendingUids(prev => {
                const next = new Set(prev);
                next.delete(target.uid);
                return next;
            });
            toast.success('Invite revoked');
        } catch (e) {
            console.error('Revoke failed', e);
            toast.error('Could not revoke invite');
        } finally {
            setBusyUid(null);
        }
    };

    const renderRow = (u: AppUser) => {
        const alreadyMember = memberSet.has(u.uid);
        const alreadyInvited = pendingUids.has(u.uid);
        const busy = busyUid === u.uid;
        return (
            <div key={u.uid} className={styles.row}>
                <img src={avatarFor(u)} alt={u.name} className={styles.avatar} loading="lazy" />
                <div className={styles.rowMeta}>
                    <div className={styles.rowName}>{u.fullName || u.name}</div>
                    {u.username && <div className={styles.rowHandle}>@{u.username}</div>}
                </div>
                {alreadyMember ? (
                    <span className={styles.statusPill}>Member</span>
                ) : alreadyInvited ? (
                    <button
                        className={`${styles.actionBtn} ${styles.actionBtnGhost}`}
                        onClick={() => handleRevoke(u)}
                        disabled={busy}
                    >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : 'Cancel'}
                    </button>
                ) : (
                    <button
                        className={styles.actionBtn}
                        onClick={() => handleInvite(u)}
                        disabled={busy}
                    >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} /> Invite</>}
                    </button>
                )}
            </div>
        );
    };

    const showingSearch = searchQuery.trim().length >= 2;

    return createPortal(
        <div className={styles.backdrop} onClick={onClose}>
            <div className={styles.sheet} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Invite to {tripName}</h3>
                    <button className={styles.close} onClick={onClose} aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.searchWrap}>
                    <Search size={18} className={styles.searchIcon} />
                    <input
                        className={`input-field ${styles.searchInput}`}
                        placeholder="Search by name or username..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>

                <div className={styles.scrollArea}>
                    {showingSearch ? (
                        <>
                            <h4 className={styles.sectionLabel}>Results</h4>
                            {isSearching ? (
                                <div className={styles.spinnerWrap}>
                                    <Loader2 className="animate-spin" />
                                </div>
                            ) : searchResults.length === 0 ? (
                                <p className={styles.empty}>No users found.</p>
                            ) : (
                                searchResults.map(renderRow)
                            )}
                        </>
                    ) : (
                        <>
                            <h4 className={styles.sectionLabel}>People you follow</h4>
                            {followingUsers.length === 0 ? (
                                <p className={styles.empty}>
                                    You don't follow anyone yet. Search by name or username above.
                                </p>
                            ) : (
                                followingUsers.map(renderRow)
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};
