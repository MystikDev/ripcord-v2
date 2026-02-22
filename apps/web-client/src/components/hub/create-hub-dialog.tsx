'use client';

import { useState, type FormEvent } from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useHubStore } from '@/stores/server-store';
import { createHub } from '@/lib/hub-api';
import type { ReactNode } from 'react';

export function CreateHubDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setHubs = useHubStore((s) => s.setHubs);
  const hubs = useHubStore((s) => s.hubs);
  const setActiveHub = useHubStore((s) => s.setActiveHub);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const hub = await createHub(trimmed);
      // Add to store and select
      setHubs([...hubs, { id: hub.id, name: hub.name, ownerId: hub.ownerUserId, iconUrl: undefined }]);
      setActiveHub(hub.id);
      setName('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create hub');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title="Create a Hub" description="Give your new community a name.">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Hub name"
            placeholder="My Awesome Hub"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error}
            maxLength={100}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" type="button">Cancel</Button>
            </DialogClose>
            <Button type="submit" loading={loading} disabled={!name.trim()}>
              Create Hub
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
