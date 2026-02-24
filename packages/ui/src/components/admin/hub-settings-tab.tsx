/**
 * @module hub-settings-tab
 * Admin settings panel for hub icon upload (with crop dialog), hub rename,
 * and danger-zone hub deletion. Deletion is owner-only and requires typing
 * the hub name to confirm.
 */
'use client';

import { useCallback, useRef, useState, type FormEvent } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useHubStore } from '../../stores/server-store';
import { useAuthStore } from '../../stores/auth-store';
import { useToast } from '../ui/toast';
import { apiFetch } from '../../lib/api';
import { deleteHub } from '../../lib/roles-api';
import { uploadHubIcon, deleteHubIcon } from '../../lib/hub-api';
import { getApiBaseUrl } from '../../lib/constants';
import { IconCropDialog } from './icon-crop-dialog';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);
const MAX_INPUT_FILE_SIZE = 5 * 1024 * 1024; // 5 MB (source image, before crop)
const MIN_DIMENSION = 128;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reject images that are too small to produce a decent 512×512 icon. */
function validateMinDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width < MIN_DIMENSION || img.height < MIN_DIMENSION) {
        reject(new Error(`Image must be at least ${MIN_DIMENSION}x${MIN_DIMENSION} pixels`));
      } else {
        resolve({ width: img.width, height: img.height });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HubSettingsTab({ hubId, hubName }: { hubId: string; hubName: string }) {
  const toast = useToast();
  const hubs = useHubStore((s) => s.hubs);
  const setHubs = useHubStore((s) => s.setHubs);
  const setActiveHub = useHubStore((s) => s.setActiveHub);
  const currentUserId = useAuthStore((s) => s.userId);

  const hub = hubs.find((h) => h.id === hubId);
  const isOwner = hub?.ownerId === currentUserId;

  // Icon state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [iconUploading, setIconUploading] = useState(false);
  const [iconRemoving, setIconRemoving] = useState(false);

  // Crop dialog state
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropImageType, setCropImageType] = useState('image/jpeg');

  // Rename state
  const [name, setName] = useState(hubName);
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Icon file selection — validates, then opens crop dialog
  const handleIconSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    // Validate type
    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error('Icon must be a JPG, PNG, or GIF image');
      return;
    }

    // Validate input file size (generous limit — will be cropped down)
    if (file.size > MAX_INPUT_FILE_SIZE) {
      toast.error('Image file must be under 5 MB');
      return;
    }

    // Validate minimum dimensions
    try {
      await validateMinDimensions(file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid image');
      return;
    }

    // Open crop dialog
    setCropImageSrc(URL.createObjectURL(file));
    setCropImageType(file.type);
    setCropDialogOpen(true);
  }, [toast]);

  // Crop confirmed — upload the cropped file
  const handleCropConfirm = useCallback(async (croppedFile: File) => {
    // Close dialog and clean up object URL
    setCropDialogOpen(false);
    if (cropImageSrc) {
      URL.revokeObjectURL(cropImageSrc);
      setCropImageSrc(null);
    }

    // Upload the cropped file
    setIconUploading(true);
    try {
      await uploadHubIcon(hubId, croppedFile);
      const newIconUrl = `${getApiBaseUrl()}/v1/hubs/${hubId}/icon?t=${Date.now()}`;
      setHubs(hubs.map((h) => (h.id === hubId ? { ...h, iconUrl: newIconUrl } : h)));
      toast.success('Hub icon updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload icon');
    } finally {
      setIconUploading(false);
    }
  }, [hubId, hubs, setHubs, toast, cropImageSrc]);

  // Clean up object URL when crop dialog is closed without confirming
  const handleCropDialogChange = useCallback((open: boolean) => {
    setCropDialogOpen(open);
    if (!open && cropImageSrc) {
      URL.revokeObjectURL(cropImageSrc);
      setCropImageSrc(null);
    }
  }, [cropImageSrc]);

  // Icon remove handler
  const handleIconRemove = useCallback(async () => {
    setIconRemoving(true);
    try {
      await deleteHubIcon(hubId);
      setHubs(hubs.map((h) => (h.id === hubId ? { ...h, iconUrl: undefined } : h)));
      toast.success('Hub icon removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove icon');
    } finally {
      setIconRemoving(false);
    }
  }, [hubId, hubs, setHubs, toast]);

  // Rename handler
  const handleRename = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setRenameError('Name must be at least 2 characters');
      return;
    }
    if (trimmed === hubName) {
      toast.info('No changes to save');
      return;
    }
    setRenaming(true);
    setRenameError('');
    try {
      const res = await apiFetch(`/v1/hubs/${hubId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error(res.error ?? 'Failed to update hub');
      setHubs(hubs.map((h) => (h.id === hubId ? { ...h, name: trimmed } : h)));
      toast.success('Hub name updated');
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setRenaming(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (deleteConfirm !== hubName) return;
    setDeleteLoading(true);
    try {
      await deleteHub(hubId);
      toast.success('Hub deleted');
      // Remove from store and switch to first remaining hub
      const remaining = hubs.filter((h) => h.id !== hubId);
      setHubs(remaining);
      if (remaining.length > 0) {
        setActiveHub(remaining[0]!.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete hub');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Hub Icon section */}
      <section>
        <h3 className="mb-3 text-base font-semibold text-text-primary">Hub Icon</h3>
        <div className="flex items-center gap-4">
          {/* Preview */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-surface-2 overflow-hidden">
            {hub?.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hub.iconUrl}
                alt={hubName}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold text-text-secondary">
                {hubName.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs text-text-muted">
              JPG, PNG, or GIF. Image will be cropped to 512×512px.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={iconUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload Icon
              </Button>
              {hub?.iconUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={iconRemoving}
                  onClick={handleIconRemove}
                >
                  Remove
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif"
              className="hidden"
              onChange={handleIconSelect}
            />
          </div>
        </div>

        {/* Crop dialog */}
        {cropImageSrc && (
          <IconCropDialog
            open={cropDialogOpen}
            onOpenChange={handleCropDialogChange}
            imageSrc={cropImageSrc}
            imageType={cropImageType}
            onCropConfirm={handleCropConfirm}
          />
        )}
      </section>

      {/* Rename section */}
      <section>
        <h3 className="mb-3 text-base font-semibold text-text-primary">Hub Name</h3>
        <form onSubmit={handleRename} className="max-w-md space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={renameError}
            maxLength={100}
          />
          <Button type="submit" loading={renaming} disabled={!name.trim()}>
            Save
          </Button>
        </form>
      </section>

      {/* Danger zone — owner only */}
      {isOwner && (
        <section className="rounded-lg border border-danger/30 p-4">
          <h3 className="mb-1 text-base font-semibold text-danger">Danger Zone</h3>
          <p className="mb-4 text-sm text-text-muted">
            Deleting a hub is permanent. All channels, messages, members, and roles will be removed.
          </p>

          <div className="max-w-md space-y-3">
            <Input
              label={`Type "${hubName}" to confirm`}
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={hubName}
            />
            <Button
              variant="danger"
              loading={deleteLoading}
              disabled={deleteConfirm !== hubName}
              onClick={handleDelete}
            >
              Delete Hub
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
