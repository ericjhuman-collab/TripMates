export interface CurrencyDef {
    code: string;
    name: string;
}

export const SUPPORTED_CURRENCIES: CurrencyDef[] = [
    { code: 'SEK', name: 'Swedish Krona' },
    { code: 'EUR', name: 'Euro' },
    { code: 'USD', name: 'US Dollar' },
    { code: 'GBP', name: 'British Pound' },
    { code: 'NOK', name: 'Norwegian Krone' },
    { code: 'DKK', name: 'Danish Krone' },
    { code: 'CHF', name: 'Swiss Franc' },
    { code: 'CAD', name: 'Canadian Dollar' },
    { code: 'AUD', name: 'Australian Dollar' },
    { code: 'JPY', name: 'Japanese Yen' },
    { code: 'NZD', name: 'New Zealand Dollar' },
    { code: 'SAR', name: 'Saudi Riyal' },
    { code: 'AED', name: 'UAE Dirham' },
    { code: 'INR', name: 'Indian Rupee' },
    { code: 'MXN', name: 'Mexican Peso' },
    { code: 'BRL', name: 'Brazilian Real' },
    { code: 'ZAR', name: 'South African Rand' },
    { code: 'TRY', name: 'Turkish Lira' },
    { code: 'THB', name: 'Thai Baht' },
    { code: 'PLN', name: 'Polish Zloty' },
    { code: 'HUF', name: 'Hungarian Forint' },
    { code: 'CZK', name: 'Czech Koruna' },
    { code: 'HRK', name: 'Croatian Kuna' }, // Though Croatia joined Euro, good to keep for past trips?
    { code: 'BGN', name: 'Bulgarian Lev' },
    { code: 'RON', name: 'Romanian Leu' },
    { code: 'ISK', name: 'Icelandic Króna' }
].sort((a, b) => a.name.localeCompare(b.name));
