'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { registerPasskey } from '@/lib/auth-api';
import { useAuthStore } from '@/stores/auth-store';
import { getUserAvatarUrl } from '@/lib/user-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PasskeyRegister() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);

  const [handle, setHandle] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = handle.trim();
    if (!trimmed) {
      setError('Handle is required');
      return;
    }
    if (trimmed.length < 3) {
      setError('Handle must be at least 3 characters');
      return;
    }

    setLoading(true);
    try {
      const tokens = await registerPasskey(trimmed);
      setTokens(tokens.accessToken, tokens.refreshToken);
      const avatarUrl = tokens.avatarUrl ? getUserAvatarUrl(tokens.userId) : undefined;
      setUser(tokens.userId, tokens.handle, tokens.deviceId, avatarUrl);
      router.push(searchParams.get('redirect') ?? '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary">Create Account</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Register with a passkey for passwordless sign-in
          </p>
        </div>

        <Input
          label="Handle"
          placeholder="Choose a handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          error={error}
          autoComplete="username"
          autoFocus
        />

        <Button type="submit" loading={loading} className="w-full">
          Register with Passkey
        </Button>

        <p className="text-center text-sm text-text-muted">
          Already have an account?{' '}
          <Link href={searchParams.get('redirect') ? `/login?redirect=${encodeURIComponent(searchParams.get('redirect')!)}` : '/login'} className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </motion.div>
  );
}
