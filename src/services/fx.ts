// FX rate service. Uses Frankfurter (ECB rates, free, no key, historical dates supported).
// Rates are cached forever in localStorage per (date, from, to) — historical rates don't change,
// and "today's" rate is cached per calendar day so we don't refetch on every render.

const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';

const memCache = new Map<string, number>();
const pending = new Map<string, Promise<number>>();
const failedKeys = new Set<string>();

const cacheKey = (date: string, from: string, to: string) => `fx:${date}:${from}:${to}`;

const todayISO = () => new Date().toISOString().slice(0, 10);

export const normalizeDate = (raw: string | undefined): string => {
    if (!raw) return todayISO();
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
    if (!m) return todayISO();
    // Don't request future dates — Frankfurter only has data up to today.
    return m[1] > todayISO() ? todayISO() : m[1];
};

export const getCachedRate = (date: string, from: string, to: string): number | null => {
    if (from === to) return 1;
    const key = cacheKey(date, from, to);
    if (memCache.has(key)) return memCache.get(key)!;
    try {
        const stored = localStorage.getItem(key);
        if (stored !== null) {
            const rate = parseFloat(stored);
            if (isFinite(rate) && rate > 0) {
                memCache.set(key, rate);
                return rate;
            }
        }
    } catch {
        // localStorage unavailable — ignore
    }
    return null;
};

export const hasFailed = (date: string, from: string, to: string): boolean => {
    if (from === to) return false;
    return failedKeys.has(cacheKey(date, from, to));
};

export const fetchRate = async (date: string, from: string, to: string): Promise<number> => {
    if (from === to) return 1;
    const key = cacheKey(date, from, to);
    const cached = getCachedRate(date, from, to);
    if (cached !== null) return cached;
    if (pending.has(key)) return pending.get(key)!;

    const promise = (async () => {
        const url = `${FRANKFURTER_BASE}/${date}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`FX fetch failed (${res.status}) for ${from}→${to} on ${date}`);
        const json = await res.json();
        const rate = json?.rates?.[to];
        if (typeof rate !== 'number' || !isFinite(rate) || rate <= 0) {
            throw new Error(`FX response missing valid rate for ${from}→${to}`);
        }
        memCache.set(key, rate);
        try {
            localStorage.setItem(key, String(rate));
        } catch {
            // localStorage write failed (quota, private mode) — keep mem-cache only
        }
        return rate;
    })();

    pending.set(key, promise);
    try {
        return await promise;
    } catch (e) {
        failedKeys.add(key);
        throw e;
    } finally {
        pending.delete(key);
    }
};
