import { collection, doc, query, where, onSnapshot, getDocs, addDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
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

export const replacePendingPayments = async (tripId: string, newPaymentsData: Omit<Payment, 'id'>[]) => {
  const batch = writeBatch(db);
  const colRef = collection(db, 'payments');
  
  // Find all existing PENDING payments for this trip
  const q = query(colRef, where('tripId', '==', tripId), where('status', '==', 'PENDING'));
  const snapshot = await getDocs(q);
  
  // Delete them via batch
  snapshot.forEach(docSnapshot => {
    batch.delete(docSnapshot.ref);
  });
  
  // Add new ones
  newPaymentsData.forEach(p => {
    const newDocRef = doc(colRef);
    batch.set(newDocRef, p);
  });
  
  return await batch.commit();
};
