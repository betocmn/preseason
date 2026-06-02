import { PercentageBar } from '~/components/public/percentage-bar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'

type ByLlmEntry = {
  llm: { id: string; name: string; slug: string }
  toolA: number
  toolB: number
  total: number
  toolAPct: number
  toolBPct: number
}

type ByPromptEntry = {
  prompt: { id: string; title: string; slug: string }
  toolA: number
  toolB: number
  total: number
  toolAPct: number
  toolBPct: number
}

type MatchBreakdownProps = {
  toolAName: string
  toolBName: string
  byLlm: ByLlmEntry[]
  byPrompt: ByPromptEntry[]
}

export function MatchBreakdown({ toolAName, toolBName, byLlm, byPrompt }: MatchBreakdownProps) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-3 text-sm font-medium">By LLM</h3>
        {byLlm.length === 0 ? (
          <p className="text-sm text-muted-foreground">No LLM breakdown data available.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>LLM</TableHead>
                  <TableHead>Split</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byLlm.map((entry) => (
                  <TableRow key={entry.llm.id}>
                    <TableCell className="font-medium">{entry.llm.name}</TableCell>
                    <TableCell className="w-1/2">
                      <PercentageBar
                        valueA={entry.toolA}
                        valueB={entry.toolB}
                        labelA={toolAName}
                        labelB={toolBName}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="text-right">{entry.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium">By Prompt</h3>
        {byPrompt.length === 0 ? (
          <p className="text-sm text-muted-foreground">No prompt breakdown data available.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prompt</TableHead>
                  <TableHead>Split</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byPrompt.map((entry) => (
                  <TableRow key={entry.prompt.id}>
                    <TableCell className="max-w-[200px] truncate font-medium">
                      {entry.prompt.title}
                    </TableCell>
                    <TableCell className="w-1/2">
                      <PercentageBar
                        valueA={entry.toolA}
                        valueB={entry.toolB}
                        labelA={toolAName}
                        labelB={toolBName}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="text-right">{entry.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
