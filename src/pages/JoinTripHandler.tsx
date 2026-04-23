import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTrip } from '../context/TripContext';
import styles from './JoinTripHandler.module.css';

export const JoinTripHandler: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { joinTrip } = useTrip();
    const [error, setError] = useState('');

    useEffect(() => {
        const join = async () => {
            if (id) {
                try {
                    const success = await joinTrip(id);
                    if (success) {
                        navigate('/', { replace: true });
                    } else {
                        setError('Ogiltig reskod eller så finns inte resan.');
                    }
                } catch (e: unknown) {
                    console.error('Failed to join trip', e);
                    setError(e instanceof Error ? e.message : 'Kunde inte gå med i resan.');
                }
            } else {
                navigate('/', { replace: true });
            }
        };
        join();
    }, [id, joinTrip, navigate]);

    if (error) {
        return (
            <div className={styles.errorCard}>
                <h2 className={styles.errorTitle}>Ett fel uppstod</h2>
                <p className={styles.errorMessage}>{error}</p>
                <Link to="/trips" className={`btn btn-primary ${styles.errorLink}`}>Till Mina Resor</Link>
            </div>
        );
    }

    return (
        <div className={styles.spinnerWrapper}>
            <div className={styles.spinner} />
            <p className={styles.spinnerText}>Går med i resan {id}...</p>
        </div>
    );
};
