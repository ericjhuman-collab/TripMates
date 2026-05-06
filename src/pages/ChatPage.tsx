import React, { useEffect } from 'react';
import { TripChat } from '../components/TripChat';
import { useTrip } from '../context/TripContext';
import styles from './Home.module.css';

export const ChatPage: React.FC = () => {
    const { activeTrip } = useTrip();

    // Lock body scroll while on chat — only the chat-message list itself
    // scrolls. Mirrors the lock the Home chat tab used before chat moved
    // out into its own route.
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    if (!activeTrip) {
        return (
            <div className={styles.pageWrapper} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Pick a trip first to start chatting.
            </div>
        );
    }

    return (
        <div className={styles.pageWrapper}>
            <TripChat tripId={activeTrip.id} />
        </div>
    );
};
