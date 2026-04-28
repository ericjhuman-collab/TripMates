import { FIREBASE_ENV } from '../services/firebase';

/**
 * Thin colored strip that pins to the top of the viewport whenever the
 * app is connected to a non-production Firebase project. Prevents the
 * "wait, am I clicking around prod?" panic during testing.
 *
 * Renders nothing in production builds.
 */
export function EnvBanner() {
    if (FIREBASE_ENV === 'prod') return null;

    return (
        <div
            role="status"
            aria-label={`Connected to ${FIREBASE_ENV} environment`}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 3000,
                background: '#f59e0b',
                color: '#1f2937',
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textAlign: 'center',
                padding: '2px 8px',
                textTransform: 'uppercase',
                pointerEvents: 'none',
            }}
        >
            {FIREBASE_ENV} environment — not production data
        </div>
    );
}
