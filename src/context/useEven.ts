import { createContext, useContext } from 'react';
import type { AppUser } from './AuthContext';
import type { Expense, Payment } from '../services/even';

export interface EvenContextState {
    expenses: Expense[];
    payments: Payment[];
    participants: (Partial<AppUser> & { uid: string; shortName: string; initials: string; color?: string; photoURL?: string })[];
    addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => void;
    updateExpense: (id: string, updates: Partial<Omit<Expense, 'id' | 'createdAt'>>) => void;
    addPayment: (payment: Omit<Payment, 'id' | 'createdAt'>) => void;
    updatePayment: (id: string, updates: Partial<Payment>) => void;
    triggerSettleUp: () => void;
    totalTripCost: number;
    userBalances: Record<string, number>;
    isSettled: boolean;
}

export const EvenContext = createContext<EvenContextState | undefined>(undefined);

export const useEven = () => {
    const context = useContext(EvenContext);
    if (!context) {
        throw new Error('useEven must be used within an EvenProvider');
    }
    return context;
};
