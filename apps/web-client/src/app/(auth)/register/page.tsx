'use client';

import { Suspense } from 'react';
import { NextRouterProvider } from '@/lib/next-router-adapter';
import { setAppConfig, PasskeyRegister, PasswordRegister, Tabs, TabsList, TabsTrigger, TabsContent } from '@ripcord/ui';

setAppConfig({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  authBaseUrl: process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:4002',
  gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'ws://localhost:4001',
});

export default function RegisterPage() {
  return (
    <Suspense>
      <NextRouterProvider>
        <div className="flex min-h-screen items-center justify-center bg-bg px-4">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent shadow-lg shadow-accent/20">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface-1 p-6 shadow-xl">
              <Tabs defaultValue="passkey">
                <TabsList>
                  <TabsTrigger value="passkey">Passkey</TabsTrigger>
                  <TabsTrigger value="password">Password</TabsTrigger>
                </TabsList>
                <TabsContent value="passkey" className="p-0 pt-4">
                  <PasskeyRegister />
                </TabsContent>
                <TabsContent value="password" className="p-0 pt-4">
                  <PasswordRegister />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </NextRouterProvider>
    </Suspense>
  );
}
