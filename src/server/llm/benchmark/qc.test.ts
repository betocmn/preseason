import { describe, expect, it } from 'vitest'
import { DEFAULT_QC_THRESHOLDS, evaluateQc, type QcInput } from './qc'

function healthyInput(): QcInput {
  return {
    totalCases: 100,
    completedCases: 98,
    failedCases: 1,
    invalidOutputCases: 1,
    unresolvedToolDecisions: 1,
    totalToolDecisions: 200,
    distinctModelSnapshots: 5,
    distinctPromptVersions: 10,
  }
}

describe('evaluateQc', () => {
  it('should pass with healthy data', () => {
    const result = evaluateQc(healthyInput())
    expect(result.passed).toBe(true)
    expect(result.checks.every((c) => c.passed)).toBe(true)
  })

  it('should fail when completed case rate is below 95%', () => {
    const input = healthyInput()
    input.completedCases = 90
    const result = evaluateQc(input)
    expect(result.passed).toBe(false)
    expect(result.checks.find((c) => c.name === 'completed_case_rate')?.passed).toBe(false)
  })

  it('should fail when invalid output rate is above 5%', () => {
    const input = healthyInput()
    input.invalidOutputCases = 10
    const result = evaluateQc(input)
    expect(result.passed).toBe(false)
    expect(result.checks.find((c) => c.name === 'invalid_output_rate')?.passed).toBe(false)
  })

  it('should fail when unresolved tool rate is above 2%', () => {
    const input = healthyInput()
    input.unresolvedToolDecisions = 10
    input.totalToolDecisions = 200
    const result = evaluateQc(input)
    expect(result.passed).toBe(false)
    expect(result.checks.find((c) => c.name === 'unresolved_tool_rate')?.passed).toBe(false)
  })

  it('should fail when distinct model snapshots are below threshold', () => {
    const input = healthyInput()
    input.distinctModelSnapshots = 2
    const result = evaluateQc(input)
    expect(result.passed).toBe(false)
    expect(result.checks.find((c) => c.name === 'distinct_model_snapshots')?.passed).toBe(false)
  })

  it('should fail when distinct prompt versions are below threshold', () => {
    const input = healthyInput()
    input.distinctPromptVersions = 3
    const result = evaluateQc(input)
    expect(result.passed).toBe(false)
    expect(result.checks.find((c) => c.name === 'distinct_prompt_versions')?.passed).toBe(false)
  })

  it('should fail all rate checks when totalCases is zero', () => {
    const input: QcInput = {
      totalCases: 0,
      completedCases: 0,
      failedCases: 0,
      invalidOutputCases: 0,
      unresolvedToolDecisions: 0,
      totalToolDecisions: 0,
      distinctModelSnapshots: 0,
      distinctPromptVersions: 0,
    }
    const result = evaluateQc(input)
    expect(result.passed).toBe(false)
    expect(result.checks.find((c) => c.name === 'completed_case_rate')?.passed).toBe(false)
    expect(result.checks.find((c) => c.name === 'invalid_output_rate')?.passed).toBe(false)
  })

  it('should use custom thresholds when provided', () => {
    const input = healthyInput()
    input.completedCases = 90
    const result = evaluateQc(input, { ...DEFAULT_QC_THRESHOLDS, minCompletedRate: 0.8 })
    expect(result.checks.find((c) => c.name === 'completed_case_rate')?.passed).toBe(true)
  })

  it('should include all checks in the result', () => {
    const result = evaluateQc(healthyInput())
    const checkNames = result.checks.map((c) => c.name)
    expect(checkNames).toContain('completed_case_rate')
    expect(checkNames).toContain('invalid_output_rate')
    expect(checkNames).toContain('unresolved_tool_rate')
    expect(checkNames).toContain('distinct_model_snapshots')
    expect(checkNames).toContain('distinct_prompt_versions')
    expect(result.checks).toHaveLength(5)
  })
})
