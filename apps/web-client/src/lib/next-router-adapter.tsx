'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import NextLink from 'next/link';
import { RouterContext, type AppRouterContext } from '@ripcord/ui';

function LinkAdapter({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return <NextLink href={href} className={className}>{children}</NextLink>;
}

export function NextRouterProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();

  const ctx = useMemo<AppRouterContext>(() => ({
    router: {
      push: (path: string) => router.push(path),
      replace: (path: string) => router.replace(path),
      back: () => router.back(),
    },
    searchParams,
    params: (params ?? {}) as Record<string, string>,
    Link: LinkAdapter,
  }), [router, searchParams, params]);

  return (
    <RouterContext.Provider value={ctx}>
      {children}
    </RouterContext.Provider>
  );
}
