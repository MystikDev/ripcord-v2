'use client';

import { useState, type FormEvent } from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogClose } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useHubStore } from '../../stores/server-store';
import { apiFetch } from '../../lib/api';
import type { ReactNode } from 'react';

export function HubSettingsDialog({
  hub,
  trigger,
}: {
  hub: { id: string; name: string; ownerId: string };
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(hub.name);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const hubs = useHubStore((s) => s.hubs);
  const setHubs = useHubStore((s) => s.setHubs);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    if (trimmed === hub.name) {
      setOpen(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/v1/hubs/${hub.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error(res.error ?? 'Failed to update hub');
      // Update in store
      setHubs(hubs.map((h) => (h.id === hub.id ? { ...h, name: trimmed } : h)));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update hub');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setName(hub.name); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title="Hub Settings" description="Manage your hub settings.">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Hub name"
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
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
