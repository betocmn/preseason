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

type Props = {
  candidateId: string
  candidateName: string
  currentStatus: string
}

export function ResetCandidateDialog({ candidateId, candidateName, currentStatus }: Props) {
  const mutation = api.benchmarkAdmin.resetCandidate.useMutation({
    onSuccess: () => {
      toast.success('Candidate reset to pending')
      loadFreshBenchmarkAdminPage()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Undo
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset: {candidateName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will reset the candidate back to pending.
            {currentStatus === 'approved' &&
              ' Any alias still owned by this approval will be removed and its matching benchmark decisions will revert to unresolved.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate({ candidateId })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Resetting...' : 'Reset to Pending'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
