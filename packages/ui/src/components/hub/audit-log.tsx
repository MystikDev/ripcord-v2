'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { fetchAuditLog, type AuditEventResponse } from '../../lib/audit-api';

// ---------------------------------------------------------------------------
// Action colour helpers
// ---------------------------------------------------------------------------

const DESTRUCTIVE_ACTIONS = new Set([
  'CHANNEL_DELETED',
  'MESSAGE_DELETED',
  'MEMBER_KICKED',
  'MEMBER_BANNED',
  'MEMBER_LEFT',
  'SESSION_REVOKED',
  'SESSION_REUSE_DETECTED',
  'HUB_DELETED',
  'ROLE_DELETED',
  'ROLE_UNASSIGNED',
]);

const MODIFICATION_ACTIONS = new Set([
  'HUB_UPDATED',
  'ROLE_UPDATED',
  'PERMISSION_CHANGED',
  'KEY_ROTATION',
  'MEMBER_UNBANNED',
  'ROLE_ASSIGNED',
]);

const CREATION_ACTIONS = new Set([
  'HUB_CREATED',
  'CHANNEL_CREATED',
  'ROLE_CREATED',
  'FILE_UPLOADED',
  'KEY_BUNDLE_UPLOADED',
  'USER_REGISTER',
  'MEMBER_JOINED',
]);

function actionColorClass(action: string): string {
  if (DESTRUCTIVE_ACTIONS.has(action)) return 'text-red-400';
  if (MODIFICATION_ACTIONS.has(action)) return 'text-yellow-400';
  if (CREATION_ACTIONS.has(action)) return 'text-green-400';
  return 'text-blue-400';
}

function actionBgClass(action: string): string {
  if (DESTRUCTIVE_ACTIONS.has(action)) return 'bg-red-400/10';
  if (MODIFICATION_ACTIONS.has(action)) return 'bg-yellow-400/10';
  if (CREATION_ACTIONS.has(action)) return 'bg-green-400/10';
  return 'bg-blue-400/10';
}

// ---------------------------------------------------------------------------
// All known action types for filter dropdown
// ---------------------------------------------------------------------------

const ALL_ACTIONS = [
  'USER_REGISTER',
  'USER_LOGIN',
  'USER_LOGOUT',
  'SESSION_CREATED',
  'SESSION_REVOKED',
  'SESSION_REUSE_DETECTED',
  'KEY_BUNDLE_UPLOADED',
  'KEY_ROTATION',
  'PREKEY_CLAIMED',
  'HUB_CREATED',
  'HUB_UPDATED',
  'HUB_DELETED',
  'CHANNEL_CREATED',
  'CHANNEL_DELETED',
  'ROLE_CREATED',
  'ROLE_UPDATED',
  'ROLE_DELETED',
  'ROLE_ASSIGNED',
  'ROLE_UNASSIGNED',
  'MEMBER_JOINED',
  'MEMBER_LEFT',
  'MEMBER_KICKED',
  'MEMBER_BANNED',
  'MEMBER_UNBANNED',
  'MESSAGE_SENT',
  'MESSAGE_DELETED',
  'PERMISSION_CHANGED',
  'FILE_UPLOADED',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function shortId(id: string | null): string {
  if (!id) return '--';
  return id.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AuditLog({ hubId }: { hubId: string }) {
  const [events, setEvents] = useState<AuditEventResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 50;

  const loadEvents = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchAuditLog(hubId, {
          action: actionFilter || undefined,
          cursor,
          limit: PAGE_SIZE,
        });
        if (cursor) {
          setEvents((prev) => [...prev, ...data]);
        } else {
          setEvents(data);
        }
        setHasMore(data.length === PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audit log');
      } finally {
        setLoading(false);
      }
    },
    [hubId, actionFilter],
  );

  // Reset and fetch when hubId or filter changes
  useEffect(() => {
    setEvents([]);
    setHasMore(true);
    loadEvents();
  }, [loadEvents]);

  const handleLoadMore = () => {
    const last = events[events.length - 1];
    if (last) {
      loadEvents(last.id);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header and filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Audit Log</h2>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-surface-2 px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All actions</option>
          {ALL_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Table */}
      <ScrollArea className="max-h-[600px]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="pb-2 pr-4 font-medium">Time</th>
              <th className="pb-2 pr-4 font-medium">Actor</th>
              <th className="pb-2 pr-4 font-medium">Action</th>
              <th className="pb-2 font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.id}
                className="border-b border-border/50 hover:bg-surface-2/50"
              >
                <td className="py-2 pr-4 whitespace-nowrap text-text-muted">
                  {formatTimestamp(event.createdAt)}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap font-mono text-xs text-text-secondary">
                  {shortId(event.actorUserId)}
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${actionColorClass(event.action)} ${actionBgClass(event.action)}`}
                  >
                    {event.action}
                  </span>
                </td>
                <td className="py-2 whitespace-nowrap text-text-secondary">
                  {event.targetType && (
                    <span className="mr-1 text-text-muted">{event.targetType}:</span>
                  )}
                  <span className="font-mono text-xs">{shortId(event.targetId)}</span>
                </td>
              </tr>
            ))}

            {events.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-text-muted">
                  No audit events found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollArea>

      {/* Load More */}
      {hasMore && events.length > 0 && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            loading={loading}
            onClick={handleLoadMore}
          >
            Load More
          </Button>
        </div>
      )}

      {/* Loading indicator for initial load */}
      {loading && events.length === 0 && (
        <div className="flex justify-center py-8">
          <span className="text-sm text-text-muted">Loading audit log...</span>
        </div>
      )}
    </div>
  );
}
