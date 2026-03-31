import { z } from 'zod'

const benchmarkCategoryDecisionSchema = z
  .object({
    category_slug: z.string().min(1),
    decision: z.enum(['tool', 'none']),
    tool: z.string().min(1).optional().nullable(),
    reasoning: z.string().min(1),
    confidence: z
      .number()
      .nullable()
      .optional()
      .transform((value) => {
        if (value == null) return null
        return value >= 0 && value <= 1 ? value : null
      }),
  })
  .refine(
    (d) => {
      if (d.decision === 'tool') return d.tool != null && d.tool.length > 0
      return true
    },
    { message: 'tool is required when decision is "tool"', path: ['tool'] },
  )
  .refine(
    (d) => {
      if (d.decision === 'none') return d.tool == null || d.tool === undefined
      return true
    },
    { message: 'tool must be omitted when decision is "none"', path: ['tool'] },
  )

export const benchmarkAppendixSchema = z.object({
  schema_version: z.literal('benchmark-v1'),
  categories: z.array(benchmarkCategoryDecisionSchema).min(1),
})

export type BenchmarkAppendix = z.infer<typeof benchmarkAppendixSchema>
export type BenchmarkCategoryDecision = BenchmarkAppendix['categories'][number]

export function validateBenchmarkAppendix(
  data: unknown,
  eligibleCategorySlugs: string[],
): { success: true; data: BenchmarkAppendix } | { success: false; error: string } {
  const parsed = benchmarkAppendixSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join('; ') }
  }

  const responseSlugCounts = new Map<string, number>()
  for (const category of parsed.data.categories) {
    responseSlugCounts.set(
      category.category_slug,
      (responseSlugCounts.get(category.category_slug) ?? 0) + 1,
    )
  }

  const duplicate = [...responseSlugCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([slug]) => slug)
  if (duplicate.length > 0) {
    return {
      success: false,
      error: `Duplicate categories in appendix: ${duplicate.join(', ')}`,
    }
  }

  const responseSlugs = new Set(responseSlugCounts.keys())
  const eligibleSet = new Set(eligibleCategorySlugs)

  const missing = eligibleCategorySlugs.filter((s) => !responseSlugs.has(s))
  if (missing.length > 0) {
    return { success: false, error: `Missing eligible categories: ${missing.join(', ')}` }
  }

  const extra = parsed.data.categories
    .map((c) => c.category_slug)
    .filter((s) => !eligibleSet.has(s))
  if (extra.length > 0) {
    return { success: false, error: `Extra categories not in eligible set: ${extra.join(', ')}` }
  }

  return { success: true, data: parsed.data }
}
