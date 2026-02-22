import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoleDefinition {
  id: string;
  name: string;
  priority: number;
}

export interface RoleStore {
  /** All roles for the current hub, ordered by priority. */
  roles: RoleDefinition[];

  /** Replace all roles (used when hub changes). */
  setRoles: (roles: RoleDefinition[]) => void;

  /** Look up a single role by ID. */
  getRoleById: (id: string) => RoleDefinition | undefined;

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

  reset: () => set({ roles: [] }),
}));
