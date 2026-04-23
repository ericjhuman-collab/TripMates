import React, { useRef, useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { X, Plus, ArrowLeft, Check, Search } from 'lucide-react';
import type { GlobeMethods } from 'react-globe.gl';
import styles from './CountriesGlobe.module.css';

const Globe = React.lazy(() => import('react-globe.gl'));

const COUNTRIES_GEOJSON_URL =
    'https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson';

// Soft white 1×1 image — gives the globe a neutral white ocean base
const WHITE_GLOBE_IMG = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="#eef6ff" width="1" height="1"/></svg>`
)}`;

interface GeoFeature {
    type: string;
    properties: { NAME: string; ISO_A2: string; [key: string]: unknown };
    geometry: unknown;
}

interface Props {
    visitedCountries: string[];
    canEdit: boolean;
    onClose: () => void;
    onToggleCountry: (country: string, add: boolean) => void;
    initialFocus?: { lat: number; lng: number };
}

export const CountriesGlobe: React.FC<Props> = ({
    visitedCountries,
    canEdit,
    onClose,
    onToggleCountry,
    initialFocus = { lat: 52, lng: 14 },
}) => {
    const globeRef = useRef<GlobeMethods | undefined>(undefined);
    const [countries, setCountries] = useState<GeoFeature[]>([]);
    const [hovered, setHovered] = useState<GeoFeature | null>(null);
    const [showListPanel, setShowListPanel] = useState(false);
    const [listSearch, setListSearch] = useState('');

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const globeSize = Math.min(vw, vh * 0.68, 540);

    useEffect(() => {
        fetch(COUNTRIES_GEOJSON_URL)
            .then(r => r.json())
            .then((data: { features: GeoFeature[] }) => setCountries(data.features))
            .catch(console.error);
    }, []);

    useEffect(() => {
        if (!globeRef.current || countries.length === 0) return;
        const timer = setTimeout(() => {
            globeRef.current?.pointOfView({ lat: initialFocus.lat, lng: initialFocus.lng, altitude: 1.6 }, 800);
        }, 500);
        return () => clearTimeout(timer);
    }, [countries.length, initialFocus.lat, initialFocus.lng]);

    const visitedSet = useMemo(() => new Set(visitedCountries.map(c => c.toLowerCase())), [visitedCountries]);

    const getPolygonColor = useCallback((feat: object) => {
        const f = feat as GeoFeature;
        const name = f.properties.NAME || '';
        const isVisited = visitedSet.has(name.toLowerCase());
        const isHov = hovered?.properties?.NAME === name;
        if (isHov && canEdit) return isVisited ? 'rgba(239,68,68,0.85)' : 'rgba(244,185,66,0.9)';
        if (isVisited) return 'rgba(30,58,95,0.92)';         // TripMates navy
        return 'rgba(232,218,196,0.88)';                     // warm sand — clear on blue bg
    }, [visitedSet, hovered, canEdit]);

    const handlePolygonClick = useCallback((feat: object) => {
        if (!canEdit) return;
        const f = feat as GeoFeature;
        const name = f.properties.NAME;
        if (!name) return;
        const alreadyVisited = visitedSet.has(name.toLowerCase());
        onToggleCountry(name, !alreadyVisited);
    }, [canEdit, visitedSet, onToggleCountry]);

    // All country names from GeoJSON sorted alphabetically
    const allCountryNames = countries
        .map(c => c.properties.NAME)
        .sort((a, b) => a.localeCompare(b));

    const filteredList = allCountryNames.filter(name =>
        name.toLowerCase().includes(listSearch.toLowerCase())
    );

    return (
        <div className={styles.fullscreen}>
            {/* Top bar */}
            <div className={styles.topBar}>
                <button className={styles.topBtn} onClick={onClose} title="Close">
                    <ArrowLeft size={22} />
                </button>
                <div className={styles.topCenter}>
                    <span className={styles.topTitle}>Countries Visited</span>
                    <span className={styles.topBadge}>{visitedCountries.length}</span>
                </div>
                {canEdit ? (
                    <button className={styles.topBtn} onClick={() => setShowListPanel(true)} title="Add or remove countries">
                        <Plus size={22} />
                    </button>
                ) : <div style={{ width: 40 }} />}
            </div>

            {/* Globe hero */}
            <div className={styles.globeCenter}>
                <Suspense fallback={<div className={styles.loading}>Loading globe…</div>}>
                    <Globe
                        ref={globeRef}
                        width={globeSize}
                        height={globeSize}
                        backgroundColor="rgba(0,0,0,0)"
                        showAtmosphere
                        atmosphereColor="rgba(160,210,240,0.45)"
                        atmosphereAltitude={0.15}
                        globeImageUrl={WHITE_GLOBE_IMG}
                        polygonsData={countries}
                        polygonCapColor={getPolygonColor}
                        polygonSideColor={() => 'rgba(30,58,95,0.06)'}
                        polygonStrokeColor={() => 'rgba(255,255,255,0.7)'}
                        polygonAltitude={0.008}
                        onPolygonClick={handlePolygonClick}
                        onPolygonHover={(feat) => setHovered(feat as GeoFeature | null)}
                        polygonLabel={(feat) => {
                            const f = feat as GeoFeature;
                            const name = f.properties.NAME;
                            const visited = visitedSet.has(name?.toLowerCase());
                            const action = canEdit ? (visited ? '✕ Tap to remove' : '+ Tap to add') : (visited ? '✓ Visited' : '');
                            return `<div style="background:rgba(240,248,255,0.96);color:#1e3a5f;border-radius:10px;padding:7px 12px;font-size:13px;font-family:sans-serif;font-weight:600;box-shadow:0 4px 16px rgba(30,58,95,0.18);border:1px solid rgba(140,195,230,0.4)">${name}${action ? `<br/><span style="font-weight:400;font-size:11px;opacity:0.65">${action}</span>` : ''}</div>`;
                        }}
                    />
                </Suspense>
            </div>

            {/* Chips */}
            <div className={styles.chipArea}>
                {visitedCountries.length === 0 ? (
                    <p className={styles.emptyHint}>
                        {canEdit ? 'Tap a country on the globe or tap + to add countries' : 'No countries visited yet'}
                    </p>
                ) : (
                    <div className={styles.chipList}>
                        {[...visitedCountries].sort().map(c => (
                            <div key={c} className={styles.chip}>
                                {c}
                                {canEdit && (
                                    <button className={styles.chipX} onClick={() => onToggleCountry(c, false)} title={`Remove ${c}`} aria-label={`Remove ${c}`}>
                                        <X size={10} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Country list panel (slides up) ── */}
            {showListPanel && (
                <div className={styles.listPanel}>
                    <div className={styles.listHeader}>
                        <button className={styles.topBtn} onClick={() => { setShowListPanel(false); setListSearch(''); }} title="Back" aria-label="Back">
                            <ArrowLeft size={20} />
                        </button>
                        <span className={styles.topTitle}>Add / Remove Countries</span>
                        <div style={{ width: 40 }} />
                    </div>

                    <div className={styles.listSearchWrap}>
                        <Search size={16} className={styles.listSearchIcon} />
                        <input
                            className={styles.listSearchInput}
                            placeholder="Search countries…"
                            value={listSearch}
                            onChange={e => setListSearch(e.target.value)}
                            autoFocus
                        />
                        {listSearch && (
                            <button className={styles.listSearchClear} onClick={() => setListSearch('')} title="Clear search" aria-label="Clear search">
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <ul className={styles.countryList}>
                        {filteredList.map(name => {
                            const visited = visitedSet.has(name.toLowerCase());
                            return (
                                <li key={name} className={styles.countryItem} onClick={() => onToggleCountry(name, !visited)}>
                                    <span className={`${styles.countryDot} ${visited ? styles.countryDotVisited : ''}`} />
                                    <span className={styles.countryName}>{name}</span>
                                    <span className={`${styles.countryToggle} ${visited ? styles.countryToggleOn : ''}`}>
                                        {visited ? <Check size={14} /> : <Plus size={14} />}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
};
