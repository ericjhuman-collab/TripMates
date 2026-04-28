import React, { useState, useEffect } from 'react';
import { useAuth, type AppUser } from '../context/AuthContext';
import { fetchPopulatedUsers, followUser, unfollowUser } from '../services/network';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { UserPlus, UserMinus, Search, Loader2 } from 'lucide-react';
import styles from './Profile.module.css';
import { useToast } from '../components/Toast';

export const Network: React.FC = () => {
    const toast = useToast();
    const { appUser } = useAuth();
    const [activeTab, setActiveTab] = useState<'following' | 'followers'>('following');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<AppUser[]>([]);
    
    const [followingUsers, setFollowingUsers] = useState<AppUser[]>([]);
    const [followersUsers, setFollowersUsers] = useState<AppUser[]>([]);
    const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);

    // Using basic local state replication for optimism
    const [localFollowing, setLocalFollowing] = useState<string[]>(appUser?.following || []);

    useEffect(() => {
        setLocalFollowing(appUser?.following || []);
    }, [appUser?.following]);

    useEffect(() => {
        const loadProfiles = async () => {
            if (!appUser) return;
            setIsLoadingProfiles(true);
            try {
                if (activeTab === 'following') {
                    const users = await fetchPopulatedUsers(appUser.following || []);
                    setFollowingUsers(users);
                } else {
                    const users = await fetchPopulatedUsers(appUser.followers || []);
                    setFollowersUsers(users);
                }
            } catch (err) {
                console.error("Failed to load network profiles", err);
            } finally {
                setIsLoadingProfiles(false);
            }
        };
        loadProfiles();
    }, [activeTab, appUser]);

    useEffect(() => {
        const searchTimer = setTimeout(async () => {
            if (searchQuery.trim().length >= 2) {
                setIsSearching(true);
                try {
                    // Very simple prefix search using fullname or name for demonstration
                    // Firestore string prefix matching:
                    const term = searchQuery.trim();
                    const endTerm = term + '\uf8ff';
                    const qName = query(collection(db, 'users'), where('name', '>=', term), where('name', '<=', endTerm), limit(10));
                    const qFullName = query(collection(db, 'users'), where('fullName', '>=', term), where('fullName', '<=', endTerm), limit(10));
                    
                    const [snapName, snapFull] = await Promise.all([getDocs(qName), getDocs(qFullName)]);
                    const resultsParams = new Map<string, AppUser>();
                    
                    [...snapName.docs, ...snapFull.docs].forEach(doc => {
                        const data = doc.data() as AppUser;
                        if (data.uid !== appUser?.uid) {
                            resultsParams.set(data.uid, data);
                        }
                    });
                    
                    setSearchResults(Array.from(resultsParams.values()));
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
    }, [searchQuery, appUser]);

    const handleToggleFollow = async (targetUid: string) => {
        if (!appUser) return;
        
        const isFollowingTarget = localFollowing.includes(targetUid);
        const nextFollowing = isFollowingTarget 
            ? localFollowing.filter(id => id !== targetUid)
            : [...localFollowing, targetUid];
            
        // Optimistic UI
        setLocalFollowing(nextFollowing);
        
        try {
            if (isFollowingTarget) {
                await unfollowUser(appUser.uid, targetUid);
            } else {
                await followUser(appUser.uid, targetUid);
            }
        } catch (e) {
            console.error("Follow error", e);
            // Revert on fail
            setLocalFollowing(localFollowing);
            toast.error("Failed to update follow status.");
        }
    };

    const renderUserList = (users: AppUser[], emptyMessage: string) => {
        if (isLoadingProfiles) {
            return <div style={{ textAlign: 'center', padding: '2rem' }}><Loader2 className="animate-spin" /></div>;
        }
        
        if (users.length === 0) {
            return <p style={{ textAlign: 'center', margin: '2rem 0', color: 'var(--color-text-muted)' }}>{emptyMessage}</p>;
        }

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                {users.map(u => {
                    const isFollowed = localFollowing.includes(u.uid);
                    return (
                        <div key={u.uid} className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.85rem' }}>
                            <img src={u.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.name)}`} alt={u.name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} loading="lazy" />
                            <div style={{ flex: 1 }}>
                                <h4 style={{ margin: 0, fontSize: '1rem' }}>{u.fullName || u.name}</h4>
                                {u.fullName && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>@{u.name}</p>}
                            </div>
                            <button 
                                className="btn" 
                                style={{ 
                                    padding: '0.5rem 1rem', 
                                    fontSize: '0.85rem', 
                                    background: isFollowed ? 'var(--color-surface)' : 'var(--color-primary)',
                                    color: isFollowed ? 'var(--color-primary-dark)' : '#fff',
                                    border: isFollowed ? '1px solid var(--color-border)' : 'none'
                                }}
                                onClick={() => handleToggleFollow(u.uid)}
                            >
                                {isFollowed ? <UserMinus size={16} /> : <UserPlus size={16} />}
                                {isFollowed ? 'Unfollow' : 'Follow Back'}
                            </button>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className={styles.scrollContainer} style={{ padding: '0 1.25rem 2rem' }}>
            <div className={styles.settingsHeader} style={{ marginBottom: '1.5rem', marginLeft: '-1.25rem' }}>
                <h2 className={styles.settingsTitle} style={{ paddingLeft: '1rem' }}>My Network</h2>
            </div>

            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input 
                    className="input-field"
                    style={{ paddingLeft: '2.75rem' }}
                    placeholder="Find friends to follow..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>

            {searchQuery.trim().length >= 2 ? (
                <div>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Search Results</h3>
                    {isSearching ? (
                        <div style={{ textAlign: 'center', padding: '1rem' }}><Loader2 className="animate-spin" /></div>
                    ) : (
                        renderUserList(searchResults, "No users found.")
                    )}
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', background: 'var(--color-bg-card)', padding: '0.35rem', borderRadius: 999 }}>
                        <button 
                            style={{ flex: 1, padding: '0.6rem', borderRadius: 999, border: 'none', background: activeTab === 'following' ? 'var(--color-bg-primary)' : 'transparent', color: activeTab === 'following' ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: 600, boxShadow: activeTab === 'following' ? 'var(--shadow-sm)' : 'none', cursor: 'pointer' }}
                            onClick={() => setActiveTab('following')}
                        >
                            Following ({localFollowing.length})
                        </button>
                        <button 
                            style={{ flex: 1, padding: '0.6rem', borderRadius: 999, border: 'none', background: activeTab === 'followers' ? 'var(--color-bg-primary)' : 'transparent', color: activeTab === 'followers' ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: 600, boxShadow: activeTab === 'followers' ? 'var(--shadow-sm)' : 'none', cursor: 'pointer' }}
                            onClick={() => setActiveTab('followers')}
                        >
                            Followers ({appUser?.followers?.length || 0})
                        </button>
                    </div>

                    {activeTab === 'following' 
                        ? renderUserList(followingUsers, "You aren't following anyone yet.")
                        : renderUserList(followersUsers, "You don't have any followers yet.")
                    }
                </>
            )}
        </div>
    );
};
