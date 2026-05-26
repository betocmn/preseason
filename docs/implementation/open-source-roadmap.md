# Open Source Roadmap

A staged plan for taking Preseason from a private project to a fully open-source
release ready to share on Hacker News. Each ticket is a single self-contained
PR. Items are listed in roughly the order they should ship — later tickets
assume earlier ones are merged.

**Goal:** A polished, welcoming, easy-to-self-host repo with a clear license,
contribution path, deployable demo, and launch artifacts.

**Status legend:** `[TODO]` `[DONE]` `[TBD]`

---

## PR 1: Add License `[TODO]`

**Goal:** Add an OSI-approved license file so the project is legally
redistributable. Without this, nothing else matters.

### Scope

- Add `LICENSE` at repo root (recommend MIT for maximum permissiveness and
  Hacker News compatibility, or Apache 2.0 if patent grants matter)
- Add a one-line license badge to `README.md`
- Add a copyright header policy decision to `AGENTS.md` (recommend: no headers
  in source files — license file at root is sufficient)
- Update `package.json` — set `"license": "MIT"` and unset `"private": true`
  once ready for npm-style discovery (keep `private` until ready to publish)

**Verify:** `LICENSE` file exists, referenced from `README.md` and
`package.json`.

---

## PR 2: Strip Personal & Workspace-Specific Identifiers `[TODO]`

**Goal:** Remove anything tying the repo to a specific person or tooling
workspace so contributors land in a neutral codebase.

### Scope

- `src/server/db/seed.ts` — Replace hardcoded `ADMIN_USERS = [{ email:
  'humberto.mn@gmail.com', displayName: 'Beto' }]` with reading from
  `SEED_ADMIN_EMAIL` / `SEED_ADMIN_NAME` env vars (with sensible placeholder
  defaults like `admin@example.com`)
- `src/env.js` — Add `SEED_ADMIN_EMAIL` and `SEED_ADMIN_NAME` as optional
  server env vars
- `.env.example` — Document the new admin env vars
- Grep the codebase for personal email addresses, names, internal URLs and
  remove or genericize them
- Move `conductor.json` and `.agents/` (if checked in) into `.gitignore` or
  delete; these are workspace-tool specific and shouldn't ship to public users
- Decide whether `CLAUDE.md` / `AGENTS.md` stay — recommend keeping both as
  they document codebase conventions usefully, but rename headings to neutral
  "AI Agent Guidelines" framing instead of tool-specific

**Verify:** `git grep` for personal emails/names returns nothing. Fresh clone
+ `pnpm db:seed` works with default env values.

---

## PR 3: Author the Public README `[TODO]`

**Goal:** Rewrite `README.md` so a Hacker News visitor immediately understands
what this is, why it exists, and can try it in under 5 minutes.

### Scope

- Top section: project tagline, hero screenshot/GIF, badges (license, CI
  status, stars), demo URL, "Star on GitHub" CTA
- "What is Preseason?" — 3-sentence elevator pitch focused on the user value
  (tracks what LLMs recommend across a frozen benchmark protocol)
- "Why open source?" — short paragraph explaining the project's mission
- "Live demo" section linking the hosted instance
- Screenshots / animated GIFs of the homepage, rankings, match detail
- Move the deep setup instructions into a `docs/SETUP.md` and link from
  README; keep the README setup section to a 5-line quick start
- Add a "How it works" diagram (ASCII or linked PNG) showing the
  prompt-LLM-recommendation pipeline
- Add "Contributing" link to the new `CONTRIBUTING.md`
- Add "License" section at the bottom

**Verify:** Visual review on GitHub web UI. README renders cleanly, no broken
links, all images load.

---

## PR 4: Contribution Guide & Community Files `[TODO]`

**Goal:** Tell prospective contributors how to engage with the project.

### Scope

- Add `CONTRIBUTING.md` covering: repo layout pointer, dev setup pointer,
  branch naming, commit style (semantic commits, no AI attribution), running
  tests, opening issues, opening PRs, code review expectations
- Add `CODE_OF_CONDUCT.md` — use Contributor Covenant 2.1 verbatim
- Add `SECURITY.md` — describe how to privately report security issues
  (email + expected response time), reference the database role model
- Add `.github/ISSUE_TEMPLATE/bug_report.md`,
  `.github/ISSUE_TEMPLATE/feature_request.md`, and
  `.github/ISSUE_TEMPLATE/config.yml` to configure issue UI
