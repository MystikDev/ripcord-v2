'use client';

import { useHubStore } from '../../stores/server-store';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function HubOverview({ hubId }: { hubId: string }) {
  const hubs = useHubStore((s) => s.hubs);
  const channels = useHubStore((s) => s.channels);

  const hub = hubs.find((h) => h.id === hubId);
  const memberCount = '—'; // would need API call for accurate count
  const channelCount = channels.length;

  if (!hub) {
    return (
      <div className="py-8 text-center text-sm text-text-muted">
        Hub not found.
      </div>
    );
  }

  const stats = [
    { label: 'Hub Name', value: hub.name },
    { label: 'Owner', value: hub.ownerId ? hub.ownerId.slice(0, 8) + '…' : '—' },
    { label: 'Channels', value: String(channelCount) },
    { label: 'Members', value: memberCount },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-text-primary">Overview</h2>

      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg bg-surface-2/50 px-4 py-3"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {stat.label}
            </p>
            <p className="mt-1 text-base font-semibold text-text-primary">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-surface-2/50 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Hub ID
        </p>
        <p className="mt-1 font-mono text-xs text-text-secondary">
          {hubId}
        </p>
      </div>
    </div>
  );
}
