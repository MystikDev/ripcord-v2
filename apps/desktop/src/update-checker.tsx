import { useEffect, useRef, useState, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { getVersion } from '@tauri-apps/api/app';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Initial delay before the first update check (seconds). */
const INITIAL_DELAY_SEC = 5;

/** How often to re-check for updates (30 minutes). */
const POLL_INTERVAL_MS = 30 * 60 * 1000;

/** Per-check timeout so a hung request doesn't block forever. */
const CHECK_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; progress: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function notifyUser(version: string): Promise<void> {
  try {
    let allowed = await isPermissionGranted();
    if (!allowed) {
      const perm = await requestPermission();
      allowed = perm === 'granted';
    }
    if (allowed) {
      sendNotification({
        title: 'Ripcord Update Available',
        body: `Version ${version} has been downloaded and is ready to install. Click the banner in the app to restart.`,
      });
    }
  } catch (err) {
    console.warn('[UpdateChecker] notification error:', err);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UpdateChecker() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  // Track whether an update was already found & installed so the
  // periodic poll doesn't re-download.
  const foundRef = useRef(false);
  const cancelledRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    // If we already found + installed an update, stop polling.
    if (foundRef.current || cancelledRef.current) return;

    setState({ status: 'checking' });

    try {
      const currentVersion = await getVersion();
      console.log(`[UpdateChecker] Current version: ${currentVersion}, checking for updates...`);

      // Race the check against a timeout so we don't hang forever.
      const update = await Promise.race([
        check(),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Update check timed out')), CHECK_TIMEOUT_MS),
        ),
      ]);

      if (cancelledRef.current) return;

      if (update) {
        console.log(`[UpdateChecker] Update found: v${update.version} (current: ${currentVersion})`);
        foundRef.current = true;
        setState({ status: 'available', version: update.version });

        // Auto-download in background
        let downloaded = 0;
        let total = 0;
        await update.downloadAndInstall((event) => {
          if (cancelledRef.current) return;
          if (event.event === 'Started' && event.data.contentLength) {
            total = event.data.contentLength;
            console.log(`[UpdateChecker] Download started, size: ${total} bytes`);
          } else if (event.event === 'Progress') {
            downloaded += event.data.chunkLength;
            const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;
            setState({ status: 'downloading', progress });
          } else if (event.event === 'Finished') {
            console.log('[UpdateChecker] Download finished');
            setState({ status: 'ready', version: update.version });
          }
        });

        if (!cancelledRef.current) {
          setState({ status: 'ready', version: update.version });
          // Re-show banner if user previously dismissed it
          setDismissed(false);
          // Fire a system notification so tray-minimised users see it
          await notifyUser(update.version);
        }
      } else {
        console.log(`[UpdateChecker] No update available (current: ${currentVersion})`);
        setState({ status: 'idle' });
      }
    } catch (err) {
      if (!cancelledRef.current) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[UpdateChecker] Check failed:', message);
        // Show error briefly then go idle — don't block the UI permanently
        setState({ status: 'error', message });
        setTimeout(() => {
          setState((prev) => (prev.status === 'error' ? { status: 'idle' } : prev));
        }, 10_000);
      }
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;

    // First check after a short delay so the app loads first
    const initialTimer = setTimeout(checkForUpdate, INITIAL_DELAY_SEC * 1000);

    // Then re-check periodically
    const pollTimer = setInterval(checkForUpdate, POLL_INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      clearTimeout(initialTimer);
      clearInterval(pollTimer);
    };
  }, [checkForUpdate]);

  if (dismissed || state.status === 'idle' || state.status === 'checking') {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-accent/90 px-4 py-1.5 text-xs text-white backdrop-blur-sm">
      {state.status === 'available' && (
        <span>Update v{state.version} available — downloading...</span>
      )}

      {state.status === 'downloading' && (
        <span>Downloading update... {state.progress}%</span>
      )}

      {state.status === 'ready' && (
        <>
          <span>Update v{state.version} ready!</span>
          <button
            onClick={() => relaunch()}
            className="rounded bg-white/20 px-2 py-0.5 font-medium transition-colors hover:bg-white/30"
          >
            Restart now
          </button>
        </>
      )}

      {state.status === 'error' && (
        <span>Update check failed: {state.message}</span>
      )}

      <button
        onClick={() => setDismissed(true)}
        className="ml-2 rounded p-0.5 transition-colors hover:bg-white/20"
        title="Dismiss"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
