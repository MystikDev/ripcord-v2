/**
 * @module floating-chat-panel
 * Comms Center floating, draggable, resizable, pinnable chat window for the
 * orbital view. Renders as a fixed-position glass-morphism panel with a title
 * bar that doubles as a drag handle, pin/close controls, and resize handles
 * on the right edge, bottom edge, and bottom-right corner.
 *
 * Chat content (MessageList / MessageComposer) will be wired up in a later
 * pass — for now the content area renders a styled placeholder.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FloatingChatPanelProps {
  /** Channel ID for chat content */
  channelId: string;
  /** Channel name for title bar */
  channelName: string;
  /** Whether the panel is open */
  open: boolean;
  /** Close the panel */
  onClose: () => void;
  /** Whether position is pinned */
  pinned: boolean;
  /** Toggle pin state */
  onTogglePin: () => void;
  /** Saved position (null = use default) */
  savedPosition: { x: number; y: number } | null;
  /** Save position on drag end */
  onPositionChange: (pos: { x: number; y: number }) => void;
  /** Saved size */
  savedSize: { width: number; height: number };
  /** Save size on resize end */
  onSizeChange: (size: { width: number; height: number }) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_WIDTH = 320;
const MIN_HEIGHT = 300;
const MAX_WIDTH_FRAC = 0.8;
const MAX_HEIGHT_FRAC = 0.8;

/** Resize handle hit-zone thickness in pixels */
const HANDLE_SIZE = 8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultPosition(width: number, height: number) {
  return {
    x: window.innerWidth - width - 120,
    y: window.innerHeight - height - 70,
  };
}

function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(window.innerWidth - width, x)),
    y: Math.max(0, Math.min(window.innerHeight - height, y)),
  };
}

