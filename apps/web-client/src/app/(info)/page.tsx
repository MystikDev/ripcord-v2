'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Marketing landing page at https://ripcord.gg/
//
// Public-facing intro to Ripcord with primary CTAs to Sign Up / Log In.
// If a logged-in user lands here we forward them straight to /app so the
// landing page never blocks the authenticated experience.
// ---------------------------------------------------------------------------

export default function HomePage() {
  const router = useRouter();

  // If the user is already logged in (auth token persisted by the desktop /
  // iOS login flow shares the same key), bounce them into the app.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ripcord-auth');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.state?.userId) {
          router.replace('/app');
        }
      }
    } catch {
      // localStorage unavailable — keep the marketing page visible.
    }
  }, [router]);

  return (
    <div>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 py-20 sm:py-28">
        {/* Ambient gradient blob */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-60 blur-3xl"
          style={{
            background:
              'radial-gradient(circle at 20% 30%, rgba(var(--accent-rgb), 0.18), transparent 50%), radial-gradient(circle at 80% 70%, rgba(var(--accent-magenta-rgb), 0.12), transparent 50%)',
          }}
        />

        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-1/60 px-3 py-1 text-xs font-medium text-text-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            Now in beta
          </span>

          <h1 className="mt-6 text-4xl font-bold tracking-tight text-text-primary sm:text-5xl md:text-6xl">
            Real-time chat &amp; voice,
            <br />
            <span className="text-accent">built different.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-text-secondary leading-relaxed">
            Ripcord is a fast, polished communication platform for hubs, channels,
            voice calls, and screen shares — with a design system that adapts to
            the way you work.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register?redirect=/app"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-hover hover:shadow-accent/30"
            >
              Get started — it&apos;s free
            </Link>
            <Link
              href="/login?redirect=/app"
              className="inline-flex items-center justify-center rounded-lg border border-border bg-surface-1/60 px-6 py-3 text-sm font-semibold text-text-primary backdrop-blur transition-colors hover:bg-surface-2"
            >
              Log in
            </Link>
          </div>

          <p className="mt-4 text-xs text-text-muted">
            Available on web, desktop (Windows / macOS / Linux), and iOS.
          </p>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Everything you&apos;d expect — and a few things you wouldn&apos;t
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-text-secondary">
            Channels, DMs, voice rooms, screen sharing — fluid, fast, and styled
            the way you like it.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 3.5A1.5 1.5 0 014 2h8a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0112 12H5.5L2.5 14.5v-11z" />
                </svg>
              }
              title="Hubs & channels"
              description="Organize conversations into hubs, with text and voice channels for every topic. Threads, mentions, reactions, pins, bookmarks — the works."
            />

            <Feature
              icon={
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 1v9M8 1a2 2 0 012 2v5a2 2 0 11-4 0V3a2 2 0 012-2zM3 8a5 5 0 0010 0M8 14v1.5" />
                </svg>
              }
              title="Crystal-clear voice"
              description="WebRTC voice with noise suppression, push-to-talk, and a software equalizer. Connection latency right next to you so you can see when something's off."
            />

            <Feature
              icon={
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="2" width="14" height="10" rx="1.5" />
                  <path d="M5 14h6M8 12v2" />
                </svg>
              }
              title="Screen sharing"
              description="Share a window or your whole screen with adjustable quality and frame rate. Hover-preview before joining, pop-out to a floating window for second-monitor workflows."
            />

            <Feature
              icon={
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6" />
                  <path d="M8 2a6 6 0 010 12M2 8h12" />
                </svg>
              }
              title="Six themes, your call"
              description="Orbit, Midnight, Aurora, Solar Flare, Crimson, Mono — switch the entire palette in one click. Personal color overrides stack on top so your tweaks survive any theme."
            />

            <Feature
              icon={
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 6h12M2 8h12M2 10h12" />
                  <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
                </svg>
              }
              title="Universe or Classic"
              description="Use the spatial Universe layout with orbital voice channels, or switch to Classic for a familiar three-column look. Both are first-class."
            />

            <Feature
              icon={
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 1l5 2v5a6 6 0 01-5 6 6 6 0 01-5-6V3l5-2z" />
                  <path d="M5.5 8l2 2 3-4" />
                </svg>
              }
              title="Built with privacy in mind"
              description="Encrypted in transit. Argon2id-hashed passwords. Voice and screen-share streams aren't archived. Read our privacy policy — it's short."
            />
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ─────────────────────────────────────────────────── */}
      <section className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface-1 p-8 text-center sm:p-12">
          <h3 className="text-2xl font-semibold tracking-tight text-text-primary">
            Ready when you are.
          </h3>
          <p className="mt-2 text-text-secondary">
            Spin up a hub in under a minute. Bring your friends.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register?redirect=/app"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Create your account
            </Link>
            <Link
              href="/login?redirect=/app"
              className="inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-6 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-2"
            >
              I already have one
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1/40 p-6 transition-colors hover:border-white/10 hover:bg-surface-1/70">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-text-primary">{title}</h3>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed">{description}</p>
    </div>
  );
}
