-- Custom SQL migration file, put your code below! --

-- Add a batch of devtool tracking categories + tools, and add NEW benchmark prompt
-- scenarios that surface them. Mirrors src/server/db/devtools-expansion-catalog.ts,
-- the `jobs`/`llm-coding-agents` renames in seed.ts / ai-devtools-catalog.ts, and the
-- new scenarios in prompt-corpus.ts.
--
-- Purely ADDITIVE and safe on a live, published benchmark: it never edits the
-- expected_categories of existing (already-frozen) prompts and never touches frozen
-- prompt versions or their category metadata, so published rankings and the next
-- season freeze are unaffected. The new categories get benchmarked via the new
-- prompt scenarios (new slugs => new content hashes => fresh frozen versions).
--
-- Idempotent (safe to re-run): every insert uses ON CONFLICT DO NOTHING. Runs before
-- db:seed on a fresh database, so it must not assume seeded reference data: it ensures
-- the parent `devtools` group exists, and cross-assignments to existing tools the seed
-- creates later are backfilled idempotently by db:seed.

-- 0. Ensure the parent `devtools` category group exists (no-op once seeded).
INSERT INTO "preseason_category_group"
  ("id", "name", "slug", "description", "icon", "display_order", "createdAt")
VALUES
  (gen_random_uuid(), 'Devtools', 'devtools', 'Developer tools and infrastructure', 'code', 1, now())
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- 1. New subcategories under the existing `devtools` group (display order 25-32).
INSERT INTO "preseason_category"
  ("id", "name", "slug", "description", "icon", "display_order", "category_group_id", "createdAt")
SELECT
  gen_random_uuid(), v.name, v.slug, v.description, v.icon, v.display_order,
  (SELECT id FROM "preseason_category_group" WHERE "slug" = 'devtools'), now()
FROM (VALUES
  ('Backend Language', 'backend-language', 'Server-side programming languages for application backends', 'braces', 25),
  ('Backend Framework', 'backend-framework', 'Full-stack and server-side web application frameworks', 'layout-template', 26),
  ('Agent Frameworks', 'agent-frameworks', 'Frameworks and SDKs for building LLM agents and workflows', 'bot', 27),
  ('Agentic Web Search', 'agentic-web-search', 'Search, crawling, and web retrieval APIs built for AI agents', 'globe', 28),
  ('Vector Database', 'vector-db', 'Vector and embedding databases for similarity search and RAG', 'boxes', 29),
  ('LLM Gateway / Routing', 'llm-gateway', 'Gateways and routers for accessing and load-balancing LLM providers', 'route', 30),
  ('AI Code Review', 'ai-code-review', 'AI-powered pull request review and code analysis tools', 'git-pull-request', 31),
  ('Browser Automation', 'browser-automation', 'Headless browser infrastructure and automation for AI agents', 'mouse-pointer-click', 32)
) AS v(name, slug, description, icon, display_order)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- 2. Renames (slugs preserved so existing rankings, prompts, and URLs keep working).
UPDATE "preseason_category"
SET "name" = 'Background Jobs / Queues',
    "description" = 'Background job processing, task queues, and durable workflows',
    "updatedAt" = now()
WHERE "slug" = 'jobs';
--> statement-breakpoint

UPDATE "preseason_category"
SET "name" = 'Agentic IDE / ADEs',
    "description" = 'Agentic IDEs and development environments — coding agents and multi-agent orchestration',
    "icon" = 'panels-top-left',
    "updatedAt" = now()
WHERE "slug" = 'llm-coding-agents';
--> statement-breakpoint

