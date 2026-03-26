import { notFound } from 'next/navigation'
import { api } from '~/trpc/server'
import { PromptForm } from '../../_components/prompt-form'

type EditPromptPageProps = {
  params: Promise<{ id: string }>
}

export default async function EditPromptPage({ params }: EditPromptPageProps) {
  const { id } = await params
  const caller = await api()

  const prompt = await caller.prompt.getById({ id }).catch(() => notFound())

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Prompt</h1>
        <p className="text-muted-foreground">Update {prompt.title}.</p>
      </div>
      <PromptForm prompt={prompt} />
    </div>
  )
}
