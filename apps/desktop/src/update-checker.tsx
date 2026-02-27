import { useEffect, useRef, useState, useCallback } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
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

/** How often to re-check for updates (5 minutes). */
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/** Per-check timeout so a hung request doesn't block forever. */
const CHECK_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; progress: number }
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
        body: `Version ${version} is available. Open Ripcord to update.`,
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

  // Track whether an update was already found so the periodic poll doesn't
  // re-check once we're waiting for user action.
  const foundRef = useRef(false);
  const cancelledRef = useRef(false);
  const updateRef = useRef<Update | null>(null);

  const checkForUpdate = useCallback(async () => {
    if (foundRef.current || cancelledRef.current) return;

    setState({ status: 'checking' });

    try {
      const currentVersion = await getVersion();
      console.log(`[UpdateChecker] Current version: ${currentVersion}, checking for updates...`);

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
        updateRef.current = update;

        // Show prompt — do NOT auto-download
        setState({ status: 'available', version: update.version });
        setDismissed(false);

        // System notification so tray-minimised users see it
        await notifyUser(update.version);
      } else {
        console.log(`[UpdateChecker] No update available (current: ${currentVersion})`);
        setState({ status: 'idle' });
      }
    } catch (err) {
      if (!cancelledRef.current) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[UpdateChecker] Check failed:', message);
        setState({ status: 'error', message });
        setTimeout(() => {
          setState((prev) => (prev.status === 'error' ? { status: 'idle' } : prev));
        }, 10_000);
      }
    }
  }, []);

  /** Called when user explicitly agrees to upgrade. */
  const handleAcceptUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;

    setState({ status: 'downloading', version: update.version, progress: 0 });

    try {
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
          setState({ status: 'downloading', version: update.version, progress });
        } else if (event.event === 'Finished') {
          console.log('[UpdateChecker] Download finished');
        }
      });

      if (!cancelledRef.current) {
        setState({ status: 'ready', version: update.version });
        setDismissed(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[UpdateChecker] Download failed:', message);
      setState({ status: 'error', message });
      // Allow user to retry
      foundRef.current = false;
      setTimeout(() => {
        setState((prev) => (prev.status === 'error' ? { status: 'idle' } : prev));
      }, 10_000);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;

    const initialTimer = setTimeout(checkForUpdate, INITIAL_DELAY_SEC * 1000);
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
        <>
          <span>Ripcord v{state.version} is available. Would you like to upgrade?</span>
          <button
            onClick={handleAcceptUpdate}
            className="rounded bg-white/20 px-2 py-0.5 font-medium transition-colors hover:bg-white/30"
          >
            Update now
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded bg-white/10 px-2 py-0.5 transition-colors hover:bg-white/20"
          >
            Not now
          </button>
        </>
      )}

      {state.status === 'downloading' && (
        <span>Downloading Ripcord v{state.version}... {state.progress}%</span>
      )}

      {state.status === 'ready' && (
        <>
          <span>Ripcord v{state.version} is ready to install!</span>
          <button
            onClick={() => {
              // Always force logout after update so stale auth tokens are cleared.
              // Remember-me credentials (saved handle/password) are preserved —
              // only auth tokens are wiped by clear-session.ts on next launch.
              localStorage.setItem('ripcord-force-logout', 'true');
              relaunch();
            }}
            className="rounded bg-white/20 px-2 py-0.5 font-medium transition-colors hover:bg-white/30"
          >
            Restart now
          </button>
        </>
      )}

      {state.status === 'error' && (
        <span>Update check failed: {state.message}</span>
      )}

      {/* Dismiss X for downloading / ready / error states */}
      {state.status !== 'available' && (
        <button
          onClick={() => setDismissed(true)}
          className="ml-2 rounded p-0.5 transition-colors hover:bg-white/20"
          title="Dismiss"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
