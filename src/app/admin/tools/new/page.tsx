import { api } from '~/trpc/server'
import { ToolForm } from '../_components/tool-form'

export default async function NewToolPage() {
  const caller = await api()
  const subcategories = await caller.category.list({})

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Tool</h1>
        <p className="text-muted-foreground">Add a new tool to Preseason.</p>
      </div>
      <ToolForm subcategories={subcategories} />
    </div>
  )
}
