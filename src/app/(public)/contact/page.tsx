import type { Metadata } from 'next'
import { ContactForm } from '~/components/public/contact-form'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the Preseason team.',
  openGraph: {
    title: 'Contact',
    description: 'Get in touch with the Preseason team.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact',
    description: 'Get in touch with the Preseason team.',
  },
}

export default function ContactPage() {
  return (
    <div className="container max-w-lg py-12">
      <h1 className="text-2xl font-bold tracking-tight">Contact</h1>
      <p className="mt-2 text-muted-foreground">
        Have a question or feedback? Send us a message or reach out on{' '}
        <a
          href="https://x.com/betocmn"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          X (@betocmn)
        </a>
        .
      </p>
      <div className="mt-8">
        <ContactForm />
      </div>
    </div>
  )
}
