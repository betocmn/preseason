import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
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
import type { RouterOutputs } from '~/trpc/react'
import { api } from '~/trpc/server'

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

function evaluationStatusVariant(status: string) {
  switch (status) {
    case 'completed':
      return 'default' as const
    case 'invalid_output':
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

function formatPresentationOrder(order: 'a_first' | 'b_first') {
  return order === 'a_first' ? 'A first' : 'B first'
}

function formatWinner(
  batch: RouterOutputs['match']['getBatch'],
  winnerDecision: 'tool_a' | 'tool_b' | 'tie' | 'abstain' | null,
) {
  if (winnerDecision === 'tool_a') return batch.toolA.name
  if (winnerDecision === 'tool_b') return batch.toolB.name
  if (winnerDecision === 'tie') return 'Tie'
  if (winnerDecision === 'abstain') return 'Abstain'
  return '-'
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function MatchBatchDetailPage({ params }: PageProps) {
  const { id } = await params
  const caller = await api()
  const batch = await caller.match.getBatch({ batchId: id }).catch(() => notFound())

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Button asChild variant="ghost" className="-ml-3 w-fit">
            <Link href="/beto-admin/matches">
              <ArrowLeft />
              Back to Matches
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {batch.toolA.name} vs {batch.toolB.name}
            </h1>
            <p className="text-muted-foreground">
              {batch.category.name} &middot; {batch.promptTemplate.name}
            </p>
          </div>
        </div>
        <Badge variant={batchStatusVariant(batch.status)}>{batch.status}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Batch Metadata</CardTitle>
            <CardDescription>
              This batch runs independently from benchmark runs and finishes once all of its
              materialized evaluations finish.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-y-3 text-sm">
            <span className="text-muted-foreground">Season</span>
            <span>{batch.season.name}</span>
            <span className="text-muted-foreground">Category</span>
            <span>{batch.category.name}</span>
            <span className="text-muted-foreground">Trigger Mode</span>
            <span>{batch.triggerMode}</span>
            <span className="text-muted-foreground">Prompt</span>
            <span>{batch.promptTemplate.name}</span>
            <span className="text-muted-foreground">Created</span>
            <span>{formatTimestamp(batch.createdAt)}</span>
            <span className="text-muted-foreground">Started</span>
            <span>{formatTimestamp(batch.startedAt)}</span>
            <span className="text-muted-foreground">Completed</span>
            <span>{formatTimestamp(batch.completedAt)}</span>
            <span className="text-muted-foreground">Progress</span>
            <span>
              {batch.completedEvaluations}/{batch.totalEvaluations}
            </span>
            <span className="text-muted-foreground">Failures</span>
            <span>
              {batch.failedEvaluations} failed / {batch.invalidOutputEvaluations} invalid
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evaluation Coverage</CardTitle>
            <CardDescription>
              Each row is one dedicated prompt + LLM call for a single frozen model snapshot and
              presentation order.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="text-muted-foreground text-sm">Completed</div>
              <div className="mt-2 text-2xl font-semibold">{batch.completedEvaluations}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-muted-foreground text-sm">Failed</div>
              <div className="mt-2 text-2xl font-semibold">{batch.failedEvaluations}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-muted-foreground text-sm">Invalid Output</div>
              <div className="mt-2 text-2xl font-semibold">{batch.invalidOutputEvaluations}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Evaluations</h2>
          <p className="text-muted-foreground text-sm">
            Requested and returned model IDs, parser metadata, latency, token usage, and errors are
            stored as read-only diagnostics on each evaluation row.
          </p>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Winner</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Model IDs</TableHead>
                <TableHead>Latency / Tokens</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.evaluations.map((evaluation) => (
                <TableRow key={evaluation.id}>
                  <TableCell>
                    <div className="font-medium">{evaluation.modelSnapshot.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {evaluation.modelSnapshot.company}
                    </div>
                  </TableCell>
                  <TableCell>{formatPresentationOrder(evaluation.presentationOrder)}</TableCell>
                  <TableCell>
                    <Badge variant={evaluationStatusVariant(evaluation.status)}>
                      {evaluation.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatWinner(batch, evaluation.winnerDecision)}</TableCell>
                  <TableCell>
                    {evaluation.confidence == null
                      ? '-'
                      : `${Math.round(evaluation.confidence * 100)}%`}
                  </TableCell>
                  <TableCell className="max-w-sm text-xs">
                    <div>{evaluation.requestedModelId ?? '-'}</div>
                    <div className="text-muted-foreground">{evaluation.returnedModelId ?? '-'}</div>
                    <div className="text-muted-foreground mt-1">
                      {evaluation.provider ?? '-'} &middot; {evaluation.finishReason ?? '-'}{' '}
                      &middot; {evaluation.parserVersion ?? '-'}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{evaluation.latencyMs ? `${evaluation.latencyMs} ms` : '-'}</div>
                    <div className="text-muted-foreground">
                      {evaluation.promptTokens ?? 0}/{evaluation.completionTokens ?? 0}/
                      {evaluation.totalTokens ?? 0}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-sm text-sm">
                    {evaluation.errorMessage ? (
                      <span className="text-destructive">{evaluation.errorMessage}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
