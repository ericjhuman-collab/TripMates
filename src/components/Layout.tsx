import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Home, MessageCircle, Camera, Banknote, Search, User as UserIcon, X, Menu, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/firebase';
import { collection, query, where, limit, getDocs, documentId } from 'firebase/firestore';
import { searchUsersByUsernamePrefix } from '../services/username';
import { normalizeSearchInput } from '../utils/searchFields';
import { BannerStack } from './BannerStack';
import { HamburgerDrawer } from './HamburgerDrawer';
import styles from './Layout.module.css';

interface UserResult {
    uid: string;
    name: string;
    avatarUrl?: string;
}

export const Layout: React.FC = () => {
    const { appUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();


    // ── User search state ─────────────────────────
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<UserResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Hamburger drawer (lifted from Profile so it can open over any page) ──
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerUnreadCount, setDrawerUnreadCount] = useState(0);

    // The header's right-most button swaps based on context: back-arrow when
    // we're on a Profile sub-page (settings/admin/network/etc.), hamburger
    // everywhere else. Detected purely from the URL — no portal/context.
    const profileTabParam = location.pathname.startsWith('/profile') ? searchParams.get('tab') : null;
    const isProfileSubPage = !!profileTabParam && profileTabParam !== 'profile';


    const getThemeClass = () => 'theme-default-trip';
    const themeClass = getThemeClass();

    useEffect(() => {
        document.body.className = themeClass;
        return () => { document.body.className = ''; };
    }, [themeClass]);

    // Close search when page is scrolled (panel would drift otherwise)
    useEffect(() => {
        const close = () => {
            if (searchOpen) setSearchOpen(false);
        };
        window.addEventListener('scroll', close, { passive: true });
        return () => window.removeEventListener('scroll', close);
    }, [searchOpen]);

    // Focus search input when opened
    useEffect(() => {
        if (searchOpen) {
            setTimeout(() => searchInputRef.current?.focus(), 50);
        } else {
            queueMicrotask(() => {
                setSearchQuery('');
                setSearchResults([]);
            });
        }
    }, [searchOpen]);

    // Debounced Firestore search across name, last name, and username.
    const runSearch = useCallback(async (rawQuery: string) => {
        const normalized = normalizeSearchInput(rawQuery);
        if (normalized.length < 2) { setSearchResults([]); return; }
        setIsSearching(true);
        try {
            const upper = normalized + '\uf8ff';

            const nameQ = query(
                collection(db, 'users'),
                where('nameLower', '>=', normalized),
                where('nameLower', '<=', upper),
                limit(10),
            );
            const lastNameQ = query(
                collection(db, 'users'),
                where('lastNameLower', '>=', normalized),
                where('lastNameLower', '<=', upper),
                limit(10),
            );

            const [nameSnap, lastNameSnap, usernameHits] = await Promise.all([
                getDocs(nameQ),
                getDocs(lastNameQ),
                searchUsersByUsernamePrefix(rawQuery, 10),
            ]);

            const merged = new Map<string, UserResult>();
            const addDoc = (d: { id: string; data: () => Record<string, unknown> }) => {
                if (d.id === appUser?.uid) return;
                if (merged.has(d.id)) return;
                const data = d.data();
                merged.set(d.id, {
                    uid: d.id,
                    name: (data.name as string) || (data.username as string) || d.id,
                    avatarUrl: data.avatarUrl as string | undefined,
                });
            };
            nameSnap.docs.forEach(addDoc);
            lastNameSnap.docs.forEach(addDoc);

            // Username matches give us uids only; fetch the user docs to get name/avatar.
            const missingUids = usernameHits
                .map(h => h.uid)
                .filter(uid => uid && uid !== appUser?.uid && !merged.has(uid));
            if (missingUids.length > 0) {
                const userDocsQ = query(
                    collection(db, 'users'),
                    where(documentId(), 'in', missingUids.slice(0, 10)),
                );
                const userSnap = await getDocs(userDocsQ);
                userSnap.docs.forEach(addDoc);
            }

            setSearchResults(Array.from(merged.values()).slice(0, 10));
        } catch (e) {
            console.error('Search error', e);
        }
        setIsSearching(false);
    }, [appUser?.uid]);

    useEffect(() => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => runSearch(searchQuery), 300);
        return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
    }, [searchQuery, runSearch]);

    const handleSelectUser = (uid: string) => {
        setSearchOpen(false);
        navigate(`/profile/${uid}`);
    };

    const isOwnProfileActive = location.pathname === '/profile' || location.pathname === `/profile/${appUser?.uid}`;

    return (
        <div className={`app-container ${styles.appContainer} ${styles.appContainerWithNav}`}>
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.appTitle}>TripMates</h1>
                </div>

                <div className={styles.headerRight}>
                    {/* Search button — visible on every page including /profile,
                        so users don't lose the people-search affordance when
                        they switch to their own profile. */}
                    <button
                        onClick={() => setSearchOpen(o => !o)}
                        title="Search users"
                        className={styles.searchIconBtn}
                    >
                        {searchOpen ? <X size={22} /> : <Search size={22} />}
                    </button>

                    {/* Right-most action: back-arrow on Profile sub-pages,
                        hamburger everywhere else. The hamburger now opens the
                        drawer in-place instead of redirecting to /profile —
                        closing the menu leaves the user on whatever page they
                        opened it from. */}
                    {isProfileSubPage ? (
                        <button
                            onClick={() => setSearchParams({})}
                            title="Back to profile"
                            aria-label="Back to profile"
                            className={styles.searchIconBtn}
                        >
                            <ArrowLeft size={22} />
                        </button>
                    ) : (
                        <button
                            onClick={() => setDrawerOpen(true)}
                            title="Menu"
                            aria-label="Menu"
                            className={styles.searchIconBtn}
                        >
                            <Menu size={22} />
                            {drawerUnreadCount > 0 && (
                                <span className={styles.menuUnreadBadge}>{drawerUnreadCount}</span>
                            )}
                        </button>
                    )}
                </div>
            </header>

            {/* ── User search overlay ───────────────── */}
            {searchOpen && createPortal(
                <div className={styles.searchOverlay} onClick={() => setSearchOpen(false)}>
                    <div className={styles.searchPanel} onClick={e => e.stopPropagation()}>
                        <div className={styles.searchInputRow}>
                            <Search size={16} className={styles.searchInputIcon} />
                            <input
                                ref={searchInputRef}
                                className={styles.searchInput}
                                placeholder="Search people…"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        {searchQuery.length >= 2 && (
                            <div className={styles.searchResults}>
                                {isSearching ? (
                                    <p className={styles.searchEmpty}>Searching…</p>
                                ) : searchResults.length === 0 ? (
                                    <p className={styles.searchEmpty}>No users found for "{searchQuery}"</p>
                                ) : (
                                    searchResults.map(u => (
                                        <button
                                            key={u.uid}
                                            className={styles.searchResultItem}
                                            onClick={() => handleSelectUser(u.uid)}
                                        >
                                            <div className={styles.searchResultAvatar}>
                                                {u.avatarUrl
                                                    ? <img src={u.avatarUrl} alt={u.name} loading="lazy" />
                                                    : <UserIcon size={18} />
                                                }
                                            </div>
                                            <span className={styles.searchResultName}>{u.name}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}

            <BannerStack />

            <main className={styles.main}>
                <Outlet />
            </main>

            <HamburgerDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                onUnreadCountChange={setDrawerUnreadCount}
            />

            <nav className={`nav-container ${styles.navBar}`}>
                    <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <Home size={22} />
                        <span>Trip</span>
                    </NavLink>
                    <NavLink to="/gallery" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <Camera size={22} />
                        <span>Camera</span>
                    </NavLink>
                    <NavLink to="/even" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <Banknote size={22} />
                        <span>Even</span>
                    </NavLink>
                    <NavLink to="/chat" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <MessageCircle size={22} />
                        <span>Chat</span>
                    </NavLink>

                    {/* Profile avatar — replaces Explore */}
                    <button
                        onClick={() => navigate('/profile')}
                        className={`nav-item ${isOwnProfileActive ? 'active' : ''} ${styles.navProfileBtn}`}
                        title="My Profile"
                    >
                        <div className={styles.navAvatarWrapper}>
                            {appUser?.avatarUrl
                                ? <img src={appUser.avatarUrl} alt="Profile" className={styles.navAvatar} />
                                : <UserIcon size={22} />
                            }
                        </div>
                        <span>Profile</span>
                    </button>
                </nav>
        </div>
    );
};
