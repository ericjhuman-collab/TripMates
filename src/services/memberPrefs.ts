import { collection, doc, getDoc, getDocs, setDoc, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Per-trip, per-user preferences. Lets a member tailor what they share with this
 * specific trip's members and how they're notified — independent of their global
 * profile settings.
 *
 * Stored at: trips/{tripId}/memberPrefs/{uid}
 */
export interface MemberPrefs {
    shareLocation: boolean;     // Share live location with this trip's members
    sharePhoneNumber: boolean;  // Share phone number with this trip's members
    muteNotifications: boolean; // Mute push/email from this trip
    allowPhotoTags: boolean;    // Let other members tag me in trip gallery
    autoJoinActivities: boolean;// Auto-RSVP "going" to new admin-created activities
    showOnLeaderboard: boolean; // Appear on trip leaderboards (drunk-leaderboard etc)
    updatedAt?: number;
}

export const DEFAULT_MEMBER_PREFS: MemberPrefs = {
    shareLocation: true,
    sharePhoneNumber: false,
    muteNotifications: false,
    allowPhotoTags: true,
    autoJoinActivities: false,
    showOnLeaderboard: true,
};

const refFor = (tripId: string, uid: string): DocumentReference =>
    doc(db, 'trips', tripId, 'memberPrefs', uid);

/** Read prefs for a member. Returns defaults if not yet set. */
export async function getMemberPrefs(tripId: string, uid: string): Promise<MemberPrefs> {
    const snap = await getDoc(refFor(tripId, uid));
    if (!snap.exists()) return { ...DEFAULT_MEMBER_PREFS };
    const data = snap.data() as Partial<MemberPrefs>;
    return { ...DEFAULT_MEMBER_PREFS, ...data };
}

/**
 * Read prefs for every member that has a doc under this trip. Returns a Map<uid, prefs>.
 * Members without a prefs doc are NOT included — caller should treat missing keys as defaults.
 */
export async function getAllMemberPrefs(tripId: string): Promise<Map<string, MemberPrefs>> {
    const snap = await getDocs(collection(db, 'trips', tripId, 'memberPrefs'));
    const out = new Map<string, MemberPrefs>();
    snap.forEach(d => {
        out.set(d.id, { ...DEFAULT_MEMBER_PREFS, ...(d.data() as Partial<MemberPrefs>) });
    });
    return out;
}

/** Helper: merged defaults for a uid not present in the prefs map. */
export function prefsOrDefault(prefs: Map<string, MemberPrefs>, uid: string): MemberPrefs {
    return prefs.get(uid) ?? DEFAULT_MEMBER_PREFS;
}

/** Write a partial update — fields not in `patch` keep their previous value. */
export async function updateMemberPrefs(
    tripId: string,
    uid: string,
    patch: Partial<MemberPrefs>,
): Promise<void> {
    await setDoc(
        refFor(tripId, uid),
        { ...patch, updatedAt: Date.now() },
        { merge: true },
    );
}
