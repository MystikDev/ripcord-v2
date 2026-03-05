/**
 * @module JoinLoadingStep
 * Step 2 of the Join path — animated warp ring displayed while the
 * invite-accept API call is in flight.
 */
'use client';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface JoinLoadingStepProps {
  hubName?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JoinLoadingStep({ hubName }: JoinLoadingStepProps) {
  const label = hubName ? `ENTERING ${hubName}...` : 'ENTERING...';

  return (
    <div className="flex flex-col items-center justify-center min-h-full gap-10">
      {/* Warp ring animation */}
      <div className="relative flex items-center justify-center" style={{ width: '160px', height: '160px' }}>
        <svg
          viewBox="0 0 160 160"
          width="160"
          height="160"
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
        >
          <defs>
            <style>{`
              @keyframes warp-ring-expand {
                0%   { transform: scale(0.5); opacity: 0.8; }
                100% { transform: scale(1.5); opacity: 0; }
              }
              .warp-ring-1 {
                transform-origin: 80px 80px;
                animation: warp-ring-expand 2s ease-out infinite;
                animation-delay: 0s;
              }
              .warp-ring-2 {
                transform-origin: 80px 80px;
                animation: warp-ring-expand 2s ease-out infinite;
                animation-delay: 0.4s;
              }
              .warp-ring-3 {
                transform-origin: 80px 80px;
                animation: warp-ring-expand 2s ease-out infinite;
                animation-delay: 0.8s;
              }
            `}</style>
          </defs>

          {/* Inner ring — r=30 */}
          <circle
            className="warp-ring-1"
            cx="80"
            cy="80"
            r="30"
            stroke="#00e5ff"
            strokeWidth="1"
            fill="none"
          />

          {/* Middle ring — r=50 */}
          <circle
            className="warp-ring-2"
            cx="80"
            cy="80"
            r="50"
            stroke="#00e5ff"
            strokeWidth="1"
            fill="none"
          />

          {/* Outer ring — r=70 */}
          <circle
            className="warp-ring-3"
            cx="80"
            cy="80"
            r="70"
            stroke="#00e5ff"
            strokeWidth="1"
            fill="none"
          />
        </svg>

        {/* Central glowing dot */}
        <div
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #00e5ff, #8338ec)',
            boxShadow: '0 0 20px rgba(0, 229, 255, 0.8), 0 0 40px rgba(0, 229, 255, 0.4)',
            position: 'relative',
            zIndex: 1,
          }}
        />
      </div>

      {/* Label */}
      <p
        className="font-mono text-[13px] text-white/60 uppercase tracking-[0.1em] animate-pulse"
      >
        {label}
      </p>
    </div>
  );
}
