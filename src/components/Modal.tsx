import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: ReactNode;
    children: ReactNode;
    // Hide the X close button (keeps backdrop click + ESC). Default false.
    hideCloseButton?: boolean;
    // Disable closing via outside-click and ESC — for destructive flows that
    // need an explicit choice. Default false.
    dismissOnBackdrop?: boolean;
    // Extra class on the modal card for per-screen sizing tweaks.
    className?: string;
}

// THE standard TripMates modal. Every centered modal / dialog / confirmation
// in the app must render through this component so dim, blur, radius, fade,
// z-index, ESC + outside-click behavior, and stacking-context handling stay
// identical. Bottom-sheets and side-drawers are separate primitives.
export const Modal: React.FC<ModalProps> = ({
    open,
    onClose,
    title,
    children,
    hideCloseButton = false,
    dismissOnBackdrop = true,
    className,
}) => {
    useEffect(() => {
        if (!open || !dismissOnBackdrop) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, dismissOnBackdrop, onClose]);

    if (!open) return null;

    const modalClass = className ? `${styles.modal} ${className}` : styles.modal;

    return createPortal(
        <div
            className={styles.backdrop}
            onClick={dismissOnBackdrop ? onClose : undefined}
            role="dialog"
            aria-modal="true"
        >
            <div className={modalClass} onClick={e => e.stopPropagation()}>
                {(title || !hideCloseButton) && (
                    <div className={styles.header}>
                        <h2 className={styles.title}>{title}</h2>
                        {!hideCloseButton && (
                            <button onClick={onClose} className={styles.closeBtn} aria-label="Close">
                                <X size={20} />
                            </button>
                        )}
                    </div>
                )}
                <div className={styles.body}>{children}</div>
            </div>
        </div>,
        document.body,
    );
};
