/**
 * Tripmates built-in cover image library.
 * All images are served from Unsplash's free CDN — zero API cost, zero rate limits.
 * Each category has 6 curated images. The same activity always gets the same image
 * (deterministic pick based on the venue name).
 */

const BASE = 'https://images.unsplash.com/photo-';
const PARAMS = '?w=900&q=80&fit=crop&auto=format';

const covers: Record<string, string[]> = {
    Restaurant: [
        `${BASE}1517248135467-4c7edcad34c4${PARAMS}`, // warm lit dining room
        `${BASE}1414235077428-338989a2e8c0${PARAMS}`, // elegant food spread
        `${BASE}1555396273-367ea4eb4db5${PARAMS}`,   // modern restaurant interior
        `${BASE}1565299624946-2c30f3f06d14${PARAMS}`, // pizza in wood oven
        `${BASE}1476124369491-e7addf5db371${PARAMS}`, // sushi platter
        `${BASE}1504674900247-0877df9cc836${PARAMS}`, // juicy burger
    ],
    Cafe: [
        `${BASE}1445116572660-236099ec97a0${PARAMS}`, // cosy café with warm glow
        `${BASE}1501339847302-ac426a4a7cbb${PARAMS}`, // coffee shop counter
        `${BASE}1495474472287-4d71bcdd2085${PARAMS}`, // latte art close-up
        `${BASE}1509042239860-f550ce710b93${PARAMS}`, // roasted coffee beans
        `${BASE}1461023058943-07fcbe16d735${PARAMS}`, // bakery pastries
        `${BASE}1517959153196-1e97a0e5bb9e${PARAMS}`, // outdoor café terrace
    ],
    Bar: [
        `${BASE}1566417713940-fe7c737a9ef2${PARAMS}`, // moody neon bar
        `${BASE}1514362545857-3bc16c4c7d1b${PARAMS}`, // backlit bottles
        `${BASE}1470337458703-46ad1756a187${PARAMS}`, // bar with warm lights
        `${BASE}1516997121675-4c2d1696cc07${PARAMS}`, // craft cocktails
        `${BASE}1536935338788-846bb9981813${PARAMS}`, // champagne glasses
        `${BASE}1527661591475-527312dd65f5${PARAMS}`, // rooftop bar night
    ],
    Museum: [
        `${BASE}1464817739973-0128fe77aaa1${PARAMS}`, // grand museum hall
        `${BASE}1553877522-43269d4ea984${PARAMS}`,   // modern art gallery
        `${BASE}1580060839134-75a5edca2e99${PARAMS}`, // classical sculptures
        `${BASE}1574182245530-967d9b3831af${PARAMS}`, // gallery corridor
        `${BASE}1513475382585-d06e58bcb0e0${PARAMS}`, // contemporary exhibition
        `${BASE}1544967082-d9d25d867d66${PARAMS}`,   // museum architecture
    ],
    Activity: [
        `${BASE}1501854140801-50d01698950b${PARAMS}`, // aerial nature view
        `${BASE}1527004013197-933c4bb611b3${PARAMS}`, // hiking trail
        `${BASE}1506905925346-21bda4d32df4${PARAMS}`, // dramatic mountain peaks
        `${BASE}1530521954074-e0a103ceff5c${PARAMS}`, // kayaking adventure
        `${BASE}1534787238-9eb35ce1d6b8${PARAMS}`,   // city cycling
        `${BASE}1551632811-561732d1e306${PARAMS}`,   // camping at sunset
    ],
    Other: [
        `${BASE}1488646953014-85cb44e25828${PARAMS}`, // travel essentials flat lay
        `${BASE}1467269204594-9661b134dd2b${PARAMS}`, // European city street
        `${BASE}1519451241324-20b4ea2c4220${PARAMS}`, // scenic viewpoint
        `${BASE}1507608616759-54f48f0af0ee${PARAMS}`, // world map travel
        `${BASE}1476514525535-07fb3b4ae5f1${PARAMS}`, // travel destination coast
        `${BASE}1500835556837-99ac94a94552${PARAMS}`, // travel bags wanderlust
    ],
};

/** Returns a consistent cover image URL for the given category + activity name. */
export const getDefaultCover = (category: string | undefined, seed: string): string => {
    const pool = covers[category || ''] ?? covers.Other;
    // Deterministic pick: sum of char codes mod pool length
    const hash = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return pool[hash % pool.length];
};
