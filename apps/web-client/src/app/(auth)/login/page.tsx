'use client';

import { Suspense } from 'react';
import { NextRouterProvider } from '@/lib/next-router-adapter';
import { setAppConfig, PasskeyLogin, PasswordLogin, Tabs, TabsList, TabsTrigger, TabsContent } from '@ripcord/ui';

setAppConfig({
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  authBaseUrl: process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:4002',
  gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'ws://localhost:4001',
});

export default function LoginPage() {
  return (
    <Suspense>
      <NextRouterProvider>
        <div className="flex min-h-screen items-center justify-center bg-bg px-4">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent shadow-lg shadow-accent/20">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 4h10c4.42 0 8 2.69 8 6s-3.58 6-8 6h-2l8 12h-5.5L11 16H12c3.31 0 6-1.34 6-4s-2.69-4-6-4h-4v18H8V4z" fill="white"/>
                  <path d="M6 2l4 2v24l-4 2V2z" fill="rgba(255,255,255,0.6)"/>
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
                  <PasskeyLogin />
                </TabsContent>
                <TabsContent value="password" className="p-0 pt-4">
                  <PasswordLogin />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </NextRouterProvider>
    </Suspense>
  );
}
