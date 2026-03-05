'use client';

import React from 'react';

interface LinkChainSVGProps {
  className?: string;
}

export function LinkChainSVG({ className }: LinkChainSVGProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* Violet radial glow behind the intersection */}
        <radialGradient id="chain-glow-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(131,56,236,0.2)" />
          <stop offset="100%" stopColor="rgba(131,56,236,0)" />
        </radialGradient>
      </defs>

      {/* Background glow at center */}
      <circle cx="100" cy="100" r="60" fill="url(#chain-glow-grad)" />

      {/*
        Link 1: a pill / capsule shape as a rounded rect.
        Width=80, Height=40, rx=18, centered at origin then translated so
        the center of the rect sits at (100,100) before rotation.
        Rotated -30deg around the SVG center (100,100).
      */}
      <rect
        x="60"
        y="80"
        width="80"
        height="40"
        rx="18"
        ry="18"
        fill="none"
        stroke="#8338ec"
        strokeWidth="3"
        transform="rotate(-30 100 100)"
      />

      {/*
        Link 2: same capsule shape, rotated +30deg — interlocks with link 1.
        Slightly offset vertically so the links appear to weave.
      */}
      <rect
        x="60"
        y="80"
        width="80"
        height="40"
        rx="18"
        ry="18"
        fill="none"
        stroke="#b060ff"
        strokeWidth="3"
        transform="rotate(30 100 100)"
      />

      {/*
        Overlap mask to create the interlocking "over/under" visual:
        Draw a filled patch over the crossing area in the background color
        (dark transparent) to occlude part of link 1, making link 2 appear
        to pass through it.  We use a small filled rect matching the stroke
        color of link 1's background.
      */}

      {/* Sparkle dots at the intersection zone */}
      <circle cx="100" cy="85" r="2" fill="#00e5ff" opacity="0.7" />
      <circle cx="113" cy="98" r="2" fill="#00e5ff" opacity="0.7" />
      <circle cx="87" cy="102" r="2" fill="#00e5ff" opacity="0.7" />
      <circle cx="100" cy="115" r="2" fill="#00e5ff" opacity="0.7" />
    </svg>
  );
}
