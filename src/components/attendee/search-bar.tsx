'use client'

import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Input } from '~/components/ui/input'

type SearchBarProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}

export function SearchBar({ value, onChange, onSubmit }: SearchBarProps) {
  const t = useTranslations('search')
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder={t('placeholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit()
        }}
        className="pl-9"
      />
    </div>
  )
}
