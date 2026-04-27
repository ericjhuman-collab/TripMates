import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Info } from 'lucide-react';
import { auth, db } from '../services/firebase';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    sendEmailVerification,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { deriveUserSearchFields } from '../utils/searchFields';
import { generateAndClaimUsername } from '../services/username';
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
                return 'An account with this email already exists. Try signing in instead.';
            case 'auth/weak-password':
                return 'Password is too weak.';
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

// ── Password rules ────────────────────────────────────────────────────────
const passwordRules = (pw: string) => ({
    longEnough: pw.length >= 8,
    hasLetter: /[A-Za-z]/.test(pw),
    hasNumber: /\d/.test(pw),
});
const passwordValid = (pw: string) => {
    const r = passwordRules(pw);
    return r.longEnough && r.hasLetter && r.hasNumber;
};

// ── Static option lists ───────────────────────────────────────────────────
const LANGUAGES: { code: 'sv' | 'en'; label: string }[] = [
    { code: 'sv', label: 'Svenska' },
    { code: 'en', label: 'English' },
];

const COUNTRIES: { code: string; label: string }[] = [
    { code: 'SE', label: 'Sverige' },
    { code: 'NO', label: 'Norge' },
    { code: 'DK', label: 'Danmark' },
    { code: 'FI', label: 'Finland' },
    { code: 'GB', label: 'United Kingdom' },
    { code: 'DE', label: 'Deutschland' },
    { code: 'FR', label: 'France' },
    { code: 'ES', label: 'España' },
    { code: 'IT', label: 'Italia' },
    { code: 'NL', label: 'Nederland' },
    { code: 'US', label: 'United States' },
    { code: 'OTHER', label: 'Other' },
];

// Detect a sensible default language from browser settings.
const detectLanguage = (): 'sv' | 'en' => {
    const lang = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase();
    return lang.startsWith('sv') ? 'sv' : 'en';
};

