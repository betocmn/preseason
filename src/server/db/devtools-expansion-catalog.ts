/**
 * Devtools expansion catalog — additional subcategories, tools, and assignments.
 *
 * Adds a batch of high-interest devtool categories (backend languages/frameworks,
 * agentic web search, vector databases, agent frameworks, LLM gateways, AI code
 * review, browser automation) plus augments three existing categories with newer
 * tools. Mirrored by drizzle/0006_add_devtools_categories.sql so prod gets the same
 * rows via `pnpm db:migrate` while `pnpm db:seed` keeps fresh DBs consistent.
 *
 * All new subcategories live under the existing `devtools` group. Renames of the
 * existing `jobs` and `llm-coding-agents` subcategories happen in seed.ts /
 * ai-devtools-catalog.ts respectively; this file only adds NEW tools to them.
 */

import type {
  AiDevtoolsSubcategory,
  AiDevtoolsTool,
  AiDevtoolsToolCategoryAssignment,
} from './ai-devtools-catalog'

// ----------------------------------------------------------------------------
// Subcategories (all under the `devtools` group). displayOrder continues from 24.
// ----------------------------------------------------------------------------
export const DEVTOOLS_EXPANSION_SUBCATEGORIES: AiDevtoolsSubcategory[] = [
  {
    name: 'Backend Language',
    slug: 'backend-language',
    icon: 'braces',
    displayOrder: 25,
    description: 'Server-side programming languages for application backends',
  },
  {
    name: 'Backend Framework',
    slug: 'backend-framework',
    icon: 'layout-template',
    displayOrder: 26,
    description: 'Full-stack and server-side web application frameworks',
  },
  {
    name: 'Agent Frameworks',
    slug: 'agent-frameworks',
    icon: 'bot',
    displayOrder: 27,
    description: 'Frameworks and SDKs for building LLM agents and workflows',
  },
  {
    name: 'Agentic Web Search',
    slug: 'agentic-web-search',
    icon: 'globe',
    displayOrder: 28,
    description: 'Search, crawling, and web retrieval APIs built for AI agents',
  },
  {
    name: 'Vector Database',
    slug: 'vector-db',
    icon: 'boxes',
    displayOrder: 29,
    description: 'Vector and embedding databases for similarity search and RAG',
  },
  {
    name: 'LLM Gateway / Routing',
    slug: 'llm-gateway',
    icon: 'route',
    displayOrder: 30,
    description: 'Gateways and routers for accessing and load-balancing LLM providers',
  },
  {
    name: 'AI Code Review',
    slug: 'ai-code-review',
    icon: 'git-pull-request',
    displayOrder: 31,
    description: 'AI-powered pull request review and code analysis tools',
  },
  {
    name: 'Browser Automation',
    slug: 'browser-automation',
    icon: 'mouse-pointer-click',
    displayOrder: 32,
    description: 'Headless browser infrastructure and automation for AI agents',
  },
]

