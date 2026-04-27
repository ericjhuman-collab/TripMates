import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Legal.module.css';

const LAST_UPDATED = '2026-04-26';

export const Privacy: React.FC = () => (
    <div className={styles.container}>
        <Link to="/login" className={styles.backLink}>← Back</Link>

        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.lastUpdated}>Last updated: {LAST_UPDATED}</p>

        <div className={styles.draftBanner}>
            <strong>Draft — pending legal review.</strong> This document is a starter
            template based on common GDPR practices. It has not been reviewed by a lawyer
            or filed with any data-protection authority. Before launching publicly, have
            qualified counsel review and adapt this policy.
        </div>

        <section className={styles.section}>
            <h2>1. Who we are</h2>
            <p>
                TripMates ("we", "us") is the data controller for personal data processed
                through the Service. For data-protection inquiries, contact{' '}
                <a href="mailto:privacy@tripmates.app">privacy@tripmates.app</a>.
            </p>
        </section>

        <section className={styles.section}>
            <h2>2. Data we collect</h2>
            <p>We collect the following categories of personal data:</p>
            <ul>
                <li><strong>Account data:</strong> first name, last name, email, password (hashed by Firebase Auth), and country preference.</li>
                <li><strong>Profile data (optional):</strong> phone number, avatar, profile color.</li>
                <li><strong>Trip data:</strong> trips you create or join, members, destinations, dates, accommodations, activities.</li>
                <li><strong>Expense data:</strong> amounts, currencies, who paid, who participated, receipt images.</li>
                <li><strong>Photos:</strong> images you upload to a trip gallery.</li>
                <li><strong>Location data (only if you opt in):</strong> approximate location shared with trip members.</li>
                <li><strong>Technical data:</strong> IP address, device type, browser, basic analytics.</li>
            </ul>
        </section>

        <section className={styles.section}>
            <h2>3. Why we process it (purpose and legal basis)</h2>
            <ul>
                <li><strong>To provide the Service</strong> (Art. 6(1)(b) GDPR — performance of contract): account creation, trip management, expenses, photos.</li>
                <li><strong>With your consent</strong> (Art. 6(1)(a)): location sharing, marketing communications (if you opt in).</li>
                <li><strong>For legitimate interests</strong> (Art. 6(1)(f)): security, fraud prevention, abuse detection, basic analytics.</li>
                <li><strong>Legal obligations</strong> (Art. 6(1)(c)): retention of certain records when required by law.</li>
            </ul>
        </section>

        <section className={styles.section}>
            <h2>4. Who we share data with</h2>
            <p>We share data only with the following processors and recipients:</p>
            <ul>
                <li><strong>Trip members.</strong> Data you add to a trip is visible to other members of that trip.</li>
                <li><strong>Google Firebase</strong> (Authentication, Firestore, Cloud Storage, Cloud Functions, Vertex AI). Processes account, trip, and image data on our behalf. Data is stored in the EU region (europe-west region) where possible.</li>
                <li><strong>Google Vertex AI</strong> (receipt scanning). Receipt images you upload are sent to Vertex AI for OCR and structured-data extraction.</li>
            </ul>
            <p>
                We do not sell your personal data. We do not share it with advertisers.
            </p>
        </section>

        <section className={styles.section}>
            <h2>5. International transfers</h2>
            <p>
                Some of our processors (e.g. Google) may process data outside the EU/EEA. We rely on
                Standard Contractual Clauses or equivalent mechanisms to ensure an adequate level of
                protection.
            </p>
        </section>

        <section className={styles.section}>
            <h2>6. Retention</h2>
            <ul>
                <li>Account data: kept while your account is active. Deleted within 90 days of account deletion request, except where law requires longer retention.</li>
                <li>Trip data: kept while you are a member of the trip. After you leave a trip, your contributions remain visible to remaining members but are no longer linked to your active profile.</li>
                <li>Receipt images: kept for as long as the related expense exists in the trip.</li>
                <li>Logs and analytics: kept for up to 12 months.</li>
            </ul>
        </section>

        <section className={styles.section}>
            <h2>7. Your rights (GDPR)</h2>
            <p>If you are in the EU/EEA, you have the right to:</p>
            <ul>
                <li><strong>Access</strong> the personal data we hold about you.</li>
                <li><strong>Rectify</strong> inaccurate or incomplete data.</li>
                <li><strong>Erasure</strong> ("right to be forgotten") — request deletion of your data.</li>
                <li><strong>Restrict</strong> or <strong>object</strong> to processing in certain circumstances.</li>
                <li><strong>Data portability</strong> — receive your data in a structured, machine-readable format.</li>
                <li><strong>Withdraw consent</strong> at any time for processing based on consent.</li>
                <li><strong>Lodge a complaint</strong> with a supervisory authority. In Sweden, this is the Integritetsskyddsmyndigheten (IMY): <a href="https://www.imy.se" target="_blank" rel="noreferrer">imy.se</a>.</li>
            </ul>
            <p>
                To exercise any of these rights, contact{' '}
                <a href="mailto:privacy@tripmates.app">privacy@tripmates.app</a>. We will respond within
                30 days.
            </p>
        </section>

        <section className={styles.section}>
            <h2>8. Security</h2>
            <p>
                We use industry-standard measures to protect your data, including encryption in transit
                (HTTPS), authentication via Firebase, and access controls in our database. No system is
                100% secure; we will notify you of breaches that affect your personal data as required
                by law.
            </p>
        </section>

        <section className={styles.section}>
            <h2>9. Cookies</h2>
            <p>
                We use essential cookies and local storage to keep you signed in and to remember your
                preferences. We do not use third-party advertising or tracking cookies.
            </p>
        </section>

        <section className={styles.section}>
            <h2>10. Children</h2>
            <p>
                The Service is not intended for users under 16. If you become aware that a child under 16
                has provided us with personal data, please contact us so we can delete it.
            </p>
        </section>

        <section className={styles.section}>
            <h2>11. Changes</h2>
            <p>
                We may update this Privacy Policy from time to time. Material changes will be communicated
                through the app or by email.
            </p>
        </section>

        <section className={styles.section}>
            <h2>12. Contact</h2>
            <p>
                Questions about this Privacy Policy or how we handle your data? Contact us at{' '}
                <a href="mailto:privacy@tripmates.app">privacy@tripmates.app</a>.
            </p>
            <p>
                See also our <Link to="/terms">Terms of Service</Link>.
            </p>
        </section>
    </div>
);
