import Link from 'next/link';
import type { Metadata } from 'next';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

// ---------------------------------------------------------------------------
// Layout — shared chrome for legal / informational pages (privacy, support)
// ---------------------------------------------------------------------------

export default function InfoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      {/* Header */}
      <header className="border-b border-border bg-surface-1/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent shadow-md shadow-accent/20">
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                <path d="M8 4h10c4.42 0 8 2.69 8 6s-3.58 6-8 6h-2l8 12h-5.5L11 16H12c3.31 0 6-1.34 6-4s-2.69-4-6-4h-4v18H8V4z" fill="white" />
                <path d="M6 2l4 2v24l-4 2V2z" fill="rgba(255,255,255,0.6)" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight">Ripcord</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-5 text-sm text-text-secondary">
            <Link href="/privacy" className="hidden sm:inline-block transition-colors hover:text-text-primary">Privacy</Link>
            <Link href="/support" className="hidden sm:inline-block transition-colors hover:text-text-primary">Support</Link>
            <Link
              href="/login?redirect=/app"
              className="rounded-md px-3 py-1.5 transition-colors hover:text-text-primary hover:bg-white/5"
            >
              Log in
            </Link>
            <Link
              href="/register?redirect=/app"
              className="rounded-md bg-accent px-3 py-1.5 font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      {/* Content — pages set their own width constraint */}
      <main>{children}</main>

      {/* Footer */}
      <footer className="mt-16 border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-2 px-6 py-8 text-xs text-text-muted sm:flex-row">
          <span>&copy; {new Date().getFullYear()} Ripcord. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-text-primary">Privacy</Link>
            <Link href="/support" className="hover:text-text-primary">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
