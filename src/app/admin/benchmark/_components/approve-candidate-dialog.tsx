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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { slugify } from '~/lib/slug'
import { api } from '~/trpc/react'

type Props = {
  candidateId: string
  candidateName: string
  suggestedCategoryId?: string | null
  suggestedTool?: {
    id: string
    name: string
    slug: string
  } | null
  suggestionReason?: string | null
  canAutoApprove?: boolean
  categories: Array<{
    id: string
    name: string
    categoryGroup?: {
      name: string
    } | null
  }>
}

export function ApproveCandidateDialog({
  candidateId,
  candidateName,
  suggestedCategoryId,
  suggestedTool,
  suggestionReason,
  canAutoApprove = false,
  categories,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState(candidateName)
  const [newToolName, setNewToolName] = useState(candidateName)
  const [newToolSlug, setNewToolSlug] = useState(slugify(candidateName, 'tool'))
  const [isSlugDirty, setIsSlugDirty] = useState(false)
  const [newToolCategoryId, setNewToolCategoryId] = useState(
    suggestedCategoryId ?? categories[0]?.id ?? '',
  )

  const { data: searchResults } = api.tool.search.useQuery(
    { query: searchQuery, limit: 10, categoryId: suggestedCategoryId ?? undefined },
    { enabled: open && searchQuery.length > 0 },
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
      toast.error(`Approved but replay failed: ${err.message}. You can retry from here.`)
    },
  })

  const isPending = approveMutation.isPending || replayMutation.isPending
  const canCreateTool =
    newToolName.trim().length > 0 && newToolSlug.trim().length > 0 && newToolCategoryId.length > 0

  function createToolAndApprove() {
    if (!canCreateTool) return

    approveMutation.mutate({
      candidateId,
      newTool: {
        name: newToolName.trim(),
        slug: newToolSlug.trim(),
        categoryId: newToolCategoryId,
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Approve</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve: {candidateName}</DialogTitle>
          <DialogDescription>
            Link this candidate to an existing tool or create a new one. Approval also creates a
            tool alias and resolves any unresolved decisions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Link Existing Tool</h3>
              <p className="text-muted-foreground text-xs">Search and select a canonical tool.</p>
            </div>
            {suggestedTool && suggestionReason && (
              <div className="bg-muted/50 flex items-center justify-between rounded-md border p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{suggestedTool.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {suggestionReason} · {suggestedTool.slug}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={isPending || !canAutoApprove}
                  onClick={() => approveMutation.mutate({ candidateId, toolId: suggestedTool.id })}
                >
                  {canAutoApprove ? 'Approve Suggested Match' : 'Review Suggested Match'}
                </Button>
              </div>
            )}
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

          <div className="space-y-3 border-t pt-4">
            <div>
              <h3 className="text-sm font-medium">Create New Tool</h3>
              <p className="text-muted-foreground text-xs">
                Use this when the candidate should become a new canonical tool.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Tool name"
                value={newToolName}
                onChange={(e) => {
                  const nextName = e.target.value
                  setNewToolName(nextName)
                  if (!isSlugDirty) {
                    setNewToolSlug(slugify(nextName, 'tool'))
                  }
                }}
              />
              <Input
                placeholder="tool-slug"
                value={newToolSlug}
                onChange={(e) => {
                  setIsSlugDirty(true)
                  setNewToolSlug(e.target.value)
                }}
              />
            </div>

            <Select value={newToolCategoryId} onValueChange={setNewToolCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.categoryGroup ? `${category.categoryGroup.name} / ` : ''}
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false)
              if (replayMutation.isError) router.refresh()
            }}
          >
            {replayMutation.isError ? 'Close' : 'Cancel'}
          </Button>
          {replayMutation.isError ? (
            <Button
              onClick={() => replayMutation.mutate({ candidateId })}
              disabled={replayMutation.isPending}
            >
              {replayMutation.isPending ? 'Retrying...' : 'Retry Replay'}
            </Button>
          ) : (
            <Button onClick={createToolAndApprove} disabled={isPending || !canCreateTool}>
              {approveMutation.isPending ? 'Approving...' : 'Create Tool and Approve'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
