'use client';

import { useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useCallback, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Displays the first available screen-share track in a video element.
 * Renders as an overlay / expanded view when a participant is sharing.
 */
export function ScreenShareView() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const tracks = useTracks([Track.Source.ScreenShare], {
    onlySubscribed: true,
  });

  const screenTrack = tracks[0]?.publication?.track ?? null;

  // Attach / detach the video track
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !screenTrack) return;

    screenTrack.attach(el);
    return () => {
      screenTrack.detach(el);
    };
  }, [screenTrack]);

  const handleFullscreen = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  if (!screenTrack) return null;

  const sharerIdentity = tracks[0]?.participant?.identity ?? 'Someone';

  return (
    <div className="relative rounded-lg overflow-hidden bg-surface-1 border border-border">
      {/* Header */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 py-2">
        <span className="text-xs font-medium text-text-primary">
          {sharerIdentity}&apos;s screen
        </span>
        <button
          onClick={handleFullscreen}
          className="rounded-md p-1 text-text-secondary hover:bg-surface-3/50 hover:text-text-primary transition-colors"
          title="Toggle fullscreen"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
          </svg>
        </button>
      </div>

      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full max-h-64 object-contain bg-black"
      />
    </div>
  );
}
