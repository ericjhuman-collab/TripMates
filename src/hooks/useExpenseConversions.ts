import { useEffect, useMemo, useState } from 'react';
import type { Expense } from '../services/even';
import { fetchRate, getCachedRate, hasFailed, normalizeDate } from '../services/fx';

export interface ExpenseConversion {
    rate: number;            // multiplier from expense currency to base
    convertedCents: number;  // expense.amount × rate, rounded
    loading: boolean;        // true while we wait for the rate
    failed: boolean;         // true if the fetch errored — falling back to 1:1
}

export interface ConversionsResult {
    conversions: Map<string, ExpenseConversion>;
    loading: boolean;
    anyFailed: boolean;
}

export const useExpenseConversions = (
    expenses: Expense[],
    baseCurrency: string
): ConversionsResult => {
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const seen = new Set<string>();
        for (const exp of expenses) {
            const from = exp.currency || baseCurrency;
            if (from === baseCurrency) continue;
            const date = normalizeDate(exp.transactionDate || exp.date);
            const key = `${date}|${from}|${baseCurrency}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (getCachedRate(date, from, baseCurrency) !== null) continue;
            if (hasFailed(date, from, baseCurrency)) continue;
            fetchRate(date, from, baseCurrency)
                .then(() => { if (!cancelled) setVersion(v => v + 1); })
                .catch(() => { if (!cancelled) setVersion(v => v + 1); });
        }
        return () => { cancelled = true; };
    }, [expenses, baseCurrency]);

    return useMemo(() => {
        const conversions = new Map<string, ExpenseConversion>();
        let loading = false;
        let anyFailed = false;
        for (const exp of expenses) {
            const from = exp.currency || baseCurrency;
            if (from === baseCurrency) {
                conversions.set(exp.id, { rate: 1, convertedCents: exp.amount, loading: false, failed: false });
                continue;
            }
            const date = normalizeDate(exp.transactionDate || exp.date);
            const rate = getCachedRate(date, from, baseCurrency);
            if (rate !== null) {
                conversions.set(exp.id, {
                    rate,
                    convertedCents: Math.round(exp.amount * rate),
                    loading: false,
                    failed: false,
                });
            } else if (hasFailed(date, from, baseCurrency)) {
                anyFailed = true;
                conversions.set(exp.id, { rate: 1, convertedCents: exp.amount, loading: false, failed: true });
            } else {
                loading = true;
                conversions.set(exp.id, { rate: 1, convertedCents: exp.amount, loading: true, failed: false });
            }
        }
        return { conversions, loading, anyFailed };
        // version is the cache-bust trigger — included so the memo recomputes after a fetch resolves
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expenses, baseCurrency, version]);
};
