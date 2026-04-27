import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import { useEven } from '../context/useEven';
import { type Expense } from '../services/even';
import { getCategoryById } from '../utils/categories';
import { ReceiptText, ChevronDown, Plus, X } from 'lucide-react';
import styles from './Even.module.css';
import { ExpenseModal } from '../components/ExpenseModal';
import { ReceiptClaimModal } from '../components/ReceiptClaimModal';
import { AddExpenseChoiceSheet } from '../components/AddExpenseChoiceSheet';
import { ScanReceiptModal } from '../components/ScanReceiptModal';
import { InsightsTab } from '../components/InsightsTab';

type TabView = 'EXPENSES' | 'BALANCES' | 'PAYMENTS' | 'INSIGHTS';

interface ParticipantLike {
    name?: string;
    initials: string;
    color?: string;
    photoURL?: string;
}

const Avatar = ({ participant, className, zIndex }: { participant: ParticipantLike | null | undefined, className: string, zIndex?: number }) => {
    if (!participant) return <div className={className} style={{ backgroundColor: '#ccc', ...(zIndex !== undefined ? { zIndex } : {}) }} />;
    const customStyle = Object.assign(
        { backgroundColor: participant.photoURL ? 'transparent' : participant.color },
        zIndex !== undefined ? { zIndex } : {}
    );
    return (
        <div className={className} style={customStyle}>
            {participant.photoURL ? (
                <img src={participant.photoURL} alt={participant.name} className={styles.avatarImg} />
            ) : (
                <span className={styles.avatarInitials}>{participant.name?.charAt(0).toUpperCase()}</span>
            )}
        </div>
    );
};

