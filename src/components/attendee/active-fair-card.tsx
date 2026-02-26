import { CalendarDays, MapPin, Users, Wine } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Link } from '~/i18n/navigation'

type ActiveFairCardProps = {
  fair: {
    name: string
    location: string | null
    startDate: string
    endDate: string
    description: string | null
    producerCount: number
    wineCount: number
  } | null
}

function formatDateRange(startDate: string, endDate: string) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (startDate === endDate) {
    return start.toLocaleDateString('en-US', { ...opts, year: 'numeric' })
  }
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString('en-US', opts)}–${end.getDate()}, ${end.getFullYear()}`
  }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}

export async function ActiveFairCard({ fair }: ActiveFairCardProps) {
  const t = await getTranslations('home')

  if (!fair) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-5 w-5" />
            {t('currentFair')}
          </CardTitle>
          <CardDescription>{t('noActiveFair')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('noActiveFairHint')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-coral/20 bg-gradient-to-br from-coral-muted/30 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="h-5 w-5 text-coral" />
          {fair.name}
        </CardTitle>
        {fair.description && (
          <CardDescription className="text-sm">{fair.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            {formatDateRange(fair.startDate, fair.endDate)}
          </span>
          {fair.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {fair.location}
            </span>
          )}
        </div>
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-teal" />
            <span className="font-medium">{fair.producerCount}</span> {t('producers')}
          </span>
          <span className="flex items-center gap-1.5">
            <Wine className="h-4 w-4 text-coral" />
            <span className="font-medium">{fair.wineCount}</span> {t('wines')}
          </span>
        </div>
        <Link
          href="/search"
          className="inline-block text-sm font-medium text-coral hover:text-coral/80"
        >
          {t('browseWinesLink')}
        </Link>
      </CardContent>
    </Card>
  )
}
