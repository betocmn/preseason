import { notFound } from 'next/navigation'
import { api } from '~/trpc/server'
import { CriticForm } from '../../_components/critic-form'

type EditCriticPageProps = {
  params: Promise<{ id: string }>
}

export default async function EditCriticPage({ params }: EditCriticPageProps) {
  const { id } = await params
  const caller = await api()

  const critic = await caller.critic.adminGetById({ id }).catch(() => notFound())

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Critic</h1>
        <p className="text-muted-foreground">Update {critic.user.displayName}.</p>
      </div>
      <CriticForm critic={critic} />
    </div>
  )
}
