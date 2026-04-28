import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import { currencyService } from '../services/currencyService';
import { uploadReceiptImage } from '../services/receipts';
import { scanReceipt, ScanError, type ParsedLineItem } from '../services/ocrService';
import { SUPPORTED_CURRENCIES } from '../utils/currencies';
import { X, Camera } from 'lucide-react';
import { useEven } from '../context/useEven';
import { type SplitType, type ExpenseParticipant, type Expense, type ReceiptItem } from '../services/even';
import { EXPENSE_CATEGORIES } from '../utils/categories';
import { CustomSelect } from './CustomSelect';
import styles from './ExpenseModal.module.css';
import heic2any from 'heic2any';
import { downscaleImage } from '../utils/imageDownscale';
import { findPotentialDuplicates } from '../utils/expenseDuplicates';
import { DuplicateWarningModal } from './DuplicateWarningModal';
import { useToast } from './Toast';

interface ExpenseModalProps {
    onClose: () => void;
    initialExpense?: Expense;
}

interface ParticipantLike {
    name?: string;
    initials: string;
    color?: string;
    photoURL?: string;
}

const Avatar = ({ participant, className }: { participant: ParticipantLike, className: string }) => {
    return (
        <div className={className} style={{ backgroundColor: participant.photoURL ? 'transparent' : participant.color }}>
            {participant.photoURL ? (
                <img src={participant.photoURL} alt={participant.name} className={styles.avatarImg} />
            ) : (
                participant.initials
            )}
        </div>
    );
};

