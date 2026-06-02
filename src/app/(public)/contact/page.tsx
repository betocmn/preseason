import { Mail, MessageSquare, Send } from 'lucide-react'
import type { Metadata } from 'next'
import { ContactForm } from '~/components/public/contact-form'
import { Card, CardContent } from '~/components/ui/card'

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

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export default function ContactPage() {
  return (
    <div className="container max-w-5xl py-12 md:py-16">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <MessageSquare className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Get in touch</h1>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          Have a question, feedback, or want to collaborate? We would love to hear from you.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-5">
        {/* Form — takes 3 of 5 cols */}
        <Card className="md:col-span-3">
          <CardContent className="p-6 pt-6">
            <div className="mb-5 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Mail className="h-4 w-4" />
              Send us a message
            </div>
            <ContactForm />
          </CardContent>
        </Card>

        {/* Sidebar — takes 2 of 5 cols */}
        <div className="flex flex-col gap-4 md:col-span-2">
          <Card className="flex-1">
            <CardContent className="flex h-full flex-col justify-center p-6 pt-6">
              <p className="mb-4 text-sm font-medium text-muted-foreground">
                Or reach out to me directly
              </p>
              <a
                href="https://x.com/betocmn"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-lg border p-4 transition-colors hover:border-foreground/20 hover:bg-accent"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                  <XIcon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium group-hover:text-foreground">@betocmn</p>
                  <p className="text-xs text-muted-foreground">DM me on X</p>
                </div>
                <Send className="ml-auto h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
