import { Inbox } from 'lucide-react'
import Link from 'next/link'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  description: string
  action?: { label: string; href: string }
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="mb-4 text-muted-foreground">
        {icon ?? <Inbox className="h-12 w-12" />}
      </div>
      <h3 className="mb-2 text-lg font-medium">{title}</h3>
      <p className="mb-4 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && (
        <Button asChild variant="outline" size="sm">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  )
}
