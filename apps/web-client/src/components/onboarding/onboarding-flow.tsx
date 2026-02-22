'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHubStore } from '@/stores/server-store';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api';
import { acceptInvite } from '@/lib/invite-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 'choice' | 'create' | 'join';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface OnboardingFlowProps {
  open: boolean;
  onComplete: () => void;
}

export function OnboardingFlow({ open, onComplete }: OnboardingFlowProps) {
  const toast = useToast();
  const setHubs = useHubStore((s) => s.setHubs);
  const hubs = useHubStore((s) => s.hubs);
  const setActiveHub = useHubStore((s) => s.setActiveHub);

  const [step, setStep] = useState<Step>('choice');

  // Create hub state
  const [hubName, setHubName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Join hub state
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const handleCreate = async () => {
    const trimmed = hubName.trim();
    if (trimmed.length < 2) {
      setCreateError('Name must be at least 2 characters');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const res = await apiFetch<{ ok: boolean; data: { id: string; name: string; ownerUserId: string } }>(
        '/v1/hubs',
        {
          method: 'POST',
          body: JSON.stringify({ name: trimmed }),
        },
      );
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to create hub');

      const hubData = (res.data as unknown as { data?: { id: string; name: string; ownerUserId: string } })?.data ?? res.data;
      const newHub = {
        id: (hubData as { id: string }).id,
        name: (hubData as { name: string }).name,
        ownerId: (hubData as { ownerUserId: string }).ownerUserId,
      };
      setHubs([...hubs, newHub]);
      setActiveHub(newHub.id);
      toast.success(`Hub "${newHub.name}" created!`);
      onComplete();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create hub');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    const trimmed = inviteCode.trim();
    if (!trimmed) {
      setJoinError('Enter an invite code');
      return;
    }

    // Extract code from URL if pasted as a full link
    const codeMatch = trimmed.match(/\/invite\/([A-Za-z0-9_-]+)/);
    const code = codeMatch ? codeMatch[1]! : trimmed;

    setJoining(true);
    setJoinError('');
    try {
      const result = await acceptInvite(code);
      const newHub = {
        id: result.hubId,
        name: result.hubName,
        ownerId: '',
      };
      setHubs([...hubs, newHub]);
      setActiveHub(newHub.id);
      toast.success(`Joined "${result.hubName}"!`);
      onComplete();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join hub');
    } finally {
      setJoining(false);
    }
  };

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface-1 p-6 shadow-xl">
          <Dialog.Title className="sr-only">Onboarding</Dialog.Title>
          <Dialog.Description className="sr-only">Get started by creating or joining a hub</Dialog.Description>
          {step === 'choice' && (
            <div className="space-y-6 text-center">
              <div>
                <h2 className="text-xl font-bold text-text-primary">Welcome to Ripcord!</h2>
                <p className="mt-2 text-sm text-text-muted">
                  Get started by creating a hub or joining one with an invite code.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Button onClick={() => setStep('create')} className="w-full">
                  Create a Hub
                </Button>
                <Button variant="secondary" onClick={() => setStep('join')} className="w-full">
                  Join with Invite Code
                </Button>
              </div>
            </div>
          )}

          {step === 'create' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-text-primary">Create a Hub</h2>
                <p className="mt-1 text-sm text-text-muted">
                  Give your hub a name. You can always change it later.
                </p>
              </div>

              <Input
                label="Hub name"
                placeholder="My Awesome Hub"
                value={hubName}
                onChange={(e) => setHubName(e.target.value)}
                error={createError}
                maxLength={100}
                autoFocus
              />

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep('choice')}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  loading={creating}
                  onClick={handleCreate}
                  disabled={!hubName.trim()}
                >
                  Create Hub
                </Button>
              </div>
            </div>
          )}

          {step === 'join' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-text-primary">Join a Hub</h2>
                <p className="mt-1 text-sm text-text-muted">
                  Enter an invite code or paste an invite link.
                </p>
              </div>

              <Input
                label="Invite code or link"
                placeholder="AbCd1234"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                error={joinError}
                autoFocus
              />

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep('choice')}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  loading={joining}
                  onClick={handleJoin}
                  disabled={!inviteCode.trim()}
                >
                  Join Hub
                </Button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
