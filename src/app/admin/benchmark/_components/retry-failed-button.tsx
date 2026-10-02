'use client'

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
import { loadFreshBenchmarkAdminPage } from './navigation'

export function RetryFailedButton({
  runId,
  recoveryIntervalMinutes,
}: {
  runId: string
  recoveryIntervalMinutes: number
}) {
  const mutation = api.benchmarkAdmin.retryFailedCases.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.retriedCount} cases queued for repair and retry`)
      loadFreshBenchmarkAdminPage()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Repair and Retry Cases</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Repair and retry cases?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="block">
              This will reset the run to pending and preserve failed and invalid results so the
              runner can repair stored invalid outputs before re-executing cases that still need a
              fresh model call.
            </span>
            <span className="mt-2 block">
              Queued cases are processed one at a time, every minute during scheduled benchmark
              windows and every {recoveryIntervalMinutes} minutes otherwise. Larger queues take
              longer to finish.
            </span>
            <span className="mt-2 block">
              A published run will leave public rankings until it passes QC and is republished.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate({ runId })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Queueing...' : 'Queue Retry'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
