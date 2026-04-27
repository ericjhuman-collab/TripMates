import React, { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useTrip } from './TripContext';
import { useAuth, type AppUser } from './AuthContext';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import {
  type Expense, type Payment,
  subscribeToExpenses, addExpenseToDb, updateExpenseInDb, deleteExpenseFromDb,
  subscribeToPayments, addPaymentToDb, updatePaymentInDb,
  replacePendingPayments
} from '../services/even';
import { EvenContext } from './useEven';
import { useExpenseConversions } from '../hooks/useExpenseConversions';

// --- Mock Data ---
const MOCK_PARTICIPANTS = [
  { uid: 'u1', name: 'Charlie N', shortName: 'Charlie', initials: 'CN', color: '#FF9A7A', photoURL: 'https://i.pravatar.cc/150?u=a042581f4e29026704d' }, // Primary light variation
  { uid: 'u2', name: 'Carl-Johan I', shortName: 'Carl-Johan', initials: 'CI', color: '#88D0C9' }, // Teal nuance
  { uid: 'u3', name: 'Wilmer P', shortName: 'Wilmer', initials: 'WP', color: '#C39BD3' } // Muted purple nuance
];

const MOCK_EXPENSES: Expense[] = [
  {
    id: 'e1',
    tripId: 't1',
    description: 'City gross',
    amount: 135000, // 1350.00
    currency: 'SEK',
    date: '2025-08-20',
    payerId: 'u1', // Charlie
    category: 'groceries',
    creatorId: 'u1',
    splitType: 'EQUAL',
    participants: [{ uid: 'u1', amount: 45000 }, { uid: 'u2', amount: 45000 }, { uid: 'u3', amount: 45000 }],
    createdAt: Date.now() - 100000,
  },
  {
    id: 'e2',
    tripId: 't1',
    description: 'Fjällstugan',
    amount: 50000,
    currency: 'SEK',
    date: '2025-08-20',
    payerId: 'u1',
    category: 'accommodation',
    creatorId: 'u1',
    splitType: 'EQUAL',
    participants: [{ uid: 'u1', amount: 16667 }, { uid: 'u2', amount: 16667 }, { uid: 'u3', amount: 16666 }], // handle rough cents
    createdAt: Date.now() - 50000,
  }
];

const MOCK_PAYMENTS: Payment[] = [
  {
    id: 'p1',
    tripId: 't1',
    fromUid: 'u2', // Carl-Johan
    toUid: 'u3', // Wilmer
    amount: 41866,
    currency: 'SEK',
    date: '2025-08-25T10:54:00Z',
    createdAt: Date.now() - 200000,
    status: 'COMPLETED',
  }
];

