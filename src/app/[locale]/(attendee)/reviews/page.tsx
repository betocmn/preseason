import { Star } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ComingSoonAttendee } from '~/components/attendee/coming-soon-attendee'

export default async function ReviewsPage() {
  const t = await getTranslations('reviews')

  return (
    <ComingSoonAttendee
      title={t('title')}
      description={t('description')}
      icon={Star}
      variant="teal"
    />
  )
}
