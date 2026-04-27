import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { X, MapPin, Plus, Map as MapIcon, CheckSquare, Settings, Camera, Images, Bell, Menu, LogOut, UserPlus, UserCheck, ArrowLeft, Globe as GlobeIcon, Users, Building2 } from 'lucide-react';
import { useAuth, type AppUser } from '../context/AuthContext';
import { useTrip, type Trip } from '../context/TripContext';
import { auth, db, storage } from '../services/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, getDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getAllActivities, type Activity } from '../services/activities';
import { getActivityGallery, getTripGallery, type GalleryImage } from '../services/gallery';
import { followUser, unfollowUser, getNotifications, markNotificationRead, type SocialNotification } from '../services/social';
import { changeUsername, isUsernameAvailable, normalizeUsername, validateUsername } from '../services/username';
import { cityToCountry } from '../utils/cityToCountry';
import { CountriesGlobe } from '../components/CountriesGlobe';
import { Groups } from './Groups';
import { Network } from './Network';
import { BusinessDashboard } from './BusinessDashboard';
import { MyActivities } from './MyActivities';
import { SUPPORTED_CURRENCIES } from '../utils/currencies';
import { getDefaultCover } from '../utils/defaultCovers';
import { CustomSelect } from '../components/CustomSelect';
import { ModernPlaceAutocomplete } from '../components/ModernPlaceAutocomplete';
import styles from './Profile.module.css';
import adminStyles from './TripAdmin.module.css';

// ── ActivitySlide: shows cover image, or a Tripmates library default ─────────
interface ActivitySlideProps {
    activity: Activity;
    viewTripId: string;
    onPhotosPill: () => void;
}
const ActivitySlide: React.FC<ActivitySlideProps> = ({ activity, onPhotosPill }) => {
    // Use uploaded cover if present, otherwise pick from the built-in library
    const coverImage = activity.imageUrl
        || getDefaultCover(activity.category, activity.locationName || activity.title);

    return (
        <div className={styles.activitySlide}>
            {/* Cover image */}
            <div
                className={styles.activitySlideImage}
                style={{ backgroundImage: `url(${coverImage})` }}
            />

            {/* Info bar below image */}
            <div className={styles.activitySlideBody}>
                <div className={styles.activitySlideRow}>
                    <h3 className={styles.activitySlideTitle}>
                        {activity.locationName || activity.title}
                    </h3>
                    <button className={styles.activityPhotosPill} onClick={onPhotosPill}>
                        <Camera size={12} /> Photos
                    </button>
                </div>
                {(activity.time || activity.endTime) && (
                    <p className={styles.activitySlideTime}>
                        {activity.time}{activity.endTime ? ` – ${activity.endTime}` : ''}
                    </p>
                )}
                {activity.address && (
                    <p className={styles.activityAddress}>
                        <MapPin size={13} className={styles.activityAddressIcon} />
                        <span className={styles.activityAddressText}>{activity.address}</span>
                    </p>
                )}
            </div>
        </div>
    );
};

