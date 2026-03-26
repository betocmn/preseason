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

type DeletePromptButtonProps = {
  promptId: string
  promptTitle: string
  isUsed: boolean
}

export function DeletePromptButton({ promptId, promptTitle, isUsed }: DeletePromptButtonProps) {
  const router = useRouter()
  const deleteMutation = api.prompt.delete.useMutation({
    onSuccess: () => {
      toast.success('Prompt deleted')
      router.refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  if (isUsed) {
    return (
      <Button
        variant="ghost"
        size="icon"
        title="Used prompts cannot be deleted"
        onClick={() => toast.error('Used prompts cannot be deleted')}
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
          <AlertDialogTitle>Delete {promptTitle}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes this prompt. Used prompts cannot be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate({ id: promptId })}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
