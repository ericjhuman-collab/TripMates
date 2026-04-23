import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import { useEven } from '../context/useEven';
import { type Expense } from '../services/even';
import { getCategoryById } from '../utils/categories';
import { ReceiptText, ChevronDown, Plus } from 'lucide-react';
import styles from './Even.module.css';
import { ExpenseModal } from '../components/ExpenseModal';
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
    const { expenses, payments, participants, totalTripCost, userBalances, triggerSettleUp, updatePayment, isSettled } = useEven();
    const [activeTab, setActiveTab] = useState<TabView>('EXPENSES');
    const [infoModal, setInfoModal] = useState<{title: string, content: React.ReactNode} | null>(null);
    const [showSettleModal, setShowSettleModal] = useState(false);
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
    const [isZoomed, setIsZoomed] = useState(false);
    const [confirmPaymentId, setConfirmPaymentId] = useState<string | null>(null);

    // Helper to format currency
    const formatCurrency = (amountInCents: number) => {
        const formatted = new Intl.NumberFormat('sv-SE').format(Math.round(amountInCents / 100));
        return `${formatted} ${activeTrip?.baseCurrency || 'SEK'}`;
    };

    const renderExpenses = () => (
        <div className={styles.tabContent}>

            <p className={styles.dateSeparator}>AUG 2025</p>

            <div className={styles.list}>
                {expenses.map(expense => {
                    const payer = participants.find(p => p.uid === expense.payerId);
                    const canEdit = !isSettled && (appUser?.uid === expense.payerId || appUser?.uid === expense.creatorId);
                    return (
                        <div 
                            key={expense.id} 
                            className={`${styles.card} ${canEdit ? styles.cursorPointer : styles.cursorDefault}`}
                            {...(canEdit ? { onClick: () => { setEditingExpense(expense); setShowExpenseModal(true); } } : {})}
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
                                    <h4 className={styles.expenseTitle}>{expense.description}</h4>
                                    <p className={styles.expenseDate}>Wednesday, Aug 20</p>
                                </div>
                                <div className={styles.expenseAmount}>
                                    {formatCurrency(expense.amount)}
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
                    return (
                        <div key={p.uid} className={styles.cardSmall}>
                            <div className={styles.balanceRow}>
                                <Avatar participant={p} className={styles.avatarSmall} />
                                <span className={styles.participantName}>{p.shortName || p.name}</span>
                                <div className={styles.balanceAmountWrapper}>
                                    <span className={`${styles.balanceAmount} ${balance > 0 ? styles.positive : balance < 0 ? styles.negative : ''}`}>
                                        {formatCurrency(Math.abs(balance))} {balance < 0 && 'owes'}
                                    </span>
                                    <ChevronDown size={20} className={styles.chevron} />
                                </div>
                            </div>
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
                                        <span className={`${styles.paymentAmount} ${styles.paymentAmountUnpaid}`}>{formatCurrency(payment.amount)}</span>
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
                                        <span className={styles.paymentAmount}>{formatCurrency(payment.amount)}</span>
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
                     <span className={styles.totalCost}>Total expenses: {formatCurrency(totalTripCost)}</span>
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
                 <button className={styles.fabButton} title="Add Expense" onClick={() => { setEditingExpense(null); setShowExpenseModal(true); }}>
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
                <div className={styles.modalOverlay} onClick={() => { setViewingReceipt(null); setIsZoomed(false); }}>
                    <div className={`${styles.modalContent} ${styles.receiptModalContent}`} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalCloseOuter}>
                            <button 
                                className={styles.modalCloseInner} 
                                onClick={() => { setViewingReceipt(null); setIsZoomed(false); }}
                                aria-label="Close receipt"
                            >&times;</button>
                            
                            <div 
                                className={`${styles.zoomContainer} ${isZoomed ? styles.zoomContainerOpen : styles.zoomContainerClosed}`}
                            >
                                <img 
                                    src={viewingReceipt} 
                                    alt="Receipt Full Size" 
                                    onClick={() => setIsZoomed(!isZoomed)}
                                    className={`${styles.receiptImg} ${isZoomed ? styles.zoomedIn : styles.zoomedOut}`}
                                />
                            </div>
                        </div>
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
        </div>
    );
};
