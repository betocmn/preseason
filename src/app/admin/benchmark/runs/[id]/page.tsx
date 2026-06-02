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
import { PublishRunButton } from '../../_components/publish-run-button'
import { RetryFailedButton } from '../../_components/retry-failed-button'

type QcCheck = {
  name: string
  passed: boolean
  actual: number
  threshold: number
}

function resultStatusVariant(status: string) {
  switch (status) {
    case 'running':
      return 'secondary' as const
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

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function RunDetailPage({ params }: PageProps) {
  const { id } = await params
  const caller = await api()
  const run = await caller.benchmarkAdmin.getBenchmarkRun({ id }).catch(() => notFound())

  const hasFailures = (run.resultStats.failed ?? 0) + (run.resultStats.invalid_output ?? 0) > 0
  const canPublish = run.status === 'completed' && run.qcStatus === 'passed'
  const canRetry =
    ((run.status === 'completed' || run.status === 'published') && hasFailures) ||
    run.status === 'qc_failed' ||
    run.status === 'failed'
  const retryNote = canRetry
    ? 'Repair and Retry Cases preserves invalid outputs so stored raw responses can be repaired before any fresh benchmark call.'
    : null
  const publicationNote = canPublish
    ? 'This completed run predates auto-publish. Use Publish Legacy Run only to backfill it.'
    : run.status === 'published' && run.qcStatus === 'passed'
      ? 'This run published automatically when QC passed.'
      : null

  const qcChecks: QcCheck[] = run.qcSummaryJson
    ? ((run.qcSummaryJson as { checks?: QcCheck[] }).checks ?? [])
    : []

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Run: {run.scheduledFor}</h1>
          <p className="text-muted-foreground">
            Season:{' '}
            <Link
              href={`/admin/benchmark/seasons/${run.season.id}`}
              className="underline hover:no-underline"
            >
              {run.season.name}
            </Link>{' '}
            &middot; Trigger: {run.trigger}
          </p>
          {publicationNote && (
            <p className="text-muted-foreground mt-2 text-sm">{publicationNote}</p>
          )}
          {retryNote && <p className="text-muted-foreground mt-2 text-sm">{retryNote}</p>}
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant={
              run.status === 'published'
                ? 'default'
                : run.status === 'completed'
                  ? 'secondary'
                  : run.status === 'failed' || run.status === 'qc_failed'
                    ? 'destructive'
                    : 'outline'
            }
          >
            {run.status}
          </Badge>
          {canPublish && <PublishRunButton runId={run.id} />}
          {canRetry && <RetryFailedButton runId={run.id} />}
        </div>
      </div>

      {/* Run Metadata */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Details</h2>
        <div className="grid max-w-md grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted-foreground">Started</span>
          <span>{run.startedAt ? new Date(run.startedAt).toLocaleString() : '-'}</span>
          <span className="text-muted-foreground">Completed</span>
          <span>{run.completedAt ? new Date(run.completedAt).toLocaleString() : '-'}</span>
          <span className="text-muted-foreground">Weight Config</span>
          <span>{run.weightConfig?.name ?? 'None'}</span>
          <span className="text-muted-foreground">QC Status</span>
          <span>{run.qcStatus ?? '-'}</span>
        </div>
      </section>

      {/* Case Result Summary */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Case Result Summary</h2>
        <div className="grid max-w-md grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted-foreground">Expected</span>
          <span>{run.expectedCaseCount ?? '-'}</span>
          <span className="text-muted-foreground">Running</span>
          <span>{run.resultStats.running ?? 0}</span>
          <span className="text-muted-foreground">Completed</span>
          <span>{run.resultStats.completed ?? 0}</span>
          <span className="text-muted-foreground">Failed</span>
          <span>{run.resultStats.failed ?? 0}</span>
          <span className="text-muted-foreground">Invalid Output</span>
          <span>{run.resultStats.invalid_output ?? 0}</span>
          <span className="text-muted-foreground">Pending</span>
          <span>{run.resultStats.pending ?? 0}</span>
        </div>
      </section>

      {/* Case Results */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Case Results</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prompt</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Decisions</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.caseRows.map((caseRow) => {
                const result = caseRow.result

                return (
                  <TableRow key={caseRow.id}>
                    <TableCell>
                      <div className="font-medium">{caseRow.promptVersion.title}</div>
                      <div className="text-muted-foreground text-xs">
                        v{caseRow.promptVersion.version} · {caseRow.promptVersion.level}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{caseRow.modelSnapshot.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {caseRow.modelSnapshot.company} · {caseRow.modelSnapshot.tier}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={resultStatusVariant(result?.status ?? 'pending')}>
                        {result?.status ?? 'pending'}
                      </Badge>
                    </TableCell>
                    <TableCell>{result?.attemptCount ?? 0}</TableCell>
                    <TableCell className="text-sm">
                      {result?.startedAt ? new Date(result.startedAt).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {result?.completedAt ? new Date(result.completedAt).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell className="max-w-md">
                      {result?.decisions.length ? (
                        <div className="space-y-1 text-xs">
                          {result.decisions.map((decision) => (
                            <div key={decision.id}>
                              <span className="font-medium">{decision.categoryName}:</span>{' '}
                              {decision.decisionType === 'tool'
                                ? (decision.toolName ?? decision.rawToolName ?? 'Unresolved')
                                : decision.decisionType}
                              {decision.decisionType === 'tool' &&
                              decision.resolutionStatus === 'unresolved_tool'
                                ? ' (unresolved)'
                                : ''}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-sm text-sm">
                      {result?.errorMessage ? (
                        <span className="text-destructive">{result.errorMessage}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* QC Summary */}
      {qcChecks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">QC Checks</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Threshold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qcChecks.map((check) => (
                  <TableRow key={check.name}>
                    <TableCell className="font-medium">{check.name}</TableCell>
                    <TableCell>
                      <Badge variant={check.passed ? 'default' : 'destructive'}>
                        {check.passed ? 'Pass' : 'Fail'}
                      </Badge>
                    </TableCell>
                    <TableCell>{check.actual}</TableCell>
                    <TableCell>{check.threshold}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* Error Log */}
      {run.errorLog && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Error Log</h2>
          <pre className="bg-muted overflow-x-auto rounded-md p-4 text-sm">{run.errorLog}</pre>
        </section>
      )}

      <Button asChild variant="outline">
        <Link href={`/admin/benchmark/seasons/${run.season.id}`}>Back to Season</Link>
      </Button>
    </div>
  )
}
