/**
 * @module QuickTourOverlay
 * Full-screen tutorial overlay with three slides. Renders a glass panel with
 * slide navigation, step dots, and a "Skip Tour" escape hatch.
 */
'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Button } from '../../ui/button';
import { TourSlideCosmos } from './tour-slide-cosmos';
import { TourSlideOrbits } from './tour-slide-orbits';
import { TourSlideReady } from './tour-slide-ready';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SlideIndex = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface QuickTourOverlayProps {
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickTourOverlay({ onComplete }: QuickTourOverlayProps) {
  const [currentSlide, setCurrentSlide] = useState<SlideIndex>(1);

  const goNext = () => {
    if (currentSlide < 3) setCurrentSlide((prev) => (prev + 1) as SlideIndex);
    else onComplete();
  };

  const goBack = () => {
    if (currentSlide > 1) setCurrentSlide((prev) => (prev - 1) as SlideIndex);
  };

  return (
    /* Fixed backdrop */
    <div
      className="fixed inset-0 z-[500] bg-black/70 backdrop-blur-sm"
      style={{ animation: 'cosmos-enter 0.3s ease both' }}
    >
      {/* Central glass panel */}
      <div
        className="relative mx-auto mt-[15vh] w-full max-w-xl rounded-2xl"
        style={{
          background: 'rgba(7, 9, 13, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 40px 80px -20px rgba(0, 0, 0, 0.7)',
        }}
      >
        {/* Skip Tour button — top-right of panel */}
        <button
          type="button"
          onClick={onComplete}
          className="absolute top-4 right-4 font-mono text-[10px] text-white/30 hover:text-white/60 uppercase tracking-wider transition-colors duration-150"
        >
          Skip Tour
        </button>

        {/* Slide area */}
        <div className="min-h-[340px]">
          {currentSlide === 1 && <TourSlideCosmos />}
          {currentSlide === 2 && <TourSlideOrbits />}
          {currentSlide === 3 && <TourSlideReady />}
        </div>

        {/* Bottom navigation bar */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}
        >
          {/* Step dots */}
          <div className="flex items-center gap-2">
            {([1, 2, 3] as SlideIndex[]).map((dot) => (
              <span
                key={dot}
                className={clsx(
                  'rounded-full transition-all duration-300',
                  dot === currentSlide ? 'w-4 h-1.5' : 'w-1.5 h-1.5',
                )}
                style={{
                  backgroundColor:
                    dot === currentSlide ? '#00e5ff' : 'rgba(255,255,255,0.1)',
                  animation:
                    dot === currentSlide
                      ? 'step-dot-glow 2s ease-in-out infinite'
                      : undefined,
                }}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-2">
            {/* Back — visible on slides 2 and 3 */}
            {currentSlide > 1 && (
              <button
                type="button"
                onClick={goBack}
                className="font-mono text-[11px] uppercase tracking-wider text-white/40 hover:text-white/70 px-3 py-1.5 rounded-lg transition-colors duration-150"
              >
                Back
              </button>
            )}

            {/* Next / Get Started */}
            {currentSlide < 3 ? (
              <button
                type="button"
                onClick={goNext}
                className="font-mono text-[11px] uppercase tracking-wider text-[#00e5ff] hover:text-white px-4 py-1.5 rounded-lg transition-colors duration-150"
                style={{
                  background: 'rgba(0, 229, 255, 0.08)',
                  border: '1px solid rgba(0, 229, 255, 0.2)',
                }}
              >
                Next
              </button>
            ) : (
              <Button onClick={onComplete} size="sm">
                <span className="font-mono text-[11px] uppercase tracking-wider">
                  Get Started
                </span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
