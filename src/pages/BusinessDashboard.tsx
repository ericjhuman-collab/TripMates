import React from 'react';
import { Building2, PaintBucket, Users, Settings } from 'lucide-react';
import styles from './Profile.module.css';

export const BusinessDashboard: React.FC<{ onBack: () => void }> = () => {

    return (
        <div className={styles.scrollContainer}>
            <div className={styles.settingsHeader}>
                <h2 className={styles.settingsTitle} style={{ paddingLeft: '1rem' }}>Business Partner</h2>
            </div>

            <div className={styles.settingsContent}>
                <div className={styles.settingsCard} style={{ textAlign: 'center', padding: '3rem 1.5rem', background: 'var(--color-surface)', border: '1px solid var(--color-surface-hover)' }}>
                    <Building2 size={56} style={{ margin: '0 auto 1.5rem', color: 'var(--color-text)' }} />
                    <h3 style={{ fontSize: '1.4rem', marginBottom: '0.75rem', color: 'var(--color-text)' }}>Business Partner Features</h3>
                    <div style={{ display: 'inline-block', background: 'rgba(239,68,68,0.2)', color: '#fca5a5', padding: '0.25rem 0.75rem', borderRadius: 999, fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
                        COMING SOON
                    </div>
                    
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '2rem' }}>
                        We are building a powerful B2B suite. Soon, you will be able to register as a Business Partner and unlock tools to host large corporate events, weddings, and conferences.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'var(--color-surface-hover)', borderRadius: 12 }}>
                            <PaintBucket size={24} color="#60a5fa" />
                            <div>
                                <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-text)' }}>Whitelabel the App</h4>
                                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Customize TripMates with your brand colors and logo.</p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'var(--color-surface-hover)', borderRadius: 12 }}>
                            <Users size={24} color="#34d399" />
                            <div>
                                <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-text)' }}>Magic Member Invites</h4>
                                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Import guests via CSV and send them seamless join links.</p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'var(--color-surface-hover)', borderRadius: 12 }}>
                            <Settings size={24} color="#f472b6" />
                            <div>
                                <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-text)' }}>Event Customization</h4>
                                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Tweak menus, assign groups, and manage billing effortlessly.</p>
                            </div>
                        </div>
                    </div>
                    
                </div>
            </div>
        </div>
    );
};
