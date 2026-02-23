'use client';

import { useParticipants, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Avatar } from '../ui/avatar';
import { useMemberStore } from '../../stores/member-store';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Participant Tile
// ---------------------------------------------------------------------------

function ParticipantTile({
  identity,
  displayName,
  isSpeaking,
  isMuted,
  isScreenSharing,
}: {
  identity: string;
  displayName?: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isScreenSharing: boolean;
}) {
  // Resolve name + avatar: LiveKit name (handle from token) > member cache > identity
  const cachedHandle = useMemberStore((s) => s.members[identity]?.handle);
  const cachedAvatarUrl = useMemberStore((s) => s.members[identity]?.avatarUrl);
  const name = displayName || cachedHandle || identity || 'Unknown';

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
      {/* Avatar with speaking glow */}
      <div
        className={clsx(
          'inline-flex items-center justify-center shrink-0 h-8 w-8 rounded-full transition-shadow',
          isSpeaking ? 'shadow-[0_0_8px_2px_rgba(46,230,255,0.5)] duration-75' : 'duration-300',
        )}
      >
        <Avatar src={cachedAvatarUrl} fallback={name} size="sm" />
      </div>

      {/* Name */}
      <span className="flex-1 truncate text-sm text-text-secondary">
        {name}
      </span>

      {/* Screen sharing icon */}
      {isScreenSharing && (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-cyan" aria-label="Streaming">
          <title>Streaming</title>
          <rect x="1" y="2" width="14" height="10" rx="1.5" />
          <path d="M4 14h8" />
          <path d="M6 12v2M10 12v2" />
          <path d="M6.5 7l2-2 2 2" fill="none" />
          <path d="M8.5 5v4" />
        </svg>
      )}

      {/* Muted icon */}
      {isMuted && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-danger"
        >
          <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
          <path d="M3 7.5a5 5 0 0 0 10 0" />
          <path d="M2 2l12 12" strokeWidth="2" />
        </svg>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Participant List
// ---------------------------------------------------------------------------

export function ParticipantList() {
  const participants = useParticipants();
  const screenShareTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });

  // Build a set of identities currently sharing their screen
  const screenSharingIds = new Set(
    screenShareTracks.map((t) => t.participant.identity).filter(Boolean),
  );

  if (participants.length === 0) {
    return (
      <p className="px-2 py-3 text-center text-sm text-text-muted">
        No one in the call
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {participants.map((p) => {
        const audioTrack = p
          .getTrackPublications()
          .find((t) => t.source === Track.Source.Microphone);

        return (
          <ParticipantTile
            key={p.identity}
            identity={p.identity}
            displayName={p.name}
            isSpeaking={p.isSpeaking}
            isMuted={audioTrack?.isMuted ?? true}
            isScreenSharing={screenSharingIds.has(p.identity)}
          />
        );
      })}
    </div>
  );
}
