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

const exportUserDataCallable = httpsCallable<void, Record<string, unknown>>(functions, 'exportUserData');

/**
 * Triggers a JSON file download with the caller's data export. The file is
 * named `tripmates-data-{uid}-{YYYY-MM-DD}.json` and uses a Blob URL so no
 * server round-trip beyond the function call. Throws on failure; the
 * caller can show the message inline.
 */
export async function downloadMyDataExport(): Promise<void> {
    let payload: Record<string, unknown>;
    try {
        const result = await exportUserDataCallable();
        payload = result.data;
    } catch (err) {
        if (err instanceof FunctionsError) {
            throw new Error(err.message);
        }
        throw err;
    }

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const uid = typeof payload.uid === 'string' ? payload.uid : 'me';
    const filename = `tripmates-data-${uid}-${today}.json`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
