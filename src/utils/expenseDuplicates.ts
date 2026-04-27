import type { Expense } from '../services/even';

// Considers two expenses "potentially duplicate" when they share trip, currency,
// payer, exact amount in cents, and were transacted within 3 days of each other.
// Optionally tightens the match if both have a merchant name or description that overlaps.
//
// This is intentionally conservative — false positives are annoying but recoverable
// (the user clicks "Spara ändå"); false negatives mean a duplicate slips through.

const DAYS = 1000 * 60 * 60 * 24;
const MAX_DAY_DIFF = 3;

const expenseDate = (exp: Pick<Expense, 'transactionDate' | 'date'>): number | null => {
    const raw = exp.transactionDate || exp.date;
    if (!raw) return null;
    const ts = new Date(raw).getTime();
    return Number.isFinite(ts) ? ts : null;
};

export type DuplicateCandidate = Pick<
    Expense,
    'tripId' | 'currency' | 'payerId' | 'amount' | 'date' | 'transactionDate' | 'merchantName' | 'description'
> & { id?: string };

export const findPotentialDuplicates = (
    candidate: DuplicateCandidate,
    existing: Expense[]
): Expense[] => {
    const candTs = expenseDate(candidate);
    return existing.filter(exp => {
        if (candidate.id && exp.id === candidate.id) return false; // editing self
        if (exp.tripId !== candidate.tripId) return false;
        if (exp.currency !== candidate.currency) return false;
        if (exp.payerId !== candidate.payerId) return false;
        if (exp.amount !== candidate.amount) return false;

        if (candTs !== null) {
            const expTs = expenseDate(exp);
            if (expTs !== null) {
                const daysApart = Math.abs(candTs - expTs) / DAYS;
                if (daysApart > MAX_DAY_DIFF) return false;
            }
        }
        return true;
    });
};
