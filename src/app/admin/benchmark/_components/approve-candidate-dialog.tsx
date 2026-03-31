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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
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
  const [activeTab, setActiveTab] = useState(suggestedTool ? 'match' : 'create')
  const [searchQuery, setSearchQuery] = useState(candidateName)
  const [newToolName, setNewToolName] = useState(candidateName)
  const [newToolSlug, setNewToolSlug] = useState(slugify(candidateName, 'tool'))
  const [isSlugDirty, setIsSlugDirty] = useState(false)
  const [newToolCategoryId, setNewToolCategoryId] = useState(
    suggestedCategoryId ?? categories[0]?.id ?? '',
  )

  const { data: searchResults } = api.tool.search.useQuery(
    { query: searchQuery, limit: 10, categoryId: suggestedCategoryId ?? undefined },
    { enabled: open && searchQuery.length > 0 && activeTab === 'match' },
  )

  const approveMutation = api.benchmarkAdmin.approveCandidate.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Approved. ${result.replayedCount} decision${result.replayedCount === 1 ? '' : 's'} resolved.`,
      )
      setOpen(false)
      router.refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  const isPending = approveMutation.isPending
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
        <Button size="sm">Review</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review: {candidateName}</DialogTitle>
          <DialogDescription>
            Match this candidate to an existing tool or create a new one. This also creates a tool
            alias and resolves any unresolved decisions.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="match" className="flex-1">
              Match Existing
            </TabsTrigger>
            <TabsTrigger value="create" className="flex-1">
              Create New
            </TabsTrigger>
          </TabsList>

          <TabsContent value="match" className="space-y-3 pt-2">
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
                  {canAutoApprove ? 'Approve Match' : 'Review Match'}
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
          </TabsContent>

          <TabsContent value="create" className="space-y-3 pt-2">
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
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {activeTab === 'create' && (
            <Button onClick={createToolAndApprove} disabled={isPending || !canCreateTool}>
              {isPending ? 'Approving...' : 'Create Tool and Approve'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
