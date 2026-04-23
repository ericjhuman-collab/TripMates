import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import { getSavedLists, addSavedList, deleteSavedList, getSavedActivities, addSavedActivity, deleteSavedActivity, updateActivity, type Activity, type ActivityList } from '../services/activities';
import { ArrowLeft, Plus, Loader2, Trash2, Globe, Lock, MapPin, MoreVertical } from 'lucide-react';
import { ModernPlaceAutocomplete } from '../components/ModernPlaceAutocomplete';
import { getDefaultCover } from '../utils/defaultCovers';
import styles from './Profile.module.css';
import tripStyles from './TripAdmin.module.css';

export const MyActivities: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const { userTrips } = useTrip();

    // Modal state for adding activity to a trip
    const [selectTripForAct, setSelectTripForAct] = useState<Activity | null>(null);
    
    // View state
    const [activeList, setActiveList] = useState<ActivityList | null>(null);

    // Root View (List of Lists)
    const [lists, setLists] = useState<ActivityList[]>([]);
    const [loadingLists, setLoadingLists] = useState(true);
    const [showCreateList, setShowCreateList] = useState(false);
    
    // Create list form
    const [newTitle, setNewTitle] = useState('');
    const [newIcon, setNewIcon] = useState('📍');
    const [newShared, setNewShared] = useState(false);
    const [creatingList, setCreatingList] = useState(false);

    // Active List View
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loadingActivities, setLoadingActivities] = useState(false);
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState('');

    useEffect(() => {
        const fetchLists = async () => {
            if (!currentUser) return;
            setLoadingLists(true);
            try {
                const fetched = await getSavedLists(currentUser.uid);
                // Sort to put newest/important first or by name
                setLists(fetched.sort((a, b) => a.title.localeCompare(b.title)));
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingLists(false);
            }
        };
        if (!activeList) fetchLists();
    }, [currentUser, activeList]);

    useEffect(() => {
        if (!activeList || !currentUser) return;
        const fetchActs = async () => {
            setLoadingActivities(true);
            try {
                const acts = await getSavedActivities(currentUser.uid, activeList.id);
                setActivities(acts);
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingActivities(false);
            }
        };
        fetchActs();
    }, [activeList, currentUser]);

    const handleCreateList = async () => {
        if (!newTitle.trim() || !currentUser) return;
        setCreatingList(true);
        try {
            const listPayload: Omit<ActivityList, 'id'> = {
                title: newTitle.trim(),
                ownerId: currentUser.uid,
                isShared: newShared,
                icon: newIcon
            };
            const id = await addSavedList(listPayload);
            setLists(prev => [...prev, { ...listPayload, id }]);
            setShowCreateList(false);
            setNewTitle('');
        } catch (e) {
            console.error(e);
            alert("Failed to create list.");
        } finally {
            setCreatingList(false);
        }
    };

    const handleDeleteList = async (e: React.MouseEvent, listId: string) => {
        e.stopPropagation();
        if (!confirm('Delete this entire list?')) return;
        try {
            await deleteSavedList(listId);
            setLists(prev => prev.filter(l => l.id !== listId));
        } catch (err) {
            console.error(err);
        }
    };

    // ── Autocomplete Instant Add Binding ────────────────────────
    const handlePlaceSelected = async (place: { name: string, formatted_address: string, location: { lat: number, lng: number } | null }) => {
        if (!activeList?.id || !currentUser) return;
        
        // Infer a basic category from typical names, though we'll default to 'Activity'
        let inferredCategory: 'Restaurant' | 'Cafe' | 'Bar' | 'Museum' | 'Activity' | 'Other' = 'Activity';
        const lm = place.name.toLowerCase();
        if (lm.includes('restaurant') || lm.includes('pizza') || lm.includes('burger')) inferredCategory = 'Restaurant';
        else if (lm.includes('cafe') || lm.includes('coffee')) inferredCategory = 'Cafe';
        else if (lm.includes('bar') || lm.includes('pub')) inferredCategory = 'Bar';
        else if (lm.includes('museum') || lm.includes('gallery')) inferredCategory = 'Museum';

        const rawActivity: Omit<Activity, 'id'> = {
            title: place.name,
            description: '',
            locationName: place.name,
            address: place.formatted_address,
            location: place.location,
            category: inferredCategory,
            mapIcon: activeList.icon || '📍',
            ownerId: currentUser.uid,
            isSavedActivity: true,
            savedListId: activeList.id,
            usedInTrips: []
        };

        try {
            const newId = await addSavedActivity(rawActivity);
            setActivities(prev => [{ ...rawActivity, id: newId }, ...prev]);
        } catch (e) {
            console.error(e);
            alert("Failed to add place");
        }
    };

    const handleDeleteActivity = async (id: string) => {
        if (!confirm('Remove this place?')) return;
        try {
            await deleteSavedActivity(id);
            setActivities(prev => prev.filter(a => a.id !== id));
        } catch (e) {
            console.error(e);
        }
    };

    const handleSaveNote = async (id: string) => {
        try {
            await updateActivity(id, { description: noteDraft });
            setActivities(prev => prev.map(a => a.id === id ? { ...a, description: noteDraft } : a));
            setEditingNoteId(null);
        } catch (e) {
            console.error(e);
            alert("Failed to save note");
        }
    };

    // ────────────────────────────────────────────────────────────
    // VIEW 1: Directory
    // ────────────────────────────────────────────────────────────
    if (!activeList) {
        return (
            <div className={`animate-fade-in ${tripStyles.page}`} style={{ padding: '1rem 0.5rem' }}>
                <div className={tripStyles.pageHeader}>
                    <button onClick={onBack} className={tripStyles.backBtn} title="Go back">
                        <ArrowLeft size={20} color="var(--color-primary-dark)" />
                    </button>
                    <h2 className={tripStyles.pageTitle} style={{ opacity: 0 }}>Saved Lists</h2> 
                </div>

                <div className={tripStyles.sections}>
                    <div className={`glass-panel ${tripStyles.panel}`}>
                        
                        {!showCreateList && (
                            <div className={tripStyles.sectionHeader}>
                                <h3 className={tripStyles.sectionTitle} style={{ color: 'var(--color-text)', fontSize: '1.3rem' }}>Saved Lists</h3>
                                <button className={`btn btn-primary ${tripStyles.importBtn}`} onClick={() => setShowCreateList(true)}>
                                    <Plus size={16} /> New List
                                </button>
                            </div>
                        )}

                        {showCreateList && (
                        <div className={`glass-panel animate-fade-in ${styles.settingsCard}`} style={{ padding: '1.5rem' }}>
                            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.1rem' }}>New List</h3>
                            <div style={{ display: 'flex', gap: '0.8rem', overflowX: 'auto', marginBottom: '1rem', paddingBottom: '0.5rem' }}>
                                {['📍', '🍔', '🍕', '🍸', '🏛️', '👻', '🕵️', '🚶'].map(emoji => (
                                    <button 
                                        key={emoji} 
                                        onClick={() => setNewIcon(emoji)}
                                        style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, border: newIcon === emoji ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', background: 'transparent', fontSize: '1.2rem'}}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                            <input className="input-field" placeholder="List Name" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ marginBottom: '1rem' }} />
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '1.5rem' }}>
                                <input type="checkbox" checked={newShared} onChange={e => setNewShared(e.target.checked)} />
                                <span style={{ fontSize: '0.9rem' }}>Shared List (Public)</span>
                            </label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCreateList(false)}>Cancel</button>
                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCreateList} disabled={creatingList}>Save</button>
                            </div>
                        </div>
                    )}

                    {loadingLists ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Loader2 className="animate-spin" /></div>
                    ) : lists.length === 0 && !showCreateList ? (
                        <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: '3rem' }}>
                            <MapPin size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                            <p>No saved lists yet.<br/>Create one to organize your favorite spots!</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'var(--color-border)', padding: '1px', borderRadius: '12px' }}>
                            {lists.map(list => (
                                <div 
                                    key={list.id} 
                                    style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.2rem', background: 'var(--color-bg-card)', cursor: 'pointer', borderRadius: lists.length === 1 ? '11px' : (lists[0].id === list.id ? '11px 11px 0 0' : (lists[lists.length-1].id === list.id ? '0 0 11px 11px' : '0')) }}
                                    onClick={() => setActiveList(list)}
                                >
                                    <div style={{ fontSize: '1.8rem', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {list.icon || '📍'}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--color-text)' }}>{list.title}</h4>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                            {list.isShared ? <Globe size={12} /> : <Lock size={12} />}
                                            {list.isShared ? 'Shared' : 'Private'}
                                        </div>
                                    </div>
                                    <button 
                                        onClick={(e) => list.id && handleDeleteList(e, list.id)}
                                        style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '8px' }}
                                    >
                                        <MoreVertical size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    </div>
                </div>
            </div>
        );
    }

    // ────────────────────────────────────────────────────────────
    // VIEW 2: Active List
    // ────────────────────────────────────────────────────────────
    return (
        <div className={`animate-fade-in ${tripStyles.page}`} style={{ padding: '1rem 0.5rem' }}>
            <div className={tripStyles.pageHeader}>
                <button onClick={() => setActiveList(null)} className={tripStyles.backBtn} title="Go back">
                    <ArrowLeft size={20} color="var(--color-primary-dark)" />
                </button>
                <h2 className={tripStyles.pageTitle} style={{ opacity: 0 }}>Active List</h2> 
            </div>

            <div className={tripStyles.sections}>
                <div className={`glass-panel ${tripStyles.panel}`}>
                    <div className={tripStyles.sectionHeader} style={{ marginBottom: '1.5rem' }}>
                        <h3 className={tripStyles.sectionTitle} style={{ fontSize: '1.4rem', color: 'var(--color-text)' }}>
                            <span style={{ marginRight: '0.4rem', fontSize: '1.6rem' }}>{activeList.icon}</span> {activeList.title}
                        </h3>
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                    <ModernPlaceAutocomplete
                        placeholder="Search for a place to add..."
                        onPlaceSelected={handlePlaceSelected}
                    />
                </div>

                {loadingActivities ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Loader2 className="animate-spin" /></div>
                ) : activities.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: '2rem', fontSize: '0.9rem' }}>
                        No places in this list yet. Search above to add one!
                    </div>
                ) : (
                    <div className={tripStyles.activityList}>
                        {activities.map(act => (
                            <div key={act.id} className={tripStyles.activityItem}>
                                <div className={tripStyles.activityIconBox}>
                                    <img src={act.imageUrl || getDefaultCover(act.category, act.locationName || act.title)} className={tripStyles.activityCoverThumb} alt="Cover" />
                                </div>
                                <div className={tripStyles.activityBody}>
                                    <div className={tripStyles.activityTitleRow}>
                                        <h4 className={tripStyles.activityName}>{act.title}</h4>
                                        <div className={tripStyles.activityActions}>
                                            <button onClick={() => act.id && handleDeleteActivity(act.id)} className={tripStyles.deleteBtn} title="Delete activity">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <p className={tripStyles.activityMeta} style={{ marginTop: '0.2rem', marginBottom: '0.5rem' }}>
                                        {act.category && <span className={tripStyles.categoryBadge} style={{ marginBottom: 0, marginRight: '0.5rem' }}>{act.category}</span>}
                                        {act.locationName}
                                    </p>
                                    
                                    <div style={{ marginTop: '0.8rem', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <button className="btn" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', flex: 1, border: '1px solid var(--color-border)', borderRadius: '999px', background: 'transparent', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }} onClick={() => setSelectTripForAct(act)}>
                                            <Plus size={14} /> Add Activity
                                        </button>
                                    </div>

                                    {editingNoteId === act.id ? (
                                        <div style={{ marginTop: '0.8rem' }}>
                                            <textarea 
                                                className="input-field" 
                                                style={{ minHeight: 60, padding: 8, fontSize: '0.85rem' }} 
                                                placeholder="Add a note..."
                                                value={noteDraft}
                                                onChange={e => setNoteDraft(e.target.value)}
                                            />
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                                <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => setEditingNoteId(null)}>Cancel</button>
                                                <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => handleSaveNote(act.id!)}>Save</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
                                            {act.description ? (
                                                <div 
                                                    style={{ fontSize: '0.85rem', color: 'var(--color-text)', background: 'rgba(0,0,0,0.03)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer' }}
                                                    onClick={() => { setEditingNoteId(act.id!); setNoteDraft(act.description); }}
                                                >
                                                    {act.description}
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <button 
                                                        style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.85rem', padding: 0, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                        onClick={() => { setEditingNoteId(act.id!); setNoteDraft(''); }}
                                                    >
                                                        <Plus size={14} /> Note
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                </div>
            </div>

            {selectTripForAct && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSelectTripForAct(null)}>
                    <div style={{ background: 'var(--color-bg-primary)', padding: '1.5rem', borderRadius: '16px', width: '90%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 1rem 0' }}>Add to Trip</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                            {userTrips.filter(t => t.adminIds?.includes(currentUser?.uid || '') || t.allowMemberActivities).map(t => (
                                <button key={t.id} className="btn" style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', justifyContent: 'flex-start', padding: '12px' }} onClick={() => navigate(`/admin/${t.id}/activity/new`, { state: { importedLocation: selectTripForAct } })}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                        {t.imageUrl ? (
                                            <div style={{ width: 32, height: 32, borderRadius: '6px', background: `url(${t.imageUrl}) center/cover` }} />
                                        ) : (
                                            <div style={{ width: 32, height: 32, borderRadius: '6px', backgroundColor: '#e5e7eb' }} />
                                        )}
                                        <div style={{ textAlign: 'left' }}>
                                            <div style={{ fontWeight: 600 }}>{t.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t.destination || 'No location'}</div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                            {userTrips.filter(t => t.adminIds?.includes(currentUser?.uid || '') || t.allowMemberActivities).length === 0 && (
                                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '1rem' }}>No active trips available to add activities to.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
