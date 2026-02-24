/**
 * @module screen-share-view
 * Renders the first active screen-share track in a video element with a header
 * overlay showing the sharer's identity, a Stop button for local shares,
 * and a fullscreen toggle.
 */
'use client';

import { useTracks, useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useCallback, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Displays the first available screen-share track in a video element.
 * Renders as an overlay / expanded view when a participant is sharing.
 * The local user can stop their own screen share via a button.
 */
export function ScreenShareView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { localParticipant } = useLocalParticipant();

  const tracks = useTracks([Track.Source.ScreenShare], {
    onlySubscribed: true,
  });

  const screenTrack = tracks[0]?.publication?.track ?? null;
  const sharerIdentity = tracks[0]?.participant?.identity ?? 'Someone';
  const isLocalShare = tracks[0]?.participant?.identity === localParticipant.identity;

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

  const handleStopSharing = useCallback(async () => {
    await localParticipant.setScreenShareEnabled(false);
  }, [localParticipant]);

  if (!screenTrack) return null;

  return (
    <div className="relative rounded-lg overflow-hidden bg-surface-1 border border-border">
      {/* Header */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 py-2">
        <span className="text-xs font-medium text-text-primary">
          {sharerIdentity}&apos;s screen
        </span>
        <div className="flex items-center gap-1.5">
          {/* Stop sharing (only for local user) */}
          {isLocalShare && (
            <button
              onClick={handleStopSharing}
              className="flex items-center gap-1 rounded-md bg-danger/80 px-2 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-danger"
              title="Stop sharing"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect width="10" height="10" rx="1.5" />
              </svg>
              Stop
            </button>
          )}
          {/* Fullscreen */}
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
