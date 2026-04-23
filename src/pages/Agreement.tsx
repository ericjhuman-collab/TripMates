import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { signOut } from 'firebase/auth';
import { TermsAndConditions } from '../components/TermsAndConditions';
import styles from './Agreement.module.css';

const BackIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
    </svg>
);

export const Agreement: React.FC = () => {
    const { appUser, currentUser, refreshAppUser } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [phoneNumber, setPhoneNumber] = useState('');
    const [sharePhoneNumber, setSharePhoneNumber] = useState(false);
    const [fullName, setFullName] = useState('');

    useEffect(() => {
        const loadFullName = async () => {
            if (currentUser && !currentUser.uid.startsWith('mock-')) {
                try {
                    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
                    if (userDoc.exists() && userDoc.data().fullName) {
                        setFullName(userDoc.data().fullName);
                    }
                } catch (e) {
                    console.error('Failed to load fullName:', e);
                }
            }
        };
        loadFullName();
    }, [currentUser]);

    const handleAgree = async () => {
        if (!currentUser) return;
        if (!fullName || fullName.trim().length < 2) {
            alert('Please enter your full name.');
            return;
        }
        if (!phoneNumber || phoneNumber.trim().length < 5) {
            alert('Please enter a valid phone number.');
            return;
        }
        setLoading(true);
        try {
            if (!currentUser.uid.startsWith('mock-')) {
                await updateDoc(doc(db, 'users', currentUser.uid), {
                    hasAgreed: true,
                    fullName: fullName.trim(),
                    phoneNumber: phoneNumber.trim(),
                    sharePhoneNumber: sharePhoneNumber
                });
            }
            await refreshAppUser();
            navigate('/');
        } catch (e) {
            console.error('Error updating user:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleBack = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (e) {
            console.error('Error signing out:', e);
        }
    };

    return (
        <div className={styles.container}>
            <div className={`card animate-fade-in ${styles.card}`}>
                <button
                    type="button"
                    onClick={handleBack}
                    className={styles.backButton}
                    title="Sign out and go back"
                >
                    <BackIcon />
                </button>

                <h2 className={styles.title}>Välkommen till organismen</h2>

                <div className={styles.termsWrapper}>
                    <TermsAndConditions />
                </div>

                <div className={styles.fieldGroup}>
                    <h3 className={styles.fieldLabel}>Your Full Name:</h3>
                    <input
                        required
                        type="text"
                        placeholder="Enter your real full name"
                        className={`input-field ${styles.fieldInput}`}
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                    />
                    <h3 className={styles.fieldLabel}>Your Contact Info:</h3>
                    <input
                        required
                        type="tel"
                        placeholder="Enter phone number (e.g. +1 555-1234)"
                        className={`input-field ${styles.fieldInput}`}
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value)}
                    />
                    <label className={styles.checkboxLabel}>
                        <input
                            type="checkbox"
                            checked={sharePhoneNumber}
                            onChange={e => setSharePhoneNumber(e.target.checked)}
                        />
                        <span>Share number to groupmembers</span>
                    </label>
                </div>

                <button
                    onClick={handleAgree}
                    disabled={loading || !appUser}
                    className={`btn btn-primary ${styles.submitButton}`}
                >
                    {loading ? 'Hold on...' : 'I Agree, Start Trip'}
                </button>
            </div>
        </div>
    );
};
