import { createContext, useContext } from 'react';
import type { AppUser } from './AuthContext';
import type { Expense, Payment, SimplifiedDebt } from '../services/even';
import type { ExpenseConversion } from '../hooks/useExpenseConversions';

export interface EvenContextState {
    expenses: Expense[];
    payments: Payment[];
    participants: (Partial<AppUser> & { uid: string; shortName: string; initials: string; color?: string; photoURL?: string })[];
    addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => void;
    updateExpense: (id: string, updates: Partial<Omit<Expense, 'id' | 'createdAt'>>) => void;
    deleteExpense: (id: string) => Promise<void>;
    addPayment: (payment: Omit<Payment, 'id' | 'createdAt'>) => void;
    updatePayment: (id: string, updates: Partial<Payment>) => void;
    triggerSettleUp: () => Promise<void>;
    totalTripCost: number;
    userBalances: Record<string, number>;
    isSettled: boolean;
    baseCurrency: string;
    convertedAmounts: Map<string, ExpenseConversion>;
    fxLoading: boolean;
    fxFailed: boolean;
    // Ready-to-settle social state
    readyUids: Set<string>;          // UIDs whose readyAt > settledAt
    toggleMyReady: () => Promise<void>;
    iAmReady: boolean;
    // Stale-settle banner state
    hasExpensesSinceSettle: boolean; // true iff any expense.createdAt > settledAt
    isPendingStale: boolean;         // true iff persisted PENDING payments diverge from liveSettlement
    settledAt: number | null;
    // Live who-pays-whom derived from userBalances — always consistent with the balance labels
    liveSettlement: SimplifiedDebt[];
}

export const EvenContext = createContext<EvenContextState | undefined>(undefined);

export const useEven = () => {
    const context = useContext(EvenContext);
    if (!context) {
        throw new Error('useEven must be used within an EvenProvider');
    }
    return context;
};
