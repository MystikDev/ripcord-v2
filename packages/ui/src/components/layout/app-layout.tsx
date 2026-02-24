/**
 * @module app-layout
 * Root authenticated layout. Guards auth (redirects to /login), connects the
 * WebSocket gateway, loads hub data, provides Toast/Tooltip context, renders
 * AppShell, and overlays OnboardingFlow for first-time users.
 */
import { useEffect } from 'react';
import { useAppRouter } from '../../lib/router';
import { useAuthStore } from '../../stores/auth-store';
import { useGateway } from '../../hooks/use-gateway';
import { useHubData } from '../../hooks/use-hub-data';
import { TooltipProvider } from '../ui/tooltip';
import { ToastProvider } from '../ui/toast';
import { AppShell } from './app-shell';
import { OnboardingFlow } from '../onboarding/onboarding-flow';

/**
 * App layout: wraps the 3-column shell, guards auth,
 * connects the gateway, and shows onboarding when user has no hubs.
 */
export function AppLayout() {
  const router = useAppRouter();
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
        <OnboardingFlow
          open={showOnboarding}
          onComplete={() => setShowOnboarding(false)}
        />
      </TooltipProvider>
    </ToastProvider>
  );
}
