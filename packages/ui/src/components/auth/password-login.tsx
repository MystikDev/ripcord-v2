/**
 * @module password-login
 * Traditional username + password sign-in form. Validates inputs,
 * calls loginPassword(), stores auth tokens, and redirects.
 * If the user hasn't verified their email, shows the verification screen.
 */
import { useState, type FormEvent } from 'react';
import { useAppRouter, useAppSearchParams, useAppLink } from '../../lib/router';
import { motion } from 'framer-motion';
import { loginPassword, EmailNotVerifiedError } from '../../lib/auth-api';
import { useAuthStore } from '../../stores/auth-store';
import { getUserAvatarUrl } from '../../lib/user-api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { VerifyEmail } from './verify-email';
import { ForgotPassword } from './forgot-password';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerificationInfo {
  userId: string;
  handle: string;
  maskedEmail: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PasswordLogin() {
  const router = useAppRouter();
  const searchParams = useAppSearchParams();
  const Link = useAppLink();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);

  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // When set, shows the verification screen instead of the login form
  const [pendingVerification, setPendingVerification] = useState<VerificationInfo | null>(null);
  // When true, shows the forgot password flow
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!handle.trim()) {
      setError('Handle is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    try {
      const tokens = await loginPassword(handle.trim(), password);
      setTokens(tokens.accessToken, tokens.refreshToken);
      const avatarUrl = tokens.avatarUrl ? getUserAvatarUrl(tokens.userId) : undefined;
      setUser(tokens.userId, tokens.handle, tokens.deviceId, avatarUrl);
      const redirect = searchParams.get('redirect');
      const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
      router.push(safeRedirect);
    } catch (err) {
      if (err instanceof EmailNotVerifiedError) {
        setPendingVerification({
          userId: err.userId,
          handle: err.handle,
          maskedEmail: err.maskedEmail,
        });
      } else {
        setError(err instanceof Error ? err.message : 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  // Show verification screen if email not verified
  if (pendingVerification) {
    return (
      <VerifyEmail
        userId={pendingVerification.userId}
        handle={pendingVerification.handle}
        maskedEmail={pendingVerification.maskedEmail}
        onBack={() => setPendingVerification(null)}
      />
    );
  }

  // Show forgot password flow
  if (showForgotPassword) {
    return (
      <ForgotPassword
        onBack={() => setShowForgotPassword(false)}
        initialHandle={handle}
      />
    );
  }

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
            Sign in with your password
          </p>
        </div>

        <Input
          label="Handle"
          placeholder="Enter your handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoComplete="username"
          autoFocus
        />

        <div>
          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            error={error}
          />
          <div className="mt-1 text-right">
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-xs text-accent hover:underline"
            >
              Forgot password?
            </button>
          </div>
        </div>

        <Button type="submit" loading={loading} className="w-full">
          Sign In with Password
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
