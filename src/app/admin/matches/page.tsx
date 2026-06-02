import { Eye } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { api } from '~/trpc/server'
import { MatchLauncher } from './_components/match-launcher'

function batchStatusVariant(status: string) {
  switch (status) {
    case 'completed':
      return 'default' as const
    case 'running':
      return 'secondary' as const
    case 'failed':
      return 'destructive' as const
    default:
      return 'outline' as const
  }
}

function formatTimestamp(value: Date | null) {
  return value ? new Date(value).toLocaleString() : '-'
}

export default async function AdminMatchesPage() {
  const caller = await api()

  let launchContext: Awaited<ReturnType<typeof caller.match.getAdminLaunchContext>> | null = null
  let launchError: string | null = null

  try {
    launchContext = await caller.match.getAdminLaunchContext()
  } catch (error) {
    launchError = error instanceof Error ? error.message : 'Unable to load match launch context'
  }

  const recentBatches = launchContext
    ? await caller.match.listBatches({
        seasonId: launchContext.season.id,
        limit: 20,
        offset: 0,
      })
    : []

  const missingFrozenModels = launchContext?.season.modelCount === 0

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Matches</h1>
        <p className="text-muted-foreground">
          Queue manual match batches for the active benchmark season. Pending batches are picked up
          automatically by the existing `*/15` match cron.
        </p>
      </div>

      {launchContext ? (
        <Card>
          <CardHeader>
            <CardTitle>Launch Context</CardTitle>
            <CardDescription>
              Matches are independent from benchmark runs, but they use the active season&apos;s
              frozen model snapshots and the single active match prompt template.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="text-muted-foreground text-sm">Active Season</div>
              <div className="mt-2 font-medium">{launchContext.season.name}</div>
              <div className="text-muted-foreground text-sm">{launchContext.season.slug}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-muted-foreground text-sm">Frozen Models</div>
              <div className="mt-2 font-medium">{launchContext.season.modelCount}</div>
              <div className="text-muted-foreground text-sm">
                {launchContext.season.modelCount * 2} evaluations per queued matchup
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-muted-foreground text-sm">Active Match Prompt</div>
              <div className="mt-2 font-medium">{launchContext.promptTemplate.name}</div>
              <div className="text-muted-foreground text-sm">
                {launchContext.promptTemplate.slug}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Match Launching Is Blocked</CardTitle>
            <CardDescription>{launchError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/admin/benchmark">Open Benchmark Seasons</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {launchContext && missingFrozenModels ? (
        <Card>
          <CardHeader>
            <CardTitle>No Frozen Models</CardTitle>
            <CardDescription>
              The active season exists, but it does not have frozen model snapshots yet. Freeze the
              season panel before queuing manual matches.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/admin/benchmark">Open Benchmark Seasons</Link>
            </Button>
          </CardContent>
        </Card>
      ) : launchContext ? (
        <MatchLauncher launchContext={launchContext} />
      ) : null}

      {launchContext && (
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold">Recent Batches</h2>
            <p className="text-muted-foreground text-sm">
              Showing the latest 20 batches for the active season.
            </p>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Tools</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Failures</TableHead>
                  <TableHead>Prompt</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentBatches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="text-sm">{formatTimestamp(batch.createdAt)}</TableCell>
                    <TableCell className="font-medium">{batch.category.name}</TableCell>
                    <TableCell>
                      {batch.toolA.name} vs {batch.toolB.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={batchStatusVariant(batch.status)}>{batch.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {batch.completedEvaluations}/{batch.totalEvaluations}
                    </TableCell>
                    <TableCell>
                      {batch.failedEvaluations} failed / {batch.invalidOutputEvaluations} invalid
                    </TableCell>
                    <TableCell>{batch.promptTemplate.name}</TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="icon" title="View">
                        <Link href={`/admin/matches/${batch.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {recentBatches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      No match batches have been queued for the active season yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  )
}
