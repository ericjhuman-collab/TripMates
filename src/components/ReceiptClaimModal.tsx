import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, Hand, MoreVertical, Image as ImageIcon, Pencil, Trash2, Plus, Minus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEven } from '../context/useEven';
import type { Expense, ReceiptItem } from '../services/even';
import { EditReceiptModal } from './EditReceiptModal';
import styles from './ReceiptClaimModal.module.css';

interface ReceiptClaimModalProps {
    expense: Expense;
    onClose: () => void;
}

export const ReceiptClaimModal: React.FC<ReceiptClaimModalProps> = ({ expense, onClose }) => {
    const { appUser } = useAuth();
    const { participants, updateExpense, deleteExpense } = useEven();
    const currency = expense.currency || 'SEK';
    const formatAmount = (cents: number) => `${Math.round(cents / 100)} ${currency}`;
    const formatAmountExact = (cents: number) => `${(cents / 100).toFixed(2)} ${currency}`;
    const myUid = appUser?.uid || '';
    const payer = participants.find(p => p.uid === expense.payerId);
    const isOwner = appUser?.uid === expense.payerId || appUser?.uid === expense.creatorId;

    const [items, setItems] = useState<ReceiptItem[]>(() =>
        (expense.items || []).map(it => ({ ...it, allocations: { ...it.allocations } }))
    );
    // Re-sync local items when the underlying expense (live snapshot) changes — e.g. after Edit save
    useEffect(() => {
        setItems((expense.items || []).map(it => ({ ...it, allocations: { ...it.allocations } })));
    }, [expense.items]);
    const [isSaving, setIsSaving] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [showImageViewer, setShowImageViewer] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const handleDelete = async () => {
        try {
            await deleteExpense(expense.id);
            onClose();
        } catch (e) {
            console.error('Failed to delete', e);
            alert('Kunde inte radera kvittot.');
        }
    };

    const setMyParts = (itemIdx: number, nextRaw: number) => {
        setItems(prev => prev.map((item, idx) => {
            if (idx !== itemIdx) return item;
            const otherClaims = Object.entries(item.allocations)
                .filter(([uid]) => uid !== myUid)
                .reduce((sum, [, parts]) => sum + parts, 0);
            const quantity = item.quantity || 1;
            const myMax = Math.max(0, quantity - otherClaims);
            const next = Math.max(0, Math.min(myMax, Math.floor(nextRaw)));
            const myCurrent = item.allocations[myUid] || 0;
            if (next === myCurrent) return item;
            const newAllocations = { ...item.allocations };
            if (next === 0) delete newAllocations[myUid];
            else newAllocations[myUid] = next;
            return { ...item, allocations: newAllocations };
        }));
    };

    const toggleSingle = (itemIdx: number) => {
        const item = items[itemIdx];
        if (!item) return;
        const myCurrent = item.allocations[myUid] || 0;
        setMyParts(itemIdx, myCurrent > 0 ? 0 : 1);
    };

    const adjustClaim = (itemIdx: number, delta: number) => {
        const item = items[itemIdx];
        if (!item) return;
        const myCurrent = item.allocations[myUid] || 0;
        setMyParts(itemIdx, myCurrent + delta);
    };

    const myClaimSumCents = useMemo(() => {
        let sum = 0;
        for (const item of items) {
            const totalParts = Object.values(item.allocations).reduce((a, b) => a + b, 0);
            const myParts = item.allocations[myUid] || 0;
            if (totalParts === 0 || myParts === 0) continue;
            const quantity = item.quantity || 1;
            if (quantity > 1) {
                sum += (item.price / quantity) * myParts;
            } else {
                sum += (item.price / totalParts) * myParts;
            }
        }
        return sum;
    }, [items, myUid]);

    const totalClaimSumCents = useMemo(() => {
        let sum = 0;
        for (const item of items) {
            const totalParts = Object.values(item.allocations).reduce((a, b) => a + b, 0);
            if (totalParts === 0) continue;
            const quantity = item.quantity || 1;
            if (quantity > 1) {
                sum += (item.price / quantity) * totalParts;
            } else {
                sum += item.price;
            }
        }
        return sum;
    }, [items]);

    const myTipCents = useMemo(() => {
        const tip = expense.tip || 0;
        if (!tip || totalClaimSumCents <= 0) return 0;
        return tip * (myClaimSumCents / totalClaimSumCents);
    }, [expense.tip, myClaimSumCents, totalClaimSumCents]);

    const subtotalCents = items.reduce((acc, it) => acc + it.price, 0);
    const claimedCount = items.filter(it => Object.values(it.allocations).reduce((a, b) => a + b, 0) > 0).length;
    const progress = items.length > 0 ? claimedCount / items.length : 0;

    const myDinSummaCents = myClaimSumCents + myTipCents;

    const allocationsEqual = (a: Record<string, number>, b: Record<string, number>) => {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const k of keys) {
            if ((a[k] || 0) !== (b[k] || 0)) return false;
        }
        return true;
    };

    const hasChanges = () => {
        const original = expense.items || [];
        if (original.length !== items.length) return true;
        for (let i = 0; i < items.length; i++) {
            if (!allocationsEqual(original[i].allocations || {}, items[i].allocations || {})) {
                return true;
            }
        }
        return false;
    };

    const handleSave = async () => {
        if (!hasChanges()) {
            onClose();
            return;
        }
        setIsSaving(true);
        try {
            await updateExpense(expense.id, { items });
            onClose();
        } catch (e) {
            console.error('Failed to save claims', e);
            alert('Kunde inte spara dina val. Försök igen.');
        } finally {
            setIsSaving(false);
        }
    };

    const renderItem = (item: ReceiptItem, idx: number) => {
        const quantity = item.quantity || 1;
        const otherParts = Object.entries(item.allocations)
            .filter(([uid]) => uid !== myUid)
            .reduce((sum, [, parts]) => sum + parts, 0);
        const myMax = Math.max(0, quantity - otherParts);
        const myPartsRaw = item.allocations[myUid] || 0;
        const myParts = Math.min(Math.max(0, myPartsRaw), myMax);
        const totalParts = otherParts + myParts;
        const remaining = Math.max(0, quantity - totalParts);
        const isClaimed = myParts > 0;
        const isFull = myMax <= 0;
        const hasMultiple = quantity > 1;
        const myShareCents = hasMultiple
            ? (item.price / quantity) * myParts
            : (totalParts > 0 ? (item.price / totalParts) * myParts : 0);

        const kvarLabel = hasMultiple
            ? `Kvar: ${remaining}/${quantity}`
            : (isClaimed ? 'Kvar: 0' : (isFull ? 'Kvar: 0' : 'Kvar: hela'));

        const rowClickable = !hasMultiple && !isFull && !isSaving;

        return (
            <div
                key={item.id}
                className={`${styles.itemRow} ${isClaimed ? styles.itemClaimed : ''} ${isFull && !isClaimed ? styles.itemDisabled : ''} ${rowClickable ? styles.itemRowClickable : ''}`}
                onClick={rowClickable ? () => toggleSingle(idx) : undefined}
                role={rowClickable ? 'button' : undefined}
                tabIndex={rowClickable ? 0 : undefined}
                onKeyDown={rowClickable ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleSingle(idx);
                    }
                } : undefined}
            >
                <div className={`${styles.checkbox} ${isClaimed ? styles.checkboxOn : ''}`}>
                    {isClaimed && <Check size={16} strokeWidth={3} />}
                </div>
                <div className={styles.itemMain}>
                    <div className={styles.itemTopLine}>
                        <span className={styles.itemDescription}>
                            {hasMultiple && <span className={styles.itemQty}>{quantity}x </span>}
                            {item.description}
                        </span>
                        <span className={styles.itemPrice}>{formatAmount(item.price)}</span>
                    </div>
                    {isClaimed && (
                        <div className={styles.itemDuLine}>
                            Du: {formatAmount(myShareCents)}
                            {hasMultiple && ` (${myParts}/${quantity})`}
                        </div>
                    )}
                    <div className={styles.itemKvarLine}>{kvarLabel}</div>
                    {hasMultiple && (
                        <div className={styles.stepper} onClick={e => e.stopPropagation()}>
                            <button
                                type="button"
                                className={styles.stepperBtn}
                                onClick={() => adjustClaim(idx, -1)}
                                disabled={myParts <= 0 || isSaving}
                                aria-label="Minska"
                            >
                                <Minus size={16} strokeWidth={2.5} />
                            </button>
                            <span className={styles.stepperCount}>{myParts}</span>
                            <button
                                type="button"
                                className={styles.stepperBtn}
                                onClick={() => adjustClaim(idx, 1)}
                                disabled={myParts >= myMax || isSaving}
                                aria-label="Öka"
                            >
                                <Plus size={16} strokeWidth={2.5} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const modalHtml = (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.sheet} onClick={e => e.stopPropagation()}>
                <header className={styles.header}>
                    <button className={styles.iconBtn} onClick={onClose} aria-label="Stäng">
                        <ArrowLeft size={22} />
                    </button>
                    <h2 className={styles.title}>Kvitto</h2>
                    <div className={styles.menuWrap} ref={menuRef}>
                        <button
                            className={styles.iconBtn}
                            onClick={() => setMenuOpen(o => !o)}
                            aria-label="Mer"
                            aria-expanded={menuOpen}
                        >
                            <MoreVertical size={22} />
                        </button>
                        {menuOpen && (
                            <div className={styles.menuDropdown}>
                                {expense.receiptUrl && (
                                    <button
                                        className={styles.menuItem}
                                        onClick={() => { setShowImageViewer(true); setMenuOpen(false); }}
                                    >
                                        <ImageIcon size={18} />
                                        <span>Visa originalbild</span>
                                    </button>
                                )}
                                {isOwner && (
                                    <button
                                        className={styles.menuItem}
                                        onClick={() => { setShowEdit(true); setMenuOpen(false); }}
                                    >
                                        <Pencil size={18} />
                                        <span>Redigera kvitto</span>
                                    </button>
                                )}
                                {isOwner && (
                                    <button
                                        className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                        onClick={() => { setShowDeleteConfirm(true); setMenuOpen(false); }}
                                    >
                                        <Trash2 size={18} />
                                        <span>Radera kvitto</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </header>

                <div className={styles.body}>
                    <div className={styles.banner}>
                        <Hand size={18} className={styles.bannerIcon} />
                        <div>
                            <div className={styles.bannerTitle}>Välj dina poster</div>
                            <p className={styles.bannerText}>
                                {payer?.shortName || payer?.name || 'Någon'} laddade upp detta kvitto.
                                Tryck på de poster du beställde.
                            </p>
                        </div>
                    </div>

                    <div className={styles.receiptCard}>
                        <div className={styles.receiptHeader}>
                            <h3 className={styles.merchant}>{expense.merchantName || expense.description}</h3>
                            <p className={styles.uploader}>{payer?.name || payer?.shortName}</p>
                        </div>

                        <div className={styles.dashedLine} />

                        <div className={styles.itemsList}>
                            {items.map(renderItem)}
                        </div>

                        <div className={styles.dashedLine} />

                        <div className={styles.summary}>
                            <div className={styles.summaryRow}>
                                <span>Delsumma</span>
                                <span>{formatAmount(subtotalCents)}</span>
                            </div>
                            {expense.tax !== undefined && expense.tax !== null && (
                                <div className={styles.summaryRow}>
                                    <span>Moms</span>
                                    <span>{formatAmountExact(expense.tax)}</span>
                                </div>
                            )}
                            {expense.tip ? (
                                <div className={styles.summaryRow}>
                                    <span>Dricks</span>
                                    <span>{formatAmount(expense.tip)}</span>
                                </div>
                            ) : null}
                            <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                                <span>TOTALT</span>
                                <span>{formatAmount(expense.amount)}</span>
                            </div>
                        </div>

                        <div className={styles.progressTrack}>
                            <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
                        </div>
                        <div className={styles.progressLabel}>{claimedCount} / {items.length} valda</div>
                    </div>
                </div>

                <div className={styles.footer}>
                    <div className={styles.dinSumma}>
                        <span className={styles.dinSummaLabel}>Din summa</span>
                        <span className={styles.dinSummaValue}>{formatAmount(myDinSummaCents)}</span>
                    </div>
                    <button
                        className={styles.saveBtn}
                        onClick={handleSave}
                        disabled={isSaving}
                    >
                        {isSaving ? 'Sparar…' : 'Klar'}
                    </button>
                </div>
            </div>

            {showImageViewer && expense.receiptUrl && (
                <div className={styles.imageViewerOverlay} onClick={() => setShowImageViewer(false)}>
                    <img src={expense.receiptUrl} alt="Kvitto" className={styles.imageViewerImg} />
                </div>
            )}

            {showDeleteConfirm && (
                <div className={styles.confirmOverlay} onClick={() => setShowDeleteConfirm(false)}>
                    <div className={styles.confirmBox} onClick={e => e.stopPropagation()}>
                        <h3 className={styles.confirmTitle}>Radera kvitto?</h3>
                        <p className={styles.confirmText}>
                            Detta tar bort hela kostnaden från resan. Det går inte att ångra.
                        </p>
                        <div className={styles.confirmActions}>
                            <button className={styles.confirmCancel} onClick={() => setShowDeleteConfirm(false)}>Avbryt</button>
                            <button className={styles.confirmDanger} onClick={handleDelete}>Radera</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <>
            {createPortal(modalHtml, document.body)}
            {showEdit && <EditReceiptModal expense={expense} onClose={() => setShowEdit(false)} />}
        </>
    );
};
