import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support — Ripcord',
  description: 'Get help with Ripcord — common issues, contact, and bug reports.',
};

const SUPPORT_EMAIL = 'support@ripcord.gg';
const SECURITY_EMAIL = 'security@ripcord.gg';
const PRIVACY_EMAIL = 'privacy@ripcord.gg';

export default function SupportPage() {
  return (
    <article className="prose prose-invert max-w-none">
      <h1 className="text-3xl font-semibold tracking-tight">Support</h1>
      <p className="mt-2 text-text-secondary">
        Need help with Ripcord? You're in the right place.
      </p>

      {/* Contact card */}
      <div className="mt-8 rounded-xl border border-border bg-surface-1 p-6">
        <h2 className="text-lg font-semibold text-text-primary">Contact us</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Email is the fastest way to reach us. We aim to respond within 1–2 business days.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <ContactRow label="General support" email={SUPPORT_EMAIL} />
          <ContactRow label="Privacy questions" email={PRIVACY_EMAIL} />
          <ContactRow label="Security issues" email={SECURITY_EMAIL} />
        </dl>
      </div>

      <Section title="Common issues">
        <Faq question="I can't log in.">
          Make sure you're using the same handle and password you registered with. Passwords
          are case-sensitive. If you've forgotten your password, use the "Forgot password?"
          link on the login screen. If you still can't log in, email{' '}
          <ContactLink email={SUPPORT_EMAIL} />.
        </Faq>

        <Faq question="The app says my session expired or won't connect.">
          Try signing out and signing back in. If the issue persists, check that you have a
          working internet connection and that your device clock is set correctly (incorrect
          time can break secure connections). On the desktop app, restarting the app forces a
          fresh session.
        </Faq>

        <Faq question="My microphone isn't working in voice channels.">
          On iOS or macOS, check System Settings → Privacy & Security → Microphone and confirm
          Ripcord is allowed. On Windows, check Settings → Privacy → Microphone. In a browser,
          your browser will prompt for permission the first time you join voice — if you
          accidentally denied it, click the camera icon in the address bar to re-enable.
        </Faq>

        <Faq question="I can't hear other people in voice.">
          Make sure you haven't pressed the deafen (headphones) button in the bottom panel.
          Also confirm that your system output device is what you expect — Ripcord uses your
          OS default. On iOS, raise the device volume and check that silent mode is off.
        </Faq>

        <Faq question="Screen sharing doesn't start.">
          On the web client and iOS, you'll be prompted by your browser/OS to choose a screen
          or window. On macOS, you may also need to grant Ripcord (or your browser) Screen
          Recording permission in System Settings → Privacy & Security → Screen Recording, then
          fully quit and reopen the app.
        </Faq>

        <Faq question="The mobile app crashes on launch.">
          Force-quit and relaunch first. If that doesn't help, uninstall and reinstall the
          app. If you can reproduce the crash reliably, please email us with your device
          model, iOS/Android version, and the steps to reproduce.
        </Faq>

        <Faq question="How do I delete my account?">
          Go to Settings → Account → Delete Account. This permanently removes your profile
          and your account-attached data. See our{' '}
          <a href="/privacy" className="text-accent hover:text-accent-hover">Privacy Policy</a>
          {' '}for details on what is retained and for how long.
        </Faq>

        <Faq question="Can I use Ripcord on multiple devices?">
          Yes. Sign in with the same account on the desktop app, web client, and iOS app —
          your hubs, channels, and direct messages sync across all of them.
        </Faq>
      </Section>

      <Section title="Reporting bugs">
        <p>
          Found something that doesn't work? The fastest way to report it is via the in-app{' '}
          <strong>Report a bug</strong> button (gear icon → Report Bug), which automatically
          attaches your app version and recent logs.
        </p>
        <p>
          Or email <ContactLink email={SUPPORT_EMAIL} /> with:
        </p>
        <ul>
          <li>What you were trying to do.</li>
          <li>What happened instead.</li>
          <li>Steps to reproduce, if you can.</li>
          <li>Your platform (iOS, web, desktop) and app version (Settings → About).</li>
          <li>A screenshot or screen recording, if helpful.</li>
        </ul>
      </Section>

      <Section title="Reporting security vulnerabilities">
        <p>
          If you believe you've found a security vulnerability, please report it privately to{' '}
          <ContactLink email={SECURITY_EMAIL} /> rather than disclosing it publicly. We take
          security reports seriously and will acknowledge receipt within 48 hours.
        </p>
        <p>
          Please include enough detail for us to reproduce the issue. We are happy to credit
          researchers in our security advisories with their permission.
        </p>
      </Section>

      <Section title="System requirements">
        <ul>
          <li>
            <strong>iOS app:</strong> iPhone running iOS 15 or later. iPad supported but not
            optimized.
          </li>
          <li>
            <strong>Desktop app:</strong> Windows 10+, macOS 12+, or Linux (recent Ubuntu /
            Fedora / Arch). 64-bit only.
          </li>
          <li>
            <strong>Web client:</strong> latest two major versions of Chrome, Firefox, Safari,
            or Edge.
          </li>
        </ul>
      </Section>
    </article>
  );
}

// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight text-text-primary">
        {title}
      </h2>
      <div className="mt-3 space-y-4 text-text-secondary leading-relaxed">{children}</div>
    </section>
  );
}

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-border bg-surface-1/40 px-4 py-3 transition-colors hover:border-white/10">
      <summary className="cursor-pointer list-none font-medium text-text-primary marker:hidden flex items-center justify-between gap-4">
        <span>{question}</span>
        <span className="shrink-0 text-text-muted transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="mt-3 text-sm text-text-secondary leading-relaxed">{children}</div>
    </details>
  );
}

function ContactRow({ label, email }: { label: string; email: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-surface-2/50 px-3 py-2.5">
      <dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-0.5">
        <ContactLink email={email} />
      </dd>
    </div>
  );
}

function ContactLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className="text-accent hover:text-accent-hover">
      {email}
    </a>
  );
}
