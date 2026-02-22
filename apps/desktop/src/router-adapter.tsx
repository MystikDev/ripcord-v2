import { useMemo } from 'react';
import { useNavigate, useSearchParams, useParams, Link as RRLink } from 'react-router-dom';
import { RouterContext, type AppRouterContext } from '@ripcord/ui';

function LinkAdapter({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <RRLink to={href} className={className}>
      {children}
    </RRLink>
  );
}

export function TauriRouterProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams();

  const ctx = useMemo<AppRouterContext>(
    () => ({
      router: {
        push: (path: string) => navigate(path),
        replace: (path: string) => navigate(path, { replace: true }),
        back: () => navigate(-1),
      },
      searchParams,
      params: (params ?? {}) as Record<string, string>,
      Link: LinkAdapter,
    }),
    [navigate, searchParams, params],
  );

  return <RouterContext.Provider value={ctx}>{children}</RouterContext.Provider>;
}
