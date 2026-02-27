/**
 * @module app-layout
 * Root authenticated layout. Guards auth (redirects to /login), connects the
 * WebSocket gateway, loads hub data, provides Toast/Tooltip context, renders
 * AppShell, overlays OnboardingFlow for first-time users, and shows the
 * What's New dialog after version updates.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAppRouter } from '../../lib/router';
import { useAuthStore } from '../../stores/auth-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useGateway } from '../../hooks/use-gateway';
import { useHubData } from '../../hooks/use-hub-data';
import { getAppVersion } from '../../lib/constants';
import { getChangelogForVersion } from '../../lib/changelog';
import { TooltipProvider } from '../ui/tooltip';
import { ToastProvider } from '../ui/toast';
import { AppShell } from './app-shell';
import { OnboardingFlow } from '../onboarding/onboarding-flow';
import { WhatsNewDialog } from '../ui/whats-new-dialog';
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

  // ---- What's New dialog ----
  const hideWhatsNew = useSettingsStore((s) => s.hideWhatsNew);
  const lastSeenVersion = useSettingsStore((s) => s.lastSeenVersion);
  const setHideWhatsNew = useSettingsStore((s) => s.setHideWhatsNew);
  const setLastSeenVersion = useSettingsStore((s) => s.setLastSeenVersion);

  // ---- Quick Switcher (Ctrl+K / Cmd+K) ----
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setQuickSwitcherOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const currentVersion = getAppVersion();
  const changelogEntry = getChangelogForVersion(currentVersion);

  useEffect(() => {
    if (
      isAuthenticated &&
      !hideWhatsNew &&
      lastSeenVersion !== currentVersion &&
      currentVersion !== 'dev' &&
      changelogEntry
    ) {
      setWhatsNewOpen(true);
    }
    // Intentionally narrow deps — decide once at mount / login time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleWhatsNewClose = useCallback(
    (dontShowAgain: boolean) => {
      setWhatsNewOpen(false);
      setLastSeenVersion(currentVersion);
      if (dontShowAgain) {
        setHideWhatsNew(true);
      }
    },
    [currentVersion, setLastSeenVersion, setHideWhatsNew],
  );

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
        {changelogEntry && (
          <WhatsNewDialog
            open={whatsNewOpen}
            onClose={handleWhatsNewClose}
            entry={changelogEntry}
          />
        )}
      </TooltipProvider>
    </ToastProvider>
  );
}
