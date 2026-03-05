/**
 * @module JoinCodeStep
 * Step 1 of the Join path — invite code / link input.
 * The user pastes a raw code or full invite URL.
 */
'use client';

import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { StepIndicator } from '../onboarding-step-indicator';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface JoinCodeStepProps {
  inviteCode: string;
  onCodeChange: (code: string) => void;
  onBack: () => void;
  onJoin: () => void;
  joining: boolean;
  error: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JoinCodeStep({
  inviteCode,
  onCodeChange,
  onBack,
  onJoin,
  joining,
  error,
}: JoinCodeStepProps) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-full px-8 py-12"
      style={{ animation: 'onboard-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both' }}
    >
      {/* Glass panel */}
      <div
        className="w-full max-w-[480px] rounded-2xl p-8 flex flex-col gap-7"
        style={{
          background: 'rgba(7, 9, 13, 0.88)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 32px 64px -16px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Header */}
        <div className="text-center">
          <h2
            className="font-display font-light tracking-[0.15em] uppercase text-white/90 mb-2"
            style={{ fontSize: '20px' }}
          >
            Join a Solar System
          </h2>
          <p className="font-mono text-[12px] text-white/50">
            Ask a friend for their invite code, or paste an invite link.
          </p>
        </div>

        {/* Invite code input */}
        <Input
          label="Invite code or link"
          placeholder="AbCd1234 or https://ripcord.gg/invite/..."
          value={inviteCode}
          onChange={(e) => onCodeChange(e.target.value)}
          error={error}
          autoFocus
        />

        {/* Step indicator */}
        <div className="flex justify-center">
          <StepIndicator totalSteps={2} currentStep={1} />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button
            className="flex-1"
            loading={joining}
            onClick={onJoin}
            disabled={!inviteCode.trim()}
          >
            Join Solar System
          </Button>
        </div>
      </div>
    </div>
  );
}
