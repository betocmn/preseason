import { Wine } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ComingSoon } from '~/components/manage/coming-soon'

export default async function WinesPage() {
  const t = await getTranslations('admin.wines')

  return <ComingSoon title={t('title')} description={t('description')} icon={Wine} />
}
