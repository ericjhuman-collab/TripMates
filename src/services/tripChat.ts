import {
    collection,
    addDoc,
    doc,
    updateDoc,
    arrayUnion,
    arrayRemove,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
    limit as firestoreLimit,
    type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export interface TripMessage {
    id: string;
    senderId: string;
    senderName: string;
    senderAvatarUrl?: string;
    text: string;
    createdAt: Timestamp | null;
    likes: string[];
}

const MAX_MESSAGE_LEN = 2000;
const PAGE_SIZE = 100;
const LAST_READ_KEY_PREFIX = 'tripChat:lastRead:';

export const subscribeToTripMessages = (
    tripId: string,
    callback: (messages: TripMessage[]) => void,
) => {
    const messagesRef = collection(db, 'trips', tripId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'), firestoreLimit(PAGE_SIZE));
    return onSnapshot(q, (snapshot) => {
        const messages: TripMessage[] = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                senderId: data.senderId,
                senderName: data.senderName,
                senderAvatarUrl: data.senderAvatarUrl,
                text: data.text,
                createdAt: data.createdAt ?? null,
                likes: Array.isArray(data.likes) ? data.likes : [],
            };
        }).reverse();
        callback(messages);
    });
};

export const sendTripMessage = async (
    tripId: string,
    sender: { uid: string; name: string; avatarUrl?: string },
    text: string,
): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_MESSAGE_LEN) {
        throw new Error(`Message too long (max ${MAX_MESSAGE_LEN} characters).`);
    }
    const messagesRef = collection(db, 'trips', tripId, 'messages');
    await addDoc(messagesRef, {
        senderId: sender.uid,
        senderName: sender.name,
        senderAvatarUrl: sender.avatarUrl ?? null,
        text: trimmed,
        createdAt: serverTimestamp(),
        likes: [],
    });
};

export const toggleLikeMessage = async (
    tripId: string,
    messageId: string,
    uid: string,
    currentlyLiked: boolean,
): Promise<void> => {
    const ref = doc(db, 'trips', tripId, 'messages', messageId);
    await updateDoc(ref, {
        likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
    });
};

export const getLastReadAt = (tripId: string): number => {
    const raw = localStorage.getItem(LAST_READ_KEY_PREFIX + tripId);
    return raw ? parseInt(raw, 10) || 0 : 0;
};

export const markChatRead = (tripId: string): void => {
    localStorage.setItem(LAST_READ_KEY_PREFIX + tripId, String(Date.now()));
};

export const countUnread = (messages: TripMessage[], tripId: string, viewerUid: string): number => {
    const lastRead = getLastReadAt(tripId);
    if (!lastRead) return messages.filter(m => m.senderId !== viewerUid).length;
    return messages.filter(m =>
        m.senderId !== viewerUid
        && m.createdAt
        && m.createdAt.toMillis() > lastRead
    ).length;
};
