import { useState, type FormEvent } from 'react';
import { useAppRouter, useAppSearchParams, useAppLink } from '../../lib/router';
import { motion } from 'framer-motion';
import { loginPasskey } from '../../lib/auth-api';
import { useAuthStore } from '../../stores/auth-store';
import { getUserAvatarUrl } from '../../lib/user-api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PasskeyLogin() {
  const router = useAppRouter();
  const searchParams = useAppSearchParams();
  const Link = useAppLink();
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

    setLoading(true);
    try {
      const tokens = await loginPasskey(trimmed);
      setTokens(tokens.accessToken, tokens.refreshToken);
      const avatarUrl = tokens.avatarUrl ? getUserAvatarUrl(tokens.userId) : undefined;
      setUser(tokens.userId, tokens.handle, tokens.deviceId, avatarUrl);
      const redirect = searchParams.get('redirect');
      const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
      router.push(safeRedirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
          <h1 className="text-2xl font-bold text-text-primary">Welcome Back</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Sign in with your passkey
          </p>
        </div>

        <Input
          label="Handle"
          placeholder="Enter your handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          error={error}
          autoComplete="username"
          autoFocus
        />

        <Button type="submit" loading={loading} className="w-full">
          Sign In with Passkey
        </Button>

        <p className="text-center text-sm text-text-muted">
          Don&apos;t have an account?{' '}
          <Link href={searchParams.get('redirect') ? `/register?redirect=${encodeURIComponent(searchParams.get('redirect')!)}` : '/register'} className="text-accent hover:underline">
            Register
          </Link>
        </p>
      </form>
    </motion.div>
  );
}
