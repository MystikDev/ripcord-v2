/**
 * @module icon-crop-dialog
 * Modal dialog wrapping react-easy-crop for cropping a hub icon
 * to a 1:1 aspect ratio before upload.
 */
'use client';

import { useCallback, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Dialog, DialogContent, DialogClose } from '../ui/dialog';
import { Button } from '../ui/button';
import { cropImage } from '../../lib/crop-image';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IconCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Object URL of the selected source image. */
  imageSrc: string;
  /** Original MIME type of the selected file (e.g. 'image/png'). */
  imageType: string;
  /** Called with the cropped File when the user confirms. */
  onCropConfirm: (croppedFile: File) => void;
  /** Crop aspect ratio. Default: 1 (square). Use 5/2 for banners. */
  aspect?: number;
  /** Dialog title. Default: 'Crop Hub Icon'. */
  title?: string;
  /** Output width override (non-square). */
  outputWidth?: number;
  /** Output height override (non-square). */
  outputHeight?: number;
  /** Output filename without extension. Default: 'hub-icon'. */
  fileName?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IconCropDialog({
  open,
  onOpenChange,
  imageSrc,
  imageType,
  onCropConfirm,
  aspect = 1,
  title = 'Crop Hub Icon',
  outputWidth,
  outputHeight,
  fileName,
}: IconCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);

  const handleCropComplete = useCallback(
    (_croppedArea: Area, croppedPixels: Area) => {
      setCroppedAreaPixels(croppedPixels);
    },
    [],
  );

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels) return;

    setCropping(true);
    try {
      // Preserve PNG transparency; everything else exports as JPEG
      const mimeType = imageType === 'image/png' ? 'image/png' : 'image/jpeg';

      const croppedFile = await cropImage(imageSrc, croppedAreaPixels, {
        mimeType,
        ...(outputWidth && outputHeight
          ? { outputWidth, outputHeight }
          : {}),
        ...(fileName ? { fileName } : {}),
      });
      onCropConfirm(croppedFile);
    } catch {
      // Propagate — parent will show a toast
      throw new Error('Failed to crop image');
    } finally {
      setCropping(false);
    }
  }, [croppedAreaPixels, imageSrc, imageType, onCropConfirm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description="Drag to reposition, scroll to zoom."
        className="max-w-lg"
      >
        {/* Crop viewport */}
        <div className="relative h-80 w-full overflow-hidden rounded-lg bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
            cropShape="rect"
            showGrid={false}
          />
        </div>

        {/* Zoom slider */}
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-text-muted">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-accent"
          />
        </div>

        {/* Actions */}
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button loading={cropping} onClick={handleConfirm}>
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
