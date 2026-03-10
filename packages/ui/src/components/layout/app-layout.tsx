/**
 * @module app-layout
 * Root authenticated layout. Guards auth (redirects to /login), connects the
 * WebSocket gateway, loads hub data, provides Toast/Tooltip context, renders
 * AppShell, and overlays OnboardingFlow for first-time users.
 *
 * Note: What's New dialog is rendered at the App root level (apps/desktop/src/App.tsx)
 * so it shows over the login page after updates.
 */
import { useEffect, useState } from 'react';
import { useAppRouter } from '../../lib/router';
import { useAuthStore } from '../../stores/auth-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useGateway } from '../../hooks/use-gateway';
import { useHubData } from '../../hooks/use-hub-data';
import { TooltipProvider } from '../ui/tooltip';
import { ToastProvider } from '../ui/toast';
import { AppShell } from './app-shell';
import { OnboardingFlow } from '../onboarding/onboarding-flow';
import { QuickTourOverlay } from '../onboarding/quick-tour/quick-tour-overlay';
import { QuickSwitcher } from '../ui/quick-switcher';

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

  // ---- Standalone Tour Replay (triggered from Settings) ----
  const showTour = useSettingsStore((s) => s.showTour);
  const dismissTour = useSettingsStore((s) => s.dismissTour);

  // ---- Quick Switcher (Ctrl+K / Cmd+K) ----
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (!showOnboarding) {
          setQuickSwitcherOpen((prev) => !prev);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showOnboarding]);

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
        <QuickSwitcher open={quickSwitcherOpen} onOpenChange={setQuickSwitcherOpen} />
        <OnboardingFlow
          open={showOnboarding}
          onComplete={() => setShowOnboarding(false)}
        />
        {/* Standalone tour replay — shown when triggered from Settings */}
        {showTour && !showOnboarding && (
          <QuickTourOverlay onComplete={dismissTour} />
        )}
      </TooltipProvider>
    </ToastProvider>
  );
}
