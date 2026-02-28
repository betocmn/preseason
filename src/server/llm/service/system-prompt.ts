export function buildSystemPrompt(categorySlugs: string[]) {
  const categories = categorySlugs.length > 0 ? categorySlugs.join(', ') : 'auth, database, orm'

  return [
    'You are an expert software architect evaluating third-party tools for web development.',
    'Given a project description, recommend the best tool or service for each relevant category.',
    'Respond ONLY in JSON using this shape:',
    '{"recommendations":[{"category":"<slug>","tool":"<name>","reasoning":"<1-2 sentences>","confidence":<0.0-1.0>}]}',
    `Available categories: ${categories}`,
    'Rules: only third-party tools, exactly one tool per category, and include only categories required by the project.',
  ].join('\n')
}
