import { Pencil, Plus } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
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
import { DeleteToolButton } from './_components/delete-tool-button'

export default async function ToolsPage() {
  const caller = await api()
  const { items: tools } = await caller.tool.list({ limit: 100 })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tools</h1>
          <p className="text-muted-foreground">Manage tools tracked by Preseason.</p>
        </div>
        <Button asChild>
          <Link href="/beto-admin/tools/new">
            <Plus className="mr-2 h-4 w-4" />
            New Tool
          </Link>
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Sub-categories</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tools.map((tool) => (
              <TableRow key={tool.id}>
                <TableCell>
                  <Avatar className="h-8 w-8">
                    {tool.logoUrl && (
                      <Image
                        src={tool.logoUrl}
                        alt={tool.name}
                        width={32}
                        height={32}
                        className="object-contain"
                      />
                    )}
                    <AvatarFallback className="text-[10px]">
                      {tool.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </TableCell>
                <TableCell className="font-medium">{tool.name}</TableCell>
                <TableCell className="text-muted-foreground">{tool.slug}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {tool.toolCategories.map((tc) => (
                      <Badge key={tc.category.id} variant="secondary" className="text-xs">
                        {tc.category.categoryGroup?.name
                          ? `${tc.category.categoryGroup.name} > `
                          : ''}
                        {tc.category.name}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {tool.isVerified ? (
                    <Badge variant="default">Verified</Badge>
                  ) : (
                    <Badge variant="outline">No</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="icon" title="Edit">
                      <Link href={`/beto-admin/tools/${tool.id}/edit`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <DeleteToolButton toolId={tool.id} toolName={tool.name} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {tools.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No tools found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
