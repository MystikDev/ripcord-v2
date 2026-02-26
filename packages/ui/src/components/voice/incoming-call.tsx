/**
 * @module incoming-call
 * Full-screen overlay notification for incoming DM calls.
 * Shows the caller's handle with accept/decline buttons.
 * Sends CALL_ACCEPT or CALL_DECLINE via gateway, then transitions to active call.
 */
'use client';

import { useCallback } from 'react';
import { useCallStore } from '../../stores/call-store';
import { useAuthStore } from '../../stores/auth-store';
import { gateway } from '../../lib/gateway-client';

// Gateway opcodes for call signaling
const OP_CALL_ACCEPT = 31;
const OP_CALL_DECLINE = 32;

export function IncomingCall() {
  const status = useCallStore((s) => s.status);
  const callInfo = useCallStore((s) => s.callInfo);
  const acceptCall = useCallStore((s) => s.acceptCall);
  const endCall = useCallStore((s) => s.endCall);

  const handleAccept = useCallback(() => {
    if (!callInfo) return;
    const auth = useAuthStore.getState();

    // Send accept signal to the caller
    gateway.send(OP_CALL_ACCEPT, {
      roomId: callInfo.roomId,
      channelId: callInfo.channelId,
      fromUserId: auth.userId,
      fromHandle: auth.handle,
      toUserId: callInfo.remoteUserId,
    });

    acceptCall();
  }, [callInfo, acceptCall]);

  const handleDecline = useCallback(() => {
    if (!callInfo) return;
    const auth = useAuthStore.getState();

    // Send decline signal to the caller
    gateway.send(OP_CALL_DECLINE, {
      roomId: callInfo.roomId,
      channelId: callInfo.channelId,
      fromUserId: auth.userId,
      fromHandle: auth.handle,
      toUserId: callInfo.remoteUserId,
    });

    endCall();
  }, [callInfo, endCall]);

  if (status !== 'ringing_incoming' || !callInfo) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6 rounded-2xl bg-surface-2 p-8 shadow-2xl">
        {/* Caller avatar placeholder */}
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/20">
          <svg width="36" height="36" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
            <path d="M1.5 4.5a2 2 0 012-2h1.382a1 1 0 01.894.553l.723 1.447a1 1 0 01-.15 1.084l-.69.767a.5.5 0 00-.05.577 6.517 6.517 0 003.962 3.962.5.5 0 00.577-.05l.768-.69a1 1 0 011.084-.15l1.447.723a1 1 0 01.553.894V12.5a2 2 0 01-2 2A11.5 11.5 0 011.5 4.5z" />
          </svg>
        </div>

        {/* Caller info */}
        <div className="text-center">
          <p className="text-lg font-semibold text-text-primary">
            {callInfo.remoteHandle ?? 'Unknown'}
          </p>
          <p className="mt-1 animate-pulse text-sm text-text-muted">Incoming call...</p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleDecline}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-danger text-white transition-colors hover:bg-danger/80"
            title="Decline"
          >
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
          <button
            onClick={handleAccept}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-success text-white transition-colors hover:bg-success/80"
            title="Accept"
          >
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 4.5a2 2 0 012-2h1.382a1 1 0 01.894.553l.723 1.447a1 1 0 01-.15 1.084l-.69.767a.5.5 0 00-.05.577 6.517 6.517 0 003.962 3.962.5.5 0 00.577-.05l.768-.69a1 1 0 011.084-.15l1.447.723a1 1 0 01.553.894V12.5a2 2 0 01-2 2A11.5 11.5 0 011.5 4.5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
