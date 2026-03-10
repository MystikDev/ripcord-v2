/**
 * @module TourSlideWelcome
 * Quick Tour slide 1 — Welcome to Ripcord, introduces the spatial metaphor.
 */
'use client';

import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TourSlideWelcomeProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TourSlideWelcome({ className }: TourSlideWelcomeProps) {
  return (
    <div className={clsx('p-8 text-center', className)}>
      {/* Title */}
      <h2
        className="font-display font-light tracking-[0.15em] uppercase select-none"
        style={{
          fontSize: '22px',
          background: 'linear-gradient(135deg, #00e5ff 0%, var(--color-accent-violet) 50%, var(--color-accent-magenta) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          filter: 'drop-shadow(0 0 20px rgba(0, 229, 255, 0.3))',
        }}
      >
        Welcome to Ripcord
      </h2>

      {/* Illustration — animated rocket/star icon */}
      <div className="mx-auto my-6 flex items-center justify-center w-[180px] h-[180px]">
        <svg
          viewBox="0 0 120 120"
          className="w-full h-full"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="welcome-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#00e5ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Outer glow */}
          <circle cx="60" cy="60" r="50" fill="url(#welcome-glow)">
            <animate attributeName="r" values="45;55;45" dur="3s" repeatCount="indefinite" />
          </circle>
          {/* Star burst lines */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <line
              key={angle}
              x1="60"
              y1="60"
              x2={60 + Math.cos((angle * Math.PI) / 180) * 40}
              y2={60 + Math.sin((angle * Math.PI) / 180) * 40}
              stroke="rgba(0, 229, 255, 0.15)"
              strokeWidth="1"
              strokeLinecap="round"
            />
          ))}
          {/* Central star */}
          <circle cx="60" cy="60" r="12" fill="#00e5ff" opacity="0.9">
            <animate attributeName="r" values="10;14;10" dur="2.5s" repeatCount="indefinite" />
          </circle>
          <circle cx="60" cy="60" r="6" fill="white" opacity="0.8" />
          {/* Orbit hint circles */}
          <circle cx="60" cy="60" r="28" fill="none" stroke="rgba(131, 56, 236, 0.2)" strokeWidth="0.8" strokeDasharray="3 3">
            <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="20s" repeatCount="indefinite" />
          </circle>
          <circle cx="60" cy="60" r="40" fill="none" stroke="rgba(255, 0, 110, 0.15)" strokeWidth="0.8" strokeDasharray="3 3">
            <animateTransform attributeName="transform" type="rotate" from="360 60 60" to="0 60 60" dur="30s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>

      {/* Description */}
      <p className="font-mono text-[12px] text-white/50 max-w-md mx-auto leading-relaxed">
        Ripcord reimagines communication as a living cosmos. Your communities are solar systems,
        channels are orbits, and you navigate through space to connect with others.
      </p>
    </div>
  );
}
