// ---------------------------------------------------------------------------
// Permission Bit Flags
// ---------------------------------------------------------------------------

/**
 * Permission bit flags used in role bitfield masks.
 *
 * Each permission occupies a single bit position. The special
 * {@link Permission.ADMINISTRATOR} flag (bit 31) implicitly grants every
 * other permission.
 */
export const Permission = {
  /** View channels and read message history. */
  VIEW_CHANNELS: 1 << 0,
  /** Send messages in text channels. */
  SEND_MESSAGES: 1 << 1,
  /** Delete or pin messages authored by others. */
  MANAGE_MESSAGES: 1 << 2,
  /** Create, edit, or delete channels. */
  MANAGE_CHANNELS: 1 << 3,
  /** Create, edit, or delete roles below the actor's highest role. */
  MANAGE_ROLES: 1 << 4,
  /** Edit hub name, icon, and settings. */
  MANAGE_HUB: 1 << 5,
  /** Remove members from the hub. */
  KICK_MEMBERS: 1 << 6,
  /** Permanently ban members from the hub. */
  BAN_MEMBERS: 1 << 7,
  /** Connect to voice channels. */
  CONNECT_VOICE: 1 << 8,
  /** Speak in voice channels. */
  SPEAK_VOICE: 1 << 9,
  /** Stream video / screen-share in voice channels. */
  STREAM_VIDEO: 1 << 10,
  /** Upload file attachments to channels. */
  ATTACH_FILES: 1 << 11,
  /** Move members between voice channels. */
  MOVE_MEMBERS: 1 << 12,
  /** Server-mute or unmute members in voice channels. */
  MUTE_MEMBERS: 1 << 13,
  /** Bypasses all permission checks. Use with care. */
  ADMINISTRATOR: 1 << 31,
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a permission bitset includes a specific permission.
 *
 * Returns `true` if the {@link Permission.ADMINISTRATOR} bit is set **or**
 * the requested permission bit is present.
 *
 * @param bitset - The combined permission bitfield to test.
 * @param perm   - The individual permission flag to check for.
 * @returns `true` if the permission is granted.
 */
export function hasPermission(bitset: number, perm: Permission): boolean {
  // ADMINISTRATOR implies every permission.
  if ((bitset & Permission.ADMINISTRATOR) !== 0) {
    return true;
  }
  return (bitset & perm) !== 0;
}

/**
 * Merge a base permission bitset with one or more role bitsets using
 * bitwise OR.
 *
 * This mirrors how Discord computes effective permissions: the base
 * (everyone-role) permissions are OR'd with each role the member holds.
 *
 * @param base     - The starting bitset (typically the everyone-role permissions).
 * @param roleBits - Additional role bitsets to merge in.
 * @returns The combined permission bitfield.
 */
export function computePermissions(
  base: number,
  ...roleBits: number[]
): number {
  let combined = base;
  for (const bits of roleBits) {
    combined |= bits;
  }
  return combined;
}
