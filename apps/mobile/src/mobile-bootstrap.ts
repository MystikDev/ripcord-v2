/**
 * @module mobile-bootstrap
 * Side-effect-only module that runs before React mounts. Configures the app
 * for the iOS/Capacitor environment:
 *   1. Forces Classic layout (Universe/Solar System views are mouse-driven
 *      and don't translate to touch).
 *   2. Wires Capacitor lifecycle hooks (deep links, app resume, status bar).
 *   3. Hides the splash screen once we're ready to paint.
 *
 * Capacitor calls are wrapped in dynamic imports so this module also works
 * when the build is loaded in a regular browser (e.g. `pnpm dev` preview).
 */

// 1. Force Classic layout BEFORE the settings store reads from localStorage.
//    This writes directly to the persisted key so the Zustand persist middleware
//    sees Classic during rehydration on first launch. On subsequent launches
//    the user's saved preference is honored.
try {
  const KEY = 'ripcord-settings';
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed?.state && parsed.state.layoutMode === undefined) {
      parsed.state.layoutMode = 'classic';
      localStorage.setItem(KEY, JSON.stringify(parsed));
    }
  } else {
    // First launch — seed the store with Classic mode.
    localStorage.setItem(
      KEY,
      JSON.stringify({ state: { layoutMode: 'classic' }, version: 0 }),
    );
  }
} catch {
  // localStorage unavailable (private mode etc.) — ignore.
}

// 2. Capacitor integrations — only run when actually inside the native shell.
//    `Capacitor.isNativePlatform()` returns false in plain web previews.
const isNative = (): boolean => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w?.Capacitor?.isNativePlatform?.() === true;
};

if (isNative()) {
  void initNativeIntegrations();
}

async function initNativeIntegrations(): Promise<void> {
  try {
    const [{ App: CapApp }, { StatusBar, Style }, { SplashScreen }, { Keyboard }] =
      await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/status-bar'),
        import('@capacitor/splash-screen'),
        import('@capacitor/keyboard'),
      ]);

    // Match status bar to dark theme background
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    await StatusBar.setBackgroundColor({ color: '#050508' }).catch(() => undefined);

    // Hide splash once initial paint is ready
    setTimeout(() => {
      SplashScreen.hide().catch(() => undefined);
    }, 200);

    // Deep links: route the user to /invite/:code etc. when ripcord.gg URLs are
    // tapped from elsewhere. The associated-domains entitlement is configured
    // in App.entitlements.
    CapApp.addListener('appUrlOpen', (event) => {
      try {
        const url = new URL(event.url);
        const path = url.pathname + url.search;
        if (path && path !== '/') {
          window.location.href = path;
        }
      } catch {
        // ignore malformed URLs
      }
    });

    // Adjust keyboard avoidance: native iOS pushes WebView content up when the
    // keyboard appears. Capacitor handles this automatically with the default
    // Native resize mode; nothing more required here.
    Keyboard.addListener('keyboardWillShow', () => {
      document.documentElement.classList.add('keyboard-open');
    });
    Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.classList.remove('keyboard-open');
    });
  } catch (err) {
    console.warn('[mobile-bootstrap] native init failed:', err);
  }
}

export {};
