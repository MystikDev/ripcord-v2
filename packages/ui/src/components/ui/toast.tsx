/**
 * @module Toast
 * Dual-mode toast notification system for the orbital UI.
 *
 * Context mode (ToastProvider + useToast):
 *   The original context-based API for components inside ToastProvider.
 *   useToast() exposes success(), error(), info(), warning() methods.
 *
 * Imperative mode (showToast / dismissToast + ToastContainer):
 *   A global module-level store for firing toasts from outside React trees
 *   (stores, utilities, event handlers). Mount <ToastContainer /> once in the
 *   app shell to display imperatively-triggered toasts.
 *
 * Both modes use the same orbital glass-morphism styling and auto-dismiss
 * after a configurable duration (default 3 s).
 */
'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastType = 'info' | 'success' | 'warning' | 'error';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

// ---------------------------------------------------------------------------
// Styling — orbital glass-morphism per toast type
// ---------------------------------------------------------------------------

const TYPE_STYLES: Record<ToastType, string> = {
  info: 'border-accent/30 bg-accent/10 text-accent',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  error: 'border-red-500/30 bg-red-500/10 text-red-400',
};

// ---------------------------------------------------------------------------
// Shared toast item component (used by both modes)
// ---------------------------------------------------------------------------

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  return (
    <motion.div
      key={toast.id}
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onClick={() => onDismiss(toast.id)}
      className={clsx(
        'flex items-center gap-2 px-4 py-2.5 rounded-xl border backdrop-blur-md cursor-pointer',
        'font-mono text-[11px] shadow-lg select-none',
        TYPE_STYLES[toast.type],
      )}
    >
      <span>{toast.message}</span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Imperative API — module-level store
// ---------------------------------------------------------------------------

type ToastListener = (toasts: Toast[]) => void;

let _listeners: ToastListener[] = [];
let _toasts: Toast[] = [];

function _notify() {
  const snapshot = [..._toasts];
  _listeners.forEach((fn) => fn(snapshot));
}

export function showToast(
  message: string,
  type: ToastType = 'info',
  duration = 3000,
) {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  _toasts = [..._toasts, { id, message, type, duration }];
  _notify();

  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
}

export function dismissToast(id: string) {
  _toasts = _toasts.filter((t) => t.id !== id);
  _notify();
}

/**
 * <ToastContainer /> — mount once in the app shell to render imperatively-
 * triggered toasts (via showToast / dismissToast).
 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    _listeners.push(setToasts);
    return () => {
      _listeners = _listeners.filter((fn) => fn !== setToasts);
    };
  }, []);

  return (
    <div
      className="fixed bottom-16 right-4 z-[500] flex flex-col gap-2 pointer-events-auto"
      aria-live="polite"
      aria-label="Notifications"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context API — ToastProvider + useToast (original, preserved)
// ---------------------------------------------------------------------------

interface ToastContextValue {
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType, duration = 3000) => {
    const id = `ctx-toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (message: string, duration?: number) => addToast(message, 'success', duration),
    error: (message: string, duration?: number) => addToast(message, 'error', duration),
    info: (message: string, duration?: number) => addToast(message, 'info', duration),
    warning: (message: string, duration?: number) => addToast(message, 'warning', duration),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Context-mode toast stack — bottom-right, below imperative ToastContainer */}
      <div
        className="fixed bottom-4 right-4 z-[490] flex flex-col gap-2 pointer-events-auto"
        aria-live="polite"
        aria-label="Notifications"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
