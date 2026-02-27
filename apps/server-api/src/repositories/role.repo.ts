import { query, queryOne } from '@ripcord/db';
import type { Role, MemberRole } from '@ripcord/types';

/** Row shape returned from the roles table. */
interface RoleRow {
  id: string;
  hub_id: string;
  name: string;
  priority: number;
  bitset_permissions: string;
  color: string | null;
}

/** Row shape returned from the member_roles table. */
interface MemberRoleRow {
  hub_id: string;
  user_id: string;
  role_id: string;
}

/** Map a database row to the camelCase domain type. */
function toRole(row: RoleRow): Role {
  return {
    id: row.id,
    hubId: row.hub_id,
    name: row.name,
    priority: row.priority,
    bitsetPermissions: row.bitset_permissions,
    ...(row.color ? { color: row.color } : {}),
  };
}

/** Map a database row to the camelCase domain type. */
function toMemberRole(row: MemberRoleRow): MemberRole {
  return {
    hubId: row.hub_id,
    userId: row.user_id,
    roleId: row.role_id,
  };
}

/**
 * Create a new role in a hub.
 *
 * @param hubId - Hub UUID.
 * @param name - Role display name.
 * @param priority - Sort priority (lower = higher rank).
 * @param bitsetPermissions - Permission bitfield as a decimal string.
 * @returns The newly created role.
 */
export async function create(
  hubId: string,
  name: string,
  priority: number,
  bitsetPermissions: string,
  color?: string,
): Promise<Role> {
  const rows = await query<RoleRow>(
    `INSERT INTO roles (hub_id, name, priority, bitset_permissions, color)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, hub_id, name, priority, bitset_permissions, color`,
    [hubId, name, priority, bitsetPermissions, color ?? null],
  );
  return toRole(rows[0]!);
}

/**
 * Find a role by its primary key.
 *
 * @param id - Role UUID.
 * @returns The role, or null if not found.
 */
export async function findById(id: string): Promise<Role | null> {
  const row = await queryOne<RoleRow>(
    `SELECT id, hub_id, name, priority, bitset_permissions, color FROM roles WHERE id = $1`,
    [id],
  );
  return row ? toRole(row) : null;
}

/**
 * Find the @everyone role for a hub.
 * The @everyone role is expected to have the name '@everyone'.
 *
 * @param hubId - Hub UUID.
 * @returns The @everyone role, or null if not found.
 */
export async function findEveryoneRole(hubId: string): Promise<Role | null> {
  const row = await queryOne<RoleRow>(
    `SELECT id, hub_id, name, priority, bitset_permissions, color
     FROM roles WHERE hub_id = $1 AND name = '@everyone'`,
    [hubId],
  );
  return row ? toRole(row) : null;
}

/**
 * List all roles in a hub, ordered by priority ascending.
 *
 * @param hubId - Hub UUID.
 * @returns Array of roles.
 */
export async function findByHubId(hubId: string): Promise<Role[]> {
  const rows = await query<RoleRow>(
    `SELECT id, hub_id, name, priority, bitset_permissions, color
     FROM roles WHERE hub_id = $1
     ORDER BY priority ASC`,
    [hubId],
  );
  return rows.map(toRole);
}

/**
 * Get all role assignments for a specific member in a hub.
 *
 * @param hubId - Hub UUID.
 * @param userId - User UUID.
 * @returns Array of member-role assignments.
 */
export async function findMemberRoles(hubId: string, userId: string): Promise<MemberRole[]> {
  const rows = await query<MemberRoleRow>(
    `SELECT hub_id, user_id, role_id
     FROM member_roles WHERE hub_id = $1 AND user_id = $2`,
    [hubId, userId],
  );
  return rows.map(toMemberRole);
}

/**
 * Get the full Role objects for all roles assigned to a member.
 *
 * @param hubId - Hub UUID.
 * @param userId - User UUID.
 * @returns Array of roles the member holds.
 */
export async function findRolesForMember(hubId: string, userId: string): Promise<Role[]> {
  const rows = await query<RoleRow>(
    `SELECT r.id, r.hub_id, r.name, r.priority, r.bitset_permissions, r.color
     FROM roles r
     INNER JOIN member_roles mr ON mr.role_id = r.id
     WHERE mr.hub_id = $1 AND mr.user_id = $2
     ORDER BY r.priority ASC`,
    [hubId, userId],
  );
  return rows.map(toRole);
}

/**
 * Assign a role to a member.
 *
 * @param hubId - Hub UUID.
 * @param userId - User UUID.
 * @param roleId - Role UUID to assign.
 */
export async function assignRole(hubId: string, userId: string, roleId: string): Promise<void> {
  await query(
    `INSERT INTO member_roles (hub_id, user_id, role_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (hub_id, user_id, role_id) DO NOTHING`,
    [hubId, userId, roleId],
  );
}

/**
 * Remove a role assignment from a member.
 */
export async function removeRole(hubId: string, userId: string, roleId: string): Promise<void> {
  await query(
    `DELETE FROM member_roles WHERE hub_id = $1 AND user_id = $2 AND role_id = $3`,
    [hubId, userId, roleId],
  );
}

/**
 * Update a role's name, priority, or permissions.
 */
export async function update(
  roleId: string,
  updates: { name?: string; priority?: number; bitsetPermissions?: string; color?: string | null },
): Promise<Role | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    sets.push(`name = $${paramIndex++}`);
    params.push(updates.name);
  }
  if (updates.priority !== undefined) {
    sets.push(`priority = $${paramIndex++}`);
    params.push(updates.priority);
  }
  if (updates.bitsetPermissions !== undefined) {
    sets.push(`bitset_permissions = $${paramIndex++}`);
    params.push(updates.bitsetPermissions);
  }
  if (updates.color !== undefined) {
    sets.push(`color = $${paramIndex++}`);
    params.push(updates.color);
  }

  if (sets.length === 0) return null;

  params.push(roleId);
  const row = await queryOne<RoleRow>(
    `UPDATE roles SET ${sets.join(', ')} WHERE id = $${paramIndex} RETURNING id, hub_id, name, priority, bitset_permissions, color`,
    params,
  );
  return row ? toRole(row) : null;
}

/**
 * Delete a role by its ID. Cascades to member_roles via FK.
 */
export async function deleteRole(roleId: string): Promise<void> {
  await query(`DELETE FROM roles WHERE id = $1`, [roleId]);
}
