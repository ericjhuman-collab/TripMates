import React from 'react';
import { createPortal } from 'react-dom';
import { ScanLine, Pencil, X } from 'lucide-react';
import styles from './AddExpenseChoiceSheet.module.css';

interface Props {
    onClose: () => void;
    onChooseScan: () => void;
    onChooseManual: () => void;
}

export const AddExpenseChoiceSheet: React.FC<Props> = ({ onClose, onChooseScan, onChooseManual }) => {
    return createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.sheet} onClick={e => e.stopPropagation()}>
                <header className={styles.header}>
                    <h2 className={styles.title}>Lägg till utgift</h2>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Stäng">
                        <X size={22} />
                    </button>
                </header>

                <div className={styles.options}>
                    <button className={styles.option} onClick={onChooseScan}>
                        <div className={styles.iconWrap}>
                            <ScanLine size={26} />
                        </div>
                        <div className={styles.optionText}>
                            <div className={styles.optionTitle}>Scanna kvitto</div>
                            <div className={styles.optionInfo}>Dela upp rad för rad. Direkt eller i efterhand.</div>
                        </div>
                    </button>

                    <button className={styles.option} onClick={onChooseManual}>
                        <div className={styles.iconWrap}>
                            <Pencil size={24} />
                        </div>
                        <div className={styles.optionText}>
                            <div className={styles.optionTitle}>Lägg till utgift manuellt</div>
                            <div className={styles.optionInfo}>Dela upp kostnaden lika, i procent eller i delar manuellt.</div>
                        </div>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
