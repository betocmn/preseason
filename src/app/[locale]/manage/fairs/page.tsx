import { CalendarDays } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ComingSoon } from '~/components/manage/coming-soon'

export default async function FairsPage() {
  const t = await getTranslations('admin.fairs')

  return <ComingSoon title={t('title')} description={t('description')} icon={CalendarDays} />
}
