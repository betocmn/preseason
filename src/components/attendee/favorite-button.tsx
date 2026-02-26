'use client'

import { Heart } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { api } from '~/trpc/react'

type FavoriteButtonProps = {
  wineId: string
}

export function FavoriteButton({ wineId }: FavoriteButtonProps) {
  const t = useTranslations('wineDetail')
  const utils = api.useUtils()

  const { data, isLoading: isChecking } = api.favorite.isFavorited.useQuery({ wineId })
  const isFavorited = data?.favorited ?? false

  const toggle = api.favorite.toggle.useMutation({
    onMutate: async () => {
      await utils.favorite.isFavorited.cancel({ wineId })
      const previous = utils.favorite.isFavorited.getData({ wineId })
      utils.favorite.isFavorited.setData({ wineId }, { favorited: !isFavorited })
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        utils.favorite.isFavorited.setData({ wineId }, context.previous)
      }
    },
    onSuccess: (result) => {
      toast.success(result.favorited ? t('favoriteAdded') : t('favoriteRemoved'))
    },
    onSettled: () => {
      void utils.favorite.isFavorited.invalidate({ wineId })
    },
  })

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => toggle.mutate({ wineId })}
      disabled={isChecking || toggle.isPending}
      aria-label={isFavorited ? t('removeFromFavorites') : t('addToFavorites')}
    >
      <Heart
        className={cn(
          'h-6 w-6 transition-colors',
          isFavorited ? 'fill-red-500 text-red-500' : 'text-muted-foreground',
        )}
      />
    </Button>
  )
}
