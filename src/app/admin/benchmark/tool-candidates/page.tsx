import Link from 'next/link'
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
import { ApproveCandidateDialog } from '../_components/approve-candidate-dialog'
import { RejectCandidateDialog } from '../_components/reject-candidate-dialog'
import { ResetCandidateDialog } from '../_components/reset-candidate-dialog'

function statusVariant(status: string) {
  switch (status) {
    case 'approved':
      return 'default' as const
    case 'rejected':
      return 'destructive' as const
    default:
      return 'outline' as const
  }
}

const PAGE_SIZE = 50

type PageProps = {
  searchParams?: Promise<{
    status?: string
    page?: string
  }>
}

function getStatusFilter(value: string | undefined) {
  return value === 'pending' || value === 'approved' || value === 'rejected' ? value : undefined
}

export default async function ToolCandidatesPage({ searchParams }: PageProps) {
  const caller = await api()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const status = getStatusFilter(resolvedSearchParams?.status)
  const page = Math.max(1, Number(resolvedSearchParams?.page) || 1)
  const offset = (page - 1) * PAGE_SIZE
  const categories = await caller.category.list()
  const { items: candidates, total } = await caller.benchmarkAdmin.listToolCandidates({
    limit: PAGE_SIZE,
    offset,
    status,
  })
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tool Candidates</h1>
        <p className="text-muted-foreground">
          Review unrecognized tool names from benchmark runs. Showing {total} candidate
          {total === 1 ? '' : 's'}.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant={status === undefined ? 'default' : 'outline'} size="sm">
          <Link href="/admin/benchmark/tool-candidates">All</Link>
        </Button>
        <Button asChild variant={status === 'pending' ? 'default' : 'outline'} size="sm">
          <Link href="/admin/benchmark/tool-candidates?status=pending">Pending</Link>
        </Button>
        <Button asChild variant={status === 'approved' ? 'default' : 'outline'} size="sm">
          <Link href="/admin/benchmark/tool-candidates?status=approved">Approved</Link>
        </Button>
        <Button asChild variant={status === 'rejected' ? 'default' : 'outline'} size="sm">
          <Link href="/admin/benchmark/tool-candidates?status=rejected">Rejected</Link>
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Raw Name</TableHead>
              <TableHead>Normalized</TableHead>
              <TableHead>Seen</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Suggested Match</TableHead>
              <TableHead>Resolved To</TableHead>
              <TableHead className="w-40">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((candidate) => (
              <TableRow key={candidate.id}>
                <TableCell className="font-medium">{candidate.rawName}</TableCell>
                <TableCell className="text-muted-foreground">{candidate.normalizedName}</TableCell>
                <TableCell>{candidate.seenCount}</TableCell>
                <TableCell>
                  {candidate.suggestedCategory ? (
                    <Badge variant="secondary" className="text-xs">
                      {candidate.suggestedCategory.name}
                    </Badge>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(candidate.status)}>{candidate.status}</Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {candidate.suggestedTool ? (
                    <div className="space-y-1">
                      <p className="font-medium">{candidate.suggestedTool.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {candidate.suggestionReason ?? candidate.suggestedTool.slug}
                      </p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {candidate.approvedTool?.name ?? '-'}
                </TableCell>
                <TableCell>
                  {candidate.status === 'pending' ? (
                    <div className="flex gap-1">
                      <ApproveCandidateDialog
                        candidateId={candidate.id}
                        candidateName={candidate.rawName}
                        suggestedCategoryId={candidate.suggestedCategoryId}
                        suggestedTool={candidate.suggestedTool}
                        suggestionReason={candidate.suggestionReason}
                        canAutoApprove={candidate.canAutoApprove}
                        categories={categories}
                      />
                      <RejectCandidateDialog
                        candidateId={candidate.id}
                        candidateName={candidate.rawName}
                      />
                    </div>
                  ) : (
                    <ResetCandidateDialog
                      candidateId={candidate.id}
                      candidateName={candidate.rawName}
                      currentStatus={candidate.status}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
            {candidates.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No tool candidates found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/admin/benchmark/tool-candidates?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page - 1) }).toString()}`}
                >
                  Previous
                </Link>
              </Button>
            )}
            {page < totalPages && (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/admin/benchmark/tool-candidates?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page + 1) }).toString()}`}
                >
                  Next
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
