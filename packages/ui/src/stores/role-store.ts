/**
 * @module role-store
 * Zustand store for hub role definitions. Roles are loaded when the active hub
 * changes and used for priority-based member grouping in the sidebar.
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A role definition within a hub, ordered by priority for display grouping. */
export interface RoleDefinition {
  id: string;
  name: string;
  priority: number;
  color?: string;
}

export interface RoleStore {
  /** All roles for the current hub, ordered by priority. */
  roles: RoleDefinition[];

  /** Replace all roles (used when hub changes). */
  setRoles: (roles: RoleDefinition[]) => void;

  /** Look up a single role by ID. */
  getRoleById: (id: string) => RoleDefinition | undefined;

  /** Update a single role in place, or append if new. */
  updateRole: (role: RoleDefinition) => void;

  /** Remove a role by ID. */
  removeRole: (roleId: string) => void;

  /** Reset all role data. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useRoleStore = create<RoleStore>()((set, get) => ({
  roles: [],

  setRoles: (roles) => set({ roles }),

  getRoleById: (id) => get().roles.find((r) => r.id === id),

  updateRole: (role) => set((state) => {
    const idx = state.roles.findIndex((r) => r.id === role.id);
    if (idx >= 0) {
      const next = [...state.roles];
      next[idx] = role;
      return { roles: next };
    }
    return { roles: [...state.roles, role] };
  }),

  removeRole: (roleId) => set((state) => ({
    roles: state.roles.filter((r) => r.id !== roleId),
  })),

  reset: () => set({ roles: [] }),
}));
