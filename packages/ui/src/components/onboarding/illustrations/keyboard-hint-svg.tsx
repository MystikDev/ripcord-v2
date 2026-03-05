'use client';

import React from 'react';

interface KeyboardHintSVGProps {
  className?: string;
}

export function KeyboardHintSVG({ className }: KeyboardHintSVGProps) {
  return (
    <svg
      viewBox="0 0 220 80"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/*
        Layout (all vertically centered at y=40):
          Ctrl key:  60×44, centered x=50  → rect x=20, y=18
          +  symbol: x=95, y=45
          K    key:  44×44, centered x=155 → rect x=133, y=18
      */}

      {/* --- Ctrl key shadow (offset 2px down) --- */}
      <rect
        x="22"
        y="20"
        width="60"
        height="44"
        rx="6"
        ry="6"
        fill="rgba(0,0,0,0.3)"
      />

      {/* --- Ctrl key face --- */}
      <rect
        x="20"
        y="18"
        width="60"
        height="44"
        rx="6"
        ry="6"
        fill="rgba(255,255,255,0.06)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      <text
        x="50"
        y="45"
        fontFamily="monospace"
        fontSize="14"
        fill="#00e5ff"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        Ctrl
      </text>

      {/* --- Plus symbol between keys --- */}
      <text
        x="100"
        y="42"
        fontFamily="monospace"
        fontSize="18"
        fill="rgba(255,255,255,0.3)"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        +
      </text>

      {/* --- K key shadow (offset 2px down) --- */}
      <rect
        x="135"
        y="20"
        width="44"
        height="44"
        rx="6"
        ry="6"
        fill="rgba(0,0,0,0.3)"
      />

      {/* --- K key face --- */}
      <rect
        x="133"
        y="18"
        width="44"
        height="44"
        rx="6"
        ry="6"
        fill="rgba(255,255,255,0.06)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
      />
      <text
        x="155"
        y="42"
        fontFamily="monospace"
        fontSize="14"
        fill="#00e5ff"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        K
      </text>
    </svg>
  );
}
