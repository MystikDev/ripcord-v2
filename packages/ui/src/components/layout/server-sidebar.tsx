'use client';

import { useHubStore, type Hub } from '../../stores/server-store';
import { Tooltip } from '../ui/tooltip';
import { Separator } from '../ui/separator';
import { ScrollArea } from '../ui/scroll-area';
import { AddHubDialog } from '../hub/create-hub-dialog';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Hub Icon
// ---------------------------------------------------------------------------

function HubIcon({ hub, isActive }: { hub: Hub; isActive: boolean }) {
  const setActiveHub = useHubStore((s) => s.setActiveHub);

  return (
    <Tooltip content={hub.name} side="right">
      <button
        onClick={() => setActiveHub(hub.id)}
        className={clsx(
          'group relative flex h-12 w-12 items-center justify-center transition-all duration-200',
          isActive
            ? 'rounded-2xl bg-accent text-white'
            : 'rounded-3xl bg-surface-2 text-text-secondary hover:rounded-2xl hover:bg-accent hover:text-white',
        )}
      >
        {/* Active indicator pill */}
        <span
          className={clsx(
            'absolute -left-3 w-1 rounded-r-full bg-text-primary transition-all duration-200',
            isActive ? 'h-10' : 'h-0 group-hover:h-5',
          )}
        />

        {hub.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hub.iconUrl}
            alt={hub.name}
            className="h-full w-full rounded-[inherit] object-cover"
          />
        ) : (
          <span className="text-sm font-semibold">
            {hub.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Home Button
// ---------------------------------------------------------------------------

function HomeButton() {
  return (
    <Tooltip content="Direct Messages" side="right">
      <button
        className={clsx(
          'flex h-12 w-12 items-center justify-center rounded-3xl bg-surface-2 text-text-secondary',
          'transition-all duration-200 hover:rounded-2xl hover:bg-accent hover:text-white',
        )}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.477 2 2 6.477 2 12c0 1.82.487 3.53 1.338 5.002L2.07 21.37a1 1 0 001.176 1.176l4.37-1.268A9.956 9.956 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" />
        </svg>
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HubSidebar() {
  const hubs = useHubStore((s) => s.hubs);
  const activeHubId = useHubStore((s) => s.activeHubId);

  return (
    <div className="flex h-full w-[72px] flex-col items-center bg-bg py-3">
      <HomeButton />

      <Separator className="my-2 w-8" />

      <ScrollArea className="flex-1 w-full">
        <div className="flex flex-col items-center gap-2 px-3">
          {hubs.map((hub) => (
            <HubIcon
              key={hub.id}
              hub={hub}
              isActive={hub.id === activeHubId}
            />
          ))}

          {/* Add Hub Button */}
          <AddHubDialog
            trigger={
              <button
                className={clsx(
                  'flex h-12 w-12 items-center justify-center rounded-3xl bg-surface-2 text-success',
                  'transition-all duration-200 hover:rounded-2xl hover:bg-success hover:text-white',
                )}
                title="Add a Hub"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                </svg>
              </button>
            }
          />
        </div>
      </ScrollArea>
    </div>
  );
}
