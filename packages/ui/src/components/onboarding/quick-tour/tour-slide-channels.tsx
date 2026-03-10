/**
 * @module TourSlideChannels
 * Quick Tour slide 4 — Channels & Chat: text channels, voice channels, joining.
 */
'use client';

import clsx from 'clsx';
import { OrbitDiagramSVG } from '../illustrations/orbit-diagram-svg';

// ---------------------------------------------------------------------------
// Channel type items
// ---------------------------------------------------------------------------

const CHANNEL_ITEMS = [
  { variant: 'channels' as const, label: 'Text', desc: 'Messaging' },
  { variant: 'voice' as const, label: 'Voice', desc: 'Real-time talk' },
  { variant: 'chat' as const, label: 'Chat', desc: 'Quick access' },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TourSlideChannelsProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TourSlideChannels({ className }: TourSlideChannelsProps) {
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
        Channels & Chat
      </h2>

      {/* Three channel type mini-illustrations */}
      <div className="flex justify-center gap-6 my-6">
        {CHANNEL_ITEMS.map(({ variant, label, desc }) => (
          <div key={variant} className="flex flex-col items-center gap-1.5">
            <OrbitDiagramSVG variant={variant} className="w-[72px] h-[72px]" />
            <span className="font-mono text-[11px] text-[#00e5ff] uppercase tracking-wider font-medium">
              {label}
            </span>
            <span className="font-mono text-[9px] text-white/30">
              {desc}
            </span>
          </div>
        ))}
      </div>

      {/* Description */}
      <p className="font-mono text-[12px] text-white/50 max-w-md mx-auto leading-relaxed">
        Text channels are for messaging. Voice channels let you talk in real time.
        Double-click an orbit or click <span className="text-[#00e5ff]">Join</span> to connect
        to a voice channel.
      </p>
    </div>
  );
}
