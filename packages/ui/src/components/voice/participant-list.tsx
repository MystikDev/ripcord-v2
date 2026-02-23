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
          'relative rounded-full transition-shadow',
          isSpeaking ? 'shadow-[0_0_8px_2px_rgba(46,230,255,0.5)] duration-75' : 'duration-300',
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
