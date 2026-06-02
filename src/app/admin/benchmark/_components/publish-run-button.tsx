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

export function PublishRunButton({ runId }: { runId: string }) {
  const mutation = api.benchmarkAdmin.publishRun.useMutation({
    onSuccess: () => {
      toast.success('Legacy run published')
      loadFreshBenchmarkAdminPage()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button>Publish Legacy Run</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish this legacy run?</AlertDialogTitle>
          <AlertDialogDescription>
            New QC-passing runs publish automatically. Use this only to backfill an older completed
            run that predates auto-publish.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate({ runId })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Publishing...' : 'Publish Legacy Run'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
