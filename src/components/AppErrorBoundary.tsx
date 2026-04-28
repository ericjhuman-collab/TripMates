import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { reportError } from '../services/errorTracker';

function Fallback({ error, resetErrorBoundary }: FallbackProps) {
    const message = error instanceof Error ? error.message : String(error);
    return (
        <div role="alert" style={{
            padding: '2rem',
            maxWidth: 480,
            margin: '4rem auto',
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 8px 30px rgba(30, 58, 95, 0.08)',
            textAlign: 'center',
        }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem', color: '#1e3a5f' }}>
                Något gick fel
            </h1>
            <p style={{ color: '#6b7280', marginBottom: '1.25rem' }}>
                Appen råkade ut för ett oväntat fel. Försök igen — om det återkommer, kontakta support.
            </p>
            {import.meta.env.DEV && (
                <pre style={{
                    textAlign: 'left',
                    background: '#fef2f2',
                    color: '#991b1b',
                    padding: '0.75rem',
                    borderRadius: 8,
                    fontSize: '0.75rem',
                    overflow: 'auto',
                    maxHeight: 200,
                    marginBottom: '1rem',
                }}>{message}</pre>
            )}
            <button
                onClick={resetErrorBoundary}
                style={{
                    background: '#1e3a5f', color: '#fff', border: 'none',
                    padding: '0.75rem 1.5rem', borderRadius: 999, cursor: 'pointer',
                    fontSize: '0.95rem', fontWeight: 600,
                }}
            >
                Försök igen
            </button>
        </div>
    );
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
    return (
        <ErrorBoundary
            FallbackComponent={Fallback}
            onError={(error, info) => {
                console.error('Unhandled app error:', error, info.componentStack);
                reportError(error, { componentStack: info.componentStack });
            }}
        >
            {children}
        </ErrorBoundary>
    );
}
