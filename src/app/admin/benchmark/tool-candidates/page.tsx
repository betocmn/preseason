import { Badge } from '~/components/ui/badge'
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

export default async function ToolCandidatesPage() {
  const caller = await api()
  const { items: candidates } = await caller.benchmarkAdmin.listToolCandidates({ limit: 100 })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tool Candidates</h1>
        <p className="text-muted-foreground">Review unrecognized tool names from benchmark runs.</p>
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
                <TableCell className="text-muted-foreground text-sm">
                  {candidate.approvedTool?.name ?? '-'}
                </TableCell>
                <TableCell>
                  {candidate.status === 'pending' && (
                    <div className="flex gap-1">
                      <ApproveCandidateDialog
                        candidateId={candidate.id}
                        candidateName={candidate.rawName}
                      />
                      <RejectCandidateDialog
                        candidateId={candidate.id}
                        candidateName={candidate.rawName}
                      />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {candidates.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No tool candidates found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
