import { z } from 'zod'

const evidenceItemSchema = z.object({
  phrase: z.string().min(1).max(100),
  evidence_sentence: z.string().min(1).max(280),
})

const toolAnalysisSchema = z.object({
  pros: z.array(evidenceItemSchema).max(8),
  cons: z.array(evidenceItemSchema).max(8),
})

export const matchResponseSchema = z.object({
  schema_version: z.literal('match-v2'),
  winner: z.enum(['tool_a', 'tool_b', 'tie', 'abstain']),
  comparison_summary: z.string().min(1),
  tool_a: toolAnalysisSchema,
  tool_b: toolAnalysisSchema,
  confidence: z.number().min(0).max(1),
})

export type MatchResponse = z.infer<typeof matchResponseSchema>

export function validateMatchResponse(
  data: unknown,
): { success: true; data: MatchResponse } | { success: false; error: string } {
  const parsed = matchResponseSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join('; ') }
  }
  return { success: true, data: parsed.data }
}
