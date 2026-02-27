/**
 * @module hub-settings-tab
 * Admin settings panel for hub icon upload (with crop dialog), hub banner
 * upload, hub rename, and danger-zone hub deletion. Deletion is owner-only
 * and requires typing the hub name to confirm.
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
import { uploadHubIcon, deleteHubIcon, uploadHubBanner, deleteHubBanner } from '../../lib/hub-api';
import { getApiBaseUrl } from '../../lib/constants';
import { IconCropDialog } from './icon-crop-dialog';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);
const MAX_INPUT_FILE_SIZE = 5 * 1024 * 1024; // 5 MB (source image, before crop)

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

  // Icon crop dialog state
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropImageType, setCropImageType] = useState('image/jpeg');

  // Banner state
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerRemoving, setBannerRemoving] = useState(false);

  // Banner crop dialog state
  const [bannerCropOpen, setBannerCropOpen] = useState(false);
  const [bannerCropSrc, setBannerCropSrc] = useState<string | null>(null);
  const [bannerCropType, setBannerCropType] = useState('image/jpeg');

  // Rename state
  const [name, setName] = useState(hubName);
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ----- Icon handlers -----

  const handleIconSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error('Icon must be a JPG, PNG, or GIF image');
      return;
    }
    if (file.size > MAX_INPUT_FILE_SIZE) {
      toast.error('Image file must be under 5 MB');
      return;
    }

    setCropImageSrc(URL.createObjectURL(file));
    setCropImageType(file.type);
    setCropDialogOpen(true);
  }, [toast]);

  const handleCropConfirm = useCallback(async (croppedFile: File) => {
    setCropDialogOpen(false);
    if (cropImageSrc) {
      URL.revokeObjectURL(cropImageSrc);
      setCropImageSrc(null);
    }

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

  const handleCropDialogChange = useCallback((open: boolean) => {
    setCropDialogOpen(open);
    if (!open && cropImageSrc) {
      URL.revokeObjectURL(cropImageSrc);
      setCropImageSrc(null);
    }
  }, [cropImageSrc]);

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

  // ----- Banner handlers -----

  const handleBannerSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (bannerInputRef.current) bannerInputRef.current.value = '';
    if (!file) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error('Banner must be a JPG, PNG, or GIF image');
      return;
    }
    if (file.size > MAX_INPUT_FILE_SIZE) {
      toast.error('Image file must be under 5 MB');
      return;
    }

    setBannerCropSrc(URL.createObjectURL(file));
    setBannerCropType(file.type);
    setBannerCropOpen(true);
  }, [toast]);

  const handleBannerCropConfirm = useCallback(async (croppedFile: File) => {
    setBannerCropOpen(false);
    if (bannerCropSrc) {
      URL.revokeObjectURL(bannerCropSrc);
      setBannerCropSrc(null);
    }

    setBannerUploading(true);
    try {
      await uploadHubBanner(hubId, croppedFile);
      const newBannerUrl = `${getApiBaseUrl()}/v1/hubs/${hubId}/banner?t=${Date.now()}`;
      setHubs(hubs.map((h) => (h.id === hubId ? { ...h, bannerUrl: newBannerUrl } : h)));
      toast.success('Hub banner updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload banner');
    } finally {
      setBannerUploading(false);
    }
  }, [hubId, hubs, setHubs, toast, bannerCropSrc]);

  const handleBannerCropDialogChange = useCallback((open: boolean) => {
    setBannerCropOpen(open);
    if (!open && bannerCropSrc) {
      URL.revokeObjectURL(bannerCropSrc);
      setBannerCropSrc(null);
    }
  }, [bannerCropSrc]);

  const handleBannerRemove = useCallback(async () => {
    setBannerRemoving(true);
    try {
      await deleteHubBanner(hubId);
      setHubs(hubs.map((h) => (h.id === hubId ? { ...h, bannerUrl: undefined } : h)));
      toast.success('Hub banner removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove banner');
    } finally {
      setBannerRemoving(false);
    }
  }, [hubId, hubs, setHubs, toast]);

  // ----- Rename handler -----

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

  // ----- Delete handler -----

  const handleDelete = async () => {
    if (deleteConfirm !== hubName) return;
    setDeleteLoading(true);
    try {
      await deleteHub(hubId);
      toast.success('Hub deleted');
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

        {/* Icon crop dialog */}
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

      {/* Hub Banner section */}
      <section>
        <h3 className="mb-3 text-base font-semibold text-text-primary">Hub Banner</h3>
        <div className="flex flex-col gap-3">
          {/* Banner preview */}
          <div className="h-24 w-full max-w-md overflow-hidden rounded-lg bg-surface-2">
            {hub?.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hub.bannerUrl}
                alt={`${hubName} banner`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-muted">
                No banner set
              </div>
            )}
          </div>

          <p className="text-xs text-text-muted">
            JPG, PNG, or GIF. Banner will be cropped to 960×384px (5:2 ratio).
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={bannerUploading}
              onClick={() => bannerInputRef.current?.click()}
            >
              Upload Banner
            </Button>
            {hub?.bannerUrl && (
              <Button
                variant="ghost"
                size="sm"
                loading={bannerRemoving}
                onClick={handleBannerRemove}
              >
                Remove
              </Button>
            )}
          </div>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif"
            className="hidden"
            onChange={handleBannerSelect}
          />
        </div>

        {/* Banner crop dialog */}
        {bannerCropSrc && (
          <IconCropDialog
            open={bannerCropOpen}
            onOpenChange={handleBannerCropDialogChange}
            imageSrc={bannerCropSrc}
            imageType={bannerCropType}
            onCropConfirm={handleBannerCropConfirm}
            aspect={5 / 2}
            title="Crop Hub Banner"
            outputWidth={960}
            outputHeight={384}
            fileName="hub-banner"
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