export const Login: React.FC = () => {
    const [mode, setMode] = useState<Mode>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [language, setLanguage] = useState<'sv' | 'en'>(detectLanguage());
    const [country, setCountry] = useState('SE');
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [showPhoneInfo, setShowPhoneInfo] = useState(false);

    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || '/';

    const pwRules = useMemo(() => passwordRules(password), [password]);
    const passwordsMatch = password.length > 0 && password === passwordConfirm;

    // ── Per-field error tracking + refs for auto-focus ────────────────────
    type FieldName = 'firstName' | 'lastName' | 'email' | 'password' | 'passwordConfirm' | 'terms';
    const [fieldErrors, setFieldErrors] = useState<Set<FieldName>>(new Set());
    const refs = {
        firstName: useRef<HTMLInputElement>(null),
        lastName: useRef<HTMLInputElement>(null),
        email: useRef<HTMLInputElement>(null),
        password: useRef<HTMLInputElement>(null),
        passwordConfirm: useRef<HTMLInputElement>(null),
        terms: useRef<HTMLInputElement>(null),
    };
    const clearFieldError = (name: FieldName) => {
        setFieldErrors(prev => {
            if (!prev.has(name)) return prev;
            const next = new Set(prev);
            next.delete(name);
            return next;
        });
    };
    const fieldClass = (name: FieldName, base = 'input-field') =>
        fieldErrors.has(name) ? `${base} ${styles.invalid}` : base;

    const switchMode = (next: Mode) => {
        setMode(next);
        setError('');
        setInfo('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setInfo('');

        if (mode === 'signup') {
            const errs = new Set<FieldName>();
            if (!firstName.trim()) errs.add('firstName');
            if (!lastName.trim()) errs.add('lastName');
            if (!email.trim()) errs.add('email');
            if (!passwordValid(password)) errs.add('password');
            if (password !== passwordConfirm) errs.add('passwordConfirm');
            if (!agreedToTerms) errs.add('terms');

            if (errs.size > 0) {
                setFieldErrors(errs);
                // Surface a top-level summary so it's clear what's missing.
                if (errs.has('firstName') || errs.has('lastName') || errs.has('email')) {
                    setError('Please fill in all required fields.');
                } else if (errs.has('password')) {
                    setError('Password must be at least 8 characters and contain a letter and a number.');
                } else if (errs.has('passwordConfirm')) {
                    setError('Passwords do not match.');
                } else if (errs.has('terms')) {
                    setError('You must accept the Terms and Privacy Policy to create an account.');
                }
                // Focus the first invalid field in display order.
                const order: FieldName[] = ['firstName', 'lastName', 'email', 'password', 'passwordConfirm', 'terms'];
                const first = order.find(n => errs.has(n));
                if (first) {
                    refs[first].current?.focus();
                    refs[first].current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
            }
        }

        setLoading(true);
        try {
            if (mode === 'reset') {
                await sendPasswordResetEmail(auth, email);
                setInfo('Password reset email sent. Check your inbox.');
                setMode('signin');
            } else if (mode === 'signup') {
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                // Fire-and-forget verification email. Failure (e.g. quota) is
                // non-fatal; the in-app banner has a Resend button so users
                // can recover.
                sendEmailVerification(cred.user).catch(e => {
                    console.error('Failed to send verification email', e);
                });
                const first = firstName.trim();
                const last = lastName.trim();
                const trimmedPhone = phoneNumber.trim();
                await setDoc(
                    doc(db, 'users', cred.user.uid),
                    {
                        uid: cred.user.uid,
                        firstName: first,
                        lastName: last,
                        name: first,
                        fullName: `${first} ${last}`,
                        role: 'user',
                        hasAgreed: true,
                        language,
                        country,
                        trips: [],
                        activeTripId: null,
                        friends: [],
                        ...deriveUserSearchFields({ name: first, lastName: last }),
                    },
                    { merge: true },
                );
                if (trimmedPhone) {
                    const { setOwnPhoneNumber } = await import('../services/userContact');
                    await setOwnPhoneNumber(cred.user.uid, trimmedPhone);
                }
                // Auto-generate a unique username from first name. Failure here is non-fatal —
                // user can set one manually in Profile if this falls through.
                try {
                    await generateAndClaimUsername(cred.user.uid, first, email);
                } catch (e) {
                    console.error('Username auto-generation failed (non-fatal)', e);
                }
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
        mode === 'signup' ? 'Create account'
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
                        <>
                            <div className={styles.row}>
                                <input
                                    ref={refs.firstName}
                                    type="text"
                                    placeholder="First name"
                                    className={fieldClass('firstName')}
                                    value={firstName}
                                    onChange={e => { setFirstName(e.target.value); clearFieldError('firstName'); }}
                                    autoComplete="given-name"
                                />
                                <input
                                    ref={refs.lastName}
                                    type="text"
                                    placeholder="Last name"
                                    className={fieldClass('lastName')}
                                    value={lastName}
                                    onChange={e => { setLastName(e.target.value); clearFieldError('lastName'); }}
                                    autoComplete="family-name"
                                />
                            </div>
                        </>
                    )}

                    <input
                        ref={refs.email}
                        type="email"
                        placeholder="Email"
                        className={mode === 'signup' ? fieldClass('email') : 'input-field'}
                        required={mode !== 'signup'}
                        value={email}
                        onChange={e => { setEmail(e.target.value); clearFieldError('email'); }}
                        autoComplete="email"
                    />

                    {mode !== 'reset' && (
                        <input
                            ref={refs.password}
                            type="password"
                            placeholder="Password"
                            className={mode === 'signup' ? fieldClass('password') : 'input-field'}
                            required={mode !== 'signup'}
                            value={password}
                            onChange={e => { setPassword(e.target.value); clearFieldError('password'); }}
                            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        />
                    )}

                    {mode === 'signup' && (
                        <>
                            <input
                                ref={refs.passwordConfirm}
                                type="password"
                                placeholder="Confirm password"
                                className={fieldClass('passwordConfirm')}
                                value={passwordConfirm}
                                onChange={e => { setPasswordConfirm(e.target.value); clearFieldError('passwordConfirm'); }}
                                autoComplete="new-password"
                            />

                            {/* Live password rule feedback */}
                            <ul className={styles.pwRules}>
                                <li className={pwRules.longEnough ? styles.ruleMet : styles.ruleUnmet}>
                                    At least 8 characters
                                </li>
                                <li className={pwRules.hasLetter ? styles.ruleMet : styles.ruleUnmet}>
                                    Contains a letter
                                </li>
                                <li className={pwRules.hasNumber ? styles.ruleMet : styles.ruleUnmet}>
                                    Contains a number
                                </li>
                                <li className={passwordsMatch ? styles.ruleMet : styles.ruleUnmet}>
                                    Passwords match
                                </li>
                            </ul>

                            <div className={styles.fieldWithInfo}>
                                <input
                                    type="tel"
                                    placeholder="Phone number (optional)"
                                    className="input-field"
                                    value={phoneNumber}
                                    onChange={e => setPhoneNumber(e.target.value)}
                                    autoComplete="tel"
                                />
                                <button
                                    type="button"
                                    className={styles.infoButton}
                                    onClick={() => setShowPhoneInfo(v => !v)}
                                    aria-label="What is this for?"
                                    aria-expanded={showPhoneInfo}
                                >
                                    <Info size={18} />
                                </button>
                            </div>
                            {showPhoneInfo && (
                                <div className={styles.fieldHelpBox}>
                                    Your phone number is shared with members of trips you join, so they
                                    can reach you. You can hide it at any time in <strong>Settings</strong>.
                                </div>
                            )}

                            <div className={styles.selectRow}>
                                <label className={styles.selectLabel}>
                                    Country
                                    <select
                                        className={styles.select}
                                        value={country}
                                        onChange={e => setCountry(e.target.value)}
                                    >
                                        {COUNTRIES.map(c => (
                                            <option key={c.code} value={c.code}>{c.label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className={styles.selectLabel}>
                                    Language
                                    <select
                                        className={styles.select}
                                        value={language}
                                        onChange={e => setLanguage(e.target.value as 'sv' | 'en')}
                                    >
                                        {LANGUAGES.map(l => (
                                            <option key={l.code} value={l.code}>{l.label}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            <label className={`${styles.termsLabel} ${fieldErrors.has('terms') ? styles.termsLabelInvalid : ''}`}>
                                <input
                                    ref={refs.terms}
                                    type="checkbox"
                                    checked={agreedToTerms}
                                    onChange={e => { setAgreedToTerms(e.target.checked); clearFieldError('terms'); }}
                                />
                                <span>
                                    I agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a>
                                    {' '}and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
                                </span>
                            </label>
                        </>
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
