/**
 * @module TourSlideCosmos
 * Quick Tour slide 1 — introduces the Cosmos view.
 */
'use client';

import clsx from 'clsx';
import { CosmosNebulaSVG } from '../illustrations/cosmos-nebula-svg';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TourSlideCosmosProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TourSlideCosmos({ className }: TourSlideCosmosProps) {
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
        The Cosmos
      </h2>

      {/* Illustration */}
      <div className="mx-auto my-6 rounded-xl overflow-hidden w-[300px] h-[180px]">
        <CosmosNebulaSVG className="w-full h-full" />
      </div>

      {/* Description */}
      <p className="font-mono text-[12px] text-white/50 max-w-md mx-auto leading-relaxed">
        Your hubs appear as nebulae floating in the cosmos. Each nebula is a community — a
        solar system full of channels and friends. Click one to enter its solar system.
      </p>
    </div>
  );
}
