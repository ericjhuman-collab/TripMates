import React, { useEffect, useState } from 'react';
import { Mail, Check, X, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import {
    subscribeToPendingInvites,
    acceptTripInvite,
    declineTripInvite,
    type TripInvite,
} from '../services/tripInvites';
import { useToast } from './useToast';
import styles from './PendingInvitesBanner.module.css';

export const PendingInvitesBanner: React.FC = () => {
    const { currentUser, refreshAppUser } = useAuth();
    const { switchTrip } = useTrip();
    const toast = useToast();

    const [invites, setInvites] = useState<TripInvite[]>([]);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        if (!currentUser?.uid) return;
        const unsub = subscribeToPendingInvites(currentUser.uid, setInvites);
        return () => unsub();
    }, [currentUser?.uid]);

    if (!currentUser || invites.length === 0) return null;

    const handleAccept = async (inv: TripInvite) => {
        setBusyId(inv.id);
        try {
            await acceptTripInvite(inv, currentUser.uid);
            await refreshAppUser();
            await switchTrip(inv.tripId);
            toast.success(`Joined ${inv.tripName}`);
        } catch (e) {
            console.error('Accept invite failed', e);
            toast.error('Could not join trip');
        } finally {
            setBusyId(null);
        }
    };

    const handleDecline = async (inv: TripInvite) => {
        setBusyId(inv.id);
        try {
            await declineTripInvite(inv);
            toast.success('Invite declined');
        } catch (e) {
            console.error('Decline invite failed', e);
            toast.error('Could not decline invite');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className={styles.wrap}>
            {invites.map(inv => {
                const busy = busyId === inv.id;
                return (
                    <div key={inv.id} className={styles.card}>
                        <div className={styles.icon}>
                            <Mail size={18} />
                        </div>
                        <div className={styles.text}>
                            <div className={styles.title}>
                                {inv.invitedByName} invited you to {inv.tripName}
                            </div>
                            {inv.tripDestination && (
                                <div className={styles.sub}>{inv.tripDestination}</div>
                            )}
                        </div>
                        <div className={styles.actions}>
                            <button
                                onClick={() => handleAccept(inv)}
                                disabled={busy}
                                className={styles.acceptBtn}
                            >
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} /> Join</>}
                            </button>
                            <button
                                onClick={() => handleDecline(inv)}
                                disabled={busy}
                                className={styles.declineBtn}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
