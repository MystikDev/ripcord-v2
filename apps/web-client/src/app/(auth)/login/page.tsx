import { Suspense } from 'react';
import { PasskeyLogin } from '@/components/auth/passkey-login';
import { PasswordLogin } from '@/components/auth/password-login';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent shadow-lg shadow-accent/20">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-surface-1 p-6 shadow-xl">
          <Suspense>
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
          </Suspense>
        </div>
      </div>
    </div>
  );
}
