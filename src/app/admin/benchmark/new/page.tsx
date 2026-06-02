import { api } from '~/trpc/server'
import { SeasonForm } from '../_components/season-form'

export default async function NewSeasonPage() {
  const caller = await api()
  const protocols = await caller.benchmarkAdmin.listProtocols()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Season</h1>
        <p className="text-muted-foreground">Create a new benchmark season.</p>
      </div>
      <SeasonForm protocols={protocols} />
    </div>
  )
}
