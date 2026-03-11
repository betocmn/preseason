'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { api } from '~/trpc/react'

type Props = {
  candidateId: string
  candidateName: string
}

export function ApproveCandidateDialog({ candidateId, candidateName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState(candidateName)

  const { data: searchResults } = api.tool.search.useQuery(
    { query: searchQuery, limit: 10 },
    { enabled: searchQuery.length > 0 },
  )

  const approveMutation = api.benchmarkAdmin.approveCandidate.useMutation({
    onSuccess: (_result, variables) => {
      // Auto-replay decisions after approval
      replayMutation.mutate({ candidateId: variables.candidateId })
    },
    onError: (err) => toast.error(err.message),
  })

  const replayMutation = api.benchmarkAdmin.replayDecisions.useMutation({
    onSuccess: (result) => {
      toast.success(`Approved. ${result.updatedCount} decisions resolved.`)
      setOpen(false)
      router.refresh()
    },
    onError: (err) => {
      toast.error(`Approved but replay failed: ${err.message}`)
      setOpen(false)
      router.refresh()
    },
  })

  const isPending = approveMutation.isPending || replayMutation.isPending

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Approve</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve: {candidateName}</DialogTitle>
          <DialogDescription>
            Link this candidate to an existing tool. This will also create a tool alias and resolve
            any unresolved decisions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="max-h-60 space-y-1 overflow-y-auto">
            {searchResults?.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className="hover:bg-muted w-full rounded-md px-3 py-2 text-left text-sm"
                disabled={isPending}
                onClick={() => approveMutation.mutate({ candidateId, toolId: tool.id })}
              >
                <span className="font-medium">{tool.name}</span>
                <span className="text-muted-foreground ml-2 text-xs">{tool.slug}</span>
              </button>
            ))}
            {searchResults?.length === 0 && (
              <p className="text-muted-foreground py-4 text-center text-sm">No tools found</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
