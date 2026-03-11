'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
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
import { Textarea } from '~/components/ui/textarea'
import { api } from '~/trpc/react'

type Props = {
  candidateId: string
  candidateName: string
}

export function RejectCandidateDialog({ candidateId, candidateName }: Props) {
  const router = useRouter()
  const [notes, setNotes] = useState('')

  const mutation = api.benchmarkAdmin.rejectCandidate.useMutation({
    onSuccess: () => {
      toast.success('Candidate rejected')
      router.refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          Reject
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reject: {candidateName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Mark this candidate as rejected. It will not be matched to any tool.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          placeholder="Notes (optional)..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate({ candidateId, notes: notes || undefined })}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? 'Rejecting...' : 'Reject'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
