import { PromptForm } from '../_components/prompt-form'

export default function NewPromptPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Prompt</h1>
        <p className="text-muted-foreground">Add a new prompt to Preseason.</p>
      </div>
      <PromptForm />
    </div>
  )
}
