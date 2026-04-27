import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import type { Expense } from '../services/even';
import styles from './DuplicateWarningModal.module.css';

interface Props {
    duplicates: Expense[];
    onCancel: () => void;
    onSaveAnyway: () => void;
    saving?: boolean;
}

const formatAmount = (cents: number, currency: string) =>
    `${new Intl.NumberFormat('sv-SE').format(Math.round(cents / 100))} ${currency}`;

const formatDate = (raw: string | undefined): string => {
    if (!raw) return '';
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return raw;
    return new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
};

export const DuplicateWarningModal: React.FC<Props> = ({ duplicates, onCancel, onSaveAnyway, saving }) => {
    return createPortal(
        <div className={styles.overlay} onClick={onCancel}>
            <div className={styles.box} onClick={e => e.stopPropagation()}>
                <header className={styles.header}>
                    <div className={styles.iconWrap}>
                        <AlertTriangle size={22} />
                    </div>
                    <h2 className={styles.title}>Möjlig dubblett</h2>
                    <button className={styles.closeBtn} onClick={onCancel} aria-label="Stäng">
                        <X size={20} />
                    </button>
                </header>

                <p className={styles.lead}>
                    {duplicates.length === 1
                        ? 'En liknande kostnad finns redan registrerad:'
                        : `${duplicates.length} liknande kostnader finns redan registrerade:`}
                </p>

                <ul className={styles.list}>
                    {duplicates.map(exp => (
                        <li key={exp.id} className={styles.item}>
                            <div className={styles.itemTitle}>
                                {exp.merchantName || exp.description || 'Okänd'}
                            </div>
                            <div className={styles.itemMeta}>
                                <span className={styles.itemAmount}>{formatAmount(exp.amount, exp.currency)}</span>
                                <span className={styles.itemDot}>·</span>
                                <span>{formatDate(exp.transactionDate || exp.date)}</span>
                            </div>
                        </li>
                    ))}
                </ul>

                <p className={styles.hint}>
                    Samma belopp, valuta, betalare och datum inom några dagar. Kontrollera att det
                    inte är samma kvitto registrerat två gånger.
                </p>

                <div className={styles.actions}>
                    <button className={styles.btnCancel} onClick={onCancel} disabled={saving}>
                        Avbryt
                    </button>
                    <button className={styles.btnPrimary} onClick={onSaveAnyway} disabled={saving}>
                        {saving ? 'Sparar…' : 'Spara ändå'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
