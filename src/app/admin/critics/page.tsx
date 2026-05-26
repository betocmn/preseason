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
import { DeleteCriticButton } from './_components/delete-critic-button'

function isLocalAvatarPath(value: string) {
  return value.startsWith('/')
}

export default async function CriticsPage() {
  const caller = await api()
  const critics = await caller.critic.adminList()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Critics</h1>
          <p className="text-muted-foreground">Manage critics on Preseason.</p>
        </div>
        <Button asChild>
          <Link href="/admin/critics/new">
            <Plus className="mr-2 h-4 w-4" />
            New Critic
          </Link>
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead>Name</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {critics.map((critic) => (
              <TableRow key={critic.id}>
                <TableCell>
                  <Avatar className="h-8 w-8">
                    {critic.user.avatarUrl && isLocalAvatarPath(critic.user.avatarUrl) && (
                      <Image
                        src={critic.user.avatarUrl}
                        alt={critic.user.displayName}
                        width={32}
                        height={32}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="text-[10px]">
                      {critic.user.displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </TableCell>
                <TableCell className="font-medium">{critic.user.displayName}</TableCell>
                <TableCell className="text-muted-foreground">{critic.title ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {critic.user.company ?? '—'}
                </TableCell>
                <TableCell>
                  {critic.verifiedAt ? (
                    <Badge variant="default">Verified</Badge>
                  ) : (
                    <Badge variant="outline">No</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {critic.isActive ? (
                    <Badge variant="default">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="icon" title="Edit">
                      <Link href={`/admin/critics/${critic.id}/edit`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <DeleteCriticButton criticId={critic.id} criticName={critic.user.displayName} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {critics.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No critics found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
