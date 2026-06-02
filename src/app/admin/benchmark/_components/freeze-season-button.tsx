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

export function FreezeSeasonButton({ seasonId }: { seasonId: string }) {
  const mutation = api.benchmarkAdmin.freezeSeason.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Season frozen: ${result.promptVersionCount} prompts, ${result.modelSnapshotCount} models, ${result.caseCount} cases`,
      )
      loadFreshBenchmarkAdminPage()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button>Freeze Season</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Freeze this season?</AlertDialogTitle>
          <AlertDialogDescription>
            This will snapshot all active prompts and models, generate the case matrix, and activate
            the season. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate({ seasonId })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Freezing...' : 'Freeze'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
