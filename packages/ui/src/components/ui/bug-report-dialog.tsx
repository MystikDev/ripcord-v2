/**
 * @module bug-report-dialog
 * Floating bug-report button (lower-right) and modal form. Lets users report
 * issues with a component selector, description, and optional screenshot.
 * Submits via POST /v1/feedback and shows a confirmation toast with a bug ID.
 */
'use client';

import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { submitBugReport } from '../../lib/hub-api';
import { useToast } from './toast';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPONENTS = ['UI', 'BUG', 'Voice', 'Chat', 'Friends list', 'Other'] as const;
const MAX_DESCRIPTION = 1000;

// ---------------------------------------------------------------------------
// BugReportButton — fixed floating icon
// ---------------------------------------------------------------------------

export function BugReportButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating bug icon */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-16 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2/80 border border-border backdrop-blur-sm shadow-lg hover:bg-accent/20 hover:border-accent/40 transition-colors"
        title="Report a bug"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
          <path d="M8 2l1.88 1.88" /><path d="M14.12 3.88 16 2" />
          <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
          <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
          <path d="M12 20v-9" /><path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
          <path d="M6 13H2" /><path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
          <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" /><path d="M22 13h-4" />
          <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
        </svg>
      </button>

      {/* Dialog */}
      <AnimatePresence>
        {open && <BugReportDialog onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// BugReportDialog — modal form
// ---------------------------------------------------------------------------

function BugReportDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [component, setComponent] = useState<string>(COMPONENTS[0]);
  const [description, setDescription] = useState('');
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // --- Screenshot handling ---
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const previewUrl = URL.createObjectURL(file);
    setScreenshotPreview(previewUrl);

    // Base64
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:image/...;base64, prefix — Resend expects raw base64
      const base64 = result.split(',')[1] ?? result;
      setScreenshotBase64(base64);
    };
    reader.readAsDataURL(file);
  }, []);

  const removeScreenshot = useCallback(() => {
    setScreenshotPreview(null);
    setScreenshotBase64(null);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  // --- Submit ---
  const handleSubmit = useCallback(async () => {
    if (!description.trim()) {
      toast.error('Please describe the issue');
      return;
    }

    setSubmitting(true);
    try {
      const { bugId } = await submitBugReport({
        component,
        description: description.trim(),
        screenshot: screenshotBase64 ?? undefined,
      });
      toast.success(`Bug reported! Tracking ID: ${bugId}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit bug report');
    } finally {
      setSubmitting(false);
    }
  }, [component, description, screenshotBase64, toast, onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-md rounded-2xl border border-border bg-surface-1 p-6 shadow-2xl"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h2 className="text-lg font-semibold text-text-primary mb-4">Report a Bug</h2>

        {/* Component select */}
        <label className="block text-sm text-text-muted mb-1">Component</label>
        <select
          value={component}
          onChange={(e) => setComponent(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
        >
          {COMPONENTS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Description */}
        <label className="block text-sm text-text-muted mb-1">
          Describe the issue
          <span className="float-right text-xs tabular-nums">
            {description.length}/{MAX_DESCRIPTION}
          </span>
        </label>
        <textarea
          value={description}
          onChange={(e) => {
            if (e.target.value.length <= MAX_DESCRIPTION) setDescription(e.target.value);
          }}
          rows={5}
          placeholder="What went wrong? Steps to reproduce..."
          className="mb-4 w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 outline-none focus:border-accent"
        />

        {/* Screenshot */}
        <label className="block text-sm text-text-muted mb-1">Attachment (screenshot)</label>
        {screenshotPreview ? (
          <div className="relative mb-4 inline-block">
            <img
              src={screenshotPreview}
              alt="Screenshot preview"
              className="h-24 rounded-lg border border-border object-cover"
            />
            <button
              onClick={removeScreenshot}
              className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white text-xs"
            >
              &times;
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="mb-4 flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface-2/50 px-4 py-3 text-sm text-text-muted hover:border-accent/40 hover:text-text-primary transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Add screenshot
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !description.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50 hover:bg-accent/80 transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
