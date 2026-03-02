/**
 * @module solar-system-view
 * Full-screen immersive solar system visualization. Each hub is a solar system
 * with a central star (hub identity) and orbiting planets (channels). Users
 * appear as tiny dots orbiting each planet. Click a planet to navigate to that
 * channel and transition to the 3-column chat layout.
 */
'use client';

import { useMemo, useCallback } from 'react';
import { useHubStore, type Channel } from '../../stores/server-store';
import { useMessageStore } from '../../stores/message-store';
import { useVoiceStateStore, EMPTY_PARTICIPANTS } from '../../stores/voice-state-store';
import { usePresenceStore, type PresenceStatus } from '../../stores/presence-store';
import { useMemberStore } from '../../stores/member-store';
import { useReadStateStore } from '../../stores/read-state-store';
import { Tooltip } from '../ui/tooltip';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SVG_SIZE = 1000;
const CENTER = SVG_SIZE / 2;
const MIN_ORBIT = 120;
const ORBIT_SPACING = 55;
const MAX_VISIBLE_PLANETS = 15;
const BASE_ORBIT_DURATION = 20; // seconds for innermost orbit
const ORBIT_DURATION_STEP = 8;  // seconds added per ring

// Planet radii
const TEXT_PLANET_RADIUS = 8;
const VOICE_PLANET_RADIUS = 12;

// Star sizing
const STAR_MIN_RADIUS = 28;
const STAR_MAX_RADIUS = 45;

// User dot constants
const DOT_RADIUS = 3.5;
const DOT_ORBIT_OFFSET = 8;
const MAX_DOTS_PER_PLANET = 8;
const DOT_ORBIT_DURATION_BASE = 5; // seconds

// ---------------------------------------------------------------------------
// Status colors for user dots (matching member-list-panel.tsx)
// ---------------------------------------------------------------------------

