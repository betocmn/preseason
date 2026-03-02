import { notFound } from 'next/navigation'
import { api } from '~/trpc/server'
import { ToolForm } from '../../_components/tool-form'

type EditToolPageProps = {
  params: Promise<{ id: string }>
}

export default async function EditToolPage({ params }: EditToolPageProps) {
  const { id } = await params
  const caller = await api()

  let tool
  try {
    tool = await caller.tool.getById({ id })
  } catch {
    notFound()
  }

  const categories = await caller.category.list({})

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Tool</h1>
        <p className="text-muted-foreground">Update {tool.name}.</p>
      </div>
      <ToolForm tool={tool} categories={categories} />
    </div>
  )
}