- Add `.github/PULL_REQUEST_TEMPLATE.md` covering: summary, screenshots,
  test plan, related issue
- Add `.github/FUNDING.yml` if you want sponsorship links (optional)

**Verify:** All files referenced from README. Open a test issue/PR and confirm
templates render.

---

## PR 5: One-Click Deploy & Self-Hosting Guide `[TODO]`

**Goal:** Make it trivial for someone reading the HN post to spin up their
own instance.

### Scope

- Add `docs/SELF_HOSTING.md` with three deployment paths:
  - **Vercel + Supabase Cloud** (recommended easy path) — step-by-step with
    `Deploy to Vercel` button URL pre-wired to the repo
  - **Local self-hosted with Docker Compose** — provide a `docker-compose.yml`
    that brings up Postgres + the Next.js app
  - **Bring your own infrastructure** — list the env vars and external
    services required (Postgres, OpenRouter, optional Supabase Auth)
- Add the `Deploy to Vercel` button to README
- Add a "Configuration" section listing every env var, what it does, whether
  it's required, and how to obtain it
- Document cron setup outside Vercel (e.g., GitHub Actions, system cron,
  fly.io machines)

**Verify:** Do a clean Vercel deploy following only the docs. Note any
friction and fix it in the same PR.

---

## PR 6: Architecture & Concepts Docs `[TODO]`

**Goal:** Help curious technical readers (HN audience) understand the
internals quickly.

### Scope

- Add `docs/ARCHITECTURE.md` — high-level system diagram, data flow from
  cron → LLM call → response parse → recommendation → ranking/match
- Audit existing `docs/guides/*.md` for completeness; promote the most
  important guides (how-benchmarks-work, how-prompts-work, recommendation-
  methodology) into the README's "Learn More" section
- Add a `docs/CONCEPTS.md` glossary defining: prompt, run, case result, case
  decision, recommendation, match, season, critic, QC, tool candidate
- Add an explicit "Methodology" doc at the repo root or top of docs that a
  reader can cite — this is critical for credibility when results are
  public-facing
- Add a `docs/ROADMAP.md` (public-facing) summarizing where the project is
  heading, derived from but separate from `docs/implementation/dev-roadmap.md`

**Verify:** Each doc has at least one inbound link from README or another
doc. No orphan docs.

---

## PR 7: Demo Mode & Demo Data Seed `[TODO]`

**Goal:** Anyone running the project locally should see a populated UI in
under 60 seconds, not an empty shell.

### Scope

- Audit `db:seed-benchmark` and `db:seed-test` — make sure they produce a
  visually impressive populated state (rankings, matches, comments)
- Add a single `pnpm run setup` script that wraps install + supabase start +
  migrate + seed-all into one command for the demo path
- Document the demo seed clearly in README's quick start
- Optionally add a `DEMO_MODE=true` env flag that disables write operations
  in the admin UI so a public demo deployment can't be vandalized
- Make sure all seeded data uses fictional/clearly-labeled-as-sample
  identifiers, not real production-looking content

**Verify:** From a fresh clone, run the quick-start commands and confirm the
homepage shows non-empty rankings and matches.

---

## PR 8: Repo Hygiene & License Audit `[TODO]`

**Goal:** Make sure nothing in the repo is incompatible with public release.

### Scope

- Run a dependency license audit (`pnpm licenses list` or a tool like
  `license-checker`); flag any GPL/AGPL/restrictive licenses for review
- Audit `public/` folder — confirm all logos in `public/logos/` are either
  trademarks used under fair use (with attribution) or assets you have
  rights to. Document the policy in `docs/LOGO_POLICY.md`
- Audit critics' photos in `public/critics/` — same review
- Remove or genericize any committed dotfiles tied to your dev environment
  (`.idea/`, `.vscode/` if personal)
- Run `git log` for any commits that reference internal company names,
  private URLs, or secrets — if found, document a plan (history rewrite is
  destructive and should be a separate user-approved action)
- Verify `.env.local` and any secret files are properly gitignored and not
  in history

**Verify:** `pnpm licenses list` output reviewed and any incompatible deps
swapped. No proprietary assets remain.

---

## PR 9: CI Polish & Public Quality Signals `[TODO]`

**Goal:** Strong CI gives contributors confidence to send PRs and signals
project quality to HN readers.

### Scope

