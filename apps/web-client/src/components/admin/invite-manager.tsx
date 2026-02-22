'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/toast';
import {
  createInvite,
  listInvites,
  revokeInvite,
  type InviteResponse,
} from '@/lib/invite-api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isExpired(invite: InviteResponse): boolean {
  if (!invite.expiresAt) return false;
  return new Date(invite.expiresAt) < new Date();
}

function isExhausted(invite: InviteResponse): boolean {
  if (invite.maxUses === null) return false;
  return invite.uses >= invite.maxUses;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InviteManager({ hubId }: { hubId: string }) {
  const toast = useToast();
  const [invites, setInvites] = useState<InviteResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [maxUses, setMaxUses] = useState('');
  const [expiryHours, setExpiryHours] = useState('');
  const [creating, setCreating] = useState(false);

  const loadInvites = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listInvites(hubId);
      setInvites(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invites');
    } finally {
      setLoading(false);
    }
  }, [hubId]);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const options: { maxUses?: number; expiresAt?: string } = {};

      if (maxUses.trim()) {
        const parsed = parseInt(maxUses, 10);
        if (!isNaN(parsed) && parsed > 0) {
          options.maxUses = parsed;
        }
      }

      if (expiryHours.trim()) {
        const hours = parseInt(expiryHours, 10);
        if (!isNaN(hours) && hours > 0) {
          const expiry = new Date();
          expiry.setHours(expiry.getHours() + hours);
          options.expiresAt = expiry.toISOString();
        }
      }

      const invite = await createInvite(hubId, options);
      setInvites((prev) => [invite, ...prev]);
      setShowCreate(false);
      setMaxUses('');
      setExpiryHours('');

      // Copy to clipboard
      const inviteUrl = `${window.location.origin}/invite/${invite.code}`;
      await navigator.clipboard.writeText(inviteUrl);
      toast.success('Invite created and link copied to clipboard!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      await revokeInvite(hubId, inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success('Invite revoked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke invite');
    }
  };

  const handleCopyLink = async (code: string) => {
    const inviteUrl = `${window.location.origin}/invite/${code}`;
    await navigator.clipboard.writeText(inviteUrl);
    toast.info('Invite link copied!');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">Invites</h3>
        <Button
          size="sm"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? 'Cancel' : 'Create Invite'}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border border-border bg-surface-2/30 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Max uses (optional)"
              type="number"
              placeholder="Unlimited"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              min={1}
            />
            <Input
              label="Expires in hours (optional)"
              type="number"
              placeholder="Never"
              value={expiryHours}
              onChange={(e) => setExpiryHours(e.target.value)}
              min={1}
            />
          </div>
          <Button loading={creating} onClick={handleCreate}>
            Create & Copy Link
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Invites table */}
      <ScrollArea className="max-h-[400px]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="pb-2 pr-4 font-medium">Code</th>
              <th className="pb-2 pr-4 font-medium">Uses</th>
              <th className="pb-2 pr-4 font-medium">Expires</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => {
              const expired = isExpired(invite);
              const exhausted = isExhausted(invite);
              const status = expired
                ? 'Expired'
                : exhausted
                ? 'Exhausted'
                : 'Active';
              const statusColor = expired || exhausted
                ? 'text-text-muted'
                : 'text-green-400';

              return (
                <tr key={invite.id} className="border-b border-border/50 hover:bg-surface-2/50">
                  <td className="py-2 pr-4 font-mono text-xs text-text-primary">
                    {invite.code}
                  </td>
                  <td className="py-2 pr-4 text-text-secondary">
                    {invite.uses}{invite.maxUses !== null ? ` / ${invite.maxUses}` : ''}
                  </td>
                  <td className="py-2 pr-4 text-text-muted text-xs">
                    {invite.expiresAt ? formatDate(invite.expiresAt) : 'Never'}
                  </td>
                  <td className={`py-2 pr-4 text-xs font-medium ${statusColor}`}>
                    {status}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleCopyLink(invite.code)}
                        className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors"
                        title="Copy link"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => handleRevoke(invite.id)}
                        className="rounded-md px-2 py-1 text-xs text-danger hover:bg-danger/10 transition-colors"
                        title="Revoke invite"
                      >
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {invites.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-text-muted">
                  No invites created yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollArea>

      {loading && invites.length === 0 && (
        <div className="flex justify-center py-8">
          <span className="text-sm text-text-muted">Loading invites...</span>
        </div>
      )}
    </div>
  );
}
