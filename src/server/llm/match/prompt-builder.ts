export type MatchPromptContext = {
  templateMd: string
  toolAName: string
  toolBName: string
  categoryName: string
}

export function buildMatchPrompt(ctx: MatchPromptContext): string {
  const content = ctx.templateMd
    .replace(/\{\{TOOL_A\}\}/g, ctx.toolAName)
    .replace(/\{\{TOOL_B\}\}/g, ctx.toolBName)
    .replace(/\{\{CATEGORY\}\}/g, ctx.categoryName)

  return [
    content,
    '',
    '---',
    '',
    'IMPORTANT: After your natural-language answer, you MUST include a machine-readable appendix.',
    'Wrap it exactly between the XML tags shown below. The JSON must be valid and complete.',
    '',
    'In the JSON, "tool_a" refers to the FIRST tool mentioned and "tool_b" refers to the SECOND tool.',
    'For each tool, list up to 8 pros and 8 cons with short phrases and evidence sentences.',
    '',
    '<preseason_match_json>',
    '{',
    '  "schema_version": "match-v2",',
    '  "winner": "tool_a",',
    '  "comparison_summary": "<2-4 sentences>",',
    '  "tool_a": {',
    '    "pros": [{ "phrase": "<short phrase>", "evidence_sentence": "<sentence>" }],',
    '    "cons": [{ "phrase": "<short phrase>", "evidence_sentence": "<sentence>" }]',
    '  },',
    '  "tool_b": {',
    '    "pros": [{ "phrase": "<short phrase>", "evidence_sentence": "<sentence>" }],',
    '    "cons": [{ "phrase": "<short phrase>", "evidence_sentence": "<sentence>" }]',
    '  },',
    '  "confidence": 0.85',
    '}',
    '</preseason_match_json>',
  ].join('\n')
}
