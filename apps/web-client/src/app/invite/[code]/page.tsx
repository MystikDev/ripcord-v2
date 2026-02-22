'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { NextRouterProvider } from '@/lib/next-router-adapter';
import { setAppConfig, InvitePage } from '@ripcord/ui';

setAppConfig({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  authBaseUrl: process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:4002',
  gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'ws://localhost:4001',
});

export default function InvitePageWrapper() {
  const params = useParams<{ code: string }>();

  return (
    <Suspense>
      <NextRouterProvider>
        <InvitePage code={params?.code ?? ''} />
      </NextRouterProvider>
    </Suspense>
  );
}
