import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTrip, type Trip, type TripDestination } from '../context/TripContext';
import { ArrowLeft, Plus, Edit2, Trash2, Calendar as CalendarIcon, Users, Settings, Share2, CheckSquare, Ghost, X, Camera, Info, CheckCircle2, AlertCircle, MapPin, Phone, BellOff, Tag, Trophy, LogOut, Copy } from 'lucide-react';
import { getMemberPrefs, updateMemberPrefs, type MemberPrefs, DEFAULT_MEMBER_PREFS } from '../services/memberPrefs';
import { SUPPORTED_CURRENCIES } from '../utils/currencies';
import { getAllActivities, type Activity, deleteActivity } from '../services/activities';
import { getBingoBoard, initBingoBoard, saveBingoBoard, type BingoSquare } from '../services/bingo';
import { useAuth, type AppUser } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import { collection, getDocs, doc, updateDoc, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../services/firebase';
import { CustomSelect } from '../components/CustomSelect';
import { getDefaultCover } from '../utils/defaultCovers';
import styles from './TripAdmin.module.css';

/** Thin router wrapper — resolves trip from URL params, then delegates to TripAdminInner */
export const TripAdmin: React.FC = () => {
    const { tripId } = useParams<{ tripId: string }>();
    const { userTrips } = useTrip();
    const trip = userTrips.find(t => t.id === tripId);

    // Show a spinner while trips are loading
    if (!trip) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <p style={{ color: 'var(--color-text-muted)' }}>Loading trip…</p>
            </div>
        );
    }
    return <TripAdminInner trip={trip} />;
};

