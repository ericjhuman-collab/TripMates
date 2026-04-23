import React, { useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Info, Camera } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import { addActivity, updateActivity, getSavedLists, getSavedActivities, updateActivity as updateMasterActivity, type Activity, type ActivityList } from '../services/activities';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../services/firebase';
import { CustomSelect } from '../components/CustomSelect';
import { ModernPlaceAutocomplete } from '../components/ModernPlaceAutocomplete';
import { getDefaultCover } from '../utils/defaultCovers';
import styles from './TripAdmin.module.css';
import editorStyles from './ActivityEditorPage.module.css';

export const ActivityEditorPage: React.FC = () => {
    const { tripId } = useParams<{ tripId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const { userTrips } = useTrip();
    const { appUser, currentUser } = useAuth();

    // Existing activity passed via navigation state when editing
    const existingActivity: Activity | undefined = location.state?.activity;
    const trip = userTrips.find(t => t.id === tripId);

    // ── Date default ──────────────────────────────────────────
    const getDefaultDate = () => {
        if (existingActivity?.day) return existingActivity.day;
        const todayStr = new Date().toLocaleDateString('sv-SE');
        if (!trip?.startDate) return todayStr;
        const start = new Date(trip.startDate);
        start.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return start < today ? todayStr : trip.startDate;
    };

    // ── Form state ────────────────────────────────────────────
    const [title, setTitle]               = useState(existingActivity?.title || '');
    const [description, setDescription]   = useState(existingActivity?.description || '');
    const [date, setDate]                 = useState(getDefaultDate);
    const [time, setTime]                 = useState(existingActivity?.time || '');
    const [endTime, setEndTime]           = useState(existingActivity?.endTime || '');
    const [locationName, setLocationName] = useState(existingActivity?.locationName || '');
    const [address, setAddress]           = useState(existingActivity?.address || '');
    const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(existingActivity?.location || null);
    const [mapIcon, setMapIcon]           = useState(existingActivity?.mapIcon || '📍');
    const [category, setCategory]         = useState(existingActivity?.category || 'Activity');
    const [imageUrl, setImageUrl]         = useState(existingActivity?.imageUrl || '');
    const [imageUploading, setImageUploading] = useState(false);
    const imageFileRef = useRef<File | null>(null);
    const [enableVoting, setEnableVoting] = useState(existingActivity?.enableVoting || false);
    const [voteQuestion, setVoteQuestion] = useState(existingActivity?.voteQuestion || '');
    const [showVoteInfo, setShowVoteInfo] = useState(false);
    const [saving, setSaving]             = useState(false);

    // ── Saved Activities Import State ─────────────────────────
    const [showImportModal, setShowImportModal] = useState(false);
    
    // View 1 (Lists)
    const [savedLists, setSavedLists] = useState<ActivityList[]>([]);
    const [loadingLists, setLoadingLists] = useState(false);
    
    // View 2 (Activities in List)
    const [activeImportList, setActiveImportList] = useState<ActivityList | null>(null);
    const [savedLibrary, setSavedLibrary] = useState<Activity[]>([]);
    const [loadingLibrary, setLoadingLibrary] = useState(false);

    const handleOpenImport = async () => {
        setShowImportModal(true);
        setActiveImportList(null);
        if (!currentUser) return;
        setLoadingLists(true);
        try {
            const lists = await getSavedLists(currentUser.uid);
            setSavedLists(lists);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingLists(false);
        }
    };

    const handleDiveList = async (list: ActivityList) => {
        setActiveImportList(list);
        if (!currentUser) return;
        setLoadingLibrary(true);
        try {
            const acts = await getSavedActivities(currentUser.uid, list.id);
            setSavedLibrary(acts);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingLibrary(false);
        }
    };

    const handleImportSelection = (act: Activity) => {
        setTitle(act.title);
        setDescription(act.description);
        setLocationName(act.locationName);
        setAddress(act.address);
        setLocationCoords(act.location);
        setMapIcon(act.mapIcon || '📍');
        setCategory(act.category || 'Activity');
        setImageUrl(act.imageUrl || '');
        // Keep ID to update the master record later
        setImportedFromId(act.id || null);
        setUsedInTripsRef(act.usedInTrips || []);
        setShowImportModal(false);
    };

    const [importedFromId, setImportedFromId] = useState<string | null>(null);
    const [usedInTripsRef, setUsedInTripsRef] = useState<string[]>([]);

    // ── Submit ────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) { alert('Please enter an Activity Title.'); return; }
        if (!date || !time) { alert('Please select a Date and Start Time.'); return; }
        if (!tripId) { alert('Trip ID missing.'); return; }

        const userId = appUser?.uid || currentUser?.uid;
        if (!userId) { alert('Not logged in.'); return; }

        setSaving(true);
        try {
            let finalCoords = locationCoords;
            if (!finalCoords && (address || locationName)) {
                try {
                    const q = address || locationName;
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
                        { headers: { 'User-Agent': 'TripMates/1.0' } }
                    );
                    const geoData = await res.json();
                    if (geoData?.length > 0) {
                        finalCoords = { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) };
                        setLocationCoords(finalCoords);
                    }
                } catch { /* silent */ }
            }

            // Upload cover image if new file chosen
            let finalImageUrl = imageUrl;
            if (imageFileRef.current) {
                const file = imageFileRef.current;
                const ext = file.name.split('.').pop() || 'jpg';
                const path = `trips/${tripId}/activities/${Date.now()}.${ext}`;
                const storageRef = ref(storage, path);
                const task = await uploadBytesResumable(storageRef, file);
                finalImageUrl = await getDownloadURL(task.ref);
            }

            const data: Partial<Activity> = {
                tripId, title, description, day: date, time, endTime,
                locationName, address, mapIcon, imageUrl: finalImageUrl,
                category, createdBy: userId, location: finalCoords,
                enableVoting, voteQuestion,
            };

            if (existingActivity?.id) {
                await updateActivity(existingActivity.id, data);
            } else {
                await addActivity(data as Activity);
                if (importedFromId) {
                    await updateMasterActivity(importedFromId, {
                        usedInTrips: [...new Set([...usedInTripsRef, tripId])]
                    });
                }
            }

            navigate(-1);
        } catch (err) {
            console.error(err);
            alert('Failed to save activity');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={editorStyles.page}>
            {/* Header */}
            <div className={editorStyles.header}>
                <button onClick={() => navigate(-1)} className={editorStyles.backBtn} title="Go back">
                    <ArrowLeft size={22} />
                </button>
                <h1 className={editorStyles.title}>
                    {existingActivity ? 'Edit Activity' : 'Add Activity'}
                </h1>
            </div>

            <form onSubmit={handleSubmit} className={editorStyles.form} noValidate>
                {!existingActivity && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <button type="button" className={`btn btn-secondary`} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={handleOpenImport}>
                            <Info size={16} /> Import from Saved Templates
                        </button>
                    </div>
                )}

                {/* Import Modal */}
                {showImportModal && (
                    <div className={styles.modalOverlay} onClick={() => setShowImportModal(false)}>
                        <div className={styles.modalContent} style={{ maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                            {!activeImportList ? (
                                <>
                                    <h3 style={{ marginTop: 0 }}>My Lists</h3>
                                    {loadingLists ? <p>Loading lists...</p> : (
                                        savedLists.length === 0 ? <p>No saved lists found.</p> : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '1rem', background: 'var(--color-border)', padding: '1px', borderRadius: '12px' }}>
                                                {savedLists.map((list, index) => (
                                                    <div key={list.id} onClick={() => handleDiveList(list)} style={{ padding: '1rem', background: 'var(--color-bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', borderRadius: savedLists.length === 1 ? '11px' : (index === 0 ? '11px 11px 0 0' : (index === savedLists.length - 1 ? '0 0 11px 11px' : '0')) }}>
                                                        <span style={{ fontSize: '1.5rem' }}>{list.icon || '📍'}</span>
                                                        <h4 style={{ margin: 0, fontSize: '1rem' }}>{list.title}</h4>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    )}
                                    <button type="button" style={{ marginTop: '1.5rem', width: '100%' }} className="btn btn-secondary" onClick={() => setShowImportModal(false)}>Cancel</button>
                                </>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setActiveImportList(null)}><ArrowLeft size={20} /></button>
                                        <h3 style={{ margin: 0 }}>{activeImportList.icon} {activeImportList.title}</h3>
                                    </div>
                                    {loadingLibrary ? <p>Loading places...</p> : (
                                        savedLibrary.length === 0 ? <p>No places found in this list.</p> : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                                {savedLibrary.map(act => (
                                                    <div key={act.id} onClick={() => handleImportSelection(act)} style={{ padding: '0.8rem', border: '1px solid var(--color-border)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <h4 style={{ margin: 0, fontSize: '1rem' }}>{act.title}</h4>
                                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{act.locationName}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Cover Image */}
                <div className={editorStyles.field}>
                    <label className={editorStyles.label}>Cover Image</label>
                    <div className={styles.coverUploadArea}>
                        <img
                            src={imageUrl || getDefaultCover(category, locationName || title || 'activity')}
                            alt="Activity cover"
                            className={styles.coverPreview}
                        />
                        <label className={styles.coverUploadBtn} title="Upload cover photo">
                            {imageUploading ? 'Uploading…' : <><Camera size={14} /> Change Photo</>}
                            <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    imageFileRef.current = file;
                                    setImageUploading(true);
                                    setImageUrl(URL.createObjectURL(file));
                                    setImageUploading(false);
                                }}
                            />
                        </label>
                    </div>
                </div>

                {/* Title */}
                <div className={editorStyles.field}>
                    <label className={editorStyles.label}>Activity Title</label>
                    <input placeholder="e.g. Flight Departure" className="input-field" title="Activity Title" value={title} onChange={e => setTitle(e.target.value)} />
                </div>

                {/* Category */}
                <div className={editorStyles.field}>
                    <label className={editorStyles.label}>Category</label>
                    <CustomSelect
                        className="input-field"
                        value={category}
                        onChange={val => setCategory(val as typeof category)}
                        options={[
                            { value: 'Restaurant', label: 'Restaurant' },
                            { value: 'Cafe', label: 'Cafe' },
                            { value: 'Bar', label: 'Bar' },
                            { value: 'Museum', label: 'Museum' },
                            { value: 'Activity', label: 'Activity' },
                            { value: 'Other', label: 'Other' },
                        ]}
                    />
                </div>

                {/* Description */}
                <div className={editorStyles.field}>
                    <label className={editorStyles.label}>Description</label>
                    <textarea placeholder="Add some details..." className={`input-field ${editorStyles.textarea}`} title="Description" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
                </div>

                {/* Date / Time */}
                <div className={editorStyles.timeRow}>
                    <div className={editorStyles.timeCol}>
                        <label className={editorStyles.label}>Date</label>
                        <input type="date" className="input-field" title="Date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%' }} />
                    </div>
                    <div className={editorStyles.timeCol}>
                        <label className={editorStyles.label}>Start</label>
                        <input type="time" className="input-field" title="Start Time" value={time} onChange={e => setTime(e.target.value)} style={{ width: '100%' }} />
                    </div>
                    <div className={editorStyles.timeCol}>
                        <label className={editorStyles.label}>End (opt)</label>
                        <input type="time" className="input-field" title="End Time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ width: '100%' }} />
                    </div>
                </div>

                {/* Map Icon */}
                <div className={editorStyles.field}>
                    <label className={editorStyles.label}>Map Icon</label>
                    <div className={styles.emojiRow}>
                        {['📍', '🍷', '🍽️', '🏛️', '🍻', '🎭', '🚶‍♂️', '🚕'].map(emoji => (
                            <button
                                type="button"
                                key={emoji}
                                onClick={() => setMapIcon(emoji)}
                                className={`${styles.emojiBtn} ${mapIcon === emoji ? styles.emojiBtnActive : styles.emojiBtnInactive}`}
                                title={emoji}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Location */}
                <div className={editorStyles.field}>
                    <label className={editorStyles.label}>Location / Company Name</label>
                    <ModernPlaceAutocomplete
                        defaultValue={locationName}
                        onInputChange={setLocationName}
                        onPlaceSelected={(place) => {
                            setLocationName(place.name);
                            setAddress(place.formatted_address);
                            setLocationCoords(place.location);
                        }}
                        className={styles.pAutocomplete}
                    />
                </div>

                <div className={editorStyles.field}>
                    <label className={editorStyles.label}>Full Address (for map pin)</label>
                    <input placeholder="E.g. Piazza del Duomo, 20122 Milano" className="input-field" title="Full Address" value={address} onChange={e => setAddress(e.target.value)} />
                </div>

                {/* Voting */}
                <div className={editorStyles.votingRow}>
                    <input
                        type="checkbox"
                        id="enableVoting"
                        checked={enableVoting}
                        onChange={e => setEnableVoting(e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                    />
                    <label htmlFor="enableVoting" className={editorStyles.votingLabel}>
                        Enable Voting
                        <span
                            onClick={e => { e.preventDefault(); e.stopPropagation(); setShowVoteInfo(!showVoteInfo); }}
                            style={{ display: 'flex', alignItems: 'center', padding: '4px' }}
                        >
                            <Info size={16} style={{ color: 'var(--color-text-muted)' }} />
                        </span>
                    </label>
                </div>
                {showVoteInfo && (
                    <div className={editorStyles.voteInfo}>
                        With this enabled, members can vote on this activity from the dashboard.
                    </div>
                )}
                {enableVoting && (
                    <div className={editorStyles.field}>
                        <label className={editorStyles.label}>Vote Question</label>
                        <input placeholder="E.g. Who had the best energy?" className="input-field" title="Vote Question" value={voteQuestion} onChange={e => setVoteQuestion(e.target.value)} />
                    </div>
                )}

                <button type="submit" disabled={saving} className={`btn btn-primary ${editorStyles.submitBtn}`}>
                    {saving ? 'Saving…' : 'Save Activity'}
                </button>
            </form>
        </div>
    );
};
