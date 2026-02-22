'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogClose } from '../ui/dialog';
import { Input } from '../ui/input';
import { useToast } from '../ui/toast';
import { kickMember, banMember } from '../../lib/admin-api';
import type { MemberResponse } from '../../lib/admin-api';

interface MemberActionsProps {
  hubId: string;
  member: MemberResponse;
  onKicked: () => void;
  onBanned: () => void;
}

export function MemberActions({ hubId, member, onKicked, onBanned }: MemberActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [kickOpen, setKickOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const handleKick = async () => {
    setLoading(true);
    try {
      await kickMember(hubId, member.userId);
      toast.success(`Kicked ${member.handle}`);
      onKicked();
      setKickOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to kick member');
    } finally {
      setLoading(false);
    }
  };

  const handleBan = async () => {
    setLoading(true);
    try {
      await banMember(hubId, member.userId, banReason || undefined);
      toast.success(`Banned ${member.handle}`);
      onBanned();
      setBanOpen(false);
      setBanReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to ban member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen((p) => !p)}
        className="rounded-md p-1 text-text-muted hover:bg-surface-3 hover:text-text-primary transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-8 z-10 w-36 rounded-lg border border-border bg-surface-2 py-1 shadow-lg">
          <button
            onClick={() => {
              setMenuOpen(false);
              setKickOpen(true);
            }}
            className="flex w-full items-center px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-3 hover:text-text-primary"
          >
            Kick
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              setBanOpen(true);
            }}
            className="flex w-full items-center px-3 py-1.5 text-sm text-danger hover:bg-danger/10"
          >
            Ban
          </button>
        </div>
      )}

      {/* Kick confirmation dialog */}
      <Dialog open={kickOpen} onOpenChange={setKickOpen}>
        <DialogContent title="Kick Member" description={`Remove ${member.handle} from this hub?`}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" type="button">Cancel</Button>
            </DialogClose>
            <Button variant="danger" onClick={handleKick} loading={loading}>
              Kick
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ban confirmation dialog */}
      <Dialog open={banOpen} onOpenChange={setBanOpen}>
        <DialogContent title="Ban Member" description={`Ban ${member.handle} from this hub? They will be kicked and unable to rejoin.`}>
          <div className="space-y-4">
            <Input
              label="Reason (optional)"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason for ban..."
              maxLength={500}
            />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost" type="button">Cancel</Button>
              </DialogClose>
              <Button variant="danger" onClick={handleBan} loading={loading}>
                Ban
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
