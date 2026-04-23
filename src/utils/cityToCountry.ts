/**
 * Maps common city/destination names to their country.
 * Used to auto-count countries visited from trip destinations.
 * If the destination has a comma, the last segment is treated as the country.
 */
const CITY_TO_COUNTRY: Record<string, string> = {
    // Scandinavia
    stockholm: 'Sweden', gothenburg: 'Sweden', göteborg: 'Sweden', malmö: 'Sweden', malmo: 'Sweden', umeå: 'Sweden', umea: 'Sweden', luleå: 'Sweden', lulea: 'Sweden',
    oslo: 'Norway', bergen: 'Norway', trondheim: 'Norway', stavanger: 'Norway',
    copenhagen: 'Denmark', København: 'Denmark', kobenhavn: 'Denmark', aarhus: 'Denmark', odense: 'Denmark',
    helsinki: 'Finland', tampere: 'Finland', turku: 'Finland',
    reykjavik: 'Iceland',

    // UK & Ireland
    london: 'United Kingdom', manchester: 'United Kingdom', edinburgh: 'United Kingdom', glasgow: 'United Kingdom', birmingham: 'United Kingdom', liverpool: 'United Kingdom', leeds: 'United Kingdom', bristol: 'United Kingdom',
    dublin: 'Ireland', cork: 'Ireland',

    // France
    paris: 'France', lyon: 'France', marseille: 'France', nice: 'France', bordeaux: 'France', toulouse: 'France', strasbourg: 'France', nantes: 'France',

    // Germany
    berlin: 'Germany', munich: 'Germany', münchen: 'Germany', hamburg: 'Germany', frankfurt: 'Germany', cologne: 'Germany', köln: 'Germany', koln: 'Germany', düsseldorf: 'Germany', dusseldorf: 'Germany', stuttgart: 'Germany',

    // Italy
    rome: 'Italy', roma: 'Italy', milan: 'Italy', milano: 'Italy', venice: 'Italy', venezia: 'Italy', florence: 'Italy', firenze: 'Italy', naples: 'Italy', napoli: 'Italy', turin: 'Italy', torino: 'Italy', bologna: 'Italy', sicily: 'Italy', sardinia: 'Italy', amalfi: 'Italy', positano: 'Italy', cinque: 'Italy',

    // Spain
    madrid: 'Spain', barcelona: 'Spain', seville: 'Spain', sevilla: 'Spain', granada: 'Spain', valencia: 'Spain', bilbao: 'Spain', málaga: 'Spain', malaga: 'Spain', ibiza: 'Spain', mallorca: 'Spain', tenerife: 'Spain',

    // Portugal
    lisbon: 'Portugal', lisboa: 'Portugal', porto: 'Portugal', algarve: 'Portugal', faro: 'Portugal',

    // Netherlands
    amsterdam: 'Netherlands', rotterdam: 'Netherlands', utrecht: 'Netherlands', 'the hague': 'Netherlands', hague: 'Netherlands',

    // Belgium
    brussels: 'Belgium', bruxelles: 'Belgium', bruges: 'Belgium', antwerp: 'Belgium', ghent: 'Belgium',

    // Switzerland
    zurich: 'Switzerland', zürich: 'Switzerland', geneva: 'Switzerland', bern: 'Switzerland', basel: 'Switzerland', lausanne: 'Switzerland',

    // Austria
    vienna: 'Austria', wien: 'Austria', salzburg: 'Austria', innsbruck: 'Austria', graz: 'Austria',

    // Czech Republic
    prague: 'Czech Republic', Praha: 'Czech Republic', brno: 'Czech Republic',

    // Hungary
    budapest: 'Hungary',

    // Poland
    warsaw: 'Poland', warszawa: 'Poland', krakow: 'Poland', kraków: 'Poland', gdansk: 'Poland', gdańsk: 'Poland',

    // Greece
    athens: 'Greece', athen: 'Greece', santorini: 'Greece', mykonos: 'Greece', thessaloniki: 'Greece', crete: 'Greece',

    // Croatia
    dubrovnik: 'Croatia', split: 'Croatia', zagreb: 'Croatia', hvar: 'Croatia',

    // Turkey
    istanbul: 'Turkey', ankara: 'Turkey', antalya: 'Turkey', cappadocia: 'Turkey',

    // Russia
    moscow: 'Russia', 'st. petersburg': 'Russia', 'saint petersburg': 'Russia',

    // USA
    'new york': 'United States', 'new york city': 'United States', nyc: 'United States',
    'los angeles': 'United States', la: 'United States',
    'san francisco': 'United States', chicago: 'United States', miami: 'United States',
    'las vegas': 'United States', seattle: 'United States', boston: 'United States',
    washington: 'United States', hawaii: 'United States', orlando: 'United States',
    nashville: 'United States', 'new orleans': 'United States',

    // Canada
    toronto: 'Canada', vancouver: 'Canada', montreal: 'Canada', calgary: 'Canada', ottawa: 'Canada',

    // Mexico
    mexico: 'Mexico', 'mexico city': 'Mexico', cancun: 'Mexico', cancún: 'Mexico', tulum: 'Mexico', oaxaca: 'Mexico',

    // Brazil
    'rio de janeiro': 'Brazil', 'são paulo': 'Brazil', sao: 'Brazil', brasilia: 'Brazil', salvador: 'Brazil',

    // Argentina
    'buenos aires': 'Argentina', mendoza: 'Argentina', patagonia: 'Argentina',

    // Japan
    tokyo: 'Japan', kyoto: 'Japan', osaka: 'Japan', hiroshima: 'Japan', nara: 'Japan',

    // China
    beijing: 'China', shanghai: 'China', 'hong kong': 'China', guangzhou: 'China', shenzhen: 'China',

    // South Korea
    seoul: 'South Korea', busan: 'South Korea',

    // Thailand
    bangkok: 'Thailand', 'chiang mai': 'Thailand', phuket: 'Thailand', 'ko samui': 'Thailand', koh: 'Thailand',

    // Indonesia
    bali: 'Indonesia', jakarta: 'Indonesia', lombok: 'Indonesia',

    // Singapore
    singapore: 'Singapore',

    // Malaysia
    'kuala lumpur': 'Malaysia', penang: 'Malaysia',

    // Vietnam
    'ho chi minh': 'Vietnam', hanoi: 'Vietnam', 'hoi an': 'Vietnam', 'da nang': 'Vietnam', halong: 'Vietnam',

    // India
    'new delhi': 'India', delhi: 'India', mumbai: 'India', bangalore: 'India', goa: 'India', jaipur: 'India', agra: 'India',

    // UAE
    dubai: 'United Arab Emirates', 'abu dhabi': 'United Arab Emirates',

    // South Africa
    'cape town': 'South Africa', johannesburg: 'South Africa', durban: 'South Africa',

    // Egypt
    cairo: 'Egypt', luxor: 'Egypt', hurghada: 'Egypt',

    // Morocco
    marrakech: 'Morocco', casablanca: 'Morocco', fez: 'Morocco',

    // Australia
    sydney: 'Australia', melbourne: 'Australia', brisbane: 'Australia', perth: 'Australia',
    'gold coast': 'Australia', adelaide: 'Australia',

    // New Zealand
    auckland: 'New Zealand', queenstown: 'New Zealand', wellington: 'New Zealand',
};

/** Resolve a trip destination string to a country name. */
export function cityToCountry(destination: string | undefined): string | null {
    if (!destination) return null;

    // If there's a comma, the last segment is likely the country
    if (destination.includes(',')) {
        const parts = destination.split(',');
        return parts[parts.length - 1].trim();
    }

    const lower = destination.toLowerCase().trim();
    return CITY_TO_COUNTRY[lower] ?? destination; // fallback: treat the whole string as country
}
