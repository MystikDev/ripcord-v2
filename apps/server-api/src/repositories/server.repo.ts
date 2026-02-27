import { query, queryOne } from '@ripcord/db';
import type { Hub } from '@ripcord/types';

/** Row shape returned from the hubs table. */
interface HubRow {
  id: string;
  name: string;
  owner_user_id: string;
  icon_url: string | null;
  banner_url: string | null;
  created_at: string;
}

/** Map a database row to the camelCase domain type. */
function toHub(row: HubRow): Hub {
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id,
    iconUrl: row.icon_url ?? undefined,
    bannerUrl: row.banner_url ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Create a new hub.
 *
 * @param name - Display name of the hub.
 * @param ownerUserId - User ID of the owner/creator.
 * @returns The newly created hub.
 */
export async function create(name: string, ownerUserId: string): Promise<Hub> {
  const rows = await query<HubRow>(
    `INSERT INTO hubs (name, owner_user_id)
     VALUES ($1, $2)
     RETURNING id, name, owner_user_id, icon_url, banner_url, created_at`,
    [name, ownerUserId],
  );
  return toHub(rows[0]!);
}

/**
 * Find a hub by its primary key.
 *
 * @param id - Hub UUID.
 * @returns The hub, or null if not found.
 */
export async function findById(id: string): Promise<Hub | null> {
  const row = await queryOne<HubRow>(
    `SELECT id, name, owner_user_id, icon_url, banner_url, created_at FROM hubs WHERE id = $1`,
    [id],
  );
  return row ? toHub(row) : null;
}

/**
 * Update a hub's display name.
 *
 * @param id - Hub UUID.
 * @param name - New display name.
 * @returns The updated hub, or null if not found.
 */
export async function updateName(id: string, name: string): Promise<Hub | null> {
  const row = await queryOne<HubRow>(
    `UPDATE hubs SET name = $2 WHERE id = $1
     RETURNING id, name, owner_user_id, icon_url, banner_url, created_at`,
    [id, name],
  );
  return row ? toHub(row) : null;
}

/**
 * Update a hub's icon URL (the storage key in MinIO).
 *
 * @param id - Hub UUID.
 * @param iconUrl - Storage key for the icon image, or null to remove.
 * @returns The updated hub, or null if not found.
 */
export async function updateIconUrl(id: string, iconUrl: string | null): Promise<Hub | null> {
  const row = await queryOne<HubRow>(
    `UPDATE hubs SET icon_url = $2 WHERE id = $1
     RETURNING id, name, owner_user_id, icon_url, banner_url, created_at`,
    [id, iconUrl],
  );
  return row ? toHub(row) : null;
}

/**
 * Update a hub's banner URL (the storage key in MinIO).
 *
 * @param id - Hub UUID.
 * @param bannerUrl - Storage key for the banner image, or null to remove.
 * @returns The updated hub, or null if not found.
 */
export async function updateBannerUrl(id: string, bannerUrl: string | null): Promise<Hub | null> {
  const row = await queryOne<HubRow>(
    `UPDATE hubs SET banner_url = $2 WHERE id = $1
     RETURNING id, name, owner_user_id, icon_url, banner_url, created_at`,
    [id, bannerUrl],
  );
  return row ? toHub(row) : null;
}

/**
 * Delete a hub by its primary key.
 * Cascading FK constraints will remove channels, members, roles, bans, etc.
 *
 * @param id - Hub UUID.
 */
export async function deleteHub(id: string): Promise<void> {
  await query(`DELETE FROM hubs WHERE id = $1`, [id]);
}

/**
 * Find all hubs the given user is a member of.
 *
 * @param userId - User UUID.
 * @returns List of hubs the user belongs to, ordered by creation date.
 */
export async function findByUserId(userId: string): Promise<Hub[]> {
  const rows = await query<HubRow>(
    `SELECT h.id, h.name, h.owner_user_id, h.icon_url, h.banner_url, h.created_at
     FROM hubs h
     INNER JOIN hub_members hm ON hm.hub_id = h.id
     WHERE hm.user_id = $1
     ORDER BY h.created_at ASC`,
    [userId],
  );
  return rows.map(toHub);
}