export const ExpenseModal: React.FC<ExpenseModalProps> = ({ onClose, initialExpense }) => {
    const toast = useToast();
    const { activeTrip } = useTrip();
    const { appUser } = useAuth();
    const { participants, addExpense, updateExpense, expenses } = useEven();
    
    const targetCurrency = activeTrip?.baseCurrency || 'SEK';
    
    // Default Payer to first participant or logged-in user if available
    const defaultPayerId = initialExpense?.payerId || (participants.length > 0 ? participants[0].uid : '');

    // default description if needed elsewhere
    const description = initialExpense?.description || 'Shared Expense';
    const [amountStr, setAmountStr] = useState(initialExpense ? (initialExpense.amount / 100).toString() : '');
    const [selectedCurrency, setSelectedCurrency] = useState(initialExpense?.currency || targetCurrency);
    const [selectedCategory, setSelectedCategory] = useState(initialExpense?.category || '');
    const [receiptUrl, setReceiptUrl] = useState<string>(initialExpense?.receiptUrl || '');
    const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [payerId, setPayerId] = useState(defaultPayerId);
    
    const [isSaving, setIsSaving] = useState(false);
    const [duplicates, setDuplicates] = useState<Expense[] | null>(null);
    const [pendingExpense, setPendingExpense] = useState<Omit<Expense, 'id' | 'createdAt'> | null>(null);
    
    const [splitMode, setSplitMode] = useState<SplitType>(initialExpense?.splitType || 'EQUAL');

    // Itemized-split state — populated when scan returns line items
    const [parsedLineItems, setParsedLineItems] = useState<ParsedLineItem[]>([]);
    const [parsedTip, setParsedTip] = useState<number | null>(null);
    const [parsedTax, setParsedTax] = useState<number | null>(null);
    const [parsedMerchantName, setParsedMerchantName] = useState<string | null>(null);
    const [parsedTransactionDate, setParsedTransactionDate] = useState<string | null>(null);
    const [useItemizedSplit, setUseItemizedSplit] = useState<boolean>(initialExpense?.splitType === 'ITEMIZED');
    
    // Allocations logic
    // For EQUAL: Map of uid -> boolean (is included in split)
    // For EXACT/PERCENTAGE: Map of uid -> string (the amount or percentage value entered)
    const [allocations, setAllocations] = useState<Record<string, boolean | string>>({});

    // Initialize allocations cleanly based on mode or initialExpense
    useEffect(() => {
        const initialMap: Record<string, boolean | string> = {};
        if (initialExpense) {
            if (initialExpense.splitType === 'EQUAL') {
                participants.forEach(p => initialMap[p.uid] = false);
                initialExpense.participants.forEach(p => initialMap[p.uid] = true);
            } else if (initialExpense.splitType === 'EXACT') {
                participants.forEach(p => initialMap[p.uid] = '');
                initialExpense.participants.forEach(p => initialMap[p.uid] = (p.amount / 100).toString());
            } else if (initialExpense.splitType === 'PERCENTAGE') {
                participants.forEach(p => initialMap[p.uid] = '');
                initialExpense.participants.forEach(p => {
                    const pct = (p.amount / initialExpense.amount) * 100;
                    initialMap[p.uid] = parseFloat(pct.toFixed(2)).toString();
                });
            }
        } else {
            participants.forEach(p => initialMap[p.uid] = true);
        }
        setAllocations(initialMap);
    }, [participants, initialExpense]);

    // Handle Split Mode Change - reset allocations data cleanly
    const handleSplitModeChange = (mode: SplitType) => {
        setSplitMode(mode);
        const map: Record<string, boolean | string> = {};
        if (mode === 'EQUAL') {
            participants.forEach(p => map[p.uid] = true);
        } else {
            participants.forEach(p => map[p.uid] = '');
        }
        setAllocations(map);
    };

    // Calculate total numeric amount
    const totalAmountCents = useMemo(() => {
        const floatAmount = parseFloat(amountStr) || 0;
        return Math.round(floatAmount * 100);
    }, [amountStr]);

    // Validation. Two categories:
    //  - blocking: hard errors that must be fixed before save (missing amount,
    //    empty participants, itemized with no rows).
    //  - warning:  soft mismatch the user can override (EXACT sum off, % != 100).
    //    Surfaced inline AND blocks the first save attempt with a confirm modal.
    const { blockingError, warningMessage } = useMemo<{ blockingError: string | null; warningMessage: string | null }>(() => {
        if (totalAmountCents <= 0) return { blockingError: 'Please enter a valid amount greater than 0.', warningMessage: null };

        if (useItemizedSplit) {
            if (parsedLineItems.length === 0) return { blockingError: 'Inga poster hittades — slå av itemized eller scanna ett tydligare kvitto.', warningMessage: null };
            return { blockingError: null, warningMessage: null };
        }

        if (splitMode === 'EQUAL') {
            const numSelected = Object.values(allocations).filter(v => v === true).length;
            if (numSelected === 0) return { blockingError: 'At least one person must be included in the split.', warningMessage: null };
        }
        else if (splitMode === 'EXACT') {
            const sumStr = participants.reduce((acc, p) => acc + (parseFloat(String(allocations[p.uid] ?? '')) || 0), 0);
            const sumCents = Math.round(sumStr * 100);
            if (sumCents !== totalAmountCents) {
                const diffCents = sumCents - totalAmountCents;
                const sign = diffCents > 0 ? '+' : '';
                return {
                    blockingError: null,
                    warningMessage: `The exact amounts add up to ${(sumCents/100).toFixed(2)} ${selectedCurrency} (${sign}${(diffCents/100).toFixed(2)} vs the total ${(totalAmountCents/100).toFixed(2)} ${selectedCurrency}).`,
                };
            }
        }
        else if (splitMode === 'PERCENTAGE') {
            const sumPct = participants.reduce((acc, p) => acc + (parseFloat(String(allocations[p.uid] ?? '')) || 0), 0);
            if (Math.abs(sumPct - 100) > 0.01) {
                const diff = sumPct - 100;
                const sign = diff > 0 ? '+' : '';
                return {
                    blockingError: null,
                    warningMessage: `The percentages add up to ${sumPct.toFixed(2)}% (${sign}${diff.toFixed(2)}% vs 100%).`,
                };
            }
        }

        return { blockingError: null, warningMessage: null };
    }, [totalAmountCents, splitMode, allocations, participants, selectedCurrency, useItemizedSplit, parsedLineItems]);

    const [showSplitWarning, setShowSplitWarning] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        let file = e.target.files[0];
        
        setIsUploadingReceipt(true);
        setIsScanning(true);
        try {
            // Intercept HEIC/HEIF files and convert to JPEG
            if (file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name)) {
                try {
                    const convertedBlob = await heic2any({
                        blob: file,
                        toType: "image/jpeg",
                        quality: 0.8 // Good balance of size/quality for scanning
                    });
                    // heic2any can return an array if multiple images, we take the first or the only one
                    const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                    
                    // Recreate a standard File object from the blob
                    file = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpeg'), {
                        type: 'image/jpeg'
                    });
                } catch (conversionError) {
                    console.error("Failed to convert HEIC to JPEG:", conversionError);
                    toast.error("Nu kunde vi inte konvertera HEIC-bilden. Försök med en annan bild.");
                    return;
                }
            }

            // Start both upload and scan asynchronously. The scan gets a downscaled copy
            // (smaller payload → faster upload to the OCR function); Storage gets the original.
            const scanFile = await downscaleImage(file);
            const uploadPromise = uploadReceiptImage(activeTrip?.id || 't1', file);
            const scanPromise = scanReceipt(scanFile);

            // Wait for both
            const [url, scanResult] = await Promise.all([uploadPromise, scanPromise]);
            
            setReceiptUrl(url);

            // Autofill values if found
            if (scanResult.totalAmount) {
                setAmountStr(scanResult.totalAmount.toString());
            }
            if (scanResult.currency && SUPPORTED_CURRENCIES.some(c => c.code === scanResult.currency)) {
                setSelectedCurrency(scanResult.currency);
            }
            if (scanResult.category) {
                setSelectedCategory(scanResult.category);
            }
            setParsedLineItems(scanResult.lineItems || []);
            setParsedTip(scanResult.tip ?? null);
            setParsedTax(scanResult.tax ?? null);
            setParsedMerchantName(scanResult.merchantName ?? null);
            setParsedTransactionDate(scanResult.transactionDate ?? null);
            // Auto-enable itemized split when we get usable line items so the user sees the option immediately
            if (scanResult.lineItems && scanResult.lineItems.length > 0) {
                setUseItemizedSplit(true);
            }
        } catch (error) {
            console.error("Failed to upload/scan receipt", error);
            if (error instanceof ScanError) {
                switch (error.reason) {
                    case 'quota-exceeded':
                        toast.error(error.message);
                        break;
                    case 'rate-limited':
                        toast.error('Skanningstjänsten är överbelastad just nu. Vänta ett par sekunder och försök igen.');
                        break;
                    case 'image-too-large':
                        toast.error(error.message);
                        break;
                    default:
                        toast.error('Kunde inte bearbeta kvittot. Försök igen.');
                }
            } else {
                toast.error('Kunde inte bearbeta kvittot. Försök igen.');
            }
        } finally {
            setIsUploadingReceipt(false);
            setIsScanning(false);
        }
    };

    const handleSubmit = async (overrideWarning = false) => {
        if (blockingError) return;
        if (warningMessage && !overrideWarning) {
            setShowSplitWarning(true);
            return;
        }
        setShowSplitWarning(false);

        setIsSaving(true);
        try {
            const needsConversion = selectedCurrency !== targetCurrency;
            let convertedTotalCents = totalAmountCents;

            if (needsConversion && totalAmountCents > 0) {
                const cvtFloat = await currencyService.convert(totalAmountCents / 100, selectedCurrency, targetCurrency);
                convertedTotalCents = Math.round(cvtFloat * 100);
            }

            // Build exact splitting
            let finalParticipants: ExpenseParticipant[] = [];
            let finalItems: ReceiptItem[] | undefined;
            let finalTipCents: number | undefined;
            let finalTaxCents: number | undefined;

            if (useItemizedSplit) {
                // Scale item/tip/tax prices by the same conversion factor as the total so cents add up.
                const factor = needsConversion && totalAmountCents > 0
                    ? convertedTotalCents / totalAmountCents
                    : 1;
                finalItems = parsedLineItems.map((li, idx) => ({
                    id: `item_${Date.now()}_${idx}`,
                    description: li.description,
                    price: Math.round(li.lineTotal * 100 * factor),
                    quantity: li.quantity,
                    allocations: {}
                }));
                finalTipCents = parsedTip !== null ? Math.round(parsedTip * 100 * factor) : undefined;
                finalTaxCents = parsedTax !== null ? Math.round(parsedTax * 100 * factor) : undefined;
                // participants stays empty — claims fill it in dynamically via items[].allocations
            } else if (splitMode === 'EQUAL') {
                const selectedUids = participants.filter(p => allocations[p.uid] === true).map(p => p.uid);
                const rawSplitCents = Math.floor(convertedTotalCents / selectedUids.length);
                let remainderCents = convertedTotalCents - (rawSplitCents * selectedUids.length);

                finalParticipants = selectedUids.map(uid => {
                    let amt = rawSplitCents;
                    if (uid === payerId) {
                        amt += remainderCents;
                        remainderCents = 0;
                    }
                    return { uid, amount: amt };
                });

                if (remainderCents > 0 && finalParticipants.length > 0) {
                     finalParticipants[0].amount += remainderCents;
                }

            } else if (splitMode === 'EXACT') {
                const promises = participants.map(async p => {
                    const val = parseFloat(String(allocations[p.uid] ?? '')) || 0;
                    if (val <= 0) return { uid: p.uid, amount: 0 };
                    
                    let amountCents = Math.round(val * 100);
                    if (needsConversion) {
                        amountCents = Math.round(await currencyService.convert(val, selectedCurrency, targetCurrency) * 100);
                    }
                    return { uid: p.uid, amount: amountCents };
                });
                finalParticipants = (await Promise.all(promises)).filter(p => p.amount > 0);

            } else if (splitMode === 'PERCENTAGE') {
                let runningSumCents = 0;
                finalParticipants = participants.map((p, idx) => {
                    const pct = parseFloat(String(allocations[p.uid] ?? '')) || 0;
                    
                    if (idx === participants.length - 1 && pct > 0) {
                         const amt = convertedTotalCents - runningSumCents;
                         return { uid: p.uid, amount: amt > 0 ? amt : 0 };
                    }
                    
                    const amtParts = Math.round(convertedTotalCents * (pct / 100));
                    runningSumCents += amtParts;
                    return { uid: p.uid, amount: amtParts };
                }).filter(p => p.amount > 0);
            }

            const finalTotalCents = useItemizedSplit
                ? convertedTotalCents
                : finalParticipants.reduce((acc, p) => acc + p.amount, 0);

            const expenseData: Omit<Expense, 'id' | 'createdAt'> = {
                tripId: activeTrip?.id || 't1',
                description: parsedMerchantName || description,
                amount: finalTotalCents, // saved in base currency
                currency: targetCurrency, // always the trip's internal currency
                creatorId: initialExpense?.creatorId || appUser?.uid || '',
                date: initialExpense?.date || new Date().toISOString().split('T')[0],
                payerId,
                splitType: useItemizedSplit ? 'ITEMIZED' : splitMode,
                participants: finalParticipants,
                // Optional fields — only include when defined. Firestore rejects undefined values.
                ...(selectedCategory ? { category: selectedCategory } : {}),
                ...(receiptUrl ? { receiptUrl } : {}),
                ...(finalItems ? { items: finalItems } : {}),
                ...(finalTipCents !== undefined ? { tip: finalTipCents } : {}),
                ...(finalTaxCents !== undefined ? { tax: finalTaxCents } : {}),
                ...(parsedMerchantName ? { merchantName: parsedMerchantName } : {}),
                ...(parsedTransactionDate ? { transactionDate: parsedTransactionDate } : {}),
            };

            // Check for potential duplicates before persisting (skip when editing self)
            const dupCandidate = initialExpense
                ? { ...expenseData, id: initialExpense.id }
                : expenseData;
            const dups = findPotentialDuplicates(dupCandidate, expenses);
            if (dups.length > 0) {
                setDuplicates(dups);
                setPendingExpense(expenseData);
                setIsSaving(false);
                return;
            }

            await persistExpense(expenseData);
            onClose();
        } catch (e) {
            console.error('Failed to save expense', e);
            const msg = e instanceof Error ? e.message : 'Unknown error';
            toast.error(`Could not save expense: ${msg}`);
        } finally {
            setIsSaving(false);
        }
    };

    const persistExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>) => {
        if (initialExpense) {
            await updateExpense(initialExpense.id, expenseData);
        } else {
            await addExpense(expenseData);
        }
    };

    const handleConfirmSaveDuplicate = async () => {
        if (!pendingExpense) return;
        setIsSaving(true);
        try {
            await persistExpense(pendingExpense);
            setDuplicates(null);
            setPendingExpense(null);
            onClose();
        } catch (e) {
            console.error(e);
            toast.error("Kunde inte spara kostnaden. Försök igen.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancelDuplicate = () => {
        setDuplicates(null);
        setPendingExpense(null);
    };

    const modalHtml = (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                
                <div className={styles.modalHeader}>
                    <h2 className={styles.modalTitle}>{initialExpense ? 'Edit Expense' : 'Add Expense'}</h2>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
                        <X size={24} />
                    </button>
                </div>

                <div className={styles.modalBody}>
                    <div className={styles.amountGroup}>
                        <div className={styles.amountInputWrapper}>
                            <input 
                                type="number" 
                                className={styles.mainAmountInput} 
                                placeholder="0" 
                                value={amountStr}
                                onChange={e => setAmountStr(e.target.value)}
                                min="0" step="0.01"
                                autoFocus
                            />
                            <div className={styles.currencySelectWrapper}>
                                <CustomSelect 
                                    className={styles.currencySelectField}
                                    value={selectedCurrency}
                                    onChange={setSelectedCurrency}
                                    options={SUPPORTED_CURRENCIES.map(c => ({
                                        value: c.code,
                                        label: c.code,
                                        subLabel: c.name
                                    }))}
                                />
                            </div>
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Category</label>
                        <CustomSelect 
                            className={styles.payerSelect}
                            value={selectedCategory}
                            onChange={setSelectedCategory}
                            options={EXPENSE_CATEGORIES.map(c => ({
                                value: c.id,
                                label: `${c.icon} ${c.name}`
                            }))}
                            placeholder="Select a category..."
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Paid by</label>
                        <CustomSelect 
                            className={styles.payerSelect}
                            value={payerId}
                            onChange={setPayerId}
                            options={participants.map(p => ({
                                value: p.uid,
                                label: p.name || 'Unknown User'
                            }))}
                        />
                    </div>

                    {parsedLineItems.length > 0 && (
                        <div className={styles.formGroup}>
                            <label className={styles.inputLabel}>
                                <input
                                    type="checkbox"
                                    checked={useItemizedSplit}
                                    onChange={e => setUseItemizedSplit(e.target.checked)}
                                    style={{ marginRight: 8, verticalAlign: 'middle' }}
                                />
                                Splita per post ({parsedLineItems.length} st upptäckta)
                            </label>
                            <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '4px 0 0 26px' }}>
                                Medlemmarna väljer själva sina poster i kvittovyn — dricks fördelas proportionellt.
                            </p>
                        </div>
                    )}

                    <div className={styles.formGroup} style={useItemizedSplit ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
                        <label className={styles.inputLabel}>Split details</label>
                        <div className={styles.splitTabs}>
                            {(['EQUAL', 'EXACT', 'PERCENTAGE'] as SplitType[]).map(mode => (
                                <button
                                    key={mode}
                                    className={`${styles.splitTab} ${splitMode === mode ? styles.splitTabActive : ''}`}
                                    onClick={() => handleSplitModeChange(mode)}
                                    disabled={useItemizedSplit}
                                >
                                    {mode === 'EQUAL' ? 'Equally' : mode === 'EXACT' ? 'Exact' : 'Percentage'}
                                </button>
                            ))}
                        </div>

                        <div className={styles.participantList}>
                            {participants.map(p => (
                                <div key={p.uid} className={styles.participantRow}>
                                    <Avatar participant={p} className={styles.avatarSmall} />
                                    <span className={styles.participantName}>{p.name}</span>
                                    
                                    <div className={styles.participantInput}>
                                        {splitMode === 'EQUAL' && (
                                            <input
                                                type="checkbox"
                                                className={styles.checkbox}
                                                checked={allocations[p.uid] === true}
                                                onChange={e => setAllocations(prev => ({ ...prev, [p.uid]: e.target.checked }))}
                                                aria-label={`Include ${p.name} in equal split`}
                                            />
                                        )}
                                        {splitMode === 'EXACT' && (
                                            <>
                                                <input
                                                    type="number"
                                                    className={styles.smallNumInput}
                                                    placeholder="0"
                                                    min="0" step="0.01"
                                                    value={typeof allocations[p.uid] === 'string' ? allocations[p.uid] as string : ''}
                                                    onChange={e => setAllocations(prev => ({ ...prev, [p.uid]: e.target.value }))}
                                                    aria-label={`Exact amount for ${p.name}`}
                                                />
                                                <span className={styles.currencyLabelSmall}>{selectedCurrency}</span>
                                            </>
                                        )}
                                        {splitMode === 'PERCENTAGE' && (
                                            <>
                                                <input
                                                    type="number"
                                                    className={styles.smallNumInput}
                                                    placeholder="0"
                                                    min="0" max="100" step="1"
                                                    value={typeof allocations[p.uid] === 'string' ? allocations[p.uid] as string : ''}
                                                    onChange={e => setAllocations(prev => ({ ...prev, [p.uid]: e.target.value }))}
                                                    aria-label={`Percentage for ${p.name}`}
                                                />
                                                <span className={styles.currencyLabelSmall}>%</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Receipt (Optional)</label>
                        <div className={styles.receiptUploadContainer}>
                            {receiptUrl ? (
                                <div className={styles.receiptPreview}>
                                    <img src={receiptUrl} alt="Receipt preview" className={styles.receiptImage} />
                                    <button 
                                        type="button" 
                                        className={styles.removeReceiptBtn} 
                                        onClick={() => setReceiptUrl('')}
                                        aria-label="Remove receipt"
                                    >
                                        <X size={16} color="white" />
                                    </button>
                                </div>
                            ) : (
                                <label className={styles.uploadBox}>
                                    <input 
                                        type="file" 
                                        accept="image/*,.heic,.heif" 
                                        capture="environment" 
                                        className={styles.fileInput}
                                        onChange={handleFileChange}
                                        disabled={isUploadingReceipt || isScanning}
                                    />
                                    <div className={styles.uploadBoxContent}>
                                        <Camera size={24} color="#888" />
                                        <span>{isScanning ? 'Scanning Receipt...' : isUploadingReceipt ? 'Uploading...' : 'Take or upload photo'}</span>
                                    </div>
                                </label>
                            )}
                        </div>
                    </div>
                </div>

                <div className={styles.modalFooter}>
                    {blockingError && (
                        <p className={styles.validationError}>{blockingError}</p>
                    )}
                    {!blockingError && warningMessage && (
                        <p className={styles.validationError} style={{ color: '#a16207' }}>{warningMessage}</p>
                    )}
                    <button
                        className={styles.submitBtn}
                        disabled={!!blockingError || isSaving}
                        onClick={() => handleSubmit(false)}
                    >
                        {isSaving ? 'Calculating...' : 'Save Expense'}
                    </button>
                </div>

                {showSplitWarning && warningMessage && (
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Confirm save with split mismatch"
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
                        onClick={() => setShowSplitWarning(false)}
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{ background: '#fff', borderRadius: 16, padding: '1.5rem', maxWidth: 420, width: '92%', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
                        >
                            <h3 style={{ margin: '0 0 0.75rem', color: '#92400e' }}>Split doesn't match</h3>
                            <p style={{ color: '#374151', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1rem' }}>{warningMessage}</p>
                            <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>
                                Save anyway? You can adjust the splits later.
                            </p>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => setShowSplitWarning(false)}
                                    style={{ background: '#e5e7eb', color: '#1f2937' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => handleSubmit(true)}
                                    style={{ background: '#d97706', color: '#fff' }}
                                >
                                    Save anyway
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <>
            {createPortal(modalHtml, document.body)}
            {duplicates && duplicates.length > 0 && (
                <DuplicateWarningModal
                    duplicates={duplicates}
                    onCancel={handleCancelDuplicate}
                    onSaveAnyway={handleConfirmSaveDuplicate}
                    saving={isSaving}
                />
            )}
        </>
    );
};
