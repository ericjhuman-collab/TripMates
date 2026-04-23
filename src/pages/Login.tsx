import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../services/firebase';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import styles from './Login.module.css';

type Mode = 'signin' | 'signup' | 'reset';

const friendlyError = (err: unknown): string => {
    if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: string }).code;
        switch (code) {
            case 'auth/invalid-credential':
            case 'auth/wrong-password':
            case 'auth/user-not-found':
                return 'Wrong email or password.';
            case 'auth/email-already-in-use':
                return 'An account with this email already exists.';
            case 'auth/weak-password':
                return 'Password must be at least 6 characters.';
            case 'auth/invalid-email':
                return "That doesn't look like a valid email address.";
            case 'auth/too-many-requests':
                return 'Too many attempts. Please try again later.';
            case 'auth/network-request-failed':
                return 'Network error. Check your connection.';
        }
    }
    return err instanceof Error ? err.message : 'Something went wrong.';
};

export const Login: React.FC = () => {
    const [mode, setMode] = useState<Mode>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || '/';

    const switchMode = (next: Mode) => {
        setMode(next);
        setError('');
        setInfo('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setInfo('');
        setLoading(true);
        try {
            if (mode === 'reset') {
                await sendPasswordResetEmail(auth, email);
                setInfo('Password reset email sent. Check your inbox.');
                setMode('signin');
            } else if (mode === 'signup') {
                if (!fullName.trim()) {
                    setError('Please enter your name.');
                    return;
                }
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(
                    doc(db, 'users', cred.user.uid),
                    { fullName: fullName.trim() },
                    { merge: true },
                );
                navigate(from, { replace: true });
            } else {
                await signInWithEmailAndPassword(auth, email, password);
                navigate(from, { replace: true });
            }
        } catch (err: unknown) {
            setError(friendlyError(err));
        } finally {
            setLoading(false);
        }
    };

    const submitLabel =
        mode === 'signup' ? 'Sign up'
        : mode === 'reset' ? 'Send reset email'
        : 'Log in';

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <h1 className={styles.title}>TripMates</h1>

                {error && <div className={styles.errorBox}>{error}</div>}
                {info && <div className={styles.infoBox}>{info}</div>}

                <form onSubmit={handleSubmit} className={styles.form}>
                    {mode === 'signup' && (
                        <input
                            type="text"
                            placeholder="Name"
                            className="input-field"
                            required
                            value={fullName}
                            onChange={e => setFullName(e.target.value)}
                            autoComplete="name"
                        />
                    )}
                    <input
                        type="email"
                        placeholder="Email"
                        className="input-field"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        autoComplete="email"
                    />
                    {mode !== 'reset' && (
                        <input
                            type="password"
                            placeholder="Password"
                            className="input-field"
                            required
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        />
                    )}
                    <button
                        type="submit"
                        disabled={loading}
                        className={`btn btn-primary ${styles.submitButton}`}
                    >
                        {loading ? 'Please wait…' : submitLabel}
                    </button>
                </form>

                <div className={styles.links}>
                    {mode === 'signin' && (
                        <>
                            <button type="button" onClick={() => switchMode('signup')} className={styles.link}>
                                Don&apos;t have an account? <strong>Sign up</strong>
                            </button>
                            <button type="button" onClick={() => switchMode('reset')} className={styles.link}>
                                Forgot password?
                            </button>
                        </>
                    )}
                    {mode === 'signup' && (
                        <button type="button" onClick={() => switchMode('signin')} className={styles.link}>
                            Already have an account? <strong>Log in</strong>
                        </button>
                    )}
                    {mode === 'reset' && (
                        <button type="button" onClick={() => switchMode('signin')} className={styles.link}>
                            Back to log in
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
