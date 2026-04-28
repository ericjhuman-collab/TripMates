import { Loader2 } from 'lucide-react';

interface Props {
    /** Optional label rendered next to the spinner (e.g. "Loading trips…"). */
    label?: string;
    /** Pixel size of the icon. Defaults to 32. */
    size?: number;
    /** If true, fills its parent and centers vertically. Useful as a page-level loader. */
    fullHeight?: boolean;
    /** Aria label for screen readers when no visible label is set. */
    ariaLabel?: string;
}

export function Spinner({ label, size = 32, fullHeight = false, ariaLabel = 'Loading' }: Props) {
    return (
        <div
            role="status"
            aria-live="polite"
            aria-label={label || ariaLabel}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                color: '#1e3a5f',
                opacity: 0.7,
                padding: '1.5rem',
                minHeight: fullHeight ? '50vh' : undefined,
            }}
        >
            <Loader2 size={size} className="animate-spin" aria-hidden="true" />
            {label && <span style={{ fontSize: '0.85rem' }}>{label}</span>}
        </div>
    );
}
