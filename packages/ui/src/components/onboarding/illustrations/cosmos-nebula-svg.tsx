'use client';

import React from 'react';

interface CosmosNebulaSVGProps {
  className?: string;
}

// Deterministic star positions to avoid hydration mismatch.
const STARS: { cx: number; cy: number; r: number; opacity: number }[] = [
  { cx: 18,  cy: 14,  r: 1,   opacity: 0.5 },
  { cx: 42,  cy: 32,  r: 1.5, opacity: 0.4 },
  { cx: 75,  cy: 8,   r: 1,   opacity: 0.6 },
  { cx: 130, cy: 22,  r: 1.5, opacity: 0.3 },
  { cx: 180, cy: 15,  r: 1,   opacity: 0.7 },
  { cx: 255, cy: 30,  r: 1,   opacity: 0.5 },
  { cx: 295, cy: 10,  r: 1.5, opacity: 0.4 },
  { cx: 310, cy: 55,  r: 1,   opacity: 0.6 },
  { cx: 270, cy: 80,  r: 1,   opacity: 0.3 },
  { cx: 50,  cy: 155, r: 1,   opacity: 0.5 },
  { cx: 95,  cy: 178, r: 1.5, opacity: 0.4 },
  { cx: 145, cy: 165, r: 1,   opacity: 0.6 },
  { cx: 200, cy: 185, r: 1,   opacity: 0.3 },
  { cx: 248, cy: 155, r: 1,   opacity: 0.7 },
  { cx: 305, cy: 175, r: 1.5, opacity: 0.4 },
];

export function CosmosNebulaSVG({ className }: CosmosNebulaSVGProps) {
  return (
    <svg
      viewBox="0 0 320 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* Nebula 1 — teal/cyan cloud */}
        <radialGradient id="neb1-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(190,80%,60%)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="hsl(190,80%,60%)" stopOpacity="0" />
        </radialGradient>

        {/* Nebula 2 — violet/purple cloud */}
        <radialGradient id="neb2-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(280,70%,50%)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="hsl(280,70%,50%)" stopOpacity="0" />
        </radialGradient>

        {/* Nebula 3 — green-teal cloud */}
        <radialGradient id="neb3-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(160,60%,50%)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="hsl(160,60%,50%)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Dark space background */}
      <rect width="320" height="200" fill="#080810" />

      {/* Scattered stars */}
      {STARS.map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="white" opacity={s.opacity} />
      ))}

      {/* Nebula 3 (behind 1 & 2) */}
      <circle cx="160" cy="60" r="30" fill="url(#neb3-grad)" />

      {/* Nebula 2 */}
      <circle cx="220" cy="110" r="40" fill="url(#neb2-grad)" />

      {/* Nebula 1 — highlighted / primary */}
      <circle cx="100" cy="90" r="50" fill="url(#neb1-grad)" />

      {/* Pulsing ring around nebula 1 */}
      <circle
        cx="100"
        cy="90"
        r="55"
        fill="none"
        stroke="#00e5ff"
        strokeWidth="1.5"
        strokeDasharray="3 3"
        className="animate-pulse"
      />

      {/* Pointer annotation */}
      <text
        x="160"
        y="94"
        fontFamily="monospace"
        fontSize="9"
        fill="#00e5ff"
        opacity="0.85"
      >
        ← Click
      </text>
    </svg>
  );
}
