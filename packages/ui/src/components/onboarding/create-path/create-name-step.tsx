'use client';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { StepIndicator } from '../onboarding-step-indicator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nameToHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateNameStepProps {
  hubName: string;
  onNameChange: (name: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateNameStep({ hubName, onNameChange, onBack, onContinue }: CreateNameStepProps) {
  const hue = nameToHue(hubName || 'Ripcord');
  const primaryColor = `hsl(${hue}, 80%, 60%)`;
  const secondaryColor = `hsl(${(hue + 40) % 360}, 70%, 50%)`;
  const initials = hubName.trim() ? getInitials(hubName) : '?';
  const canContinue = hubName.trim().length >= 2;

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
            className="font-display font-light tracking-[0.15em] uppercase text-white/90 mb-1"
            style={{ fontSize: '20px' }}
          >
            Name Your Solar System
          </h2>
          <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-white/30">
            You can always rename it later
          </p>
        </div>

        {/* Input */}
        <Input
          label="Solar system name"
          placeholder="e.g. Nova Squad"
          value={hubName}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={100}
          autoFocus
        />

        {/* Live nebula preview */}
        <div className="flex flex-col items-center gap-3">
          {/* Nebula circle */}
          <div
            className="relative flex items-center justify-center rounded-full"
            style={{
              width: '120px',
              height: '120px',
              background: `radial-gradient(circle, ${primaryColor}, ${secondaryColor})`,
              boxShadow: `0 0 40px ${primaryColor}50, 0 0 80px ${primaryColor}20`,
              transition: 'background 0.4s ease, box-shadow 0.4s ease',
            }}
          >
            {/* Outer glow layer */}
            <div
              className="absolute inset-[-30%] rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${primaryColor}30 0%, transparent 70%)`,
                filter: 'blur(16px)',
                transition: 'background 0.4s ease',
              }}
            />
            <span
              className="relative font-display font-bold text-white select-none"
              style={{ fontSize: '28px' }}
            >
              {initials}
            </span>
          </div>

          {/* Name pill label */}
          {hubName.trim() && (
            <div
              className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/60 px-3 py-1 rounded-full"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                maxWidth: '200px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {hubName.trim()}
            </div>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex justify-center">
          <StepIndicator totalSteps={3} currentStep={1} />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button
            className="flex-1"
            onClick={onContinue}
            disabled={!canContinue}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
