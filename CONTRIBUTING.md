# Contributing to Preseason

Thanks for considering a contribution. Preseason is a small open-source
project and pull requests of any size are welcome — typo fixes, new tests,
new tools in the catalog, a fresh dashboard, or a whole new feature.

## Before you start

1. **Read the [`README.md`](README.md)** for a project overview.
2. **Skim [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** for the
   high-level picture.
3. **Glance at open issues** — especially ones tagged
   [`good first issue`](https://github.com/betocmn/preseason/labels/good%20first%20issue)
   or [`help wanted`](https://github.com/betocmn/preseason/labels/help%20wanted).
4. For non-trivial changes, **open an issue first** to discuss the approach
   before sending code. It avoids "I built the wrong thing" energy.

## Set up

Local setup is documented in [`docs/SETUP.md`](docs/SETUP.md). The short
version is `pnpm install && supabase start && pnpm run db:migrate && pnpm run db:seed && pnpm run dev`.

If you run into setup friction, please open an issue — we treat setup
failures as bugs in the docs.

## Project layout

- `src/app/` — Next.js App Router pages (public, admin, provider, auth)
- `src/server/` — Drizzle schema (`db/`) and tRPC routers (`api/`)
- `src/components/` — React components (shadcn/ui under `ui/`)
- `src/lib/` — small utilities (Supabase clients, helpers)
- `src/constants/server-settings.ts` — global non-frontend constants
- `docs/guides/` — deep-dive guides on individual subsystems
- `docs/implementation/` — internal planning docs (less polished, still useful context)

## Branching, commits, and PRs

- **Branch name:** anything descriptive. `fix-prompt-parser`, `add-stripe-tool`,
  `refactor-rankings` are all fine. No required prefix.
- **Commit messages:** semantic conventional commits with no scope parens.
  - `feat: add Stripe to the payments catalog`
  - `fix: handle empty appendix from Gemini`
  - `docs: clarify cron timing in how-benchmarks-work`
  - Other prefixes we use: `chore`, `refactor`, `test`, `perf`.
  - **Do not add AI attribution** to commit messages (no `Co-Authored-By:
    Claude` etc.).
- **PRs:** one focused change per PR. Smaller PRs land faster. The
  [`PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) lays out
  the sections we look for.

## Before you push

```bash
pnpm run check          # lint + typecheck (fast)
pnpm run test           # full test suite (slow, uses Testcontainers)
pnpm run format         # auto-format with Biome
```

CI will run the same checks on your PR. If you can't run the full test
suite locally (Docker required), say so in the PR description and CI will
verify.

## Database changes

- Edit `src/server/db/schema.ts`.
- Run `pnpm run db:generate` to produce a migration.
- Review the generated SQL in `drizzle/`. **Never** hand-edit the generated
  migration files or anything under `drizzle/meta/`.
- Run `pnpm run db:migrate` locally to apply.
- All tables use the `preseason_*` prefix (enforced by `pgTableCreator`).
- Always pair `update` / `delete` with `.where()`.

## Code style

- TypeScript with `~/` import alias.
- Prefer `type` over `interface`.
- Use Zod for input validation at boundaries.
- Co-locate tests as `*.test.ts` next to the implementation.
- Server Components by default; add `"use client"` only for hooks/state/events.
- English only — no i18n.
- Dark mode default, with `next-themes` toggle.

## Adding a new tool to the catalog

1. Add the entry to `src/server/db/ai-devtools-catalog.ts`.
2. Drop a logo at `public/logos/<slug>.png` (transparent background preferred,
   any size up to ~512×512).
3. Run `pnpm run db:seed` locally to verify it inserts cleanly.
4. Open a PR. We may suggest small wording tweaks for the description.

## Reporting issues

- **Bugs:** open a [Bug Report](https://github.com/betocmn/preseason/issues/new?template=bug_report.md)
  with steps to reproduce.
- **Feature ideas:** open a [Feature Request](https://github.com/betocmn/preseason/issues/new?template=feature_request.md)
  and explain the use case before the solution.
- **Security:** see [`SECURITY.md`](SECURITY.md) — do not file public
  issues for security problems.
- **Conduct concerns:** see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Triage SLA

We aim to:

- **Acknowledge new issues within 7 days.**
- **Respond to PRs within 7 days.**
- **Make a merge / change-request decision on focused PRs within 14 days.**

If a thread goes quiet, feel free to nudge it — we may have missed the
notification.

## Releases

There is no formal release cadence yet; `main` is treated as the rolling
release. We will introduce tags + release notes once external deployers
ask for them.

---

Thanks again. The point of opening this up is to make the methodology and
the data better than any one person can keep it. Bring your prompts, bring
your gripes, bring your fork.
