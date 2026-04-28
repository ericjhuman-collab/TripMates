import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: number;
    type: ToastType;
    message: string;
}

interface ToastContextValue {
    show: (message: string, type?: ToastType) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used inside <ToastProvider>');
    }
    return ctx;
}

const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
    success: { bg: '#ecfdf5', border: '#a7f3d0', icon: '#047857' },
    error: { bg: '#fef2f2', border: '#fecaca', icon: '#b91c1c' },
    info: { bg: '#eff6ff', border: '#bfdbfe', icon: '#1d4ed8' },
};

const ICONS: Record<ToastType, typeof CheckCircle2> = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
};

const DEFAULT_TIMEOUT_MS = 5000;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const idRef = useRef(0);

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const show = useCallback((message: string, type: ToastType = 'info') => {
        const id = ++idRef.current;
        setToasts(prev => [...prev, { id, type, message }]);
        window.setTimeout(() => dismiss(id), DEFAULT_TIMEOUT_MS);
    }, [dismiss]);

    const value = useMemo<ToastContextValue>(() => ({
        show,
        success: (m) => show(m, 'success'),
        error: (m) => show(m, 'error'),
        info: (m) => show(m, 'info'),
    }), [show]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div
                role="region"
                aria-label="Notifications"
                style={{
                    position: 'fixed',
                    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
                    left: 0,
                    right: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0 1rem',
                    pointerEvents: 'none',
                    zIndex: 2000,
                }}
            >
                {toasts.map(t => {
                    const Icon = ICONS[t.type];
                    const colors = COLORS[t.type];
                    return (
                        <div
                            key={t.id}
                            role="status"
                            aria-live="polite"
                            style={{
                                pointerEvents: 'auto',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '0.5rem',
                                background: colors.bg,
                                border: `1px solid ${colors.border}`,
                                color: '#1f2937',
                                borderRadius: 12,
                                padding: '0.75rem 0.9rem',
                                fontSize: '0.9rem',
                                lineHeight: 1.4,
                                width: 'min(420px, 100%)',
                                boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
                            }}
                        >
                            <Icon size={18} color={colors.icon} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                            <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{t.message}</span>
                            <button
                                type="button"
                                onClick={() => dismiss(t.id)}
                                aria-label="Dismiss"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#6b7280',
                                    cursor: 'pointer',
                                    padding: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    flexShrink: 0,
                                }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
};
