import React, { useState, useEffect, useRef } from 'react';
import { Camera as CameraIcon, Image as ImageIcon, Download, Plus, RefreshCw, X } from 'lucide-react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { useAuth } from '../context/AuthContext';
import { useTrip, type Trip } from '../context/TripContext';
import { db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { uploadImageToGallery, subscribeToGallery, toggleLikeImage, deleteImage, updateImageTags, type GalleryImage, type UploadTags } from '../services/gallery';
import { getAllActivities, type Activity } from '../services/activities';
import { Heart, Trash2, Tag, Users, Edit3, ArrowDownAZ, Filter } from 'lucide-react';
import { createPortal } from 'react-dom';
import styles from './GalleryCamera.module.css';
import { useToast } from '../components/useToast';
import { ImageCropperModal } from '../components/ImageCropperModal';

type Mode = 'gallery' | 'camera';

interface TripMember {
    uid: string;
    name: string;
    avatarUrl?: string;
}

export const GalleryCamera: React.FC = () => {
    const toast = useToast();
    const { appUser } = useAuth();
    const { activeTrip } = useTrip();

    const [mode, setMode] = useState<Mode>('gallery');
    const [userTrips, setUserTrips] = useState<Trip[]>([]);
    const [selectedTripId, setSelectedTripId] = useState<string>(activeTrip?.id || '');
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [galleryLimit, setGalleryLimit] = useState(50);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);

    // ── Tagging modal state ────────────────
    const [pendingFiles, setPendingFiles] = useState<(File | Blob)[]>([]);
    const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
    const [pendingPreviewUrls, setPendingPreviewUrls] = useState<string[]>([]);
    const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
    const [showTagModal, setShowTagModal] = useState(false);
    const [tripActivities, setTripActivities] = useState<Activity[]>([]);
    const [tripMembers, setTripMembers] = useState<TripMember[]>([]);
    const [tagActivityId, setTagActivityId] = useState<string>('');
    const [tagActivityName, setTagActivityName] = useState<string>('');
    const [taggedMemberUids, setTaggedMemberUids] = useState<string[]>([]);

    // ── Sort & filter state ────────────────
    type SortMode = 'newest' | 'oldest' | 'mostLiked';
    const [sortBy, setSortBy] = useState<SortMode>('newest');
    const [filterActivityId, setFilterActivityId] = useState<string>(''); // '' = all
    const [filterTaggedUids, setFilterTaggedUids] = useState<string[]>([]); // empty = no member filter
    const [showFilterPanel, setShowFilterPanel] = useState(false);

    // ── Edit-tags modal (post-upload) ──────
    const [editingImage, setEditingImage] = useState<GalleryImage | null>(null);
    const [editTagActivityId, setEditTagActivityId] = useState('');
    const [editTagActivityName, setEditTagActivityName] = useState('');
    const [editTaggedMemberUids, setEditTaggedMemberUids] = useState<string[]>([]);
    const [savingEditTags, setSavingEditTags] = useState(false);

    const openEditTags = (img: GalleryImage) => {
        setEditingImage(img);
        setEditTagActivityId(img.activityId || '');
        setEditTagActivityName(img.activityName || '');
        setEditTaggedMemberUids(img.taggedMembers || []);
    };

    const canEditActivityForEditing = !!editingImage && (
        editingImage.uploadedBy === appUser?.uid || appUser?.role === 'admin'
    );

    const saveEditTags = async () => {
        if (!editingImage || !selectedTripId) return;
        setSavingEditTags(true);
        try {
            const tags: { activityId?: string | null; activityName?: string | null; taggedMembers: string[] } = {
                taggedMembers: editTaggedMemberUids,
            };
            if (canEditActivityForEditing) {
                tags.activityId = editTagActivityId || null;
                tags.activityName = editTagActivityName || null;
            }
            await updateImageTags(selectedTripId, editingImage.id, tags);
            setEditingImage(null);
        } catch (e) {
            console.error('Failed to update tags', e);
            toast.error('Could not save tags. Please try again.');
        } finally {
            setSavingEditTags(false);
        }
    };

    // Apply sort + filters to the raw subscription list.
    const visibleImages = React.useMemo(() => {
        let list = images;
        if (filterActivityId) list = list.filter(img => img.activityId === filterActivityId);
        if (filterTaggedUids.length > 0) {
            list = list.filter(img => filterTaggedUids.every(uid => img.taggedMembers?.includes(uid)));
        }
        const sorted = [...list];
        sorted.sort((a, b) => {
            if (sortBy === 'mostLiked') return (b.likes?.length || 0) - (a.likes?.length || 0);
            const aTime = a.createdAt?.getTime() || 0;
            const bTime = b.createdAt?.getTime() || 0;
            return sortBy === 'oldest' ? aTime - bTime : bTime - aTime;
        });
        return sorted;
    }, [images, sortBy, filterActivityId, filterTaggedUids]);

    const activeFilterCount = (filterActivityId ? 1 : 0) + (filterTaggedUids.length > 0 ? 1 : 0);

    useEffect(() => {
        const fetchTrips = async () => {
            if (!appUser?.trips || appUser.trips.length === 0) return;
            const tripsData: Trip[] = [];
            for (const tripId of appUser.trips) {
                const snap = await getDoc(doc(db, 'trips', tripId));
                if (snap.exists()) {
                    tripsData.push({ ...snap.data(), id: snap.id } as Trip);
                }
            }
            setUserTrips(tripsData);
            if (tripsData.length > 0) {
                setSelectedTripId(prev => prev || tripsData[0].id);
            }
        };
        fetchTrips();
    }, [appUser]);

    useEffect(() => {
        if (!selectedTripId) return;
        const unsubscribe = subscribeToGallery(selectedTripId, (newImages) => {
            setImages(newImages);
        }, galleryLimit);
        return () => unsubscribe();
    }, [selectedTripId, galleryLimit]);

    // Reset to first page when switching trips so we don't carry over an
    // expanded window from the previous trip.
    useEffect(() => {
        setGalleryLimit(50);
    }, [selectedTripId]);

    // Keep selectedTripId in sync if the user picks a different active trip elsewhere.
    useEffect(() => {
        if (activeTrip?.id && activeTrip.id !== selectedTripId) {
            setSelectedTripId(activeTrip.id);
        }
    }, [activeTrip?.id, selectedTripId]);

    // Fetch activities and members for the selected trip (for tagging + filter UI).
    useEffect(() => {
        if (!selectedTripId) {
            setTripActivities([]);
            setTripMembers([]);
            return;
        }
        // Activities are scoped server-side by tripId.
        getAllActivities(selectedTripId).then(setTripActivities).catch(console.error);

        // Members come from the trip's `members[]`. Filter out `mock_*` dev placeholders
        // so the tagger / filter UI only shows real users actually in this trip.
        const trip = userTrips.find(t => t.id === selectedTripId);
        const realMemberUids = (trip?.members || []).filter(uid => !uid.startsWith('mock_'));
        if (realMemberUids.length === 0) {
            setTripMembers([]);
            return;
        }
        Promise.all(
            realMemberUids.map(async (uid) => {
                try {
                    const snap = await getDoc(doc(db, 'users', uid));
                    if (snap.exists()) {
                        const d = snap.data();
                        return { uid, name: d.name || d.displayName || uid, avatarUrl: d.avatarUrl } as TripMember;
                    }
                } catch { /* ignore */ }
                return { uid, name: uid } as TripMember;
            })
        ).then(setTripMembers).catch(console.error);
    }, [selectedTripId, userTrips]);

    useEffect(() => {
        if (mode === 'camera') {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [mode]);

    const startCamera = async () => {
        try {
            setCameraError(null);
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
            streamRef.current = mediaStream;
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err: unknown) {
            console.error('Camera error:', err);
            const errorMsg = err instanceof Error ? err.message : String(err);
            setCameraError('Could not start camera. ' + errorMsg);
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    };

    // ── Open tagging modal ─────────────────
    const openTagModal = (files: (File | Blob)[]) => {
        if (files.length === 0) return;
        setPendingFiles(files);
        setPendingPreviewUrls(files.map(f => URL.createObjectURL(f)));
        setTagActivityId('');
        setTagActivityName('');
        setTaggedMemberUids([]);
        setShowTagModal(true);
    };

    const closeTagModal = () => {
        setShowTagModal(false);
        pendingPreviewUrls.forEach(url => URL.revokeObjectURL(url));
        setPendingFiles([]);
        setPendingPreviewUrls([]);
    };

    const handleCapture = () => {
        if (!videoRef.current || !canvasRef.current || !appUser) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (blob) openTagModal([blob]);
            }, 'image/jpeg', 0.9);
        }
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files ? Array.from(event.target.files) : [];
        if (files.length === 0) return;
        // Only single uploads get the crop step — batch uploads (vacation
        // dumps) skip it so you don't have to crop 20 photos one by one.
        if (files.length === 1) {
            setPendingCropFile(files[0]);
        } else {
            openTagModal(files);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ── Confirm upload with tags ───────────
    const confirmUpload = async (skip = false) => {
        if (pendingFiles.length === 0 || !selectedTripId || !appUser) return;
        const filesToUpload = pendingFiles;
        const previewsToRevoke = pendingPreviewUrls;
        setIsUploading(true);
        setShowTagModal(false);
        setUploadProgress({ current: 0, total: filesToUpload.length });
        const tags: UploadTags = skip ? {} : {
            activityId: tagActivityId || undefined,
            activityName: tagActivityName || undefined,
            taggedMembers: taggedMemberUids.length ? taggedMemberUids : undefined,
        };
        // Promise-pool: keep up to CONCURRENCY uploads in flight at once.
        // Sequential awaits used to make a 10-photo batch take 10× one upload's
        // network time; with a small pool we saturate the link instead.
        const CONCURRENCY = 4;
        let completed = 0;
        let failures = 0;
        const queue = [...filesToUpload];
        const runOne = async (file: File | Blob) => {
            try {
                await uploadImageToGallery(selectedTripId, file, appUser.uid, appUser.name, tags);
            } catch (error) {
                console.error('Upload error:', error);
                failures++;
            } finally {
                completed++;
                setUploadProgress({ current: completed, total: filesToUpload.length });
            }
        };
        const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
            while (queue.length > 0) {
                const next = queue.shift();
                if (!next) break;
                await runOne(next);
            }
        });
        await Promise.all(workers);
        if (failures > 0) {
            toast.error(failures === filesToUpload.length
                ? 'Failed to upload images.'
                : `${failures} of ${filesToUpload.length} uploads failed.`);
        }
        setIsUploading(false);
        setUploadProgress(null);
        previewsToRevoke.forEach(url => URL.revokeObjectURL(url));
        setPendingFiles([]);
        setPendingPreviewUrls([]);
    };

    const handleToggleLike = async (imageId: string, currentLikes: string[] = []) => {
        if (!appUser || !selectedTripId) return;
        const isLiked = currentLikes.includes(appUser.uid);
        try {
            await toggleLikeImage(selectedTripId, imageId, appUser.uid, isLiked);
        } catch (error) {
            console.error('Like error:', error);
        }
    };

    const handleDelete = async (imageId: string, storagePath?: string) => {
        if (!selectedTripId) return;
        if (window.confirm('Are you sure you want to delete this image?')) {
            try {
                await deleteImage(selectedTripId, imageId, storagePath);
            } catch (error) {
                console.error('Delete error:', error);
                toast.error('Failed to delete the image.');
            }
        }
    };

    const handleDownload = async (url: string, filename: string) => {
        const safeName = filename || 'tripmates-image.jpg';

        try {
            // Fetching the Firebase Storage URL via plain `fetch()` from
            // capacitor://localhost trips CORS preflight on the bucket
            // (the URL displays fine via <img> because img tags don't
            // enforce CORS, but JS fetch does). On native, route through
            // CapacitorHttp which makes the request natively and ferries
            // bytes back through the bridge — no CORS hop.
            let blob: Blob;
            if (Capacitor.isNativePlatform()) {
                const response = await CapacitorHttp.get({
                    url,
                    responseType: 'blob',
                });
                // CapacitorHttp returns blob bodies base64-encoded in `data`
                // because the WKWebView ↔ native bridge can't carry binary.
                const base64 = response.data as string;
                const binary = atob(base64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                const contentType = (response.headers?.['Content-Type']
                    || response.headers?.['content-type']
                    || 'image/jpeg') as string;
                blob = new Blob([bytes], { type: contentType });
            } else {
                const response = await fetch(url);
                blob = await response.blob();
            }

            const file = new File([blob], safeName, { type: blob.type || 'image/jpeg' });

            // Web Share API: on iOS this surfaces the native share sheet
            // with a "Save Image" action that writes to the Photos library.
            const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
            if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
                try {
                    await nav.share({ files: [file] });
                    return;
                } catch (shareErr) {
                    // User cancelled the share sheet — silent return.
                    if (shareErr instanceof Error && shareErr.name === 'AbortError') return;
                    console.warn('Share failed, falling back to download link', shareErr);
                }
            }

            // Desktop fallback: classic blob-link download.
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = safeName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Download error:', error);
            toast.error('Could not download image.');
        }
    };

    const isCamera = mode === 'camera';

    return (
        <div className={`${styles.fullscreen} ${isCamera ? styles.fullscreenCamera : styles.fullscreenGallery}`}>
            {/* Main Content Area */}
            <div className={styles.contentArea}>
                {/* CAMERA MODE */}
                {isCamera && (
                    <div className={styles.cameraContainer}>
                        <video ref={videoRef} autoPlay playsInline muted className={styles.cameraVideo} />
                        <canvas ref={canvasRef} className={styles.hiddenInput} />
                        {cameraError && (
                            <div className={styles.cameraError}>
                                <CameraIcon size={32} className={styles.galleryEmptyIcon} />
                                <p className={styles.cameraErrorText}>{cameraError}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* GALLERY MODE */}
                {!isCamera && (
                    <div className={styles.galleryContainer}>
                        {/* Sort & filter toolbar */}
                        {images.length > 0 && (
                            <div className={styles.galleryToolbar}>
                                <label className={styles.toolbarSortWrap}>
                                    <ArrowDownAZ size={14} />
                                    <select
                                        value={sortBy}
                                        onChange={e => setSortBy(e.target.value as SortMode)}
                                        className={styles.toolbarSelect}
                                    >
                                        <option value="newest">Newest first</option>
                                        <option value="oldest">Oldest first</option>
                                        <option value="mostLiked">Most liked</option>
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    className={`${styles.toolbarFilterBtn} ${activeFilterCount > 0 ? styles.toolbarFilterBtnActive : ''}`}
                                    onClick={() => setShowFilterPanel(v => !v)}
                                >
                                    <Filter size={14} />
                                    Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                                </button>
                            </div>
                        )}

                        {/* Filter panel */}
                        {showFilterPanel && (
                            <div className={styles.filterPanel}>
                                {tripActivities.length > 0 && (
                                    <div className={styles.filterSection}>
                                        <div className={styles.filterLabel}>Activity</div>
                                        <select
                                            value={filterActivityId}
                                            onChange={e => setFilterActivityId(e.target.value)}
                                            className={styles.toolbarSelect}
                                        >
                                            <option value="">All activities</option>
                                            {tripActivities.map(a => (
                                                <option key={a.id} value={a.id}>{a.locationName || a.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {tripMembers.length > 1 && (
                                    <div className={styles.filterSection}>
                                        <div className={styles.filterLabel}>Tagged members (must include all)</div>
                                        <div className={styles.tagChips}>
                                            {tripMembers.map(m => {
                                                const on = filterTaggedUids.includes(m.uid);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={m.uid}
                                                        className={`${styles.tagChip} ${on ? styles.tagChipActive : ''}`}
                                                        onClick={() => setFilterTaggedUids(prev =>
                                                            on ? prev.filter(u => u !== m.uid) : [...prev, m.uid]
                                                        )}
                                                    >
                                                        {m.name.split(' ')[0]}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {activeFilterCount > 0 && (
                                    <button
                                        type="button"
                                        className={styles.filterClearBtn}
                                        onClick={() => { setFilterActivityId(''); setFilterTaggedUids([]); }}
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>
                        )}

                        <div className={styles.galleryGrid}>
                            {images.length === 0 ? (
                                <div className={styles.galleryEmpty}>
                                    <ImageIcon size={48} className={styles.galleryEmptyIcon} />
                                    <p>No images yet. Switch to camera to take the first memory!</p>
                                </div>
                            ) : visibleImages.length === 0 ? (
                                <div className={styles.galleryEmpty}>
                                    <Filter size={32} className={styles.galleryEmptyIcon} />
                                    <p>No photos match your filters.</p>
                                </div>
                            ) : (
                                visibleImages.map((img: GalleryImage) => {
                                    const isLikedByMe = img.likes?.includes(appUser?.uid || '');
                                    const isUploader = img.uploadedBy === appUser?.uid || appUser?.role === 'admin';
                                    // Any trip member can open the tag editor — uploaders/admins get full
                                    // edit (activity + people), everyone else can only tag people.
                                    const canEditTags = true;
                                    return (
                                        <div key={img.id} className={styles.galleryItem}>
                                            <img src={img.url} alt="Gallery item" className={styles.galleryItemImage} loading="lazy" />
                                            {/* Activity tag pill */}
                                            {img.activityName && (
                                                <div className={styles.activityTagPill}>
                                                    <Tag size={10} />
                                                    {img.activityName}
                                                </div>
                                            )}
                                            <div className={styles.uploaderPill}>
                                                {img.uploadedByName?.split(' ')[0]}
                                            </div>
                                            <div className={styles.imageActions}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleToggleLike(img.id, img.likes); }}
                                                    className={styles.likeButton}
                                                    title={isLikedByMe ? 'Unlike' : 'Like'}
                                                >
                                                    <Heart size={18} fill={isLikedByMe ? 'var(--color-error)' : 'none'} color={isLikedByMe ? 'var(--color-error)' : '#fff'} />
                                                    <span className={styles.likeCount}>{img.likes?.length || 0}</span>
                                                </button>
                                                <div className={styles.actionButtons}>
                                                    {canEditTags && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); openEditTags(img); }}
                                                            className={styles.iconActionBtn}
                                                            title="Edit tags"
                                                        >
                                                            <Edit3 size={14} />
                                                        </button>
                                                    )}
                                                    {isUploader && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(img.id, img.storagePath); }}
                                                            className={styles.iconActionBtn}
                                                            title="Delete image"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDownload(img.url, `tripmates_${img.id}.jpg`); }}
                                                        className={styles.iconActionBtn}
                                                        title="Download image"
                                                    >
                                                        <Download size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Load more — only show if the current page is full,
                            implying more rows likely exist on the server. */}
                        {images.length > 0 && images.length >= galleryLimit && (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem 0 1.5rem' }}>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => setGalleryLimit(n => n + 50)}
                                    aria-label="Load older photos"
                                >
                                    Visa fler
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Bottom Control Panel */}
            <div className={`${styles.bottomPanel} ${isCamera ? styles.bottomPanelCamera : styles.bottomPanelGallery}`}>
                {/* Mode Selector Pill */}
                <div className={styles.modePillWrapper}>
                    <div className={`${styles.modePill} ${isCamera ? styles.modePillCamera : styles.modePillGallery}`}>
                        {(['gallery', 'camera'] as Mode[]).map(m => {
                            const isSelected = mode === m;
                            const label = m === 'gallery' ? 'Gallery' : 'Camera';
                            let btnClass = styles.modeBtn;
                            if (isSelected) {
                                btnClass += isCamera ? ` ${styles.modeBtnSelectedCamera}` : ` ${styles.modeBtnSelectedGallery}`;
                            } else {
                                btnClass += isCamera ? ` ${styles.modeBtnUnselectedCamera}` : ` ${styles.modeBtnUnselectedGallery}`;
                            }
                            return (
                                <button key={m} onClick={() => setMode(m)} className={btnClass}>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Primary Controls Row — single centered shutter / upload button.
                    The empty spacers keep the existing 1fr/auto/1fr grid balanced
                    so the button stays horizontally centered. */}
                <div className={styles.controlsRow}>
                    <div aria-hidden />
                    <div className={styles.shutterCenter}>
                        {isCamera ? (
                            <button
                                onClick={handleCapture}
                                disabled={isUploading || !!cameraError}
                                className={styles.shutterBtn}
                                title="Take photo"
                            >
                                <div className={`${styles.shutterInner} ${isUploading ? styles.shutterInnerCapturing : ''}`} />
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                    className={styles.uploadBtn}
                                    title="Upload photo"
                                >
                                    {isUploading ? <RefreshCw size={28} className="animate-spin" /> : <Plus size={32} />}
                                </button>
                                <input type="file" accept="image/*" multiple ref={fileInputRef} onChange={handleFileUpload} className={styles.hiddenInput} />
                            </>
                        )}
                    </div>
                    <div aria-hidden />
                </div>
            </div>

            {/* ── Edit Tags Modal (post-upload) ───────── */}
            {editingImage && createPortal(
                <div className={styles.tagModalBackdrop}>
                    <div className={styles.tagModal}>
                        <img src={editingImage.url} alt="Edit tags" className={styles.tagModalPreview} />
                        <div className={styles.tagModalBody}>
                            <h3 className={styles.tagModalTitle}>Edit tags</h3>

                            {canEditActivityForEditing && tripActivities.length > 0 && (
                                <div className={styles.tagSection}>
                                    <div className={styles.tagSectionLabel}><Tag size={14} /> Activity</div>
                                    <div className={styles.tagChips}>
                                        <button
                                            className={`${styles.tagChip} ${!editTagActivityId ? styles.tagChipActive : ''}`}
                                            onClick={() => { setEditTagActivityId(''); setEditTagActivityName(''); }}
                                        >
                                            None
                                        </button>
                                        {tripActivities.map(a => (
                                            <button
                                                key={a.id}
                                                className={`${styles.tagChip} ${editTagActivityId === a.id ? styles.tagChipActive : ''}`}
                                                onClick={() => { setEditTagActivityId(a.id || ''); setEditTagActivityName(a.locationName || a.title); }}
                                            >
                                                {a.locationName || a.title}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {tripMembers.length > 1 && (
                                <div className={styles.tagSection}>
                                    <div className={styles.tagSectionLabel}><Users size={14} /> Tag people</div>
                                    <div className={styles.tagChips}>
                                        {tripMembers.map(m => {
                                            const tagged = editTaggedMemberUids.includes(m.uid);
                                            return (
                                                <button
                                                    key={m.uid}
                                                    className={`${styles.tagChip} ${tagged ? styles.tagChipActive : ''}`}
                                                    onClick={() => setEditTaggedMemberUids(prev =>
                                                        tagged ? prev.filter(u => u !== m.uid) : [...prev, m.uid]
                                                    )}
                                                >
                                                    {m.name.split(' ')[0]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className={styles.tagModalActions}>
                                <button
                                    className={styles.tagSkipBtn}
                                    onClick={() => setEditingImage(null)}
                                    disabled={savingEditTags}
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary"
                                    style={{ flex: 1 }}
                                    onClick={saveEditTags}
                                    disabled={savingEditTags}
                                >
                                    {savingEditTags ? 'Saving…' : 'Save tags'}
                                </button>
                            </div>
                        </div>
                        <button
                            className={styles.tagModalClose}
                            onClick={() => setEditingImage(null)}
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {/* ── Tagging Modal ─────────────────────── */}
            {showTagModal && pendingPreviewUrls.length > 0 && createPortal(
                <div className={styles.tagModalBackdrop}>
                    <div className={styles.tagModal}>
                        {/* Preview */}
                        <img src={pendingPreviewUrls[0]} alt="Preview" className={styles.tagModalPreview} />
                        {pendingFiles.length > 1 && (
                            <div className={styles.tagModalCount}>
                                +{pendingFiles.length - 1} more
                            </div>
                        )}

                        <div className={styles.tagModalBody}>
                            <h3 className={styles.tagModalTitle}>
                                {pendingFiles.length === 1
                                    ? 'Tag this photo'
                                    : `Tag ${pendingFiles.length} photos`}
                            </h3>

                            {/* Activity picker */}
                            {tripActivities.length > 0 && (
                                <div className={styles.tagSection}>
                                    <div className={styles.tagSectionLabel}><Tag size={14} /> Activity</div>
                                    <div className={styles.tagChips}>
                                        <button
                                            className={`${styles.tagChip} ${!tagActivityId ? styles.tagChipActive : ''}`}
                                            onClick={() => { setTagActivityId(''); setTagActivityName(''); }}
                                        >
                                            None
                                        </button>
                                        {tripActivities.map(a => (
                                            <button
                                                key={a.id}
                                                className={`${styles.tagChip} ${tagActivityId === a.id ? styles.tagChipActive : ''}`}
                                                onClick={() => { setTagActivityId(a.id || ''); setTagActivityName(a.locationName || a.title); }}
                                            >
                                                {a.locationName || a.title}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Member tagger */}
                            {tripMembers.length > 1 && (
                                <div className={styles.tagSection}>
                                    <div className={styles.tagSectionLabel}><Users size={14} /> Tag people</div>
                                    <div className={styles.tagChips}>
                                        {tripMembers.map(m => {
                                            const tagged = taggedMemberUids.includes(m.uid);
                                            return (
                                                <button
                                                    key={m.uid}
                                                    className={`${styles.tagChip} ${tagged ? styles.tagChipActive : ''}`}
                                                    onClick={() => setTaggedMemberUids(prev =>
                                                        tagged ? prev.filter(u => u !== m.uid) : [...prev, m.uid]
                                                    )}
                                                >
                                                    {m.name.split(' ')[0]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className={styles.tagModalActions}>
                                <button
                                    className={styles.tagSkipBtn}
                                    onClick={() => confirmUpload(true)}
                                >
                                    Skip & Upload
                                </button>
                                <button
                                    className="btn btn-primary"
                                    style={{ flex: 1 }}
                                    onClick={() => confirmUpload(false)}
                                >
                                    Upload
                                </button>
                            </div>
                        </div>

                        {/* Close */}
                        <button
                            className={styles.tagModalClose}
                            onClick={closeTagModal}
                            aria-label="Close"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {/* ── Upload progress overlay (multi-file) ─────────────────────── */}
            {uploadProgress && uploadProgress.total > 1 && createPortal(
                <div className={styles.uploadProgressOverlay}>
                    <div className={styles.uploadProgressCard}>
                        <RefreshCw size={28} className="animate-spin" />
                        <div className={styles.uploadProgressText}>
                            Uploading {uploadProgress.current} of {uploadProgress.total}…
                        </div>
                    </div>
                </div>,
                document.body
            )}
            <ImageCropperModal
                file={pendingCropFile}
                title="Crop photo"
                onCropped={(cropped) => {
                    setPendingCropFile(null);
                    openTagModal([cropped]);
                }}
                onCancel={() => setPendingCropFile(null)}
            />
        </div>
    );
};
