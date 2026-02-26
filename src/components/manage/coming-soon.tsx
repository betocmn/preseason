import type { LucideIcon } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

type ComingSoonProps = {
  title: string
  description: string
  icon: LucideIcon
}

export async function ComingSoon({ title, description, icon: Icon }: ComingSoonProps) {
  const t = await getTranslations('admin')

  return (
    <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription className="text-base">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('comingSoon')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
