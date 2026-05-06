import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area } from 'react-easy-crop';
import { Loader2 } from 'lucide-react';
import styles from './ImageCropperModal.module.css';

interface Props {
    /** The file the user just picked. The cropper opens immediately. */
    file: File | null;
    /** Width:height ratio. Pass undefined for free-form crop. */
    aspect?: number;
    /** Show a circular crop overlay (still produces a square file). */
    cropShape?: 'rect' | 'round';
    /** Title shown in the header (e.g. "Crop avatar"). */
    title?: string;
    /** JPEG quality 0-1 for the output file. Default 0.92. */
    outputQuality?: number;
    /** Maximum output dimension (longest side). Output is scaled down if
     *  the cropped pixel area exceeds this. Default 2000. */
    maxOutputSize?: number;
    /** Called with the cropped File when user taps Apply. */
    onCropped: (file: File) => void;
    /** Called when user cancels (or closes modal). */
    onCancel: () => void;
}

const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });

const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = src;
    });

async function cropToFile(
    src: string,
    area: Area,
    originalName: string,
    quality: number,
    maxSize: number,
): Promise<File> {
    const img = await loadImage(src);

    // Scale down if the cropped pixel area exceeds maxSize on the longest side.
    const longest = Math.max(area.width, area.height);
    const scale = longest > maxSize ? maxSize / longest : 1;
    const outW = Math.round(area.width * scale);
    const outH = Math.round(area.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(
        img,
        area.x, area.y, area.width, area.height,
        0, 0, outW, outH,
    );

    return new Promise<File>((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
            const baseName = originalName.replace(/\.[^./\\]+$/, '') || 'image';
            const file = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
            resolve(file);
        }, 'image/jpeg', quality);
    });
}

export const ImageCropperModal: React.FC<Props> = ({
    file,
    aspect,
    cropShape = 'rect',
    title = 'Crop image',
    outputQuality = 0.92,
    maxOutputSize = 2000,
    onCropped,
    onCancel,
}) => {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [busy, setBusy] = useState(false);
    const croppedAreaPixelsRef = useRef<Area | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (!file) {
            setImageSrc(null);
            return () => { cancelled = true; };
        }
        readFileAsDataUrl(file).then(src => {
            if (!cancelled) {
                setImageSrc(src);
                setCrop({ x: 0, y: 0 });
                setZoom(1);
                croppedAreaPixelsRef.current = null;
            }
        }).catch(err => {
            console.error('Failed to read file for cropping', err);
            if (!cancelled) onCancel();
        });
        return () => { cancelled = true; };
    }, [file, onCancel]);

    const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
        croppedAreaPixelsRef.current = croppedAreaPixels;
    }, []);

    const handleApply = useCallback(async () => {
        if (!imageSrc || !file || !croppedAreaPixelsRef.current) return;
        setBusy(true);
        try {
            const cropped = await cropToFile(
                imageSrc,
                croppedAreaPixelsRef.current,
                file.name,
                outputQuality,
                maxOutputSize,
            );
            onCropped(cropped);
        } catch (err) {
            console.error('Crop failed', err);
        } finally {
            setBusy(false);
        }
    }, [imageSrc, file, outputQuality, maxOutputSize, onCropped]);

    if (!file || !imageSrc) return null;

    return createPortal(
        <div className={styles.backdrop}>
            <div className={styles.header}>
                <button onClick={onCancel} className={styles.cancelBtn} disabled={busy}>Cancel</button>
                <h3 className={styles.title}>{title}</h3>
                <span style={{ width: '4rem' }} />
            </div>
            <div className={styles.cropArea}>
                <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={aspect}
                    cropShape={cropShape}
                    showGrid={cropShape !== 'round'}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={onCropComplete}
                    objectFit="contain"
                />
            </div>
            <div className={styles.controls}>
                <div className={styles.zoomRow}>
                    <span className={styles.zoomLabel}>Zoom</span>
                    <input
                        type="range"
                        min={1}
                        max={4}
                        step={0.01}
                        value={zoom}
                        onChange={e => setZoom(Number(e.target.value))}
                        className={styles.zoomSlider}
                        aria-label="Zoom"
                    />
                </div>
                <button onClick={handleApply} className={styles.applyBtn} disabled={busy}>
                    {busy ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : 'Apply crop'}
                </button>
            </div>
        </div>,
        document.body,
    );
};
