import { createContext, useContext } from 'react';

/**
 * Framework-agnostic router interface.
 * Each host app (Next.js, React Router, etc.) provides its own adapter.
 */
export interface AppRouter {
  push(path: string): void;
  replace(path: string): void;
  back(): void;
}

export interface AppRouterContext {
  router: AppRouter;
  searchParams: URLSearchParams;
  params: Record<string, string>;
  Link: React.ComponentType<{
    href: string;
    className?: string;
    children: React.ReactNode;
  }>;
}

export const RouterContext = createContext<AppRouterContext | null>(null);

export function useAppRouter(): AppRouter {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('RouterContext not provided');
  return ctx.router;
}

export function useAppSearchParams(): URLSearchParams {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('RouterContext not provided');
  return ctx.searchParams;
}

export function useAppParams(): Record<string, string> {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('RouterContext not provided');
  return ctx.params;
}

export function useAppLink(): AppRouterContext['Link'] {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('RouterContext not provided');
  return ctx.Link;
}
