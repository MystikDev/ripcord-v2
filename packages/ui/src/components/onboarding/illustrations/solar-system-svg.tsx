'use client';

import React from 'react';

interface SolarSystemSVGProps {
  className?: string;
}

export function SolarSystemSVG({ className }: SolarSystemSVGProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <style>{`
        @keyframes planet-orbit {
          from {
            transform: rotate(0deg) translateX(var(--orbit-r)) rotate(0deg);
          }
          to {
            transform: rotate(360deg) translateX(var(--orbit-r)) rotate(-360deg);
          }
        }
      `}</style>

      <defs>
        {/* Core radial gradient: cyan center to violet edge */}
        <radialGradient id="sol-core-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00e5ff" />
          <stop offset="100%" stopColor="#8338ec" />
        </radialGradient>

        {/* Glow behind core: cyan to transparent */}
        <radialGradient id="sol-glow-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.5" />
          <stop offset="70%" stopColor="#00e5ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Subtle outer glow behind core */}
      <circle
        cx="100"
        cy="100"
        r="30"
        fill="url(#sol-glow-grad)"
        opacity="0.5"
      />

      {/* Orbit ring 1 — inner, r=45 */}
      <circle
        cx="100"
        cy="100"
        r="45"
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
        strokeDasharray="4 4"
      />

      {/* Orbit ring 2 — middle, r=70 */}
      <circle
        cx="100"
        cy="100"
        r="70"
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
        strokeDasharray="4 4"
      />

      {/* Orbit ring 3 — outer, r=95 */}
      <circle
        cx="100"
        cy="100"
        r="95"
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
        strokeDasharray="4 4"
      />

      {/* Central core sphere */}
      <circle cx="100" cy="100" r="16" fill="url(#sol-core-grad)" />

      {/* Planet on inner ring (r=45), cyan, 8s */}
      <g
        style={
          {
            transformOrigin: '100px 100px',
            animation: 'planet-orbit 8s linear infinite',
            '--orbit-r': '45px',
          } as React.CSSProperties
        }
      >
        <circle cx="100" cy="100" r="4" fill="#00e5ff" />
      </g>

      {/* Planet on middle ring (r=70), violet, 12s */}
      <g
        style={
          {
            transformOrigin: '100px 100px',
            animation: 'planet-orbit 12s linear infinite',
            '--orbit-r': '70px',
          } as React.CSSProperties
        }
      >
        <circle cx="100" cy="100" r="3.5" fill="#8338ec" />
      </g>

      {/* Planet on outer ring (r=95), soft violet, 18s */}
      <g
        style={
          {
            transformOrigin: '100px 100px',
            animation: 'planet-orbit 18s linear infinite',
            '--orbit-r': '95px',
          } as React.CSSProperties
        }
      >
        <circle cx="100" cy="100" r="3" fill="#b060ff" />
      </g>
    </svg>
  );
}
