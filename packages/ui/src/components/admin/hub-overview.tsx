/**
 * @module hub-overview
 * Read-only stats panel showing hub name, owner, channel count,
 * member count, hub ID, and platform-wide registration stats.
 */
'use client';

import { useEffect, useState } from 'react';
import { useHubStore } from '../../stores/server-store';
import { apiFetch } from '../../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegistrationStats {
  totalUsers: number;
  registeredToday: number;
  registeredThisWeek: number;
  registeredThisMonth: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HubOverview({ hubId }: { hubId: string }) {
  const hubs = useHubStore((s) => s.hubs);
  const channels = useHubStore((s) => s.channels);

  const hub = hubs.find((h) => h.id === hubId);
  const channelCount = channels.length;

  // Registration stats (platform-wide)
  const [regStats, setRegStats] = useState<RegistrationStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<RegistrationStats>('/v1/users/stats').then((res) => {
      if (!cancelled && res.ok && res.data) {
        setRegStats(res.data);
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (!hub) {
    return (
      <div className="py-8 text-center text-sm text-text-muted">
        Solar system not found.
      </div>
    );
  }

  const hubStats = [
    { label: 'Solar System Name', value: hub.name },
    { label: 'Owner', value: hub.ownerId ? hub.ownerId.slice(0, 8) + '…' : '—' },
    { label: 'Channels', value: String(channelCount) },
    { label: 'Members', value: regStats ? String(regStats.totalUsers) : '—' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-text-primary">Overview</h2>

      <div className="grid grid-cols-2 gap-4">
        {hubStats.map((stat) => (
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
          Solar System ID
        </p>
        <p className="mt-1 font-mono text-xs text-text-secondary">
          {hubId}
        </p>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Registration Stats (platform-wide)                                */}
      {/* ----------------------------------------------------------------- */}
      <div className="pt-2">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Registration Stats
        </h2>

        {regStats ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-surface-2/50 px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Total Registered
              </p>
              <p className="mt-1 text-2xl font-bold text-accent">
                {regStats.totalUsers.toLocaleString()}
              </p>
            </div>

            <div className="rounded-lg bg-surface-2/50 px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Today
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-400">
                +{regStats.registeredToday.toLocaleString()}
              </p>
            </div>

            <div className="rounded-lg bg-surface-2/50 px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                This Week
              </p>
              <p className="mt-1 text-2xl font-bold text-sky-400">
                +{regStats.registeredThisWeek.toLocaleString()}
              </p>
            </div>

            <div className="rounded-lg bg-surface-2/50 px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                This Month
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-400">
                +{regStats.registeredThisMonth.toLocaleString()}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg bg-surface-2/50 px-4 py-4 animate-pulse"
              >
                <div className="h-3 w-20 bg-white/5 rounded" />
                <div className="mt-3 h-6 w-12 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
