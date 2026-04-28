import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { format, addDays, subDays, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameDay, startOfWeek, endOfWeek, subWeeks, addWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight, Menu, MapPin, Clock, Calendar, List, CalendarDays, CalendarRange, Grid3X3, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTrip, categorizeTrips, type TripCategory } from '../context/TripContext';
import { getActivitiesByDay, getAllActivities, type Activity } from '../services/activities';
import { createPortal } from 'react-dom';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { AppUser } from '../context/AuthContext';
import styles from './Home.module.css';

// Map view bundles leaflet + Google Maps loader; lazy-load it so the
// schedule view (the default) doesn't pay that cost.
const MapPage = lazy(() => import('./MapPage').then(m => ({ default: m.MapPage })));
const Members = lazy(() => import('./Members').then(m => ({ default: m.Members })));

type CalendarViewMode = 'schedule' | 'day' | '3day' | 'week' | 'month';
type ViewMode = CalendarViewMode | 'map' | 'leaderboard' | 'members';

export const Home: React.FC = () => {
    const { effectiveRole, currentUser } = useAuth();
    const { activeTrip, userTrips, switchTrip } = useTrip();
    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>('day');
    const [showViewMenu, setShowViewMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [activities, setActivities] = useState<Activity[]>([]);
    const [allActivities, setAllActivities] = useState<Activity[]>([]);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [weekSelectedDate, setWeekSelectedDate] = useState<Date | null>(null);

    const isAppAdmin = effectiveRole === 'admin';
    const isTripAdmin = activeTrip?.adminIds?.includes(currentUser?.uid || '') || activeTrip?.createdBy === currentUser?.uid;
    const isAdmin = isAppAdmin || isTripAdmin;
    const dayString = format(currentDate, 'yyyy-MM-dd');
    const tripDayNumber = activeTrip?.startDate ? differenceInDays(currentDate, new Date(activeTrip.startDate)) + 1 : 0;

    const activeMembers = activeTrip?.members || [];
    const validMembers = users.filter(m => activeMembers.includes(m.uid));
    const mockUids = activeMembers.filter(m => m.startsWith('mock_'));
    const mockUsers = mockUids.map(uid => ({
        uid,
        name: uid.replace('mock_', ''),
        fullName: uid.replace('mock_', ''),
        email: '',
        role: 'user',
        hasAgreed: true,
        phoneNumber: '+15551234567',
        sharePhoneNumber: true
    } as AppUser));
    const allTripUsers = [...validMembers, ...mockUsers];

    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
        Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

    const fetchActivities = useCallback(async () => {
        if (!activeTrip) return;
        setLoading(true);
        try {
            const data = await withTimeout(getActivitiesByDay(activeTrip.id, dayString), 8000);
            setActivities(data);
        } catch (e) {
            console.warn('Activities fetch timed out or failed:', e);
            setActivities([]);
        } finally {
            setLoading(false);
        }
    }, [activeTrip, dayString]);

    const fetchAllActivities = useCallback(async () => {
        if (!activeTrip) return;
        try {
            const data = await withTimeout(getAllActivities(activeTrip.id), 8000);
            setAllActivities(data);
        } catch (e) {
            console.warn('All-activities fetch timed out or failed:', e);
        }
    }, [activeTrip]);

    const fetchUsers = async () => {
        try {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            setUsers(usersSnapshot.docs.map(d => ({ ...d.data(), uid: d.id } as AppUser)));
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (activeTrip?.startDate) {
            const tripStart = new Date(activeTrip.startDate);
            tripStart.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (activeTrip.endDate) {
                const tripEnd = new Date(activeTrip.endDate);
                tripEnd.setHours(23, 59, 59, 999);
                if (today >= tripStart && today <= tripEnd) {
                    setCurrentDate(today);
                } else {
                    setCurrentDate(tripStart);
                }
            } else {
                setCurrentDate(today >= tripStart ? today : tripStart);
            }
        }
    }, [activeTrip?.id, activeTrip?.startDate, activeTrip?.endDate]);

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        fetchAllActivities();
    }, [fetchAllActivities]);

    useEffect(() => {
        if (viewMode === 'day' || viewMode === 'schedule' || viewMode === '3day') {
            fetchActivities();
        }
    }, [fetchActivities, viewMode]);

    // Close hamburger menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (showViewMenu && menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowViewMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showViewMenu]);

    const handlePrevDay = () => setCurrentDate(prev => subDays(prev, 1));
    const handleNextDay = () => setCurrentDate(prev => addDays(prev, 1));

    const renderCalendarView = () => {
        const startDate = viewMode === 'week' ? startOfWeek(currentDate, { weekStartsOn: 1 }) : startOfMonth(currentDate);
        const endDate = viewMode === 'week' ? endOfWeek(currentDate, { weekStartsOn: 1 }) : endOfMonth(currentDate);
        const days = eachDayOfInterval({ start: startDate, end: endDate });

        return (
            <div className={`card glass-panel animate-fade-in ${styles.calendarPanel}`}>
                <div className={styles.calendarHeader}>
                    <button
                        onClick={() => setCurrentDate(viewMode === 'week' ? subWeeks(currentDate, 1) : subMonths(currentDate, 1))}
                        className="btn-icon"
                        title={viewMode === 'week' ? 'Previous week' : 'Previous month'}
                        aria-label={viewMode === 'week' ? 'Previous week' : 'Previous month'}
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <h3 className={styles.calendarTitle}>
                        {viewMode === 'week'
                            ? `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`
                            : format(currentDate, 'MMMM yyyy')}
                    </h3>
                    <button
                        onClick={() => setCurrentDate(viewMode === 'week' ? addWeeks(currentDate, 1) : addMonths(currentDate, 1))}
                        className="btn-icon"
                        title={viewMode === 'week' ? 'Next week' : 'Next month'}
                        aria-label={viewMode === 'week' ? 'Next week' : 'Next month'}
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>

                <div className={styles.calendarDayNames}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                        <div key={day}>{day}</div>
                    ))}
                </div>

                <div className={styles.calendarGrid}>
                    {viewMode === 'month' && Array.from({ length: (startDate.getDay() + 6) % 7 }).map((_, i) => <div key={`empty-${i}`} />)}
                    {days.map(day => {
                        const isToday = isSameDay(day, new Date());
                        const isSelected = isSameDay(day, currentDate);
                        const isWeekSelected = weekSelectedDate && isSameDay(day, weekSelectedDate);
                        const hasActivities = !!allActivities.find(a => a.day === format(day, 'yyyy-MM-dd'));

                        let dayClass = styles.calendarDay;
                        if (isSelected) dayClass += ` ${styles.calendarDaySelected}`;
                        else if (isWeekSelected) dayClass += ` ${styles.calendarDayWeekSelected}`;
                        else if (isToday) dayClass += ` ${styles.calendarDayToday}`;

                        return (
                            <button
                                key={day.toISOString()}
                                onClick={() => {
                                    if (viewMode === 'week') {
                                        // In week view: select date and show activities below
                                        setCurrentDate(day);
                                        setWeekSelectedDate(prev => (prev && isSameDay(prev, day)) ? null : day);
                                    } else {
                                        // In month view: switch to day view
                                        setCurrentDate(day);
                                        setViewMode('day');
                                    }
                                }}
                                className={dayClass}
                                title={format(day, 'MMMM d, yyyy')}
                            >
                                <span>{format(day, 'd')}</span>
                                {hasActivities && (
                                    <div className={`${styles.calendarDayDot} ${(isSelected || isWeekSelected) ? styles.calendarDayDotSelected : ''}`} />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    const calendarViewLabels: Record<CalendarViewMode, string> = {
        schedule: 'Schedule', day: 'Day', '3day': '3 Day', week: 'Week', month: 'Month'
    };
    const calendarViewIcons: Record<CalendarViewMode, React.ReactNode> = {
        schedule: <List size={18} />,
        day: <Calendar size={18} />,
        '3day': <CalendarDays size={18} />,
        week: <CalendarRange size={18} />,
        month: <Grid3X3 size={18} />,
    };

    const activeCalendarLabel = calendarViewLabels[calendarViewMode];
    const isCalendarView = (['schedule', 'day', '3day', 'week', 'month'] as CalendarViewMode[]).includes(viewMode as CalendarViewMode);

    const handleCalendarViewChange = (mode: CalendarViewMode) => {
        setCalendarViewMode(mode);
        setViewMode(mode);
        setShowViewMenu(false);
    };

    const handleSwitchTrip = async (tripId: string) => {
        setShowViewMenu(false);
        await switchTrip(tripId);
    };

    const groupedTrips = categorizeTrips(userTrips);
    const categoryLabels: Record<TripCategory, string> = {
        current: 'Current', future: 'Future', past: 'Past', bucketlist: 'Bucketlist'
    };
    const categoryOrder: TripCategory[] = ['current', 'future', 'past', 'bucketlist'];

    // Trip filter for side menu
    const [tripFilter, setTripFilter] = useState<'all' | TripCategory>('all');
    const filteredTrips = tripFilter === 'all'
        ? userTrips
        : groupedTrips[tripFilter];

    const refreshData = () => {
        fetchActivities();
        fetchAllActivities();
    };

    const voteCounts: Record<string, number> = {};
    allTripUsers.forEach(u => voteCounts[u.uid] = 0);

    const totalTripMembers = validMembers.length;
    allActivities.forEach(activity => {
        const totalVotes = activity.votes ? Object.keys(activity.votes).length : 0;
        const isVotingClosed = activity.votingClosed || (totalTripMembers > 0 && totalVotes >= totalTripMembers);
        
        if (activity.votes && isVotingClosed) {
            Object.values(activity.votes).forEach(votedUserId => {
                if (voteCounts[votedUserId] !== undefined) {
                    voteCounts[votedUserId]++;
                } else {
                    voteCounts[votedUserId] = 1;
                }
            });
        }
    });

    const leaderboardUsers = [...allTripUsers]
        .map(u => ({ ...u, votes: voteCounts[u.uid] || 0 }))
        .sort((a, b) => b.votes - a.votes);

    return (
        <div className={`animate-fade-in ${styles.pageWrapper}`}>
            {/* Hamburger menu overlay + slide-out panel — rendered via portal to escape z-index/overflow */}
            {showViewMenu && createPortal(
                <div className={styles.menuOverlay} onClick={() => setShowViewMenu(false)}>
                    <div
                        ref={menuRef}
                        className={styles.menuPanel}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className={styles.menuHeader}>
                            <span className={styles.menuHeaderTitle}>View</span>
                        </div>
                        <div className={styles.menuItems}>
                            {(['schedule', 'day', '3day', 'week', 'month'] as CalendarViewMode[]).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => handleCalendarViewChange(mode)}
                                    className={`${styles.menuItem} ${calendarViewMode === mode ? styles.menuItemActive : ''}`}
                                >
                                    <span className={styles.menuItemIcon}>{calendarViewIcons[mode]}</span>
                                    <span className={styles.menuItemLabel}>{calendarViewLabels[mode]}</span>
                                </button>
                            ))}
                        </div>

                        {/* Trips Section */}
                        <div className={styles.menuDivider} />
                        <div className={styles.menuTripsHeader}>
                            <span className={styles.menuHeaderTitle}>My Trips</span>
                            <span className={styles.menuSortLabel}>Sort By</span>
                        </div>
                        <div className={styles.menuFilterChips}>
                            {(['all', ...categoryOrder] as const).map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setTripFilter(cat)}
                                    className={`${styles.menuFilterChip} ${tripFilter === cat ? styles.menuFilterChipActive : ''}`}
                                >
                                    {cat === 'all' ? 'All' : categoryLabels[cat as TripCategory]}
                                </button>
                            ))}
                        </div>
                        <div className={styles.menuTrips}>
                            {filteredTrips.length === 0 ? (
                                <p className={styles.menuTripsEmpty}>No trips in this category</p>
                            ) : (
                                filteredTrips.map(trip => (
                                    <button
                                        key={trip.id}
                                        onClick={() => handleSwitchTrip(trip.id)}
                                        className={`${styles.menuItem} ${activeTrip?.id === trip.id ? styles.menuItemActive : ''}`}
                                    >
                                        <span className={styles.menuTripInfo}>
                                            <span className={styles.menuItemLabel}>{trip.name || trip.destination || trip.id}</span>
                                            {trip.destination && (
                                                <span className={styles.menuTripDest}>{trip.destination}</span>
                                            )}
                                        </span>
                                        <Check size={16} className={styles.menuItemCheck} style={{ visibility: activeTrip?.id === trip.id ? 'visible' : 'hidden' }} />
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <div className={styles.navPill}>
                {/* Hamburger + Calendar View Label */}
                <div className={styles.navCalendarGroup}>
                    <button
                        onClick={() => setShowViewMenu(true)}
                        className={styles.hamburgerBtn}
                        title="Switch calendar view"
                    >
                        <Menu size={18} />
                    </button>
                    <span
                        className={`${styles.calendarViewLabel} ${isCalendarView ? styles.calendarViewLabelActive : ''}`}
                        onClick={() => {
                            setViewMode(calendarViewMode);
                        }}
                    >
                        {activeCalendarLabel}
                    </span>
                </div>

                {/* Other standard tabs */}
                {(['map', 'leaderboard', 'members'] as ViewMode[]).map(mode => {
                    const labels: Record<string, string> = { map: 'Map', leaderboard: 'Leaderboard', members: 'Members' };
                    return (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className={`${styles.navTab} ${viewMode === mode ? styles.navTabActive : ''}`}
                        >
                            {labels[mode]}
                        </button>
                    );
                })}
            </div>

            {viewMode === 'map' && (
                <div className={styles.mapWrapper}>
                    <div className={styles.mapInner}>
                        <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#1e3a5f', opacity: 0.6 }}>Loading map…</div>}>
                            <MapPage
                                currentDate={currentDate}
                                onPrevDay={handlePrevDay}
                                onNextDay={handleNextDay}
                                activities={allActivities}
                            />
                        </Suspense>
                    </div>
                </div>
            )}

            {['month', 'week'].includes(viewMode) && renderCalendarView()}

            {/* Week view: activities list for selected day */}
            {viewMode === 'week' && weekSelectedDate && (() => {
                const selStr = format(weekSelectedDate, 'yyyy-MM-dd');
                const dayActs = allActivities.filter(a => a.day === selStr)
                    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                return (
                    <div className={`animate-fade-in ${styles.weekDayPanel}`}>
                        <div className={styles.weekDayPanelHeader}>
                            <span className={styles.weekDayPanelTitle}>
                                {format(weekSelectedDate, 'EEEE, MMM d')}
                            </span>
                            <button
                                className={styles.weekDayPanelClose}
                                onClick={() => setWeekSelectedDate(null)}
                                title="Close"
                            >✕</button>
                        </div>
                        {dayActs.length === 0 ? (
                            <p className={styles.weekDayPanelEmpty}>No activities this day.</p>
                        ) : (
                            <div className={styles.weekDayPanelList}>
                                {dayActs.map(act => (
                                    <div key={act.id} className={`card ${styles.weekDayActivity}`}>
                                        <div className={styles.weekDayActivityEmoji}>{act.mapIcon || '📍'}</div>
                                        <div className={styles.weekDayActivityBody}>
                                            <div className={styles.weekDayActivityTitle}>{act.title}</div>
                                            {act.time && (
                                                <div className={styles.weekDayActivityMeta}>
                                                    <Clock size={12} />
                                                    <span>{act.time}{act.endTime ? ` – ${act.endTime}` : ''}</span>
                                                    {act.locationName && <><MapPin size={12} /><span>{act.locationName}</span></>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })()}

            {viewMode === 'schedule' && (
                <div className="animate-fade-in">
                    <div className={styles.scheduleSection}>
                        <div className={styles.dayHeader}>
                            <button onClick={handlePrevDay} className="btn-icon" title="Previous day" aria-label="Previous day">
                                <ChevronLeft size={20} />
                            </button>
                            <div className={styles.dayHeaderCenter}>
                                <h2 className={styles.dayTitle}>{format(currentDate, 'EEEE')}</h2>
                                <p className={styles.daySubtitle}>{format(currentDate, 'MMMM d, yyyy')}</p>
                            </div>
                            <button onClick={handleNextDay} className="btn-icon" title="Next day" aria-label="Next day">
                                <ChevronRight size={20} />
                            </button>
                        </div>
                        {loading ? (
                            <p className={styles.loadingText}>Loading activities...</p>
                        ) : activities.length === 0 ? (
                            <div className={`card glass-panel ${styles.emptyCard}`}>
                                <List size={48} className={styles.emptyIcon} />
                                <p className={styles.emptyText}>No activities in schedule.</p>
                            </div>
                        ) : (
                            <div className={styles.scheduleList}>
                                {activities.map(act => (
                                    <div key={act.id} className={`card glass-panel ${styles.scheduleItem}`}>
                                        <div className={styles.scheduleTime}>
                                            <span className={styles.scheduleTimeText}>{act.time}</span>
                                            {act.endTime && <span className={styles.scheduleTimeDash}>–</span>}
                                            {act.endTime && <span className={styles.scheduleTimeText}>{act.endTime}</span>}
                                        </div>
                                        <div className={styles.scheduleLine} />
                                        <div className={styles.scheduleContent}>
                                            <h4 className={styles.scheduleTitle}>{act.title}</h4>
                                            {act.locationName && (
                                                <div className={styles.scheduleMeta}>
                                                    <MapPin size={14} />
                                                    <span>{act.locationName}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {viewMode === '3day' && (
                <div className="animate-fade-in">
                    <div className={styles.dayHeader}>
                        <button onClick={() => setCurrentDate(prev => subDays(prev, 3))} className="btn-icon" title="Previous 3 days">
                            <ChevronLeft size={20} />
                        </button>
                        <div className={styles.dayHeaderCenter}>
                            <h2 className={styles.dayTitle}>
                                {format(currentDate, 'MMM d')} – {format(addDays(currentDate, 2), 'MMM d')}
                            </h2>
                        </div>
                        <button onClick={() => setCurrentDate(prev => addDays(prev, 3))} className="btn-icon" title="Next 3 days">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                    <div className={styles.threeDayGrid}>
                        {[0, 1, 2].map(offset => {
                            const day = addDays(currentDate, offset);
                            const dayStr = format(day, 'yyyy-MM-dd');
                            const dayActivities = allActivities.filter(a => a.day === dayStr);
                            const isToday = isSameDay(day, new Date());
                            return (
                                <div key={offset} className={`card glass-panel ${styles.threeDayColumn}`}>
                                    <div className={`${styles.threeDayHeader} ${isToday ? styles.threeDayHeaderToday : ''}`}>
                                        <span className={styles.threeDayName}>{format(day, 'EEE')}</span>
                                        <span className={`${styles.threeDayDate} ${isToday ? styles.threeDayDateToday : ''}`}>{format(day, 'd')}</span>
                                    </div>
                                    <div className={styles.threeDayActivities}>
                                        {dayActivities.length === 0 ? (
                                            <p className={styles.threeDayEmpty}>No activities</p>
                                        ) : (
                                            dayActivities.map(act => (
                                                <div key={act.id} className={styles.threeDayActivity}>
                                                    <span className={styles.threeDayActivityTime}>{act.time}</span>
                                                    <span className={styles.threeDayActivityTitle}>{act.title}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {viewMode === 'day' && (
                <div className="animate-fade-in">
                    <div className={styles.dayHeader}>
                        <button onClick={handlePrevDay} className="btn-icon" title="Previous day" aria-label="Previous day">
                            <ChevronLeft size={20} />
                        </button>
                        <div className={styles.dayHeaderCenter}>
                            <h2 className={styles.dayTitle}>{format(currentDate, 'EEEE')}</h2>
                            <p className={styles.daySubtitle}>{format(currentDate, 'MMMM d, yyyy')}</p>
                            {tripDayNumber > 0 && (
                                <p className={styles.dayTripNumber}>Day {tripDayNumber} of Trip</p>
                            )}
                        </div>
                        <button onClick={handleNextDay} className="btn-icon" title="Next day" aria-label="Next day">
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    {loading ? (
                        <p className={styles.loadingText}>Loading activities...</p>
                    ) : activities.length === 0 ? (
                        <div className={`card glass-panel ${styles.emptyCard}`}>
                            <Calendar size={48} className={styles.emptyIcon} />
                            <p className={styles.emptyText}>No activities planned for this day.</p>
                        </div>
                    ) : (
                        <div className={styles.activityList}>
                            {activities.map(act => (
                                <ActivityCard 
                                    key={act.id} 
                                    activity={act} 
                                    isAdmin={isAdmin} 
                                    users={allTripUsers} 
                                    onGoToLeaderboard={() => setViewMode('leaderboard')}
                                    onUpdate={refreshData}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {viewMode === 'leaderboard' && (
                <div className={`animate-fade-in ${styles.leaderboardSection}`}>
                    <div className={styles.leaderboardHeader}>
                        <h2 className={styles.leaderboardTitle}>Leaderboard</h2>
                    </div>

                    <p className={styles.leaderboardDesc}>
                        Votes are tallied from every completed activity!
                    </p>

                    <div className={styles.leaderboardList}>
                        {leaderboardUsers.map((u, index) => (
                            <div key={u.uid} className={`card glass-panel ${styles.leaderboardRow}`}>
                                <div className={styles.leaderboardRowLeft}>
                                    <span className={styles.leaderboardRank}>#{index + 1}</span>
                                    <img
                                        src={u.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.name}`}
                                        alt={u.name}
                                        className={styles.leaderboardAvatar} loading="lazy" />
                                    <span className={styles.leaderboardName}>{u.fullName || u.name}</span>
                                </div>
                                <div className={styles.leaderboardVotes}>{u.votes} vote{u.votes !== 1 ? 's' : ''}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {viewMode === 'members' && (
                <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#1e3a5f', opacity: 0.6 }}>Loading…</div>}>
                    <Members />
                </Suspense>
            )}
        </div>
    );
};

const ActivityCard: React.FC<{ activity: Activity, isAdmin: boolean, users: AppUser[], onGoToLeaderboard: () => void, onUpdate?: () => void }> = ({ activity, isAdmin, users, onGoToLeaderboard, onUpdate }) => {
    const [showVoteModal, setShowVoteModal] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const activityDate = new Date(`${activity.day}T${activity.time}:00`);
    const isPast = currentTime > activityDate;
    const totalVotes = Object.keys(activity.votes || {}).length;
    const totalMembers = users.length;
    const isVotingClosed = activity.votingClosed || (totalMembers > 0 && totalVotes >= totalMembers);

    const getTimeRemaining = () => {
        const diff = activityDate.getTime() - currentTime.getTime();
        if (diff <= 0) return '00:00:00:00';
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / 1000 / 60) % 60);
        const seconds = Math.floor((diff / 1000) % 60);
        return `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    const renderVoteBadge = () => {
        if (!activity.enableVoting) return null;
        if (!isPast) return <div className={styles.voteBadgePending}>Voting opens {getTimeRemaining()}</div>;
        if (isVotingClosed) return <div className={styles.voteBadgeClosed}>✓ Voting closed</div>;
        return <div className={styles.voteBadgeOpen}>🟢 Voting open</div>;
    };


    return (
        <div className={`card relative transition-transform ${activity.enableVoting ? 'cursor-pointer' : ''} ${styles.activityCard}`} onClick={() => activity.enableVoting && setShowVoteModal(true)}>
            <div className={styles.activityCardBody}>
                <h3 className={styles.activityTitle}>{activity.title}</h3>
                <p className={styles.activityDesc}>{activity.description}</p>
                <div className={styles.activityMeta}>
                    <div className={styles.activityMetaItem}>
                        <Clock size={16} />
                        <span>{activity.time}{activity.endTime ? ` - ${activity.endTime}` : ''}</span>
                    </div>
                    <div className={styles.activityMetaItem}>
                        <MapPin size={16} />
                        <span>{activity.locationName || 'Unknown Location'}</span>
                    </div>
                </div>
            </div>

            <div className={styles.activityCardRight}>
                {renderVoteBadge()}
            </div>

            {showVoteModal && <VotingModal activity={activity} users={users} isAdmin={isAdmin} onGoToLeaderboard={onGoToLeaderboard} onUpdate={onUpdate} onClose={(e) => { e.stopPropagation(); setShowVoteModal(false); }} />}
        </div>
    );
};

const VotingModal: React.FC<{ activity: Activity, users: AppUser[], isAdmin?: boolean, onGoToLeaderboard?: () => void, onUpdate?: () => void, onClose: (e: React.MouseEvent) => void }> = ({ activity, users, isAdmin, onGoToLeaderboard, onUpdate, onClose }) => {
    const { appUser } = useAuth();
    const [saving, setSaving] = useState(false);
    const [localClosed, setLocalClosed] = useState(false);
    const [showForceConfirm, setShowForceConfirm] = useState(false);

    const now = new Date();
    const activityDate = new Date(`${activity.day}T${activity.time}:00`);
    const isPast = now > activityDate;
    const totalVotes = Object.keys(activity.votes || {}).length;
    const totalMembers = users.length;
    const isVotingClosed = localClosed || activity.votingClosed || (totalMembers > 0 && totalVotes >= totalMembers);
    const myVote = appUser?.uid ? activity.votes?.[appUser.uid] : null;

    const handleVote = async (targetUserId: string) => {
        if (!appUser || !activity.id || saving) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'activities', activity.id), {
                [`votes.${appUser.uid}`]: targetUserId
            });
            if (onUpdate) onUpdate();
            onClose({ stopPropagation: () => { } } as React.MouseEvent);
        } catch (e) {
            console.error('Failed to cast vote', e);
            alert('Failed to cast vote.');
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="modal-backdrop" onClick={onClose}>
            <div
                className={`card animate-fade-in ${styles.modalCard}`}
                onClick={e => e.stopPropagation()}
            >
                <div className={styles.modalHeader}>
                    <h2 className={styles.modalTitle}>{activity.voteQuestion || 'Vote for Activity'}</h2>
                    <button onClick={onClose} className={styles.modalCloseBtn} title="Close">&times;</button>
                </div>

                {isPast && !isVotingClosed && isAdmin && (
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowForceConfirm(true);
                        }}
                        disabled={saving}
                        className={styles.btnForceClose}
                    >
                        Force-Close Voting Now
                    </button>
                )}

                {!isPast ? (
                    <div className={styles.votingNotOpen}>
                        <p className={styles.votingNotOpenText}>Voting hasn't opened yet!</p>
                        <p className={styles.votingNotOpenDate}>Come back on {activity.day} after {activity.time}</p>
                    </div>
                ) : isVotingClosed ? (
                    <div>
                        <p className={styles.votingResults}>Voting is closed! Here are the results:</p>
                        <div className={styles.votingResultList}>
                            {Object.entries(activity.votes || {}).map(([voterId, votedForId]) => {
                                const voter = users.find(u => u.uid === voterId);
                                const votedFor = users.find(u => u.uid === votedForId);
                                return (
                                    <div key={voterId} className={styles.voteResultRow}>
                                        <img src={voter?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${voter?.name}`} alt={voter?.name} className={styles.voteResultAvatar} loading="lazy" />
                                        <span className={styles.voteResultVoterName}>{voter?.name}</span>
                                        <span className={styles.voteResultFor}>voted for</span>
                                        <img src={votedFor?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${votedFor?.name}`} alt={votedFor?.name} className={styles.voteResultAvatar} loading="lazy" />
                                        <span className={styles.voteResultTargetName}>{votedFor?.name}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className={styles.leaderboardBtnContainer}>
                            <button 
                                className="btn btn-primary" 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onGoToLeaderboard) onGoToLeaderboard();
                                    onClose(e);
                                }}
                            >
                                Check Leaderboards
                            </button>
                        </div>
                    </div>
                ) : myVote ? (
                    <div className={styles.voteCast}>
                        <p className={styles.voteCastText}>You cast your vote! 🤫</p>
                        <div className={styles.voteCastWaiting}>
                            <span className={styles.voteCastWaitingText}>Waiting for the rest to vote... ({totalVotes}/{totalMembers})</span>
                        </div>
                    </div>
                ) : (
                    <div>
                        <p className={styles.voteInstruction}>Who was the drunkest after {activity.title}? Cast your vote below:</p>
                        <div className={styles.voteOptions}>
                            {users.map(u => (
                                <button
                                    key={u.uid}
                                    onClick={() => handleVote(u.uid)}
                                    disabled={saving}
                                    className={styles.voteOptionBtn}
                                >
                                    <img src={u.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.name}`} alt={u.name} className={styles.voteOptionAvatar} loading="lazy" />
                                    <div className={styles.voteOptionNameGroup}>
                                        <div className={styles.voteOptionName}>{u.name}</div>
                                        <div className={styles.voteOptionSubName}>{u.fullName}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {showForceConfirm && (
                    <div className={styles.confirmBackdrop} onClick={(e) => { e.stopPropagation(); setShowForceConfirm(false); }}>
                        <div className={`card animate-fade-in ${styles.confirmCard}`} onClick={e => e.stopPropagation()}>
                            <div className={styles.modalHeader}>
                                <h3 className={styles.modalTitle}>Close Voting Early?</h3>
                                <button onClick={() => setShowForceConfirm(false)} className={styles.modalCloseBtn} title="Close">&times;</button>
                            </div>
                            <p className={styles.confirmText}>Are you sure you want to force close voting early? Members will no longer be able to cast votes.</p>
                            <div className={styles.confirmActions}>
                                <button 
                                    className={`btn btn-secondary ${styles.btnConfirmCancel}`}
                                    onClick={() => setShowForceConfirm(false)}
                                >
                                    Cancel
                                </button>
                                <button 
                                    className={`btn btn-primary ${styles.btnConfirmOk}`}
                                    disabled={saving}
                                    onClick={async () => {
                                        try {
                                            setSaving(true);
                                            setLocalClosed(true);
                                            setShowForceConfirm(false);
                                            if (activity.id && !activity.id.startsWith('mock')) {
                                                await updateDoc(doc(db, 'activities', activity.id), { votingClosed: true });
                                            }
                                            if (onUpdate) onUpdate();
                                        } catch(err) {
                                            console.error('Failed to update DB:', err);
                                        } finally {
                                            setSaving(false);
                                        }
                                    }}
                                >
                                    {saving ? 'Closing...' : 'Yes, Close It'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
