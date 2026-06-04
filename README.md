# Preseason

**Measure which developer tools LLMs recommend when asked to build real web apps.**

[![CI](https://github.com/betocmn/preseason/actions/workflows/ci.yml/badge.svg)](https://github.com/betocmn/preseason/actions/workflows/ci.yml)
[![CodeQL](https://github.com/betocmn/preseason/actions/workflows/codeql.yml/badge.svg)](https://github.com/betocmn/preseason/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Preseason is an open-source benchmark that measures which developer tools
LLMs recommend when asked to build real web apps.

We run a fixed set of web-app prompts against a fixed panel of models, parse
each answer for recommended tools and services, then publish rankings,
head-to-head comparisons, and methodology notes.

The goal is to make AI-driven developer-tool recommendations inspectable,
reproducible, and contestable, so you can see which tools AI coding assistants
are most likely to put in front of developers.

🌐 **Live demo:** <https://preseason.ai>

![Preseason homepage](public/screenshots/homepage.png)

## What it tracks

Preseason currently tracks recommendations across categories like:

- databases
- auth
- hosting
- analytics
- payments
- email
- background jobs
- UI/component libraries
- observability
- AI/model providers

For each prompt × model run, we record whether the model recommended a known
tool, no tool, or an invalid/unrecognized answer.

## Example questions Preseason can answer

- Which database does each model recommend most often for a new SaaS app?
- Does GPT-4.1 prefer Supabase, Firebase, Neon, or plain Postgres?
- Which tools win head-to-head when two options appear in similar prompts?
- Are some models more likely to recommend "no tool" or hallucinate unknown
  tools?

## Why open source?

Recommendations from AI coding assistants shape developer tool adoption
faster than blog posts or Twitter threads. If a foundation model quietly
favors one database or hosting provider, that preference scales to every
developer using it. We think the methodology behind that should be open,
reproducible, and contestable, not a private dashboard.

Preseason exists so anyone can:

- See **what** today's LLMs recommend, with frozen prompts and model
  snapshots that are inspectable in this repo
- Run **their own** benchmark on their own prompts or model panel
- Submit **issues** when results look off and have an open paper trail

## Current limitations

- The benchmark measures recommendations, not whether a tool is objectively
  better.
- Results depend on the frozen prompt set and model snapshots.
- Tool-name parsing is intentionally strict; unknown names go to review instead
  of being guessed.
- The project is early, so rankings should be treated as directional rather
  than definitive.

## Quick start

```bash
pnpm run setup                  # installs deps and starts local Supabase
cp .env.example .env.local      # fill with `supabase status` + OpenRouter key
pnpm run db:migrate
pnpm run db:seed
pnpm run db:seed-dev
pnpm run dev
```

App is at <http://localhost:3000>. Full setup details, including the env
var table and troubleshooting, are in [`docs/SETUP.md`](docs/SETUP.md).

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbetocmn%2Fpreseason&env=DATABASE_URL,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,OPENROUTER_API_KEY,CRON_SECRET&envDescription=See%20.env.example&envLink=https%3A%2F%2Fgithub.com%2Fbetocmn%2Fpreseason%2Fblob%2Fmain%2F.env.example)

The supported launch path is Vercel + Supabase Cloud. Docker Compose and plain
Postgres self-hosting are not supported yet because Preseason currently depends
on Supabase Auth. See [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md).

## How it works

```
   ┌────────────┐        ┌──────────────┐        ┌─────────────┐
   │  Cron      │───────▶│  OpenRouter  │───────▶│  Response   │
   │  /api/cron │ prompt │  (one model) │ answer │  parser     │
   │  /benchmark│        └──────────────┘        └──────┬──────┘
   └────────────┘                                        │
         ▲                                               ▼
         │ every 6 min                          ┌────────────────┐
         │                                      │  Case decision │
         │                                      │  tool / none / │
         │                                      │  invalid       │
         │                                      └────────┬───────┘
         │                                               │
         │                                               ▼
   ┌─────┴──────┐    QC pass    ┌─────────────────────────────┐
   │  Season    │◀──────────────│  Rankings + head-to-head    │
   │  (frozen)  │               │  matches (public)           │
   └────────────┘               └─────────────────────────────┘
```

Every active **season** freezes a set of prompt versions and model
snapshots. The cron route at `/api/cron/benchmark-run` walks every
prompt × model combination, requires the model to produce a strict
machine-readable appendix, parses each response into a case decision
(`tool` / `none` / `invalid`), and publishes runs that pass QC.

Public pages, including rankings, category indexes, and head-to-head matches,
only read from published benchmark data. Unrecognized tool names are held in a
candidate queue for admin review rather than guessed at.

## Tech stack

- **[Next.js 15](https://nextjs.org)** (App Router, React Server Components)
- **[tRPC v11](https://trpc.io)**: typed API
- **[Drizzle ORM](https://orm.drizzle.team/)** + **[Supabase](https://supabase.com)** (Postgres + email-OTP auth)
- **[OpenRouter](https://openrouter.ai)**: model gateway
- **[Tailwind CSS v4](https://tailwindcss.com)** + **[shadcn/ui](https://ui.shadcn.com)**
- **[Vitest](https://vitest.dev)** + Testcontainers for an integration-tested Postgres
- **[Biome](https://biomejs.dev)** for lint + format

## Documentation

### Get started

- [`docs/SETUP.md`](docs/SETUP.md): local development environment
- [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md): supported deployment path
- [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md): every env var explained

### Learn more

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): system overview
- [`docs/CONCEPTS.md`](docs/CONCEPTS.md): glossary of project terms
- [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md): how rankings are produced
- [`docs/ROADMAP.md`](docs/ROADMAP.md): what's planned next

### Deep dives
- [How Benchmarks Work](docs/guides/how-benchmarks-work.md)
- [How Prompts Work](docs/guides/how-prompts-work.md)
- [How Rankings Work](docs/guides/how-rankings-work.md)
- [How Cron Benchmarks Work](docs/guides/how-cron-benchmarks-work.md)
- [How Matches Work](docs/guides/how-matches-work.md)
- [How LLM Service Works](docs/guides/how-llm-service-works.md)
- [How Evals Work](docs/guides/how-evals-work.md)
- [Recommendation Methodology](docs/guides/recommendation-methodology.md)

## Contributing

Pull requests are very welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for
how to set up, what we look for in PRs, and our triage SLA. New to the
project? Look for issues labelled
[`good first issue`](https://github.com/betocmn/preseason/labels/good%20first%20issue).

We follow the [Contributor Covenant](CODE_OF_CONDUCT.md). Security reports
go through [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE). See the `LICENSE` file. Third-party tool logos under
`public/logos/` are used under nominative fair use; see
[`docs/LOGO_POLICY.md`](docs/LOGO_POLICY.md).
