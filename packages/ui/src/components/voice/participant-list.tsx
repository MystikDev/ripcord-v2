'use client';

import { useParticipants } from '@livekit/components-react';
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
}: {
  identity: string;
  displayName?: string;
  isSpeaking: boolean;
  isMuted: boolean;
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
          'relative rounded-full transition-shadow duration-200',
          isSpeaking && 'shadow-[0_0_8px_2px_rgba(46,230,255,0.5)]',
        )}
      >
        <Avatar src={cachedAvatarUrl} fallback={name} size="sm" />
      </div>

      {/* Name */}
      <span className="flex-1 truncate text-sm text-text-secondary">
        {name}
      </span>

      {/* Muted icon */}
      {isMuted && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="shrink-0 text-danger"
        >
          <path d="M8 1a2 2 0 00-2 2v4a2 2 0 104 0V3a2 2 0 00-2-2z" />
          <path d="M2.7 2.7a1 1 0 011.4 0l9.2 9.2a1 1 0 01-1.4 1.4L2.7 4.1a1 1 0 010-1.4z" />
          <path d="M4 7a1 1 0 00-2 0 6 6 0 008.5 5.45l-1.5-1.5A4 4 0 014 7zM12 7a1 1 0 012 0 6.002 6.002 0 01-.5 2.45l-1.5-1.5A3.98 3.98 0 0012 7z" />
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
          />
        );
      })}
    </div>
  );
}