export const Profile: React.FC = () => {
    const { logoutMock, appUser, updateProfile } = useAuth();
    const { activeTrip, createTrip, joinTrip, userTrips: contextUserTrips, updateTrip } = useTrip();

    const navigate = useNavigate();
    const { uid } = useParams();
    const isOwner = !uid || uid === appUser?.uid;

    const [searchParams, setSearchParams] = useSearchParams();
    const mainTabRaw = searchParams.get('tab');
    const validTabs = ['admin', 'settings', 'groups', 'businessDashboard', 'network', 'myActivities'];
    const mainTab = validTabs.includes(mainTabRaw as string) ? mainTabRaw : 'profile';
    const setMainTab = (tab: 'profile' | 'admin' | 'settings' | 'groups' | 'businessDashboard' | 'network' | 'myActivities') => {
        if (tab === 'profile') {
            setSearchParams({});
        } else {
            setSearchParams({ tab });
        }
    };
    const [adminSubTab, setAdminSubTab] = useState<'current' | 'future' | 'past' | 'bucketlist'>('current');
    const [showCreateTrip, setShowCreateTrip] = useState(false);
    const [showJoinTrip, setShowJoinTrip] = useState(false);
    const [joinTripCode, setJoinTripCode] = useState('');
    const [joiningTrip, setJoiningTrip] = useState(false);

    // ── UI drawers ─────────────────────────────
    const location = useLocation();
    const [showHamburger, setShowHamburger] = useState(
        Boolean((location.state as { openMenu?: boolean } | null)?.openMenu)
    );
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleteInProgress, setDeleteInProgress] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    useEffect(() => {
        const state = location.state as { openMenu?: boolean } | null;
        if (state?.openMenu) {
            setShowHamburger(true);
            window.history.replaceState({}, '');
        }
    }, [location.state]);

    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState<SocialNotification[]>([]);
    const unreadCount = notifications.filter(n => !n.read).length;

    // ── Follow state ──────────────────────────
    const [isFollowing, setIsFollowing] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);

    // ── Countries globe ──────────────────────
    const [showGlobe, setShowGlobe] = useState(false);

    // ── Avatar upload (settings) ───────────────
    const avatarUploadRef = useRef<HTMLInputElement>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [initialsStyle, setInitialsStyle] = useState({ bg: '#1e293b', color: '#ffffff' });

    const [createTripForm, setCreateTripForm] = useState({
        name: '', destination: '', type: 'Default Trip',
        startDate: '', endDate: '', accommodation: '',
        accommodationAddress: '', accommodationLocation: null as { lat: number; lng: number } | null,
        activeGames: ['bingo', 'cheers'] as string[],
        defaultGame: 'bingo', baseCurrency: 'SEK'
    });
    
    const [creatingTrip, setCreatingTrip] = useState(false);
    const createTripCoverRef = useRef<File | null>(null);
    const [createTripCoverPreview, setCreateTripCoverPreview] = useState('');

    const [targetUser, setTargetUser] = useState<AppUser | null>(null);
    const [targetTrips, setTargetTrips] = useState<Trip[]>([]);
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);

    const [gridTab, setGridTab] = useState<'posts' | 'bucketlist' | 'settings'>('posts');
    const [viewTripDetails, setViewTripDetails] = useState<Trip | null>(null);

    const [modalActivities, setModalActivities] = useState<Activity[]>([]);
    const [modalCategory, setModalCategory] = useState<string>('All');
    const [isLoadingModal, setIsLoadingModal] = useState(false);
    const [activeSlide, setActiveSlide] = useState(0);
    const carouselRef = useRef<HTMLDivElement>(null);

    const handleCarouselScroll = useCallback(() => {
        if (carouselRef.current) {
            const { scrollLeft, offsetWidth } = carouselRef.current;
            setActiveSlide(Math.round(scrollLeft / offsetWidth));
        }
    }, []);

    // Reset slide when category changes
    useEffect(() => {
        setActiveSlide(0);
        if (carouselRef.current) carouselRef.current.scrollLeft = 0;
    }, [modalCategory]);

    // ── Gallery modal state ───────────────────
    const [activityGallery, setActivityGallery] = useState<{ tripId: string; activityId: string; activityName: string } | null>(null);
    const [activityGalleryImages, setActivityGalleryImages] = useState<GalleryImage[]>([]);
    const [isLoadingActivityGallery, setIsLoadingActivityGallery] = useState(false);

    const [tripGalleryOpen, setTripGalleryOpen] = useState(false);
    const [tripGalleryImages, setTripGalleryImages] = useState<GalleryImage[]>([]);
    const [isLoadingTripGallery, setIsLoadingTripGallery] = useState(false);

    useEffect(() => {
        if (!activityGallery) return;
        setIsLoadingActivityGallery(true);
        getActivityGallery(activityGallery.tripId, activityGallery.activityId)
            .then(setActivityGalleryImages)
            .catch(console.error)
            .finally(() => setIsLoadingActivityGallery(false));
    }, [activityGallery]);

    useEffect(() => {
        if (!tripGalleryOpen || !viewTripDetails) return;
        setIsLoadingTripGallery(true);
        getTripGallery(viewTripDetails.id)
            .then(setTripGalleryImages)
            .catch(console.error)
            .finally(() => setIsLoadingTripGallery(false));
    }, [tripGalleryOpen, viewTripDetails]);

    const [isEditingProfile] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', phoneNumber: '', avatarUrl: '', sharePhoneNumber: false, shareLocation: true });
    const [myPhoneNumber, setMyPhoneNumber] = useState<string>('');

    // ── Username editor state ─────────────────────────────────────────────
    const [usernameInput, setUsernameInput] = useState('');
    const [usernameStatus, setUsernameStatus] = useState<
        | { kind: 'idle' }
        | { kind: 'invalid'; reason: string }
        | { kind: 'checking' }
        | { kind: 'available' }
        | { kind: 'taken' }
        | { kind: 'unchanged' }
    >({ kind: 'idle' });
    const [savingUsername, setSavingUsername] = useState(false);

    // Sync local field with appUser.username when it loads.
    useEffect(() => {
        if (appUser?.username !== undefined) {
            setUsernameInput(appUser.username || '');
        }
    }, [appUser?.username]);

    // Debounced live availability check.
    useEffect(() => {
        if (!isOwner) return;
        const candidate = normalizeUsername(usernameInput);
        if (!candidate) { setUsernameStatus({ kind: 'idle' }); return; }
        if (candidate === (appUser?.username || '')) {
            setUsernameStatus({ kind: 'unchanged' }); return;
        }
        const v = validateUsername(candidate);
        if (!v.valid) { setUsernameStatus({ kind: 'invalid', reason: v.reason || 'Invalid username.' }); return; }
        setUsernameStatus({ kind: 'checking' });
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const free = await isUsernameAvailable(candidate);
                if (cancelled) return;
                setUsernameStatus(free ? { kind: 'available' } : { kind: 'taken' });
            } catch (e) {
                if (cancelled) return;
                console.error('Username availability check failed', e);
                setUsernameStatus({ kind: 'idle' });
            }
        }, 350);
        return () => { cancelled = true; clearTimeout(t); };
    }, [usernameInput, appUser?.username, isOwner]);

    const handleSaveUsername = async () => {
        if (!appUser) return;
        const next = normalizeUsername(usernameInput);
        if (usernameStatus.kind !== 'available') return;
        setSavingUsername(true);
        try {
            await changeUsername(appUser.uid, appUser.username, next);
            // The auth context will re-read user doc on next refresh; for snappier UX
            // we could call updateProfile but changeUsername already wrote the field.
        } catch (e) {
            console.error('Failed to change username', e);
            alert('Could not change username: ' + (e instanceof Error ? e.message : 'unknown'));
        } finally {
            setSavingUsername(false);
        }
    };

    useEffect(() => {
        if (viewTripDetails) {
            setIsLoadingModal(true);
            getAllActivities(viewTripDetails.id).then(acts => {
                setModalActivities(acts);
                setIsLoadingModal(false);
            }).catch(err => {
                console.error(err);
                setIsLoadingModal(false);
            });
        } else {
            setModalActivities([]);
            setModalCategory('All');
        }
    }, [viewTripDetails]);

    // Sync initialsStyle from loaded appUser
    useEffect(() => {
        if (appUser?.initialsStyle) {
            setInitialsStyle(appUser.initialsStyle as { bg: string; color: string });
        }
    }, [appUser?.initialsStyle]);

    useEffect(() => {
        if (isOwner) {
            setTargetUser(appUser);
        } else if (uid) {
            const fetchTarget = async () => {
                setIsLoadingProfile(true);
                try {
                    const userDoc = await getDoc(doc(db, 'users', uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data() as AppUser;
                        setTargetUser(data);
                        if (data.trips && data.trips.length > 0) {
                            const tDocs = await Promise.all(data.trips.map(id => getDoc(doc(db, 'trips', id))));
                            setTargetTrips(tDocs.filter(d => d.exists()).map(d => ({ ...d.data(), id: d.id } as Trip)));
                        } else {
                            setTargetTrips([]);
                        }
                    } else {
                        setTargetUser(null);
                    }
                } catch (e) {
                    console.error('Failed to fetch target user', e);
                }
                setIsLoadingProfile(false);
            };
            fetchTarget();
        }
    }, [uid, isOwner, appUser]);

    useEffect(() => {
        if (appUser && !isEditingProfile) {
            setEditForm({
                name: appUser.name || '',
                phoneNumber: myPhoneNumber,
                sharePhoneNumber: appUser.sharePhoneNumber || false,
                avatarUrl: appUser.avatarUrl || '',
                shareLocation: appUser.shareLocation !== false // Default to true
            });
        }
    }, [appUser, isEditingProfile, myPhoneNumber]);

    // Fetch own phone from the private subcollection (rule allows isMe(uid)).
    useEffect(() => {
        let cancelled = false;
        if (!appUser?.uid || !isOwner) return;
        (async () => {
            const { getPrivateContact } = await import('../services/userContact');
            const data = await getPrivateContact(appUser.uid);
            if (!cancelled) setMyPhoneNumber(data?.phoneNumber ?? '');
        })();
        return () => { cancelled = true; };
    }, [appUser?.uid, isOwner]);

    const now = new Date();
    const tripsToAnalyze = isOwner ? contextUserTrips : targetTrips;
    const adminFilteredTrips = contextUserTrips.filter(t => {
        const start = t.startDate ? new Date(t.startDate) : null;
        const end = t.endDate ? new Date(t.endDate) : null;
        switch (adminSubTab) {
            case 'current': return start && end && start <= now && end >= now;
            case 'future': return start && start > now;
            case 'past': return end && end < now;
            case 'bucketlist': return !start;
            default: return false;
        }
    });

    // ── Travel stats (derived client-side) ───
    const tripsCompleted = tripsToAnalyze.filter(t => t.endDate && new Date(t.endDate) < now).length;

    // Countries: auto from trip destinations + manually added
    const autoCountries = new Set(
        tripsToAnalyze
            .map(t => cityToCountry(t.destination))
            .filter(Boolean) as string[]
    );
    const manualCountries: string[] = (isOwner ? appUser : targetUser)?.manualVisitedCountries ?? [];
    const allVisitedCountries = [...new Set([...autoCountries, ...manualCountries])];
    const countriesVisited = allVisitedCountries.length;

    const handleSaveProfile = async () => {
        try {
            await updateProfile({
                name: editForm.name,
                sharePhoneNumber: editForm.sharePhoneNumber,
                shareLocation: editForm.shareLocation,
                avatarUrl: editForm.avatarUrl,
                initialsStyle,
            } as Partial<AppUser>);
            if (appUser?.uid) {
                const { setOwnPhoneNumber } = await import('../services/userContact');
                await setOwnPhoneNumber(appUser.uid, editForm.phoneNumber);
                setMyPhoneNumber(editForm.phoneNumber);
            }
        } catch (err) {
            console.error('Failed to save profile', err);
            alert('Failed to save profile changes.');
        }
    };

    const handleAvatarUpload = async (file: File) => {
        if (!appUser) return;
        setAvatarUploading(true);
        try {
            const ext = file.name.split('.').pop();
            const storageRef = ref(storage, `avatars/${appUser.uid}/avatar.${ext}`);
            const task = uploadBytesResumable(storageRef, file);
            await new Promise<void>((resolve, reject) => {
                task.on('state_changed', null, reject, resolve);
            });
            const url = await getDownloadURL(storageRef);
            await updateProfile({ avatarUrl: url });
            setEditForm(prev => ({ ...prev, avatarUrl: url }));
        } catch (e) {
            console.error('Avatar upload failed', e);
            alert('Failed to upload avatar.');
        }
        setAvatarUploading(false);
    };

    const handleLogout = () => { logoutMock(); auth.signOut(); navigate('/login'); };

    const handlePasswordReset = async () => {
        const email = auth.currentUser?.email;
        if (!email) return;
        try {
            await sendPasswordResetEmail(auth, email);
            alert(`A password reset link has been sent to ${email}.`);
        } catch (error) {
            console.error('Failed to send password reset email:', error);
            alert('Failed to send password reset email.');
        }
    };

    const handleDeleteAccount = async () => {
        setDeleteError('');
        setDeleteInProgress(true);
        try {
            const { deleteMyAccount } = await import('../services/userAccount');
            await deleteMyAccount();
            navigate('/login', { replace: true });
        } catch (err) {
            console.error('Account deletion failed', err);
            setDeleteError(err instanceof Error ? err.message : 'Could not delete account.');
            setDeleteInProgress(false);
        }
    };

    // ── Follow / notifications ───────────────
    useEffect(() => {
        if (!uid || isOwner || !appUser) return;
        setIsFollowing((appUser.following || []).includes(uid));
    }, [uid, isOwner, appUser]);

    useEffect(() => {
        if (!appUser || !isOwner) return;
        getNotifications(appUser.uid).then(setNotifications).catch(console.error);
    }, [appUser, isOwner]);

    const handleFollow = async () => {
        if (!appUser || !targetUser || followLoading) return;
        setFollowLoading(true);
        try {
            if (isFollowing) {
                await unfollowUser(appUser.uid, targetUser.uid);
                setIsFollowing(false);
            } else {
                await followUser(appUser.uid, targetUser.uid, appUser.name, appUser.avatarUrl);
                setIsFollowing(true);
            }
        } catch (e) {
            console.error('Follow action failed', e);
        }
        setFollowLoading(false);
    };

    const handleFollowBack = async (fromUid: string, notifId: string) => {
        if (!appUser) return;
        await followUser(appUser.uid, fromUid, appUser.name, appUser.avatarUrl);
        await markNotificationRead(appUser.uid, notifId);
        setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
    };

    // ── Globe toggle country ───────────────
    const handleToggleCountry = async (country: string, add: boolean) => {
        if (!appUser) return;
        const current = appUser.manualVisitedCountries ?? [];
        const updated = add
            ? [...new Set([...current, country])]
            : current.filter(c => c !== country);
        await updateProfile({ manualVisitedCountries: updated });
    };

    const handleToggleBucketlistCountry = async (country: string, add: boolean) => {
        if (!appUser) return;
        const current = appUser.bucketlistCountries ?? [];
        const updated = add
            ? [...new Set([...current, country])]
            : current.filter(c => c !== country);
        await updateProfile({ bucketlistCountries: updated });
    };

    const bucketlistCountries: string[] = (isOwner ? appUser : targetUser)?.bucketlistCountries ?? [];

    const displayUser = isOwner ? appUser : targetUser;

    if (isLoadingProfile && !isOwner) {
        return <div className={styles.loadingState}>Loading profile...</div>;
    }

    if (!displayUser && !isOwner) {
        return <div className={styles.errorState}>User not found.</div>;
    }

    return (
        <div className={`animate-fade-in ${styles.page}`}>

            {/* ── Header icons portalled into Layout's header slot ── */}
            {isOwner && (() => {
                const slot = document.getElementById('profile-header-slot');
                if (!slot) return null;
                
                // Hide hamburger menu entirely if we are deep linked so we don't have overlapping buttons
                if (mainTab !== 'profile') {
                    return null;
                }

                return createPortal(
                    <button
                        className={styles.topBarBtn}
                        onClick={() => setShowHamburger(true)}
                        title="Menu"
                    >
                        <Menu size={22} />
                        {unreadCount > 0 && <span className={styles.notifBadge}>{unreadCount}</span>}
                    </button>,
                    slot
                );
            })()}

            {/* ── Profile hero ─────────────────────── */}
            {mainTab === 'profile' && (
                <div className={`animate-fade-in ${styles.contentSection}`}>
                    <div className={styles.profileHero}>
                        {/* Avatar */}
                        <div className={styles.heroAvatarWrap}>
                            {displayUser?.avatarUrl ? (
                                <img src={displayUser.avatarUrl} alt="Avatar" className={styles.heroAvatar} />
                            ) : (
                                <div
                                    className={styles.heroAvatarPlaceholder}
                                    style={{ background: (displayUser?.initialsStyle as { bg: string; color: string } | undefined)?.bg ?? initialsStyle.bg }}
                                >
                                    <span style={{
                                        color: (displayUser?.initialsStyle as { bg: string; color: string } | undefined)?.color ?? initialsStyle.color,
                                        fontSize: '1.75rem',
                                        fontWeight: 800,
                                    }}>
                                        {(displayUser?.name || '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                                    </span>
                                </div>
                            )}
                        </div>

                        <h2 className={styles.heroName}>{displayUser?.fullName || displayUser?.name}</h2>
                        <p className={styles.heroHandle}>@{displayUser?.name}</p>

                        {/* Travel stats row */}
                        <div className={styles.statsRow}>
                            <div className={styles.statBox}>
                                <span className={styles.statNum}>{tripsCompleted}</span>
                                <span className={styles.statLabel}>Trips</span>
                            </div>
                            <div className={styles.statDivider} />
                            <button className={styles.statGlobeBtn} onClick={() => setShowGlobe(true)} title="View Countries">
                                <GlobeIcon size={24} />
                            </button>
                            <div className={styles.statDivider} />
                            <div className={styles.statBox}>
                                <span className={styles.statNum}>{countriesVisited}</span>
                                <span className={styles.statLabel}>Countries</span>
                            </div>
                        </div>

                        {/* Follow button — only on other profiles */}
                        {!isOwner && appUser && (
                            <button
                                className={`btn ${isFollowing ? styles.followingBtn : styles.followBtn}`}
                                onClick={handleFollow}
                                disabled={followLoading}
                            >
                                {isFollowing
                                    ? <><UserCheck size={16} /> Following</>
                                    : <><UserPlus size={16} /> Follow</>}
                            </button>
                        )}

                        {/* Current location */}
                        {(isOwner ? activeTrip : targetTrips.find(t => t.id === displayUser?.activeTripId)) && (
                            <p className={styles.heroLocation}>
                                <MapPin size={13} />
                                Currently in {(isOwner ? activeTrip?.destination : targetTrips.find(t => t.id === displayUser?.activeTripId)?.destination) || 'Active Trip'}
                            </p>
                        )}
                    </div>

                    {/* Trips grid */}
                    <div className={styles.subNavPill}>
                        <button onClick={() => setGridTab('posts')} className={`${styles.subNavBtn} ${gridTab === 'posts' ? styles.subNavBtnActive : ''}`}>
                            Trips ({tripsToAnalyze.length})
                        </button>
                        <button onClick={() => setGridTab('bucketlist')} className={`${styles.subNavBtn} ${gridTab === 'bucketlist' ? styles.subNavBtnActive : ''}`}>
                            Bucketlist ({displayUser?.bucketlist?.length || 0})
                        </button>
                    </div>

                    {gridTab === 'posts' && (
                        <div className={styles.tripsGridSection}>
                            <div className={styles.grid}>
                                {tripsToAnalyze.map(trip => (
                                    <div
                                        key={trip.id}
                                        onClick={() => setViewTripDetails(trip)}
                                        className={styles.gridItem}
                                        style={trip.imageUrl ? { backgroundImage: `url(${trip.imageUrl})` } : {}}
                                    >
                                        {trip.imageUrl && <div className={styles.gridItemScrim} />}
                                        <span className={`${styles.gridItemLabel} ${trip.imageUrl ? styles.gridItemLabelOnImage : styles.gridItemLabelNoImage}`}>
                                            {trip.name}
                                        </span>
                                    </div>
                                ))}
                                {tripsToAnalyze.length === 0 && (
                                    <p className={styles.tripEmptyText} style={{ gridColumn: '1 / -1' }}>No trips yet.</p>
                                )}
                            </div>
                        </div>
                    )}

                    {gridTab === 'bucketlist' && (
                        <div className={styles.grid}>
                            {displayUser?.bucketlist?.map(destination => (
                                <div key={destination} className={styles.bucketlistItem}>
                                    <span className={styles.bucketlistItemText}>{destination}</span>
                                    {isOwner && (
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (!appUser) return;
                                                const currentList = appUser.bucketlist || [];
                                                await updateProfile({ bucketlist: currentList.filter(d => d !== destination) });
                                            }}
                                            className={styles.bucketlistRemoveBtn}
                                            title="Remove from bucketlist"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            {isOwner && (
                                <div
                                    onClick={async () => {
                                        const item = prompt('Add to bucketlist:');
                                        if (item && appUser) {
                                            const currentList = appUser.bucketlist || [];
                                            if (!currentList.includes(item.trim())) {
                                                await updateProfile({ bucketlist: [...currentList, item.trim()] });
                                            }
                                        }
                                    }}
                                    className={styles.addGridItem}
                                >
                                    <Plus size={24} />
                                    <span className={styles.addGridLabel}>Add</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── My Trips tab (from hamburger) ── */}
            {mainTab === 'admin' && (
                <div className="animate-fade-in">
                        <div className={styles.adminHeader}>
                            <h2 className={styles.adminTitle}>My Trips</h2>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className={`btn btn-primary ${styles.createBtn}`} onClick={() => setShowJoinTrip(true)}>
                                    Join
                                </button>
                                <button className={`btn btn-primary ${styles.createBtn}`} onClick={() => setShowCreateTrip(true)}>
                                    <Plus size={16} /> Create
                                </button>
                            </div>
                        </div>

                        <div className={styles.subNavPill}>
                            {(['current', 'future', 'past', 'bucketlist'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setAdminSubTab(tab)}
                                    className={`${styles.subNavBtn} ${adminSubTab === tab ? styles.subNavBtnActive : ''}`}
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </div>

                        <div className={styles.tripList}>
                            {adminFilteredTrips.map(trip => (
                                <div key={trip.id} onClick={() => navigate(`/admin/${trip.id}`)} className={`glass-panel ${styles.tripListItem}`}>
                                    <div
                                        className={styles.tripThumb}
                                        style={{ backgroundImage: trip.imageUrl ? `url(${trip.imageUrl})` : 'none' }}
                                    />
                                    <div>
                                        <h4 className={styles.tripName}>{trip.name}</h4>
                                        <p className={styles.tripDestination}>{trip.destination || 'Unset destination'}</p>
                                    </div>
                                </div>
                            ))}
                            {adminFilteredTrips.length === 0 && (
                                <p className={styles.tripEmptyText}>No trips found.</p>
                            )}
                        </div>
                    </div>
            )}

            {/* ── Groups tab (from hamburger) ── */}
            {mainTab === 'groups' && (
                <div style={{ height: '100%', overflow: 'hidden' }}>
                    <Groups onBack={() => setMainTab('profile')} />
                </div>
            )}
            
            {/* ── Network tab (from hamburger) ── */}
            {mainTab === 'network' && (
                <div style={{ height: '100%', overflow: 'hidden' }}>
                    <Network />
                </div>
            )}
            {/* ── My Locations tab (from hamburger) ── */}
            {mainTab === 'myActivities' && (
                <div style={{ height: '100%', overflow: 'hidden' }}>
                    <MyActivities onBack={() => setMainTab('profile')} />
                </div>
            )}
            
            {/* ── Business Dashboard tab ── */}
            {mainTab === 'businessDashboard' && (
                <div style={{ height: '100%', overflow: 'hidden' }}>
                    <BusinessDashboard onBack={() => setMainTab('profile')} />
                </div>
            )}

            {/* ── Settings tab (from hamburger) ── */}
            {mainTab === 'settings' && (
                <div className={`animate-fade-in ${styles.fullWidthSection}`}>
                    <div className={`glass-panel ${styles.settingsCard}`}>
                        <h3 className={styles.settingsTitle} style={{ paddingLeft: '1rem' }}>Account Settings</h3>

                        {/* ── Avatar editor ────────── */}
                        <div className={styles.avatarEditorWrap}>
                            <div
                                className={styles.avatarEditorCircle}
                                style={!editForm.avatarUrl ? { background: initialsStyle.bg } : {}}
                                onClick={() => avatarUploadRef.current?.click()}
                                title="Change profile picture"
                            >
                                {editForm.avatarUrl ? (
                                    <img src={editForm.avatarUrl} alt="Avatar" className={styles.avatarEditorImg} />
                                ) : (
                                    <span className={styles.avatarEditorInitials} style={{ color: initialsStyle.color }}>
                                        {(editForm.name || appUser?.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                                    </span>
                                )}
                                <div className={styles.avatarEditorOverlay}>
                                    {avatarUploading ? '…' : <Camera size={20} />}
                                </div>
                            </div>
                            <input
                                ref={avatarUploadRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={e => { if (e.target.files?.[0]) handleAvatarUpload(e.target.files[0]); }}
                            />
                            {editForm.avatarUrl && (
                                <button
                                    className={styles.avatarRemoveBtn}
                                    onClick={() => { setEditForm(prev => ({ ...prev, avatarUrl: '' })); updateProfile({ avatarUrl: '' }); }}
                                >
                                    Remove photo
                                </button>
                            )}
                        </div>

                        {/* ── Initials colour pickers (shown only when no photo) ── */}
                        {!editForm.avatarUrl && (
                            <div className={styles.initialsColorRow}>
                                <div className={styles.colorPickerGroup}>
                                    <label className={styles.settingsLabel}>Background</label>
                                    <input
                                        type="color"
                                        value={initialsStyle.bg}
                                        onChange={e => setInitialsStyle(prev => ({ ...prev, bg: e.target.value }))}
                                        className={styles.colorInput}
                                    />
                                </div>
                                <div className={styles.colorPickerGroup}>
                                    <label className={styles.settingsLabel}>Text</label>
                                    <input
                                        type="color"
                                        value={initialsStyle.color}
                                        onChange={e => setInitialsStyle(prev => ({ ...prev, color: e.target.value }))}
                                        className={styles.colorInput}
                                    />
                                </div>
                            </div>
                        )}

                        <div className={styles.settingsFields}>
                            <div>
                                <label className={styles.settingsLabel}>Username</label>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 0.6rem', background: '#f3f4f6', border: '1px solid #d1d5db', borderRight: 'none', borderRadius: '8px 0 0 8px', color: '#6b7280' }}>@</span>
                                    <input
                                        value={usernameInput}
                                        onChange={e => setUsernameInput(normalizeUsername(e.target.value))}
                                        placeholder="username"
                                        className="input-field"
                                        style={{ borderRadius: '0 8px 8px 0', flex: 1 }}
                                        maxLength={20}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        disabled={usernameStatus.kind !== 'available' || savingUsername}
                                        onClick={handleSaveUsername}
                                    >
                                        {savingUsername ? 'Saving…' : 'Save'}
                                    </button>
                                </div>
                                <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: 'var(--color-text-muted)' }}>
                                    {usernameStatus.kind === 'invalid' && <span style={{ color: '#b91c1c' }}>{usernameStatus.reason}</span>}
                                    {usernameStatus.kind === 'checking' && 'Checking availability…'}
                                    {usernameStatus.kind === 'available' && <span style={{ color: '#15803d' }}>✓ Available</span>}
                                    {usernameStatus.kind === 'taken' && <span style={{ color: '#b91c1c' }}>Already taken.</span>}
                                    {usernameStatus.kind === 'unchanged' && 'This is your current username.'}
                                    {usernameStatus.kind === 'idle' && 'Lowercase letters, numbers, periods, underscores. 3–20 characters.'}
                                </p>
                            </div>
                            <div>
                                <label className={styles.settingsLabel}>Display Name</label>
                                <input value={editForm.name} onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Name" className="input-field" />
                            </div>
                            <div>
                                <label className={styles.settingsLabel}>Phone Number</label>
                                <input value={editForm.phoneNumber} onChange={e => setEditForm(prev => ({ ...prev, phoneNumber: e.target.value }))} placeholder="Phone Number" className="input-field" />
                            </div>
                            <div>
                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={editForm.sharePhoneNumber}
                                        onChange={e => setEditForm(prev => ({ ...prev, sharePhoneNumber: e.target.checked }))}
                                    />
                                    <span>Share phone number with trip members</span>
                                </label>
                            </div>
                            <div>
                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={editForm.shareLocation}
                                        onChange={e => setEditForm(prev => ({ ...prev, shareLocation: e.target.checked }))}
                                    />
                                    <span>Share live location on trips</span>
                                </label>
                            </div>
                            <div>
                                <label className={styles.settingsLabel}>Email Address</label>
                                <input
                                    value={auth.currentUser?.email ?? ''}
                                    placeholder="Email"
                                    className="input-field"
                                    disabled
                                    readOnly
                                    title="Email cannot be changed. Contact support to change your email address."
                                    style={{ opacity: 0.6, cursor: 'not-allowed' }}
                                />
                                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                                    Email cannot be changed after registration.
                                </p>
                            </div>
                            <button className={`btn btn-primary ${styles.saveBtn}`} onClick={handleSaveProfile}>Save Changes</button>
                        </div>
                        <hr className={styles.divider} />
                        <div>
                            <h4 className={styles.sectionSubtitle}>Security</h4>
                            <button onClick={handlePasswordReset} className={`btn ${styles.securityBtn}`}>Send Password Reset Email</button>
                        </div>
                        <hr className={styles.divider} />
                        <div className={styles.dangerZone}>
                            <h3 className={styles.dangerZoneTitle}>Danger zone</h3>
                            <p className={styles.dangerZoneText}>
                                Permanently delete your account. Your profile, username, avatar, and contact details are removed. Trip data you contributed (photos, expenses) stays so other members can still see their history; your name will appear as "Unknown user".
                            </p>
                            <button
                                type="button"
                                className={styles.dangerBtn}
                                onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setDeleteError(''); }}
                            >
                                Delete my account
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete-account confirm modal ── */}
            {showDeleteModal && createPortal(
                <div className={styles.deleteModalBackdrop} onClick={() => !deleteInProgress && setShowDeleteModal(false)}>
                    <div className={styles.deleteModalCard} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.deleteModalTitle}>Delete account?</h2>
                        <p className={styles.deleteModalBody}>
                            This action cannot be undone. Your profile, avatar, username and contact details will be permanently removed. Type <strong>DELETE</strong> below to confirm.
                        </p>
                        <input
                            type="text"
                            className="input-field"
                            value={deleteConfirmText}
                            onChange={e => setDeleteConfirmText(e.target.value)}
                            placeholder="DELETE"
                            disabled={deleteInProgress}
                            autoFocus
                        />
                        {deleteError && <p className={styles.deleteModalError}>{deleteError}</p>}
                        <div className={styles.deleteModalActions}>
                            <button
                                type="button"
                                className="btn"
                                onClick={() => setShowDeleteModal(false)}
                                disabled={deleteInProgress}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={styles.dangerBtn}
                                onClick={handleDeleteAccount}
                                disabled={deleteConfirmText !== 'DELETE' || deleteInProgress}
                            >
                                {deleteInProgress ? 'Deleting…' : 'Delete forever'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ── Hamburger side drawer (with notifications sub-view) ── */}
            {showHamburger && createPortal(
                <div className={styles.drawerOverlay} onClick={() => { setShowHamburger(false); setShowNotifications(false); }}>
                    <div className={styles.drawer} onClick={e => e.stopPropagation()}>
                        {!showNotifications ? (
                            /* ── Main menu view ── */
                            <>
                                <div className={styles.drawerHeader}>
                                    <h3 className={styles.drawerTitle}>Menu</h3>
                                    <button className={styles.drawerCloseBtn} onClick={() => setShowHamburger(false)}><X size={20} /></button>
                                </div>
                                <div className={styles.drawerList}>
                                    <button className={styles.drawerItem} onClick={() => setShowNotifications(true)}>
                                        <Bell size={20} />
                                        Notifications
                                        {unreadCount > 0 && <span className={styles.drawerItemBadge}>{unreadCount}</span>}
                                    </button>
                                    <div className={styles.drawerDivider} />
                                    <button className={styles.drawerItem} onClick={() => { setMainTab('admin'); setShowHamburger(false); }}>
                                        <MapIcon size={20} /> My Trips
                                    </button>
                                    <button className={styles.drawerItem} onClick={() => { setMainTab('groups'); setShowHamburger(false); }}>
                                        <Users size={20} /> Groups
                                    </button>
                                    <button className={styles.drawerItem} onClick={() => { setMainTab('myActivities'); setShowHamburger(false); }}>
                                        <CheckSquare size={20} /> My Locations
                                    </button>
                                    <button className={styles.drawerItem} onClick={() => { setMainTab('network'); setShowHamburger(false); }}>
                                        <UserPlus size={20} /> Network
                                    </button>
                                    <button className={styles.drawerItem} onClick={() => { setMainTab('settings'); setShowHamburger(false); }}>
                                        <Settings size={20} /> Settings
                                    </button>
                                    
                                    <div className={styles.drawerDivider} />
                                    {appUser?.managedBusinessIds?.length ? (
                                        <button className={styles.drawerItem} onClick={() => { setMainTab('businessDashboard'); setShowHamburger(false); }}>
                                            <Building2 size={20} /> Business Partner HQ
                                        </button>
                                    ) : (
                                        <button className={styles.drawerItem} onClick={() => { setMainTab('businessDashboard'); setShowHamburger(false); }}>
                                            <Building2 size={20} /> Register as Business Partner
                                        </button>
                                    )}

                                    <div className={styles.drawerDivider} />
                                    <button className={`${styles.drawerItem} ${styles.drawerItemDanger}`} onClick={handleLogout}>
                                        <LogOut size={20} /> Log Out
                                    </button>
                                </div>
                            </>
                        ) : (
                            /* ── Notifications sub-view ── */
                            <>
                                <div className={styles.drawerHeader}>
                                    <button
                                        className={styles.drawerBackBtn}
                                        onClick={() => setShowNotifications(false)}
                                        title="Back to menu"
                                    >
                                        <ArrowLeft size={20} />
                                    </button>
                                    <h3 className={styles.drawerTitle}>Notifications</h3>
                                    <button className={styles.drawerCloseBtn} onClick={() => { setShowHamburger(false); setShowNotifications(false); }}><X size={20} /></button>
                                </div>
                                <div className={styles.drawerList}>
                                    {notifications.length === 0 && (
                                        <p className={styles.notifEmpty}>No notifications yet.</p>
                                    )}
                                    {notifications.map(n => (
                                        <div key={n.id} className={`${styles.notifItem} ${!n.read ? styles.notifItemUnread : ''}`}>
                                            {n.fromAvatarUrl
                                                ? <img src={n.fromAvatarUrl} className={styles.notifAvatar} alt={n.fromName} />
                                                : <div className={styles.notifAvatarPlaceholder}>{n.fromName.charAt(0).toUpperCase()}</div>
                                            }
                                            <div className={styles.notifMeta}>
                                                <span className={styles.notifText}><strong>{n.fromName}</strong> started following you</span>
                                                <span className={styles.notifTime}>{new Date(n.createdAt).toLocaleDateString()}</span>
                                            </div>
                                            {!((appUser?.following || []).includes(n.fromUid)) && (
                                                <button
                                                    className={styles.followBackBtn}
                                                    onClick={() => handleFollowBack(n.fromUid, n.id)}
                                                >
                                                    Follow back
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* Countries Globe — portalled to body so it covers full screen */}
            {showGlobe && createPortal(
                <CountriesGlobe
                    visitedCountries={allVisitedCountries}
                    bucketlistCountries={bucketlistCountries}
                    canEdit={isOwner}
                    onClose={() => setShowGlobe(false)}
                    onToggleVisited={handleToggleCountry}
                    onToggleBucketlist={handleToggleBucketlistCountry}
                    initialFocus={{ lat: 56, lng: 14 }}
                />,
                document.body
            )}

            {/* Create Trip Modal */}
            {showCreateTrip && createPortal(
                <div className={styles.createModal} onClick={() => setShowCreateTrip(false)}>
                    <div className={styles.createModalBody} onClick={e => e.stopPropagation()}>
                        {/* Title row — scrolls with content */}
                        <div className={styles.createModalTitleRow}>
                            <h2 className={styles.tripModalTitle}>Create New Trip</h2>
                            <button onClick={() => setShowCreateTrip(false)} className={styles.tripModalCloseBtn} title="Close">
                                <X size={24} />
                            </button>
                        </div>

                        <div className={styles.fieldsStack}>
                            {/* Cover Photo */}
                            <div>
                                <label className={styles.settingsLabel}>Cover Photo</label>
                                <div className={styles.coverUploadArea}>
                                    {createTripCoverPreview ? (
                                        <img src={createTripCoverPreview} alt="Trip cover" className={styles.coverPreview} />
                                    ) : (
                                        <div className={styles.coverPlaceholder}>
                                            <Camera size={28} color="var(--color-text-muted)" />
                                            <span>Add a cover photo</span>
                                        </div>
                                    )}
                                    <label className={styles.coverUploadBtn}>
                                        <Camera size={14} /> {createTripCoverPreview ? 'Change' : 'Upload Photo'}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                createTripCoverRef.current = file;
                                                setCreateTripCoverPreview(URL.createObjectURL(file));
                                            }}
                                        />
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className={styles.settingsLabel}>Trip Name *</label>
                                <input
                                    className="input-field"
                                    placeholder="E.g. Milano 2026"
                                    value={createTripForm.name}
                                    onChange={e => setCreateTripForm(prev => ({ ...prev, name: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className={styles.settingsLabel}>Destination</label>
                                <input
                                    className="input-field"
                                    placeholder="E.g. Milano, Italy"
                                    value={createTripForm.destination}
                                    onChange={e => setCreateTripForm(prev => ({ ...prev, destination: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className={styles.settingsLabel}>Trip Type</label>
                                <CustomSelect
                                    className="input-field"
                                    value={createTripForm.type}
                                    onChange={type => setCreateTripForm(prev => ({ ...prev, type }))}
                                    options={[
                                        { value: 'Default Trip', label: 'Default Trip' },
                                        { value: 'Bachelor Party', label: 'Bachelor Party' },
                                        { value: 'Ski Trip', label: 'Ski Trip' },
                                        { value: 'City Break', label: 'City Break' },
                                        { value: 'Wedding', label: 'Wedding' },
                                        { value: 'Cykelfest', label: 'Cykelfest (Bike Party)' },
                                        { value: 'Conference', label: 'Conference' },
                                        { value: 'Company Retreat', label: 'Company Retreat' },
                                        { value: 'Business Event', label: 'Business Event' }
                                    ]}
                                />
                            </div>

                            <div className={styles.currencySelectorContainer}>
                                <label className={styles.settingsLabel}>Base Currency</label>
                                <CustomSelect
                                    className="input-field"
                                    value={createTripForm.baseCurrency}
                                    onChange={baseCurrency => setCreateTripForm(prev => ({ ...prev, baseCurrency }))}
                                    options={SUPPORTED_CURRENCIES.map(c => ({
                                        value: c.code,
                                        label: c.code,
                                        subLabel: c.name
                                    }))}
                                />
                            </div>

                            <div className={styles.dateRow}>
                                <div className={styles.dateCol}>
                                    <label className={styles.settingsLabel}>Start Date</label>
                                    <input
                                        className="input-field"
                                        type="date"
                                        title="Start Date"
                                        value={createTripForm.startDate}
                                        onChange={e => setCreateTripForm(prev => ({ ...prev, startDate: e.target.value }))}
                                    />
                                </div>
                                <div className={styles.dateCol}>
                                    <label className={styles.settingsLabel}>End Date</label>
                                    <input
                                        className="input-field"
                                        type="date"
                                        title="End Date"
                                        value={createTripForm.endDate}
                                        onChange={e => setCreateTripForm(prev => ({ ...prev, endDate: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={styles.settingsLabel}>Accommodation</label>
                                <ModernPlaceAutocomplete
                                    defaultValue={createTripForm.accommodation}
                                    placeholder="Hotel / Airbnb name or address"
                                    className="input-field"
                                    onPlaceSelected={(place) => {
                                        setCreateTripForm(prev => ({
                                            ...prev,
                                            accommodation: place.name,
                                            accommodationAddress: place.formatted_address,
                                            accommodationLocation: place.location
                                        }));
                                    }}
                                    onInputChange={(val) => {
                                        setCreateTripForm(prev => ({
                                            ...prev,
                                            accommodation: val,
                                            accommodationAddress: '',
                                            accommodationLocation: null
                                        }));
                                    }}
                                />
                            </div>
                            <div>
                                <label className={styles.settingsLabel}>Active Games</label>
                                <div className={styles.gameToggles}>
                                    {['bingo', 'cheers', 'most-likely', 'odds'].map(gameId => {
                                        const active = createTripForm.activeGames.includes(gameId);
                                        return (
                                            <button
                                                type="button"
                                                key={gameId}
                                                onClick={() => {
                                                    setCreateTripForm(prev => {
                                                        const arr = prev.activeGames.includes(gameId)
                                                            ? prev.activeGames.filter(g => g !== gameId)
                                                            : [...prev.activeGames, gameId];
                                                        const newDefault = arr.includes(prev.defaultGame) ? prev.defaultGame : (arr[0] || 'bingo');
                                                        return { ...prev, activeGames: arr, defaultGame: newDefault };
                                                    });
                                                }}
                                                className={`${styles.gameToggleBtn} ${active ? styles.gameToggleBtnActive : ''}`}
                                            >
                                                {active && <CheckSquare size={14} />}
                                                {gameId.charAt(0).toUpperCase() + gameId.slice(1).replace('-', ' ')}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <label className={styles.settingsLabel}>Default Game</label>
                                <CustomSelect
                                    className="input-field"
                                    value={createTripForm.defaultGame}
                                    onChange={defaultGame => setCreateTripForm(prev => ({ ...prev, defaultGame }))}
                                    options={createTripForm.activeGames.map(g => ({
                                        value: g,
                                        label: g.charAt(0).toUpperCase() + g.slice(1).replace('-', ' ')
                                    }))}
                                />
                            </div>

                            {/* Create Trip button — inside the scroll, at the bottom of the form */}
                            <button
                                className={`btn btn-primary ${styles.goTripBtn}`}
                                disabled={creatingTrip || !createTripForm.name.trim()}
                                onClick={async () => {
                                    setCreatingTrip(true);
                                    try {
                                        const newTripId = await createTrip({
                                            name: createTripForm.name.trim(),
                                            destination: createTripForm.destination.trim(),
                                            type: createTripForm.type,
                                            startDate: createTripForm.startDate || '',
                                            endDate: createTripForm.endDate || '',
                                            accommodation: createTripForm.accommodation.trim() || '',
                                            accommodationAddress: createTripForm.accommodationAddress || '',
                                            accommodationLocation: createTripForm.accommodationLocation || null,
                                            activeGames: createTripForm.activeGames,
                                            defaultGame: createTripForm.defaultGame,
                                            baseCurrency: createTripForm.baseCurrency,
                                        });
                                        // Upload cover photo if chosen
                                        if (createTripCoverRef.current) {
                                            const file = createTripCoverRef.current;
                                            const ext = file.name.split('.').pop() || 'jpg';
                                            const path = `trips/${newTripId}/cover.${ext}`;
                                            const storageRef = ref(storage, path);
                                            const task = await uploadBytesResumable(storageRef, file);
                                            const imageUrl = await getDownloadURL(task.ref);
                                            await updateTrip(newTripId, { imageUrl });
                                            createTripCoverRef.current = null;
                                        }
                                        setShowCreateTrip(false);
                                        setCreateTripForm({ name: '', destination: '', type: 'Default Trip', startDate: '', endDate: '', accommodation: '', accommodationAddress: '', accommodationLocation: null, activeGames: ['bingo', 'cheers'], defaultGame: 'bingo', baseCurrency: 'SEK' });
                                        setCreateTripCoverPreview('');
                                        navigate('/');
                                    } catch (err: unknown) {
                                        console.error('Failed to create trip:', err);
                                        alert('Failed to create trip: ' + ((err as Error).message || 'Unknown error'));
                                    } finally {
                                        setCreatingTrip(false);
                                    }
                                }}
                            >
                                {creatingTrip ? 'Creating...' : 'Create Trip'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Join Trip Modal */}

            {showJoinTrip && createPortal(
                <div className={`modal-backdrop ${adminStyles.modalBackdrop}`} onClick={() => { setShowJoinTrip(false); setJoinTripCode(''); }}>
                    <div className={`card animate-fade-in ${adminStyles.modalCard}`} onClick={e => e.stopPropagation()}>
                        <div className={adminStyles.modalHeader}>
                            <h2 className={adminStyles.modalTitle}>Join Trip</h2>
                            <button onClick={() => { setShowJoinTrip(false); setJoinTripCode(''); }} className={adminStyles.modalCloseBtn} title="Close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className={adminStyles.modalForm}>
                            <label className={adminStyles.modalFieldLabel}>Trip Code</label>
                            <input
                                className="input-field"
                                placeholder="Enter trip code"
                                value={joinTripCode}
                                onChange={e => setJoinTripCode(e.target.value)}
                            />

                            <button
                                className="btn btn-primary"
                                style={{ marginTop: '1rem', width: '100%', padding: '0.8rem' }}
                                disabled={joiningTrip || !joinTripCode.trim()}
                                onClick={async () => {
                                    setJoiningTrip(true);
                                    try {
                                        const success = await joinTrip(joinTripCode.trim());
                                        if (success) {
                                            setShowJoinTrip(false);
                                            setJoinTripCode('');
                                            navigate('/');
                                        } else {
                                            alert('Invalid trip code or trip not found.');
                                        }
                                    } catch (err: unknown) {
                                        console.error('Failed to join trip', err);
                                        alert('Failed to join trip: ' + ((err as Error).message || 'Unknown error'));
                                    } finally {
                                        setJoiningTrip(false);
                                    }
                                }}
                            >
                                {joiningTrip ? 'Joining...' : 'Join Trip'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Trip Details Modal — rendered via portal so it sits above the Layout's bottom nav */}
            {viewTripDetails && createPortal(
                <div className={styles.tripModal} onClick={() => setViewTripDetails(null)}>
                    <div className={styles.tripDetailScroll} onClick={e => e.stopPropagation()}>

                        {/* Title row — always visible at top */}
                        <div className={styles.tripDetailTitleRow}>
                            <h2 className={styles.tripModalTitle}>{viewTripDetails.name}</h2>
                            <div className={styles.tripDetailTitleActions}>
                                {/* Trip gallery button */}
                                <button
                                    onClick={() => setTripGalleryOpen(true)}
                                    className={styles.tripGalleryBtn}
                                    title="Trip Photos"
                                >
                                    <Images size={18} />
                                </button>
                                <button onClick={() => setViewTripDetails(null)} className={styles.tripModalCloseBtn} title="Close">
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        {/* Category filter chips */}
                        <div className={styles.categoryScroll}>
                            {['All', 'Restaurant', 'Cafe', 'Bar', 'Museum', 'Activity', 'Other'].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setModalCategory(cat)}
                                    className={`${styles.categoryBtn} ${modalCategory === cat ? styles.categoryBtnActive : ''}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        {/* Horizontal swipe carousel */}
                        {isLoadingModal ? (
                            <div className={styles.loadingModal}>Loading activities...</div>
                        ) : (() => {
                            const filtered = modalActivities.filter(a => modalCategory === 'All' || a.category === modalCategory);
                            if (filtered.length === 0) {
                                return (
                                    <div className={styles.activityEmpty}>
                                        <p>No activities for {modalCategory.toLowerCase()} yet.</p>
                                    </div>
                                );
                            }
                            return (
                                <>
                                    <div
                                        className={styles.activityCarousel}
                                        ref={carouselRef}
                                        onScroll={handleCarouselScroll}
                                    >
                                        {filtered.map(activity => (
                                            <ActivitySlide
                                                key={activity.id}
                                                activity={activity}
                                                viewTripId={viewTripDetails.id}
                                                onPhotosPill={() => activity.id && setActivityGallery({
                                                    tripId: viewTripDetails.id,
                                                    activityId: activity.id,
                                                    activityName: activity.locationName || activity.title,
                                                })}
                                            />
                                        ))}
                                    </div>

                                    {/* Dot indicators */}
                                    {filtered.length > 1 && (
                                        <div className={styles.carouselDots}>
                                            {filtered.map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={i === activeSlide ? styles.carouselDotActive : styles.carouselDot}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </>
                            );
                        })()}

                    </div>
                </div>,
                document.body
            )}
            {/* ── Activity Gallery Modal ────────────── */}
            {activityGallery && createPortal(
                <div className={styles.galleryModal} onClick={() => setActivityGallery(null)}>
                    <div className={styles.galleryModalInner} onClick={e => e.stopPropagation()}>
                        <div className={styles.galleryModalHeader}>
                            <div>
                                <p className={styles.galleryModalSub}>Activity Photos</p>
                                <h2 className={styles.galleryModalTitle}>{activityGallery.activityName}</h2>
                            </div>
                            <button onClick={() => setActivityGallery(null)} className={styles.tripModalCloseBtn}><X size={24} /></button>
                        </div>
                        <div className={styles.galleryModalGrid}>
                            {isLoadingActivityGallery ? (
                                <p className={styles.galleryModalEmpty}>Loading photos...</p>
                            ) : activityGalleryImages.length === 0 ? (
                                <p className={styles.galleryModalEmpty}>No photos tagged to this activity yet.</p>
                            ) : (
                                activityGalleryImages.map(img => (
                                    <div key={img.id} className={styles.galleryModalThumb}>
                                        <img src={img.url} alt={img.activityName || 'Photo'} />
                                        {img.uploadedByName && (
                                            <span className={styles.galleryThumbAuthor}>{img.uploadedByName.split(' ')[0]}</span>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ── Trip Gallery Modal ───────────────── */}
            {tripGalleryOpen && viewTripDetails && createPortal(
                <div className={styles.galleryModal} onClick={() => setTripGalleryOpen(false)}>
                    <div className={styles.galleryModalInner} onClick={e => e.stopPropagation()}>
                        <div className={styles.galleryModalHeader}>
                            <div>
                                <p className={styles.galleryModalSub}>Trip Photos</p>
                                <h2 className={styles.galleryModalTitle}>{viewTripDetails.name}</h2>
                            </div>
                            <button onClick={() => setTripGalleryOpen(false)} className={styles.tripModalCloseBtn}><X size={24} /></button>
                        </div>
                        <div className={styles.galleryModalGrid}>
                            {isLoadingTripGallery ? (
                                <p className={styles.galleryModalEmpty}>Loading photos...</p>
                            ) : tripGalleryImages.length === 0 ? (
                                <p className={styles.galleryModalEmpty}>No photos uploaded to this trip yet.</p>
                            ) : (
                                tripGalleryImages.map(img => (
                                    <div key={img.id} className={styles.galleryModalThumb}>
                                        <img src={img.url} alt={img.activityName || 'Photo'} />
                                        {img.activityName && (
                                            <span className={styles.galleryThumbTag}>{img.activityName}</span>
                                        )}
                                        {img.uploadedByName && (
                                            <span className={styles.galleryThumbAuthor}>{img.uploadedByName.split(' ')[0]}</span>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
