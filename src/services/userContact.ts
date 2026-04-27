import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { db } from './firebase';

/** The single doc id we use under users/{uid}/private/. */
const CONTACT_DOC_ID = 'contact';

export interface PrivateContact {
    phoneNumber?: string;
}

/**
 * Read a user's private contact doc. Returns null if the doc doesn't exist
 * OR the rules deny access (e.g. sharePhoneNumber is false). Callers should
 * treat null as "no number available".
 */
export async function getPrivateContact(uid: string): Promise<PrivateContact | null> {
    try {
        const snap = await getDoc(doc(db, 'users', uid, 'private', CONTACT_DOC_ID));
        if (!snap.exists()) return null;
        return snap.data() as PrivateContact;
    } catch {
        return null;
    }
}

/**
 * Owner writes their phone number. Pass empty string to clear it.
 * Caller must be authenticated as `uid` (rules enforce this).
 */
export async function setOwnPhoneNumber(uid: string, phoneNumber: string): Promise<void> {
    const ref = doc(db, 'users', uid, 'private', CONTACT_DOC_ID);
    if (phoneNumber.trim() === '') {
        await setDoc(ref, { phoneNumber: deleteField() }, { merge: true });
    } else {
        await setDoc(ref, { phoneNumber: phoneNumber.trim() }, { merge: true });
    }
}
