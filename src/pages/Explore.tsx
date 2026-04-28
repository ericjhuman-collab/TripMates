import React, { useEffect, useState } from 'react';
import { useAuth, type AppUser } from '../context/AuthContext';
import { db } from '../services/firebase';
import { collection, getDocs, doc, updateDoc, arrayUnion, arrayRemove, query, where } from 'firebase/firestore';
import { Bookmark, BookmarkCheck, MapPin, Filter } from 'lucide-react';
import type { Trip } from '../context/TripContext';
import type { Activity } from '../services/activities';
import { CustomSelect } from '../components/CustomSelect';
import { Spinner } from '../components/Spinner';
import styles from './Explore.module.css';
import { useToast } from '../components/Toast';

interface FeedPost {
    trip: Trip;
    author: AppUser | null;
    activities: Activity[];
}

const getFlagForDestination = (destination: string): string => {
    const d = destination.toLowerCase();
    if (d.includes('paris') || d.includes('france')) return '🇫🇷';
    if (d.includes('roma') || d.includes('rome') || d.includes('italy') || d.includes('milano')) return '🇮🇹';
    if (d.includes('london') || d.includes('uk') || d.includes('england')) return '🇬🇧';
    if (d.includes('tokyo') || d.includes('japan')) return '🇯🇵';
    if (d.includes('new york') || d.includes('usa') || d.includes('chicago')) return '🇺🇸';
    if (d.includes('berlin') || d.includes('germany')) return '🇩🇪';
    if (d.includes('barcelona') || d.includes('spain') || d.includes('madrid')) return '🇪🇸';
    return '🌍';
};

