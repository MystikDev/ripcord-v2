'use client';

import { useState, useEffect, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { MemberActions } from '@/components/admin/member-actions';
import { fetchMembers } from '@/lib/admin-api';
import { useAdminStore } from '@/stores/admin-store';
import { useAuthStore } from '@/stores/auth-store';
import { getUserAvatarUrl } from '@/lib/user-api';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MemberList({ hubId }: { hubId: string }) {
  const members = useAdminStore((s) => s.members);
  const setMembers = useAdminStore((s) => s.setMembers);
  const removeMember = useAdminStore((s) => s.removeMember);
  const isLoading = useAdminStore((s) => s.isLoading);
  const setLoading = useAdminStore((s) => s.setLoading);
  const error = useAdminStore((s) => s.error);
  const setError = useAdminStore((s) => s.setError);
  const currentUserId = useAuthStore((s) => s.userId);

  const [hasMore, setHasMore] = useState(true);

  const loadMembers = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchMembers(hubId, cursor);
        if (cursor) {
          setMembers([...useAdminStore.getState().members, ...data]);
        } else {
          setMembers(data);
        }
        setHasMore(data.length === 50);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load members');
      } finally {
        setLoading(false);
      }
    },
    [hubId, setMembers, setLoading, setError],
  );

  useEffect(() => {
    setMembers([]);
    setHasMore(true);
    loadMembers();
  }, [hubId, loadMembers, setMembers]);

  const handleLoadMore = () => {
    const last = members[members.length - 1];
    if (last) {
      loadMembers(last.joinedAt);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">
          Members{members.length > 0 ? ` (${members.length})` : ''}
        </h2>
      </div>

      {error && (
        <div className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <ScrollArea className="max-h-[500px]">
        <div className="space-y-1">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-2/50"
            >
              <Avatar src={member.avatarUrl ? getUserAvatarUrl(member.userId) : undefined} fallback={member.handle} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">
                  {member.handle}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">
                    Joined {formatDate(member.joinedAt)}
                  </span>
                  {member.roles && member.roles.length > 0 && (
                    <div className="flex gap-1">
                      {member.roles.map((role) => (
                        <span
                          key={role.id}
                          className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
                        >
                          {role.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Don't show actions for the current user */}
              {member.userId !== currentUserId && (
                <MemberActions
                  hubId={hubId}
                  member={member}
                  onKicked={() => removeMember(member.userId)}
                  onBanned={() => removeMember(member.userId)}
                />
              )}
            </div>
          ))}

          {members.length === 0 && !isLoading && (
            <p className="py-8 text-center text-sm text-text-muted">
              No members found.
            </p>
          )}
        </div>
      </ScrollArea>

      {hasMore && members.length > 0 && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            loading={isLoading}
            onClick={handleLoadMore}
          >
            Load More
          </Button>
        </div>
      )}

      {isLoading && members.length === 0 && (
        <div className="flex justify-center py-8">
          <span className="text-sm text-text-muted">Loading members...</span>
        </div>
      )}
    </div>
  );
}
