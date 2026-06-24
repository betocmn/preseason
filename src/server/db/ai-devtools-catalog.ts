export type AiDevtoolsSubcategory = {
  name: string
  slug: string
  icon: string
  displayOrder: number
  description: string
}

export type AiDevtoolsTool = {
  name: string
  slug: string
  website: string
  description: string
  aliases?: string[]
  logoUrl?: string
}

export type AiDevtoolsToolCategoryAssignment = {
  toolSlug: string
  categorySlug: string
  isPrimary: boolean
}

export type AiDevtoolsPlannedMatchup = {
  categorySlug: string
  toolASlug: string
  toolBSlug: string
}

export const AI_DEVTOOLS_SUBCATEGORIES: AiDevtoolsSubcategory[] = [
  {
    // Slug stays `llm-coding-agents` so existing rankings, prompts, and URLs keep working.
    name: 'Agentic IDE / ADEs',
    slug: 'llm-coding-agents',
    icon: 'panels-top-left',
    displayOrder: 22,
    description:
      'Agentic IDEs and development environments — coding agents and multi-agent orchestration',
  },
  {
    name: 'LLM Observability',
    slug: 'llm-observability',
    icon: 'eye',
    displayOrder: 23,
    description: 'Tracing, monitoring, and observability platforms for LLM applications',
  },
  {
    name: 'LLM Evals',
    slug: 'llm-evals',
    icon: 'flask-conical',
    displayOrder: 24,
    description: 'Evaluation frameworks and platforms for LLM quality, regressions, and testing',
  },
]

export const AI_DEVTOOLS_TOOLS: AiDevtoolsTool[] = [
  {
    name: 'Claude Code',
    slug: 'claude-code',
    website: 'https://code.claude.com/docs/en/overview',
    description: 'Anthropic coding agent for terminal-first software development tasks',
    logoUrl: '/logos/claude-code.png',
    aliases: ['ClaudeCode'],
  },
  {
    name: 'Codex CLI',
    slug: 'codex-cli',
    website: 'https://openai.com/codex/get-started/',
    description: 'OpenAI coding agent and CLI for software engineering workflows',
    logoUrl: '/logos/codex-cli.png',
    aliases: ['Codex CLI', 'OpenAI Codex CLI'],
  },
  {
    name: 'Cursor',
    slug: 'cursor',
    website: 'https://cursor.com',
    description: 'AI-native code editor with agentic coding and repo-aware assistance',
    logoUrl: '/logos/cursor.png',
  },
  {
    name: 'Windsurf',
    slug: 'windsurf',
    website: 'https://windsurf.com',
    description: 'AI coding environment from Codeium with editor and agent workflows',
    logoUrl: '/logos/windsurf.png',
    aliases: ['Codeium Windsurf'],
  },
  {
    name: 'Cline',
    slug: 'cline',
    website: 'https://cline.bot',
    description: 'Open source coding agent for editor-based autonomous development tasks',
    logoUrl: '/logos/cline.png',
  },
  {
    name: 'Roo Code',
    slug: 'roo-code',
    website: 'https://roocode.com',
    description: 'Open source coding agent focused on structured multi-step code changes',
    logoUrl: '/logos/roo-code.png',
    aliases: ['RooCode'],
  },
  {
    name: 'Aider',
    slug: 'aider',
    website: 'https://aider.chat',
    description: 'Terminal pair programming tool that edits local repositories with LLMs',
    logoUrl: '/logos/aider.png',
  },
  {
    name: 'OpenHands',
    slug: 'openhands',
    website: 'https://openhands.dev',
    description: 'Open source software engineering agent for codebase tasks and issue resolution',
    logoUrl: '/logos/openhands.png',
    aliases: ['Open Hands'],
  },
  {
    name: 'OpenCode',
    slug: 'opencode',
    website: 'https://opencode.ai',
    description: 'Open source AI coding agent that works in the terminal, IDE, and desktop',
    logoUrl: '/logos/opencode.png',
    aliases: ['Open Code', 'open-code'],
  },
  {
    name: 'Amp Code',
    slug: 'amp-code',
    website: 'https://ampcode.com',
    description: 'Frontier coding agent for terminal and editor-based development workflows',
    logoUrl: '/logos/amp-code.png',
    aliases: ['AmpCode'],
  },
  {
    name: 'Langfuse',
    slug: 'langfuse',
    website: 'https://langfuse.com',
    description: 'Open source LLM engineering platform for tracing, prompts, and metrics',
    logoUrl: '/logos/langfuse.png',
  },
  {
    name: 'LangSmith',
    slug: 'langsmith',
    website: 'https://www.langchain.com/langsmith/observability',
    description: 'LLM application platform for observability, testing, and evaluation workflows',
    logoUrl: '/logos/langsmith.png',
  },
  {
    name: 'Helicone',
    slug: 'helicone',
    website: 'https://www.helicone.ai',
    description: 'Open source observability layer for LLM requests, costs, and performance',
    logoUrl: '/logos/helicone.png',
  },
  {
    name: 'Braintrust',
    slug: 'braintrust',
    website: 'https://www.braintrust.dev',
    description: 'Platform for LLM observability, evaluations, and production quality loops',
    logoUrl: '/logos/braintrust.png',
  },
  {
    name: 'Arize Phoenix',
    slug: 'arize-phoenix',
    website: 'https://phoenix.arize.com',
    description: 'Open source observability and evaluation tooling for LLM and agent systems',
    logoUrl: '/logos/arize-phoenix.png',
    aliases: ['Phoenix Arize'],
  },
  {
    name: 'LangWatch',
    slug: 'langwatch',
    website: 'https://langwatch.ai',
    description: 'Observability and guardrails platform for LLM apps and agents',
    logoUrl: '/logos/langwatch.png',
  },
  {
    name: 'OpenLIT',
    slug: 'openlit',
    website: 'https://openlit.io',
    description: 'OpenTelemetry-native observability for LLMs, vector databases, and agents',
    logoUrl: '/logos/openlit.png',
  },
  {
    name: 'Promptfoo',
    slug: 'promptfoo',
    website: 'https://www.promptfoo.dev',
    description: 'LLM evals and red-team framework for prompt, model, and system testing',
    logoUrl: '/logos/promptfoo.png',
  },
  {
    name: 'Ragas',
    slug: 'ragas',
    website: 'https://docs.ragas.io/en/stable/',
    description: 'Framework for evaluating retrieval-augmented generation and agent quality',
    logoUrl: '/logos/ragas.png',
  },
  {
    name: 'DeepEval',
    slug: 'deepeval',
    website: 'https://www.confident-ai.com',
    description: 'Open source LLM evaluation framework for unit, regression, and agent tests',
    logoUrl: '/logos/deepeval.png',
  },
  {
    name: 'Patronus AI',
    slug: 'patronus-ai',
    website: 'https://www.patronus.ai',
    description: 'AI evaluation and reliability platform for detecting LLM failures in production',
    logoUrl: '/logos/patronus-ai.png',
  },
]

