'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { useHubStore } from '@/stores/server-store';
import { getInvitePreview, acceptInvite, type InvitePreview } from '@/lib/invite-api';

/**
 * Invite join page.
 * Shows hub name and a "Join" button. Redirects to login if not authed.
 */
export default function InvitePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hubs = useHubStore((s) => s.hubs);
  const setHubs = useHubStore((s) => s.setHubs);
  const setActiveHub = useHubStore((s) => s.setActiveHub);

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  const code = params?.code;

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(`/login?redirect=/invite/${code ?? ''}`);
    }
  }, [isAuthenticated, code, router]);

  // Load invite preview
  useEffect(() => {
    if (!code || !isAuthenticated) return;

    let cancelled = false;
    setLoading(true);
    setError('');

    getInvitePreview(code)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Invalid invite');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [code, isAuthenticated]);

  const handleJoin = async () => {
    if (!code) return;
    setJoining(true);
    setError('');
    try {
      const result = await acceptInvite(code);
      setJoined(true);
      // Add hub to store
      const newHub = {
        id: result.hubId,
        name: result.hubName,
        ownerId: '',
      };
      setHubs([...hubs, newHub]);
      setActiveHub(newHub.id);
      // Redirect to app after short delay
      setTimeout(() => router.push('/'), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join hub');
    } finally {
      setJoining(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg">
      <div className="w-full max-w-sm rounded-xl bg-surface-1 p-8 shadow-xl">
        {loading && (
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="mt-3 text-sm text-text-muted">Loading invite...</p>
          </div>
        )}

        {!loading && error && !preview && (
          <div className="text-center">
            <div className="mb-3 text-4xl">❌</div>
            <h2 className="text-lg font-bold text-text-primary">Invalid Invite</h2>
            <p className="mt-2 text-sm text-text-muted">{error}</p>
            <Button className="mt-4" onClick={() => router.push('/')}>
              Go Home
            </Button>
          </div>
        )}

        {!loading && preview && !joined && (
          <div className="text-center">
            <div className="mb-3 text-4xl">🎉</div>
            <h2 className="text-lg font-bold text-text-primary">
              You&apos;ve been invited to join
            </h2>
            <p className="mt-2 text-xl font-semibold text-accent">
              {preview.hubName}
            </p>

            {preview.isExpired && (
              <p className="mt-3 text-sm text-danger">This invite has expired.</p>
            )}
            {preview.isExhausted && (
              <p className="mt-3 text-sm text-danger">This invite has reached its max uses.</p>
            )}

            {error && (
              <p className="mt-3 text-sm text-danger">{error}</p>
            )}

            <div className="mt-6 flex flex-col gap-2">
              <Button
                loading={joining}
                onClick={handleJoin}
                disabled={preview.isExpired || preview.isExhausted}
              >
                Join Hub
              </Button>
              <Button variant="ghost" onClick={() => router.push('/')}>
                No Thanks
              </Button>
            </div>
          </div>
        )}

        {joined && (
          <div className="text-center">
            <div className="mb-3 text-4xl">✅</div>
            <h2 className="text-lg font-bold text-text-primary">Joined!</h2>
            <p className="mt-2 text-sm text-text-muted">Redirecting you to your hub...</p>
          </div>
        )}
      </div>
    </div>
  );
}