-- 3. New tools.
INSERT INTO "preseason_tool" ("id", "name", "slug", "description", "website", "createdAt")
SELECT gen_random_uuid(), v.name, v.slug, v.description, v.website, now()
FROM (VALUES
  -- Backend Language
  ('TypeScript', 'typescript', 'Typed superset of JavaScript that compiles to plain JavaScript', 'https://www.typescriptlang.org'),
  ('JavaScript', 'javascript', 'Core scripting language of the web, also run server-side on Node.js', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript'),
  ('Python', 'python', 'High-level general-purpose language popular for backends and AI', 'https://www.python.org'),
  ('Go', 'go', 'Statically typed compiled language from Google for scalable backends', 'https://go.dev'),
  ('Rust', 'rust', 'Systems programming language focused on safety and performance', 'https://www.rust-lang.org'),
  ('Ruby', 'ruby', 'Dynamic, expressive language designed for programmer productivity', 'https://www.ruby-lang.org'),
  ('Java', 'java', 'Class-based object-oriented language for enterprise backends', 'https://www.java.com'),
  ('C#', 'csharp', 'Object-oriented language for the .NET platform', 'https://learn.microsoft.com/en-us/dotnet/csharp/'),
  ('PHP', 'php', 'Server-side scripting language widely used for web backends', 'https://www.php.net'),
  ('Elixir', 'elixir', 'Functional language on the Erlang VM for scalable concurrent systems', 'https://elixir-lang.org'),
  ('Kotlin', 'kotlin', 'Modern JVM language used for backend and Android development', 'https://kotlinlang.org'),
  -- Backend Framework
  ('Next.js', 'next-js', 'React framework for full-stack web apps with SSR and API routes', 'https://nextjs.org'),
  ('Django', 'django', 'Batteries-included Python web framework', 'https://www.djangoproject.com'),
  ('Ruby on Rails', 'rails', 'Convention-over-configuration web framework for Ruby', 'https://rubyonrails.org'),
  ('Laravel', 'laravel', 'Expressive PHP web application framework', 'https://laravel.com'),
  ('FastAPI', 'fastapi', 'Modern, fast Python framework for building APIs', 'https://fastapi.tiangolo.com'),
  ('Spring Boot', 'spring-boot', 'Java framework for production-ready Spring applications', 'https://spring.io/projects/spring-boot'),
  ('Flask', 'flask', 'Lightweight Python micro web framework', 'https://flask.palletsprojects.com'),
  ('Phoenix', 'phoenix', 'Elixir web framework for high-throughput real-time apps', 'https://www.phoenixframework.org'),
  ('ASP.NET Core', 'aspnet-core', 'Cross-platform .NET framework for web apps and APIs', 'https://dotnet.microsoft.com/en-us/apps/aspnet'),
  ('Remix', 'remix', 'Full-stack React framework focused on web standards', 'https://remix.run'),
  ('SvelteKit', 'sveltekit', 'Full-stack application framework for Svelte', 'https://svelte.dev/docs/kit'),
  ('Nuxt', 'nuxt', 'Intuitive Vue framework for full-stack web apps', 'https://nuxt.com'),
  -- Agent Frameworks
  ('LlamaIndex', 'llamaindex', 'Data framework for building LLM and RAG applications', 'https://www.llamaindex.ai'),
  ('Mastra', 'mastra', 'TypeScript framework for building AI agents and workflows', 'https://mastra.ai'),
  ('CrewAI', 'crewai', 'Framework for orchestrating role-playing autonomous AI agents', 'https://www.crewai.com'),
  ('AutoGen', 'autogen', 'Microsoft framework for multi-agent LLM applications', 'https://microsoft.github.io/autogen/'),
  ('Pydantic AI', 'pydantic-ai', 'Python agent framework from the Pydantic team', 'https://ai.pydantic.dev'),
  ('OpenAI Agents SDK', 'openai-agents-sdk', 'OpenAI framework for building multi-agent workflows', 'https://openai.github.io/openai-agents-python/'),
  ('Google ADK', 'google-adk', 'Google Agent Development Kit for building AI agents', 'https://google.github.io/adk-docs/'),
  ('Agno', 'agno', 'Lightweight framework for building multimodal AI agents', 'https://www.agno.com'),
  ('LangGraph', 'langgraph', 'Library for building stateful, multi-actor agent applications', 'https://www.langchain.com/langgraph'),
  -- Agentic Web Search
  ('Exa', 'exa', 'Neural search API and web retrieval for AI applications', 'https://exa.ai'),
  ('Firecrawl', 'firecrawl', 'API to crawl and convert websites into LLM-ready markdown', 'https://www.firecrawl.dev'),
  ('Parallel', 'parallel', 'Web research and search API built for AI agents', 'https://parallel.ai'),
  ('Tavily', 'tavily', 'Search API optimized for LLMs and RAG pipelines', 'https://tavily.com'),
  ('Linkup', 'linkup', 'Search API connecting AI to real-time web and premium content', 'https://www.linkup.so'),
  ('Jina AI', 'jina-ai', 'Search foundation APIs for reading, embedding, and reranking', 'https://jina.ai'),
  ('Brave Search API', 'brave-search', 'Independent web search API powered by its own index', 'https://brave.com/search/api/'),
  ('Serper', 'serper', 'Fast, affordable Google Search API for developers', 'https://serper.dev'),
  ('SerpAPI', 'serpapi', 'Real-time search engine results API', 'https://serpapi.com'),
  -- Vector Database
  ('Pinecone', 'pinecone', 'Managed vector database for similarity search at scale', 'https://www.pinecone.io'),
  ('Weaviate', 'weaviate', 'Open source AI-native vector database', 'https://weaviate.io'),
  ('Qdrant', 'qdrant', 'Open source vector database and similarity search engine', 'https://qdrant.tech'),
  ('Chroma', 'chroma', 'Open source embedding database for AI applications', 'https://www.trychroma.com'),
  ('Milvus', 'milvus', 'Open source vector database for scalable similarity search', 'https://milvus.io'),
  ('pgvector', 'pgvector', 'Open source vector similarity search extension for Postgres', 'https://github.com/pgvector/pgvector'),
  ('Turbopuffer', 'turbopuffer', 'Vector and full-text search built on object storage', 'https://turbopuffer.com'),
  ('LanceDB', 'lancedb', 'Open source serverless vector database for AI', 'https://lancedb.com'),
  -- LLM Gateway / Routing
  ('LiteLLM', 'litellm', 'Open source gateway to call 100+ LLM APIs in OpenAI format', 'https://www.litellm.ai'),
  ('Portkey', 'portkey', 'AI gateway with routing, caching, and observability', 'https://portkey.ai'),
  ('Cloudflare AI Gateway', 'cloudflare-ai-gateway', 'Gateway to monitor, cache, and route AI requests', 'https://developers.cloudflare.com/ai-gateway/'),
  ('Vercel AI Gateway', 'vercel-ai-gateway', 'Unified gateway to access many AI models with failover', 'https://vercel.com/docs/ai-gateway'),
  ('Requesty', 'requesty', 'LLM routing platform with cost controls and observability', 'https://www.requesty.ai'),
  ('Martian', 'martian', 'Model router that picks the best LLM per request', 'https://withmartian.com'),
  ('Unify', 'unify', 'Router and gateway for accessing and benchmarking LLMs', 'https://unify.ai'),
  -- AI Code Review
  ('CodeRabbit', 'coderabbit', 'AI code reviewer for pull requests', 'https://www.coderabbit.ai'),
  ('Greptile', 'greptile', 'AI code review that understands your full codebase', 'https://www.greptile.com'),
  ('Graphite', 'graphite', 'Code review platform with AI reviewer Diamond', 'https://graphite.dev'),
  ('Qodo', 'qodo', 'AI platform for code review, testing, and integrity', 'https://www.qodo.ai'),
  ('Bito', 'bito', 'AI agents for automated code review', 'https://bito.ai'),
  ('Korbit', 'korbit', 'AI mentor that reviews code and teaches best practices', 'https://www.korbit.ai'),
  ('Ellipsis', 'ellipsis', 'AI code review and bug-fixing for pull requests', 'https://www.ellipsis.dev'),
  -- Browser Automation
  ('Browserbase', 'browserbase', 'Headless browser infrastructure for AI agents', 'https://www.browserbase.com'),
  ('Browser Use', 'browser-use', 'Open source library to let AI agents control a browser', 'https://browser-use.com'),
  ('Stagehand', 'stagehand', 'AI browser automation framework built on Playwright', 'https://www.stagehand.dev'),
  ('Hyperbrowser', 'hyperbrowser', 'Cloud browser platform for scraping and AI agents', 'https://www.hyperbrowser.ai'),
  ('Steel', 'steel', 'Open source browser API for AI agents', 'https://steel.dev'),
  ('Anchor Browser', 'anchor-browser', 'Browser infrastructure built for AI agent automation', 'https://anchorbrowser.io'),
  -- Agentic IDE / ADEs
  ('Conductor', 'conductor', 'Mac app to run many parallel coding agents in isolated workspaces', 'https://conductor.build'),
  ('Superset', 'superset', 'Agentic development environment for orchestrating coding agents', 'https://superset.sh'),
  ('Emdash', 'emdash', 'Orchestrate parallel coding agents across isolated workspaces', 'https://emdash.dev'),
  ('Vibe Kanban', 'vibe-kanban', 'Kanban board to manage and orchestrate AI coding agents', 'https://www.vibekanban.com'),
  ('Crystal', 'crystal', 'Desktop app to run parallel coding agents in git worktrees', 'https://github.com/stravu/crystal'),
  ('Devin', 'devin', 'Autonomous AI software engineer from Cognition', 'https://devin.ai'),
  ('Factory', 'factory', 'Agent-native software development platform', 'https://factory.ai'),
  -- Background Jobs / Queues
  ('Temporal', 'temporal', 'Durable execution platform for reliable workflows', 'https://temporal.io'),
  ('QStash', 'qstash', 'Serverless message queue and task scheduler over HTTP', 'https://upstash.com/docs/qstash'),
  ('Hatchet', 'hatchet', 'Distributed task queue with durable execution', 'https://hatchet.run'),
  ('Defer', 'defer', 'Background jobs and workflows for Node.js', 'https://www.defer.run'),
  ('Cloudflare Queues', 'cloudflare-queues', 'Serverless message queue on Cloudflare Workers', 'https://developers.cloudflare.com/queues/'),
  ('Mergent', 'mergent', 'API for background tasks, queues, and cron jobs', 'https://mergent.co'),
  ('Restate', 'restate', 'Durable execution engine for workflows and async tasks', 'https://restate.dev'),
  -- LLM Observability augments
  ('Raindrop', 'raindrop', 'Observability and analytics platform for AI products', 'https://www.raindrop.ai'),
  ('HoneyHive', 'honeyhive', 'Evaluation and observability platform for AI applications', 'https://www.honeyhive.ai'),
  ('Laminar', 'laminar', 'Open source observability and analytics for LLM apps', 'https://www.lmnr.ai'),
  -- LLM Evals augments
  ('Galileo', 'galileo', 'Evaluation and observability platform for AI agents', 'https://www.galileo.ai')
) AS v(name, slug, description, website)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- 4. Tool aliases (normalized to lowercase, matching the seed). Unique on normalized_alias.
INSERT INTO "preseason_tool_alias" ("id", "tool_id", "alias", "normalized_alias", "source", "createdAt")
SELECT gen_random_uuid(), t.id, v.alias, lower(trim(v.alias)), 'seed', now()
FROM (VALUES
  ('typescript', 'TS'),
  ('javascript', 'JS'),
  ('python', 'Py'),
  ('go', 'Golang'),
  ('csharp', 'C Sharp'),
  ('csharp', 'CSharp'),
  ('next-js', 'Next'),
  ('next-js', 'NextJS'),
  ('next-js', 'Next JS'),
  ('rails', 'Rails'),
  ('rails', 'RoR'),
  ('spring-boot', 'Spring'),
  ('phoenix', 'Phoenix Framework'),
  ('aspnet-core', 'ASP.NET'),
  ('nuxt', 'Nuxt.js'),
  ('llamaindex', 'Llama Index'),
  ('crewai', 'Crew AI'),
  ('autogen', 'AG2'),
  ('pydantic-ai', 'PydanticAI'),
  ('openai-agents-sdk', 'Agents SDK'),
  ('openai-agents-sdk', 'OpenAI Swarm'),
  ('google-adk', 'ADK'),
  ('google-adk', 'Agent Development Kit'),
  ('agno', 'Phidata'),
  ('exa', 'Exa AI'),
  ('exa', 'Metaphor'),
  ('parallel', 'Parallel AI'),
  ('parallel', 'Parallel Web Systems'),
  ('jina-ai', 'Jina'),
  ('jina-ai', 'Jina Reader'),
  ('brave-search', 'Brave Search'),
  ('serpapi', 'Serp API'),
  ('chroma', 'ChromaDB'),
  ('cloudflare-ai-gateway', 'AI Gateway'),
  ('martian', 'Martian Router'),
  ('coderabbit', 'Code Rabbit'),
  ('graphite', 'Diamond'),
  ('graphite', 'Graphite Diamond'),
  ('qodo', 'Codium'),
  ('qodo', 'CodiumAI'),
  ('browser-use', 'BrowserUse'),
  ('steel', 'Steel.dev'),
  ('conductor', 'Conductor UI'),
  ('superset', 'Superset.sh'),
  ('crystal', 'Crystal IDE'),
  ('devin', 'Cognition Devin'),
  ('factory', 'Droid'),
  ('factory', 'Factory Droid'),
  ('qstash', 'Upstash QStash'),
  ('defer', 'Defer.run'),
  ('raindrop', 'Raindrop AI'),
  ('laminar', 'Laminar AI'),
  ('laminar', 'lmnr'),
  ('galileo', 'Galileo AI'),
  ('galileo', 'Rungalileo')
) AS v(tool_slug, alias)
JOIN "preseason_tool" t ON t.slug = v.tool_slug
ON CONFLICT ("normalized_alias") DO NOTHING;
--> statement-breakpoint

-- 5. Tool ↔ category assignments (new tools to new/existing categories, plus reused
--    existing tools cross-assigned to new categories). Unique on (tool_id, category_id).
INSERT INTO "preseason_tool_category" ("id", "tool_id", "category_id", "is_primary")
SELECT gen_random_uuid(), t.id, c.id, v.is_primary
FROM (VALUES
  -- Backend Language
  ('typescript', 'backend-language', true),
  ('javascript', 'backend-language', true),
  ('python', 'backend-language', true),
  ('go', 'backend-language', true),
  ('rust', 'backend-language', true),
  ('ruby', 'backend-language', true),
  ('java', 'backend-language', true),
  ('csharp', 'backend-language', true),
  ('php', 'backend-language', true),
  ('elixir', 'backend-language', true),
  ('kotlin', 'backend-language', true),
  -- Backend Framework
  ('next-js', 'backend-framework', true),
  ('django', 'backend-framework', true),
  ('rails', 'backend-framework', true),
  ('laravel', 'backend-framework', true),
  ('fastapi', 'backend-framework', true),
  ('spring-boot', 'backend-framework', true),
  ('flask', 'backend-framework', true),
  ('phoenix', 'backend-framework', true),
  ('aspnet-core', 'backend-framework', true),
  ('remix', 'backend-framework', true),
  ('sveltekit', 'backend-framework', true),
  ('nuxt', 'backend-framework', true),
  ('express', 'backend-framework', false),
  ('fastify', 'backend-framework', false),
  ('nestjs', 'backend-framework', false),
  ('hono', 'backend-framework', false),
  -- Agent Frameworks
  ('llamaindex', 'agent-frameworks', true),
  ('mastra', 'agent-frameworks', true),
  ('crewai', 'agent-frameworks', true),
  ('autogen', 'agent-frameworks', true),
  ('pydantic-ai', 'agent-frameworks', true),
  ('openai-agents-sdk', 'agent-frameworks', true),
  ('google-adk', 'agent-frameworks', true),
  ('agno', 'agent-frameworks', true),
  ('langgraph', 'agent-frameworks', true),
  ('langchain', 'agent-frameworks', false),
  ('vercel-ai-sdk', 'agent-frameworks', false),
  -- Agentic Web Search
  ('exa', 'agentic-web-search', true),
  ('firecrawl', 'agentic-web-search', true),
  ('parallel', 'agentic-web-search', true),
  ('tavily', 'agentic-web-search', true),
  ('linkup', 'agentic-web-search', true),
  ('jina-ai', 'agentic-web-search', true),
  ('brave-search', 'agentic-web-search', true),
  ('serper', 'agentic-web-search', true),
  ('serpapi', 'agentic-web-search', true),
  -- Vector Database
  ('pinecone', 'vector-db', true),
  ('weaviate', 'vector-db', true),
  ('qdrant', 'vector-db', true),
  ('chroma', 'vector-db', true),
  ('milvus', 'vector-db', true),
  ('pgvector', 'vector-db', true),
  ('turbopuffer', 'vector-db', true),
  ('lancedb', 'vector-db', true),
  ('mongodb-atlas', 'vector-db', false),
  -- LLM Gateway / Routing
  ('litellm', 'llm-gateway', true),
  ('portkey', 'llm-gateway', true),
  ('cloudflare-ai-gateway', 'llm-gateway', true),
  ('vercel-ai-gateway', 'llm-gateway', true),
  ('requesty', 'llm-gateway', true),
  ('martian', 'llm-gateway', true),
  ('unify', 'llm-gateway', true),
  ('openrouter', 'llm-gateway', false),
  ('helicone', 'llm-gateway', false),
  -- AI Code Review
  ('coderabbit', 'ai-code-review', true),
  ('greptile', 'ai-code-review', true),
  ('graphite', 'ai-code-review', true),
  ('qodo', 'ai-code-review', true),
  ('bito', 'ai-code-review', true),
  ('korbit', 'ai-code-review', true),
  ('ellipsis', 'ai-code-review', true),
  -- Browser Automation
  ('browserbase', 'browser-automation', true),
  ('browser-use', 'browser-automation', true),
  ('stagehand', 'browser-automation', true),
  ('hyperbrowser', 'browser-automation', true),
  ('steel', 'browser-automation', true),
  ('anchor-browser', 'browser-automation', true),
  ('playwright', 'browser-automation', false),
  -- Agentic IDE / ADEs (existing llm-coding-agents)
  ('conductor', 'llm-coding-agents', true),
  ('superset', 'llm-coding-agents', true),
  ('emdash', 'llm-coding-agents', true),
  ('vibe-kanban', 'llm-coding-agents', true),
  ('crystal', 'llm-coding-agents', true),
  ('devin', 'llm-coding-agents', true),
  ('factory', 'llm-coding-agents', true),
  -- Background Jobs / Queues (existing jobs)
  ('temporal', 'jobs', true),
  ('qstash', 'jobs', true),
  ('hatchet', 'jobs', true),
  ('defer', 'jobs', true),
  ('cloudflare-queues', 'jobs', true),
  ('mergent', 'jobs', true),
  ('restate', 'jobs', true),
  -- LLM Observability augments
  ('raindrop', 'llm-observability', true),
  ('honeyhive', 'llm-observability', true),
  ('laminar', 'llm-observability', true),
  -- LLM Evals augments
  ('galileo', 'llm-evals', true),
  ('honeyhive', 'llm-evals', false),
  ('langfuse', 'llm-evals', false)
) AS v(tool_slug, category_slug, is_primary)
JOIN "preseason_tool" t ON t.slug = v.tool_slug
JOIN "preseason_category" c ON c.slug = v.category_slug
ON CONFLICT ("tool_id", "category_id") DO NOTHING;
--> statement-breakpoint

-- 6. New benchmark prompt scenarios that surface the new categories. These are NEW prompts
--    (new slugs => new content hashes), so freezing the next season creates fresh frozen
--    versions and never conflicts with the existing frozen versions of the live prompts.
--    Existing prompts are intentionally left untouched. Mirrors src/server/db/prompt-corpus.ts.
INSERT INTO "preseason_prompt"
  ("id", "title", "slug", "level", "description", "content_md", "expected_categories", "is_active", "createdAt")
SELECT gen_random_uuid(), v.title, v.slug, v.level::"prompt_level", v.description, v.content_md, v.expected_categories, true, now()
FROM (VALUES
  ('AI Engineering Workflow', 'ai-engineering-workflow', 'beginner',
   'AI-assisted engineering setup with a coding agent, AI code review, tests, and CI',
   'Set up an AI-assisted engineering workflow for a small software team. Recommend the agentic IDE or coding agent the team should use day to day, an AI code review tool for pull requests, how they should run automated tests and continuous integration, and a way to access LLMs across providers. Keep it simple and practical.',
   ARRAY['llm-coding-agents','ai-code-review','testing','ci-cd','llm-gateway','llm-observability','llm-evals']::text[]),
  ('AI Engineering Workflow', 'ai-engineering-workflow', 'intermediate',
   'Team AI engineering workflow with code review, CI gates, an LLM gateway, and evals',
   'Design an AI-assisted engineering workflow for a growing software team shipping to production. Cover the agentic IDE / coding-agent setup developers use, automated AI code review on pull requests, the testing and CI pipeline that gates merges, a shared LLM gateway for routing across model providers, and the observability and evaluation tooling the team uses to monitor and regression-test the AI features it builds.',
   ARRAY['llm-coding-agents','ai-code-review','testing','ci-cd','llm-gateway','llm-observability','llm-evals']::text[]),
  ('AI Engineering Workflow', 'ai-engineering-workflow', 'advanced',
   'Org-wide AI engineering toolchain with review gates, gateway, and eval/observability pipelines',
   'Define a production-grade AI-assisted engineering workflow for a software organization with multiple teams. Specify the agentic IDE / ADE and coding-agent strategy for parallel agent work, mandatory AI code review integrated into pull requests with human sign-off, a testing and CI/CD pipeline with quality gates, a centralized LLM gateway providing routing, rate limiting, caching, and cost controls across providers, and the observability plus evaluation pipelines that trace, monitor, and regression-test LLM behavior before changes ship. Address governance, auditability, and how the toolchain scales across teams without fragmenting standards.',
   ARRAY['llm-coding-agents','ai-code-review','testing','ci-cd','llm-gateway','llm-observability','llm-evals']::text[]),
  ('Full-Stack Web App', 'full-stack-web-app', 'beginner',
   'Full-stack business web app — pick a backend language, framework, database, and hosting',
   'Build a full-stack web application for a small business with a customer-facing site and a simple admin area. Choose the backend programming language, web framework, database, and hosting platform, and explain how the pieces fit together for user accounts, data storage, and background tasks like sending emails.',
   ARRAY['backend-language','backend-framework','database','orm','auth','hosting','api','jobs']::text[]),
  ('Full-Stack Web App', 'full-stack-web-app', 'intermediate',
   'Production full-stack app with API, data layer, background jobs, and deployment',
   'Build a production-bound full-stack web application with authenticated users, a relational data model, a REST or RPC API, background job processing, and a deployment target. Choose the backend language and framework, the database and data-access layer, and justify how the stack handles authentication, persistence, asynchronous work, and hosting.',
   ARRAY['backend-language','backend-framework','database','orm','auth','hosting','api','jobs']::text[]),
  ('Full-Stack Web App', 'full-stack-web-app', 'advanced',
   'Production-grade full-stack stack with backend language/framework, data layer, queues, and deploy strategy',
   'Design a production-grade full-stack web application. Choose the backend programming language and framework, the relational database and ORM, the API layer, authentication, the background job and queue system, and the hosting platform. Define data-model boundaries, asynchronous processing for long-running work, observability, and a deployment and migration strategy that supports schema evolution without downtime. Justify each stack choice for maintainability and scale.',
   ARRAY['backend-language','backend-framework','database','orm','auth','hosting','api','jobs']::text[]),
  ('AI Agent Application', 'ai-agent-application', 'beginner',
   'AI agent app with retrieval, web search, and multi-provider LLM access',
   'Build an AI agent application that answers user questions using your own documents and the live web. Choose an agent framework, a vector database for retrieval, a web search API for fresh information, and a way to call LLMs across providers. Include a backend language and framework, a database, and hosting.',
   ARRAY['ai','agent-frameworks','agentic-web-search','vector-db','llm-gateway','browser-automation','llm-observability','llm-evals','backend-language','backend-framework','database','hosting']::text[]),
  ('AI Agent Application', 'ai-agent-application', 'intermediate',
   'Agentic app with RAG, web search, browser automation, an LLM gateway, and evals',
   'Build an AI agent application that combines retrieval over a private knowledge base with live web search and tool use, including browser automation for tasks the agent performs on the web. Choose the agent framework, vector database, web search API, and an LLM gateway for routing across providers, plus observability and evaluation tooling. Specify the backend language and framework, database, and hosting.',
   ARRAY['ai','agent-frameworks','agentic-web-search','vector-db','llm-gateway','browser-automation','llm-observability','llm-evals','backend-language','backend-framework','database','hosting']::text[]),
  ('AI Agent Application', 'ai-agent-application', 'advanced',
   'Production agentic app: framework, vector DB, web search, browser automation, gateway, observability, evals',
   'Design a production-grade agentic AI application: an agent framework orchestrating retrieval over a vector database, live web search, browser automation, and multi-step tool use, served through an LLM gateway that handles routing, caching, rate limiting, and cost controls across providers. Define the backend language and framework, database, and hosting. Add tracing and observability plus evaluation pipelines that measure groundedness, tool-call correctness, and regression risk before changes ship, and address failure handling for retrieval, search, and browser tasks.',
   ARRAY['ai','agent-frameworks','agentic-web-search','vector-db','llm-gateway','browser-automation','llm-observability','llm-evals','backend-language','backend-framework','database','hosting']::text[])
) AS v(title, slug, level, description, content_md, expected_categories)
ON CONFLICT ("slug", "level") DO NOTHING;
