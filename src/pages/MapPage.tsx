import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Copy, Check, Locate } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { type Activity } from '../services/activities';
import { useTrip } from '../context/TripContext';
import { db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { subscribeToTripLocations, type LiveLocationEntry } from '../services/liveLocation';
import { LiveLocationPicker } from '../components/LiveLocationPicker';
import styles from './MapPage.module.css';

interface MapPageProps {
    currentDate: Date;
    onPrevDay: () => void;
    onNextDay: () => void;
    activities: Activity[];
}

interface MemberLocation {
    uid: string;
    lat: number;
    lng: number;
    timestamp: number;
    avatarUrl?: string;
    name: string;
    /** True if this pin is from RTDB live data; false if it's the stale
     *  Firestore lastKnownLocation fallback ("last seen at..."). */
    live: boolean;
}

const createEmojiIcon = (emoji: string, isSurprise: boolean) => {
    return L.divIcon({
        className: 'custom-emoji-icon',
        html: `<div style="background-color: ${isSurprise ? '#f59e0b' : 'white'}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid ${isSurprise ? 'white' : 'var(--color-primary)'}; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 16px;">${isSurprise ? '❓' : emoji}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });
};

const createAvatarIcon = (url?: string, name?: string, live: boolean = true) => {
    const initials = (name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const bg = 'var(--color-primary)';
    // Stale (last-seen) pins are dimmed and don't pulse — gives an obvious
    // visual signal that the pin is a remembered position, not live.
    const opacity = live ? '1' : '0.55';
    const grayscale = live ? '0' : '60%';
    const filter = `opacity(${opacity}) grayscale(${grayscale})`;

    let htmlContent = '';
    if (url) {
        htmlContent = `<div style="background-image: url(${url}); background-size: cover; background-position: center; width: 36px; height: 36px; border-radius: 50%; border: 3px solid var(--color-surface); box-shadow: 0 3px 6px rgba(0,0,0,0.4); filter: ${filter};"></div>`;
    } else {
        htmlContent = `<div style="background-color: ${bg}; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; width: 36px; height: 36px; border-radius: 50%; border: 3px solid var(--color-surface); box-shadow: 0 3px 6px rgba(0,0,0,0.4); filter: ${filter};">${initials}</div>`;
    }

    return L.divIcon({
        className: 'custom-avatar-icon',
        html: htmlContent,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
    });
};

/** Format a "last seen" label. Today → "last seen 14:32", earlier → "last seen Apr 28, 14:32". */
const formatLastSeen = (ts: number): string => {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
        ? `last seen ${format(d, 'HH:mm')}`
        : `last seen ${format(d, 'MMM d, HH:mm')}`;
};

const MapUpdater = ({ center }: { center: [number, number] }) => {
    const map = useMap();
    useEffect(() => {
        map.setView(center, map.getZoom());
    }, [center, map]);
    return null;
};

const CopyAddressBtn = ({ address }: { address: string }) => {
    const [copied, setCopied] = useState(false);
    return (
        <button 
            onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }} 
            style={{ 
                background: 'none', 
                border: 'none', 
                cursor: 'pointer', 
                padding: '0.2rem 0.4rem', 
                color: copied ? '#22c55e' : 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: '4px',
                transition: 'all 0.2s',
                marginLeft: '0.25rem'
            }}
            title="Copy address"
        >
            {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
    );
};

export const MapPage: React.FC<MapPageProps> = ({ currentDate, onPrevDay, onNextDay, activities }) => {
    const { appUser } = useAuth();
    const { activeTrip } = useTrip();
    const [center, setCenter] = useState<[number, number]>([45.4642, 9.1900]);
    const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);
    const dayString = format(currentDate, 'yyyy-MM-dd');

    // ── Member locations: live (RTDB) + fallback (Firestore lastKnownLocation) ──
    // Live wins when both exist for the same member. Broadcasting is owned by
    // <LiveLocationDaemon>, not this page.
    const [liveEntries, setLiveEntries] = useState<Record<string, LiveLocationEntry>>({});
    const [memberMeta, setMemberMeta] = useState<Record<string, { name: string; avatarUrl?: string; lastKnownLocation?: { lat: number; lng: number; timestamp: number }; shareLocation?: boolean }>>({});
    const [showMembers, setShowMembers] = useState(true);
    const [locating, setLocating] = useState(false);

    // "Center on my location" — uses navigator.geolocation directly so it
    // works regardless of whether the user is sharing live location for this
    // trip. Just a one-shot query to re-centre the map view.
    const handleLocateMe = () => {
        if (!navigator.geolocation || locating) return;
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setCenter([pos.coords.latitude, pos.coords.longitude]);
                setLocating(false);
            },
            (err) => {
                console.warn('Locate failed:', err.message);
                setLocating(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
        );
    };

    // Subscribe to live RTDB locations for the active trip.
    useEffect(() => {
        if (!activeTrip?.id) return;
        return subscribeToTripLocations(activeTrip.id, setLiveEntries);
    }, [activeTrip?.id]);

    // One-shot fetch of member display metadata (name/avatar/lastKnown).
    // Refreshes every 60s so a freshly-added member's avatar shows up without
    // a page reload, but doesn't pretend to be a real-time channel.
    useEffect(() => {
        if (!activeTrip || !showMembers) return;
        let cancelled = false;
        const fetchMeta = async () => {
            const next: Record<string, { name: string; avatarUrl?: string; lastKnownLocation?: { lat: number; lng: number; timestamp: number }; shareLocation?: boolean }> = {};
            for (const memberId of activeTrip.members) {
                if (memberId === appUser?.uid) continue;
                try {
                    const snap = await getDoc(doc(db, 'users', memberId));
                    if (snap.exists()) {
                        const data = snap.data();
                        next[memberId] = {
                            name: data.name,
                            avatarUrl: data.avatarUrl,
                            lastKnownLocation: data.lastKnownLocation,
                            shareLocation: data.shareLocation,
                        };
                    }
                } catch (err) {
                    console.error('Failed to fetch member meta', err);
                }
            }
            if (!cancelled) setMemberMeta(next);
        };
        fetchMeta();
        const interval = setInterval(fetchMeta, 60000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [activeTrip, showMembers, appUser?.uid]);

    // Merge live + fallback into a single render list. Live entries win over
    // the Firestore lastKnownLocation fallback. We trust the daemon's auto-
    // stop and the Cloud Function cleanup to drop expired RTDB entries — no
    // expiry check at render time, which keeps the render pure.
    const memberLocations: MemberLocation[] = useMemo(() => {
        if (!activeTrip || !showMembers) return [];
        const out: MemberLocation[] = [];
        for (const memberId of activeTrip.members) {
            if (memberId === appUser?.uid) continue;
            const meta = memberMeta[memberId];
            if (!meta) continue;
            const live = liveEntries[memberId];
            if (live) {
                out.push({
                    uid: memberId,
                    lat: live.lat,
                    lng: live.lng,
                    timestamp: live.updatedAt,
                    name: meta.name,
                    avatarUrl: meta.avatarUrl,
                    live: true,
                });
            } else if (meta.shareLocation !== false && meta.lastKnownLocation) {
                out.push({
                    uid: memberId,
                    lat: meta.lastKnownLocation.lat,
                    lng: meta.lastKnownLocation.lng,
                    timestamp: meta.lastKnownLocation.timestamp,
                    name: meta.name,
                    avatarUrl: meta.avatarUrl,
                    live: false,
                });
            }
        }
        return out;
    }, [activeTrip, showMembers, appUser?.uid, liveEntries, memberMeta]);


    useEffect(() => {
        const fetchGeocode = async (query: string): Promise<[number, number] | null> => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`, {
                    headers: { 'User-Agent': 'TripMates/1.0' }
                });
                const data = await res.json();
                if (data && data.length > 0) {
                    return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                }
            } catch (err) {
                console.error('Geocoding error:', err);
            }
            return null;
        };

        const updateMapData = async () => {
            // Prefer exact coords stored at trip creation time
            if (activeTrip?.accommodationLocation) {
                const { lat, lng } = activeTrip.accommodationLocation;
                setHomeCoords([lat, lng]);
                setCenter([lat, lng]);
                return;
            }
            // Fall back: geocode the accommodation name string
            if (activeTrip?.accommodation) {
                const coords = await fetchGeocode(activeTrip.accommodationAddress || activeTrip.accommodation);
                if (coords) {
                    setHomeCoords(coords);
                    setCenter(coords);
                    return;
                }
            }

            setHomeCoords(null);
            if (activeTrip?.destination) {
                const destCoords = await fetchGeocode(activeTrip.destination);
                if (destCoords) {
                    setCenter(destCoords);
                }
            }
        };

        updateMapData();
    }, [activeTrip?.accommodationLocation, activeTrip?.accommodation, activeTrip?.accommodationAddress, activeTrip?.destination]);

    const displayActivities = activities.filter(a => a.location !== null && a.day === dayString);

    return (
        <div className={`animate-fade-in ${styles.page}`}>
            <div className={styles.header}>
                <div>
                    <h2 className={styles.title}>Itinerary Map</h2>
                    <p className={styles.subtitle}>All trip destinations in {activeTrip?.destination || 'Milan'}.</p>
                </div>

                <div className={styles.dayNav}>
                    <button onClick={onPrevDay} className="btn-icon" title="Previous day" aria-label="Previous day">
                        <ChevronLeft size={20} />
                    </button>
                    <div className={styles.dayLabel}>
                        <h2 className={styles.dayName}>{format(currentDate, 'EEEE')}</h2>
                        <p className={styles.dayDate}>{format(currentDate, 'MMM d')}</p>
                    </div>
                    <button onClick={onNextDay} className="btn-icon" title="Next day" aria-label="Next day">
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            <div className={styles.mapWrapper}>
                <MapContainer center={center} zoom={13} className={styles.map}>
                    <MapUpdater center={center} />
                    <TileLayer
                        attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    />

                    {displayActivities.map(act => {
                        const markerIcon = createEmojiIcon(act.mapIcon || '📍', false);

                        return act.location ? (
                            <Marker key={act.id} position={[act.location.lat, act.location.lng]} icon={markerIcon}>
                                <Tooltip permanent direction="top" offset={[0, -16]} className="custom-tooltip">
                                    <span className={styles.tooltipTime}>{act.time}</span>
                                </Tooltip>
                                <Popup>
                                    <div className={styles.popupCenter}>
                                        <strong>{act.title}</strong><br />
                                        <span>{act.day} — {act.time}</span><br />
                                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {act.locationName}
                                            <CopyAddressBtn address={act.locationName} />
                                        </span>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.8rem' }}>
                                            <a
                                                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(act.address || act.locationName)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`btn btn-primary ${styles.mapsLink}`}
                                                style={{ padding: '0.5rem', fontSize: '0.8rem', whiteSpace: 'nowrap', margin: 0 }}
                                            >
                                                Open in Google Maps
                                            </a>
                                            <a
                                                href={`https://www.google.com/search?q=${encodeURIComponent(act.locationName + (act.address ? ' ' + act.address : ''))}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`btn`}
                                                style={{ backgroundColor: 'white', color: 'var(--color-primary-dark)', border: '1px solid var(--color-border)', padding: '0.5rem', fontSize: '0.8rem', whiteSpace: 'nowrap', margin: 0 }}
                                            >
                                                View Google Profile
                                            </a>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        ) : null;
                    })}

                    {showMembers && memberLocations.map(ml => (
                        <Marker key={ml.uid} position={[ml.lat, ml.lng]} icon={createAvatarIcon(ml.avatarUrl, ml.name, ml.live)}>
                            <Popup>
                                <div style={{ textAlign: 'center' }}>
                                    <h4 style={{ margin: 0 }}>{ml.name}</h4>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                        {ml.live ? 'Sharing live' : formatLastSeen(ml.timestamp)}
                                    </p>
                                </div>
                            </Popup>
                        </Marker>
                    ))}


                    {homeCoords && (
                        <Marker position={homeCoords} icon={createEmojiIcon('🏠', false)}>
                            <Popup maxWidth={260} minWidth={220}>
                                <div className={styles.popupCenter} style={{ textAlign: 'center', padding: '0.2rem' }}>
                                    <strong style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                                        {activeTrip?.accommodation}
                                        <CopyAddressBtn address={activeTrip?.accommodation || ''} />
                                    </strong>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.8rem' }}>
                                        I&apos;m too fucked to find my way home, show directions
                                    </span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <a
                                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(activeTrip?.accommodation || '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`btn btn-primary`}
                                            style={{ padding: '0.5rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                                        >
                                            Open in Google Maps
                                        </a>
                                        <a
                                            href={`https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${homeCoords[0]}&dropoff[longitude]=${homeCoords[1]}&dropoff[formatted_address]=${encodeURIComponent(activeTrip?.accommodation || '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`btn`}
                                            style={{ backgroundColor: 'black', color: 'white', border: 'none', padding: '0.5rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                                        >
                                            Ride with Uber
                                        </a>
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    )}
                </MapContainer>

                {/* View Controls Overlay */}
                <div className={styles.mapControls}>
                    {activeTrip && (
                        <LiveLocationPicker tripId={activeTrip.id} compact />
                    )}
                    <button
                        className={`glass-btn ${styles.mapBtn}`}
                        onClick={() => setShowMembers(!showMembers)}
                        style={{ opacity: showMembers ? 1 : 0.6 }}
                    >
                        {showMembers ? 'Hide Members' : 'Show Members'}
                    </button>
                    <button
                        className={`glass-btn ${styles.locateBtn}`}
                        onClick={handleLocateMe}
                        disabled={locating}
                        aria-label="Center on my location"
                        title="Center on my location"
                    >
                        <Locate size={18} className={locating ? styles.locateSpinning : ''} />
                    </button>
                </div>
            </div>
        </div>
    );
};
