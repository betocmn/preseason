'use client'

import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import type { RouterOutputs } from '~/trpc/react'
import { api } from '~/trpc/react'
import { loadFreshAdminPage } from '../../_components/navigation'
import {
  type MatchLaunchRow,
  stripMatchLaunchRows,
  validateMatchLaunchRows,
} from './match-launcher-state'

type MatchLaunchContext = RouterOutputs['match']['getAdminLaunchContext']

function createClientUuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createEmptyRow(): MatchLaunchRow {
  return {
    id: createClientUuid(),
    categoryId: '',
    toolAId: '',
    toolBId: '',
  }
}

type MatchLauncherRowProps = {
  row: MatchLaunchRow
  categories: MatchLaunchContext['categories']
  errors: ReturnType<typeof validateMatchLaunchRows>['rowErrors']
  isPending: boolean
  canRemove: boolean
  onChange: (rowId: string, updates: Partial<Omit<MatchLaunchRow, 'id'>>) => void
  onRemove: (rowId: string) => void
}

function MatchLauncherRowFields({
  row,
  categories,
  errors,
  isPending,
  canRemove,
  onChange,
  onRemove,
}: MatchLauncherRowProps) {
  const rowErrors = errors.get(row.id) ?? {}
  const toolsQuery = api.match.listLaunchableTools.useQuery(
    { categoryId: row.categoryId },
    { enabled: row.categoryId.length > 0 },
  )

  const tools = toolsQuery.data ?? []
  const toolSelectDisabled = isPending || row.categoryId.length === 0 || toolsQuery.isLoading

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="space-y-2">
          <Label htmlFor={`category-${row.id}`}>Category</Label>
          <Select
            value={row.categoryId || undefined}
            onValueChange={(value) =>
              onChange(row.id, { categoryId: value, toolAId: '', toolBId: '' })
            }
            disabled={isPending}
          >
            <SelectTrigger id={`category-${row.id}`}>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rowErrors.categoryId && (
            <p className="text-destructive text-xs">{rowErrors.categoryId}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`tool-a-${row.id}`}>Tool A</Label>
          <Select
            value={row.toolAId || undefined}
            onValueChange={(value) => onChange(row.id, { toolAId: value })}
            disabled={toolSelectDisabled}
          >
            <SelectTrigger id={`tool-a-${row.id}`}>
              <SelectValue
                placeholder={
                  row.categoryId ? 'Select Tool A' : 'Choose a category before selecting a tool'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {tools.map((tool) => (
                <SelectItem key={tool.id} value={tool.id}>
                  {tool.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {toolsQuery.isLoading && <p className="text-muted-foreground text-xs">Loading tools…</p>}
          {rowErrors.toolAId && <p className="text-destructive text-xs">{rowErrors.toolAId}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`tool-b-${row.id}`}>Tool B</Label>
          <Select
            value={row.toolBId || undefined}
            onValueChange={(value) => onChange(row.id, { toolBId: value })}
            disabled={toolSelectDisabled}
          >
            <SelectTrigger id={`tool-b-${row.id}`}>
              <SelectValue
                placeholder={
                  row.categoryId ? 'Select Tool B' : 'Choose a category before selecting a tool'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {tools.map((tool) => (
                <SelectItem key={tool.id} value={tool.id}>
                  {tool.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rowErrors.toolBId && <p className="text-destructive text-xs">{rowErrors.toolBId}</p>}
        </div>

        <div className="flex items-end">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemove(row.id)}
            disabled={!canRemove || isPending}
            title="Remove row"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {rowErrors.duplicate && <p className="text-destructive text-xs">{rowErrors.duplicate}</p>}
    </div>
  )
}

export function MatchLauncher({ launchContext }: { launchContext: MatchLaunchContext }) {
  const [rows, setRows] = useState<MatchLaunchRow[]>(() => [createEmptyRow()])
  const validation = useMemo(() => validateMatchLaunchRows(rows), [rows])

  const queueMutation = api.match.createManualBatches.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.createdCount === 1 ? '1 match queued' : `${result.createdCount} matches queued`,
      )
      loadFreshAdminPage('/beto-admin/matches')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  function updateRow(rowId: string, updates: Partial<Omit<MatchLaunchRow, 'id'>>) {
    setRows((currentRows) =>
      currentRows.map((row) => (row.id === rowId ? { ...row, ...updates } : row)),
    )
  }

  function addRow() {
    setRows((currentRows) => [...currentRows, createEmptyRow()])
  }

  function removeRow(rowId: string) {
    setRows((currentRows) => {
      if (currentRows.length === 1) {
        return [createEmptyRow()]
      }

      return currentRows.filter((row) => row.id !== rowId)
    })
  }

  function queueMatches(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!validation.canSubmit || queueMutation.isPending) {
      return
    }

    queueMutation.mutate({
      seasonId: launchContext.season.id,
      submissionId: createClientUuid(),
      entries: stripMatchLaunchRows(rows),
    })
  }

  const launcherDisabled =
    queueMutation.isPending ||
    launchContext.season.modelCount === 0 ||
    launchContext.categories.length === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Queue Manual Matches</CardTitle>
        <CardDescription>
          Add one or more tool matchups. Each queued matchup fans out across the frozen season
          models and runs automatically on the match cron.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {launchContext.categories.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No categories currently have at least two tools, so there are no launchable matchups
            yet.
          </p>
        ) : (
          <form className="space-y-4" onSubmit={queueMatches}>
            {rows.map((row) => (
              <MatchLauncherRowFields
                key={row.id}
                row={row}
                categories={launchContext.categories}
                errors={validation.rowErrors}
                isPending={queueMutation.isPending}
                canRemove={rows.length > 1}
                onChange={updateRow}
                onRemove={removeRow}
              />
            ))}

            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="outline" onClick={addRow} disabled={launcherDisabled}>
                <Plus />
                Add Row
              </Button>
              <Button type="submit" disabled={launcherDisabled || !validation.canSubmit}>
                {queueMutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Queueing…
                  </>
                ) : (
                  'Queue Matches'
                )}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
