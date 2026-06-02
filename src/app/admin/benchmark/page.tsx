import { Eye, Plus } from 'lucide-react'
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

function statusVariant(status: string) {
  switch (status) {
    case 'active':
      return 'default' as const
    case 'completed':
      return 'secondary' as const
    default:
      return 'outline' as const
  }
}

export default async function BenchmarkSeasonsPage() {
  const caller = await api()
  const seasons = await caller.benchmarkAdmin.listSeasons()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Benchmark Seasons</h1>
          <p className="text-muted-foreground">Manage benchmark seasons and their panels.</p>
        </div>
        <Button asChild>
          <Link href="/admin/benchmark/new">
            <Plus className="mr-2 h-4 w-4" />
            New Season
          </Link>
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Prompts</TableHead>
              <TableHead>Models</TableHead>
              <TableHead>Runs</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {seasons.map((season) => (
              <TableRow key={season.id}>
                <TableCell className="font-medium">{season.name}</TableCell>
                <TableCell className="text-muted-foreground">{season.slug}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(season.status)}>{season.status}</Badge>
                </TableCell>
                <TableCell>{season.promptCount}</TableCell>
                <TableCell>{season.modelCount}</TableCell>
                <TableCell>{season.runCount}</TableCell>
                <TableCell>
                  <Button asChild variant="ghost" size="icon" title="View">
                    <Link href={`/admin/benchmark/seasons/${season.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {seasons.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No seasons found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex gap-3">
        <Button asChild variant="outline">
          <Link href="/admin/benchmark/tool-candidates">Tool Candidates</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/benchmark/weight-configs">Weight Configs</Link>
        </Button>
      </div>
    </div>
  )
}