const STATUS_DOT_COLOR: Record<PresenceStatus, string> = {
  online: '#00f0ff',
  idle: '#ffbe0b',
  dnd: '#ff006e',
  offline: 'rgba(255,255,255,0.2)',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a deterministic HSL hue from a hub ID string. */
function hubIdToHue(hubId: string): number {
  let sum = 0;
  for (let i = 0; i < hubId.length; i++) {
    sum += hubId.charCodeAt(i);
  }
  return sum % 360;
}

/** Compute activity score for a channel. Higher = more active. */
function channelActivityScore(
  channelId: string,
  messageCount: number,
  voiceParticipantCount: number,
): number {
  return messageCount + voiceParticipantCount * 10;
}

/** Check if a channel has unread messages. */
function hasUnread(
  channelId: string,
  messages: { id: string }[],
  lastReadMessageId: string | null | undefined,
): boolean {
  if (!messages.length) return false;
  if (!lastReadMessageId) return messages.length > 0;
  const idx = messages.findIndex((m) => m.id === lastReadMessageId);
  if (idx < 0) return messages.length > 0;
  return idx < messages.length - 1;
}

// ---------------------------------------------------------------------------
// Ranked channel type
// ---------------------------------------------------------------------------

interface RankedChannel {
  channel: Channel;
  score: number;
  orbitRadius: number;
  orbitDuration: number;
  voiceCount: number;
  unread: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SolarSystemView() {
  const hubs = useHubStore((s) => s.hubs);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const channels = useHubStore((s) => s.channels);
  const activeChannelId = useHubStore((s) => s.activeChannelId);
  const setActiveChannel = useHubStore((s) => s.setActiveChannel);

  const allMessages = useMessageStore((s) => s.messages);
  const voiceStates = useVoiceStateStore((s) => s.voiceStates);
  const readStates = useReadStateStore((s) => s.readStates);
  const members = useMemberStore((s) => s.members);
  const presence = usePresenceStore((s) => s.presence);

  const activeHub = hubs.find((h) => h.id === activeHubId);
  const memberCount = Object.keys(members).length;

  // Star color from hub ID
  const starHue = activeHub ? hubIdToHue(activeHub.id) : 200;
  const starColor = `hsl(${starHue}, 80%, 60%)`;
  const starColorDim = `hsl(${starHue}, 60%, 30%)`;
  const starRadius = Math.min(STAR_MAX_RADIUS, STAR_MIN_RADIUS + Math.min(17, memberCount / 8));

  // Rank channels by activity and compute orbit parameters
  const rankedChannels = useMemo((): RankedChannel[] => {
    const ranked = channels.map((ch) => {
      const msgs = allMessages[ch.id] ?? [];
      const voiceCount = (voiceStates[ch.id] ?? EMPTY_PARTICIPANTS).length;
      const score = channelActivityScore(ch.id, msgs.length, voiceCount);
      const lastReadId = readStates[ch.id]?.lastReadMessageId;
      const unread = hasUnread(ch.id, msgs, lastReadId);
      return { channel: ch, score, voiceCount, unread, orbitRadius: 0, orbitDuration: 0 };
    });

    // Sort by score descending (most active first = closest orbit)
    ranked.sort((a, b) => b.score - a.score);

    // Cap visible planets
    const visible = ranked.slice(0, MAX_VISIBLE_PLANETS);

    // Assign orbit radii and durations
    visible.forEach((r, i) => {
      r.orbitRadius = MIN_ORBIT + i * ORBIT_SPACING;
      r.orbitDuration = BASE_ORBIT_DURATION + i * ORBIT_DURATION_STEP;
    });

    return visible;
  }, [channels, allMessages, voiceStates, readStates]);

  // Gather voice participants per channel for user dots
  const voiceParticipantsByChannel = useMemo(() => {
    const map: Record<string, { userId: string; handle: string; status: PresenceStatus }[]> = {};
    for (const rc of rankedChannels) {
      const participants = voiceStates[rc.channel.id] ?? EMPTY_PARTICIPANTS;
      map[rc.channel.id] = participants.slice(0, MAX_DOTS_PER_PLANET).map((p) => ({
        userId: p.userId,
        handle: p.handle ?? p.userId.slice(0, 8),
        status: presence[p.userId] ?? 'online',
      }));
    }
    return map;
  }, [rankedChannels, voiceStates, presence]);

  const handlePlanetClick = useCallback(
    (channelId: string) => {
      setActiveChannel(channelId);
    },
    [setActiveChannel],
  );

  if (!activeHub) {
    return (
      <div className="flex flex-1 items-center justify-center text-text-muted text-sm">
        Select a solar system to begin exploring
      </div>
    );
  }

  const overflowCount = Math.max(0, channels.length - MAX_VISIBLE_PLANETS);

  return (
    <div className="flex-1 relative overflow-hidden">
      <svg
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Star radial gradient */}
          <radialGradient id="star-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={starColor} stopOpacity="1" />
            <stop offset="60%" stopColor={starColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={starColorDim} stopOpacity="0.2" />
          </radialGradient>

          {/* Glow filter for active planet */}
          <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#00f0ff" floodOpacity="0.8" />
          </filter>

          {/* Glow filter for unread planet */}
          <filter id="glow-magenta" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#ff006e" floodOpacity="0.6" />
          </filter>

          {/* Star glow filter */}
          <filter id="star-glow-filter" x="-100%" y="-100%" width="300%" height="300%">
            <feDropShadow dx="0" dy="0" stdDeviation="12" floodColor={starColor} floodOpacity="0.5" />
          </filter>

          {/* Glow for voice-active planet */}
          <filter id="glow-voice" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#34d399" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* Orbit rings (faint) */}
        {rankedChannels.map((rc) => (
          <circle
            key={`orbit-${rc.channel.id}`}
            cx={CENTER}
            cy={CENTER}
            r={rc.orbitRadius}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
            strokeDasharray="4 8"
          />
        ))}

        {/* Overflow indicator (asteroid belt) */}
        {overflowCount > 0 && (
          <g>
            <circle
              cx={CENTER}
              cy={CENTER}
              r={MIN_ORBIT + MAX_VISIBLE_PLANETS * ORBIT_SPACING}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="2"
              strokeDasharray="2 6"
            />
            <text
              x={CENTER + MIN_ORBIT + MAX_VISIBLE_PLANETS * ORBIT_SPACING + 10}
              y={CENTER}
              fill="rgba(255,255,255,0.3)"
              fontSize="11"
              fontFamily="var(--font-mono)"
              dominantBaseline="middle"
            >
              +{overflowCount} more
            </text>
          </g>
        )}

        {/* Central star */}
        <g filter="url(#star-glow-filter)">
          <circle
            cx={CENTER}
            cy={CENTER}
            r={starRadius}
            fill="url(#star-gradient)"
            className="animate-pulse-glow"
            style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
          />
          {/* Hub icon inside star if available */}
          {activeHub.iconUrl && (
            <clipPath id="star-clip">
              <circle cx={CENTER} cy={CENTER} r={starRadius - 4} />
            </clipPath>
          )}
          {activeHub.iconUrl && (
            <image
              href={activeHub.iconUrl}
              x={CENTER - starRadius + 4}
              y={CENTER - starRadius + 4}
              width={(starRadius - 4) * 2}
              height={(starRadius - 4) * 2}
              clipPath="url(#star-clip)"
              preserveAspectRatio="xMidYMid slice"
            />
          )}
        </g>

        {/* Hub name below star */}
        <text
          x={CENTER}
          y={CENTER + starRadius + 20}
          textAnchor="middle"
          fill="rgba(255,255,255,0.7)"
          fontSize="14"
          fontFamily="var(--font-display)"
          fontWeight="600"
          letterSpacing="-0.02em"
        >
          {activeHub.name}
        </text>

        {/* Planets */}
        {rankedChannels.map((rc, index) => (
          <Planet
            key={rc.channel.id}
            rc={rc}
            index={index}
            isActive={rc.channel.id === activeChannelId}
            onClick={handlePlanetClick}
            voiceParticipants={voiceParticipantsByChannel[rc.channel.id] ?? []}
          />
        ))}
      </svg>

      {/* System info overlay (bottom-left) */}
      <div className="absolute bottom-4 left-4 pointer-events-none">
        <div className="text-[10px] text-white/30 font-mono uppercase tracking-wider">Solar System</div>
        <div className="text-sm text-white/60 font-display">{channels.length} planets &middot; {memberCount} entities</div>
      </div>

      {/* Keyboard hint (bottom-right) */}
      <div className="absolute bottom-4 right-4 pointer-events-none">
        <div className="text-[10px] text-white/20 font-mono">Click a planet to enter channel</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Planet sub-component
// ---------------------------------------------------------------------------

interface PlanetProps {
  rc: RankedChannel;
  index: number;
  isActive: boolean;
  onClick: (channelId: string) => void;
  voiceParticipants: { userId: string; handle: string; status: PresenceStatus }[];
}

function Planet({ rc, index, isActive, onClick, voiceParticipants }: PlanetProps) {
  const { channel, orbitRadius, orbitDuration, voiceCount, unread } = rc;
  const isVoice = channel.type === 'voice';
  const planetRadius = isVoice ? VOICE_PLANET_RADIUS : TEXT_PLANET_RADIUS;

  // Planet fill color
  const baseFill = isVoice ? '#8338ec' : '#00f0ff';
  const activeFill = isVoice ? '#a855f7' : '#67e8f9';

  // Determine glow filter
  let filter = '';
  if (isActive) filter = 'url(#glow-cyan)';
  else if (voiceCount > 0) filter = 'url(#glow-voice)';
  else if (unread) filter = 'url(#glow-magenta)';

  // Start angle offset so planets don't bunch up
  const startAngle = index * 47; // golden-ish spacing

  // Animation direction alternates for visual variety
  const direction = index % 2 === 0 ? 'normal' : 'reverse';

  return (
    <g
      className="cursor-pointer"
      onClick={() => onClick(channel.id)}
      role="button"
      tabIndex={0}
      aria-label={`${channel.name} — ${isVoice ? 'voice' : 'text'} channel${voiceCount > 0 ? `, ${voiceCount} in voice` : ''}${unread ? ', has unread messages' : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(channel.id);
        }
      }}
    >
      {/* Orbit container — rotates around center */}
      <g
        style={{
          transformOrigin: `${CENTER}px ${CENTER}px`,
          animation: `planet-orbit ${orbitDuration}s linear infinite ${direction}`,
        }}
      >
        {/* Planet positioned at orbit distance from center */}
        <g
          transform={`translate(${CENTER + orbitRadius}, ${CENTER})`}
          style={{
            transformOrigin: `${CENTER + orbitRadius}px ${CENTER}px`,
          }}
        >
          {/* Counter-rotate to keep content upright */}
          <g
            style={{
              transformOrigin: '0px 0px',
              animation: `orbit-spin ${orbitDuration}s linear infinite ${direction === 'normal' ? 'reverse' : 'normal'}`,
            }}
          >
            <Tooltip content={`${channel.name} (${isVoice ? 'voice' : 'text'})${voiceCount > 0 ? ` · ${voiceCount} in voice` : ''}${unread ? ' · unread' : ''}`}>
              <g>
                {/* Planet body */}
                <circle
                  cx="0"
                  cy="0"
                  r={planetRadius}
                  fill={isActive ? activeFill : baseFill}
                  opacity={isActive ? 1 : 0.7}
                  filter={filter}
                  className={clsx(
                    'transition-opacity duration-300',
                    !isActive && 'hover:opacity-100',
                    unread && !isActive && 'planet-unread',
                  )}
                />

                {/* Active ring */}
                {isActive && (
                  <circle
                    cx="0"
                    cy="0"
                    r={planetRadius + 3}
                    fill="none"
                    stroke="#00f0ff"
                    strokeWidth="1.5"
                    opacity="0.5"
                  />
                )}

                {/* Voice participant count badge */}
                {voiceCount > 0 && (
                  <g>
                    <circle
                      cx={planetRadius + 4}
                      cy={-planetRadius + 2}
                      r="7"
                      fill="#34d399"
                    />
                    <text
                      x={planetRadius + 4}
                      y={-planetRadius + 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      fontSize="8"
                      fontWeight="700"
                      fontFamily="var(--font-mono)"
                    >
                      {voiceCount}
                    </text>
                  </g>
                )}

                {/* Channel name label */}
                <text
                  x="0"
                  y={planetRadius + 14}
                  textAnchor="middle"
                  fill={isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'}
                  fontSize="11"
                  fontFamily="var(--font-sans)"
                  fontWeight={isActive ? '600' : '400'}
                >
                  {channel.name}
                </text>

                {/* Channel type icon */}
                {isVoice ? (
                  <text
                    x="0"
                    y={-planetRadius - 6}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.3)"
                    fontSize="10"
                    fontFamily="var(--font-mono)"
                  >
                    &#x1F3A4;
                  </text>
                ) : null}

                {/* User dots orbiting this planet */}
                {voiceParticipants.map((vp, dotIdx) => (
                  <UserDot
                    key={vp.userId}
                    user={vp}
                    index={dotIdx}
                    totalDots={voiceParticipants.length}
                    planetRadius={planetRadius}
                  />
                ))}
              </g>
            </Tooltip>
          </g>
        </g>
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// User dot sub-component
// ---------------------------------------------------------------------------

interface UserDotProps {
  user: { userId: string; handle: string; status: PresenceStatus };
  index: number;
  totalDots: number;
  planetRadius: number;
}

function UserDot({ user, index, totalDots, planetRadius }: UserDotProps) {
  const dotOrbitRadius = planetRadius + DOT_ORBIT_OFFSET;
  const startAngle = (360 / Math.max(totalDots, 1)) * index;
  const duration = DOT_ORBIT_DURATION_BASE + index * 0.5;
  const color = STATUS_DOT_COLOR[user.status] ?? STATUS_DOT_COLOR.online;

  return (
    <g
      style={{
        transformOrigin: '0px 0px',
        animation: `orbit-spin ${duration}s linear infinite`,
      }}
    >
      <Tooltip content={user.handle}>
        <circle
          cx={dotOrbitRadius * Math.cos((startAngle * Math.PI) / 180)}
          cy={dotOrbitRadius * Math.sin((startAngle * Math.PI) / 180)}
          r={DOT_RADIUS}
          fill={color}
          opacity="0.8"
        />
      </Tooltip>
    </g>
  );
}
