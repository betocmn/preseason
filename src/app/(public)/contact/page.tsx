import { ArrowUpRight, Globe, MessageSquare } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Reach me on X or at betocmn.com.',
  openGraph: {
    title: 'Contact',
    description: 'Reach me on X or at betocmn.com.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact',
    description: 'Reach me on X or at betocmn.com.',
  },
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

const contactLinks = [
  {
    href: 'https://x.com/betocmn',
    title: '@betocmn',
    description: 'DM me on X',
    icon: 'x',
  },
  {
    href: 'https://betocmn.com',
    title: 'betocmn.com',
    description: 'Visit my website',
    icon: 'website',
  },
] as const

export default function ContactPage() {
  return (
    <div className="container max-w-3xl py-12 md:py-16">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <MessageSquare className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Get in touch</h1>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          Have a question, feedback, or want to collaborate? Reach me on X or at my website.
        </p>
      </div>

      <div className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-2">
        {contactLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-lg border bg-card p-5 transition-colors hover:border-foreground/20 hover:bg-accent"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              {link.icon === 'x' ? <XIcon className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{link.title}</p>
              <p className="text-xs text-muted-foreground">{link.description}</p>
            </div>
            <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
          </a>
        ))}
      </div>
    </div>
  )
}
