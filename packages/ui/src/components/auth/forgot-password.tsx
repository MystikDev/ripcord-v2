/**
 * @module forgot-password
 * Multi-step password reset form:
 *   Step 1: Enter handle → sends reset code email
 *   Step 2: Enter 6-digit code + new password → resets password
 * On success, shows a confirmation message with a link back to login.
 */
'use client';

import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  requestPasswordReset,
  confirmPasswordReset,
  resendPasswordResetCode,
} from '../../lib/auth-api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ForgotPasswordProps {
  /** Called when user wants to go back to login. */
  onBack: () => void;
  /** Pre-filled handle from the login form. */
  initialHandle?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CODE_LENGTH = 6;
const COOLDOWN_SEC = 60;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ForgotPassword({ onBack, initialHandle }: ForgotPasswordProps) {
  // Step: 'handle' → 'code' → 'success'
  const [step, setStep] = useState<'handle' | 'code' | 'success'>('handle');

  // Step 1 state
  const [handle, setHandle] = useState(initialHandle ?? '');
  const [handleError, setHandleError] = useState('');
  const [handleLoading, setHandleLoading] = useState(false);

  // Reset info from step 1
  const [userId, setUserId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');

  // Step 2 state
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState('');

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus first code input when entering step 2
  useEffect(() => {
    if (step === 'code') {
      inputRefs.current[0]?.focus();
    }
  }, [step]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // ---------------------------------------------------------------------------
  // Step 1: Request reset code
  // ---------------------------------------------------------------------------

  const handleRequestCode = async (e: FormEvent) => {
    e.preventDefault();
    setHandleError('');

    if (!handle.trim()) {
      setHandleError('Handle is required');
      return;
    }

    setHandleLoading(true);
    try {
      const result = await requestPasswordReset(handle.trim());
      setUserId(result.userId);
      setMaskedEmail(result.maskedEmail);
      setStep('code');
    } catch (err) {
      setHandleError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setHandleLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 2: Code input handlers
  // ---------------------------------------------------------------------------

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      const digit = value.replace(/\D/g, '').slice(-1);
      setDigits((prev) => {
        const next = [...prev];
        next[index] = digit;
        return next;
      });
      setCodeError('');

      if (digit && index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits],
  );

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

  // ---------------------------------------------------------------------------
  // Step 2: Submit new password
  // ---------------------------------------------------------------------------

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setCodeError('');

    const code = digits.join('');
    if (code.length !== CODE_LENGTH) {
      setCodeError('Please enter all 6 digits');
      return;
    }

    if (!newPassword) {
      setCodeError('New password is required');
      return;
    }

    if (newPassword.length < 8) {
      setCodeError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setCodeError('Passwords do not match');
      return;
    }

    setCodeLoading(true);
    try {
      await confirmPasswordReset(userId, code, newPassword);
      setStep('success');
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Reset failed');
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setCodeLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Resend code
  // ---------------------------------------------------------------------------

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    try {
      await resendPasswordResetCode(userId);
      setResendCooldown(COOLDOWN_SEC);
      setResendMessage('New code sent!');
      setCodeError('');
      setTimeout(() => setResendMessage(''), 3000);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Failed to resend code');
    }
  };

  // ---------------------------------------------------------------------------
  // Render: Success
  // ---------------------------------------------------------------------------

  if (step === 'success') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-col gap-5 text-center">
          <div>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <svg className="h-7 w-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-text-primary">Password Updated</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Your password has been changed successfully. You can now sign in with your new password.
            </p>
          </div>

          <Button onClick={onBack} className="w-full">
            Back to Sign In
          </Button>
        </div>
      </motion.div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Step 2 — Code + New Password
  // ---------------------------------------------------------------------------

  if (step === 'code') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <form onSubmit={handleResetPassword} className="flex flex-col gap-5">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-text-primary">Reset Password</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Enter the code sent to{' '}
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

          {/* New password fields */}
          <Input
            label="New Password"
            type="password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />

          <Input
            label="Confirm Password"
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />

          {/* Error message */}
          {codeError && (
            <p className="text-center text-sm text-danger">{codeError}</p>
          )}

          {/* Resend success message */}
          {resendMessage && (
            <p className="text-center text-sm text-success">{resendMessage}</p>
          )}

          <Button type="submit" loading={codeLoading} className="w-full">
            Reset Password
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

          {/* Back to login */}
          <p className="text-center text-sm text-text-muted">
            <button
              type="button"
              onClick={onBack}
              className="text-accent hover:underline"
            >
              Back to Sign In
            </button>
          </p>
        </form>
      </motion.div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Step 1 — Handle input
  // ---------------------------------------------------------------------------

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <form onSubmit={handleRequestCode} className="flex flex-col gap-5">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary">Forgot Password</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Enter your handle and we&apos;ll send a reset code to your email
          </p>
        </div>

        <Input
          label="Handle"
          placeholder="Enter your handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoComplete="username"
          autoFocus
          error={handleError}
        />

        <Button type="submit" loading={handleLoading} className="w-full">
          Send Reset Code
        </Button>

        <p className="text-center text-sm text-text-muted">
          <button
            type="button"
            onClick={onBack}
            className="text-accent hover:underline"
          >
            Back to Sign In
          </button>
        </p>
      </form>
    </motion.div>
  );
}