const InfoAccordion = () => {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const items = [
        {
            title: "Who can I split expenses with?",
            content: "Expenses added apply only to members who have joined the group. Make sure everyone has the link."
        },
        {
            title: "What is shown on the balances page?",
            content: "This page shows a summary of who owes money and who is owed, based on all added expenses and payments."
        },
        {
            title: "How does the live currency work?",
            content: "We fetch live exchange rates automatically, so you can enter expenses in any currency and see exactly what it’s worth in your default currency. Note that this may differ slightly from the actual amount charged due to varying bank fees and specific exchange rates used by banks."
        },
        {
            title: "How are payments calculated?",
            content: "We use a smart algorithm to minimize the total number of transactions needed to settle all debts."
        }
    ];

    return (
        <div className={styles.modalBody}>
            {items.map((item, index) => {
                const isOpen = openIndex === index;
                return (
                    <div key={index} className={`${styles.accordionItem} ${isOpen ? styles.accordionItemOpen : ''}`}>
                        <button 
                            className={styles.accordionHeader} 
                            onClick={() => setOpenIndex(isOpen ? null : index)}
                        >
                            <span>{item.title}</span>
                            <ChevronDown size={18} className={styles.accordionIcon} style={Object.assign({}, { transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' })} />
                        </button>
                        {isOpen && <div className={styles.accordionContent}>{item.content}</div>}
                    </div>
                );
            })}
        </div>
    );
};

export const Even: React.FC = () => {
    const { activeTrip } = useTrip();
    const { appUser } = useAuth();
    const { expenses, payments, participants, totalTripCost, userBalances, triggerSettleUp, updatePayment, isSettled, baseCurrency, convertedAmounts, fxLoading, fxFailed } = useEven();
    const [activeTab, setActiveTab] = useState<TabView>('EXPENSES');
    const [infoModal, setInfoModal] = useState<{title: string, content: React.ReactNode} | null>(null);
    const [showSettleModal, setShowSettleModal] = useState(false);
    const [expandedBalanceUid, setExpandedBalanceUid] = useState<string | null>(null);
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
    const [isZoomed, setIsZoomed] = useState(false);
    const zoomContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isZoomed) return;
        const el = zoomContainerRef.current;
        if (!el) return;
        const centerScroll = () => {
            el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
            el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
        };
        centerScroll();
        const raf = requestAnimationFrame(centerScroll);
        return () => cancelAnimationFrame(raf);
    }, [isZoomed, viewingReceipt]);
    const [confirmPaymentId, setConfirmPaymentId] = useState<string | null>(null);
    const [claimingExpense, setClaimingExpense] = useState<Expense | null>(null);
    const [showChoiceSheet, setShowChoiceSheet] = useState(false);
    const [showScanModal, setShowScanModal] = useState(false);

    // Helper to format currency. Pass an explicit currency when displaying a per-expense amount.
    const formatCurrency = (amountInCents: number, currency?: string) => {
        const formatted = new Intl.NumberFormat('sv-SE').format(Math.round(amountInCents / 100));
        return `${formatted} ${currency || activeTrip?.baseCurrency || 'SEK'}`;
    };

    const sortedExpenses = useMemo(() => {
        const computeUnclaimed = (exp: Expense): number => {
            if (exp.splitType !== 'ITEMIZED' || !exp.items) return 0;
            let unclaimed = 0;
            for (const item of exp.items) {
                const totalParts = Object.values(item.allocations).reduce((a, b) => a + b, 0);
                const quantity = item.quantity || 1;
                if (quantity > 1) {
                    unclaimed += (item.price / quantity) * Math.max(0, quantity - totalParts);
                } else if (totalParts === 0) {
                    unclaimed += item.price;
                }
            }
            return unclaimed;
        };
        return expenses
            .map(expense => ({ expense, unclaimedCents: computeUnclaimed(expense) }))
            .sort((a, b) => (b.unclaimedCents > 0 ? 1 : 0) - (a.unclaimedCents > 0 ? 1 : 0));
    }, [expenses]);

    const renderExpenses = () => (
        <div className={styles.tabContent}>

            <p className={styles.dateSeparator}>AUG 2025</p>

            <div className={styles.list}>
                {sortedExpenses.map(({ expense, unclaimedCents }) => {
                    const payer = participants.find(p => p.uid === expense.payerId);
                    const isItemized = expense.splitType === 'ITEMIZED';
                    const myUid = appUser?.uid;
                    const myClaimedSomething = isItemized && expense.items
                        ? expense.items.some(it => (it.allocations[myUid || ''] || 0) > 0)
                        : false;
                    const hasUnclaimed = unclaimedCents > 0;
                    const canEdit = !isSettled && !isItemized && (myUid === expense.payerId || myUid === expense.creatorId);
                    const cardClickable = canEdit || isItemized;
                    return (
                        <div
                            key={expense.id}
                            className={`${styles.card} ${cardClickable ? styles.cursorPointer : styles.cursorDefault}`}
                            {...(canEdit ? { onClick: () => { setEditingExpense(expense); setShowExpenseModal(true); } } : {})}
                            {...(isItemized && !canEdit ? { onClick: () => setClaimingExpense(expense) } : {})}
                        >
                            <div className={styles.cardMain}>
                                <div className={styles.expenseIconWrapper}>
                                    {expense.category ? (
                                        <span className={styles.fontSize24}>{getCategoryById(expense.category)?.icon || '💰'}</span>
                                    ) : (
                                        <ReceiptText size={20} className={styles.expenseIcon} />
                                    )}
                                </div>
                                <div className={styles.expenseDetails}>
                                    <h4 className={styles.expenseTitle}>{expense.merchantName || expense.description}</h4>
                                    <p className={styles.expenseDate}>
                                        {isItemized
                                            ? (myClaimedSomething ? 'Mina poster valda — tryck för att ändra' : 'Välj dina poster')
                                            : 'Wednesday, Aug 20'}
                                    </p>
                                </div>
                                <div className={styles.expenseAmountWrap}>
                                    <div className={styles.expenseAmount}>
                                        {formatCurrency(expense.amount, expense.currency)}
                                    </div>
                                    {(() => {
                                        const conv = convertedAmounts.get(expense.id);
                                        const expCurrency = expense.currency || baseCurrency;
                                        if (expCurrency === baseCurrency || !conv) return null;
                                        if (conv.loading) {
                                            return <div className={styles.expenseAmountConverted}>≈ omräknar…</div>;
                                        }
                                        if (conv.failed) {
                                            return <div className={styles.expenseAmountConvertedFailed} title="Kunde inte hämta växelkurs">FX saknas</div>;
                                        }
                                        return (
                                            <div className={styles.expenseAmountConverted}>
                                                ≈ {formatCurrency(conv.convertedCents, baseCurrency)}
                                            </div>
                                        );
                                    })()}
                                    {hasUnclaimed && (
                                        <div
                                            className={styles.expenseUnclaimed}
                                            title="Belopp som ännu inte är tilldelat"
                                        >
                                            {formatCurrency(unclaimedCents, expense.currency)} kvar
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className={styles.cardFooter}>
                                <div className={styles.expenseParticipantsList}>
                                    {expense.participants.map((ep, idx) => {
                                        const p = participants.find(part => part.uid === ep.uid);
                                        if (!p) return null;
                                        return (
                                            <Avatar 
                                                key={ep.uid} 
                                                participant={p} 
                                                className={styles.expenseParticipantAvatar} 
                                                zIndex={expense.participants.length - idx} 
                                            />
                                        );
                                    })}
                                </div>
                                <div className={styles.alignCenterGap8}>
                                    {expense.receiptUrl && (
                                        <button 
                                            className={styles.receiptThumbnailBtn} 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setIsZoomed(false);
                                                setViewingReceipt(expense.receiptUrl!); 
                                            }}
                                            aria-label="View receipt"
                                        >
                                            <img src={expense.receiptUrl} alt="Receipt" className={styles.receiptThumbnail} />
                                        </button>
                                    )}
                                    <span className={styles.expensePayer}>
                                        {payer?.shortName || payer?.name} paid
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const renderBalances = () => (
        <div className={styles.tabContent}>
            <div className={styles.list}>
                {participants.map(p => {
                    const balance = userBalances[p.uid] || 0;
                    const isOpen = expandedBalanceUid === p.uid;
                    // Pending payment lines that involve this user — debits owed by them, credits owed to them.
                    const owesTo = payments.filter(pay => pay.status === 'PENDING' && pay.fromUid === p.uid);
                    const owedBy = payments.filter(pay => pay.status === 'PENDING' && pay.toUid === p.uid);
                    const hasBreakdown = owesTo.length + owedBy.length > 0;

                    return (
                        <div key={p.uid} className={styles.cardSmall}>
                            <button
                                type="button"
                                className={styles.balanceRow}
                                onClick={() => setExpandedBalanceUid(isOpen ? null : p.uid)}
                                style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left' }}
                                aria-expanded={isOpen}
                            >
                                <Avatar participant={p} className={styles.avatarSmall} />
                                <span className={styles.participantName}>{p.shortName || p.name}</span>
                                <div className={styles.balanceAmountWrapper}>
                                    <span className={`${styles.balanceAmount} ${balance > 0 ? styles.positive : balance < 0 ? styles.negative : ''}`}>
                                        {formatCurrency(Math.abs(balance), baseCurrency)} {balance < 0 && 'owes'}
                                    </span>
                                    <ChevronDown
                                        size={20}
                                        className={styles.chevron}
                                        style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                                    />
                                </div>
                            </button>
                            {isOpen && (
                                <div style={{ padding: '0.5rem 0.75rem 0.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                    {!hasBreakdown && (
                                        <div style={{ padding: '0.4rem 0' }}>
                                            {balance === 0
                                                ? 'All settled up.'
                                                : 'Click "Settle Up" above to generate a payment breakdown.'}
                                        </div>
                                    )}
                                    {owesTo.map(pay => {
                                        const recipient = participants.find(x => x.uid === pay.toUid);
                                        return (
                                            <div key={pay.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderTop: '1px solid #f3f4f6' }}>
                                                <span>→ pays <strong>{recipient?.shortName || recipient?.name || 'someone'}</strong></span>
                                                <span style={{ color: '#dc2626', fontWeight: 600 }}>{formatCurrency(pay.amount, pay.currency)}</span>
                                            </div>
                                        );
                                    })}
                                    {owedBy.map(pay => {
                                        const debtor = participants.find(x => x.uid === pay.fromUid);
                                        return (
                                            <div key={pay.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderTop: '1px solid #f3f4f6' }}>
                                                <span>← receives from <strong>{debtor?.shortName || debtor?.name || 'someone'}</strong></span>
                                                <span style={{ color: '#15803d', fontWeight: 600 }}>{formatCurrency(pay.amount, pay.currency)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const renderPayments = () => {
        const unpaid = payments.filter(p => p.status === 'PENDING');
        const paid = payments.filter(p => p.status === 'COMPLETED');

        return (
            <div className={styles.tabContent}>
                
                {/* UNPAID SECTION */}
                <p className={styles.dateSeparator}>UNPAID</p>
                {unpaid.length === 0 && (
                    <div className={styles.emptyState}>No pending transfers.</div>
                )}
                
                <div className={styles.list}>
                    {unpaid.map(payment => {
                        const fromUsr = participants.find(p => p.uid === payment.fromUid);
                        const toUsr = participants.find(p => p.uid === payment.toUid);
                        const isPayer = appUser?.uid === payment.fromUid;
                        
                        return (
                            <div key={payment.id} className={styles.cardMedium}>
                                <div className={styles.paymentRow}>
                                    <Avatar participant={fromUsr} className={styles.avatarSmall} />
                                    <div className={styles.paymentDetails}>
                                        <h4 className={styles.paymentTitle}>
                                            <strong>{fromUsr?.shortName}</strong> owes
                                        </h4>
                                        <p className={styles.paymentTo}>{toUsr?.name}</p>
                                    </div>
                                    <div className={`${styles.paymentAmountCol} ${styles.paymentAmountColUnpaid}`}>
                                        <span className={`${styles.paymentAmount} ${styles.paymentAmountUnpaid}`}>{formatCurrency(payment.amount, payment.currency)}</span>
                                        {isPayer && (
                                            <button 
                                                className={styles.markPaidBtn} 
                                                onClick={() => setConfirmPaymentId(payment.id)}
                                            >
                                                Mark Paid
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* PAID SECTION */}
                <p className={`${styles.dateSeparator} ${styles.marginTop30}`}>PAID</p>
                {paid.length === 0 && (
                    <div className={styles.emptyState}>No payment history.</div>
                )}
                
                <div className={styles.list}>
                    {paid.map(payment => {
                        const fromUsr = participants.find(p => p.uid === payment.fromUid);
                        const toUsr = participants.find(p => p.uid === payment.toUid);
                        return (
                            <div key={payment.id} className={`${styles.cardMedium} ${styles.paidOpacity}`}>
                                <div className={styles.paymentRow}>
                                    <Avatar participant={fromUsr} className={styles.avatarSmall} />
                                    <div className={styles.paymentDetails}>
                                        <h4 className={styles.paymentTitle}>
                                            <strong>{fromUsr?.shortName}</strong> paid
                                        </h4>
                                        <p className={styles.paymentTo}>{toUsr?.name}</p>
                                    </div>
                                    <div className={`${styles.paymentAmountCol} ${styles.paidOpacity}`}>
                                        <span className={styles.paymentAmount}>{formatCurrency(payment.amount, payment.currency)}</span>
                                        <span className={styles.paymentDate}>
                                            {payment.date && payment.date !== '' ? new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(payment.date)) : 'Completed'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className={styles.evenContainer}>

             <div className={styles.titleRow}>
                 <div>
                     <h1 className={styles.title}>{activeTrip?.destination || activeTrip?.name || 'Kungsleden 2025'}</h1>
                     <span className={styles.totalCost}>
                         Total expenses: {formatCurrency(totalTripCost, baseCurrency)}
                         {fxLoading && <span className={styles.fxBadge} title="Hämtar växelkurser…"> · omräknar…</span>}
                         {fxFailed && !fxLoading && <span className={styles.fxBadgeFailed} title="Vissa växelkurser kunde inte hämtas"> · FX saknas</span>}
                     </span>
                 </div>
                 <div className={styles.titleActions}>
                     <button 
                         className={styles.infoIconButton}
                         title="Information"
                         onClick={() => setInfoModal({
                             title: 'Information',
                             content: <InfoAccordion />
                         })}
                     >
                         <i className={styles.infoIcon}>i</i>
                     </button>
                     {!isSettled && (
                         <button className={`btn btn-primary ${styles.settleUpBtn}`} onClick={() => setShowSettleModal(true)}>Settle Up</button>
                     )}
                 </div>
             </div>

             <div className={styles.navPill}>
                 {(['EXPENSES', 'BALANCES', 'PAYMENTS', 'INSIGHTS'] as TabView[]).map(tab => (
                     <button 
                        key={tab}
                        className={`${styles.navTab} ${activeTab === tab ? styles.navTabActive : ''}`}
                        onClick={() => setActiveTab(tab)}
                     >
                         {tab.charAt(0).toUpperCase() + tab.slice(1).toLowerCase()}
                     </button>
                 ))}
             </div>

             <div className={styles.tabsContentArea}>
                 {activeTab === 'EXPENSES' && renderExpenses()}
                 {activeTab === 'BALANCES' && renderBalances()}
                 {activeTab === 'PAYMENTS' && renderPayments()}
                 {activeTab === 'INSIGHTS' && <InsightsTab />}
             </div>

             {/* FAB */}
             {!isSettled && (
                 <button className={styles.fabButton} title="Add Expense" onClick={() => setShowChoiceSheet(true)}>
                     <Plus size={32} color="white" />
                 </button>
             )}

             {/* SETTLE UP MODAL */}
             {showSettleModal && (
                <div className={styles.modalOverlay} onClick={() => setShowSettleModal(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.modalTitle}>Settle Up?</h2>
                        <div className={styles.modalBody}>
                            <p className={styles.modalBodyText}>
                                Has everyone in the trip added their expenses? Calculating debts will find the minimum transactions needed to clear all balances.
                            </p>
                            <div className={styles.modalButtonRow}>
                                <button className={`btn btn-secondary ${styles.flex1}`} onClick={() => setShowSettleModal(false)}>No, wait</button>
                                <button className={`btn btn-primary ${styles.flex1}`} onClick={() => {
                                    triggerSettleUp();
                                    setShowSettleModal(false);
                                    setActiveTab('PAYMENTS');
                                }}>Yes, calculate!</button>
                            </div>
                        </div>
                    </div>
                </div>
             )}

             {/* INFO MODAL */}
             {infoModal && (
                <div className={styles.modalOverlay} onClick={() => setInfoModal(null)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.modalTitle}>
                            {infoModal.title}
                            <button className={styles.modalCloseBtn} onClick={() => setInfoModal(null)}>&times;</button>
                        </h2>
                        <div className={styles.modalBody}>{infoModal.content}</div>
                        <button className={`btn btn-primary ${styles.fullWidth}`} onClick={() => setInfoModal(null)}>Got it</button>
                    </div>
                </div>
             )}

             {/* RECEIPT VIEWER MODAL */}
             {viewingReceipt && (
                <div
                    className={styles.receiptViewerOverlay}
                    onClick={() => { setViewingReceipt(null); setIsZoomed(false); }}
                >
                    <button
                        className={styles.receiptViewerClose}
                        onClick={(e) => { e.stopPropagation(); setViewingReceipt(null); setIsZoomed(false); }}
                        aria-label="Stäng kvitto"
                    >
                        <X size={22} strokeWidth={2.5} />
                    </button>
                    <div
                        ref={zoomContainerRef}
                        className={`${styles.zoomContainer} ${isZoomed ? styles.zoomContainerOpen : styles.zoomContainerClosed}`}
                        onClick={e => e.stopPropagation()}
                    >
                        <img
                            src={viewingReceipt}
                            alt="Receipt Full Size"
                            onClick={() => setIsZoomed(!isZoomed)}
                            className={`${styles.receiptImg} ${isZoomed ? styles.zoomedIn : styles.zoomedOut}`}
                        />
                    </div>
                </div>
             )}

             {/* CONFIRM PAYMENT MODAL */}
             {confirmPaymentId && (
                 <div className={styles.modalOverlay} onClick={() => setConfirmPaymentId(null)}>
                     <div className={`${styles.modalContent} ${styles.confirmModalContent}`} onClick={e => e.stopPropagation()}>
                         <h2 className={`${styles.modalTitle} ${styles.confirmModalTitle}`}>Confirm Transfer</h2>
                         <p className={`${styles.modalBodyText} ${styles.confirmModalBody}`}>Have you transferred the funds? Marking this as paid will finalize the debt.</p>
                         <div className={styles.confirmModalButtonRow}>
                             <button className={`btn ${styles.confirmBtnCancel}`} onClick={() => setConfirmPaymentId(null)}>Cancel</button>
                             <button className={`btn btn-primary ${styles.confirmBtnPrimary}`} onClick={() => {
                                 updatePayment(confirmPaymentId, { status: 'COMPLETED', date: new Date().toISOString() });
                                 setConfirmPaymentId(null);
                             }}>Confirm Paid</button>
                         </div>
                     </div>
                 </div>
             )}

             {/* EXPENSE MODAL */}
             {showExpenseModal && (
                 <ExpenseModal
                     onClose={() => {
                         setShowExpenseModal(false);
                         setEditingExpense(null);
                     }}
                     initialExpense={editingExpense || undefined}
                 />
             )}

             {/* RECEIPT CLAIM MODAL */}
             {claimingExpense && (() => {
                 // Pull the freshest copy of the expense from context so live edits reflect inside the modal
                 const fresh = expenses.find(e => e.id === claimingExpense.id) || claimingExpense;
                 return (
                     <ReceiptClaimModal
                         expense={fresh}
                         onClose={() => setClaimingExpense(null)}
                     />
                 );
             })()}

             {/* ADD EXPENSE CHOICE SHEET */}
             {showChoiceSheet && (
                 <AddExpenseChoiceSheet
                     onClose={() => setShowChoiceSheet(false)}
                     onChooseScan={() => {
                         setShowChoiceSheet(false);
                         setShowScanModal(true);
                     }}
                     onChooseManual={() => {
                         setShowChoiceSheet(false);
                         setEditingExpense(null);
                         setShowExpenseModal(true);
                     }}
                 />
             )}

             {/* SCAN RECEIPT MODAL */}
             {showScanModal && (
                 <ScanReceiptModal
                     onClose={() => setShowScanModal(false)}
                     onCreated={(exp) => {
                         setShowScanModal(false);
                         // Open claim modal so the user can immediately claim their items
                         setClaimingExpense(exp);
                     }}
                 />
             )}
        </div>
    );
};
