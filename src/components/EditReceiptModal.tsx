import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Plus } from 'lucide-react';
import type { Expense, ReceiptItem } from '../services/even';
import { useEven } from '../context/useEven';
import styles from './EditReceiptModal.module.css';

interface Props {
    expense: Expense;
    onClose: () => void;
}

export const EditReceiptModal: React.FC<Props> = ({ expense, onClose }) => {
    const { updateExpense } = useEven();
    const [items, setItems] = useState<ReceiptItem[]>(() =>
        (expense.items || []).map(it => ({ ...it, allocations: { ...it.allocations } }))
    );
    const [tipStr, setTipStr] = useState((expense.tip || 0) > 0 ? ((expense.tip || 0) / 100).toString() : '');
    const [taxStr, setTaxStr] = useState((expense.tax || 0) > 0 ? ((expense.tax || 0) / 100).toString() : '');
    const [merchantName, setMerchantName] = useState(expense.merchantName || '');
    const [saving, setSaving] = useState(false);

    const updateItem = (idx: number, patch: Partial<ReceiptItem>) => {
        setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
    };

    const removeItem = (idx: number) => {
        setItems(prev => prev.filter((_, i) => i !== idx));
    };

    const addItem = () => {
        setItems(prev => [
            ...prev,
            {
                id: `item_${Date.now()}_${prev.length}`,
                description: '',
                price: 0,
                quantity: 1,
                allocations: {}
            }
        ]);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const cleaned = items
                .filter(it => it.description.trim() && it.price > 0)
                .map(it => ({ ...it, description: it.description.trim() }));

            const tip = parseFloat(tipStr) || 0;
            const tax = parseFloat(taxStr) || 0;
            const itemSum = cleaned.reduce((acc, it) => acc + it.price, 0);
            const newAmount = itemSum + Math.round(tip * 100);

            await updateExpense(expense.id, {
                items: cleaned,
                tip: tip > 0 ? Math.round(tip * 100) : undefined,
                tax: tax > 0 ? Math.round(tax * 100) : undefined,
                merchantName: merchantName.trim() || undefined,
                description: merchantName.trim() || expense.description,
                amount: newAmount,
            });
            onClose();
        } catch (e) {
            console.error('Failed to save edits', e);
            alert('Kunde inte spara ändringarna.');
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.sheet} onClick={e => e.stopPropagation()}>
                <header className={styles.header}>
                    <h2 className={styles.title}>Redigera kvitto</h2>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Stäng">
                        <X size={22} />
                    </button>
                </header>

                <div className={styles.body}>
                    <div className={styles.field}>
                        <label className={styles.label}>Säljare</label>
                        <input
                            type="text"
                            className={styles.input}
                            value={merchantName}
                            onChange={e => setMerchantName(e.target.value)}
                            placeholder="t.ex. Mat & Smak"
                        />
                    </div>

                    <div className={styles.field}>
                        <label className={styles.label}>Poster</label>
                        <div className={styles.itemsList}>
                            {items.map((it, idx) => (
                                <div key={it.id} className={styles.itemRow}>
                                    <input
                                        type="number"
                                        min={1}
                                        className={styles.qtyInput}
                                        value={it.quantity}
                                        onChange={e => updateItem(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                                        aria-label="Antal"
                                    />
                                    <input
                                        type="text"
                                        className={styles.descInput}
                                        value={it.description}
                                        onChange={e => updateItem(idx, { description: e.target.value })}
                                        placeholder="Beskrivning"
                                    />
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        className={styles.priceInput}
                                        value={(it.price / 100).toString()}
                                        onChange={e => updateItem(idx, { price: Math.round((parseFloat(e.target.value) || 0) * 100) })}
                                        aria-label="Pris"
                                    />
                                    <button
                                        className={styles.deleteBtn}
                                        onClick={() => removeItem(idx)}
                                        aria-label="Ta bort"
                                        type="button"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button className={styles.addBtn} onClick={addItem} type="button">
                            <Plus size={16} />
                            <span>Lägg till rad</span>
                        </button>
                    </div>

                    <div className={styles.summaryGrid}>
                        <div className={styles.field}>
                            <label className={styles.label}>Moms (SEK)</label>
                            <input
                                type="number"
                                min={0}
                                step={0.01}
                                className={styles.input}
                                value={taxStr}
                                onChange={e => setTaxStr(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className={styles.field}>
                            <label className={styles.label}>Dricks (SEK)</label>
                            <input
                                type="number"
                                min={0}
                                step={0.01}
                                className={styles.input}
                                value={tipStr}
                                onChange={e => setTipStr(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                    </div>
                </div>

                <div className={styles.footer}>
                    <button className={styles.cancelBtn} onClick={onClose} disabled={saving}>Avbryt</button>
                    <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                        {saving ? 'Sparar…' : 'Spara'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
