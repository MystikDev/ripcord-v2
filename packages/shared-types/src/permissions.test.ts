import { describe, it, expect } from 'vitest';
import { Permission, hasPermission, computePermissions } from './permissions.js';

describe('hasPermission', () => {
  it('returns true when exact bit is set', () => {
    const bitset = Permission.VIEW_CHANNELS | Permission.SEND_MESSAGES;
    expect(hasPermission(bitset, Permission.VIEW_CHANNELS)).toBe(true);
    expect(hasPermission(bitset, Permission.SEND_MESSAGES)).toBe(true);
  });

  it('returns false when bit is not set', () => {
    const bitset = Permission.VIEW_CHANNELS;
    expect(hasPermission(bitset, Permission.SEND_MESSAGES)).toBe(false);
    expect(hasPermission(bitset, Permission.MANAGE_CHANNELS)).toBe(false);
  });

  it('returns true when ADMINISTRATOR is set even if specific bit is not', () => {
    const bitset = Permission.ADMINISTRATOR; // only ADMIN bit set
    expect(hasPermission(bitset, Permission.VIEW_CHANNELS)).toBe(true);
    expect(hasPermission(bitset, Permission.SEND_MESSAGES)).toBe(true);
    expect(hasPermission(bitset, Permission.BAN_MEMBERS)).toBe(true);
  });

  it('returns false with zero bitset', () => {
    expect(hasPermission(0, Permission.VIEW_CHANNELS)).toBe(false);
    expect(hasPermission(0, Permission.ADMINISTRATOR)).toBe(false);
  });
});

describe('computePermissions', () => {
  it('ORs base with role bits', () => {
    const base = Permission.VIEW_CHANNELS; // bit 0
    const role1 = Permission.SEND_MESSAGES; // bit 1
    const role2 = Permission.MANAGE_MESSAGES; // bit 2
    const result = computePermissions(base, role1, role2);
    expect(result).toBe(
      Permission.VIEW_CHANNELS | Permission.SEND_MESSAGES | Permission.MANAGE_MESSAGES,
    );
  });

  it('returns base unchanged with no extra roles', () => {
    const base = Permission.VIEW_CHANNELS | Permission.SEND_MESSAGES;
    expect(computePermissions(base)).toBe(base);
  });

  it('returns ADMINISTRATOR set when a role includes ADMINISTRATOR', () => {
    const base = Permission.VIEW_CHANNELS;
    const adminRole = Permission.ADMINISTRATOR;
    const result = computePermissions(base, adminRole);
    expect(hasPermission(result, Permission.ADMINISTRATOR)).toBe(true);
    expect(result & Permission.ADMINISTRATOR).not.toBe(0);
  });
});
