import React, { useEffect, useRef, useState, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

interface PlacePrediction {
    placeId: string;
    mainText: string;
    secondaryText: string;
    description: string;
}

interface PlaceAutocompleteProps {
    defaultValue?: string;
    onPlaceSelected: (placeData: {
        name: string;
        formatted_address: string;
        location: { lat: number; lng: number } | null;
    }) => void;
    onInputChange?: (value: string) => void;
    placeholder?: string;
    className?: string;
    /** What the input shows after the user picks a prediction.
     *  'name' = the place's display name (default — good for company-name fields).
     *  'address' = the formatted address (good for an explicit address field). */
    displayValueAfterSelect?: 'name' | 'address';
}

// ── Singleton: load the Maps JS with the callback protocol ───────────────────
let mapsReadyPromise: Promise<void> | null = null;

function ensureMapsLoaded(apiKey: string): Promise<void> {
    if (mapsReadyPromise) return mapsReadyPromise;
    mapsReadyPromise = new Promise((resolve, reject) => {
        // Already loaded (e.g. after HMR)
        if (window.google?.maps?.places) {
            resolve();
            return;
        }
        const callbackName = `__gmapsInit${Date.now()}`;
        (window as unknown as Record<string, () => void>)[callbackName] = () => {
            delete (window as unknown as Record<string, unknown>)[callbackName];
            resolve();
        };
        document.querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]').forEach(s => s.remove());
        const script = document.createElement('script');
        // Use the new `v=beta` channel which exposes AutocompleteSuggestion
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=beta&libraries=places&callback=${callbackName}`;
        script.async = true;
        script.defer = true;
        script.onerror = () => { mapsReadyPromise = null; reject(new Error('Maps script failed')); };
        document.head.appendChild(script);
    });
    return mapsReadyPromise;
}
// ─────────────────────────────────────────────────────────────────────────────

export const ModernPlaceAutocomplete: React.FC<PlaceAutocompleteProps> = ({
    defaultValue = '',
    onPlaceSelected,
    onInputChange,
    placeholder = 'E.g. Cantine Milano',
    className,
    displayValueAfterSelect = 'name',
}) => {
    const [inputValue, setInputValue] = useState(defaultValue);
    const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loadingResults, setLoadingResults] = useState(false);
    const [mapsReady, setMapsReady] = useState(false);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

    // Pull the parent's value into the local input when it changes externally
    // (e.g. a sister autocomplete field picks a place and our parent calls
    // setAddress() on us). Without this, defaultValue is only honored once
    // at mount and the visible input goes stale.
    useEffect(() => {
        setInputValue(defaultValue);
    }, [defaultValue]);

    useEffect(() => {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        if (!apiKey) { console.warn('VITE_GOOGLE_MAPS_API_KEY is not set'); return; }

        ensureMapsLoaded(apiKey)
            .then(() => {
                // Create a session token for billing efficiency
                const g = window.google;
                sessionTokenRef.current = new g.maps.places.AutocompleteSessionToken();
                setMapsReady(true);
            })
            .catch(err => console.error('Google Maps failed to load:', err));
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const fetchSuggestions = useCallback(async (input: string) => {
        // 3-char min: trades a slightly later first suggestion for fewer billed
        // autocomplete sessions on incidental 2-char typos.
        if (!mapsReady || input.trim().length < 3) {
            setPredictions([]);
            setShowDropdown(false);
            return;
        }
        setLoadingResults(true);
        try {
            const g = window.google;
            // AutocompleteSuggestion is the new API supported for all key ages
            const { suggestions } = await g.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
                input,
                sessionToken: sessionTokenRef.current ?? undefined,
            });

            const preds: PlacePrediction[] = (suggestions ?? []).map((s: google.maps.places.AutocompleteSuggestion) => {
                const pp = s.placePrediction;
                return {
                    placeId: pp?.placeId ?? '',
                    mainText: pp?.mainText?.text ?? pp?.text?.text ?? input,
                    secondaryText: pp?.secondaryText?.text ?? '',
                    description: pp?.text?.text ?? input,
                };
            });

            setPredictions(preds);
            setShowDropdown(preds.length > 0);
        } catch (err) {
            console.error('AutocompleteSuggestion error:', err);
            setPredictions([]);
            setShowDropdown(false);
        } finally {
            setLoadingResults(false);
        }
    }, [mapsReady]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);
        if (onInputChange) onInputChange(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
    };

    const handleSelectPrediction = async (prediction: PlacePrediction) => {
        // Initial visual feedback while we fetch/lookup the full record.
        // Uses the address part of the prediction when the caller wants the
        // input to display the address; otherwise the place's display name.
        const initialDisplay = displayValueAfterSelect === 'address'
            ? (prediction.secondaryText || prediction.description || prediction.mainText)
            : prediction.mainText;
        setInputValue(initialDisplay);
        setShowDropdown(false);
        setPredictions([]);
        // NOTE: we deliberately DON'T call onInputChange here — most callers
        // use it to clear coords/address state on user typing, which would
        // wipe out what we're about to set in onPlaceSelected.

        const finalize = (name: string, formatted_address: string, location: { lat: number; lng: number } | null) => {
            const finalDisplay = displayValueAfterSelect === 'address' ? formatted_address : name;
            setInputValue(finalDisplay);
            onPlaceSelected({ name, formatted_address, location });
        };

        // Read-through cache: when the same placeId has been resolved before
        // (by anyone in the app), skip the paid fetchFields() roundtrip.
        try {
            const cacheRef = doc(db, 'places', prediction.placeId);
            const cached = await getDoc(cacheRef);
            if (cached.exists()) {
                const data = cached.data() as {
                    displayName: string;
                    formattedAddress: string;
                    location: { lat: number; lng: number } | null;
                };
                finalize(data.displayName, data.formattedAddress, data.location);
                return;
            }
        } catch (err) {
            // Cache lookup is non-fatal — fall through to Google.
            console.warn('[Places cache] read failed; falling through to Google', err);
        }

        try {
            const g = window.google;
            const place = new g.maps.places.Place({ id: prediction.placeId });
            await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
            // Refresh session token after a completed selection
            sessionTokenRef.current = new g.maps.places.AutocompleteSessionToken();
            const location = place.location
                ? { lat: place.location.lat(), lng: place.location.lng() }
                : null;
            const resolvedName = place.displayName ?? prediction.mainText;
            const resolvedAddress = place.formattedAddress ?? prediction.description;
            finalize(resolvedName, resolvedAddress, location);
            // Write-through to Firestore so the next selection is free.
            try {
                await setDoc(doc(db, 'places', prediction.placeId), {
                    displayName: resolvedName,
                    formattedAddress: resolvedAddress,
                    location,
                    cachedAt: Date.now(),
                });
            } catch (err) {
                console.warn('[Places cache] write failed', err);
            }
        } catch {
            finalize(prediction.mainText, prediction.description, null);
        }
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onFocus={() => { if (predictions.length > 0) setShowDropdown(true); }}
                placeholder={placeholder}
                className={`input-field ${className ?? ''}`}
                autoComplete="off"
            />

            {loadingResults && (
                <span style={{
                    position: 'absolute', right: '16px', top: '50%',
                    transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#9ca3af',
                    pointerEvents: 'none',
                }}>
                    Searching…
                </span>
            )}

            {showDropdown && predictions.length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    right: 0,
                    zIndex: 9999,
                    background: 'rgba(255,255,255,0.98)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: '16px',
                    border: '1.5px solid rgba(200,215,235,0.6)',
                    boxShadow: '0 12px 40px rgba(100,110,140,0.18)',
                    overflow: 'hidden',
                }}>
                    {predictions.map((p, i) => (
                        <button
                            key={p.placeId}
                            onMouseDown={() => handleSelectPrediction(p)}
                            type="button"
                            style={{
                                display: 'block',
                                width: '100%',
                                padding: '12px 16px',
                                textAlign: 'left',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: i < predictions.length - 1
                                    ? '1px solid rgba(200,210,220,0.35)' : 'none',
                                cursor: 'pointer',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(235,243,255,0.9)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1f2937' }}>
                                {p.mainText}
                            </div>
                            {p.secondaryText && (
                                <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '2px' }}>
                                    {p.secondaryText}
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
