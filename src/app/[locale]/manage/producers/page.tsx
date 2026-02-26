import { Users } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ComingSoon } from '~/components/manage/coming-soon'

export default async function ProducersPage() {
  const t = await getTranslations('admin.producers')

  return <ComingSoon title={t('title')} description={t('description')} icon={Users} />
}
