/**
 * @module stream-preview
 * A floating live preview of a user's screen share, rendered as a portal.
 * Must be mounted inside a `<LiveKitRoom>` provider so it can access tracks.
 * Triggered by hovering the cyan streaming icon in the channel sidebar.
 */
'use client';

import { useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useVoiceStateStore } from '../../stores/voice-state-store';
import { useMemberStore } from '../../stores/member-store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PREVIEW_WIDTH = 220;
const PREVIEW_HEIGHT = 140;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a small floating video preview of the hovered user's screen share.
 * Position is driven by `hoveredScreenShareAnchor` from the voice store.
 */
export function StreamPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const hoveredUserId = useVoiceStateStore((s) => s.hoveredScreenShareUserId);
  const anchor = useVoiceStateStore((s) => s.hoveredScreenShareAnchor);

  const tracks = useTracks([Track.Source.ScreenShare], {
    onlySubscribed: true,
  });

  // Find the hovered user's screen share track
  const hoveredTrack =
    hoveredUserId
      ? tracks.find((t) => t.participant.identity === hoveredUserId)?.publication?.track ?? null
      : null;

  // Resolve display name
  const cachedHandle = useMemberStore((s) =>
    hoveredUserId ? s.members[hoveredUserId]?.handle : undefined,
  );
  const displayName = cachedHandle ?? hoveredUserId ?? 'Unknown';

  // Attach / detach the track to the preview video element
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !hoveredTrack) return;

    hoveredTrack.attach(el);
    return () => {
      hoveredTrack.detach(el);
    };
  }, [hoveredTrack]);

  if (!hoveredUserId || !anchor || !hoveredTrack) return null;

  // Clamp position to viewport bounds
  const top = Math.min(anchor.y, window.innerHeight - PREVIEW_HEIGHT - 16);
  const left = Math.min(anchor.x, window.innerWidth - PREVIEW_WIDTH - 16);

  return createPortal(
    <div
      className="fixed z-50 rounded-lg border border-border bg-black shadow-xl overflow-hidden pointer-events-none"
      style={{
        top,
        left,
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT,
      }}
    >
      {/* Label */}
      <div className="absolute top-0 inset-x-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-2 py-1">
        <span className="text-[10px] font-medium text-white/90 truncate block">
          {displayName}&apos;s screen
        </span>
      </div>

      {/* Preview video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain bg-black"
      />
    </div>,
    document.body,
  );
}
