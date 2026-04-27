import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Ripcord',
  description: 'How Ripcord collects, uses, and protects your data.',
};

const LAST_UPDATED = 'April 27, 2026';
const CONTACT_EMAIL = 'privacy@ripcord.gg';

export default function PrivacyPage() {
  return (
    <article className="prose prose-invert max-w-none">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-text-muted">Last updated: {LAST_UPDATED}</p>

      <Section title="Overview">
        Ripcord is a real-time communication platform for chat, voice, and screen sharing.
        This policy explains what information we collect, how we use it, and the choices you
        have. We aim to collect the minimum data needed to provide the service and to handle
        it transparently.
      </Section>

      <Section title="Information we collect">
        <h3>Account information</h3>
        <p>
          When you create an account, we store your handle (username), a securely hashed
          password, and an optional email address used for password recovery and account
          notifications. We do not store passwords in plaintext.
        </p>

        <h3>Profile and avatar</h3>
        <p>
          You may upload a profile avatar and set a display name and status message. These are
          visible to other users in hubs you participate in.
        </p>

        <h3>Communication content</h3>
        <p>
          Text messages, voice traffic, and screen-share streams sent through Ripcord pass
          through our servers to be delivered to other participants. Voice and screen-share
          streams are routed via WebRTC and are not persisted to our storage. Text messages
          and uploaded files are stored on our servers so that they can be delivered to
          recipients and shown in channel history.
        </p>

        <h3>Technical metadata</h3>
        <p>
          We log connection metadata (IP address, approximate region, user agent, connection
          timestamps, error reports) for the purposes of operating the service, preventing
          abuse, and diagnosing problems. We do not sell this metadata.
        </p>

        <h3>Device tokens (mobile push)</h3>
        <p>
          If you install the Ripcord iOS or Android app and grant notification permission, we
          receive a device token from Apple Push Notification Service or Firebase Cloud
          Messaging that we use solely to send notifications addressed to you. You can revoke
          this at any time in your device settings.
        </p>
      </Section>

      <Section title="How we use information">
        <ul>
          <li>To deliver your messages and route your voice/video sessions to recipients.</li>
          <li>To authenticate your account and keep it secure.</li>
          <li>To prevent fraud, abuse, and violations of our terms.</li>
          <li>To diagnose technical issues and operate the service reliably.</li>
          <li>To send service announcements when essential (e.g. security incidents).</li>
        </ul>
        <p>
          We do not use your messages or voice content for advertising. We do not sell personal
          information to third parties.
        </p>
      </Section>

      <Section title="Data sharing">
        We share information only with the third-party processors required to operate the
        service:
        <ul>
          <li>
            <strong>Hosting infrastructure</strong> — server providers that host the database,
            cache, object storage, and real-time media servers (WebRTC SFU).
          </li>
          <li>
            <strong>Push notification services</strong> — Apple Push Notification Service
            (APNs) and Firebase Cloud Messaging, only to deliver notifications you requested.
          </li>
        </ul>
        <p>
          We do not share or disclose personal information to advertisers, data brokers, or
          analytics platforms beyond aggregate, non-identifying usage measurements.
        </p>
      </Section>

      <Section title="Data retention">
        Account information is kept while your account is active. Messages are kept for the
        lifetime of the channel they were sent in unless deleted by you or the channel owner.
        If you delete your account, your profile and message attachment files are removed
        within 30 days; the messages themselves are anonymized. Backup copies may persist for
        up to 90 days before being purged.
      </Section>

      <Section title="Security">
        We use industry-standard encryption in transit (TLS 1.2+) for all client-server
        traffic. WebRTC media (voice, screen sharing) is encrypted end-to-end between
        participants by design. Passwords are hashed using Argon2id. Our infrastructure access
        is limited to authorized personnel and audited.
      </Section>

      <Section title="Your rights">
        Depending on where you live, you may have the right to:
        <ul>
          <li>Access the personal information we hold about you.</li>
          <li>Correct inaccurate information.</li>
          <li>Delete your account and associated data.</li>
          <li>Export a copy of your data in a portable format.</li>
          <li>Object to or restrict certain processing.</li>
        </ul>
        <p>
          To exercise any of these rights, email <ContactLink />. We will verify your identity
          before responding.
        </p>
      </Section>

      <Section title="Children">
        Ripcord is not intended for children under the age of 13. We do not knowingly collect
        information from children under 13. If you believe we may have inadvertently collected
        information from a minor, please contact <ContactLink /> and we will delete it
        promptly.
      </Section>

      <Section title="Changes to this policy">
        We may update this policy from time to time. Material changes will be announced via
        the app or email. Continued use of Ripcord after a policy update constitutes
        acceptance of the new terms.
      </Section>

      <Section title="Contact">
        Questions, requests, or concerns about privacy can be sent to <ContactLink />. We aim
        to respond within 7 days.
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight text-text-primary">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-text-secondary leading-relaxed">{children}</div>
    </section>
  );
}

function ContactLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:text-accent-hover">
      {CONTACT_EMAIL}
    </a>
  );
}