export const Explore: React.FC = () => {
    const toast = useToast();
    const { appUser } = useAuth();
    const [posts, setPosts] = useState<FeedPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTheme, setSelectedTheme] = useState<string>('All');
    const [myBucketlist, setMyBucketlist] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (appUser) {
            setMyBucketlist(appUser.bucketlist || []);
        }
    }, [appUser]);

    useEffect(() => {
        const fetchFeed = async () => {
            try {
                const [usersSnap, tripsSnap] = await Promise.all([
                    getDocs(collection(db, 'users')),
                    getDocs(collection(db, 'trips')),
                ]);
                const usersData = usersSnap.docs.reduce((acc, d) => {
                    acc[d.id] = { ...d.data(), uid: d.id } as AppUser;
                    return acc;
                }, {} as Record<string, AppUser>);

                const tripsData = tripsSnap.docs.map(tDoc => ({ ...tDoc.data(), id: tDoc.id } as Trip));

                // Activities live at the top-level /activities collection with a
                // tripId field — not in trips/{id}/activities. Per-trip queries
                // are still required because the activities-rule only allows
                // reads when the caller is a member of resource.data.tripId, so
                // a cross-trip query would be rejected. Run the per-trip queries
                // in parallel; rules silently filter out non-member trips by
                // erroring on the individual query (caught + logged below).
                const fetchPostsPromises = tripsData.map(async (trip) => {
                    const author = trip.createdBy ? usersData[trip.createdBy] : null;
                    let activities: Activity[] = [];
                    try {
                        const activitiesSnap = await getDocs(
                            query(collection(db, 'activities'), where('tripId', '==', trip.id))
                        );
                        activities = activitiesSnap.docs.map(aDoc => ({ ...aDoc.data(), id: aDoc.id } as Activity));
                    } catch {
                        // Permission denied for non-member trips is expected here.
                    }
                    return { trip, author, activities } as FeedPost;
                });

                const allPosts = await Promise.all(fetchPostsPromises);
                setPosts(allPosts.filter(p => p.author !== null).reverse());
            } catch (err) {
                console.error('Failed to fetch explore feed:', err);
            } finally {
                setLoading(false);
            }
        };

        if (appUser) {
            fetchFeed();
        }
    }, [appUser]);

    const handleToggleBucketlist = async (trip: Trip) => {
        if (!appUser || !trip.destination) return;
        setIsSaving({ ...isSaving, [trip.id]: true });
        const userRef = doc(db, 'users', appUser.uid);
        const destination = trip.destination;
        const isSaved = myBucketlist.includes(destination);
        try {
            if (isSaved) {
                await updateDoc(userRef, { bucketlist: arrayRemove(destination) });
                setMyBucketlist(prev => prev.filter(d => d !== destination));
            } else {
                await updateDoc(userRef, { bucketlist: arrayUnion(destination) });
                setMyBucketlist(prev => [...prev, destination]);
            }
        } catch (err) {
            console.error('Failed to update bucketlist:', err);
            toast.error('Failed to update bucketlist. Please try again.');
        } finally {
            setIsSaving({ ...isSaving, [trip.id]: false });
        }
    };

    const uniqueThemes = ['All', ...new Set(posts.map(p => p.trip.theme).filter(Boolean) as string[])];
    const filteredPosts = posts.filter(p => selectedTheme === 'All' || p.trip.theme === selectedTheme);

    return (
        <div className={`page-animate ${styles.page}`}>
            <div className={styles.header}>
                <h2 className={styles.title}>Explore</h2>
                <div className={styles.filterWrapper}>
                    <CustomSelect
                        value={selectedTheme}
                        onChange={setSelectedTheme}
                        className={styles.filterSelect}
                        options={uniqueThemes.map(theme => ({
                            value: theme,
                            label: theme
                        }))}
                    />
                    <Filter size={16} className={styles.filterIcon} />
                </div>
            </div>

            {loading ? (
                <Spinner label="Loading explore feed…" fullHeight />
            ) : filteredPosts.length === 0 ? (
                <div className={styles.emptyState}>
                    <p>No posts found for the selected theme.</p>
                </div>
            ) : (
                <div className={styles.feedList}>
                    {filteredPosts.map((post) => {
                        const { trip, author, activities } = post;
                        const isSaved = myBucketlist.includes(trip.destination || '');

                        return (
                            <div key={trip.id} className={`card animate-fade-in ${styles.postCard}`}>
                                {/* Author Header */}
                                <div className={styles.postHeader}>
                                    <div className={styles.authorInfo}>
                                        <img
                                            src={author?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${author?.name}`}
                                            alt={author?.name}
                                            className={styles.authorAvatar} loading="lazy" />
                                        <div>
                                            <div className={styles.authorName}>{author?.name}</div>
                                            <div className={styles.authorDate}>
                                                Explored {trip.startDate ? new Date(trip.startDate).toLocaleDateString() : 'Unknown Date'}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleToggleBucketlist(trip)}
                                        disabled={isSaving[trip.id] || !trip.destination}
                                        className={styles.bookmarkBtn}
                                        title={isSaved ? 'Remove from Bucketlist' : 'Save to Bucketlist'}
                                    >
                                        {isSaved
                                            ? <BookmarkCheck size={24} color="var(--color-primary)" />
                                            : <Bookmark size={24} color="var(--color-text-muted)" />
                                        }
                                    </button>
                                </div>

                                {/* Post Visual */}
                                <div className={styles.destinationVisual}>
                                    {trip.imageUrl && (
                                        <img src={trip.imageUrl} alt={trip.destination || trip.name} className={styles.destinationImage} loading="lazy" />
                                    )}
                                    <div className={`${styles.destinationOverlay} ${trip.imageUrl ? styles.destinationOverlayDark : styles.destinationOverlayLight}`}>
                                        <div className={styles.destinationFlag}>
                                            {getFlagForDestination(trip.destination || '')}
                                        </div>
                                        <h3 className={`${styles.destinationName} ${trip.imageUrl ? styles.destinationNameDark : styles.destinationNameLight}`}>
                                            {trip.destination || trip.name}
                                        </h3>
                                        <div className={styles.destinationThemeBadge}>
                                            {trip.theme || 'Exploration'}
                                        </div>
                                    </div>
                                </div>

                                {/* Activities Carousel */}
                                {activities.length > 0 ? (
                                    <div className={styles.activitiesSection}>
                                        <div className={styles.activitiesSectionHeader}>
                                            <MapPin size={16} color="var(--color-text-muted)" />
                                            <span className={styles.activitiesSectionLabel}>Trip Activities ({activities.length})</span>
                                        </div>
                                        <div className={styles.carousel}>
                                            {activities.map(activity => (
                                                <div key={activity.id} className={styles.activityCard}>
                                                    <div>
                                                        <div className={styles.activityCardHeader}>
                                                            <h4 className={styles.activityTitle}>{activity.title}</h4>
                                                            <div className={styles.activityCategory}>{activity.category}</div>
                                                        </div>
                                                        <p className={styles.activityDesc}>
                                                            {activity.description || 'No description provided.'}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className={styles.noActivities}>
                                        No activities shared for this trip yet.
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