// ----------------------------------------------------------------------------
// Tools (new rows only — reused existing tools are cross-assigned below).
// ----------------------------------------------------------------------------
export const DEVTOOLS_EXPANSION_TOOLS: AiDevtoolsTool[] = [
  // Backend Language
  {
    name: 'TypeScript',
    slug: 'typescript',
    website: 'https://www.typescriptlang.org',
    description: 'Typed superset of JavaScript that compiles to plain JavaScript',
    aliases: ['TS'],
    logoUrl: '/logos/typescript.png',
  },
  {
    name: 'JavaScript',
    slug: 'javascript',
    website: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    description: 'Core scripting language of the web, also run server-side on Node.js',
    aliases: ['JS'],
  },
  {
    name: 'Python',
    slug: 'python',
    website: 'https://www.python.org',
    description: 'High-level general-purpose language popular for backends and AI',
    aliases: ['Py'],
    logoUrl: '/logos/python.png',
  },
  {
    name: 'Go',
    slug: 'go',
    website: 'https://go.dev',
    description: 'Statically typed compiled language from Google for scalable backends',
    aliases: ['Golang'],
    logoUrl: '/logos/go.png',
  },
  {
    name: 'Rust',
    slug: 'rust',
    website: 'https://www.rust-lang.org',
    description: 'Systems programming language focused on safety and performance',
    logoUrl: '/logos/rust.png',
  },
  {
    name: 'Ruby',
    slug: 'ruby',
    website: 'https://www.ruby-lang.org',
    description: 'Dynamic, expressive language designed for programmer productivity',
    logoUrl: '/logos/ruby.png',
  },
  {
    name: 'Java',
    slug: 'java',
    website: 'https://www.java.com',
    description: 'Class-based object-oriented language for enterprise backends',
  },
  {
    name: 'C#',
    slug: 'csharp',
    website: 'https://learn.microsoft.com/en-us/dotnet/csharp/',
    description: 'Object-oriented language for the .NET platform',
    aliases: ['C Sharp', 'CSharp'],
  },
  {
    name: 'PHP',
    slug: 'php',
    website: 'https://www.php.net',
    description: 'Server-side scripting language widely used for web backends',
    logoUrl: '/logos/php.png',
  },
  {
    name: 'Elixir',
    slug: 'elixir',
    website: 'https://elixir-lang.org',
    description: 'Functional language on the Erlang VM for scalable concurrent systems',
  },
  {
    name: 'Kotlin',
    slug: 'kotlin',
    website: 'https://kotlinlang.org',
    description: 'Modern JVM language used for backend and Android development',
  },

  // Backend Framework
  {
    // Slug matches the existing canonical tool in prod (avoids a duplicate / name clash).
    name: 'Next.js',
    slug: 'next-js',
    website: 'https://nextjs.org',
    description: 'React framework for full-stack web apps with SSR and API routes',
    aliases: ['Next', 'NextJS', 'Next JS'],
  },
  {
    name: 'Django',
    slug: 'django',
    website: 'https://www.djangoproject.com',
    description: 'Batteries-included Python web framework',
  },
  {
    name: 'Ruby on Rails',
    slug: 'rails',
    website: 'https://rubyonrails.org',
    description: 'Convention-over-configuration web framework for Ruby',
    aliases: ['Rails', 'RoR'],
    logoUrl: '/logos/rails.png',
  },
  {
    name: 'Laravel',
    slug: 'laravel',
    website: 'https://laravel.com',
    description: 'Expressive PHP web application framework',
    logoUrl: '/logos/laravel.png',
  },
  {
    name: 'FastAPI',
    slug: 'fastapi',
    website: 'https://fastapi.tiangolo.com',
    description: 'Modern, fast Python framework for building APIs',
  },
  {
    name: 'Spring Boot',
    slug: 'spring-boot',
    website: 'https://spring.io/projects/spring-boot',
    description: 'Java framework for production-ready Spring applications',
    aliases: ['Spring'],
  },
  {
    name: 'Flask',
    slug: 'flask',
    website: 'https://flask.palletsprojects.com',
    description: 'Lightweight Python micro web framework',
  },
  {
    name: 'Phoenix',
    slug: 'phoenix',
    website: 'https://www.phoenixframework.org',
    description: 'Elixir web framework for high-throughput real-time apps',
    aliases: ['Phoenix Framework'],
  },
  {
    name: 'ASP.NET Core',
    slug: 'aspnet-core',
    website: 'https://dotnet.microsoft.com/en-us/apps/aspnet',
    description: 'Cross-platform .NET framework for web apps and APIs',
    aliases: ['ASP.NET'],
  },
  {
    name: 'Remix',
    slug: 'remix',
    website: 'https://remix.run',
    description: 'Full-stack React framework focused on web standards',
  },
  {
    name: 'SvelteKit',
    slug: 'sveltekit',
    website: 'https://svelte.dev/docs/kit',
    description: 'Full-stack application framework for Svelte',
  },
  {
    name: 'Nuxt',
    slug: 'nuxt',
    website: 'https://nuxt.com',
    description: 'Intuitive Vue framework for full-stack web apps',
    aliases: ['Nuxt.js'],
  },

  // Agent Frameworks
  {
    name: 'LlamaIndex',
    slug: 'llamaindex',
    website: 'https://www.llamaindex.ai',
    description: 'Data framework for building LLM and RAG applications',
    aliases: ['Llama Index'],
  },
  {
    name: 'Mastra',
    slug: 'mastra',
    website: 'https://mastra.ai',
    description: 'TypeScript framework for building AI agents and workflows',
  },
  {
    name: 'CrewAI',
    slug: 'crewai',
    website: 'https://www.crewai.com',
    description: 'Framework for orchestrating role-playing autonomous AI agents',
    aliases: ['Crew AI'],
  },
  {
    name: 'AutoGen',
    slug: 'autogen',
    website: 'https://microsoft.github.io/autogen/',
    description: 'Microsoft framework for multi-agent LLM applications',
    aliases: ['AG2'],
  },
  {
    name: 'Pydantic AI',
    slug: 'pydantic-ai',
    website: 'https://ai.pydantic.dev',
    description: 'Python agent framework from the Pydantic team',
    aliases: ['PydanticAI'],
  },
  {
    name: 'OpenAI Agents SDK',
    slug: 'openai-agents-sdk',
    website: 'https://openai.github.io/openai-agents-python/',
    description: 'OpenAI framework for building multi-agent workflows',
    aliases: ['Agents SDK', 'OpenAI Swarm'],
  },
  {
    name: 'Google ADK',
    slug: 'google-adk',
    website: 'https://google.github.io/adk-docs/',
    description: 'Google Agent Development Kit for building AI agents',
    aliases: ['ADK', 'Agent Development Kit'],
  },
  {
    name: 'Agno',
    slug: 'agno',
    website: 'https://www.agno.com',
    description: 'Lightweight framework for building multimodal AI agents',
    aliases: ['Phidata'],
  },
  {
    name: 'LangGraph',
    slug: 'langgraph',
    website: 'https://www.langchain.com/langgraph',
    description: 'Library for building stateful, multi-actor agent applications',
    logoUrl: '/logos/langgraph.png',
  },

  // Agentic Web Search
  {
    name: 'Exa',
    slug: 'exa',
    website: 'https://exa.ai',
    description: 'Neural search API and web retrieval for AI applications',
    aliases: ['Exa AI', 'Metaphor'],
  },
  {
    name: 'Firecrawl',
    slug: 'firecrawl',
    website: 'https://www.firecrawl.dev',
    description: 'API to crawl and convert websites into LLM-ready markdown',
  },
  {
    name: 'Parallel',
    slug: 'parallel',
    website: 'https://parallel.ai',
    description: 'Web research and search API built for AI agents',
    aliases: ['Parallel AI', 'Parallel Web Systems'],
  },
  {
    name: 'Tavily',
    slug: 'tavily',
    website: 'https://tavily.com',
    description: 'Search API optimized for LLMs and RAG pipelines',
  },
  {
    name: 'Linkup',
    slug: 'linkup',
    website: 'https://www.linkup.so',
    description: 'Search API connecting AI to real-time web and premium content',
  },
  {
    name: 'Jina AI',
    slug: 'jina-ai',
    website: 'https://jina.ai',
    description: 'Search foundation APIs for reading, embedding, and reranking',
    aliases: ['Jina', 'Jina Reader'],
  },
  {
    name: 'Brave Search API',
    slug: 'brave-search',
    website: 'https://brave.com/search/api/',
    description: 'Independent web search API powered by its own index',
    aliases: ['Brave Search'],
  },
  {
    name: 'Serper',
    slug: 'serper',
    website: 'https://serper.dev',
    description: 'Fast, affordable Google Search API for developers',
  },
  {
    name: 'SerpAPI',
    slug: 'serpapi',
    website: 'https://serpapi.com',
    description: 'Real-time search engine results API',
    aliases: ['Serp API'],
  },

  // Vector Database
  {
    name: 'Pinecone',
    slug: 'pinecone',
    website: 'https://www.pinecone.io',
    description: 'Managed vector database for similarity search at scale',
    logoUrl: '/logos/pinecone.png',
  },
  {
    name: 'Weaviate',
    slug: 'weaviate',
    website: 'https://weaviate.io',
    description: 'Open source AI-native vector database',
    logoUrl: '/logos/weaviate.png',
  },
  {
    name: 'Qdrant',
    slug: 'qdrant',
    website: 'https://qdrant.tech',
    description: 'Open source vector database and similarity search engine',
  },
  {
    name: 'Chroma',
    slug: 'chroma',
    website: 'https://www.trychroma.com',
    description: 'Open source embedding database for AI applications',
    aliases: ['ChromaDB'],
    logoUrl: '/logos/chroma.png',
  },
  {
    name: 'Milvus',
    slug: 'milvus',
    website: 'https://milvus.io',
    description: 'Open source vector database for scalable similarity search',
  },
  {
    name: 'pgvector',
    slug: 'pgvector',
    website: 'https://github.com/pgvector/pgvector',
    description: 'Open source vector similarity search extension for Postgres',
  },
  {
    name: 'Turbopuffer',
    slug: 'turbopuffer',
    website: 'https://turbopuffer.com',
    description: 'Vector and full-text search built on object storage',
  },
  {
    name: 'LanceDB',
    slug: 'lancedb',
    website: 'https://lancedb.com',
    description: 'Open source serverless vector database for AI',
  },

  // LLM Gateway / Routing
  {
    name: 'LiteLLM',
    slug: 'litellm',
    website: 'https://www.litellm.ai',
    description: 'Open source gateway to call 100+ LLM APIs in OpenAI format',
    logoUrl: '/logos/litellm.png',
  },
  {
    name: 'Portkey',
    slug: 'portkey',
    website: 'https://portkey.ai',
    description: 'AI gateway with routing, caching, and observability',
  },
  {
    name: 'Cloudflare AI Gateway',
    slug: 'cloudflare-ai-gateway',
    website: 'https://developers.cloudflare.com/ai-gateway/',
    description: 'Gateway to monitor, cache, and route AI requests',
    aliases: ['AI Gateway'],
  },
  {
    name: 'Vercel AI Gateway',
    slug: 'vercel-ai-gateway',
    website: 'https://vercel.com/docs/ai-gateway',
    description: 'Unified gateway to access many AI models with failover',
  },
  {
    name: 'Requesty',
    slug: 'requesty',
    website: 'https://www.requesty.ai',
    description: 'LLM routing platform with cost controls and observability',
  },
  {
    name: 'Martian',
    slug: 'martian',
    website: 'https://withmartian.com',
    description: 'Model router that picks the best LLM per request',
    aliases: ['Martian Router'],
  },
  {
    name: 'Unify',
    slug: 'unify',
    website: 'https://unify.ai',
    description: 'Router and gateway for accessing and benchmarking LLMs',
  },

  // AI Code Review
  {
    name: 'CodeRabbit',
    slug: 'coderabbit',
    website: 'https://www.coderabbit.ai',
    description: 'AI code reviewer for pull requests',
    aliases: ['Code Rabbit'],
  },
  {
    name: 'Greptile',
    slug: 'greptile',
    website: 'https://www.greptile.com',
    description: 'AI code review that understands your full codebase',
  },
  {
    name: 'Graphite',
    slug: 'graphite',
    website: 'https://graphite.dev',
    description: 'Code review platform with AI reviewer Diamond',
    aliases: ['Diamond', 'Graphite Diamond'],
  },
  {
    name: 'Qodo',
    slug: 'qodo',
    website: 'https://www.qodo.ai',
    description: 'AI platform for code review, testing, and integrity',
    aliases: ['Codium', 'CodiumAI'],
  },
  {
    name: 'Bito',
    slug: 'bito',
    website: 'https://bito.ai',
    description: 'AI agents for automated code review',
  },
  {
    name: 'Korbit',
    slug: 'korbit',
    website: 'https://www.korbit.ai',
    description: 'AI mentor that reviews code and teaches best practices',
  },
  {
    name: 'Ellipsis',
    slug: 'ellipsis',
    website: 'https://www.ellipsis.dev',
    description: 'AI code review and bug-fixing for pull requests',
  },

  // Browser Automation
  {
    name: 'Browserbase',
    slug: 'browserbase',
    website: 'https://www.browserbase.com',
    description: 'Headless browser infrastructure for AI agents',
  },
  {
    name: 'Browser Use',
    slug: 'browser-use',
    website: 'https://browser-use.com',
    description: 'Open source library to let AI agents control a browser',
    aliases: ['BrowserUse'],
  },
  {
    name: 'Stagehand',
    slug: 'stagehand',
    website: 'https://www.stagehand.dev',
    description: 'AI browser automation framework built on Playwright',
  },
  {
    name: 'Hyperbrowser',
    slug: 'hyperbrowser',
    website: 'https://www.hyperbrowser.ai',
    description: 'Cloud browser platform for scraping and AI agents',
  },
  {
    name: 'Steel',
    slug: 'steel',
    website: 'https://steel.dev',
    description: 'Open source browser API for AI agents',
    aliases: ['Steel.dev'],
  },
  {
    name: 'Anchor Browser',
    slug: 'anchor-browser',
    website: 'https://anchorbrowser.io',
    description: 'Browser infrastructure built for AI agent automation',
  },

  // Agentic IDE / ADEs (added to existing `llm-coding-agents`, now renamed)
  {
    name: 'Conductor',
    slug: 'conductor',
    website: 'https://conductor.build',
    description: 'Mac app to run many parallel coding agents in isolated workspaces',
    aliases: ['Conductor UI'],
  },
  {
    name: 'Superset',
    slug: 'superset',
    website: 'https://superset.sh',
    description: 'Agentic development environment for orchestrating coding agents',
    aliases: ['Superset.sh'],
  },
  {
    name: 'Emdash',
    slug: 'emdash',
    website: 'https://emdash.dev',
    description: 'Orchestrate parallel coding agents across isolated workspaces',
  },
  {
    name: 'Vibe Kanban',
    slug: 'vibe-kanban',
    website: 'https://www.vibekanban.com',
    description: 'Kanban board to manage and orchestrate AI coding agents',
  },
  {
    name: 'Crystal',
    slug: 'crystal',
    website: 'https://github.com/stravu/crystal',
    description: 'Desktop app to run parallel coding agents in git worktrees',
    aliases: ['Crystal IDE'],
  },
  {
    name: 'Devin',
    slug: 'devin',
    website: 'https://devin.ai',
    description: 'Autonomous AI software engineer from Cognition',
    aliases: ['Cognition Devin'],
    logoUrl: '/logos/devin.png',
  },
  {
    name: 'Factory',
    slug: 'factory',
    website: 'https://factory.ai',
    description: 'Agent-native software development platform',
    aliases: ['Droid', 'Factory Droid'],
  },

  // Background Jobs / Queues (added to existing `jobs`, now renamed)
  {
    name: 'Temporal',
    slug: 'temporal',
    website: 'https://temporal.io',
    description: 'Durable execution platform for reliable workflows',
  },
  {
    name: 'QStash',
    slug: 'qstash',
    website: 'https://upstash.com/docs/qstash',
    description: 'Serverless message queue and task scheduler over HTTP',
    aliases: ['Upstash QStash'],
  },
  {
    name: 'Hatchet',
    slug: 'hatchet',
    website: 'https://hatchet.run',
    description: 'Distributed task queue with durable execution',
  },
  {
    name: 'Defer',
    slug: 'defer',
    website: 'https://www.defer.run',
    description: 'Background jobs and workflows for Node.js',
    aliases: ['Defer.run'],
  },
  {
    name: 'Cloudflare Queues',
    slug: 'cloudflare-queues',
    website: 'https://developers.cloudflare.com/queues/',
    description: 'Serverless message queue on Cloudflare Workers',
  },
  {
    name: 'Mergent',
    slug: 'mergent',
    website: 'https://mergent.co',
    description: 'API for background tasks, queues, and cron jobs',
  },
  {
    name: 'Restate',
    slug: 'restate',
    website: 'https://restate.dev',
    description: 'Durable execution engine for workflows and async tasks',
  },

  // LLM Observability augments (added to existing `llm-observability`)
  {
    name: 'Raindrop',
    slug: 'raindrop',
    website: 'https://www.raindrop.ai',
    description: 'Observability and analytics platform for AI products',
    aliases: ['Raindrop AI'],
  },
  {
    name: 'HoneyHive',
    slug: 'honeyhive',
    website: 'https://www.honeyhive.ai',
    description: 'Evaluation and observability platform for AI applications',
  },
  {
    name: 'Laminar',
    slug: 'laminar',
    website: 'https://www.lmnr.ai',
    description: 'Open source observability and analytics for LLM apps',
    aliases: ['Laminar AI', 'lmnr'],
  },

  // LLM Evals augments (added to existing `llm-evals`)
  {
    name: 'Galileo',
    slug: 'galileo',
    website: 'https://www.galileo.ai',
    description: 'Evaluation and observability platform for AI agents',
    aliases: ['Galileo AI', 'Rungalileo'],
  },
]

