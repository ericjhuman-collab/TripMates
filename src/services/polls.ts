import {
    collection,
    doc,
    addDoc,
    deleteDoc,
    updateDoc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { notifyTripMembers } from './social';

// ── Data model (Firestore: trips/{tripId}/polls/{pollId}) ─────────────────
// Single-choice or multi-choice question. Members vote by writing their uid
// into the `votes` map, value = array of option ids they picked.
//
// V1 scope: question + 2-12 fixed options + single/multi-choice toggle.
// Visible voter identities (not anonymous). No deadline. Creator or admin
// can manually close. Member-add-options, anonymity, and deadline auto-close
// are deferred.

export interface PollOption {
    id: string;
    label: string;
}

export interface Poll {
    id: string;
    question: string;
    options: PollOption[];
    /** Map uid → array of option ids voted for. Empty / missing = abstained. */
    votes: Record<string, string[]>;
    createdBy: string;
    createdByName: string;
    createdByAvatarUrl?: string;
    createdAt: number;
    /** Unix-ms when manually closed, or null if still open. */
    closedAt: number | null;
    /** true = members may pick more than one option. */
    allowMultipleChoice: boolean;
}

export const MAX_POLL_OPTIONS = 12;
export const MIN_POLL_OPTIONS = 2;

// ── CRUD ───────────────────────────────────────────────────────────────────

export async function createPoll(args: {
    tripId: string;
    question: string;
    options: string[];
    allowMultipleChoice: boolean;
    creatorUid: string;
    creatorName: string;
    creatorAvatarUrl?: string;
    tripMemberUids: string[];
}): Promise<string> {
    const optionLabels = args.options
        .map(o => o.trim())
        .filter(Boolean)
        .slice(0, MAX_POLL_OPTIONS);
    if (optionLabels.length < MIN_POLL_OPTIONS) {
        throw new Error(`A poll needs at least ${MIN_POLL_OPTIONS} options.`);
    }

    // Stable, short option ids — avoids relying on label equality if a label
    // is later renamed (which we don't currently support, but guards future).
    const options: PollOption[] = optionLabels.map((label, i) => ({
        id: `opt-${i}-${Math.random().toString(36).slice(2, 8)}`,
        label,
    }));

    const ref = await addDoc(collection(db, 'trips', args.tripId, 'polls'), {
        question: args.question.trim(),
        options,
        votes: {},
        createdBy: args.creatorUid,
        createdByName: args.creatorName,
        createdByAvatarUrl: args.creatorAvatarUrl ?? '',
        createdAt: serverTimestamp(),
        closedAt: null,
        allowMultipleChoice: args.allowMultipleChoice,
    });

    // Fan-out notifications to other members (uses existing social.ts pattern).
    const recipients = args.tripMemberUids.filter(uid => uid !== args.creatorUid);
    notifyTripMembers(recipients, {
        type: 'trip:new_poll',
        tripId: args.tripId,
        fromUid: args.creatorUid,
        fromName: args.creatorName,
        fromAvatarUrl: args.creatorAvatarUrl ?? '',
        message: `${args.creatorName} asked: ${args.question.trim()}`,
        linkUrl: `/?tab=polls&pollId=${ref.id}`,
    }).catch(e => console.warn('Poll notification fan-out failed', e));

    return ref.id;
}

/** Cast / change a vote. For single-choice polls, pass exactly one option id. */
export async function votePoll(args: {
    tripId: string;
    pollId: string;
    voterUid: string;
    optionIds: string[];
}): Promise<void> {
    await updateDoc(doc(db, 'trips', args.tripId, 'polls', args.pollId), {
        [`votes.${args.voterUid}`]: args.optionIds,
    });
}

/** Close a poll — only the creator or a trip admin should call this. */
export async function closePoll(tripId: string, pollId: string): Promise<void> {
    await updateDoc(doc(db, 'trips', tripId, 'polls', pollId), {
        closedAt: Date.now(),
    });
}

export async function deletePoll(tripId: string, pollId: string): Promise<void> {
    await deleteDoc(doc(db, 'trips', tripId, 'polls', pollId));
}

// ── Subscriptions ──────────────────────────────────────────────────────────

export function subscribeToTripPolls(
    tripId: string,
    cb: (polls: Poll[]) => void,
): Unsubscribe {
    const q = query(
        collection(db, 'trips', tripId, 'polls'),
        orderBy('createdAt', 'desc'),
    );
    return onSnapshot(q, snap => {
        const polls: Poll[] = snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                question: data.question,
                options: data.options,
                votes: data.votes ?? {},
                createdBy: data.createdBy,
                createdByName: data.createdByName,
                createdByAvatarUrl: data.createdByAvatarUrl,
                createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
                closedAt: data.closedAt ?? null,
                allowMultipleChoice: !!data.allowMultipleChoice,
            };
        });
        cb(polls);
    });
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** True when the poll is still accepting votes. */
export const isPollOpen = (poll: Poll): boolean => poll.closedAt === null;

/** True when a given user has already voted on this poll. */
export const hasVoted = (poll: Poll, uid: string): boolean => {
    const v = poll.votes[uid];
    return Array.isArray(v) && v.length > 0;
};

/** Vote count per option. Order matches `poll.options`. */
export const voteCounts = (poll: Poll): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const opt of poll.options) counts[opt.id] = 0;
    for (const optionIds of Object.values(poll.votes)) {
        for (const id of optionIds) {
            if (id in counts) counts[id] += 1;
        }
    }
    return counts;
};

/** Total number of unique voters (regardless of options selected). */
export const voterCount = (poll: Poll): number =>
    Object.values(poll.votes).filter(v => Array.isArray(v) && v.length > 0).length;
