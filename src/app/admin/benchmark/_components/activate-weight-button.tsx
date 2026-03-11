'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { api } from '~/trpc/react'

export function ActivateWeightButton({ configId }: { configId: string }) {
  const router = useRouter()
  const mutation = api.benchmarkAdmin.activateWeightConfig.useMutation({
    onSuccess: () => {
      toast.success('Weight config activated')
      router.refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => mutation.mutate({ id: configId })}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? 'Activating...' : 'Activate'}
    </Button>
  )
}