export const EvenProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { activeTrip } = useTrip();
  const { appUser } = useAuth();

  // Dynamically replace u3 with the current user so they can test the workflow
  const dynamicParticipants = useMemo(() => {
    return MOCK_PARTICIPANTS.map(p => {
      if (p.uid === 'u3' && appUser) {
        return { 
          ...p, 
          uid: appUser.uid, 
          name: appUser.fullName || appUser.name || 'Eric', 
          shortName: (appUser.name || 'Eric').split(' ')[0], 
          initials: 'ME',
          photoURL: appUser.avatarUrl || undefined
        };
      }
      return p;
    });
  }, [appUser]);

  const dynamicExpenses = useMemo(() => {
    return MOCK_EXPENSES.map(e => ({
      ...e,
      payerId: e.payerId === 'u3' ? (appUser?.uid || 'u3') : e.payerId,
      creatorId: e.creatorId === 'u3' ? (appUser?.uid || 'u3') : e.creatorId,
      participants: e.participants.map(p => p.uid === 'u3' ? { ...p, uid: appUser?.uid || 'u3' } : p)
    }));
  }, [appUser]);

  const dynamicPayments = useMemo(() => {
    return MOCK_PAYMENTS.map(p => ({
      ...p,
      fromUid: p.fromUid === 'u3' ? (appUser?.uid || 'u3') : p.fromUid,
      toUid: p.toUid === 'u3' ? (appUser?.uid || 'u3') : p.toUid,
    }));
  }, [appUser]);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isSettled, setIsSettled] = useState(false);
  const [realParticipants, setRealParticipants] = useState<(Partial<AppUser> & { uid: string, shortName: string, initials: string, color?: string, photoURL?: string })[]>([]);

  // Subscribe to Firebase data for expenses & payments
  useEffect(() => {
    if (!activeTrip) {
      queueMicrotask(() => {
        setExpenses([]);
        setPayments([]);
      });
      return;
    }

    // For mock trips, manually fall back to mock data
    if (activeTrip.id.startsWith('mock_') || activeTrip.id === 't1') {
      queueMicrotask(() => {
        setExpenses(dynamicExpenses);
        setPayments(dynamicPayments);
      });
      return;
    }

    const unsubExpenses = subscribeToExpenses(activeTrip.id, setExpenses);
    const unsubPayments = subscribeToPayments(activeTrip.id, setPayments);

    return () => {
      unsubExpenses();
      unsubPayments();
    };
  }, [activeTrip, dynamicExpenses, dynamicPayments]);

  useEffect(() => {
    const fetchParticipants = async () => {
      if (!activeTrip) {
        setRealParticipants([]);
        return;
      }
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const usersData = snapshot.docs.map(doc => doc.data() as AppUser);
        
        const validMembers = usersData.filter(m => activeTrip.members.includes(m.uid));
        
        const mockUids = activeTrip.members.filter(m => m.startsWith('mock_'));
        const mockUsers: AppUser[] = mockUids.map(uid => ({
            uid,
            name: uid.replace('mock_', ''),
            fullName: uid.replace('mock_', ''),
            email: '',
            role: 'user',
            hasAgreed: true,
            phoneNumber: '+15551234567',
            sharePhoneNumber: true
        } as AppUser));

        const allFetched = [...validMembers, ...mockUsers];

        const colors = ['#FF9A7A', '#88D0C9', '#C39BD3', '#F4D03F', '#85C1E9', '#F1948A', '#E59866', '#58D68D'];
        
        const formatted = allFetched.map((user, idx) => ({
            ...user,
            uid: user.uid,
            name: user.fullName || user.name || 'Unknown',
            shortName: (user.name || 'Unknown').split(' ')[0],
            initials: (user.name || 'U').substring(0, 2).toUpperCase(),
            color: colors[idx % colors.length],
            photoURL: user.avatarUrl || undefined
        }));

        setRealParticipants(formatted);
      } catch (e) {
        console.error("Failed to load Even participants", e);
      }
    };
    fetchParticipants();
  }, [activeTrip]);

  const finalParticipants = realParticipants.length > 0 ? realParticipants : dynamicParticipants;

  const activeTripExpenses = useMemo(() => {
    if (!activeTrip) return [];
    return expenses.filter(exp => exp.tripId === activeTrip.id);
  }, [activeTrip, expenses]);

  const activeTripPayments = useMemo(() => {
    if (!activeTrip) return [];
    return payments.filter(pay => pay.tripId === activeTrip.id);
  }, [activeTrip, payments]);

  const baseCurrency = activeTrip?.baseCurrency || 'SEK';

  const { conversions: convertedAmounts, loading: fxLoading, anyFailed: fxFailed } =
    useExpenseConversions(activeTripExpenses, baseCurrency);

  const totalTripCost = useMemo(() => {
    return activeTripExpenses.reduce((acc, exp) => {
      const conv = convertedAmounts.get(exp.id);
      return acc + (conv?.convertedCents ?? exp.amount);
    }, 0);
  }, [activeTripExpenses, convertedAmounts]);

  // Calculate balances in the trip's base currency. Each expense's amounts are first
  // converted using the FX rate captured for that expense's transaction date.
  // Positive balance = paid more than your share (owed money). Negative = owe money.
  const userBalances = useMemo(() => {
    const balances: Record<string, number> = {};

    activeTripExpenses.forEach(exp => {
      const rate = convertedAmounts.get(exp.id)?.rate ?? 1;
      const expAmountBase = Math.round(exp.amount * rate);

      balances[exp.payerId] = (balances[exp.payerId] || 0) + expAmountBase;

      if (exp.splitType === 'ITEMIZED' && exp.items && exp.items.length > 0) {
        const claimSums: Record<string, number> = {};
        let totalClaimSum = 0;

        for (const item of exp.items) {
          const totalParts = Object.values(item.allocations).reduce((a, b) => a + b, 0);
          if (totalParts === 0) continue;
          const itemPriceBase = item.price * rate;
          const perPart = itemPriceBase / totalParts;
          for (const [uid, parts] of Object.entries(item.allocations)) {
            if (parts <= 0) continue;
            const userShare = perPart * parts;
            claimSums[uid] = (claimSums[uid] || 0) + userShare;
            totalClaimSum += userShare;
          }
        }

        const tipBase = (exp.tip || 0) * rate;
        for (const [uid, claimSum] of Object.entries(claimSums)) {
          const tipShare = totalClaimSum > 0 ? tipBase * (claimSum / totalClaimSum) : 0;
          balances[uid] = (balances[uid] || 0) - claimSum - tipShare;
        }
      } else {
        exp.participants.forEach(p => {
          balances[p.uid] = (balances[p.uid] || 0) - Math.round(p.amount * rate);
        });
      }
    });

    // Payments are already in base currency (settle-up creates them that way).
    activeTripPayments.forEach(pay => {
      if (pay.status === 'COMPLETED') {
        balances[pay.fromUid] = (balances[pay.fromUid] || 0) + pay.amount;
        balances[pay.toUid] = (balances[pay.toUid] || 0) - pay.amount;
      }
    });

    return balances;
  }, [activeTripExpenses, activeTripPayments, convertedAmounts]);

  const addExpense = async (expense: Omit<Expense, 'id' | 'createdAt'>) => {
    const newExpense = {
      ...expense,
      createdAt: Date.now(),
    };
    
    if (activeTrip?.id.startsWith('mock_') || activeTrip?.id === 't1') {
      const mockExp = { ...newExpense, id: Math.random().toString(36).substr(2, 9) } as Expense;
      setExpenses(prev => [mockExp, ...prev]);
      return;
    }
    
    await addExpenseToDb(newExpense);
  };

  const updateExpense = async (id: string, updates: Partial<Omit<Expense, 'id' | 'createdAt'>>) => {
    if (activeTrip?.id.startsWith('mock_') || activeTrip?.id === 't1') {
      setExpenses(prev => prev.map(exp => exp.id === id ? { ...exp, ...updates } : exp));
      return;
    }
    await updateExpenseInDb(id, updates);
  };

  const deleteExpense = async (id: string) => {
    if (activeTrip?.id.startsWith('mock_') || activeTrip?.id === 't1') {
      setExpenses(prev => prev.filter(exp => exp.id !== id));
      return;
    }
    await deleteExpenseFromDb(id);
  };

  const addPayment = async (payment: Omit<Payment, 'id' | 'createdAt'>) => {
    const newPayment = {
      ...payment,
      createdAt: Date.now(),
    };

    if (activeTrip?.id.startsWith('mock_') || activeTrip?.id === 't1') {
      const mockPay = { ...newPayment, id: Math.random().toString(36).substr(2, 9) } as Payment;
      setPayments(prev => [mockPay, ...prev]);
      return;
    }
    
    await addPaymentToDb(newPayment);
  };

  const updatePayment = async (id: string, updates: Partial<Payment>) => {
    if (activeTrip?.id.startsWith('mock_') || activeTrip?.id === 't1') {
      setPayments(prev => prev.map(pay => pay.id === id ? { ...pay, ...updates } : pay));
      return;
    }
    await updatePaymentInDb(id, updates);
  };

  const triggerSettleUp = async () => {
    if (!activeTrip) return;

    // We only create new payments for currently unbalanced amounts.
    // Existing PENDING payments generated via settle up might duplicate if they aren't marked as completed
    // so ideally we'd delete/overwrite them. Currently, this implies generating fresh PENDINGs.
    
    const activeCompleted = activeTripPayments.filter(p => p.status === 'COMPLETED');
    const activePending = activeTripPayments.filter(p => p.status === 'PENDING');
    
    const balances = { ...userBalances };
    
    // Add existing pending payments back to balances to 'cancel' them before recreating
    // So if someone had a pending payment to pay 100, we un-do it
    activePending.forEach(pay => {
      balances[pay.fromUid] = (balances[pay.fromUid] || 0) + pay.amount;
      balances[pay.toUid] = (balances[pay.toUid] || 0) - pay.amount;
    });
    
    const debtors: { uid: string, amount: number }[] = [];
    const creditors: { uid: string, amount: number }[] = [];
    
    for (const [uid, bal] of Object.entries(balances)) {
      if (bal < 0) debtors.push({ uid, amount: -bal });
      else if (bal > 0) creditors.push({ uid, amount: bal });
    }
    
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);
    
    const newPayments: Omit<Payment, 'id'>[] = [];
    let i = 0, j = 0;
    
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      
      const minAmount = Math.min(debtor.amount, creditor.amount);
      if (minAmount > 0) {
        newPayments.push({
          tripId: activeTrip.id,
          fromUid: debtor.uid,
          toUid: creditor.uid,
          amount: minAmount,
          currency: activeTrip.baseCurrency || 'SEK',
          date: new Date().toISOString(),
          createdAt: Date.now(),
          status: 'PENDING'
        });
      }
      
      debtor.amount -= minAmount;
      creditor.amount -= minAmount;
      
      if (debtor.amount < 1) i++;
      if (creditor.amount < 1) j++;
    }
    
    if (activeTrip.id.startsWith('mock_') || activeTrip.id === 't1') {
      const mockNewPayments = newPayments.map(p => ({ ...p, id: Math.random().toString(36).substr(2, 9) } as Payment));
      setPayments([...mockNewPayments, ...activeCompleted]);
      setIsSettled(true);
      return;
    }

    try {
        await replacePendingPayments(activeTrip.id, newPayments);
        setIsSettled(true);
    } catch (e) {
        console.error("Failed to generate settle up payments:", e);
    }
  };

  return (
    <EvenContext.Provider value={{
      expenses: activeTripExpenses,
      payments: activeTripPayments,
      participants: finalParticipants,
      addExpense,
      updateExpense,
      deleteExpense,
      addPayment,
      updatePayment,
      triggerSettleUp,
      totalTripCost,
      userBalances,
      isSettled,
      baseCurrency,
      convertedAmounts,
      fxLoading,
      fxFailed
    }}>
      {children}
    </EvenContext.Provider>
  );
};
