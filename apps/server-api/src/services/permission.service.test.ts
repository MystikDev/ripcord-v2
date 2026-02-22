import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../redis.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    keys: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../repositories/role.repo.js', () => ({
  findEveryoneRole: vi.fn(),
  findRolesForMember: vi.fn(),
}));

vi.mock('../repositories/channel-override.repo.js', () => ({
  findRoleOverrides: vi.fn(),
  findMemberOverride: vi.fn(),
}));

vi.mock('../repositories/server.repo.js', () => ({
  findById: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { redis } from '../redis.js';
import * as roleRepo from '../repositories/role.repo.js';
import * as overrideRepo from '../repositories/channel-override.repo.js';
import * as hubRepo from '../repositories/server.repo.js';
import { resolvePermissions, checkPermission } from './permission.service.js';
import { Permission } from '@ripcord/types';

const HUB_ID = 'hub-1';
const CHANNEL_ID = 'chan-1';
const USER_ID = 'user-1';

describe('permission.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no cache
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(redis.set).mockResolvedValue('OK' as any);
    // Default: hub exists but user is NOT the owner
    vi.mocked(hubRepo.findById).mockResolvedValue({
      id: HUB_ID,
      name: 'Test Hub',
      ownerUserId: 'other-user',
      createdAt: '2025-01-01T00:00:00Z',
    });
    // Default: no roles, no overrides
    vi.mocked(roleRepo.findEveryoneRole).mockResolvedValue(null);
    vi.mocked(roleRepo.findRolesForMember).mockResolvedValue([]);
    vi.mocked(overrideRepo.findRoleOverrides).mockResolvedValue([]);
    vi.mocked(overrideRepo.findMemberOverride).mockResolvedValue(null);
  });

  it('returns cached permissions from Redis when available', async () => {
    vi.mocked(redis.get).mockResolvedValue('3');

    const result = await resolvePermissions(HUB_ID, CHANNEL_ID, USER_ID);
    expect(result).toBe(3);
    // Should not query the database
    expect(roleRepo.findEveryoneRole).not.toHaveBeenCalled();
    expect(roleRepo.findRolesForMember).not.toHaveBeenCalled();
  });

  it('resolves @everyone base permissions when no roles assigned', async () => {
    vi.mocked(roleRepo.findEveryoneRole).mockResolvedValue({
      id: 'role-everyone',
      hubId: HUB_ID,
      name: '@everyone',
      priority: 0,
      bitsetPermissions: '3', // VIEW_CHANNELS | SEND_MESSAGES
    });
    vi.mocked(roleRepo.findRolesForMember).mockResolvedValue([]);
    vi.mocked(overrideRepo.findRoleOverrides).mockResolvedValue([]);
    vi.mocked(overrideRepo.findMemberOverride).mockResolvedValue(null);

    const result = await resolvePermissions(HUB_ID, CHANNEL_ID, USER_ID);
    expect(result).toBe(3); // VIEW_CHANNELS | SEND_MESSAGES
  });

  it('ORs @everyone with member role permissions', async () => {
    vi.mocked(roleRepo.findEveryoneRole).mockResolvedValue({
      id: 'role-everyone',
      hubId: HUB_ID,
      name: '@everyone',
      priority: 0,
      bitsetPermissions: '1', // VIEW_CHANNELS
    });
    vi.mocked(roleRepo.findRolesForMember).mockResolvedValue([
      {
        id: 'role-mod',
        hubId: HUB_ID,
        name: 'Moderator',
        priority: 1,
        bitsetPermissions: '2', // SEND_MESSAGES
      },
    ]);
    vi.mocked(overrideRepo.findRoleOverrides).mockResolvedValue([]);
    vi.mocked(overrideRepo.findMemberOverride).mockResolvedValue(null);

    const result = await resolvePermissions(HUB_ID, CHANNEL_ID, USER_ID);
    expect(result).toBe(3); // 1 | 2 = 3
  });

  it('ADMINISTRATOR short-circuits to all perms', async () => {
    const adminBit = Permission.ADMINISTRATOR;
    vi.mocked(roleRepo.findEveryoneRole).mockResolvedValue({
      id: 'role-everyone',
      hubId: HUB_ID,
      name: '@everyone',
      priority: 0,
      bitsetPermissions: String(adminBit),
    });
    vi.mocked(roleRepo.findRolesForMember).mockResolvedValue([]);

    const result = await resolvePermissions(HUB_ID, CHANNEL_ID, USER_ID);
    expect(result).toBe(4294967295); // ~0 >>> 0, all 32 bits set
  });

  it('channel role overrides apply allow and deny', async () => {
    // Base: VIEW_CHANNELS
    vi.mocked(roleRepo.findEveryoneRole).mockResolvedValue({
      id: 'role-everyone',
      hubId: HUB_ID,
      name: '@everyone',
      priority: 0,
      bitsetPermissions: String(Permission.VIEW_CHANNELS),
    });
    vi.mocked(roleRepo.findRolesForMember).mockResolvedValue([]);

    // Override: allow SEND_MESSAGES, deny VIEW_CHANNELS
    vi.mocked(overrideRepo.findRoleOverrides).mockResolvedValue([
      {
        id: 'override-1',
        channelId: CHANNEL_ID,
        targetType: 'role' as const,
        targetId: 'role-everyone',
        allowBitset: Permission.SEND_MESSAGES,
        denyBitset: Permission.VIEW_CHANNELS,
      },
    ]);
    vi.mocked(overrideRepo.findMemberOverride).mockResolvedValue(null);

    const result = await resolvePermissions(HUB_ID, CHANNEL_ID, USER_ID);
    // Start: VIEW_CHANNELS (1)
    // After allow SEND_MESSAGES: VIEW_CHANNELS | SEND_MESSAGES (3)
    // After deny VIEW_CHANNELS: SEND_MESSAGES (2)
    expect(result).toBe(Permission.SEND_MESSAGES);
  });

  it('channel member overrides apply after role overrides', async () => {
    // Base: VIEW_CHANNELS | SEND_MESSAGES
    vi.mocked(roleRepo.findEveryoneRole).mockResolvedValue({
      id: 'role-everyone',
      hubId: HUB_ID,
      name: '@everyone',
      priority: 0,
      bitsetPermissions: String(Permission.VIEW_CHANNELS | Permission.SEND_MESSAGES),
    });
    vi.mocked(roleRepo.findRolesForMember).mockResolvedValue([]);
    vi.mocked(overrideRepo.findRoleOverrides).mockResolvedValue([]);

    // Member override: allow MANAGE_MESSAGES, deny SEND_MESSAGES
    vi.mocked(overrideRepo.findMemberOverride).mockResolvedValue({
      id: 'override-member',
      channelId: CHANNEL_ID,
      targetType: 'member' as const,
      targetId: USER_ID,
      allowBitset: Permission.MANAGE_MESSAGES,
      denyBitset: Permission.SEND_MESSAGES,
    });

    const result = await resolvePermissions(HUB_ID, CHANNEL_ID, USER_ID);
    // Start: VIEW_CHANNELS | SEND_MESSAGES (3)
    // After allow MANAGE_MESSAGES: VIEW_CHANNELS | SEND_MESSAGES | MANAGE_MESSAGES (7)
    // After deny SEND_MESSAGES: VIEW_CHANNELS | MANAGE_MESSAGES (5)
    expect(result).toBe(Permission.VIEW_CHANNELS | Permission.MANAGE_MESSAGES);
  });

  it('checkPermission returns true when permission is present', async () => {
    vi.mocked(redis.get).mockResolvedValue(String(Permission.VIEW_CHANNELS | Permission.SEND_MESSAGES));

    const result = await checkPermission(HUB_ID, CHANNEL_ID, USER_ID, Permission.VIEW_CHANNELS);
    expect(result).toBe(true);
  });

  it('checkPermission returns false when permission is absent', async () => {
    vi.mocked(redis.get).mockResolvedValue(String(Permission.VIEW_CHANNELS));

    const result = await checkPermission(HUB_ID, CHANNEL_ID, USER_ID, Permission.SEND_MESSAGES);
    expect(result).toBe(false);
  });

  it('caches computed result in Redis', async () => {
    vi.mocked(roleRepo.findEveryoneRole).mockResolvedValue({
      id: 'role-everyone',
      hubId: HUB_ID,
      name: '@everyone',
      priority: 0,
      bitsetPermissions: '3',
    });
    vi.mocked(roleRepo.findRolesForMember).mockResolvedValue([]);
    vi.mocked(overrideRepo.findRoleOverrides).mockResolvedValue([]);
    vi.mocked(overrideRepo.findMemberOverride).mockResolvedValue(null);

    await resolvePermissions(HUB_ID, CHANNEL_ID, USER_ID);
    expect(redis.set).toHaveBeenCalledWith(
      `perms:${HUB_ID}:${CHANNEL_ID}:${USER_ID}`,
      '3',
      'EX',
      60,
    );
  });
});
