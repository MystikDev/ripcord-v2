/**
 * @module verify-email
 * 6-digit code verification screen shown after registration or when an
 * unverified user tries to log in. On success, stores tokens and redirects.
 */
'use client';

import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import { useAppRouter } from '../../lib/router';
import { motion } from 'framer-motion';
import { verifyEmail, resendVerificationCode } from '../../lib/auth-api';
import { useAuthStore } from '../../stores/auth-store';
import { getUserAvatarUrl } from '../../lib/user-api';
import { Button } from '../ui/button';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VerifyEmailProps {
  userId: string;
  handle: string;
  maskedEmail: string;
  /** Called when user wants to go back to registration. */
  onBack?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CODE_LENGTH = 6;
const COOLDOWN_SEC = 60;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VerifyEmail({ userId, handle, maskedEmail, onBack }: VerifyEmailProps) {
  const router = useAppRouter();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState('');

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Handle digit input
  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      // Only allow digits
      const digit = value.replace(/\D/g, '').slice(-1);
      setDigits((prev) => {
        const next = [...prev];
        next[index] = digit;
        return next;
      });
      setError('');

      // Auto-advance to next input
      if (digit && index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [],
  );

  // Handle backspace
  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits],
  );

  // Handle paste — fill all digits at once
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
      if (pasted.length === CODE_LENGTH) {
        setDigits(pasted.split(''));
        inputRefs.current[CODE_LENGTH - 1]?.focus();
      }
    },
    [],
  );

  // Submit verification code
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const code = digits.join('');
    if (code.length !== CODE_LENGTH) {
      setError('Please enter all 6 digits');
      return;
    }

    setLoading(true);
    try {
      const tokens = await verifyEmail(userId, code);
      setTokens(tokens.accessToken, tokens.refreshToken);
      const avatarUrl = tokens.avatarUrl ? getUserAvatarUrl(tokens.userId) : undefined;
      setUser(tokens.userId, tokens.handle, tokens.deviceId, avatarUrl);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      // Clear digits on error so user can re-enter
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Resend code
  const handleResend = async () => {
    if (resendCooldown > 0) return;

    try {
      await resendVerificationCode(userId);
      setResendCooldown(COOLDOWN_SEC);
      setResendMessage('New code sent!');
      setError('');
      setTimeout(() => setResendMessage(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
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
          <h1 className="text-2xl font-bold text-text-primary">Verify Your Email</h1>
          <p className="mt-1 text-sm text-text-secondary">
            We sent a 6-digit code to{' '}
            <span className="font-medium text-text-primary">{maskedEmail}</span>
          </p>
        </div>

        {/* 6-digit code input */}
        <div className="flex justify-center gap-2">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              className="h-12 w-10 rounded-lg border border-border bg-surface-2 text-center text-xl font-bold text-text-primary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
              autoComplete="one-time-code"
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <p className="text-center text-sm text-danger">{error}</p>
        )}

        {/* Resend success message */}
        {resendMessage && (
          <p className="text-center text-sm text-success">{resendMessage}</p>
        )}

        <Button type="submit" loading={loading} className="w-full">
          Verify Email
        </Button>

        {/* Resend link */}
        <p className="text-center text-sm text-text-muted">
          Didn&apos;t receive the code?{' '}
          {resendCooldown > 0 ? (
            <span className="text-text-secondary">
              Resend in {resendCooldown}s
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              className="text-accent hover:underline"
            >
              Resend code
            </button>
          )}
        </p>

        {/* Back to register */}
        {onBack && (
          <p className="text-center text-sm text-text-muted">
            <button
              type="button"
              onClick={onBack}
              className="text-accent hover:underline"
            >
              Back to registration
            </button>
          </p>
        )}
      </form>
    </motion.div>
  );
}