// ----------------------------------------------------------------------------
// Tool ↔ category assignments.
//   - New tools -> their primary new category.
//   - Existing tools cross-assigned to new categories use isPrimary: false.
//   - New ADE/queue/observability/evals tools attach to existing subcategories.
// ----------------------------------------------------------------------------
export const DEVTOOLS_EXPANSION_TOOL_CATEGORY_ASSIGNMENTS: AiDevtoolsToolCategoryAssignment[] = [
  // Backend Language
  { toolSlug: 'typescript', categorySlug: 'backend-language', isPrimary: true },
  { toolSlug: 'javascript', categorySlug: 'backend-language', isPrimary: true },
  { toolSlug: 'python', categorySlug: 'backend-language', isPrimary: true },
  { toolSlug: 'go', categorySlug: 'backend-language', isPrimary: true },
  { toolSlug: 'rust', categorySlug: 'backend-language', isPrimary: true },
  { toolSlug: 'ruby', categorySlug: 'backend-language', isPrimary: true },
  { toolSlug: 'java', categorySlug: 'backend-language', isPrimary: true },
  { toolSlug: 'csharp', categorySlug: 'backend-language', isPrimary: true },
  { toolSlug: 'php', categorySlug: 'backend-language', isPrimary: true },
  { toolSlug: 'elixir', categorySlug: 'backend-language', isPrimary: true },
  { toolSlug: 'kotlin', categorySlug: 'backend-language', isPrimary: true },

  // Backend Framework
  { toolSlug: 'next-js', categorySlug: 'backend-framework', isPrimary: true },
  { toolSlug: 'django', categorySlug: 'backend-framework', isPrimary: true },
  { toolSlug: 'rails', categorySlug: 'backend-framework', isPrimary: true },
  { toolSlug: 'laravel', categorySlug: 'backend-framework', isPrimary: true },
  { toolSlug: 'fastapi', categorySlug: 'backend-framework', isPrimary: true },
  { toolSlug: 'spring-boot', categorySlug: 'backend-framework', isPrimary: true },
  { toolSlug: 'flask', categorySlug: 'backend-framework', isPrimary: true },
  { toolSlug: 'phoenix', categorySlug: 'backend-framework', isPrimary: true },
  { toolSlug: 'aspnet-core', categorySlug: 'backend-framework', isPrimary: true },
  { toolSlug: 'remix', categorySlug: 'backend-framework', isPrimary: true },
  { toolSlug: 'sveltekit', categorySlug: 'backend-framework', isPrimary: true },
  { toolSlug: 'nuxt', categorySlug: 'backend-framework', isPrimary: true },
  // Reused API-framework tools also belong to backend frameworks
  { toolSlug: 'express', categorySlug: 'backend-framework', isPrimary: false },
  { toolSlug: 'fastify', categorySlug: 'backend-framework', isPrimary: false },
  { toolSlug: 'nestjs', categorySlug: 'backend-framework', isPrimary: false },
  { toolSlug: 'hono', categorySlug: 'backend-framework', isPrimary: false },

  // Agent Frameworks
  { toolSlug: 'llamaindex', categorySlug: 'agent-frameworks', isPrimary: true },
  { toolSlug: 'mastra', categorySlug: 'agent-frameworks', isPrimary: true },
  { toolSlug: 'crewai', categorySlug: 'agent-frameworks', isPrimary: true },
  { toolSlug: 'autogen', categorySlug: 'agent-frameworks', isPrimary: true },
  { toolSlug: 'pydantic-ai', categorySlug: 'agent-frameworks', isPrimary: true },
  { toolSlug: 'openai-agents-sdk', categorySlug: 'agent-frameworks', isPrimary: true },
  { toolSlug: 'google-adk', categorySlug: 'agent-frameworks', isPrimary: true },
  { toolSlug: 'agno', categorySlug: 'agent-frameworks', isPrimary: true },
  { toolSlug: 'langgraph', categorySlug: 'agent-frameworks', isPrimary: true },
  // Reused AI tools also belong to agent frameworks
  { toolSlug: 'langchain', categorySlug: 'agent-frameworks', isPrimary: false },
  { toolSlug: 'vercel-ai-sdk', categorySlug: 'agent-frameworks', isPrimary: false },

  // Agentic Web Search
  { toolSlug: 'exa', categorySlug: 'agentic-web-search', isPrimary: true },
  { toolSlug: 'firecrawl', categorySlug: 'agentic-web-search', isPrimary: true },
  { toolSlug: 'parallel', categorySlug: 'agentic-web-search', isPrimary: true },
  { toolSlug: 'tavily', categorySlug: 'agentic-web-search', isPrimary: true },
  { toolSlug: 'linkup', categorySlug: 'agentic-web-search', isPrimary: true },
  { toolSlug: 'jina-ai', categorySlug: 'agentic-web-search', isPrimary: true },
  { toolSlug: 'brave-search', categorySlug: 'agentic-web-search', isPrimary: true },
  { toolSlug: 'serper', categorySlug: 'agentic-web-search', isPrimary: true },
  { toolSlug: 'serpapi', categorySlug: 'agentic-web-search', isPrimary: true },

  // Vector Database
  { toolSlug: 'pinecone', categorySlug: 'vector-db', isPrimary: true },
  { toolSlug: 'weaviate', categorySlug: 'vector-db', isPrimary: true },
  { toolSlug: 'qdrant', categorySlug: 'vector-db', isPrimary: true },
  { toolSlug: 'chroma', categorySlug: 'vector-db', isPrimary: true },
  { toolSlug: 'milvus', categorySlug: 'vector-db', isPrimary: true },
  { toolSlug: 'pgvector', categorySlug: 'vector-db', isPrimary: true },
  { toolSlug: 'turbopuffer', categorySlug: 'vector-db', isPrimary: true },
  { toolSlug: 'lancedb', categorySlug: 'vector-db', isPrimary: true },
  // Reused database tool with vector search
  { toolSlug: 'mongodb-atlas', categorySlug: 'vector-db', isPrimary: false },

  // LLM Gateway / Routing
  { toolSlug: 'litellm', categorySlug: 'llm-gateway', isPrimary: true },
  { toolSlug: 'portkey', categorySlug: 'llm-gateway', isPrimary: true },
  { toolSlug: 'cloudflare-ai-gateway', categorySlug: 'llm-gateway', isPrimary: true },
  { toolSlug: 'vercel-ai-gateway', categorySlug: 'llm-gateway', isPrimary: true },
  { toolSlug: 'requesty', categorySlug: 'llm-gateway', isPrimary: true },
  { toolSlug: 'martian', categorySlug: 'llm-gateway', isPrimary: true },
  { toolSlug: 'unify', categorySlug: 'llm-gateway', isPrimary: true },
  // Reused tools that also act as gateways
  { toolSlug: 'openrouter', categorySlug: 'llm-gateway', isPrimary: false },
  { toolSlug: 'helicone', categorySlug: 'llm-gateway', isPrimary: false },

  // AI Code Review
  { toolSlug: 'coderabbit', categorySlug: 'ai-code-review', isPrimary: true },
  { toolSlug: 'greptile', categorySlug: 'ai-code-review', isPrimary: true },
  { toolSlug: 'graphite', categorySlug: 'ai-code-review', isPrimary: true },
  { toolSlug: 'qodo', categorySlug: 'ai-code-review', isPrimary: true },
  { toolSlug: 'bito', categorySlug: 'ai-code-review', isPrimary: true },
  { toolSlug: 'korbit', categorySlug: 'ai-code-review', isPrimary: true },
  { toolSlug: 'ellipsis', categorySlug: 'ai-code-review', isPrimary: true },

  // Browser Automation
  { toolSlug: 'browserbase', categorySlug: 'browser-automation', isPrimary: true },
  { toolSlug: 'browser-use', categorySlug: 'browser-automation', isPrimary: true },
  { toolSlug: 'stagehand', categorySlug: 'browser-automation', isPrimary: true },
  { toolSlug: 'hyperbrowser', categorySlug: 'browser-automation', isPrimary: true },
  { toolSlug: 'steel', categorySlug: 'browser-automation', isPrimary: true },
  { toolSlug: 'anchor-browser', categorySlug: 'browser-automation', isPrimary: true },
  // Reused testing tool used for browser automation
  { toolSlug: 'playwright', categorySlug: 'browser-automation', isPrimary: false },

  // Agentic IDE / ADEs (existing `llm-coding-agents` subcategory)
  { toolSlug: 'conductor', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'superset', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'emdash', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'vibe-kanban', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'crystal', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'devin', categorySlug: 'llm-coding-agents', isPrimary: true },
  { toolSlug: 'factory', categorySlug: 'llm-coding-agents', isPrimary: true },

  // Background Jobs / Queues (existing `jobs` subcategory)
  { toolSlug: 'temporal', categorySlug: 'jobs', isPrimary: true },
  { toolSlug: 'qstash', categorySlug: 'jobs', isPrimary: true },
  { toolSlug: 'hatchet', categorySlug: 'jobs', isPrimary: true },
  { toolSlug: 'defer', categorySlug: 'jobs', isPrimary: true },
  { toolSlug: 'cloudflare-queues', categorySlug: 'jobs', isPrimary: true },
  { toolSlug: 'mergent', categorySlug: 'jobs', isPrimary: true },
  { toolSlug: 'restate', categorySlug: 'jobs', isPrimary: true },

  // LLM Observability augments (existing `llm-observability` subcategory)
  { toolSlug: 'raindrop', categorySlug: 'llm-observability', isPrimary: true },
  { toolSlug: 'honeyhive', categorySlug: 'llm-observability', isPrimary: true },
  { toolSlug: 'laminar', categorySlug: 'llm-observability', isPrimary: true },

  // LLM Evals augments (existing `llm-evals` subcategory)
  { toolSlug: 'galileo', categorySlug: 'llm-evals', isPrimary: true },
  { toolSlug: 'honeyhive', categorySlug: 'llm-evals', isPrimary: false },
  { toolSlug: 'langfuse', categorySlug: 'llm-evals', isPrimary: false },
]
