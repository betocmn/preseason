export const revalidate = false // fully static

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'Basic terms for using Preseason by HL Tech Consulting.',
  openGraph: {
    title: 'Terms & Conditions',
    description: 'Basic terms for using Preseason by HL Tech Consulting.',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terms & Conditions',
    description: 'Basic terms for using Preseason by HL Tech Consulting.',
    images: ['/opengraph-image'],
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

export default function TermsPage() {
  return (
    <div className="container max-w-3xl py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Terms & Conditions</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="space-y-8">
        <Section title="1. Acceptance of Terms">
          <P>
            By accessing or using Preseason, you agree to these Terms. If you do not agree, do not
            use the service.
          </P>
          <P>Preseason is operated by HL Tech Consulting, an Australian company.</P>
        </Section>

        <Section title="2. Use of the Service">
          <P>
            You agree to use Preseason lawfully and responsibly. You may not attempt to disrupt the
            platform, access data without authorization, or misuse the service.
          </P>
        </Section>

        <Section title="3. Accounts">
          <P>
            You are responsible for maintaining the security of your account credentials and for
            activity under your account.
          </P>
        </Section>

        <Section title="4. Content and Intellectual Property">
          <P>
            Preseason and its original content, branding, and software are protected by applicable
            intellectual property laws. You keep ownership of content you submit, and you grant us a
            limited license to use it to operate the service.
          </P>
        </Section>

        <Section title="5. Third-Party Services">
          <P>
            Preseason may rely on third-party providers and links. We are not responsible for
            third-party content, policies, or downtime.
          </P>
        </Section>

        <Section title="6. Disclaimer and Limitation of Liability">
          <P>
            Preseason is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To
            the maximum extent permitted by law, we disclaim warranties and are not liable for
            indirect or consequential damages.
          </P>
        </Section>

        <Section title="7. Governing Law">
          <P>
            These Terms are governed by the laws of Queensland, Australia, without regard to
            conflict of law principles.
          </P>
        </Section>

        <Section title="8. Changes and Termination">
          <P>
            We may update these Terms or suspend access to the service at any time. Continued use
            after updates means you accept the revised Terms.
          </P>
        </Section>

        <Section title="9. Contact">
          <P>
            Questions about these Terms can be sent to HL Tech Consulting through official Preseason
            support channels.
          </P>
        </Section>
      </div>
    </div>
  )
}
