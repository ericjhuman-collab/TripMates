import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Legal.module.css';

const LAST_UPDATED = '2026-04-26';

export const Terms: React.FC = () => (
    <div className={styles.container}>
        <Link to="/login" className={styles.backLink}>← Back</Link>

        <h1 className={styles.title}>Terms of Service</h1>
        <p className={styles.lastUpdated}>Last updated: {LAST_UPDATED}</p>

        <div className={styles.draftBanner}>
            <strong>Draft — pending legal review.</strong> This document is a starter
            template and has not been reviewed by a lawyer. Before launching publicly,
            have qualified counsel adapt these terms to your jurisdiction and business model.
        </div>

        <section className={styles.section}>
            <h2>1. Acceptance</h2>
            <p>
                By creating an account or using TripMates ("the Service"), you agree to be
                bound by these Terms of Service. If you do not agree, you may not use the Service.
            </p>
        </section>

        <section className={styles.section}>
            <h2>2. Eligibility</h2>
            <p>
                You must be at least 16 years old to use TripMates. By creating an account,
                you confirm that you meet this requirement and that the information you provide
                is accurate.
            </p>
        </section>

        <section className={styles.section}>
            <h2>3. Your account</h2>
            <ul>
                <li>You are responsible for keeping your password secure.</li>
                <li>You are responsible for all activity that occurs under your account.</li>
                <li>You must notify us immediately of any unauthorized access.</li>
                <li>You may not share your account with others or create accounts on behalf of someone else.</li>
            </ul>
        </section>

        <section className={styles.section}>
            <h2>4. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
                <li>Use the Service for any unlawful purpose or in violation of any applicable laws.</li>
                <li>Upload content you do not have the right to share, including other people's photos without their consent.</li>
                <li>Harass, threaten, impersonate, or otherwise harm other users.</li>
                <li>Attempt to access, scrape, or interfere with the Service in unauthorized ways.</li>
                <li>Use the Service to transmit spam, malware, or other harmful content.</li>
            </ul>
        </section>

        <section className={styles.section}>
            <h2>5. Your content</h2>
            <p>
                You retain ownership of trip data, photos, and other content you upload ("Your Content").
                By uploading, you grant TripMates a limited license to store, process, and display Your
                Content as necessary to operate the Service for you and the trip members you choose to share with.
            </p>
            <p>
                You are responsible for the accuracy and legality of Your Content. We may remove content
                that violates these Terms or applicable law.
            </p>
        </section>

        <section className={styles.section}>
            <h2>6. Trip data and shared groups</h2>
            <p>
                Trips on TripMates are collaborative. Information you add to a trip — including expenses,
                photos, activities, and location data (if shared) — is visible to other members of that
                trip. Be mindful of what you choose to share.
            </p>
        </section>

        <section className={styles.section}>
            <h2>7. Receipt scanning and AI features</h2>
            <p>
                Receipt scanning uses Google's Vertex AI to extract structured data from images you
                upload. The image is processed to extract line items, totals, and merchant data.
                Do not upload receipts containing sensitive information you do not wish to share with
                the AI processor.
            </p>
            <p>
                Daily scanning quotas apply to prevent abuse. AI-extracted data may be inaccurate; you
                are responsible for verifying the result before relying on it.
            </p>
        </section>

        <section className={styles.section}>
            <h2>8. Service availability</h2>
            <p>
                We provide the Service "as is" and do not guarantee uptime, error-free operation, or
                that all features will remain available. We may modify, suspend, or discontinue features
                at any time.
            </p>
        </section>

        <section className={styles.section}>
            <h2>9. Termination</h2>
            <p>
                You may delete your account at any time. We may suspend or terminate your account if
                you violate these Terms or applicable law. On termination, we will delete your personal
                data in accordance with our <Link to="/privacy">Privacy Policy</Link>, except where we
                are required to retain it by law.
            </p>
        </section>

        <section className={styles.section}>
            <h2>10. Limitation of liability</h2>
            <p>
                To the fullest extent permitted by law, TripMates is not liable for indirect,
                incidental, or consequential damages arising from your use of the Service. Our total
                liability for any claim related to the Service shall not exceed the amount you paid us
                in the twelve months preceding the claim (zero, if the Service is free for you).
            </p>
        </section>

        <section className={styles.section}>
            <h2>11. Changes to these Terms</h2>
            <p>
                We may update these Terms from time to time. Material changes will be communicated
                through the app or by email. Continued use of the Service after changes take effect
                constitutes acceptance of the new Terms.
            </p>
        </section>

        <section className={styles.section}>
            <h2>12. Governing law</h2>
            <p>
                These Terms are governed by the laws of Sweden. Disputes will be resolved by the
                competent courts of Sweden, unless mandatory consumer-protection laws in your country
                of residence provide otherwise.
            </p>
        </section>

        <section className={styles.section}>
            <h2>13. Contact</h2>
            <p>
                Questions about these Terms? Contact us at{' '}
                <a href="mailto:support@tripmates.app">support@tripmates.app</a>.
            </p>
        </section>
    </div>
);
