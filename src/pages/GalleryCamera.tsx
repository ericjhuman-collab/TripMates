import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera as CameraIcon, Image as ImageIcon, Download, Plus, RefreshCw, ChevronDown, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTrip, type Trip } from '../context/TripContext';
import { db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { uploadImageToGallery, subscribeToGallery, toggleLikeImage, deleteImage, updateImageTags, type GalleryImage, type UploadTags } from '../services/gallery';
import { getAllActivities, type Activity } from '../services/activities';
import { Heart, Trash2, Tag, Users, Edit3, ArrowDownAZ, Filter } from 'lucide-react';
import { createPortal } from 'react-dom';
import styles from './GalleryCamera.module.css';

type Mode = 'gallery' | 'camera';

interface TripMember {
    uid: string;
    name: string;
    avatarUrl?: string;
}

export const GalleryCamera: React.FC = () => {
    const navigate = useNavigate();
    const { appUser } = useAuth();
    const { activeTrip } = useTrip();

    const [mode, setMode] = useState<Mode>('gallery');
    const [userTrips, setUserTrips] = useState<Trip[]>([]);
    const [selectedTripId, setSelectedTripId] = useState<string>(activeTrip?.id || '');
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);

    // ── Tagging modal state ────────────────
    const [pendingFile, setPendingFile] = useState<File | Blob | null>(null);
    const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
    const [showTagModal, setShowTagModal] = useState(false);
    const [tripActivities, setTripActivities] = useState<Activity[]>([]);
    const [tripMembers, setTripMembers] = useState<TripMember[]>([]);
    const [tagActivityId, setTagActivityId] = useState<string>('');
    const [tagActivityName, setTagActivityName] = useState<string>('');
    const [taggedMemberUids, setTaggedMemberUids] = useState<string[]>([]);
    const [showTripPicker, setShowTripPicker] = useState(false);

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
            alert('Could not save tags. Please try again.');
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
        });
        return () => unsubscribe();
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
    const openTagModal = (file: File | Blob) => {
        setPendingFile(file);
        setPendingPreviewUrl(URL.createObjectURL(file));
        setTagActivityId('');
        setTagActivityName('');
        setTaggedMemberUids([]);
        setShowTagModal(true);
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
                if (blob) openTagModal(blob);
            }, 'image/jpeg', 0.9);
        }
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        openTagModal(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ── Confirm upload with tags ───────────
    const confirmUpload = async (skip = false) => {
        if (!pendingFile || !selectedTripId || !appUser) return;
        setIsUploading(true);
        setShowTagModal(false);
        try {
            const tags: UploadTags = skip ? {} : {
                activityId: tagActivityId || undefined,
                activityName: tagActivityName || undefined,
                taggedMembers: taggedMemberUids.length ? taggedMemberUids : undefined,
            };
            await uploadImageToGallery(selectedTripId, pendingFile, appUser.uid, appUser.name, tags);
        } catch (error) {
            console.error('Upload error:', error);
            alert('Failed to upload the image.');
        } finally {
            setIsUploading(false);
            if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
            setPendingFile(null);
            setPendingPreviewUrl(null);
        }
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
                alert('Failed to delete the image.');
            }
        }
    };

    const handleDownload = async (url: string, filename: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename || 'alen-image.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Download error:', error);
            window.open(url, '_blank');
        }
    };

    const selectedTripName = userTrips.find((t: Trip) => t.id === selectedTripId)?.name || 'Select Trip';
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
                                                        onClick={(e) => { e.stopPropagation(); handleDownload(img.url, `alen_${img.id}.jpg`); }}
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

                {/* Primary Controls Row */}
                <div className={styles.controlsRow}>
                    {/* Back Button */}
                    <button
                        onClick={() => navigate('/')}
                        className={`${styles.circleBtn} ${isCamera ? styles.circleBtnCamera : styles.circleBtnGallery}`}
                        title="Go back"
                    >
                        <ArrowLeft size={24} />
                    </button>

                    {/* Shutter / Upload Button */}
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
                                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className={styles.hiddenInput} />
                            </>
                        )}
                    </div>

                    {/* Trip Selector */}
                    <div className={styles.tripSelectorWrapper}>
                        <div
                            className={`${styles.tripSelectorDisplay} ${isCamera ? styles.tripSelectorDisplayCamera : styles.tripSelectorDisplayGallery}`}
                            onClick={() => setShowTripPicker(true)}
                            role="button"
                            tabIndex={0}
                        >
                            <span>{selectedTripName}</span>
                            <ChevronDown size={14} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Trip Picker Sheet */}
            {showTripPicker && createPortal(
                <div className={styles.tripPickerBackdrop} onClick={() => setShowTripPicker(false)}>
                    <div className={styles.tripPickerSheet} onClick={e => e.stopPropagation()}>
                        <div className={styles.tripPickerHandle} />
                        <h3 className={styles.tripPickerTitle}>Switch Trip</h3>
                        <div className={styles.tripPickerList}>
                            {userTrips.map((trip: Trip) => (
                                <button
                                    key={trip.id}
                                    className={`${styles.tripPickerItem} ${trip.id === selectedTripId ? styles.tripPickerItemActive : ''}`}
                                    onClick={() => { setSelectedTripId(trip.id); setShowTripPicker(false); }}
                                >
                                    <span>{trip.name}</span>
                                    {trip.id === selectedTripId && <span className={styles.tripPickerCheck}>✓</span>}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}

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
            {showTagModal && pendingPreviewUrl && createPortal(
                <div className={styles.tagModalBackdrop}>
                    <div className={styles.tagModal}>
                        {/* Preview */}
                        <img src={pendingPreviewUrl} alt="Preview" className={styles.tagModalPreview} />

                        <div className={styles.tagModalBody}>
                            <h3 className={styles.tagModalTitle}>Tag this photo</h3>

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
                            onClick={() => {
                                setShowTagModal(false);
                                setPendingFile(null);
                                if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
                                setPendingPreviewUrl(null);
                            }}
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
