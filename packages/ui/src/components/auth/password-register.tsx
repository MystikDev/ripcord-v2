/**
 * @module password-register
 * Password-based account creation form. Collects handle, password (min 8 chars),
 * and confirm password with mismatch validation. Calls registerPassword(),
 * stores tokens, and redirects on success.
 */
import { useState, type FormEvent } from 'react';
import { useAppRouter, useAppSearchParams, useAppLink } from '../../lib/router';
import { motion } from 'framer-motion';
import { registerPassword } from '../../lib/auth-api';
import { useAuthStore } from '../../stores/auth-store';
import { getUserAvatarUrl } from '../../lib/user-api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PasswordRegister() {
  const router = useAppRouter();
  const searchParams = useAppSearchParams();
  const Link = useAppLink();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);

  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const tokens = await registerPassword(trimmed, password);
      setTokens(tokens.accessToken, tokens.refreshToken);
      const avatarUrl = tokens.avatarUrl ? getUserAvatarUrl(tokens.userId) : undefined;
      setUser(tokens.userId, tokens.handle, tokens.deviceId, avatarUrl);
      const redirect = searchParams.get('redirect');
      const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
      router.push(safeRedirect);
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
            Register with a password
          </p>
        </div>

        <Input
          label="Handle"
          placeholder="Choose a handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoComplete="username"
          autoFocus
        />

        <Input
          label="Password"
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />

        <Input
          label="Confirm Password"
          type="password"
          placeholder="Repeat your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          error={error}
        />

        <Button type="submit" loading={loading} className="w-full">
          Register with Password
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