/** Inner component — all hooks live here, trip is guaranteed non-null */
const TripAdminInner: React.FC<{ trip: Trip }> = ({ trip }) => {
    const navigate = useNavigate();
    const { updateTrip } = useTrip();
    const { currentUser } = useAuth();
    
    // Check permission logic
    const isAdmin = trip.adminIds?.includes(currentUser?.uid || '') ?? false;
    const canManageActivities = isAdmin || trip.allowMemberActivities;

    const [activities, setActivities] = useState<Activity[]>([]);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);

    const [userToKick, setUserToKick] = useState<string | null>(null);
    const [destinationToRemove, setDestinationToRemove] = useState<TripDestination | null>(null);
    const [localMembers, setLocalMembers] = useState<string[]>(trip.members || []);
    const [localAdminIds, setLocalAdminIds] = useState<string[]>(trip.adminIds || []);
    const [localInviteClosed, setLocalInviteClosed] = useState<boolean>(trip.inviteClosed || false);

    const [tripForm, setTripForm] = useState({
        name: trip.name || '',
        destination: trip.destination || '',
        accommodation: trip.accommodation || '',
        startDate: trip.startDate || '',
        endDate: trip.endDate || '',
        type: trip.type || 'Default Trip',
        activeGames: trip.activeGames || ['bingo', 'cheers'],
        defaultGame: trip.defaultGame || 'bingo',
        bingoReward: trip.bingoReward || '🍻 for all!',
        allowMemberActivities: trip.allowMemberActivities || false,
        destinations: trip.destinations || [],
        imageUrl: trip.imageUrl || '',
        baseCurrency: trip.baseCurrency || 'SEK',
    });
    const [showCurrencyInfo, setShowCurrencyInfo] = useState(false);
    const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 2800);
        return () => clearTimeout(t);
    }, [toast]);
    const [, setCoverFile] = useState<File | null>(null);
    
    // Bingo Editing State
    const [bingoSquares, setBingoSquares] = useState<BingoSquare[]>([]);
    const [showEditBingoModal, setShowEditBingoModal] = useState(false);
    const [savingBingo, setSavingBingo] = useState(false);
    const [coverPreview, setCoverPreview] = useState(trip.imageUrl || '');
    const [imageUploading, setImageUploading] = useState(false);
    const coverFileRef = useRef<File | null>(null);
    
    const handledAddDestination = () => {
        const newDest: TripDestination = {
            id: crypto.randomUUID(),
            destination: '',
            accommodation: '',
            startDate: '',
            endDate: ''
        };
        setTripForm(prev => ({
            ...prev,
            destinations: [...prev.destinations, newDest]
        }));
    };
    
    const [savingTrip, setSavingTrip] = useState(false);

    useEffect(() => {
        const fetchBingo = async () => {
            if (tripForm.activeGames.includes('bingo') && trip.id) {
                const board = await getBingoBoard(trip.id);
                if (board) {
                    setBingoSquares(board.squares);
                } else {
                    // Board doesn't exist yet, we initialize it to 30 squares
                    const newBoard = await initBingoBoard(trip.id);
                    setBingoSquares(newBoard.squares);
                }
            }
        };
        fetchBingo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trip.id, tripForm.activeGames.includes('bingo')]);

    useEffect(() => {
        setLocalMembers(trip.members || []);
    }, [trip.members]);

    useEffect(() => {
        setLocalAdminIds(trip.adminIds || []);
    }, [trip.adminIds]);

    useEffect(() => {
        setLocalInviteClosed(trip.inviteClosed || false);
    }, [trip.inviteClosed]);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const acts = await getAllActivities(trip.id);
                setActivities(acts);
                const usersSnapshot = await getDocs(collection(db, 'users'));
                setUsers(usersSnapshot.docs.map(d => ({ ...d.data(), uid: d.id } as AppUser)));
            } catch (e) {
                console.error('Failed to load admin data', e);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [trip.id]);

    const handleSaveTripDetails = async () => {
        setSavingTrip(true);
        try {
            let finalImageUrl = tripForm.imageUrl;
            if (coverFileRef.current) {
                const file = coverFileRef.current;
                const ext = file.name.split('.').pop() || 'jpg';
                const path = `trips/${trip.id}/cover.${ext}`;
                const storageRef = ref(storage, path);
                setImageUploading(true);
                const task = await uploadBytesResumable(storageRef, file);
                finalImageUrl = await getDownloadURL(task.ref);
                setImageUploading(false);
                coverFileRef.current = null;
            }
            await updateTrip(trip.id, { 
                ...tripForm, 
                imageUrl: finalImageUrl,
                allowMemberActivities: tripForm.allowMemberActivities
            });
            setToast({ kind: 'success', message: 'Inställningar sparade' });
        } catch (e) {
            console.error('Failed to update trip', e);
            setToast({ kind: 'error', message: 'Kunde inte spara. Försök igen.' });
        } finally {
            setSavingTrip(false);
        }
    };

    const handleShare = () => {
        const text = `Join my trip on TripMates! Download the app and enter code: ${trip.id}`;
        if (navigator.share) {
            navigator.share({ title: 'Join Trip', text }).catch(console.error);
        } else {
            navigator.clipboard.writeText(text);
            alert('Invite link copied to clipboard!');
        }
    };

    const toggleGame = (gameId: string) => {
        setTripForm(prev => {
            const arr = prev.activeGames.includes(gameId)
                ? prev.activeGames.filter(g => g !== gameId)
                : [...prev.activeGames, gameId];
            return { ...prev, activeGames: arr };
        });
    };

    const handleDeleteActivity = async (actId: string) => {
        if (!window.confirm('Delete this activity?')) return;
        try {
            await deleteActivity(actId);
            setActivities(prev => prev.filter(a => a.id !== actId));
        } catch (e) {
            console.error('Fail', e);
        }
    };

    return (
        <div className={`animate-fade-in ${styles.page}`}>
            <div className={styles.pageHeader}>
                <button onClick={() => navigate(-1)} className={styles.backBtn} title="Go back">
                    <ArrowLeft size={20} color="var(--color-primary-dark)" />
                </button>
                <h2 className={styles.pageTitle}>{isAdmin ? 'Administer Trip' : 'Trip Activities'}</h2>
            </div>

            <div className={styles.sections}>

                {/* ── Member view: shown to non-admin members ── */}
                {!isAdmin && <MemberView trip={trip} users={users} />}

                {/* ── Admin Only Sections ── */}
                {isAdmin && (
                    <>
                        {/* Trip Settings */}
                        <div className={`glass-panel ${styles.panel}`}>
                            <div className={styles.sectionHeader}>
                                <h3 className={styles.sectionTitle}><Settings size={18} /> Trip Settings</h3>
                            </div>
                    <div className={styles.fieldsStack}>
                        {/* Cover Photo */}
                        <div>
                            <label className={styles.fieldLabel}>Cover Photo</label>
                            <div className={styles.coverUploadArea}>
                                {coverPreview ? (
                                    <img src={coverPreview} alt="Trip cover" className={styles.coverPreview} />
                                ) : (
                                    <div className={styles.coverPlaceholder}>
                                        <Camera size={28} color="var(--color-text-muted)" />
                                        <span>Add a cover photo</span>
                                    </div>
                                )}
                                <label className={styles.coverUploadBtn} title="Upload cover photo">
                                    {imageUploading ? 'Uploading…' : <><Camera size={14} /> {coverPreview ? 'Change Photo' : 'Upload Photo'}</>}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            coverFileRef.current = file;
                                            setCoverFile(file);
                                            setCoverPreview(URL.createObjectURL(file));
                                        }}
                                    />
                                </label>
                            </div>
                        </div>
                        <div>
                            <label className={styles.fieldLabel}>Trip Name</label>
                            <input className="input-field" title="Trip Name" placeholder="Trip Name" value={tripForm.name} onChange={e => setTripForm({ ...tripForm, name: e.target.value })} />
                        </div>
                        <div className={styles.dateRow}>
                            <div className={styles.dateCol}>
                                <label className={styles.fieldLabel}>Start Date</label>
                                <input className="input-field" type="date" title="Start Date" value={tripForm.startDate} onChange={e => setTripForm({ ...tripForm, startDate: e.target.value })} />
                            </div>
                            <div className={styles.dateCol}>
                                <label className={styles.fieldLabel}>End Date</label>
                                <input className="input-field" type="date" title="End Date" value={tripForm.endDate} onChange={e => setTripForm({ ...tripForm, endDate: e.target.value })} />
                            </div>
                        </div>
                        <div>
                            <label className={styles.fieldLabel}>Theme / Type</label>
                            <CustomSelect
                                className="input-field"
                                value={tripForm.type}
                                onChange={type => setTripForm({ ...tripForm, type })}
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
                        <div>
                            <label className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span>Even-valuta</span>
                                <button
                                    type="button"
                                    onClick={() => setShowCurrencyInfo(true)}
                                    aria-label="Mer info om valutaomräkning"
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        cursor: 'pointer',
                                        color: 'var(--color-text-muted)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                    }}
                                >
                                    <Info size={16} />
                                </button>
                            </label>
                            <CustomSelect
                                className="input-field"
                                value={tripForm.baseCurrency}
                                onChange={baseCurrency => setTripForm({ ...tripForm, baseCurrency })}
                                options={SUPPORTED_CURRENCIES.map(c => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
                            />
                        </div>
                        <div>
                            <label className={styles.fieldLabel}>Destination</label>
                            <input placeholder="E.g. Milano, Italy" className="input-field" title="Destination" value={tripForm.destination} onChange={e => setTripForm({ ...tripForm, destination: e.target.value })} />
                        </div>
                        <div>
                            <label className={styles.fieldLabel}>Accommodation</label>
                            <input placeholder="Hotel / Airbnb name or address" className="input-field" title="Accommodation" value={tripForm.accommodation} onChange={e => setTripForm({ ...tripForm, accommodation: e.target.value })} />
                        </div>
                        <label className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer', margin: '0.5rem 0' }}>
                            <input
                                type="checkbox"
                                checked={tripForm.allowMemberActivities}
                                onChange={e => setTripForm({ ...tripForm, allowMemberActivities: e.target.checked })}
                            />
                            Allow members to add activities
                        </label>

                        {tripForm.destinations.map((dest, idx) => (
                            <div key={dest.id} className={styles.destinationCard}>
                                <div className={styles.destinationHeader}>
                                    <h4 className={styles.destinationTitle}>Destination {idx + 2}</h4>
                                    <button 
                                        className={styles.removeDestinationBtn} 
                                        onClick={() => setDestinationToRemove(dest)}
                                        title="Remove Stop"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                <div className={styles.destinationInputGroup}>
                                    <label className={styles.fieldLabel}>Destination</label>
                                    <input 
                                        placeholder="E.g. Rome, Italy" 
                                        className="input-field" 
                                        title={`Destination ${idx + 2}`}
                                        value={dest.destination} 
                                        onChange={e => {
                                            const newArray = [...tripForm.destinations];
                                            newArray[idx].destination = e.target.value;
                                            setTripForm({ ...tripForm, destinations: newArray });
                                        }} 
                                    />
                                </div>
                                <div className={`${styles.dateRow} ${styles.destinationInputGroup}`}>
                                    <div className={styles.dateCol}>
                                        <label className={styles.fieldLabel}>Start Date</label>
                                        <input 
                                            className="input-field" 
                                            type="date" 
                                            title="Start Date" 
                                            value={dest.startDate} 
                                            onChange={e => {
                                                const newArray = [...tripForm.destinations];
                                                newArray[idx].startDate = e.target.value;
                                                setTripForm({ ...tripForm, destinations: newArray });
                                            }} 
                                        />
                                    </div>
                                    <div className={styles.dateCol}>
                                        <label className={styles.fieldLabel}>End Date</label>
                                        <input 
                                            className="input-field" 
                                            type="date" 
                                            title="End Date" 
                                            value={dest.endDate} 
                                            onChange={e => {
                                                const newArray = [...tripForm.destinations];
                                                newArray[idx].endDate = e.target.value;
                                                setTripForm({ ...tripForm, destinations: newArray });
                                            }} 
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className={styles.fieldLabel}>Accommodation</label>
                                    <input 
                                        placeholder="Hotel / Airbnb" 
                                        className="input-field" 
                                        title={`Accommodation ${idx + 2}`} 
                                        value={dest.accommodation} 
                                        onChange={e => {
                                            const newArray = [...tripForm.destinations];
                                            newArray[idx].accommodation = e.target.value;
                                            setTripForm({ ...tripForm, destinations: newArray });
                                        }} 
                                    />
                                </div>
                            </div>
                        ))}

                        <button className={styles.addDestinationBtn} onClick={handledAddDestination}>
                            <Plus size={18} /> Add another stop
                        </button>

                        <button
                            className={`btn btn-primary ${styles.saveBtn}`}
                            onClick={handleSaveTripDetails}
                            disabled={savingTrip}
                        >
                            {savingTrip ? 'Sparar…' : 'Spara ändringar'}
                        </button>
                    </div>
                </div>
                    </>
                )}

                {/* ── Activities Section (For Admins + Allowed Members) ── */}
                {canManageActivities && (
                    <div className={`glass-panel ${styles.panel}`}>
                        <div className={styles.sectionHeader}>
                            <h3 className={styles.sectionTitle}><CalendarIcon size={18} /> Trip Activities</h3>
                            <button className={`btn btn-primary ${styles.importBtn}`} onClick={() => navigate(`/admin/${trip.id}/activity/new`)}>
                                <Plus size={16} /> Add Activity
                            </button>
                        </div>             

                    {loading ? (
                        <p className={styles.activitiesLoading}>Loading activities...</p>
                    ) : activities.length === 0 ? (
                        <p className={styles.activitiesEmpty}>No activities added yet.</p>
                    ) : (
                        <div className={styles.activityList}>
                            {activities.sort((a, b) => {
                                const A = new Date(`${a.day}T${a.time}`).getTime();
                                const B = new Date(`${b.day}T${b.time}`).getTime();
                                return A - B;
                            }).map(act => (
                                <div key={act.id} className={styles.activityItem}>
                                    <div className={styles.activityIconBox}>
                                        <img
                                            src={act.imageUrl || getDefaultCover(act.category, act.locationName || act.title)}
                                            alt={act.title}
                                            className={styles.activityCoverThumb}
                                        />
                                    </div>
                                    <div className={styles.activityBody}>
                                        <div className={styles.activityTitleRow}>
                                            <h4 className={styles.activityName}>{act.title}</h4>
                                            <div className={styles.activityActions}>
                                                <button
                                                    onClick={() => navigate(`/admin/${trip.id}/activity/${act.id}`, { state: { activity: act } })}
                                                    className={styles.editBtn}
                                                    title="Edit activity"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => act.id && handleDeleteActivity(act.id)}
                                                    className={styles.deleteBtn}
                                                    title="Delete activity"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <p className={styles.activityMeta}>{act.day} • {act.time}{act.endTime ? ` - ${act.endTime}` : ''}</p>
                                        {act.category && <span className={styles.categoryBadge}>{act.category}</span>}
                                        <p className={styles.activityLocation}>{act.locationName}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                )}

                {/* ── Return to Admin Only Sections ── */}
                {isAdmin && (
                    <>
                        {/* Members */}
                        <div className={`glass-panel ${styles.panel}`}>
                    <h3 className={styles.sectionTitleDark}><Users size={18} /> Members ({localMembers.length})</h3>
                    <div className={styles.codeRow}>
                        <div className={styles.codeLabel}>Code: <span className={styles.codeValue}>{trip.id}</span></div>
                        <button onClick={handleShare} className={`btn ${styles.inviteBtn}`} disabled={localInviteClosed}>
                            <Share2 size={14} /> Invite
                        </button>
                    </div>
                    {currentUser?.uid === trip.createdBy && (
                        <label className={styles.closeInviteToggle}>
                            <input 
                                type="checkbox" 
                                checked={localInviteClosed}
                                onChange={(e) => {
                                    setLocalInviteClosed(e.target.checked);
                                    updateTrip(trip.id, { inviteClosed: e.target.checked });
                                }}
                            />
                            <span>Lock invites (disable code/link)</span>
                        </label>
                    )}
                    <div className={styles.membersList}>
                        {localMembers.map((uid: string) => {
                            const isMock = uid.startsWith('mock_');
                            const mockName = isMock ? uid.replace('mock_', '') : null;
                            const u = users.find(user => user.uid === uid);
                            const displayName = u?.name || mockName || `Member (${uid.substring(0, 4)})`;
                            const isHeadAdmin = currentUser?.uid === trip.createdBy;
                            const isCreator = uid === trip.createdBy;

                            return (
                                <div key={uid} className={styles.memberRow}>
                                    <div className={styles.memberRowLeft}>
                                        {u?.avatarUrl
                                            ? <img src={u.avatarUrl} alt={displayName} className={styles.memberAvatar} />
                                            : <div className={styles.memberAvatarPlaceholder}><Users size={14} color="#9ca3af" /></div>
                                        }
                                        <div className={styles.memberNameBox}>
                                            <div className={styles.memberName}>{displayName}</div>
                                            {isCreator ? (
                                                <span className={styles.adminBadge}>Admin</span>
                                            ) : localAdminIds.includes(uid) ? (
                                                <span className={styles.adminBadge}>Submanager</span>
                                            ) : null}
                                        </div>
                                    </div>
                                    
                                    {isHeadAdmin && !isCreator && (
                                        <div className={styles.memberActions}>
                                            <label className={styles.memberAdminCheckbox}>
                                                <input 
                                                    type="checkbox"
                                                    checked={localAdminIds.includes(uid)}
                                                    onChange={(e) => {
                                                        const isChecked = e.target.checked;
                                                        const newAdmins = isChecked 
                                                            ? [...localAdminIds, uid]
                                                            : localAdminIds.filter(id => id !== uid);
                                                        setLocalAdminIds(newAdmins);
                                                        updateTrip(trip.id, { adminIds: newAdmins });
                                                    }}
                                                />
                                                <span>Admin</span>
                                            </label>
                                            <button 
                                                className={styles.kickButton} 
                                                onClick={() => setUserToKick(uid)}
                                                title="Kick Member"
                                            >
                                                <Trash2 size={16} color="#ef4444" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Trip Games */}
                <div className={`glass-panel ${styles.panel}`}>
                    <h3 className={styles.gameSectionTitle}><Ghost size={18} /> Game Settings</h3>
                    <div>
                        <label className={styles.activeGamesLabel}>Active Games</label>
                        <div className={styles.activeGamesBtns}>
                            {['bingo', 'cheers', 'most-likely', 'odds'].map(gameId => {
                                const active = tripForm.activeGames.includes(gameId);
                                return (
                                    <button
                                        key={gameId}
                                        onClick={() => toggleGame(gameId)}
                                        className={`${styles.gameToggleBtn} ${active ? styles.gameToggleBtnActive : styles.gameToggleBtnInactive}`}
                                    >
                                        {active && <CheckSquare size={14} />}
                                        {gameId.charAt(0).toUpperCase() + gameId.slice(1).replace('-', ' ')}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className={styles.defaultGameRow}>
                        <h2 className={styles.defaultGameTitle}>Trip<br />Games</h2>
                        <CustomSelect
                            className={styles.defaultGameSelect}
                            value={tripForm.defaultGame}
                            onChange={defaultGame => setTripForm({ ...tripForm, defaultGame })}
                            options={tripForm.activeGames.map((g: string) => ({
                                value: g,
                                label: g.charAt(0).toUpperCase() + g.slice(1).replace('-', ' ')
                            }))}
                        />
                    </div>
                    
                    {tripForm.activeGames.includes('bingo') && (
                        <div style={{ marginTop: '1rem' }}>
                            <label className={styles.fieldLabel}>Bingo "3 in a row" Reward</label>
                            <input 
                                className="input-field" 
                                value={tripForm.bingoReward}
                                onChange={e => setTripForm({ ...tripForm, bingoReward: e.target.value })}
                                placeholder="e.g. 🍻 for all!"
                            />
                            
                            <button 
                                className="btn"
                                style={{ 
                                    width: '100%', 
                                    marginTop: '0.75rem', 
                                    padding: '0.6rem',
                                    border: '1px solid var(--color-border)', 
                                    background: 'var(--color-surface)',
                                    color: 'var(--color-text)',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem'
                                }}
                                onClick={() => setShowEditBingoModal(true)}
                            >
                                <Edit2 size={16} /> Edit Bingo Board Tasks
                            </button>
                        </div>
                    )}
                    <button className={`btn btn-primary ${styles.saveBtn}`} onClick={handleSaveTripDetails} disabled={savingTrip}>
                        {savingTrip ? 'Saving...' : 'Save Settings & Games'}
                    </button>
                </div>
                </>
            )}

            </div>



            {userToKick && createPortal(
                <div className={`modal-backdrop ${styles.modalBackdrop}`} onClick={() => setUserToKick(null)}>
                    <div className={`card animate-fade-in ${styles.modalCard}`} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Remove Member</h2>
                            <button onClick={() => setUserToKick(null)} className={styles.modalCloseBtn} title="Close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.modalForm}>
                            <p className={styles.kickWarningText}>
                                Are you sure you want to completely remove this member from the trip? They will lose access.
                            </p>
                            <button 
                                className={`btn btn-primary ${styles.kickConfirmBtn}`}
                                onClick={async () => {
                                    if(userToKick) {
                                        try {
                                            const newMembers = localMembers.filter(m => m !== userToKick);
                                            const newAdminIds = localAdminIds.filter(m => m !== userToKick);
                                            await updateTrip(trip.id, {
                                                members: newMembers,
                                                adminIds: newAdminIds
                                            });
                                            
                                            // Instantly remove locally from UI
                                            setLocalMembers(newMembers);
                                            setLocalAdminIds(newAdminIds);

                                            if (!userToKick.startsWith('mock_')) {
                                                const userRef = doc(db, 'users', userToKick);
                                                await updateDoc(userRef, {
                                                    trips: arrayRemove(trip.id)
                                                });
                                            }
                                        } catch (e) {
                                            console.error('Failed to remove member:', e);
                                            alert('Failed to remove member. Is this a local preview mock trip?');
                                        }
                                    }
                                    setUserToKick(null);
                                }}
                            >
                                Remove Member
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {showEditBingoModal && createPortal(
                <div className={`modal-backdrop ${styles.modalBackdrop}`} onClick={() => setShowEditBingoModal(false)}>
                    <div className={`card animate-fade-in ${styles.modalCard}`} style={{ width: '95%', maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader} style={{ flexShrink: 0 }}>
                            <h2 className={styles.modalTitle}>Edit Bingo Board</h2>
                            <button onClick={() => setShowEditBingoModal(false)} className={styles.modalCloseBtn} title="Close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.modalForm} style={{ overflowY: 'auto', paddingRight: '0.5rem', flex: 1 }}>
                            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                                Modify the 30 tasks for your Bingo game. Changes here will update the board for all players immediately upon saving.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {bingoSquares.map((sq, i) => (
                                    <div key={sq.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-bg-primary)', padding: '0.5rem', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', width: '20px', textAlign: 'center' }}>{i + 1}</span>
                                        <input 
                                            className="input-field"
                                            style={{ flex: 1, padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
                                            value={sq.task}
                                            onChange={e => {
                                                const newSquares = [...bingoSquares];
                                                newSquares[i] = { ...sq, task: e.target.value };
                                                setBingoSquares(newSquares);
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{ flexShrink: 0, marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                            <button 
                                className="btn btn-primary" 
                                style={{ width: '100%' }}
                                disabled={savingBingo}
                                onClick={async () => {
                                    if(trip.id) {
                                        setSavingBingo(true);
                                        try {
                                            await saveBingoBoard(trip.id, bingoSquares);
                                            setShowEditBingoModal(false);
                                        } catch(e) {
                                            console.error(e);
                                            alert("Failed to save Bingo Board.");
                                        } finally {
                                            setSavingBingo(false);
                                        }
                                    }
                                }}
                            >
                                {savingBingo ? 'Saving...' : 'Save Bingo Board'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {toast && createPortal(
                <div className={styles.toast} role="status" aria-live="polite">
                    <div className={`${styles.toastInner} ${toast.kind === 'success' ? styles.toastSuccess : styles.toastError}`}>
                        {toast.kind === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                        <span>{toast.message}</span>
                    </div>
                </div>,
                document.body
            )}

            {showCurrencyInfo && createPortal(
                <div className={`modal-backdrop ${styles.modalBackdrop}`} onClick={() => setShowCurrencyInfo(false)}>
                    <div className={`card animate-fade-in ${styles.modalCard}`} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Even-valuta</h2>
                            <button onClick={() => setShowCurrencyInfo(false)} className={styles.modalCloseBtn} title="Stäng">
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.modalForm}>
                            <p style={{ margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
                                Even-valutan är resans <strong>gemensamma redovisningsvaluta</strong>. Alla utgifter,
                                balanser och slutavräkningar visas och summeras i den här valutan oavsett vilken
                                valuta varje enskilt kvitto är i.
                            </p>
                            <p style={{ margin: '0 0 0.75rem 0', lineHeight: 1.5 }}>
                                <strong>Så här räknar vi om:</strong> När någon laddar upp ett kvitto i en annan valuta
                                (t.ex. NOK eller EUR) används <strong>ECB:s officiella mittkurs</strong> för det datum
                                som står på kvittot. Originalbeloppet visas alltid kvar — omräkningen är bara för att
                                kunna jämföra och summera.
                            </p>
                            <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                                <strong>Obs:</strong> Det här är en referenskurs. Det belopp som faktiskt dragits
                                från ditt kort kan skilja sig något åt eftersom banker och kortutgivare lägger på
                                egna växlingsavgifter, marginaler och använder sina egna kurser för dagen. Använd
                                Even-summan som riktlinje vid uppgörelsen — inte som exakt återbetalning av en
                                korttransaktion.
                            </p>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {destinationToRemove && createPortal(
                <div className={`modal-backdrop ${styles.modalBackdrop}`} onClick={() => setDestinationToRemove(null)}>
                    <div className={`card animate-fade-in ${styles.modalCard}`} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Remove Destination</h2>
                            <button onClick={() => setDestinationToRemove(null)} className={styles.modalCloseBtn} title="Close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.modalForm}>
                            <p className={styles.kickWarningText}>
                                Are you sure you want to remove this added destination? This cannot be undone once saved.
                            </p>
                            <button 
                                className={`btn btn-primary ${styles.kickConfirmBtn}`}
                                onClick={() => {
                                    setTripForm(prev => ({
                                        ...prev,
                                        destinations: prev.destinations.filter(d => d.id !== destinationToRemove.id)
                                    }));
                                    setDestinationToRemove(null);
                                }}
                            >
                                Remove Destination
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

// ── Member view: shown when current user is a member but not an admin ────────
const MemberView: React.FC<{ trip: Trip; users: AppUser[] }> = ({ trip, users }) => {
    const { currentUser } = useAuth();
    const { leaveTrip } = useTrip();
    const navigate = useNavigate();
    const [prefs, setPrefs] = useState<MemberPrefs>(DEFAULT_MEMBER_PREFS);
    const [savingKey, setSavingKey] = useState<keyof MemberPrefs | null>(null);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!currentUser) return;
        let cancelled = false;
        getMemberPrefs(trip.id, currentUser.uid)
            .then(p => { if (!cancelled) setPrefs(p); })
            .catch(e => console.error('Failed to load member prefs', e));
        return () => { cancelled = true; };
    }, [trip.id, currentUser]);

    const togglePref = async (key: keyof MemberPrefs, value: boolean) => {
        if (!currentUser) return;
        setSavingKey(key);
        const prev = prefs[key];
        setPrefs(p => ({ ...p, [key]: value }));
        try {
            await updateMemberPrefs(trip.id, currentUser.uid, { [key]: value });
        } catch (e) {
            console.error('Failed to update pref', e);
            setPrefs(p => ({ ...p, [key]: prev }));
            alert('Could not save that change. Please try again.');
        } finally {
            setSavingKey(null);
        }
    };

    const handleLeave = async () => {
        try {
            await leaveTrip(trip.id);
            navigate('/');
        } catch (e) {
            console.error('Failed to leave trip', e);
            alert('Could not leave the trip. Please try again.');
        }
    };

    const handleCopyCode = async () => {
        try {
            await navigator.clipboard.writeText(trip.id);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (e) {
            console.error('Clipboard write failed', e);
        }
    };

    const startEnd = [trip.startDate, trip.endDate].filter(Boolean).join(' → ') || 'No dates set';
    const adminMembers = users.filter(u => trip.adminIds?.includes(u.uid));
    const regularMembers = users.filter(u => trip.members?.includes(u.uid) && !trip.adminIds?.includes(u.uid));

    return (
        <>
            {/* Trip info — read only */}
            <div className={`glass-panel ${styles.panel}`}>
                <h3 className={styles.sectionTitleDark}><Info size={18} /> Trip Info</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.25rem', fontSize: '0.9rem' }}>
                    <div><strong>Name:</strong><br />{trip.name || '—'}</div>
                    <div><strong>Type:</strong><br />{trip.type || '—'}</div>
                    <div><strong>Destination:</strong><br />{trip.destination || '—'}</div>
                    <div><strong>Dates:</strong><br />{startEnd}</div>
                    <div><strong>Accommodation:</strong><br />{trip.accommodation || '—'}</div>
                    <div><strong>Currency:</strong><br />{trip.baseCurrency || 'SEK'}</div>
                </div>
                <p style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    Only trip admins can change these. Contact an admin if something is wrong.
                </p>
            </div>

            {/* Members — read only */}
            <div className={`glass-panel ${styles.panel}`}>
                <h3 className={styles.sectionTitleDark}><Users size={18} /> Members ({trip.members?.length || 0})</h3>
                <div className={styles.codeRow}>
                    <div className={styles.codeLabel}>Code: <span className={styles.codeValue}>{trip.id}</span></div>
                    <button onClick={handleCopyCode} className={`btn ${styles.inviteBtn}`} disabled={trip.inviteClosed}>
                        <Copy size={14} /> {copied ? 'Copied!' : 'Copy code'}
                    </button>
                </div>
                {trip.inviteClosed && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                        The invite code is locked. Ask an admin to share an invite directly.
                    </p>
                )}
                <div className={styles.membersList}>
                    {[...adminMembers, ...regularMembers].map(u => {
                        const isCreator = u.uid === trip.createdBy;
                        const isThisAdmin = trip.adminIds?.includes(u.uid);
                        return (
                            <div key={u.uid} className={styles.memberRow}>
                                <div className={styles.memberRowLeft}>
                                    {u.avatarUrl
                                        ? <img src={u.avatarUrl} alt={u.name} className={styles.memberAvatar} />
                                        : <div className={styles.memberAvatarPlaceholder}><Users size={14} color="#9ca3af" /></div>
                                    }
                                    <div className={styles.memberNameBox}>
                                        <div className={styles.memberName}>
                                            {u.name || u.fullName || 'Member'}
                                            {u.uid === currentUser?.uid && <span style={{ marginLeft: 6, color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>(you)</span>}
                                        </div>
                                        {isCreator
                                            ? <span className={styles.adminBadge}>Admin</span>
                                            : isThisAdmin ? <span className={styles.adminBadge}>Submanager</span> : null}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* My trip preferences — writable */}
            <div className={`glass-panel ${styles.panel}`}>
                <h3 className={styles.sectionTitleDark}><Settings size={18} /> My Settings for This Trip</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                    These settings only apply to this trip. They override your global profile preferences while you're here.
                </p>
                <PrefRow
                    icon={<MapPin size={16} />}
                    label="Share my live location"
                    description="Other members of this trip can see where you are on the map."
                    value={prefs.shareLocation}
                    saving={savingKey === 'shareLocation'}
                    onChange={v => togglePref('shareLocation', v)}
                />
                <PrefRow
                    icon={<Phone size={16} />}
                    label="Share my phone number"
                    description="Members can see your number so they can call or text you."
                    value={prefs.sharePhoneNumber}
                    saving={savingKey === 'sharePhoneNumber'}
                    onChange={v => togglePref('sharePhoneNumber', v)}
                />
                <PrefRow
                    icon={<Tag size={16} />}
                    label="Allow others to tag me in photos"
                    description="When someone uploads a gallery photo they can tag you in it."
                    value={prefs.allowPhotoTags}
                    saving={savingKey === 'allowPhotoTags'}
                    onChange={v => togglePref('allowPhotoTags', v)}
                />
                <PrefRow
                    icon={<Trophy size={16} />}
                    label="Show me on leaderboards"
                    description="Drunk-leaderboard, bingo-leaderboard, etc."
                    value={prefs.showOnLeaderboard}
                    saving={savingKey === 'showOnLeaderboard'}
                    onChange={v => togglePref('showOnLeaderboard', v)}
                />
                <PrefRow
                    icon={<CheckSquare size={16} />}
                    label="Auto-RSVP to new activities"
                    description="When an admin adds an activity, you're automatically marked as 'going'."
                    value={prefs.autoJoinActivities}
                    saving={savingKey === 'autoJoinActivities'}
                    onChange={v => togglePref('autoJoinActivities', v)}
                />
                <PrefRow
                    icon={<BellOff size={16} />}
                    label="Mute notifications from this trip"
                    description="No push or email pings about new activities, expenses, or messages."
                    value={prefs.muteNotifications}
                    saving={savingKey === 'muteNotifications'}
                    onChange={v => togglePref('muteNotifications', v)}
                />
            </div>

            {/* Leave trip */}
            <div className={`glass-panel ${styles.panel}`}>
                <h3 className={styles.sectionTitleDark}><LogOut size={18} /> Leave This Trip</h3>
                {!confirmLeave ? (
                    <>
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0 0 0.75rem' }}>
                            Leaving the trip removes you from members. Your past expenses and photos remain
                            visible to other members. You'll need a fresh invite to rejoin.
                        </p>
                        <button onClick={() => setConfirmLeave(true)} className="btn" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                            Leave trip
                        </button>
                    </>
                ) : (
                    <>
                        <p style={{ fontSize: '0.9rem', color: '#b91c1c', margin: '0 0 0.75rem' }}>
                            Are you sure? This cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={handleLeave} className="btn" style={{ background: '#dc2626', color: 'white' }}>
                                Yes, leave trip
                            </button>
                            <button onClick={() => setConfirmLeave(false)} className="btn">
                                Cancel
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
};

interface PrefRowProps {
    icon: React.ReactNode;
    label: string;
    description: string;
    value: boolean;
    saving: boolean;
    onChange: (v: boolean) => void;
}

const PrefRow: React.FC<PrefRowProps> = ({ icon, label, description, value, saving, onChange }) => (
    <label
        style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '0.75rem 0', borderTop: '1px solid #f3f4f6', cursor: 'pointer',
        }}
    >
        <span style={{ color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>{icon}</span>
        <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>{description}</div>
        </div>
        <input
            type="checkbox"
            checked={value}
            disabled={saving}
            onChange={e => onChange(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: '0.15rem', cursor: 'pointer' }}
        />
    </label>
);
