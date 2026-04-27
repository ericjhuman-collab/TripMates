import { httpsCallable, FunctionsError } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { auth, functions } from './firebase';

const deleteUserAccountCallable = httpsCallable<void, { ok: boolean }>(functions, 'deleteUserAccount');

/**
 * Calls the Cloud Function then signs the user out locally. Throws if the
 * server reports an error; throws nothing on success (the caller should
 * navigate to /login).
 */
export async function deleteMyAccount(): Promise<void> {
    try {
        await deleteUserAccountCallable();
    } catch (err) {
        if (err instanceof FunctionsError) {
            throw new Error(err.message);
        }
        throw err;
    }
    // Auth user is already gone server-side; this clears the local cache.
    await signOut(auth).catch(() => undefined);
}
