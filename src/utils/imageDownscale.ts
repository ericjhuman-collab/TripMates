// Downscales an image File so the long side is at most `maxDim` pixels and re-encodes
// as JPEG at the given quality. Used to shrink iPhone-size receipt photos (4–8 MB)
// to ~200–500 KB before sending to OCR — most of the original resolution is wasted on
// noise from the camera sensor and only inflates the upload payload.
//
// Returns the original File untouched if it's already smaller than maxDim and not
// worth re-encoding (e.g. a screenshot or a previously-scanned receipt).

export const downscaleImage = async (
    file: File,
    maxDim = 1600,
    quality = 0.82
): Promise<File> => {
    // Don't touch SVG or other non-raster types
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;

    const url = URL.createObjectURL(file);
    try {
        const img = await loadImage(url);
        const longSide = Math.max(img.naturalWidth, img.naturalHeight);
        if (longSide <= maxDim) return file;

        const scale = maxDim / longSide;
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.drawImage(img, 0, 0, w, h);

        const blob = await new Promise<Blob | null>(resolve =>
            canvas.toBlob(resolve, 'image/jpeg', quality)
        );
        if (!blob) return file;
        // If the re-encode somehow ended up larger, keep the original
        if (blob.size >= file.size) return file;

        const newName = file.name.replace(/\.(png|webp|jpeg|jpg)$/i, '.jpg');
        return new File([blob], newName, { type: 'image/jpeg', lastModified: file.lastModified });
    } finally {
        URL.revokeObjectURL(url);
    }
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to decode image for downscale'));
        img.src = src;
    });
