'use client'

import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { api } from '~/trpc/react'
import { loadFreshBenchmarkAdminPage } from './navigation'

export function ActivateWeightButton({ configId }: { configId: string }) {
  const mutation = api.benchmarkAdmin.activateWeightConfig.useMutation({
    onSuccess: () => {
      toast.success('Weight config activated')
      loadFreshBenchmarkAdminPage()
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
