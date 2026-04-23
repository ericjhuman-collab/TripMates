import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import { currencyService } from '../services/currencyService';
import { uploadReceiptImage } from '../services/receipts';
import { scanReceipt } from '../services/ocrService';
import { SUPPORTED_CURRENCIES } from '../utils/currencies';
import { X, Camera } from 'lucide-react';
import { useEven } from '../context/useEven';
import { type SplitType, type ExpenseParticipant, type Expense } from '../services/even';
import { EXPENSE_CATEGORIES } from '../utils/categories';
import { CustomSelect } from './CustomSelect';
import styles from './ExpenseModal.module.css';
import heic2any from 'heic2any';

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
    const { activeTrip } = useTrip();
    const { appUser } = useAuth();
    const { participants, addExpense, updateExpense } = useEven();
    
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
    
    const [splitMode, setSplitMode] = useState<SplitType>(initialExpense?.splitType || 'EQUAL');
    
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

    // Validation
    const validationError = useMemo(() => {
        if (totalAmountCents <= 0) return 'Please enter a valid amount greater than 0.';
        
        if (splitMode === 'EQUAL') {
            const numSelected = Object.values(allocations).filter(v => v === true).length;
            if (numSelected === 0) return 'At least one person must be included in the split.';
        }
        else if (splitMode === 'EXACT') {
            const sumStr = participants.reduce((acc, p) => acc + (parseFloat(String(allocations[p.uid] ?? '')) || 0), 0);
            const sumCents = Math.round(sumStr * 100);
            if (sumCents !== totalAmountCents) {
                return `Exact amounts must add up to the total. Current sum: ${Math.round(sumCents/100)} ${selectedCurrency}`;
            }
        }
        else if (splitMode === 'PERCENTAGE') {
            const sumPct = participants.reduce((acc, p) => acc + (parseFloat(String(allocations[p.uid] ?? '')) || 0), 0);
            if (Math.abs(sumPct - 100) > 0.01) {
                return `Percentages must add up to 100%. Current sum: ${sumPct}%`;
            }
        }

        return null;
    }, [totalAmountCents, splitMode, allocations, participants, selectedCurrency]);

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
                    alert("Nu kunde vi inte konvertera HEIC-bilden. Försök med en annan bild.");
                    return;
                }
            }

            // Start both upload and scan asynchronously
            const uploadPromise = uploadReceiptImage(activeTrip?.id || 't1', file);
            const scanPromise = scanReceipt(file);

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
        } catch (error) {
            console.error("Failed to upload/scan receipt", error);
            alert("Failed to process receipt.");
        } finally {
            setIsUploadingReceipt(false);
            setIsScanning(false);
        }
    };

    const handleSubmit = async () => {
        if (validationError) return;

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

            if (splitMode === 'EQUAL') {
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

            const finalTotalCents = finalParticipants.reduce((acc, p) => acc + p.amount, 0);

            const expenseData = {
                tripId: activeTrip?.id || 't1',
                description,
                amount: finalTotalCents, // saved in base currency
                currency: targetCurrency, // always the trip's internal currency
                category: selectedCategory || undefined,
                creatorId: initialExpense?.creatorId || appUser?.uid || '',
                date: initialExpense?.date || new Date().toISOString().split('T')[0],
                payerId,
                splitType: splitMode,
                participants: finalParticipants,
                receiptUrl: receiptUrl || undefined
            };

            // Send to context
            if (initialExpense) {
                updateExpense(initialExpense.id, expenseData);
            } else {
                addExpense(expenseData);
            }

            onClose();
        } catch(e) {
            console.error(e);
            alert("Could not complete currency conversion. Please check your connection.");
        } finally {
            setIsSaving(false);
        }
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

                    <div className={styles.formGroup}>
                        <label className={styles.inputLabel}>Split details</label>
                        <div className={styles.splitTabs}>
                            {(['EQUAL', 'EXACT', 'PERCENTAGE'] as SplitType[]).map(mode => (
                                <button 
                                    key={mode}
                                    className={`${styles.splitTab} ${splitMode === mode ? styles.splitTabActive : ''}`}
                                    onClick={() => handleSplitModeChange(mode)}
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
                    {validationError && (
                        <p className={styles.validationError}>{validationError}</p>
                    )}
                    <button 
                        className={styles.submitBtn} 
                        disabled={!!validationError || isSaving}
                        onClick={handleSubmit}
                    >
                        {isSaving ? 'Calculating...' : 'Save Expense'}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalHtml, document.body);
};
