/**
 * @module create-hub-dialog
 * Three-screen dialog: choose mode, create a new hub, or join an existing
 * hub via invite code/URL.
 */
'use client';

import { useState, type FormEvent } from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogClose } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useHubStore } from '../../stores/server-store';
import { createHub } from '../../lib/hub-api';
import { acceptInvite } from '../../lib/invite-api';
import type { ReactNode } from 'react';

type Mode = 'choose' | 'create' | 'join';

// ---------------------------------------------------------------------------
// Keep legacy export so nothing breaks
// ---------------------------------------------------------------------------
export const CreateHubDialog = AddHubDialog;

// ---------------------------------------------------------------------------
// AddHubDialog — Create or Join
// ---------------------------------------------------------------------------

export function AddHubDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('choose');

  // Create state
  const [name, setName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Join state
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  const setHubs = useHubStore((s) => s.setHubs);
  const hubs = useHubStore((s) => s.hubs);
  const setActiveHub = useHubStore((s) => s.setActiveHub);

  // Reset all state when dialog closes
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setMode('choose');
      setName('');
      setCreateError('');
      setCreating(false);
      setInviteCode('');
      setJoinError('');
      setJoining(false);
    }
  };

  // ---- Create Hub ----
  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setCreateError('Name must be at least 2 characters');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const hub = await createHub(trimmed);
      setHubs([...hubs, { id: hub.id, name: hub.name, ownerId: hub.ownerUserId, iconUrl: undefined }]);
      setActiveHub(hub.id);
      handleOpenChange(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create hub');
    } finally {
      setCreating(false);
    }
  };

  // ---- Join Hub ----
  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = inviteCode.trim();
    if (!trimmed) {
      setJoinError('Enter an invite code or link');
      return;
    }

    // Extract code from URL if pasted as full link
    const codeMatch = trimmed.match(/\/invite\/([A-Za-z0-9_-]+)/);
    const code = codeMatch ? codeMatch[1]! : trimmed;

    setJoining(true);
    setJoinError('');
    try {
      const result = await acceptInvite(code);
      setHubs([...hubs, { id: result.hubId, name: result.hubName, ownerId: '' }]);
      setActiveHub(result.hubId);
      handleOpenChange(false);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join hub');
    } finally {
      setJoining(false);
    }
  };

  // ---- Dialog title / description per mode ----
  const titles: Record<Mode, string> = {
    choose: 'Add a Hub',
    create: 'Create a Hub',
    join: 'Join a Hub',
  };
  const descriptions: Record<Mode, string> = {
    choose: 'Create your own hub or join one with an invite.',
    create: 'Give your new community a name.',
    join: 'Enter an invite code or paste an invite link.',
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={titles[mode]} description={descriptions[mode]}>
        {/* ---- Choice Screen ---- */}
        {mode === 'choose' && (
          <div className="flex flex-col gap-3">
            <Button onClick={() => setMode('create')} className="w-full">
              Create a Hub
            </Button>
            <Button variant="secondary" onClick={() => setMode('join')} className="w-full">
              Join with Invite Code
            </Button>
          </div>
        )}

        {/* ---- Create Form ---- */}
        {mode === 'create' && (
          <form onSubmit={handleCreate} className="space-y-4">
            <Input
              label="Hub name"
              placeholder="My Awesome Hub"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={createError}
              maxLength={100}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setMode('choose')}>
                Back
              </Button>
              <Button type="submit" loading={creating} disabled={!name.trim()}>
                Create Hub
              </Button>
            </div>
          </form>
        )}

        {/* ---- Join Form ---- */}
        {mode === 'join' && (
          <form onSubmit={handleJoin} className="space-y-4">
            <Input
              label="Invite code or link"
              placeholder="AbCd1234 or https://ripcord.gg/invite/..."
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              error={joinError}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setMode('choose')}>
                Back
              </Button>
              <Button type="submit" loading={joining} disabled={!inviteCode.trim()}>
                Join Hub
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
