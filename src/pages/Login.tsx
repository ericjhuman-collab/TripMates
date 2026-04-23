import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '../services/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import styles from './Login.module.css';

const avatars = [
    { id: 'simon', url: '/Simon.jpeg', label: 'Simon' },
    { id: 'adam', url: '/Adam.jpeg', label: 'Adam' },
    { id: 'andreas', url: '/Andreas.jpeg', label: 'Andreas' },
    { id: 'charlie', url: '/Charlie.png', label: 'Charlie' },
    { id: 'daniel', url: '/Daniel.jpeg', label: 'Daniel' },
    { id: 'eric', url: '/Eric.png', label: 'Eric' },
    { id: 'oscar', url: '/Oscar.png', label: 'Oscar' }
];

const BackIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
    </svg>
);

export const Login: React.FC = () => {
    const [isSignUP, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || '/';

    const [selectedAvatar, setSelectedAvatar] = useState('/Simon.jpeg');
    const [takenAvatars, setTakenAvatars] = useState<string[]>([]);

    useEffect(() => {
        if (!isSignUP) return;
        const fetchTakenAvatars = async () => {
            try {
                const snapshot = await getDocs(collection(db, 'users'));
                const avatarsInUse: string[] = [];
                snapshot.forEach(d => {
                    const data = d.data();
                    if (data.avatarUrl) avatarsInUse.push(data.avatarUrl);
                });
                setTakenAvatars(avatarsInUse);
            } catch (err) {
                console.error('Error fetching taken avatars:', err);
            }
        };
        fetchTakenAvatars();
    }, [isSignUP]);

    useEffect(() => {
        if (!isSignUP) return;
        const nameLower = fullName.toLowerCase();
        const matchedAvatar = avatars.find(a => nameLower.includes(a.id));
        if (matchedAvatar && !takenAvatars.includes(matchedAvatar.url)) {
            setSelectedAvatar(matchedAvatar.url);
        }
    }, [fullName, isSignUP, takenAvatars]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isSignUP) {
                if (!fullName.trim()) {
                    setError('Please enter your full name.');
                    setLoading(false);
                    return;
                }
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, 'users', cred.user.uid), {
                    fullName: fullName.trim(),
                    avatarUrl: selectedAvatar
                }, { merge: true });
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
            navigate(from, { replace: true });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={`card glass-panel animate-fade-in ${styles.card}`}>
                {isSignUP && (
                    <button
                        type="button"
                        onClick={() => setIsSignUp(false)}
                        className={styles.backButton}
                        title="Go back to login"
                    >
                        <BackIcon />
                    </button>
                )}

                <h1 className={styles.title}>TripMates</h1>
                <p className={styles.subtitle}>Your Trip Companion</p>

                {error && <div className={styles.errorBox}>{error}</div>}

                <form onSubmit={handleAuth} className={styles.form}>
                    {isSignUP && (
                        <>
                            <input
                                type="text"
                                placeholder="Full Name (e.g. John Doe)"
                                className="input-field"
                                required
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                            />
                            <div className={styles.avatarSectionWrapper}>
                                <label className={styles.avatarLabel}>Select Profile Avatar</label>
                                <div className={styles.avatarGroup}>
                                    {avatars.map((avatar) => {
                                        const isTaken = takenAvatars.includes(avatar.url);
                                        const isSelected = selectedAvatar === avatar.url;
                                        return (
                                            <div
                                                key={avatar.id}
                                                onClick={() => { if (!isTaken) setSelectedAvatar(avatar.url); }}
                                                className={[
                                                    styles.avatarItem,
                                                    isTaken ? styles.avatarItemTaken : styles.avatarItemSelectable,
                                                    isSelected ? styles.avatarItemSelected : styles.avatarItemUnselected
                                                ].join(' ')}
                                                title={isTaken ? `${avatar.label} (Taken)` : avatar.label}
                                            >
                                                <img src={avatar.url} alt={avatar.label} className={styles.avatarImg} />
                                                {isTaken && (
                                                    <div className={styles.avatarTakenOverlay}>
                                                        <span className={styles.avatarTakenX}>✕</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}

                    <input
                        type="email"
                        placeholder="Email Address"
                        className="input-field"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        className="input-field"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <button type="submit" disabled={loading} className={`btn btn-primary ${styles.submitButton}`}>
                        {loading ? 'Processing...' : isSignUP ? 'Sign Up' : 'Log In'}
                    </button>
                </form>

                {!isSignUP && (
                    <button
                        type="button"
                        onClick={() => setIsSignUp(true)}
                        className={styles.signupLink}
                    >
                        Need an account? Sign Up
                    </button>
                )}
                
                {import.meta.env.DEV && (
                    <button 
                        type="button" 
                        onClick={async () => {
                            try {
                                setLoading(true);
                                // A common local testing strategy is using a dedicated test account
                                // or if you have mock auth, triggering it here. 
                                // Since we don't have the password, we can notify the user.
                                alert("Dev Mode: Please use 'Sign Up' to create a local testing account if you forgot the password. Or check the setup instructions to create an admin account.");
                            } finally {
                                setLoading(false);
                            }
                        }}
                        className={`btn ${styles.signupLink}`}
                        style={{ marginTop: '1rem', color: '#ff4444', textDecoration: 'none' }}
                    >
                        [Dev] Forgot Password?
                    </button>
                )}
            </div>
        </div>
    );
};
