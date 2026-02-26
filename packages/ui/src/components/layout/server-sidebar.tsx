/**
 * @module server-sidebar
 * Far-left narrow sidebar (72 px) with hub icons, a HomeButton placeholder,
 * and an AddHubDialog button. Exported as HubSidebar.
 */
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
  const isDmView = useHubStore((s) => s.isDmView);
  const enterDmView = useHubStore((s) => s.enterDmView);

  return (
    <Tooltip content="Direct Messages" side="right">
      <button
        onClick={enterDmView}
        className={clsx(
          'group relative flex h-12 w-12 items-center justify-center transition-all duration-200',
          isDmView
            ? 'rounded-2xl bg-accent text-white'
            : 'rounded-3xl bg-surface-2 text-text-secondary hover:rounded-2xl hover:bg-accent hover:text-white',
        )}
      >
        {/* Active indicator pill */}
        <span
          className={clsx(
            'absolute -left-3 w-1 rounded-r-full bg-text-primary transition-all duration-200',
            isDmView ? 'h-10' : 'h-0 group-hover:h-5',
          )}
        />
        <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 4h10c4.42 0 8 2.69 8 6s-3.58 6-8 6h-2l8 12h-5.5L11 16H12c3.31 0 6-1.34 6-4s-2.69-4-6-4h-4v18H8V4z" fill="currentColor" />
          <path d="M6 2l4 2v24l-4 2V2z" fill="currentColor" opacity="0.6" />
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
