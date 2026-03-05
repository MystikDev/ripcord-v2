/**
 * @module Skeleton
 * Skeleton loading placeholders for the orbital UI.
 *
 * Skeleton        — generic pulsing block; pass any className for sizing.
 * MessageSkeleton — single chat message placeholder with avatar + lines.
 * MessageListSkeleton — stacked MessageSkeleton rows for chat loading state.
 */
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Base skeleton block
// ---------------------------------------------------------------------------

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx(
        'animate-pulse rounded-lg bg-white/5',
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Message-shaped skeleton
// ---------------------------------------------------------------------------

export function MessageSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {/* Avatar */}
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />

      <div className="flex-1 space-y-2">
        {/* Username + timestamp */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-2.5 w-12" />
        </div>
        {/* Message lines */}
        <Skeleton className="h-3 w-full max-w-[80%]" />
        <Skeleton className="h-3 w-full max-w-[60%]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stacked message list skeleton
// ---------------------------------------------------------------------------

export function MessageListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-1 p-2">
      {Array.from({ length: count }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <MessageSkeleton key={i} />
      ))}
    </div>
  );
}
