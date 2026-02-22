'use client';

import { useState, type FormEvent } from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useHubStore } from '@/stores/server-store';
import { createChannel } from '@/lib/hub-api';
import type { ReactNode } from 'react';
import clsx from 'clsx';

export function CreateChannelDialog({ hubId, trigger }: { hubId: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'voice'>('text');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const channels = useHubStore((s) => s.channels);
  const setChannels = useHubStore((s) => s.setChannels);
  const setActiveChannel = useHubStore((s) => s.setActiveChannel);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim().toLowerCase().replace(/\s+/g, '-');
    if (trimmed.length < 1) {
      setError('Channel name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const channel = await createChannel(hubId, trimmed, type);
      const newChannel = {
        id: channel.id,
        hubId: channel.hubId,
        name: channel.name,
        type: channel.type,
        position: channels.length,
      };
      setChannels([...channels, newChannel]);
      if (type === 'text') {
        setActiveChannel(channel.id);
      }
      setName('');
      setType('text');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title="Create Channel" description="Add a new channel to this hub.">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Channel name"
            placeholder="general"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error}
            maxLength={100}
            autoFocus
          />

          {/* Channel type selector */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-secondary">Channel type</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('text')}
                className={clsx(
                  'flex-1 rounded-lg border p-3 text-left text-sm transition-colors',
                  type === 'text'
                    ? 'border-accent bg-accent/10 text-text-primary'
                    : 'border-border bg-surface-2 text-text-muted hover:border-text-muted',
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2.5 3.5A1.5 1.5 0 014 2h8a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0112 12H5.5L2.5 14.5v-11z" />
                  </svg>
                  Text
                </div>
                <p className="mt-1 text-xs text-text-muted">Send messages and files</p>
              </button>
              <button
                type="button"
                onClick={() => setType('voice')}
                className={clsx(
                  'flex-1 rounded-lg border p-3 text-left text-sm transition-colors',
                  type === 'voice'
                    ? 'border-accent bg-accent/10 text-text-primary'
                    : 'border-border bg-surface-2 text-text-muted hover:border-text-muted',
                )}
              >
                <div className="flex items-center gap-2 font-medium">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1a2 2 0 00-2 2v4a2 2 0 104 0V3a2 2 0 00-2-2zM4 7a1 1 0 00-2 0 6 6 0 0012 0 1 1 0 10-2 0 4 4 0 01-8 0z" />
                  </svg>
                  Voice
                </div>
                <p className="mt-1 text-xs text-text-muted">Talk with voice and video</p>
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" type="button">Cancel</Button>
            </DialogClose>
            <Button type="submit" loading={loading} disabled={!name.trim()}>
              Create Channel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
