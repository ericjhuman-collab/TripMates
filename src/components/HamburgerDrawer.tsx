import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bell, Building2, Check, CheckSquare, Loader2, LogOut, Mail, Map as MapIcon, Settings, UserPlus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import { auth } from '../services/firebase';
import { followUser, getNotifications, markNotificationRead, type SocialNotification } from '../services/social';
import {
    acceptTripInvite,
    declineTripInvite,
    subscribeToPendingInvites,
    type TripInvite,
} from '../services/tripInvites';
import { useToast } from './useToast';
import styles from '../pages/Profile.module.css';

interface HamburgerDrawerProps {
    open: boolean;
    onClose: () => void;
    onUnreadCountChange?: (count: number) => void;
}

/**
 * Side drawer that lives at the app shell level (Layout) so it can open
 * over any page without redirecting through /profile. Lifted out of
 * Profile.tsx because closing the menu from /trip used to dump the user
 * back at the profile root.
 */
export const HamburgerDrawer: React.FC<HamburgerDrawerProps> = ({ open, onClose, onUnreadCountChange }) => {
    const { appUser, currentUser, refreshAppUser, logoutMock } = useAuth();
    const { switchTrip } = useTrip();
    const toast = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [notifications, setNotifications] = useState<SocialNotification[]>([]);
    const [invites, setInvites] = useState<TripInvite[]>([]);
    const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
    const [showNotifications, setShowNotifications] = useState(false);

    // Pending trip invites count toward the badge — they're actionable
    // and we want the bell to flash until the user joins or declines.
    const unreadCount = notifications.filter(n => !n.read).length + invites.length;
    const currentTab = location.pathname.startsWith('/profile') ? searchParams.get('tab') : null;

    useEffect(() => {
        if (!appUser) return;
        getNotifications(appUser.uid).then(setNotifications).catch(console.error);
    }, [appUser]);

    useEffect(() => {
        if (!currentUser?.uid) return;
        const unsub = subscribeToPendingInvites(currentUser.uid, setInvites);
        return () => unsub();
    }, [currentUser?.uid]);

    useEffect(() => {
        onUnreadCountChange?.(unreadCount);
    }, [unreadCount, onUnreadCountChange]);

    const closeAll = () => {
        onClose();
        setShowNotifications(false);
    };

    const goToTab = (tab: string) => {
        navigate(`/profile?tab=${tab}`);
        closeAll();
    };

    const handleLogout = () => {
        logoutMock();
        auth.signOut();
        navigate('/login');
        closeAll();
    };

    const handleFollowBack = async (fromUid: string, notifId: string) => {
        if (!appUser) return;
        await followUser(appUser.uid, fromUid, appUser.name, appUser.avatarUrl);
        await markNotificationRead(appUser.uid, notifId);
        setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
        await refreshAppUser();
    };

    const handleAcceptInvite = async (inv: TripInvite) => {
        if (!currentUser) return;
        setBusyInviteId(inv.id);
        try {
            await acceptTripInvite(inv, currentUser.uid);
            await refreshAppUser();
            await switchTrip(inv.tripId);
            toast.success(`Joined ${inv.tripName}`);
            closeAll();
        } catch (e) {
            console.error('Accept invite failed', e);
            const err = e as { code?: string; message?: string };
            const detail = err?.code || err?.message || 'unknown error';
            toast.error(`Could not join trip (${detail})`);
        } finally {
            setBusyInviteId(null);
        }
    };

    const handleDeclineInvite = async (inv: TripInvite) => {
        setBusyInviteId(inv.id);
        try {
            await declineTripInvite(inv);
            toast.success('Invite declined');
        } catch (e) {
            console.error('Decline invite failed', e);
            toast.error('Could not decline invite');
        } finally {
            setBusyInviteId(null);
        }
    };

    if (!open) return null;

    return createPortal(
        <div className={styles.drawerOverlay} onClick={closeAll}>
            <div className={styles.drawer} onClick={e => e.stopPropagation()}>
                {!showNotifications ? (
                    <>
                        <div className={styles.drawerHeader}>
                            <h3 className={styles.drawerTitle}>Menu</h3>
                            <button className={styles.drawerCloseBtn} onClick={closeAll} aria-label="Close menu"><X size={20} /></button>
                        </div>
                        <div className={styles.drawerList}>
                            <button className={styles.drawerItem} onClick={() => setShowNotifications(true)}>
                                <span className={styles.drawerItemIcon}><Bell size={18} /></span>
                                <span className={styles.drawerItemLabel}>Notifications</span>
                                {unreadCount > 0 && <span className={styles.drawerItemBadge}>{unreadCount}</span>}
                            </button>
                        </div>

                        <div className={styles.drawerDivider} />
                        <div className={styles.drawerHeader} style={{ padding: '0.5rem 0.75rem' }}>
                            <h3 className={styles.drawerTitle}>Account</h3>
                        </div>
                        <div className={styles.drawerList}>
                            <button
                                className={`${styles.drawerItem} ${currentTab === 'admin' ? styles.drawerItemActive : ''}`}
                                onClick={() => goToTab('admin')}
                            >
                                <span className={styles.drawerItemIcon}><MapIcon size={18} /></span>
                                <span className={styles.drawerItemLabel}>My Trips</span>
                            </button>
                            <button
                                className={`${styles.drawerItem} ${currentTab === 'myActivities' ? styles.drawerItemActive : ''}`}
                                onClick={() => goToTab('myActivities')}
                            >
                                <span className={styles.drawerItemIcon}><CheckSquare size={18} /></span>
                                <span className={styles.drawerItemLabel}>My Locations</span>
                            </button>
                            <button
                                className={`${styles.drawerItem} ${currentTab === 'network' ? styles.drawerItemActive : ''}`}
                                onClick={() => goToTab('network')}
                            >
                                <span className={styles.drawerItemIcon}><UserPlus size={18} /></span>
                                <span className={styles.drawerItemLabel}>Network</span>
                            </button>
                            <button
                                className={`${styles.drawerItem} ${currentTab === 'settings' ? styles.drawerItemActive : ''}`}
                                onClick={() => goToTab('settings')}
                            >
                                <span className={styles.drawerItemIcon}><Settings size={18} /></span>
                                <span className={styles.drawerItemLabel}>Settings</span>
                            </button>
                        </div>

                        <div className={styles.drawerDivider} />
                        <div className={styles.drawerList}>
                            <button
                                className={`${styles.drawerItem} ${currentTab === 'businessDashboard' ? styles.drawerItemActive : ''}`}
                                onClick={() => goToTab('businessDashboard')}
                            >
                                <span className={styles.drawerItemIcon}><Building2 size={18} /></span>
                                <span className={styles.drawerItemLabel}>
                                    {appUser?.managedBusinessIds?.length ? 'Business Partner HQ' : 'Register as Business Partner'}
                                </span>
                            </button>
                        </div>

                        <div className={styles.drawerDivider} />
                        <div className={styles.drawerList}>
                            <button className={`${styles.drawerItem} ${styles.drawerItemDanger}`} onClick={handleLogout}>
                                <span className={styles.drawerItemIcon}><LogOut size={18} /></span>
                                <span className={styles.drawerItemLabel}>Log Out</span>
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className={styles.drawerHeader}>
                            <button
                                className={styles.drawerBackBtn}
                                onClick={() => setShowNotifications(false)}
                                title="Back to menu"
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <h3 className={styles.drawerTitle}>Notifications</h3>
                            <button className={styles.drawerCloseBtn} onClick={closeAll} aria-label="Close menu"><X size={20} /></button>
                        </div>
                        <div className={styles.drawerList}>
                            {invites.length === 0 && notifications.length === 0 && (
                                <p className={styles.notifEmpty}>No notifications yet.</p>
                            )}

                            {/* Pending trip invites — actionable, shown above
                                follow notifications. Accept switches the user
                                onto the trip and closes the drawer. */}
                            {invites.map(inv => {
                                const busy = busyInviteId === inv.id;
                                return (
                                    <div key={inv.id} className={`${styles.notifItem} ${styles.notifItemUnread}`}>
                                        <div className={styles.notifAvatarPlaceholder}>
                                            <Mail size={16} />
                                        </div>
                                        <div className={styles.notifMeta}>
                                            <span className={styles.notifText}>
                                                <strong>{inv.invitedByName}</strong> invited you to {inv.tripName}
                                            </span>
                                            <span className={styles.notifTime}>
                                                {inv.tripDestination || new Date(inv.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                                            <button
                                                className={styles.followBackBtn}
                                                onClick={() => handleAcceptInvite(inv)}
                                                disabled={busy}
                                                title="Join trip"
                                            >
                                                {busy ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} /> Join</>}
                                            </button>
                                            <button
                                                className={styles.followBackBtn}
                                                onClick={() => handleDeclineInvite(inv)}
                                                disabled={busy}
                                                title="Decline invite"
                                                style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}

                            {notifications.map(n => (
                                <div key={n.id} className={`${styles.notifItem} ${!n.read ? styles.notifItemUnread : ''}`}>
                                    {n.fromAvatarUrl
                                        ? <img src={n.fromAvatarUrl} className={styles.notifAvatar} alt={n.fromName} loading="lazy" />
                                        : <div className={styles.notifAvatarPlaceholder}>{n.fromName.charAt(0).toUpperCase()}</div>
                                    }
                                    <div className={styles.notifMeta}>
                                        <span className={styles.notifText}><strong>{n.fromName}</strong> started following you</span>
                                        <span className={styles.notifTime}>{new Date(n.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    {!((appUser?.following || []).includes(n.fromUid)) && (
                                        <button
                                            className={styles.followBackBtn}
                                            onClick={() => handleFollowBack(n.fromUid, n.id)}
                                        >
                                            Follow back
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body,
    );
};
