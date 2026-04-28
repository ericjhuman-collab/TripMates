import React, { useEffect, useState } from 'react';
import { collection, getDocs, setDoc, doc, updateDoc, arrayUnion, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth, type AppUser } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Phone, MessageCircle, Plus, X, Loader2 } from 'lucide-react';
import styles from './Members.module.css';
import { useToast } from '../components/Toast';

interface Group {
    id: string;
    name: string;
    createdBy: string;
    members: string[]; 
}

export const Members: React.FC = () => {
    const toast = useToast();
    const { appUser } = useAuth();
    const { activeTrip } = useTrip();
    const navigate = useNavigate();
    const [members, setMembers] = useState<(AppUser & { phoneNumber?: string })[]>([]);
    const [loading, setLoading] = useState(true);

    // Group Assignment State
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [userGroups, setUserGroups] = useState<Group[]>([]);
    const [fetchingGroups, setFetchingGroups] = useState(false);
    const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
    const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [isSavingGroup, setIsSavingGroup] = useState(false);

    useEffect(() => {
        const fetchMembers = async () => {
            if (!activeTrip) return;
            try {
                const snapshot = await getDocs(collection(db, 'users'));
                const usersData = snapshot.docs.map(doc => doc.data() as AppUser);

                const validMembers = usersData.filter(m => m.hasAgreed && activeTrip.members.includes(m.uid));

                const mockUids = activeTrip.members.filter(m => m.startsWith('mock_'));
                const mockUsers: (AppUser & { phoneNumber?: string })[] = mockUids.map(uid => ({
                    uid,
                    name: uid.replace('mock_', ''),
                    fullName: uid.replace('mock_', ''),
                    role: 'user',
                    hasAgreed: true,
                    phoneNumber: '+15551234567',
                    sharePhoneNumber: true,
                }));

                const all = [...validMembers, ...mockUsers];
                setMembers(all);

                // Fan out to load each member's phone (rule-gated by their
                // sharePhoneNumber flag). N+1 is acceptable for typical
                // 5-10 trip members; failures are silent.
                const { getPrivateContact } = await import('../services/userContact');
                const enriched = await Promise.all(all.map(async m => {
                    if (m.uid.startsWith('mock_')) return m; // mocks already have phone
                    const contact = await getPrivateContact(m.uid);
                    return contact?.phoneNumber
                        ? { ...m, phoneNumber: contact.phoneNumber }
                        : m;
                }));
                setMembers(enriched);
            } catch (err) {
                console.error('Failed to fetch members', err);
            } finally {
                setLoading(false);
            }
        };
        fetchMembers();
    }, [activeTrip]);

    const handleOpenGroupModal = async () => {
        if (!appUser) return;
        setShowGroupModal(true);
        setFetchingGroups(true);
        try {
            const q = query(collection(db, 'groups'), where('members', 'array-contains', appUser.uid));
            const snapshot = await getDocs(q);
            const fetched = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Group));
            setUserGroups(fetched);
            // Default select all real trip members
            const realMembers = members.filter(m => !m.uid.startsWith('mock_')).map(m => m.uid);
            setSelectedMembers(new Set(realMembers));
        } catch (error) {
            console.error("Error fetching groups:", error);
        } finally {
            setFetchingGroups(false);
        }
    };

    const handleSaveGroupAssignment = async () => {
        if (!appUser || selectedMembers.size === 0) return;
        if (isCreatingNewGroup && !newGroupName.trim()) return;
        if (!isCreatingNewGroup && !selectedGroupId) return;

        setIsSavingGroup(true);
        try {
            const memberArray = Array.from(selectedMembers);
            if (isCreatingNewGroup) {
                const newId = `grp_${Math.random().toString(36).substr(2, 9)}`;
                const newGroup: Group = {
                    id: newId,
                    name: newGroupName.trim(),
                    createdBy: appUser.uid,
                    members: Array.from(new Set([appUser.uid, ...memberArray])) // Ensure admin is in it too
                };
                await setDoc(doc(db, 'groups', newId), newGroup);
            } else {
                await updateDoc(doc(db, 'groups', selectedGroupId), {
                    members: arrayUnion(...memberArray)
                });
            }
            setShowGroupModal(false);
            setNewGroupName('');
            setIsCreatingNewGroup(false);
            toast.success("Members added to group successfully!");
        } catch (error) {
            console.error("Error saving group assignment:", error);
            toast.error("Failed to update group.");
        } finally {
            setIsSavingGroup(false);
        }
    };

    return (
        <div className={`animate-fade-in ${styles.page}`}>
            <div className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h2 className={styles.title}>Trip Members</h2>
                    {!loading && <span className={styles.count}>({members.length})</span>}
                </div>
                <button className={`btn-icon ${styles.addGroupBtn}`} onClick={handleOpenGroupModal} title="Add to Group" aria-label="Add to Group">
                    <Plus size={20} />
                </button>
            </div>

            {loading ? (
                <p className={styles.loadingText}>Loading members…</p>
            ) : members.length === 0 ? (
                <div className={`card ${styles.emptyCard}`}>
                    <p className={styles.emptyText}>No members have joined yet.</p>
                </div>
            ) : (
                <div className={styles.grid}>
                    {members.map(member => {
                        const isAdmin = member.role === 'admin';
                        const phone = member.phoneNumber?.replace(/[^0-9+]/g, '');
                        return (
                            <div
                                key={member.uid}
                                className={styles.memberCard}
                                onClick={() => !member.uid.startsWith('mock_') && navigate(`/profile/${member.uid}`)}
                                style={{ cursor: member.uid.startsWith('mock_') ? 'default' : 'pointer' }}
                            >
                                {/* Avatar */}
                                <div className={styles.avatarWrapper}>
                                    <img
                                        src={member.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(member.name)}`}
                                        alt={member.name}
                                        className={styles.avatarImg} loading="lazy" />
                                </div>

                                {/* Name + badge */}
                                <div className={styles.memberInfo}>
                                    <div className={styles.nameRow}>
                                        <h3 className={styles.memberName}>{member.fullName || member.name}</h3>
                                        {isAdmin && <span className={styles.adminBadge}>Admin</span>}
                                    </div>
                                    {(!member.phoneNumber || !member.sharePhoneNumber) && (
                                        <p className={styles.noPhone}>
                                            {member.phoneNumber ? 'Number hidden' : 'No phone provided'}
                                        </p>
                                    )}
                                </div>

                                {/* Contact buttons — right side */}
                                {member.phoneNumber && member.sharePhoneNumber && (
                                    <div className={styles.contactRow}>
                                        <a href={`tel:${phone}`} className={styles.contactBtn} title="Call">
                                            <Phone size={18} />
                                        </a>
                                        <a
                                            href={`https://wa.me/${phone}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={styles.contactBtn}
                                            title="WhatsApp"
                                        >
                                            <MessageCircle size={18} />
                                        </a>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Bulk Group Assignment Modal */}
            {showGroupModal && createPortal(
                <div className="modal-backdrop" onClick={() => setShowGroupModal(false)}>
                    <div className="card animate-fade-in" style={{ padding: '1.5rem', width: '90%', maxWidth: '400px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-primary-dark)' }}>Add to Group</h3>
                            <button onClick={() => setShowGroupModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                                <X size={24} />
                            </button>
                        </div>

                        {fetchingGroups ? (
                            <div style={{ textAlign: 'center', padding: '2rem 0' }}><Loader2 className="animate-spin" size={24} style={{ color: 'var(--color-text-muted)' }} /></div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {/* Group Selection */}
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 600 }}>Destination Group</label>
                                    
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <button 
                                            onClick={() => setIsCreatingNewGroup(false)} 
                                            style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: '1px solid', borderColor: !isCreatingNewGroup ? 'var(--color-primary)' : '#e5e7eb', background: !isCreatingNewGroup ? 'rgba(var(--color-primary-rgb), 0.1)' : 'transparent', color: !isCreatingNewGroup ? 'var(--color-primary-dark)' : 'var(--color-text-muted)', fontWeight: !isCreatingNewGroup ? 600 : 400 }}
                                        >
                                            Existing
                                        </button>
                                        <button 
                                            onClick={() => setIsCreatingNewGroup(true)} 
                                            style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: '1px solid', borderColor: isCreatingNewGroup ? 'var(--color-primary)' : '#e5e7eb', background: isCreatingNewGroup ? 'rgba(var(--color-primary-rgb), 0.1)' : 'transparent', color: isCreatingNewGroup ? 'var(--color-primary-dark)' : 'var(--color-text-muted)', fontWeight: isCreatingNewGroup ? 600 : 400 }}
                                        >
                                            New Group
                                        </button>
                                    </div>

                                    {isCreatingNewGroup ? (
                                        <input 
                                            className="input-field" 
                                            placeholder="New group name..." 
                                            value={newGroupName} 
                                            onChange={e => setNewGroupName(e.target.value)} 
                                        />
                                    ) : (
                                        <select 
                                            className="input-field" 
                                            value={selectedGroupId} 
                                            onChange={e => setSelectedGroupId(e.target.value)}
                                        >
                                            <option value="" disabled>Select a group...</option>
                                            {userGroups.map(g => (
                                                <option key={g.id} value={g.id}>{g.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                {/* Member Selection */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <label style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Select Trip Members</label>
                                        <button 
                                            onClick={() => {
                                                const realMembers = members.filter(m => !m.uid.startsWith('mock_')).map(m => m.uid);
                                                setSelectedMembers(selectedMembers.size === realMembers.length ? new Set() : new Set(realMembers));
                                            }}
                                            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            {selectedMembers.size === members.filter(m => !m.uid.startsWith('mock_')).length ? 'Deselect All' : 'Select All'}
                                        </button>
                                    </div>
                                    
                                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.5rem' }}>
                                        {members.filter(m => !m.uid.startsWith('mock_')).map(m => (
                                            <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0' }}>
                                                <input 
                                                    type="checkbox" 
                                                    id={`chk_${m.uid}`}
                                                    checked={selectedMembers.has(m.uid)}
                                                    onChange={(e) => {
                                                        const next = new Set(selectedMembers);
                                                        if (e.target.checked) next.add(m.uid);
                                                        else next.delete(m.uid);
                                                        setSelectedMembers(next);
                                                    }}
                                                    style={{ width: '1.2rem', height: '1.2rem', accentColor: 'var(--color-primary)' }}
                                                />
                                                <label htmlFor={`chk_${m.uid}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', flex: 1, margin: 0 }}>
                                                    <img src={m.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(m.name)}`} alt={m.name} style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} loading="lazy" />
                                                    <span style={{ fontSize: '0.9rem' }}>{m.fullName || m.name}</span>
                                                </label>
                                            </div>
                                        ))}
                                        {members.filter(m => !m.uid.startsWith('mock_')).length === 0 && (
                                            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>No registred members to select.</div>
                                        )}
                                    </div>
                                </div>

                                <button 
                                    className="btn btn-primary" 
                                    onClick={handleSaveGroupAssignment} 
                                    disabled={selectedMembers.size === 0 || (!isCreatingNewGroup && !selectedGroupId) || (isCreatingNewGroup && !newGroupName.trim()) || isSavingGroup}
                                    style={{ width: '100%', marginTop: '0.5rem' }}
                                >
                                    {isSavingGroup ? 'Saving...' : `Add ${selectedMembers.size} Member${selectedMembers.size !== 1 ? 's' : ''}`}
                                </button>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
