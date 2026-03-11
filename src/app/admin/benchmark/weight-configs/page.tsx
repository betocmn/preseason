import { Badge } from '~/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { api } from '~/trpc/server'
import { ActivateWeightButton } from '../_components/activate-weight-button'
import { WeightConfigForm } from '../_components/weight-config-form'

export default async function WeightConfigsPage() {
  const caller = await api()
  const configs = await caller.benchmarkAdmin.listWeightConfigs()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Model Weight Configs</h1>
        <p className="text-muted-foreground">
          Manage model tier weights used for benchmark scoring.
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Frontier</TableHead>
              <TableHead>Mid</TableHead>
              <TableHead>Small</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.map((config) => (
              <TableRow key={config.id}>
                <TableCell className="font-medium">{config.name}</TableCell>
                <TableCell className="text-muted-foreground">{config.slug}</TableCell>
                <TableCell>{config.frontierWeight}</TableCell>
                <TableCell>{config.midWeight}</TableCell>
                <TableCell>{config.smallWeight}</TableCell>
                <TableCell>
                  {config.isActive ? (
                    <Badge variant="default">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!config.isActive && <ActivateWeightButton configId={config.id} />}
                </TableCell>
              </TableRow>
            ))}
            {configs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No weight configs found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Create New Config</h2>
        <WeightConfigForm />
      </section>
    </div>
  )
}
