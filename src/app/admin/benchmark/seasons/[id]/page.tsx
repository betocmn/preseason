export const dynamic = 'force-dynamic'

import { Eye } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { api } from '~/trpc/server'
import { CompleteSeasonButton } from '../../_components/complete-season-button'
import { FreezeSeasonButton } from '../../_components/freeze-season-button'

function runStatusVariant(status: string) {
  switch (status) {
    case 'published':
      return 'default' as const
    case 'completed':
      return 'secondary' as const
    case 'running':
    case 'pending':
      return 'outline' as const
    default:
      return 'destructive' as const
  }
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function SeasonDetailPage({ params }: PageProps) {
  const { id } = await params
  const caller = await api()
  const season = await caller.benchmarkAdmin.getSeasonById({ id }).catch(() => notFound())

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{season.name}</h1>
          <p className="text-muted-foreground">
            {season.slug} &middot; Protocol: {season.protocol.name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={season.status === 'active' ? 'default' : 'outline'}>
            {season.status}
          </Badge>
          {season.status === 'draft' && season.protocol.mode === 'benchmark' && (
            <FreezeSeasonButton seasonId={season.id} />
          )}
          {season.status === 'active' && season.protocol.mode === 'benchmark' && (
            <CompleteSeasonButton seasonId={season.id} />
          )}
        </div>
      </div>

      {season.notes && <p className="text-muted-foreground max-w-prose">{season.notes}</p>}

      {/* Prompt Versions */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Prompt Versions ({season.seasonPrompts.length})</h2>
        {season.seasonPrompts.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prompt</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Categories</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {season.seasonPrompts.map((sp) => (
                  <TableRow key={sp.id}>
                    <TableCell className="font-medium">
                      {sp.promptVersion.prompt?.title ?? sp.promptVersion.slug}
                    </TableCell>
                    <TableCell>v{sp.promptVersion.version}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{sp.promptVersion.level}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {sp.promptVersion.categories.map((c) => (
                          <Badge key={c.id} variant="secondary" className="text-xs">
                            {c.category.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No prompt versions frozen yet. Freeze the season to snapshot active prompts.
          </p>
        )}
      </section>

      {/* Model Snapshots */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Model Snapshots ({season.seasonModels.length})</h2>
        {season.seasonModels.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Temperature</TableHead>
                  <TableHead>Model ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {season.seasonModels.map((sm) => (
                  <TableRow key={sm.id}>
                    <TableCell className="font-medium">{sm.modelSnapshot.name}</TableCell>
                    <TableCell>{sm.modelSnapshot.company}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{sm.modelSnapshot.tier}</Badge>
                    </TableCell>
                    <TableCell>{sm.modelSnapshot.temperature ?? '-'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {sm.modelSnapshot.requestedModelId}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No model snapshots frozen yet. Freeze the season to snapshot active LLMs.
          </p>
        )}
      </section>

      {/* Runs */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Runs ({season.runs.length})</h2>
        {season.runs.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Cases</TableHead>
                  <TableHead>QC</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {season.runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">{run.scheduledFor}</TableCell>
                    <TableCell>
                      <Badge variant={runStatusVariant(run.status)}>{run.status}</Badge>
                    </TableCell>
                    <TableCell>{run.trigger}</TableCell>
                    <TableCell>
                      {run.completedCaseCount ?? 0}/{run.expectedCaseCount ?? '?'}
                    </TableCell>
                    <TableCell>{run.qcStatus ?? '-'}</TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="icon" title="View">
                        <Link href={`/beto-admin/benchmark/runs/${run.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No runs yet.</p>
        )}
      </section>
    </div>
  )
}
