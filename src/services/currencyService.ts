interface ExchangeRates {
    date: string;
    base: string;
    rates: Record<string, number>;
}

const CACHE_KEY = 'alen_exchange_rates';

export const currencyService = {
    /**
     * Fetches the latest exchange rates utilizing exchangerate-api
     * and caches them in localStorage by date to avoid rate limiting.
     */
    async getRates(): Promise<ExchangeRates | null> {
        // We use EUR as a common base to cache all rates together for free
        const today = new Date().toISOString().split('T')[0];
        
        try {
            const cachedResult = localStorage.getItem(CACHE_KEY);
            if (cachedResult) {
                const parsed = JSON.parse(cachedResult) as ExchangeRates;
                if (parsed.date === today && parsed.base === 'EUR') {
                    return parsed;
                }
            }

            // If we don't have today's cache, fetch new rates
            // open.er-api.com returns a free daily updated JSON
            const response = await fetch(`https://open.er-api.com/v6/latest/EUR`);
            if (!response.ok) {
                throw new Error('Failed to fetch exchange rates');
            }

            const data = await response.json();
            
            const ratesData: ExchangeRates = {
                date: today,
                base: data.base_code,
                rates: data.rates || {}
            };

            // Cache it
            localStorage.setItem(CACHE_KEY, JSON.stringify(ratesData));
            
            return ratesData;

        } catch (error) {
            console.error('Currency service error:', error);
            // Fallback to cache even if outdated, if exists
            const fallbackCache = localStorage.getItem(CACHE_KEY);
            if (fallbackCache) {
                return JSON.parse(fallbackCache) as ExchangeRates;
            }
            return null;
        }
    },

    /**
     * Converts an amount from one currency to another using the latest available rates.
     */
    async convert(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
        if (fromCurrency === toCurrency) return amount;

        const data = await this.getRates();
        if (!data || !data.rates[fromCurrency] || !data.rates[toCurrency]) {
            console.warn(`Missing exchange rates for ${fromCurrency} -> ${toCurrency}. Cannot convert properly.`);
            return amount; // Fallback returning same amount if conversion impossible
        }

        // Convert to base EUR first, then to target
        const amountInEur = amount / data.rates[fromCurrency];
        const finalAmount = amountInEur * data.rates[toCurrency];

        return finalAmount;
    }
};
