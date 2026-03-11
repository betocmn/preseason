'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/ui/alert-dialog'
import { Button } from '~/components/ui/button'
import { api } from '~/trpc/react'

export function RetryFailedButton({ runId }: { runId: string }) {
  const router = useRouter()
  const mutation = api.benchmarkAdmin.retryFailedCases.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.retriedCount} failed cases cleared for retry`)
      router.refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Retry Failed Cases</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retry failed cases?</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete failed and invalid case results, then reset the run to pending so the
            runner can re-execute them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate({ runId })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Retrying...' : 'Retry'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
