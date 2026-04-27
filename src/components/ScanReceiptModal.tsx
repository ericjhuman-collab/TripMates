import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Camera, Image as ImageIcon, Loader2, ReceiptText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import { useEven } from '../context/useEven';
import { uploadReceiptImage } from '../services/receipts';
import { scanReceipt, ScanError } from '../services/ocrService';
import type { Expense, ReceiptItem } from '../services/even';
import heic2any from 'heic2any';
import { downscaleImage } from '../utils/imageDownscale';
import { findPotentialDuplicates } from '../utils/expenseDuplicates';
import { DuplicateWarningModal } from './DuplicateWarningModal';
import styles from './ScanReceiptModal.module.css';

interface Props {
    onClose: () => void;
    onCreated: (expense: Expense) => void;
}

export const ScanReceiptModal: React.FC<Props> = ({ onClose, onCreated }) => {
    const { activeTrip } = useTrip();
    const { appUser } = useAuth();
    const { addExpense, expenses } = useEven();
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [busyMessage, setBusyMessage] = useState('Skannar kvittot…');
    const [error, setError] = useState<string | null>(null);
    const [duplicates, setDuplicates] = useState<Expense[] | null>(null);
    const [pendingExpense, setPendingExpense] = useState<Omit<Expense, 'id' | 'createdAt'> | null>(null);

    const persistExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>) => {
        await addExpense(expenseData);
        onCreated({ ...expenseData, id: '__pending__', createdAt: Date.now() } as Expense);
    };

    const handleConfirmSaveDuplicate = async () => {
        if (!pendingExpense) return;
        setBusy(true);
        setBusyMessage('Sparar…');
        try {
            await persistExpense(pendingExpense);
            setDuplicates(null);
            setPendingExpense(null);
        } catch (e) {
            console.error(e);
            setError('Kunde inte spara kvittot. Försök igen.');
            setBusy(false);
        }
    };

    const handleCancelDuplicate = () => {
        setDuplicates(null);
        setPendingExpense(null);
    };

    const handleFile = async (file: File) => {
        setError(null);
        setBusy(true);
        try {
            // HEIC → JPEG (iOS photos)
            if (file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name)) {
                setBusyMessage('Konverterar bild…');
                try {
                    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
                    const out = Array.isArray(blob) ? blob[0] : blob;
                    file = new File([out], file.name.replace(/\.(heic|heif)$/i, '.jpeg'), { type: 'image/jpeg' });
                } catch {
                    setError('Kunde inte konvertera HEIC-bilden. Försök med en annan bild.');
                    setBusy(false);
                    return;
                }
            }

            setBusyMessage('Laddar upp och skannar…');
            const tripId = activeTrip?.id || 't1';
            const scanFile = await downscaleImage(file);
            const [url, scanResult] = await Promise.all([
                uploadReceiptImage(tripId, file),
                scanReceipt(scanFile)
            ]);

            const targetCurrency = activeTrip?.baseCurrency || 'SEK';
            const totalCents = scanResult.totalAmount ? Math.round(scanResult.totalAmount * 100) : 0;
            const tipCents = scanResult.tip !== null ? Math.round(scanResult.tip * 100) : undefined;
            const taxCents = scanResult.tax !== null ? Math.round(scanResult.tax * 100) : undefined;

            const items: ReceiptItem[] = (scanResult.lineItems || []).map((li, idx) => ({
                id: `item_${Date.now()}_${idx}`,
                description: li.description,
                price: Math.round(li.lineTotal * 100),
                quantity: li.quantity,
                allocations: {}
            }));

            if (items.length === 0) {
                setError('Inga rader hittades på kvittot. Prova manuell registrering eller en tydligare bild.');
                setBusy(false);
                return;
            }

            const expenseData: Omit<Expense, 'id' | 'createdAt'> = {
                tripId,
                description: scanResult.merchantName || 'Kvitto',
                amount: totalCents || items.reduce((acc, it) => acc + it.price, 0) + (tipCents || 0),
                currency: scanResult.currency || targetCurrency,
                date: scanResult.transactionDate || new Date().toISOString().split('T')[0],
                payerId: appUser?.uid || '',
                creatorId: appUser?.uid || '',
                splitType: 'ITEMIZED',
                participants: [],
                category: scanResult.category || undefined,
                receiptUrl: url,
                items,
                ...(tipCents !== undefined ? { tip: tipCents } : {}),
                ...(taxCents !== undefined ? { tax: taxCents } : {}),
                ...(scanResult.merchantName ? { merchantName: scanResult.merchantName } : {}),
                ...(scanResult.transactionDate ? { transactionDate: scanResult.transactionDate } : {}),
            };

            const dups = findPotentialDuplicates(expenseData, expenses);
            if (dups.length > 0) {
                setDuplicates(dups);
                setPendingExpense(expenseData);
                setBusy(false);
                return;
            }

            setBusyMessage('Sparar…');
            await persistExpense(expenseData);
        } catch (e) {
            console.error(e);
            if (e instanceof ScanError) {
                switch (e.reason) {
                    case 'quota-exceeded':
                        setError(e.message);
                        break;
                    case 'rate-limited':
                        setError('Skanningstjänsten är överbelastad just nu. Vänta ett par sekunder och försök igen.');
                        break;
                    case 'image-too-large':
                        setError(e.message);
                        break;
                    case 'unauthenticated':
                        setError(e.message);
                        break;
                    default:
                        setError('Kunde inte skanna kvittot. Försök igen.');
                }
            } else {
                setError('Kunde inte skanna kvittot. Försök igen.');
            }
            setBusy(false);
        }
    };

    const onCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
        e.target.value = '';
    };

    const onGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
        e.target.value = '';
    };

    return (
        <>
            {duplicates && duplicates.length > 0 && (
                <DuplicateWarningModal
                    duplicates={duplicates}
                    onCancel={handleCancelDuplicate}
                    onSaveAnyway={handleConfirmSaveDuplicate}
                    saving={busy}
                />
            )}
            {createPortal(
                <div className={styles.overlay}>
                    <div className={styles.page}>
                <header className={styles.header}>
                    <button className={styles.iconBtn} onClick={onClose} aria-label="Tillbaka" disabled={busy}>
                        <ArrowLeft size={22} />
                    </button>
                    <h2 className={styles.title}>Skanna kvitto</h2>
                    <span className={styles.iconBtnSpacer} />
                </header>

                <div className={styles.body}>
                    <div className={styles.placeholderCard}>
                        {busy ? (
                            <>
                                <div className={styles.iconCircle}>
                                    <Loader2 size={36} className={styles.spin} />
                                </div>
                                <h3 className={styles.placeholderTitle}>{busyMessage}</h3>
                                <p className={styles.placeholderInfo}>Det brukar ta 5–10 sekunder.</p>
                            </>
                        ) : (
                            <>
                                <div className={styles.iconCircle}>
                                    <ReceiptText size={40} />
                                </div>
                                <h3 className={styles.placeholderTitle}>Ladda upp kvitto</h3>
                                <p className={styles.placeholderInfo}>Ta ett foto av ditt kvitto eller välj ett från galleriet</p>
                                {error && <p className={styles.errorText}>{error}</p>}
                            </>
                        )}
                    </div>
                </div>

                <div className={styles.footer}>
                    <button
                        className={styles.primaryBtn}
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={busy}
                    >
                        <Camera size={20} />
                        <span>Ta foto</span>
                    </button>
                    <button
                        className={styles.secondaryBtn}
                        onClick={() => galleryInputRef.current?.click()}
                        disabled={busy}
                    >
                        <ImageIcon size={20} />
                        <span>Välj från galleri</span>
                    </button>
                </div>

                <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={onCameraChange}
                />
                <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={onGalleryChange}
                />
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
