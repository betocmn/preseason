import { CriticForm } from '../_components/critic-form'

export default function NewCriticPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Critic</h1>
        <p className="text-muted-foreground">Add a new critic to Preseason.</p>
      </div>
      <CriticForm />
    </div>
  )
}
