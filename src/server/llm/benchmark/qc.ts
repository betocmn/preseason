export type QcInput = {
  totalCases: number
  completedCases: number
  failedCases: number
  invalidOutputCases: number
  unresolvedToolDecisions: number
  totalToolDecisions: number
  distinctModelSnapshots: number
  distinctPromptVersions: number
}

export type QcThresholds = {
  minCompletedRate: number
  maxInvalidOutputRate: number
  maxUnresolvedToolRate: number
  minDistinctModels: number
  minDistinctPrompts: number
}

export type QcCheck = {
  name: string
  passed: boolean
  actual: number
  threshold: number
}

export type QcCheckResult = {
  passed: boolean
  checks: QcCheck[]
}

export const DEFAULT_QC_THRESHOLDS: QcThresholds = {
  minCompletedRate: 0.95,
  maxInvalidOutputRate: 0.05,
  maxUnresolvedToolRate: 0.02,
  minDistinctModels: 3,
  minDistinctPrompts: 5,
}

export function evaluateQc(
  input: QcInput,
  thresholds: QcThresholds = DEFAULT_QC_THRESHOLDS,
): QcCheckResult {
  const completedRate = input.totalCases > 0 ? input.completedCases / input.totalCases : 0
  const invalidOutputRate = input.totalCases > 0 ? input.invalidOutputCases / input.totalCases : 1
  const unresolvedToolRate =
    input.totalToolDecisions > 0 ? input.unresolvedToolDecisions / input.totalToolDecisions : 0

  const checks: QcCheck[] = [
    {
      name: 'completed_case_rate',
      passed: completedRate >= thresholds.minCompletedRate,
      actual: completedRate,
      threshold: thresholds.minCompletedRate,
    },
    {
      name: 'invalid_output_rate',
      passed: invalidOutputRate <= thresholds.maxInvalidOutputRate,
      actual: invalidOutputRate,
      threshold: thresholds.maxInvalidOutputRate,
    },
    {
      name: 'unresolved_tool_rate',
      passed: unresolvedToolRate <= thresholds.maxUnresolvedToolRate,
      actual: unresolvedToolRate,
      threshold: thresholds.maxUnresolvedToolRate,
    },
    {
      name: 'distinct_model_snapshots',
      passed: input.distinctModelSnapshots >= thresholds.minDistinctModels,
      actual: input.distinctModelSnapshots,
      threshold: thresholds.minDistinctModels,
    },
    {
      name: 'distinct_prompt_versions',
      passed: input.distinctPromptVersions >= thresholds.minDistinctPrompts,
      actual: input.distinctPromptVersions,
      threshold: thresholds.minDistinctPrompts,
    },
  ]

  return {
    passed: checks.every((c) => c.passed),
    checks,
  }
}
