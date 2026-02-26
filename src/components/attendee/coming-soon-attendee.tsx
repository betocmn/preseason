import type { LucideIcon } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { cn } from '~/lib/utils'

type ComingSoonAttendeeProps = {
  title: string
  description: string
  icon: LucideIcon
  variant?: 'primary' | 'coral' | 'teal'
}

export async function ComingSoonAttendee({
  title,
  description,
  icon: Icon,
  variant = 'primary',
}: ComingSoonAttendeeProps) {
  const tCommon = await getTranslations('common')

  const iconBgClass = {
    primary: 'bg-primary/10',
    coral: 'bg-coral-muted',
    teal: 'bg-teal-muted',
  }[variant]

  const iconColorClass = {
    primary: 'text-primary',
    coral: 'text-coral',
    teal: 'text-teal',
  }[variant]

  return (
    <div className="flex h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div
        className={cn('mb-6 flex h-20 w-20 items-center justify-center rounded-full', iconBgClass)}
      >
        <Icon className={cn('h-10 w-10', iconColorClass)} />
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">{description}</p>
      <p className="mt-6 text-xs text-muted-foreground/60">{tCommon('comingSoon')}</p>
    </div>
  )
}
