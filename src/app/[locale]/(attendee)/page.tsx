import { eq } from 'drizzle-orm'
import { ScanLine, Wine } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ActiveFairCard } from '~/components/attendee/active-fair-card'
import { FeaturedWines } from '~/components/attendee/featured-wines'
import { WelcomeHero } from '~/components/attendee/welcome-hero'
import { Card, CardContent } from '~/components/ui/card'
import { Link } from '~/i18n/navigation'
import { getServerUser } from '~/lib/auth'
import { db } from '~/server/db'
import { userProfiles } from '~/server/db/schema'
import { api } from '~/trpc/server'

export default async function HomePage() {
  const user = await getServerUser()
  const t = await getTranslations('home')

  const [caller, firstName] = await Promise.all([
    api(),
    user
      ? db.query.userProfiles
          .findFirst({ where: eq(userProfiles.id, user.id) })
          .then((p) => p?.firstName ?? undefined)
      : Promise.resolve(undefined),
  ])

  const activeFairs = await caller.fair.list({ activeOnly: true })
  const activeFair = activeFairs[0] ?? null

  let fairCardData: {
    name: string
    location: string | null
    startDate: string
    endDate: string
    description: string | null
    producerCount: number
    wineCount: number
  } | null = null

  if (activeFair) {
    const fairDetail = await caller.fair.getById({ id: activeFair.id })
    fairCardData = {
      name: fairDetail.name,
      location: fairDetail.location,
      startDate: fairDetail.startDate,
      endDate: fairDetail.endDate,
      description: fairDetail.description,
      producerCount: fairDetail.fairProducers.length,
      wineCount: fairDetail.fairWines.length,
    }
  }

  return (
    <div>
      <WelcomeHero userName={firstName} fairName={activeFair?.name ?? undefined} />

      <div className="mx-auto max-w-lg space-y-6 p-4 lg:max-w-4xl">
        {/* Quick Actions */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">{t('quickActions')}</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/scan">
              <Card className="cursor-pointer transition-shadow hover:shadow-md hover:border-coral/30">
                <CardContent className="flex flex-col items-center p-4">
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-coral-muted">
                    <ScanLine className="h-6 w-6 text-coral" />
                  </div>
                  <span className="text-sm font-medium">{t('scanWine')}</span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/search">
              <Card className="cursor-pointer transition-shadow hover:shadow-md hover:border-teal/30">
                <CardContent className="flex flex-col items-center p-4">
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-teal-muted">
                    <Wine className="h-6 w-6 text-teal" />
                  </div>
                  <span className="text-sm font-medium">{t('browseWines')}</span>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>

        {/* Active Fair Info */}
        <ActiveFairCard fair={fairCardData} />

        {/* Recently Added Wines */}
        <FeaturedWines />
      </div>
    </div>
  )
}
