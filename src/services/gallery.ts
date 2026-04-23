import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, query, orderBy, where, onSnapshot, serverTimestamp, getDocs } from 'firebase/firestore';
import { storage, db } from './firebase';

export interface GalleryImage {
    id: string;
    url: string;
    uploadedBy: string;
    uploadedByName?: string;
    createdAt: Date;
    tripId: string;
    likes?: string[];
    storagePath?: string;
    /** Optional activity tag */
    activityId?: string;
    activityName?: string;
    /** UIDs of tagged trip members */
    taggedMembers?: string[];
}

export interface UploadTags {
    activityId?: string;
    activityName?: string;
    taggedMembers?: string[];
}

/**
 * Uploads an image File or Blob to Firebase Storage and saves its metadata to Firestore under trips/{tripId}/gallery.
 * Returns the download URL when complete.
 */
export const uploadImageToGallery = async (
    tripId: string,
    file: File | Blob,
    userId: string,
    userName: string,
    tags?: UploadTags
): Promise<string> => {
    // 1. Create a unique filename
    const fileExtension = file instanceof File ? file.name.split('.').pop() || 'jpg' : 'jpg';
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExtension}`;

    // 2. Setup storage reference (trips/{tripId}/gallery/{fileName})
    const storageRef = ref(storage, `trips/${tripId}/gallery/${fileName}`);

    // 3. Upload the file
    const uploadTask = await uploadBytesResumable(storageRef, file);

    // 4. Get the public download URL
    const publicUrl = await getDownloadURL(uploadTask.ref);

    // 5. Save metadata to Firestore under trips/{tripId}/gallery
    const storagePath = `trips/${tripId}/gallery/${fileName}`;
    const galleryRef = collection(db, `trips/${tripId}/gallery`);
    await addDoc(galleryRef, {
        url: publicUrl,
        storagePath,
        uploadedBy: userId,
        uploadedByName: userName,
        createdAt: serverTimestamp(),
        tripId: tripId,
        likes: [],
        ...(tags?.activityId   ? { activityId: tags.activityId }     : {}),
        ...(tags?.activityName ? { activityName: tags.activityName }  : {}),
        ...(tags?.taggedMembers?.length ? { taggedMembers: tags.taggedMembers } : {}),
    });

    return publicUrl;
};

/**
 * Fetches all gallery images for a specific activity (one-time, non-realtime).
 */
export const getActivityGallery = async (tripId: string, activityId: string): Promise<GalleryImage[]> => {
    const q = query(
        collection(db, `trips/${tripId}/gallery`),
        where('activityId', '==', activityId),
        orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            url: data.url,
            uploadedBy: data.uploadedBy,
            uploadedByName: data.uploadedByName || 'Unknown',
            createdAt: data.createdAt?.toDate() || new Date(),
            tripId: data.tripId,
            likes: data.likes || [],
            storagePath: data.storagePath,
            activityId: data.activityId,
            activityName: data.activityName,
            taggedMembers: data.taggedMembers || [],
        };
    });
};

/**
 * Fetches all gallery images for a trip (one-time, non-realtime).
 */
export const getTripGallery = async (tripId: string): Promise<GalleryImage[]> => {
    const q = query(
        collection(db, `trips/${tripId}/gallery`),
        orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            url: data.url,
            uploadedBy: data.uploadedBy,
            uploadedByName: data.uploadedByName || 'Unknown',
            createdAt: data.createdAt?.toDate() || new Date(),
            tripId: data.tripId,
            likes: data.likes || [],
            storagePath: data.storagePath,
            activityId: data.activityId,
            activityName: data.activityName,
            taggedMembers: data.taggedMembers || [],
        };
    });
};


/**
 * Subscribes to the gallery images for a specific trip, ordered by newest first.
 * Useful for real-time updates when an image is uploaded.
 */
export const subscribeToGallery = (tripId: string, callback: (images: GalleryImage[]) => void) => {
    const q = query(
        collection(db, `trips/${tripId}/gallery`),
        orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
        const images: GalleryImage[] = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            images.push({
                id: doc.id,
                url: data.url,
                uploadedBy: data.uploadedBy,
                uploadedByName: data.uploadedByName || 'Unknown',
                createdAt: data.createdAt?.toDate() || new Date(),
                tripId: data.tripId,
                likes: data.likes || [],
                storagePath: data.storagePath
            });
        });
        callback(images);
    }, (error) => {
        console.error("Error subscribing to gallery:", error);
    });
};

/**
 * Toggles a like for the current user on a specific gallery image.
 */
import { doc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import { deleteObject } from 'firebase/storage';

export const toggleLikeImage = async (tripId: string, imageId: string, userId: string, isLiked: boolean) => {
    const imageRef = doc(db, `trips/${tripId}/gallery`, imageId);
    await updateDoc(imageRef, {
        likes: isLiked ? arrayRemove(userId) : arrayUnion(userId)
    });
};

/**
 * Deletes an image from Firestore and Storage.
 */
export const deleteImage = async (tripId: string, imageId: string, storagePath?: string) => {
    // Delete from Firestore
    await deleteDoc(doc(db, `trips/${tripId}/gallery`, imageId));

    // Delete from Storage if path is known
    if (storagePath) {
        try {
            const fileRef = ref(storage, storagePath);
            await deleteObject(fileRef);
        } catch (error) {
            console.error("Failed to delete from storage:", error);
        }
    }
};
