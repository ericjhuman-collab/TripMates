import { FIREBASE_ENV } from './firebase';

/**
 * Sentry is dynamically imported only when a DSN is set in the
 * environment, so builds that don't use error tracking don't pay the
 * ~50KB SDK cost in the initial bundle.
 *
 * To enable in any environment:
 *   1. Create a free project at https://sentry.io (React platform).
 *   2. Copy the DSN.
 *   3. Add it to a local .env file:
 *        VITE_SENTRY_DSN="https://...@oXXXX.ingest.sentry.io/YYYY"
 *      and to the prod / staging deploy environment.
 *   4. Redeploy. Errors thrown anywhere in the app will start flowing
 *      into Sentry, tagged with FIREBASE_ENV (prod | staging).
 */

type SentryModule = typeof import('@sentry/react');
let sentryPromise: Promise<SentryModule> | null = null;
function loadSentry(): Promise<SentryModule> {
    if (!sentryPromise) {
        sentryPromise = import('@sentry/react');
    }
    return sentryPromise;
}

function getDsn(): string | undefined {
    const dsn = import.meta.env.VITE_SENTRY_DSN;
    return typeof dsn === 'string' && dsn.length > 0 ? dsn : undefined;
}

/**
 * Initialise Sentry once at app start. No-op when no DSN is set —
 * neither the SDK nor any network calls happen in that case.
 */
export function initErrorTracker(): void {
    const dsn = getDsn();
    if (!dsn) return;

    void loadSentry().then(Sentry => {
        Sentry.init({
            dsn,
            environment: FIREBASE_ENV,
            // Sample rate keeps cost under control until we know baseline volume.
            // 1.0 = 100% of errors. Tracing/replay default to disabled — flip on
            // selectively once we know what's worth recording.
            tracesSampleRate: 0,
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 0,
            // Don't send PII like cookies, request bodies, or IP automatically.
            // We can opt back in per-event with Sentry.setUser() once the policy
            // is settled.
            sendDefaultPii: false,
        });
    });
}

/**
 * Manually report a caught error. Used from the React ErrorBoundary's
 * onError callback. Fire-and-forget — never blocks the caller. No-op if
 * VITE_SENTRY_DSN is not set, in which case the SDK is never loaded.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
    if (!getDsn() || error === undefined || error === null) return;
    void loadSentry().then(Sentry => {
        Sentry.captureException(error, context ? { extra: context } : undefined);
    });
}
