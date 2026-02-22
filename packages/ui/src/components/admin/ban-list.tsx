'use client';

import { useState, useEffect, useCallback } from 'react';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { useToast } from '../ui/toast';
import { listBans, unbanMember } from '../../lib/admin-api';
import { useAdminStore } from '../../stores/admin-store';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function BanList({ hubId }: { hubId: string }) {
  const bans = useAdminStore((s) => s.bans);
  const setBans = useAdminStore((s) => s.setBans);
  const removeBan = useAdminStore((s) => s.removeBan);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unbanningId, setUnbanningId] = useState<string | null>(null);
  const toast = useToast();

  const loadBans = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listBans(hubId);
      setBans(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bans');
    } finally {
      setLoading(false);
    }
  }, [hubId, setBans]);

  useEffect(() => {
    setBans([]);
    loadBans();
  }, [hubId, loadBans, setBans]);

  const handleUnban = async (userId: string) => {
    setUnbanningId(userId);
    try {
      await unbanMember(hubId, userId);
      removeBan(userId);
      toast.success('Member unbanned');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unban member');
    } finally {
      setUnbanningId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">
          Bans{bans.length > 0 ? ` (${bans.length})` : ''}
        </h2>
      </div>

      {error && (
        <div className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <ScrollArea className="max-h-[500px]">
        <div className="space-y-1">
          {bans.map((ban) => (
            <div
              key={ban.userId}
              className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2/50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary font-mono">
                  {ban.userId.slice(0, 8)}...
                </p>
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span>Banned {formatDate(ban.bannedAt)}</span>
                  {ban.reason && (
                    <>
                      <span>&middot;</span>
                      <span className="truncate">{ban.reason}</span>
                    </>
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={unbanningId === ban.userId}
                onClick={() => handleUnban(ban.userId)}
              >
                Unban
              </Button>
            </div>
          ))}

          {bans.length === 0 && !loading && (
            <p className="py-8 text-center text-sm text-text-muted">
              No bans found.
            </p>
          )}
        </div>
      </ScrollArea>

      {loading && bans.length === 0 && (
        <div className="flex justify-center py-8">
          <span className="text-sm text-text-muted">Loading bans...</span>
        </div>
      )}
    </div>
  );
}
