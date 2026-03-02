import { Plus } from 'lucide-react'
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
import { SettleMatchButton } from './_components/settle-match-button'

function formatDate(date: string | Date | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const statusVariant = {
  active: 'default',
  settled: 'secondary',
  archived: 'outline',
} as const

export default async function MatchesPage() {
  const caller = await api()
  const { items: matches } = await caller.match.listAll({ limit: 100 })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Matches</h1>
          <p className="text-muted-foreground">View and schedule tool matches.</p>
        </div>
        <Button asChild>
          <Link href="/beto-admin/matches/new">
            <Plus className="mr-2 h-4 w-4" />
            New Match
          </Link>
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Match</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Score</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.map((match) => (
              <TableRow key={match.id}>
                <TableCell className="font-medium">
                  {match.toolA.name} vs {match.toolB.name}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{match.category.name}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[match.status]}>{match.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(match.periodStart)}
                  {match.periodEnd ? ` — ${formatDate(match.periodEnd)}` : ''}
                </TableCell>
                <TableCell>
                  {match.status === 'settled' ? (
                    <span className="text-sm">
                      {match.toolAScore} – {match.toolBScore}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {match.status === 'active' && <SettleMatchButton matchId={match.id} />}
                </TableCell>
              </TableRow>
            ))}
            {matches.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No matches found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
