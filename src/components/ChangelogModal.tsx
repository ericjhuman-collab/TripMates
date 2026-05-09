import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, MapPin, Receipt, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Bump this string for every release that should trigger the popup. The
// localStorage key is namespaced by it, so dismissing one release does not
// suppress the next one.
const CHANGELOG_VERSION = 'v1.0.12';
const STORAGE_KEY = `tripmates:changelog:${CHANGELOG_VERSION}:dismissed`;

interface ChangelogEntry {
    icon: React.ReactNode;
    title: string;
    body: string;
}

const ENTRIES: ChangelogEntry[] = [
    {
        icon: <RefreshCw size={20} />,
        title: 'Live sync i Odds',
        body: 'Dares och svar dyker upp direkt på alla telefoner — du behöver inte starta om appen längre.',
    },
    {
        icon: <Receipt size={20} />,
        title: 'Egna titlar på utlägg',
        body: 'Skriv vad utlägget gäller (t.ex. restaurangens namn) istället för bara "Shared expense".',
    },
    {
        icon: <Sparkles size={20} />,
        title: 'Ändra & ta bort dina utlägg',
        body: 'Du som la till utlägget kan nu redigera eller radera det direkt från detaljvyn.',
    },
    {
        icon: <MapPin size={20} />,
        title: 'Öppna i Google Maps från aktiviteter',
        body: 'En knapp på varje aktivitet öppnar platsen direkt i Maps — schedule, day och week-vyerna.',
    },
];

export const ChangelogModal: React.FC = () => {
    const { appUser } = useAuth();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!appUser) return;
        try {
            if (!localStorage.getItem(STORAGE_KEY)) {
                setOpen(true);
            }
        } catch {
            // localStorage unavailable (private mode etc) — silently skip.
        }
    }, [appUser]);

    const dismiss = () => {
        try {
            localStorage.setItem(STORAGE_KEY, '1');
        } catch {
            // Ignore — at worst the popup shows again next session.
        }
        setOpen(false);
    };

    if (!open) return null;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="What's new"
            onClick={dismiss}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1500,
                padding: '1rem',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#fff',
                    borderRadius: 20,
                    width: '100%',
                    maxWidth: 420,
                    maxHeight: '85vh',
                    overflowY: 'auto',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
                    padding: '1.5rem',
                    position: 'relative',
                }}
            >
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Stäng"
                    style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#64748b',
                        padding: 4,
                    }}
                >
                    <X size={22} />
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, color: '#1d4ed8' }}>
                    <Sparkles size={18} />
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                        Nytt i appen
                    </span>
                </div>
                <h2 style={{ margin: '0 0 1rem', fontSize: 22, color: '#0f172a' }}>
                    Vad har ändrats
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                    {ENTRIES.map((entry, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 12 }}>
                            <div
                                style={{
                                    flex: '0 0 36px',
                                    height: 36,
                                    borderRadius: 10,
                                    background: 'rgba(59, 130, 246, 0.12)',
                                    color: '#1d4ed8',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                {entry.icon}
                            </div>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ margin: '0 0 2px', fontSize: 15, color: '#0f172a' }}>
                                    {entry.title}
                                </h3>
                                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: '#475569' }}>
                                    {entry.body}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={dismiss}
                    style={{ width: '100%' }}
                >
                    Got it
                </button>
            </div>
        </div>,
        document.body,
    );
};

export { CHANGELOG_VERSION };
