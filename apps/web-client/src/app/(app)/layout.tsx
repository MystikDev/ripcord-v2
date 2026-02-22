'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useGateway } from '@/hooks/use-gateway';
import { useHubData } from '@/hooks/use-hub-data';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toast';
import { AppShell } from '@/components/layout/app-shell';
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow';

/**
 * App layout: wraps the 3-column shell, guards auth,
 * connects the gateway, and shows onboarding when user has no hubs.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Connect gateway when authenticated
  useGateway();
  const { showOnboarding, setShowOnboarding } = useHubData();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <TooltipProvider>
        <AppShell />
        {/* Onboarding dialog when user has zero hubs */}
        <OnboardingFlow
          open={showOnboarding}
          onComplete={() => setShowOnboarding(false)}
        />
        {/* children slot for potential nested routes */}
        {children}
      </TooltipProvider>
    </ToastProvider>
  );
}
