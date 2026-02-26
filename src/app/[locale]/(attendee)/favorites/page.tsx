import { Heart } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ComingSoonAttendee } from '~/components/attendee/coming-soon-attendee'

export default async function FavoritesPage() {
  const t = await getTranslations('favorites')

  return <ComingSoonAttendee title={t('title')} description={t('description')} icon={Heart} />
}
