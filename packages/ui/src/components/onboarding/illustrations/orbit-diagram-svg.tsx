'use client';

import React from 'react';

interface OrbitDiagramSVGProps {
  variant: 'channels' | 'voice' | 'chat';
  className?: string;
}

// ---------------------------------------------------------------------------
// variant="channels"
// Two concentric rings with labeled dots for text and voice channels.
// ---------------------------------------------------------------------------
function ChannelsVariant() {
  return (
    <>
      {/* Inner ring r=35 */}
      <circle
        cx="60"
        cy="60"
        r="35"
        fill="none"
        stroke="rgba(0,229,255,0.3)"
        strokeWidth="1"
      />
      {/* Outer ring r=50 */}
      <circle
        cx="60"
        cy="60"
        r="50"
        fill="none"
        stroke="rgba(0,229,255,0.3)"
        strokeWidth="1"
      />

      {/* Dot on inner ring — "text" channel, top-right position */}
      <circle cx="85" cy="36" r="4" fill="#00e5ff" opacity="0.9" />
      {/* "#" label */}
      <text
        x="91"
        y="32"
        fontFamily="monospace"
        fontSize="8"
        fill="#00e5ff"
        opacity="0.8"
      >
        # text
      </text>

      {/* Dot on outer ring — "voice" channel, bottom-left position */}
      <circle cx="22" cy="85" r="4" fill="#8338ec" opacity="0.9" />
      {/* Speaker label */}
      <text
        x="5"
        y="99"
        fontFamily="monospace"
        fontSize="8"
        fill="#8338ec"
        opacity="0.8"
      >
        voice
      </text>

      {/* Central hub dot */}
      <circle cx="60" cy="60" r="5" fill="#00e5ff" opacity="0.6" />
    </>
  );
}

// ---------------------------------------------------------------------------
// variant="voice"
// Single ring with 3 avatar dots; one has a glow to indicate "speaking".
// ---------------------------------------------------------------------------
function VoiceVariant() {
  // Three evenly spaced dots at 0deg, 120deg, 240deg on r=45
  // Center is at (60,60).  Angles measured from top (subtract 90deg).
  const r = 45;
  const cx = 60;
  const cy = 60;
  const dots = [
    { angle: -90, color: '#00e5ff', speaking: true },
    { angle: 30, color: '#8338ec', speaking: false },
    { angle: 150, color: '#b060ff', speaking: false },
  ];

  return (
    <>
      {/* Ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="rgba(0,229,255,0.4)"
        strokeWidth="1"
      />

      {dots.map((dot, i) => {
        const rad = (dot.angle * Math.PI) / 180;
        const x = cx + r * Math.cos(rad);
        const y = cy + r * Math.sin(rad);
        return (
          <React.Fragment key={i}>
            {/* Glow behind speaking dot */}
            {dot.speaking && (
              <circle
                cx={x}
                cy={y}
                r="10"
                fill={dot.color}
                opacity="0.2"
                style={{ filter: 'blur(4px)' }}
              />
            )}
            <circle cx={x} cy={y} r="5" fill={dot.color} opacity="0.9" />
          </React.Fragment>
        );
      })}

      {/* Central dot */}
      <circle cx={cx} cy={cy} r="3" fill="rgba(0,229,255,0.4)" />
    </>
  );
}

// ---------------------------------------------------------------------------
// variant="chat"
// Floating panel with placeholder text lines.
// ---------------------------------------------------------------------------
function ChatVariant() {
  // Panel: 70x50 centered at 60,60 → x=25, y=35
  return (
    <>
      {/* Panel border */}
      <rect
        x="25"
        y="35"
        width="70"
        height="50"
        rx="6"
        ry="6"
        fill="rgba(0,229,255,0.05)"
        stroke="rgba(0,229,255,0.3)"
        strokeWidth="1"
      />

      {/* Text placeholder lines */}
      <rect x="33" y="47" width="40" height="2" rx="1" fill="rgba(255,255,255,0.15)" />
      <rect x="33" y="55" width="30" height="2" rx="1" fill="rgba(255,255,255,0.15)" />
      <rect x="33" y="63" width="25" height="2" rx="1" fill="rgba(255,255,255,0.15)" />

      {/* Small avatar dot top-left of panel */}
      <circle cx="33" cy="43" r="3" fill="#00e5ff" opacity="0.5" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function OrbitDiagramSVG({ variant, className }: OrbitDiagramSVGProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {variant === 'channels' && <ChannelsVariant />}
      {variant === 'voice' && <VoiceVariant />}
      {variant === 'chat' && <ChatVariant />}
    </svg>
  );
}
