import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; progress: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string };

export function UpdateChecker() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      setState({ status: 'checking' });
      try {
        const update = await check();
        if (cancelled) return;

        if (update) {
          setState({ status: 'available', version: update.version });

          // Auto-download in background
          let downloaded = 0;
          let total = 0;
          await update.downloadAndInstall((event) => {
            if (cancelled) return;
            if (event.event === 'Started' && event.data.contentLength) {
              total = event.data.contentLength;
            } else if (event.event === 'Progress') {
              downloaded += event.data.chunkLength;
              const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;
              setState({ status: 'downloading', progress });
            } else if (event.event === 'Finished') {
              setState({ status: 'ready', version: update.version });
            }
          });

          if (!cancelled) {
            setState({ status: 'ready', version: update.version });
          }
        } else {
          setState({ status: 'idle' });
        }
      } catch (err) {
        if (!cancelled) {
          // Silently fail — don't bother user if update check fails
          console.warn('[UpdateChecker]', err);
          setState({ status: 'idle' });
        }
      }
    }

    // Check after a short delay so the app loads first
    const timer = setTimeout(checkForUpdate, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

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
        <span>Update failed: {state.message}</span>
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
