'use client'

import { Power } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { api } from '~/trpc/react'

type ToggleLlmActiveButtonProps = {
  llmId: string
  isActive: boolean
}

export function ToggleLlmActiveButton({ llmId, isActive }: ToggleLlmActiveButtonProps) {
  const router = useRouter()
  const toggleMutation = api.llm.toggleActive.useMutation({
    onSuccess: (data) => {
      toast.success(data.isActive ? 'LLM activated' : 'LLM deactivated')
      router.refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Button
      variant="ghost"
      size="icon"
      title={isActive ? 'Deactivate' : 'Activate'}
      onClick={() => toggleMutation.mutate({ id: llmId, isActive: !isActive })}
      disabled={toggleMutation.isPending}
    >
      <Power className={`h-4 w-4 ${isActive ? 'text-green-500' : 'text-muted-foreground'}`} />
    </Button>
  )
}
