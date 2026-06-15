import { collection, doc, query, where, onSnapshot, getDocs, addDoc, updateDoc, deleteDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

export interface ExpenseParticipant {
  uid: string;
  amount: number; // in cents
}

export interface ReceiptItem {
  id: string;
  description: string;
  price: number; // in cents, total for the row (e.g. 2x at 120 each = 240)
  quantity: number;
  allocations: Record<string, number>; // uid -> number of parts claimed
}

export type SplitType = 'EQUAL' | 'PERCENTAGE' | 'EXACT' | 'ITEMIZED';

export interface Expense {
  id: string;
  tripId: string;
  description: string;
  amount: number; // in cents
  currency: string;
  date: string;
  payerId: string;
  participants: ExpenseParticipant[];
  splitType: SplitType;
  category?: string;
  creatorId?: string;
  receiptUrl?: string;
  items?: ReceiptItem[];
  tip?: number; // in cents, distributed proportionally to claims when splitType=ITEMIZED
  tax?: number; // in cents, informational
  merchantName?: string;
  transactionDate?: string; // ISO YYYY-MM-DD
  createdAt: number;
}

export interface Payment {
  id: string;
  tripId: string;
  fromUid: string;
  toUid: string;
  amount: number; // in cents
  currency: string;
  date: string;
  createdAt: number;
  status: 'PENDING' | 'COMPLETED';
}

// --- Expenses ---

export const subscribeToExpenses = (tripId: string, callback: (expenses: Expense[]) => void) => {
  const q = query(collection(db, 'expenses'), where('tripId', '==', tripId));
  return onSnapshot(q, (snapshot) => {
    const expenses: Expense[] = [];
    snapshot.forEach((doc) => {
      expenses.push({ id: doc.id, ...doc.data() } as Expense);
    });
    // Sort by createdAt descending
    expenses.sort((a, b) => b.createdAt - a.createdAt);
    callback(expenses);
  });
};

export const addExpenseToDb = async (expenseData: Omit<Expense, 'id'>) => {
  return await addDoc(collection(db, 'expenses'), expenseData);
};

export const updateExpenseInDb = async (id: string, updates: Partial<Expense>) => {
  const docRef = doc(db, 'expenses', id);
  return await updateDoc(docRef, updates);
};

export const deleteExpenseFromDb = async (id: string) => {
  const docRef = doc(db, 'expenses', id);
  return await deleteDoc(docRef);
};

// --- Payments ---

export const subscribeToPayments = (tripId: string, callback: (payments: Payment[]) => void) => {
  const q = query(collection(db, 'payments'), where('tripId', '==', tripId));
  return onSnapshot(q, (snapshot) => {
    const payments: Payment[] = [];
    snapshot.forEach((doc) => {
      payments.push({ id: doc.id, ...doc.data() } as Payment);
    });
    payments.sort((a, b) => b.createdAt - a.createdAt);
    callback(payments);
  });
};

export const addPaymentToDb = async (paymentData: Omit<Payment, 'id'>) => {
  return await addDoc(collection(db, 'payments'), paymentData);
};

export const updatePaymentInDb = async (id: string, updates: Partial<Payment>) => {
  const docRef = doc(db, 'payments', id);
  return await updateDoc(docRef, updates);
};

export const batchAddPayments = async (paymentsData: Omit<Payment, 'id'>[]) => {
  const batch = writeBatch(db);
  const colRef = collection(db, 'payments');
  
  paymentsData.forEach(p => {
    const newDocRef = doc(colRef);
    batch.set(newDocRef, p);
  });
  
  return await batch.commit();
};

// Deterministic doc ID for a pending settle-up payment so that two clients
// running settle-up concurrently converge to the same docs instead of each
// inserting their own auto-ID duplicates (which produced the "tripplade
// transaktioner" symptom on the Milano trip).
export const pendingPaymentDocId = (tripId: string, fromUid: string, toUid: string) =>
  `pending_${tripId}_${fromUid}_${toUid}`;

export interface SimplifiedDebt {
  fromUid: string; // debtor
  toUid: string;   // creditor
  amount: number;  // in cents, > 0
}

// Greedy two-pointer matching of debtors to creditors. Pure function so the
// Balances UI can show a live breakdown that always matches userBalances,
// independent of the persisted (potentially stale) pending payments.
// Sort order matches triggerSettleUp so the in-memory result is identical to
// what a fresh Settle Up would produce.
export const computeSimplifiedDebts = (balances: Record<string, number>): SimplifiedDebt[] => {
  const debtors: { uid: string; amount: number }[] = [];
  const creditors: { uid: string; amount: number }[] = [];

  for (const [uid, bal] of Object.entries(balances)) {
    if (bal < 0) debtors.push({ uid, amount: -bal });
    else if (bal > 0) creditors.push({ uid, amount: bal });
  }

  debtors.sort((a, b) => b.amount - a.amount || a.uid.localeCompare(b.uid));
  creditors.sort((a, b) => b.amount - a.amount || a.uid.localeCompare(b.uid));

  const result: SimplifiedDebt[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const minAmount = Math.min(debtor.amount, creditor.amount);
    if (minAmount > 0) {
      result.push({ fromUid: debtor.uid, toUid: creditor.uid, amount: minAmount });
    }
    debtor.amount -= minAmount;
    creditor.amount -= minAmount;
    if (debtor.amount < 1) i++;
    if (creditor.amount < 1) j++;
  }
  return result;
};

export const replacePendingPayments = async (tripId: string, newPaymentsData: Omit<Payment, 'id'>[]) => {
  const colRef = collection(db, 'payments');

  // Map deterministic-id -> desired payment for this settle-up.
  const desired = new Map<string, Omit<Payment, 'id'>>();
  for (const p of newPaymentsData) {
    desired.set(pendingPaymentDocId(tripId, p.fromUid, p.toUid), p);
  }

  // Read existing pending docs so we can delete the ones that are no longer
  // part of the new desired set (e.g. legacy auto-ID docs from before this
  // deterministic-ID scheme, or pairs that are now balanced).
  const q = query(colRef, where('tripId', '==', tripId), where('status', '==', 'PENDING'));
  const snapshot = await getDocs(q);

  const batch = writeBatch(db);

  snapshot.forEach(docSnap => {
    if (!desired.has(docSnap.id)) {
      batch.delete(docSnap.ref);
    }
  });

  // Upsert the desired set. Concurrent callers compute the same set and write
  // to the same doc IDs, so the second writer overwrites with identical data —
  // no duplicates.
  for (const [id, payment] of desired) {
    batch.set(doc(colRef, id), payment);
  }

  return await batch.commit();
};

// Mark a PENDING settle-up payment as COMPLETED by moving it to a fresh
// auto-ID doc. We can't just flip status in-place: the pending doc lives at a
// deterministic ID that a future settle-up needs to be free to reuse, and
// overwriting a completed audit record would be wrong.
export const markPendingPaymentCompleted = async (pending: Payment, completedAt: string) => {
  const batch = writeBatch(db);
  const colRef = collection(db, 'payments');

  batch.delete(doc(colRef, pending.id));

  const newRef = doc(colRef);
  const { id: _id, ...rest } = pending;
  void _id;
  batch.set(newRef, {
    ...rest,
    status: 'COMPLETED',
    date: completedAt,
  });

  return await batch.commit();
};

// --- Ready to Settle (per-member toggle) ---

export interface ReadyToSettle {
  uid: string;
  readyAt: number;
}

export const subscribeToReadyToSettle = (
  tripId: string,
  callback: (entries: ReadyToSettle[]) => void,
) => {
  const colRef = collection(db, 'trips', tripId, 'readyToSettle');
  return onSnapshot(colRef, snapshot => {
    const entries: ReadyToSettle[] = [];
    snapshot.forEach(d => {
      const data = d.data() as { readyAt?: number };
      if (typeof data.readyAt === 'number') {
        entries.push({ uid: d.id, readyAt: data.readyAt });
      }
    });
    callback(entries);
  });
};

export const setMyReadyToSettle = async (tripId: string, uid: string, ready: boolean) => {
  const docRef = doc(db, 'trips', tripId, 'readyToSettle', uid);
  if (ready) {
    await setDoc(docRef, { readyAt: Date.now() });
  } else {
    await deleteDoc(docRef);
  }
};
