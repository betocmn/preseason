import type postgres from 'postgres'

type DefaultMatchPromptTemplate = {
  slug: string
  name: string
  templateMd: string
  schemaVersion: string
  systemPromptSnapshot: string
  isActive: boolean
}

export const DEFAULT_MATCH_PROMPT_TEMPLATES: DefaultMatchPromptTemplate[] = [
  {
    slug: 'balanced-comparison-v1',
    name: 'Balanced Comparison',
    templateMd: `
You are an expert software engineer evaluating developer tools.

Compare **{{TOOL_A}}** and **{{TOOL_B}}** as options in the **{{CATEGORY}}** category for building modern web applications.

Consider the following dimensions:
- **Developer experience** - onboarding, documentation quality, API ergonomics
- **Feature completeness** - does it cover the common needs in this category?
- **Ecosystem and integrations** - how well does it play with popular stacks?
- **Scalability and performance** - can it grow with a project from prototype to production?
- **Pricing and vendor risk** - cost at different scales, lock-in concerns, open-source status

Be specific and cite concrete features, limitations, or trade-offs rather than making vague claims. If one tool is clearly stronger, say so - do not force a tie.

Provide your comparison as a natural-language analysis, then include the structured appendix as instructed below.
`.trim(),
    schemaVersion: 'match-v2',
    systemPromptSnapshot: `
You are a senior software engineer with deep experience across multiple tech stacks. You give honest, balanced assessments of developer tools based on real-world usage. You never favor a tool just because it is more popular - you evaluate based on technical merit, developer experience, and practical trade-offs.
`.trim(),
    isActive: true,
  },
  {
    slug: 'scenario-driven-v1',
    name: 'Scenario-Driven Comparison',
    templateMd: `
You are a tech lead helping a team choose between two tools.

A development team is building a new SaaS product and needs to pick a tool in the **{{CATEGORY}}** category. They have narrowed it down to **{{TOOL_A}}** and **{{TOOL_B}}**.

Evaluate both options by walking through these real-world scenarios:

1. **Day 1 setup** - A junior developer needs to get a working prototype running. Which tool gets them there faster and with fewer gotchas?
2. **Month 3 complexity** - The app has grown to handle multiple user roles, background jobs, and third-party integrations. Which tool handles this complexity better?
3. **Year 1 scale** - The product has paying customers and the team has grown to 5 engineers. Which tool causes fewer scaling headaches?

For each scenario, explain which tool has the edge and why. Then give your overall recommendation.

Provide your comparison as a natural-language analysis, then include the structured appendix as instructed below.
`.trim(),
    schemaVersion: 'match-v2',
    systemPromptSnapshot: `
You are a pragmatic tech lead who has shipped production software with many different tools. You focus on what actually matters in practice - not marketing claims or theoretical advantages. You are comfortable recommending one tool over another when the evidence supports it.
`.trim(),
    isActive: false,
  },
  {
    slug: 'devils-advocate-v1',
    name: "Devil's Advocate Comparison",
    templateMd: `
You are a critical software reviewer known for finding the weaknesses in popular tools.

Analyze **{{TOOL_A}}** and **{{TOOL_B}}** in the **{{CATEGORY}}** category. For each tool, play devil's advocate:

- Start with the **strongest case against** each tool - what are the real pain points, footguns, or deal-breakers that fans of the tool tend to downplay?
- Then present the **strongest case for** each tool - what genuine advantages does it have that even critics must acknowledge?
- Finally, give your honest verdict: if you had to pick one today for a new web application project, which would you choose and why?

Do not be diplomatic for diplomacy's sake. If one tool is significantly better for most use cases, say so directly. Back up every claim with specific technical details.

Provide your comparison as a natural-language analysis, then include the structured appendix as instructed below.
`.trim(),
    schemaVersion: 'match-v2',
    systemPromptSnapshot: `
You are a brutally honest software critic. You have no brand loyalty and no patience for hype. You judge tools by their actual behavior in production, not by their landing pages. When something is bad, you say it plainly. When something is good, you give credit where it is due.
`.trim(),
    isActive: false,
  },
]

export async function ensureDefaultMatchPromptTemplates(sql: postgres.Sql): Promise<void> {
  const activeTemplateRows = await sql<{ hasActive: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM public.preseason_match_prompt_template
      WHERE is_active = true
    ) AS "hasActive"
  `

  let hasActiveTemplate = Boolean(activeTemplateRows[0]?.hasActive)

  for (const template of DEFAULT_MATCH_PROMPT_TEMPLATES) {
    const shouldActivateTemplate = template.isActive && !hasActiveTemplate

    const seededRows = await sql<{ id: string; isActive: boolean }[]>`
      INSERT INTO public.preseason_match_prompt_template (
        slug,
        name,
        template_md,
        schema_version,
        system_prompt_snapshot,
        is_active,
        "createdAt"
      )
      VALUES (
        ${template.slug},
        ${template.name},
        ${template.templateMd},
        ${template.schemaVersion},
        ${template.systemPromptSnapshot},
        ${shouldActivateTemplate},
        now()
      )
      ON CONFLICT (slug) DO UPDATE
      SET is_active = public.preseason_match_prompt_template.is_active OR EXCLUDED.is_active
      RETURNING id, is_active AS "isActive"
    `

    if (seededRows[0]?.isActive) {
      hasActiveTemplate = true
    }
  }
}
