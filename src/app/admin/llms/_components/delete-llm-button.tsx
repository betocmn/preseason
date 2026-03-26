'use client'

import { Trash2 } from 'lucide-react'
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

type DeleteLlmButtonProps = {
  llmId: string
  llmName: string
  isUsed: boolean
}

export function DeleteLlmButton({ llmId, llmName, isUsed }: DeleteLlmButtonProps) {
  const router = useRouter()
  const deleteMutation = api.llm.delete.useMutation({
    onSuccess: () => {
      toast.success('LLM deleted')
      router.refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  if (isUsed) {
    return (
      <Button
        variant="ghost"
        size="icon"
        title="Used LLMs cannot be deleted"
        onClick={() => toast.error('Used LLMs cannot be deleted')}
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Delete">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {llmName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes this LLM. Used LLMs cannot be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate({ id: llmId })}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
