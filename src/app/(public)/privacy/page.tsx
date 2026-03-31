import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How HL Tech Consulting collects, uses, and protects your information.',
  openGraph: {
    title: 'Privacy Policy',
    description: 'How HL Tech Consulting collects, uses, and protects your information.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Privacy Policy',
    description: 'How HL Tech Consulting collects, uses, and protects your information.',
  },
}

const LAST_UPDATED = 'March 31, 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
}

export default function PrivacyPage() {
  return (
    <div className="container max-w-3xl py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="space-y-8">
        <Section title="1. Information We Collect">
          <P>Preseason is operated by HL Tech Consulting, an Australian company.</P>
          <P>
            We collect information you provide directly, such as your email and profile details when
            you create an account.
          </P>
          <P>
            We also collect basic usage and technical data (for example, pages visited, timestamps,
            browser type, and device information) to run and improve Preseason.
          </P>
        </Section>

        <Section title="2. How We Use Information">
          <P>
            HL Tech Consulting uses your information to operate Preseason, authenticate access,
            maintain security, improve features, and communicate important service updates.
          </P>
        </Section>

        <Section title="3. Sharing of Information">
          <P>
            We do not sell your personal information. We may share data with trusted service
            providers who help us host and operate Preseason, or when required by applicable law.
          </P>
        </Section>

        <Section title="4. Data Retention and Security">
          <P>
            We keep information for as long as needed to provide the service and meet legal or
            operational requirements.
          </P>
          <P>
            We use reasonable technical and organizational safeguards, but no system can be
            guaranteed to be 100% secure.
          </P>
        </Section>

        <Section title="5. Your Choices">
          <P>
            You can request account updates or deletion through our official support channels. You
            can also manage certain browser-level controls such as cookies.
          </P>
        </Section>

        <Section title="6. Changes to This Policy">
          <P>
            We may update this policy from time to time. Material changes will be reflected by
            updating the date at the top of this page.
          </P>
        </Section>

        <Section title="7. Contact">
          <P>
            If you have privacy questions, contact HL Tech Consulting through official Preseason
            support channels.
          </P>
        </Section>
      </div>
    </div>
  )
}
