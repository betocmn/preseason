import { Calendar, Mail, Shield, User } from 'lucide-react'

type ProfileViewProps = {
  firstName: string
  lastName: string
  email: string
  birthDate: string
  role: string
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export function ProfileView({ firstName, lastName, email, birthDate, role }: ProfileViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <User className="h-7 w-7 text-primary" />
        </div>
        <div>
          <p className="text-lg font-semibold">
            {firstName} {lastName}
          </p>
          <p className="text-sm text-muted-foreground">{formatRole(role)}</p>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-3 text-sm">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span>{email}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span>{formatDate(birthDate)}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span>{formatRole(role)}</span>
        </div>
      </div>
    </div>
  )
}
