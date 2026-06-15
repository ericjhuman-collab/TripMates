import { useEffect, useRef, useState } from 'react';
import { Send, Heart } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import {
    subscribeToTripMessages,
    sendTripMessage,
    toggleLikeMessage,
    markChatRead,
    type TripMessage,
} from '../services/tripChat';
import { useToast } from './useToast';
import styles from './TripChat.module.css';

interface Props {
    tripId: string;
}

const formatStamp = (msg: TripMessage): string => {
    if (!msg.createdAt) return 'Sending…';
    const date = msg.createdAt.toDate();
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return `Yesterday ${format(date, 'HH:mm')}`;
    return format(date, 'MMM d, HH:mm');
};

export const TripChat: React.FC<Props> = ({ tripId }) => {
    const { appUser } = useAuth();
    const toast = useToast();
    const [messages, setMessages] = useState<TripMessage[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const lastMsgIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!tripId) return;
        const unsub = subscribeToTripMessages(tripId, setMessages);
        return () => unsub();
    }, [tripId]);

    useEffect(() => {
        const newest = messages[messages.length - 1];
        if (newest && newest.id !== lastMsgIdRef.current) {
            lastMsgIdRef.current = newest.id;
            requestAnimationFrame(() => {
                listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
            });
        }
        markChatRead(tripId);
    }, [messages, tripId]);

    const handleSend = async () => {
        if (!appUser || !input.trim() || sending) return;
        const text = input;
        setInput('');
        setSending(true);
        try {
            await sendTripMessage(tripId, {
                uid: appUser.uid,
                name: appUser.name,
                avatarUrl: appUser.avatarUrl,
            }, text);
        } catch (err) {
            console.error('Send message failed:', err);
            setInput(text);
            toast.error('Failed to send message.');
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleToggleLike = async (msg: TripMessage) => {
        if (!appUser) return;
        const liked = msg.likes.includes(appUser.uid);
        try {
            await toggleLikeMessage(tripId, msg.id, appUser.uid, liked);
        } catch (err) {
            console.error('Toggle like failed:', err);
            toast.error('Failed to update like.');
        }
    };

    return (
        <div className={styles.chat}>
            <div ref={listRef} className={styles.messages}>
                {messages.length === 0 ? (
                    <div className={styles.empty}>No messages yet. Say hi 👋</div>
                ) : messages.map((msg, idx) => {
                    const isOwn = msg.senderId === appUser?.uid;
                    const prev = messages[idx - 1];
                    const showHeader = !prev || prev.senderId !== msg.senderId;
                    return (
                        <div key={msg.id} className={`${styles.row} ${isOwn ? styles.rowOwn : ''}`}>
                            {!isOwn && showHeader && (
                                <img
                                    src={msg.senderAvatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderName}`}
                                    alt={msg.senderName}
                                    className={styles.avatar}
                                    loading="lazy"
                                />
                            )}
                            {!isOwn && !showHeader && <div className={styles.avatarSpacer} />}
                            <div className={styles.bubbleColumn}>
                                {!isOwn && showHeader && (
                                    <div className={styles.senderName}>{msg.senderName}</div>
                                )}
                                <div className={`${styles.bubble} ${isOwn ? styles.bubbleOwn : styles.bubbleOther}`}>
                                    <div className={styles.text}>{msg.text}</div>
                                    <div className={styles.stamp}>{formatStamp(msg)}</div>
                                    {(() => {
                                        const liked = !!appUser && msg.likes.includes(appUser.uid);
                                        const count = msg.likes.length;
                                        return (
                                            <button
                                                onClick={() => handleToggleLike(msg)}
                                                className={`${styles.likeBtn} ${isOwn ? styles.likeBtnOwn : styles.likeBtnOther} ${liked ? styles.likeBtnActive : ''}`}
                                                aria-label={liked ? 'Unlike' : 'Like'}
                                                title={liked ? 'Unlike' : 'Like'}
                                            >
                                                <Heart size={12} fill={liked ? 'currentColor' : 'none'} />
                                                {count > 0 && <span className={styles.likeCount}>{count}</span>}
                                            </button>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className={styles.inputRow}>
                <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Message…"
                    rows={1}
                    className={styles.input}
                    maxLength={2000}
                    disabled={sending}
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    className={styles.sendBtn}
                    aria-label="Send message"
                >
                    <Send size={18} />
                </button>
            </div>
        </div>
    );
};
