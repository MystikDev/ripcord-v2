/**
 * @module password-register
 * Password-based account creation form. Collects handle, email, password
 * (min 8 chars), and confirm password with mismatch validation.
 * On success, transitions to the email verification screen.
 */
import { useState, type FormEvent } from 'react';
import { useAppSearchParams, useAppLink } from '../../lib/router';
import { motion } from 'framer-motion';
import { registerPassword, type PendingVerification } from '../../lib/auth-api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { VerifyEmail } from './verify-email';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PasswordRegister() {
  const searchParams = useAppSearchParams();
  const Link = useAppLink();

  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // When set, we show the verification screen instead of the registration form
  const [pendingVerification, setPendingVerification] = useState<PendingVerification | null>(null);

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
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setError('Handle may only contain letters, digits, underscores, and hyphens');
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address');
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
      const result = await registerPassword(trimmed, trimmedEmail, password);
      setPendingVerification(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  // Show verification screen after successful registration
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
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
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
