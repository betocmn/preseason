import { notFound } from 'next/navigation'
import { api } from '~/trpc/server'
import { LlmForm } from '../../_components/llm-form'

type EditLlmPageProps = {
  params: Promise<{ id: string }>
}

export default async function EditLlmPage({ params }: EditLlmPageProps) {
  const { id } = await params
  const caller = await api()

  const llm = await caller.llm.getById({ id }).catch(() => notFound())

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit LLM</h1>
        <p className="text-muted-foreground">Update {llm.name}.</p>
      </div>
      <LlmForm llm={llm} />
    </div>
  )
}
