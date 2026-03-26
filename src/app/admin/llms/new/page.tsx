import { LlmForm } from '../_components/llm-form'

export default function NewLlmPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New LLM</h1>
        <p className="text-muted-foreground">Add a new LLM to Preseason.</p>
      </div>
      <LlmForm />
    </div>
  )
}
