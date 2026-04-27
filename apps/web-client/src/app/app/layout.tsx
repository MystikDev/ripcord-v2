'use client';

import { Suspense } from 'react';
import { NextRouterProvider } from '@/lib/next-router-adapter';
import { setAppConfig, AppLayout } from '@ripcord/ui';

// Initialize config from Next.js env vars
setAppConfig({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  authBaseUrl: process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:4002',
  gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'ws://localhost:4001',
});

export default function NextAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <NextRouterProvider>
        <AppLayout />
        {children}
      </NextRouterProvider>
    </Suspense>
  );
}
