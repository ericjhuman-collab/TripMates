import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { type Activity } from '../services/activities';
import { useTrip } from '../context/TripContext';
import { db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
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

const createAvatarIcon = (url?: string, name?: string) => {
    const initials = (name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const bg = 'var(--color-primary)';
    
    let htmlContent = '';
    if (url) {
        htmlContent = `<div style="background-image: url(${url}); background-size: cover; background-position: center; width: 36px; height: 36px; border-radius: 50%; border: 3px solid var(--color-surface); box-shadow: 0 3px 6px rgba(0,0,0,0.4);"></div>`;
    } else {
        htmlContent = `<div style="background-color: ${bg}; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; width: 36px; height: 36px; border-radius: 50%; border: 3px solid var(--color-surface); box-shadow: 0 3px 6px rgba(0,0,0,0.4);">${initials}</div>`;
    }

    return L.divIcon({
        className: 'custom-avatar-icon',
        html: htmlContent,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
    });
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
    const { appUser, updateProfile } = useAuth();
    const { activeTrip } = useTrip();
    const [center, setCenter] = useState<[number, number]>([45.4642, 9.1900]);
    const [homeCoords, setHomeCoords] = useState<[number, number] | null>(null);
    const dayString = format(currentDate, 'yyyy-MM-dd');

    // ── Live Location Tracking & Polling ──
    const [memberLocations, setMemberLocations] = useState<MemberLocation[]>([]);
    const [showMembers, setShowMembers] = useState(true);
    const watchIdRef = React.useRef<number | null>(null);

    useEffect(() => {
        if (!appUser?.uid || appUser.shareLocation === false) return;

        // Broadcast current user's location
        if (navigator.geolocation) {
            watchIdRef.current = navigator.geolocation.watchPosition(
                (pos) => {
                    updateProfile({
                        lastKnownLocation: {
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                            timestamp: Date.now()
                        }
                    }).catch(console.error);
                },
                (err) => {
                    // PERMISSION_DENIED (1) is the user's choice, not a bug —
                    // log quietly. POSITION_UNAVAILABLE (2) and TIMEOUT (3) are
                    // transient; warn but don't error. Stop watching on denial
                    // so we don't keep prompting/firing.
                    if (err.code === err.PERMISSION_DENIED) {
                        console.info('Location sharing declined; skipping live location.');
                        if (watchIdRef.current !== null) {
                            navigator.geolocation.clearWatch(watchIdRef.current);
                            watchIdRef.current = null;
                        }
                        return;
                    }
                    if (err.code === err.POSITION_UNAVAILABLE || err.code === err.TIMEOUT) {
                        console.warn('Geolocation unavailable:', err.message);
                        return;
                    }
                    console.error('Geolocation error:', err);
                },
                { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
            );
        }

        return () => {
            if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
        };
    }, [appUser?.uid, appUser?.shareLocation, updateProfile]);

    useEffect(() => {
        if (!activeTrip || !showMembers) return;
        
        let isMounted = true;
        const fetchMemberLocs = async () => {
            try {
                const fetched: MemberLocation[] = [];
                for (const memberId of activeTrip.members) {
                    if (memberId === appUser?.uid) continue; // Skip self in rendering other members
                    const docSnap = await getDoc(doc(db, 'users', memberId));
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        if (data.shareLocation !== false && data.lastKnownLocation) {
                            // Only show if the location is recent (e.g. past 24 hours)
                            const age = Date.now() - data.lastKnownLocation.timestamp;
                            if (age < 86400000) { 
                                fetched.push({
                                    uid: memberId,
                                    lat: data.lastKnownLocation.lat,
                                    lng: data.lastKnownLocation.lng,
                                    timestamp: data.lastKnownLocation.timestamp,
                                    name: data.name,
                                    avatarUrl: data.avatarUrl
                                });
                            }
                        }
                    }
                }
                if (isMounted) setMemberLocations(fetched);
            } catch (err) {
                console.error("Error fetching member locations", err);
            }
        };

        fetchMemberLocs();
        const interval = setInterval(fetchMemberLocs, 15000); // Poll every 15s

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [activeTrip, showMembers, appUser?.uid]);


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
                    <button onClick={onPrevDay} className="btn-icon" title="Previous day">
                        <ChevronLeft size={20} />
                    </button>
                    <div className={styles.dayLabel}>
                        <h2 className={styles.dayName}>{format(currentDate, 'EEEE')}</h2>
                        <p className={styles.dayDate}>{format(currentDate, 'MMM d')}</p>
                    </div>
                    <button onClick={onNextDay} className="btn-icon" title="Next day">
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
                        <Marker key={ml.uid} position={[ml.lat, ml.lng]} icon={createAvatarIcon(ml.avatarUrl, ml.name)}>
                            <Popup>
                                <div style={{ textAlign: 'center' }}>
                                    <h4 style={{ margin: 0 }}>{ml.name}</h4>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                        Active recently
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
                    <button 
                        className={`glass-btn ${styles.mapBtn}`}
                        onClick={() => setShowMembers(!showMembers)}
                        style={{ opacity: showMembers ? 1 : 0.6 }}
                    >
                        {showMembers ? 'Hide Members' : 'Show Members'}
                    </button>
                </div>
            </div>
        </div>
    );
};
