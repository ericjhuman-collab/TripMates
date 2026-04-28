import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import { type BingoSquare, getBingoBoard, initBingoBoard, saveBingoBoard } from '../services/bingo';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { AppUser } from '../context/AuthContext';
import { X, Trophy, ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import styles from './Games.module.css';
import { OddsGame } from '../components/OddsGame';
import { useToast } from '../components/useToast';

export const Games: React.FC = () => {
    const toast = useToast();
    const { appUser, effectiveRole } = useAuth();
    const { activeTrip } = useTrip();
    const isAdmin = effectiveRole === 'admin';
    const [squares, setSquares] = useState<BingoSquare[]>([]);
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState<AppUser[]>([]);
    const [showMemberPicker, setShowMemberPicker] = useState(false);
    const [selectedSquareIndex, setSelectedSquareIndex] = useState<number | null>(null);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [selectedGame, setSelectedGame] = useState<string>('');
    const rawGamesList = activeTrip?.activeGames || ['bingo', 'cheers'];
    // Put the admin's defaultGame first so it's always the leftmost pill
    const defaultGame = activeTrip?.defaultGame;
    const activeGamesList = defaultGame && rawGamesList.includes(defaultGame)
        ? [defaultGame, ...rawGamesList.filter(g => g !== defaultGame)]
        : rawGamesList;

    // Always start with the leftmost (first) game in the list
    useEffect(() => {
        if (activeGamesList.length > 0) {
            setSelectedGame(activeGamesList[0]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTrip?.id]);

    useEffect(() => {
        if (!activeGamesList.includes(selectedGame) && activeGamesList.length > 0) {
            setSelectedGame(activeGamesList[0]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeGamesList.join(','), selectedGame]);

    const COLS = 5;
    const ROWS = Math.ceil(squares.length / COLS);

    const leaderboard = useMemo(() => {
        if (!squares.length) return [];
        const counts: Record<string, number> = {};

        const getOwner = (r: number, c: number): string | null => {
            if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
            const idx = r * COLS + c;
            if (idx >= squares.length) return null;
            return squares[idx].completedBy || null;
        };

        const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                for (const [dr, dc] of directions) {
                    const a = getOwner(r, c);
                    const b = getOwner(r + dr, c + dc);
                    const c2 = getOwner(r + 2 * dr, c + 2 * dc);
                    if (a && a === b && b === c2) counts[a] = (counts[a] || 0) + 1;
                }
            }
        }

        const entries = Object.entries(counts).map(([name, rows]) => ({ name, rows })).sort((a, b) => b.rows - a.rows);
        const namesWithRows = new Set(entries.map(e => e.name));
        const allCompleted = new Set(squares.filter(s => s.completedBy).map(s => s.completedBy!));
        for (const name of allCompleted) {
            if (!namesWithRows.has(name)) entries.push({ name, rows: 0 });
        }
        return entries;
    }, [squares, ROWS]);

    const fetchBoard = async () => {
        if (!activeTrip) { setLoading(false); return; }
        setLoading(true);
        let board = await getBingoBoard(activeTrip.id);
        if (!board && isAdmin) board = await initBingoBoard(activeTrip.id);
        if (board) setSquares(board.squares);
        setLoading(false);
    };

    const fetchMembers = async () => {
        try {
            const snapshot = await getDocs(collection(db, 'users'));
            const usersData = snapshot.docs.map(doc => doc.data() as AppUser);
            setMembers(usersData.filter(m => m.hasAgreed));
        } catch (err) {
            console.error('Failed to fetch members', err);
        }
    };

    useEffect(() => {
        fetchBoard();
        fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin]);

    const handleSquareClick = async (index: number) => {
        if (!appUser || !activeTrip) return;
        const sq = squares[index];

        if (sq.completedBy) {
            // Any player can unmark their own square
            if (sq.completedBy === appUser.name) {
                const newSquares = [...squares];
                newSquares[index] = { ...sq, completedBy: null };
                setSquares(newSquares);
                await saveBingoBoard(activeTrip.id, newSquares);
            } else {
                toast.info(`Already completed by ${sq.completedBy}`);
            }
            return;
        }
        setSelectedSquareIndex(index);
        setShowMemberPicker(true);
    };

    const handleMemberSelect = async (memberName: string) => {
        if (selectedSquareIndex === null || !activeTrip) return;
        const newSquares = [...squares];
        newSquares[selectedSquareIndex] = { ...newSquares[selectedSquareIndex], completedBy: memberName };
        setSquares(newSquares);
        await saveBingoBoard(activeTrip.id, newSquares);
        setShowMemberPicker(false);
        setSelectedSquareIndex(null);
    };

    return (
        <div className={`animate-fade-in ${styles.page}`}>
            <div className={styles.pageHeader}>
                <h2 className={styles.pageTitle}>Trip Games</h2>
            </div>

            {/* Game switcher pill tabs — only shown when multiple games are active */}
            {activeGamesList.length > 1 && (
                <div className={styles.gamePills}>
                    {activeGamesList.map(g => (
                        <button
                            key={g}
                            onClick={() => setSelectedGame(g)}
                            className={`${styles.gamePill} ${selectedGame === g ? styles.gamePillActive : ''}`}
                        >
                            {g.charAt(0).toUpperCase() + g.slice(1).replace('-', ' ')}
                        </button>
                    ))}
                </div>
            )}

            {selectedGame === 'bingo' && (
                <>
                    {loading ? (
                        <div className={styles.stateText}>Loading Bingo...</div>
                    ) : !squares.length ? (
                        <div className={styles.stateText}>Admin needs to initialize the board.</div>
                    ) : (
                        <>
                            <p className={styles.bingoHint}>
                                Tap a square to mark who completed it!
                            </p>

                            {activeTrip?.bingoReward && (
                                <div className={styles.consequenceBanner}>
                                    <Trophy size={16} />
                                    <span><strong>3 in a row = </strong> {activeTrip.bingoReward}</span>
                                </div>
                            )}

                            <div className={`card ${styles.leaderboardCard}`}>
                                <div className={styles.leaderboardMiniHeader}>
                                    <div className={styles.leaderboardMiniTitle}>
                                        <Trophy size={16} color="#d97706" /> Three-in-a-Row Leaderboard
                                    </div>
                                    <button onClick={() => setShowLeaderboard(true)} className={styles.viewAllBtn} title="View full leaderboard">
                                        View All <ChevronRight size={14} />
                                    </button>
                                </div>
                                {leaderboard.length === 0 ? (
                                    <p className={styles.leaderboardEmptyText}>No three-in-a-rows yet — get playing!</p>
                                ) : (
                                    <div className={styles.leaderboardMiniList}>
                                        {leaderboard.slice(0, 3).map((entry, i) => {
                                            const medals = ['🥇', '🥈', '🥉'];
                                            const member = members.find(m => m.name === entry.name);
                                            return (
                                                <div key={entry.name} className={styles.leaderboardMiniRow}>
                                                    <span className={styles.leaderboardMiniMedal}>{medals[i]}</span>
                                                    {member?.avatarUrl && <img src={member.avatarUrl} alt={entry.name} className={styles.leaderboardMiniAvatar} loading="lazy" />}
                                                    <span className={styles.leaderboardMiniName}>{member?.fullName || entry.name}</span>
                                                    <span className={`${styles.leaderboardMiniScore} ${entry.rows > 0 ? styles.leaderboardMiniScoreHigh : styles.leaderboardMiniScoreZero}`}>
                                                        {entry.rows} {entry.rows === 1 ? 'row' : 'rows'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className={styles.bingoGrid}>
                                {squares.map((sq, i) => {
                                    const isCompleted = !!sq.completedBy;
                                    return (
                                        <div
                                            key={sq.id}
                                            className={`bingo-square ${isCompleted ? 'completed' : ''}`}
                                            onClick={() => handleSquareClick(i)}
                                        >
                                            <div className={styles.squareLabel}>{sq.task}</div>
                                            {isCompleted && (
                                                <div className={styles.squareCompletedTag}>
                                                    {members.find(m => m.name === sq.completedBy)?.fullName || sq.completedBy}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </>
            )}

            {selectedGame === 'cheers' && (
                <div className={`card glass-panel ${styles.comingSoonCard}`}>
                    <h3 className={styles.comingSoonTitle}>🍻 Cheers</h3>
                    <p className={styles.comingSoonText}>The Cheers game is coming soon!</p>
                </div>
            )}

            {selectedGame === 'most-likely' && (
                <div className={`card glass-panel ${styles.comingSoonCard}`}>
                    <h3 className={styles.comingSoonTitle}>🎯 Most Likely To</h3>
                    <p className={styles.comingSoonText}>The Most Likely game is coming soon!</p>
                </div>
            )}

            {selectedGame === 'odds' && (
                <OddsGame />
            )}

            {/* Member Picker Modal */}
            {showMemberPicker && createPortal(
                <div className="modal-backdrop" onClick={() => { setShowMemberPicker(false); setSelectedSquareIndex(null); }}>
                    <div className={`card animate-fade-in ${styles.modalCard}`} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>Who completed this?</h3>
                            <button
                                onClick={() => { setShowMemberPicker(false); setSelectedSquareIndex(null); }}
                                className={styles.modalCloseBtn}
                                title="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        {selectedSquareIndex !== null && (
                            <p className={styles.taskPreview}>Task: <strong>{squares[selectedSquareIndex].task}</strong></p>
                        )}
                        <div className={styles.memberList}>
                            {members.map(member => (
                                <button key={member.uid} onClick={() => handleMemberSelect(member.name)} className={`btn ${styles.memberBtn}`}>
                                    {member.avatarUrl ? (
                                        <img src={member.avatarUrl} alt={member.name} className={styles.memberAvatar} loading="lazy" />
                                    ) : (
                                        <div className={styles.memberAvatarPlaceholder}>
                                            {member.name.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div className={styles.memberName}>{member.fullName || member.name}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Full Leaderboard Modal */}
            {showLeaderboard && createPortal(
                <div className="modal-backdrop" onClick={() => setShowLeaderboard(false)}>
                    <div className={`card animate-fade-in ${styles.leaderboardModal}`} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div className={styles.leaderboardMiniTitle}>
                                <Trophy size={20} color="#d97706" />
                                <h3 className={styles.modalTitle}>Leaderboard</h3>
                            </div>
                            <button onClick={() => setShowLeaderboard(false)} title="Close leaderboard" className={styles.modalCloseBtn}>
                                <X size={20} />
                            </button>
                        </div>
                        <p className={styles.leaderboardModalDesc}>
                            Three-in-a-row count — the person with the most rows buys rounds! 🍻
                        </p>
                        {leaderboard.length === 0 ? (
                            <p className={styles.leaderboardEmptyFull}>No entries yet!</p>
                        ) : (
                            <div className={styles.leaderboardFullList}>
                                {leaderboard.map((entry, i) => {
                                    const medals = ['🥇', '🥈', '🥉'];
                                    const member = members.find(m => m.name === entry.name);
                                    return (
                                        <div
                                            key={entry.name}
                                            className={`${styles.leaderboardFullRow} ${i < 3 ? styles.leaderboardFullRowTop : styles.leaderboardFullRowNormal}`}
                                            style={{ border: i === 0 && entry.rows > 0 ? '1px solid #fbbf24' : undefined }}
                                        >
                                            <span className={`${styles.leaderboardFullRank} ${i < 3 ? styles.leaderboardFullRankMedal : styles.leaderboardFullRankNum}`}>
                                                {i < 3 ? medals[i] : `${i + 1}.`}
                                            </span>
                                            {member?.avatarUrl ? (
                                                <img src={member.avatarUrl} alt={entry.name} className={styles.leaderboardFullAvatar} loading="lazy" />
                                            ) : (
                                                <div className={styles.memberAvatarPlaceholder} style={{ width: 32, height: 32, fontSize: '0.85rem' }}>
                                                    {entry.name.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div className={styles.leaderboardFullMeta}>
                                                <span className={styles.leaderboardFullName}>{entry.name}</span>
                                                {member?.fullName && (
                                                    <span className={styles.leaderboardFullSubname}>{member.fullName}</span>
                                                )}
                                            </div>
                                            <span className={`${styles.leaderboardFullScore} ${entry.rows > 0 ? styles.leaderboardMiniScoreHigh : styles.leaderboardMiniScoreZero}`}>
                                                {entry.rows} {entry.rows === 1 ? 'row' : 'rows'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