- Extend `.github/workflows/ci.yml` to also run on PRs from forks (currently
  configured but verify secret-free jobs work for fork PRs)
- Add status badges to README for: CI passing, license, latest release
- Add a `.github/workflows/codeql.yml` for security scanning
- Add a Dependabot or Renovate config (`.github/dependabot.yml`) for
  automated dependency updates
- Optionally add a release workflow that tags versions and generates
  release notes
- Add CodeRabbit or similar PR auto-review (optional, but signals quality)

**Verify:** Open a draft PR from a fork (or a branch) and confirm all CI
jobs run and pass.

---

## PR 10: Make Domain Content Configurable `[TODO]`

**Goal:** Strip baked-in assumptions so the project is reusable for anyone
who wants to benchmark a different domain.

### Scope

- Audit `src/server/db/ai-devtools-catalog.ts` and `prompt-corpus.ts` — these
  encode the "AI devtools benchmark" content. Move them behind a configurable
  "domain pack" abstraction so a fork can ship a different catalog
- Document in `docs/CUSTOMIZATION.md` how to author a new domain pack (new
  tools, categories, prompts)
- Make brand assets (logo, name, colors) configurable via a single config
  file or env vars so forks can rebrand without code edits
- Move `src/constants/server-settings.ts` defaults that look domain-specific
  into the domain pack

**Note:** This is the biggest ticket on the list — split into sub-PRs if
needed (one for catalog, one for prompts, one for branding).

**Verify:** Spin up a fork with a different catalog and confirm the app
runs end-to-end without code changes.

---

## PR 11: Hacker News Launch Artifacts `[TODO]`

**Goal:** Prepare everything needed for the actual HN submission day.

### Scope

- Write the HN post draft and save as `docs/hn-launch-post.md` (do not
  commit publicly until launch day if you want to keep it private — use a
  draft branch). Title format: `Show HN: Preseason – Track what LLMs
  recommend for vibe-coding prompts`
- Prepare a short demo video or screen-recording GIF (link in README and
  HN post)
- Prepare 3-5 polished screenshots for the README and any social posts
- Write a 2-paragraph "why I built this" blog post / project page for
  visitors who want background — link from README
- Have answers ready for predictable HN questions: methodology bias, model
  selection, how recommendations are extracted, cost, who funds this
- Pre-warm the demo deploy (run a real benchmark season so visitors see
  populated data, not empty rankings)
- Have monitoring in place (uptime check, error tracking like Sentry, basic
  analytics) so you can respond to the traffic spike

**Verify:** Run through the HN post end-to-end with a friend who hasn't seen
the project. Time to "I get it" should be under 30 seconds.

---

## PR 12: Post-Launch Maintenance Setup `[TODO]`

**Goal:** Don't drown on launch day. Have systems ready to triage issues
and engage contributors.

### Scope

- Enable GitHub Discussions and seed it with 2-3 starter threads (intro,
  roadmap discussion, "what should we benchmark next")
- Decide on a public chat channel (Discord, Slack, or skip) and link from
  README if you create one
- Pin a "How to contribute" issue
- Label common issues with `good first issue` and `help wanted` to attract
  first-time contributors
- Set up basic uptime monitoring on the demo URL with a public status page
- Document your triage SLA in `CONTRIBUTING.md` (e.g., "we respond to
  issues within X days")

**Verify:** Friends/early contributors can open issues and get a response
within the stated SLA.

---

## Dependency Graph

```
PR 1 (License) ──┬─► PR 2 (Strip identifiers)
                 │
                 ├─► PR 3 (README) ──┬─► PR 5 (Deploy guide) ──► PR 11 (HN launch)
                 │                   │
                 ├─► PR 4 (Contributing/CoC) ─┘
                 │
                 ├─► PR 6 (Architecture docs)
                 │
                 ├─► PR 7 (Demo data)
                 │
                 ├─► PR 8 (Hygiene/license audit)
                 │
                 ├─► PR 9 (CI polish)
                 │
                 └─► PR 10 (Configurable domain) ──► PR 11

PR 11 (HN launch) ──► PR 12 (Post-launch maintenance)
```

**Critical path to launch:** PRs 1, 2, 3, 4, 5, 7, 8, 11. The rest
(architecture docs, CI polish, configurable domain, post-launch
maintenance) can ship in parallel or after launch without blocking.

**Recommended minimum for HN-ready:** PRs 1–8 + 11. PRs 9, 10, 12 are
quality multipliers but not blockers.
