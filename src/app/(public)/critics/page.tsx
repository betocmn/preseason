import { Users } from 'lucide-react'
import type { Metadata } from 'next'
import { EmptyState } from '~/components/public/empty-state'
import { SidebarLayout } from '~/components/public/sidebar-layout'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Critics | Preseason',
  description: 'Verified critics who provide expert commentary on tool recommendations.',
}

export default async function CriticsPage() {
  const caller = await api()
  const [critics, groups] = await Promise.all([
    caller.critic.list(),
    caller.category.listGroups(),
  ])

  return (
    <SidebarLayout groups={groups} section="critics">
      <h1 className="mb-6 text-xl font-bold tracking-tight">Verified Critics</h1>

      {critics.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {critics.map((critic) => (
            <Card key={critic.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    {critic.user.avatarUrl && (
                      <AvatarImage src={critic.user.avatarUrl} alt={critic.user.displayName} />
                    )}
                    <AvatarFallback>
                      {critic.user.displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium">{critic.user.displayName}</h3>
                    {critic.title && (
                      <p className="text-sm text-muted-foreground">{critic.title}</p>
                    )}
                    {critic.user.company && (
                      <p className="text-xs text-muted-foreground">{critic.user.company}</p>
                    )}
                    {critic.expertiseAreas && critic.expertiseAreas.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {critic.expertiseAreas.slice(0, 3).map((area) => (
                          <Badge key={area} variant="secondary" className="text-xs">
                            {area}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="No verified critics yet"
          description="Verified critics provide expert commentary on tool recommendations."
        />
      )}
    </SidebarLayout>
  )
}
