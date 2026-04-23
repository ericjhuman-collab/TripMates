import { storage } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

/**
 * Uploads a receipt image to Firebase Storage.
 * Returns the public download URL when complete.
 */
export const uploadReceiptImage = async (
    tripId: string,
    file: File | Blob
): Promise<string> => {
    try {
        const ext = file.type === 'image/jpeg' ? 'jpeg' : file.type === 'image/png' ? 'png' : 'img';
        const fileName = `receipt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
        const storageRef = ref(storage, `trips/${tripId}/receipts/${fileName}`);
        
        const task = uploadBytesResumable(storageRef, file);
        await new Promise<void>((resolve, reject) => {
            task.on('state_changed', null, reject, resolve);
        });
        
        return await getDownloadURL(storageRef);
    } catch (error) {
        console.error("Failed to upload receipt to Firebase", error);
        throw error;
    }
};
