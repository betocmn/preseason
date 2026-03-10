export function buildBenchmarkPrompt(contentMd: string, eligibleCategorySlugs: string[]): string {
  const categoryList = eligibleCategorySlugs.map((s) => `  - ${s}`).join('\n')

  return [
    contentMd,
    '',
    '---',
    '',
    'IMPORTANT: After your natural-language answer, you MUST include a machine-readable appendix.',
    'Wrap it exactly between the XML tags shown below. The JSON must be valid and complete.',
    '',
    'You must provide exactly one entry for each of these categories (no extras, no omissions):',
    categoryList,
    '',
    'For each category, set "decision" to "tool" if you recommend a specific third-party tool,',
    'or "none" if no tool is needed for this use case. When decision is "tool", include the',
    '"tool" field with the tool name. When decision is "none", omit the "tool" field.',
    '',
    '<preseason_benchmark_json>',
    '{',
    '  "schema_version": "benchmark-v1",',
    '  "categories": [',
    '    {',
    '      "category_slug": "<slug>",',
    '      "decision": "tool",',
    '      "tool": "<ToolName>",',
    '      "reasoning": "<1-2 sentences>",',
    '      "confidence": 0.85',
    '    }',
    '  ]',
    '}',
    '</preseason_benchmark_json>',
  ].join('\n')
}
