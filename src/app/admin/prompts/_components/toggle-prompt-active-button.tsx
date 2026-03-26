'use client'

import { Power } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { api } from '~/trpc/react'

type TogglePromptActiveButtonProps = {
  promptId: string
  isActive: boolean
}

export function TogglePromptActiveButton({
  promptId,
  isActive,
}: TogglePromptActiveButtonProps) {
  const router = useRouter()
  const toggleMutation = api.prompt.toggleActive.useMutation({
    onSuccess: (data) => {
      toast.success(data.isActive ? 'Prompt activated' : 'Prompt deactivated')
      router.refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Button
      variant="ghost"
      size="icon"
      title={isActive ? 'Deactivate' : 'Activate'}
      onClick={() =>
        toggleMutation.mutate({ id: promptId, isActive: !isActive })
      }
      disabled={toggleMutation.isPending}
    >
      <Power
        className={`h-4 w-4 ${isActive ? 'text-green-500' : 'text-muted-foreground'}`}
      />
    </Button>
  )
}
