import React, { useState } from 'react';
import { Mail, RefreshCw, X } from 'lucide-react';
import { sendEmailVerification, reload } from 'firebase/auth';
import { auth } from '../services/firebase';
import styles from './EmailVerificationBanner.module.css';

export const EmailVerificationBanner: React.FC = () => {
    const [dismissed, setDismissed] = useState(false);
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState('');

    const user = auth.currentUser;
    if (!user || user.emailVerified || dismissed) return null;

    const handleResend = async () => {
        setError('');
        setSent(false);
        setSending(true);
        try {
            await sendEmailVerification(user);
            setSent(true);
        } catch (e) {
            console.error('Resend verification failed', e);
            setError('Kunde inte skicka mailet. Försök igen om en stund.');
        } finally {
            setSending(false);
        }
    };

    const handleCheckStatus = async () => {
        setError('');
        setChecking(true);
        try {
            await reload(user);
            if (user.emailVerified) {
                // Force a refresh so the banner unmounts and any feature
                // gates re-evaluate against the new verified status.
                window.location.reload();
            } else {
                setError('Inte verifierat ännu — klicka på länken i mailet och försök igen.');
            }
        } catch (e) {
            console.error('Reload user failed', e);
            setError('Kunde inte kontrollera status just nu.');
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className={styles.banner} role="status">
            <Mail size={18} className={styles.icon} />
            <div className={styles.text}>
                <strong>Verifiera din e-post.</strong>{' '}
                Vi skickade ett mail till <span className={styles.email}>{user.email}</span>.
                {sent && <span className={styles.sentNote}> Mail skickat.</span>}
                {error && <span className={styles.errorNote}> {error}</span>}
            </div>
            <div className={styles.actions}>
                <button
                    className={styles.actionBtn}
                    onClick={handleCheckStatus}
                    disabled={checking}
                    title="Jag har verifierat — uppdatera"
                >
                    <RefreshCw size={14} className={checking ? styles.spinning : ''} />
                    Jag har verifierat
                </button>
                <button
                    className={styles.actionBtn}
                    onClick={handleResend}
                    disabled={sending}
                >
                    {sending ? 'Skickar…' : 'Skicka nytt mail'}
                </button>
                <button
                    className={styles.dismissBtn}
                    onClick={() => setDismissed(true)}
                    title="Dölj tills nästa sidladdning"
                    aria-label="Dölj banner"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};
