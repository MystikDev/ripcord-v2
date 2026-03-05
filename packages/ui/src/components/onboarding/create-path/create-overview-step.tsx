'use client';
import { Button } from '../../ui/button';
import { StepIndicator } from '../onboarding-step-indicator';
import { OrbitDiagramSVG } from '../illustrations/orbit-diagram-svg';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateOverviewStepProps {
  hubName: string;
  onBack: () => void;
  onCreate: () => void;
  creating: boolean;
  error: string;
}

// ---------------------------------------------------------------------------
// Feature card data
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    variant: 'channels' as const,
    title: 'ORBITS',
    desc: 'Channels appear as orbiting rings around the core',
  },
  {
    variant: 'voice' as const,
    title: 'VOICE',
    desc: 'Jump into voice by clicking an orbit ring',
  },
  {
    variant: 'chat' as const,
    title: 'CHAT',
    desc: 'Chat in floating panels from anywhere',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateOverviewStep({ hubName, onBack, onCreate, creating, error }: CreateOverviewStepProps) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-full px-8 py-12"
      style={{ animation: 'onboard-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both' }}
    >
      {/* Glass panel */}
      <div
        className="w-full max-w-[620px] rounded-2xl p-8 flex flex-col gap-7"
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
            style={{ fontSize: '18px' }}
          >
            Your Solar System at a Glance
          </h2>
          <p className="font-mono text-[11px] tracking-[0.08em] text-white/30">
            Here's what awaits you in{' '}
            <span className="text-accent">{hubName || 'your solar system'}</span>
          </p>
        </div>

        {/* Feature cards */}
        <div className="flex gap-4">
          {FEATURES.map((feature) => (
            <div
              key={feature.variant}
              className="flex-1 flex flex-col items-center gap-3 p-5 rounded-xl text-center"
              style={{
                background: 'rgba(7, 9, 13, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <OrbitDiagramSVG variant={feature.variant} className="w-[80px] h-[80px]" />
              <div>
                <h4 className="font-mono text-[11px] tracking-[0.12em] uppercase text-accent mb-1">
                  {feature.title}
                </h4>
                <p className="font-mono text-[10px] text-white/40 leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Step indicator */}
        <div className="flex justify-center">
          <StepIndicator totalSteps={3} currentStep={2} />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onBack} disabled={creating}>
            Back
          </Button>
          <Button
            className="flex-1"
            onClick={onCreate}
            loading={creating}
          >
            Create Solar System
          </Button>
        </div>

        {/* Error message */}
        {error && (
          <p className="font-mono text-[11px] text-red-400 text-center -mt-3">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
