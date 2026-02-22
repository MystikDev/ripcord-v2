// ---------------------------------------------------------------------------
// Canvas-based image crop utility
// ---------------------------------------------------------------------------

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropOptions {
  /** Output dimension (square). Default: 512 */
  outputSize?: number;
  /** MIME type for export. Default: 'image/jpeg' */
  mimeType?: string;
  /** JPEG quality (0-1). Default: 0.92 */
  quality?: number;
  /** Max output file size in bytes. Default: 512 * 1024 (512 KB) */
  maxFileSize?: number;
}

/**
 * Crop an image to a square region and export as a File.
 *
 * Uses an offscreen canvas to draw the cropped region scaled to the target
 * output size. If the resulting blob exceeds `maxFileSize`, it falls back
 * from PNG → JPEG or iteratively reduces JPEG quality.
 *
 * @param imageSrc  Object URL or data URL of the source image.
 * @param cropPixels  Pixel coordinates of the crop region (from react-easy-crop).
 * @param options  Optional output settings.
 * @returns A File object ready for upload.
 */
export async function cropImage(
  imageSrc: string,
  cropPixels: CropArea,
  options?: CropOptions,
): Promise<File> {
  const outputSize = options?.outputSize ?? 512;
  const maxFileSize = options?.maxFileSize ?? 512 * 1024;
  let mimeType = options?.mimeType ?? 'image/jpeg';
  let quality = options?.quality ?? 0.92;

  // GIF → export as PNG (canvas doesn't support GIF export)
  if (mimeType === 'image/gif') {
    mimeType = 'image/png';
  }

  // Load image
  const img = await loadImage(imageSrc);

  // Draw cropped region onto output canvas
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  ctx.drawImage(
    img,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  // Export to blob with size management
  let blob = await canvasToBlob(canvas, mimeType, quality);

  // If PNG is too large, fall back to JPEG
  if (blob.size > maxFileSize && mimeType === 'image/png') {
    mimeType = 'image/jpeg';
    quality = 0.92;
    blob = await canvasToBlob(canvas, mimeType, quality);
  }

  // If JPEG is still too large, reduce quality iteratively
  while (blob.size > maxFileSize && mimeType === 'image/jpeg' && quality > 0.6) {
    quality -= 0.05;
    blob = await canvasToBlob(canvas, mimeType, quality);
  }

  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  return new File([blob], `hub-icon.${ext}`, { type: mimeType });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = src;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      mimeType,
      quality,
    );
  });
}