export const AI_DEVTOOLS_TOOL_CATEGORY_ASSIGNMENTS: AiDevtoolsToolCategoryAssignment[] = [
  { toolSlug: 'claude-code', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'codex-cli', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'cursor', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'windsurf', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'cline', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'roo-code', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'aider', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'openhands', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'opencode', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'amp-code', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'langfuse', categorySlug: 'llm-observability', isPrimary: true },
  { toolSlug: 'langsmith', categorySlug: 'llm-observability', isPrimary: true },
  { toolSlug: 'helicone', categorySlug: 'llm-observability', isPrimary: true },
  { toolSlug: 'braintrust', categorySlug: 'llm-observability', isPrimary: true },
  { toolSlug: 'arize-phoenix', categorySlug: 'llm-observability', isPrimary: true },
  { toolSlug: 'langwatch', categorySlug: 'llm-observability', isPrimary: true },
  { toolSlug: 'openlit', categorySlug: 'llm-observability', isPrimary: true },
  { toolSlug: 'promptfoo', categorySlug: 'llm-evals', isPrimary: true },
  { toolSlug: 'braintrust', categorySlug: 'llm-evals', isPrimary: false },
  { toolSlug: 'langsmith', categorySlug: 'llm-evals', isPrimary: false },
  { toolSlug: 'ragas', categorySlug: 'llm-evals', isPrimary: true },
  { toolSlug: 'deepeval', categorySlug: 'llm-evals', isPrimary: true },
  { toolSlug: 'patronus-ai', categorySlug: 'llm-evals', isPrimary: true },
  { toolSlug: 'arize-phoenix', categorySlug: 'llm-evals', isPrimary: false },
]

export const AI_DEVTOOLS_MATCHUPS: AiDevtoolsPlannedMatchup[] = [
  {
    categorySlug: 'llm-coding-agents',
    toolASlug: 'claude-code',
    toolBSlug: 'codex-cli',
  },
  {
    categorySlug: 'llm-coding-agents',
    toolASlug: 'cursor',
    toolBSlug: 'windsurf',
  },
  {
    categorySlug: 'llm-coding-agents',
    toolASlug: 'cline',
    toolBSlug: 'roo-code',
  },
  {
    categorySlug: 'llm-observability',
    toolASlug: 'langfuse',
    toolBSlug: 'langsmith',
  },
  {
    categorySlug: 'llm-evals',
    toolASlug: 'promptfoo',
    toolBSlug: 'braintrust',
  },
]