function clampSize(
  width: number,
  height: number,
): { width: number; height: number } {
  return {
    width: Math.max(MIN_WIDTH, Math.min(window.innerWidth * MAX_WIDTH_FRAC, width)),
    height: Math.max(MIN_HEIGHT, Math.min(window.innerHeight * MAX_HEIGHT_FRAC, height)),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FloatingChatPanel({
  channelId,
  channelName,
  open,
  onClose,
  pinned,
  onTogglePin,
  savedPosition,
  onPositionChange,
  savedSize,
  onSizeChange,
}: FloatingChatPanelProps) {
  // channelId will be used when MessageList/MessageComposer are wired up
  void channelId;
  // -- Size state -----------------------------------------------------------
  const [size, setSize] = useState(savedSize);

  // -- Position state -------------------------------------------------------
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    if (pinned && savedPosition) return savedPosition;
    return getDefaultPosition(savedSize.width, savedSize.height);
  });

  // -- Visibility / animation state -----------------------------------------
  const [visible, setVisible] = useState(false);

  // -- Refs -----------------------------------------------------------------
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const resizeStartRef = useRef<{
    startX: number;
    startY: number;
    origWidth: number;
    origHeight: number;
    origPosX: number;
    origPosY: number;
    edges: { right: boolean; bottom: boolean };
  } | null>(null);

  // -- Sync savedSize changes from parent -----------------------------------
  useEffect(() => {
    setSize(savedSize);
  }, [savedSize]);

  // -- Restore position on open ---------------------------------------------
  useEffect(() => {
    if (open) {
      if (pinned && savedPosition) {
        setPosition(savedPosition);
      } else {
        setPosition(getDefaultPosition(size.width, size.height));
      }
      // Trigger fade-in on next frame
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // =========================================================================
  // Drag handlers (title bar)
  // =========================================================================

  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      // Don't start drag if clicking a button inside the title bar
      if ((e.target as HTMLElement).closest('button')) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        offsetX: position.x,
        offsetY: position.y,
      };
    },
    [position],
  );

  const handleDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      const clamped = clampPosition(
        dragStartRef.current.offsetX + dx,
        dragStartRef.current.offsetY + dy,
        size.width,
        size.height,
      );
      setPosition(clamped);
    },
    [size],
  );

  const handleDragEnd = useCallback(() => {
    if (!dragStartRef.current) return;
    dragStartRef.current = null;
    onPositionChange(position);
  }, [onPositionChange, position]);

  // =========================================================================
  // Resize handlers (edge / corner)
  // =========================================================================

  const handleResizeStart = useCallback(
    (edges: { right: boolean; bottom: boolean }) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      resizeStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origWidth: size.width,
        origHeight: size.height,
        origPosX: position.x,
        origPosY: position.y,
        edges,
      };
    },
    [size, position],
  );

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeStartRef.current) return;
    const ref = resizeStartRef.current;
    const dx = e.clientX - ref.startX;
    const dy = e.clientY - ref.startY;

    let newWidth = ref.origWidth;
    let newHeight = ref.origHeight;

    if (ref.edges.right) newWidth = ref.origWidth + dx;
    if (ref.edges.bottom) newHeight = ref.origHeight + dy;

    const clamped = clampSize(newWidth, newHeight);
    setSize(clamped);

    // Keep position clamped with new size
    setPosition((prev) => clampPosition(prev.x, prev.y, clamped.width, clamped.height));
  }, []);

  const handleResizeEnd = useCallback(() => {
    if (!resizeStartRef.current) return;
    resizeStartRef.current = null;
    onSizeChange(size);
    onPositionChange(position);
  }, [onSizeChange, onPositionChange, size, position]);

  // =========================================================================
  // Render
  // =========================================================================

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 250,
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        background: 'rgba(7, 9, 13, 0.95)',
        border: '1px solid rgba(0, 229, 255, 0.15)',
        borderRadius: 12,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.15s ease-out',
        userSelect: 'none',
      }}
    >
      {/* ── Title bar / drag handle ────────────────────────────────────── */}
      <div
        style={{
          height: 38,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          cursor: 'grab',
          flexShrink: 0,
        }}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        {/* Channel name */}
        <span
          style={{
            flex: 1,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.85)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          # {channelName}
        </span>

        {/* Pin button */}
        <button
          type="button"
          onClick={onTogglePin}
          title={pinned ? 'Unpin position' : 'Pin position'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: 6,
            border: 'none',
            background: pinned ? 'rgba(0, 229, 255, 0.12)' : 'transparent',
            color: pinned ? '#00e5ff' : 'rgba(255, 255, 255, 0.4)',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!pinned) (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)');
          }}
          onMouseLeave={(e) => {
            if (!pinned) (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)');
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Thumbtack / pin icon */}
            <path d="M5 1v3.5L3.5 7h7L9 4.5V1" />
            <line x1="7" y1="7" x2="7" y2="13" />
            <line x1="4" y1="1" x2="10" y2="1" />
          </svg>
        </button>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          title="Close Comms Center"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: 'rgba(255, 255, 255, 0.4)',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <line x1="3" y1="3" x2="11" y2="11" />
            <line x1="11" y1="3" x2="3" y2="11" />
          </svg>
        </button>
      </div>

      {/* ── Content area (placeholder) ─────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 24,
          overflow: 'hidden',
          userSelect: 'text',
        }}
      >
        {/* Chat icon */}
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          style={{ opacity: 0.25 }}
        >
          <path
            d="M6 6h20a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H14l-5 5v-5H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
            stroke="rgba(0, 229, 255, 0.6)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="10" y1="13" x2="22" y2="13" stroke="rgba(0, 229, 255, 0.4)" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="10" y1="17" x2="18" y2="17" stroke="rgba(0, 229, 255, 0.3)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            color: 'rgba(255, 255, 255, 0.3)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Chat content for #{channelName}
        </span>
      </div>

      {/* ── Resize handles ─────────────────────────────────────────────── */}

      {/* Right edge */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: HANDLE_SIZE,
          height: '100%',
          cursor: 'e-resize',
        }}
        onPointerDown={handleResizeStart({ right: true, bottom: false })}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
      />

      {/* Bottom edge */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: HANDLE_SIZE,
          cursor: 's-resize',
        }}
        onPointerDown={handleResizeStart({ right: false, bottom: true })}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
      />

      {/* Bottom-right corner */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: HANDLE_SIZE * 2,
          height: HANDLE_SIZE * 2,
          cursor: 'se-resize',
        }}
        onPointerDown={handleResizeStart({ right: true, bottom: true })}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
      />
    </div>
  );
}
