import { CalendarDays, MessageSquare, Star, UserCheck, Users, Wine } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

const latestRatings = [
  {
    name: 'Camila Ortega',
    age: 32,
    wine: 'Quinta da Brisa Touriga 2019',
    score: 4.7,
    comment: 'Juicy red fruit, polished tannins, super food friendly.',
  },
  {
    name: 'Jonas Becker',
    age: 41,
    wine: 'Alto Valle Chardonnay 2021',
    score: 4.3,
    comment: 'Bright citrus and vanilla; chilled glass showed great balance.',
  },
  {
    name: 'Priya Nair',
    age: 29,
    wine: 'Les Arches Pet Nat Rosé',
    score: 4.6,
    comment: 'Playful bubbles with strawberry nose; perfect aperitif.',
  },
  {
    name: 'Marco Santini',
    age: 37,
    wine: 'Cantina Vento Sangiovese 2020',
    score: 4.1,
    comment: 'Earthy spice and cherry; needed a short decant to open up.',
  },
]

export default async function DashboardPage() {
  const t = await getTranslations('admin.dashboard')

  const stats = [
    { title: t('stats.totalProducers'), value: '48', icon: Users, helper: '+6 this month' },
    { title: t('stats.totalWines'), value: '312', icon: Wine, helper: '27 new labels' },
    { title: t('stats.activeFairs'), value: '2', icon: CalendarDays, helper: 'London, Porto' },
    {
      title: t('stats.registeredAttendees'),
      value: '1,254',
      icon: UserCheck,
      helper: '+182 past week',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              {stat.helper ? <p className="text-xs text-muted-foreground">{stat.helper}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-lg font-semibold">{t('latestRatings')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('freshFeedback')}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Star className="h-5 w-5" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {latestRatings.map((rating) => (
            <div
              key={`${rating.name}-${rating.wine}`}
              className="flex items-start gap-3 rounded-lg border border-border/60 p-3"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <span>{rating.name}</span>
                  <span className="text-muted-foreground">• {t('years', { age: rating.age })}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {rating.score.toFixed(1)} / 5
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('tasted', { wine: rating.wine })}
                </p>
                <p className="text-sm leading-relaxed">{rating.comment}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
