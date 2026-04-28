import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Users, Plus, Loader2 } from 'lucide-react';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { fetchPopulatedUsers } from '../services/network';
import type { AppUser } from '../context/AuthContext';
import styles from './Profile.module.css'; // Reuse some standard list styles
import { Search } from 'lucide-react';
import { useToast } from '../components/useToast';

export interface Group {
    id: string;
    name: string;
    createdBy: string;
    members: string[]; // UIDs
}

export const Groups: React.FC<{ onBack: () => void }> = () => {
    const toast = useToast();
    const { appUser, currentUser } = useAuth();
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    
    // Group Detailing State
    const [viewingGroup, setViewingGroup] = useState<Group | null>(null);
    const [groupMembers, setGroupMembers] = useState<AppUser[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    
    // Member Adding State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<AppUser[]>([]);
    const [followingUsers, setFollowingUsers] = useState<AppUser[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        const fetchGroups = async () => {
            if (!currentUser || !appUser) return;
            // For now, fetch groups where the user is a member
            try {
                const q = query(collection(db, 'groups'), where('members', 'array-contains', currentUser.uid));
                const snapshot = await getDocs(q);
                const fetchedGroups = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Group));
                setGroups(fetchedGroups);
            } catch (error) {
                console.error("Error fetching groups:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchGroups();
    }, [currentUser, appUser]);

    const handleCreateGroup = async () => {
        if (!newGroupName.trim() || !currentUser) return;
        
        // Mock ID generator
        const newId = `grp_${Math.random().toString(36).substr(2, 9)}`;
        const newGroup: Group = {
            id: newId,
            name: newGroupName,
            createdBy: currentUser.uid,
            members: [currentUser.uid]
        };
        
        try {
            await setDoc(doc(db, 'groups', newId), newGroup);
            setGroups(prev => [...prev, newGroup]);
            setNewGroupName('');
            setIsCreating(false);
        } catch (error) {
            console.error("Error creating group:", error);
            toast.error("Failed to create group.");
        }
    };

    useEffect(() => {
        if (!viewingGroup) return;
        const loadViewMembers = async () => {
            setLoadingMembers(true);
            try {
                const fetched = await fetchPopulatedUsers(viewingGroup.members);
                setGroupMembers(fetched);
                
                // Pre-load following for suggestions
                if (appUser?.following?.length) {
                    const follows = await fetchPopulatedUsers(appUser.following);
                    setFollowingUsers(follows.filter(f => !viewingGroup.members.includes(f.uid)));
                } else {
                    setFollowingUsers([]);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingMembers(false);
            }
        }
        loadViewMembers();
    }, [viewingGroup, appUser?.following]);

    useEffect(() => {
        const searchTimer = setTimeout(async () => {
            if (searchQuery.trim().length >= 2) {
                setIsSearching(true);
                try {
                    const term = searchQuery.trim();
                    const endTerm = term + '\uf8ff';
                    const qName = query(collection(db, 'users'), where('name', '>=', term), where('name', '<=', endTerm));
                    const qFullName = query(collection(db, 'users'), where('fullName', '>=', term), where('fullName', '<=', endTerm));
                    
                    const [snapName, snapFull] = await Promise.all([getDocs(qName), getDocs(qFullName)]);
                    const resultsParams = new Map<string, AppUser>();
                    
                    [...snapName.docs, ...snapFull.docs].forEach(doc => {
                        const data = doc.data() as AppUser;
                        if (!viewingGroup?.members.includes(data.uid)) {
                            resultsParams.set(data.uid, data);
                        }
                    });
                    setSearchResults(Array.from(resultsParams.values()).slice(0, 5));
                } catch(e) {
                    console.error("Search failed", e);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 500);
        return () => clearTimeout(searchTimer);
    }, [searchQuery, viewingGroup]);

    const handleAddMember = async (targetUid: string) => {
        if (!viewingGroup) return;
        try {
            await updateDoc(doc(db, 'groups', viewingGroup.id), {
                members: arrayUnion(targetUid)
            });
            // opti sync
            const updatedGroup = { ...viewingGroup, members: [...viewingGroup.members, targetUid] };
            setViewingGroup(updatedGroup);
            setGroups(groups.map(g => g.id === updatedGroup.id ? updatedGroup : g));
            setFollowingUsers(prev => prev.filter(f => f.uid !== targetUid));
            setSearchResults(prev => prev.filter(f => f.uid !== targetUid));
        } catch (e) {
            console.error(e);
            toast.error("Failed to add member to group");
        }
    }

    if (viewingGroup) {
        return (
            <div className={styles.scrollContainer} style={{ background: 'var(--color-bg-primary)', position: 'absolute', inset: 0, zIndex: 10 }}>
                <div className={styles.settingsHeader} style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', paddingLeft: '0.5rem' }} onClick={() => setViewingGroup(null)}>
                        <ArrowLeft size={20} />
                        <h2 className={styles.settingsTitle} style={{ margin: 0 }}>{viewingGroup.name}</h2>
                    </div>
                </div>

                <div className={styles.settingsContent}>
                    <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input 
                            className="input-field"
                            style={{ paddingLeft: '2.75rem', background: 'var(--color-bg-card)' }}
                            placeholder="Add member by name..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    
                    {searchQuery.trim().length >= 2 ? (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Search Results</h4>
                            {isSearching ? <div style={{ padding: '1rem', textAlign: 'center' }}><Loader2 className="animate-spin" /></div> : (
                                searchResults.length === 0 ? <p style={{ fontSize: '0.85rem' }}>No users found.</p> : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {searchResults.map(u => (
                                            <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: 'var(--color-bg-card)', padding: '0.6rem 1rem', borderRadius: 12 }}>
                                                <img src={u.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.name)}`} alt={u.name} style={{ width: 32, height: 32, borderRadius: '50%' }} loading="lazy" />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{u.fullName || u.name}</div>
                                                </div>
                                                <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', background: 'var(--color-primary)', color: '#fff' }} onClick={() => handleAddMember(u.uid)}>Add</button>
                                            </div>
                                        ))}
                                    </div>
                                )
                            )}
                        </div>
                    ) : followingUsers.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Suggested (Following)</h4>
                            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                                {followingUsers.map(u => (
                                    <div key={u.uid} style={{ background: 'var(--color-bg-card)', borderRadius: 12, padding: '0.75rem', flexShrink: 0, width: 85, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                                        <img src={u.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.name)}`} alt={u.name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} loading="lazy" />
                                        <div style={{ fontSize: '0.75rem', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>{u.fullName || u.name}</div>
                                        <button onClick={() => handleAddMember(u.uid)} style={{ border: 'none', background: 'var(--color-primary)', color: '#fff', borderRadius: 99, padding: '0.2rem 0.6rem', fontSize: '0.7rem' }}>+ Add</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <h4 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Group Members ({viewingGroup.members.length})</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {loadingMembers ? <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><Loader2 className="animate-spin" /></div> : groupMembers.map(member => (
                            <div key={member.uid} className={styles.settingsCard} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', margin: 0 }}>
                                <img src={member.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(member.name)}`} alt={member.name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} loading="lazy" />
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ margin: 0, fontSize: '1rem' }}>{member.fullName || member.name}</h4>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>@{member.name}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className={styles.scrollContainer} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Loader2 className="animate-spin" size={32} style={{ color: 'var(--color-text-muted)' }} />
            </div>
        );
    }

    return (
        <div className={styles.scrollContainer}>
            <div className={styles.settingsHeader} style={{ marginBottom: '1.5rem' }}>
                <h2 className={styles.settingsTitle} style={{ paddingLeft: '1rem' }}>My Groups</h2>
            </div>

            <div className={styles.settingsContent}>
                {isCreating ? (
                    <div className={styles.settingsCard}>
                        <h3 className={styles.cardSectionTitle}>Create New Group</h3>
                        <label className={styles.settingsLabel}>Group Name</label>
                        <input 
                            autoFocus
                            className="input-field" 
                            placeholder="e.g. Ski Team 2026" 
                            value={newGroupName} 
                            onChange={e => setNewGroupName(e.target.value)} 
                        />
                        <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.25rem' }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsCreating(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
                                Create
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <button className="btn btn-primary" style={{ width: '100%', marginBottom: '1.25rem' }} onClick={() => setIsCreating(true)}>
                            <Plus size={18} /> Create New Group
                        </button>

                        {groups.length === 0 ? (
                            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: '2rem' }}>
                                You are not part of any groups yet.
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                {groups.map(group => (
                                    <div key={group.id} className={styles.settingsCard} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem', cursor: 'pointer' }} onClick={() => setViewingGroup(group)}>
                                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Users size={20} style={{ color: 'var(--color-text)' }} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--color-text)' }}>{group.name}</h4>
                                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                                {group.members.length} member{group.members.length !== 1 ? 's' : ''}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
