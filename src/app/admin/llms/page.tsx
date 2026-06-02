import { Pencil, Plus } from 'lucide-react'
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
import { DeleteLlmButton } from './_components/delete-llm-button'
import { ToggleLlmActiveButton } from './_components/toggle-llm-active-button'

export default async function LlmsPage() {
  const caller = await api()
  const llms = await caller.llm.list()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">LLMs</h1>
          <p className="text-muted-foreground">Manage LLMs used in benchmark seasons.</p>
        </div>
        <Button asChild>
          <Link href="/admin/llms/new">
            <Plus className="mr-2 h-4 w-4" />
            New LLM
          </Link>
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {llms.map((llm) => (
              <TableRow key={llm.id}>
                <TableCell className="font-medium">{llm.name}</TableCell>
                <TableCell className="text-muted-foreground">{llm.slug}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{llm.provider}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {llm.modelId}
                </TableCell>
                <TableCell>
                  {llm.isActive ? (
                    <Badge variant="default">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {llm.isUsed ? (
                    <Badge variant="secondary">Used</Badge>
                  ) : (
                    <Badge variant="outline">Unused</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <ToggleLlmActiveButton llmId={llm.id} isActive={llm.isActive} />
                    <Button asChild variant="ghost" size="icon" title="Edit">
                      <Link href={`/admin/llms/${llm.id}/edit`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <DeleteLlmButton llmId={llm.id} llmName={llm.name} isUsed={llm.isUsed} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {llms.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No LLMs found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
