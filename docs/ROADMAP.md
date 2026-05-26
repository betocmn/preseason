# Public Roadmap

This roadmap covers what we plan to ship next in the open-source project.

## Current Status (May 26, 2026)

- Benchmark-first pipeline is live in this repository.
- Public-facing docs and contributor workflows are being finalized for wider
  adoption.

## Near-Term Priorities

### 1) Launch Readiness

- Improve first-run setup and self-hosting reliability
- Publish clear operational checklists for maintainers
- Tighten CI and security scanning defaults

### 2) Data Quality and Observability

- Better visibility into run failures and parser invalid rates
- More explicit QC reporting in admin surfaces
- Better tooling for unresolved tool candidate review

### 3) Developer Experience

- Faster local bootstrap and demo data workflows
- Better docs for extension points and data model navigation
- Clearer issue templates and contribution pathways

## Medium-Term Work

### Configurable Domain Packs (Planned)

Today, the prompt corpus is intentionally web/SaaS-centric. We plan to add
configurable domain packs so maintainers can run the same benchmark protocol on
alternative domains (for example mobile apps, data science workflows, or game
development pipelines).

This will likely land as multiple sub-PRs because it touches prompt corpus
management, season freezing UX, and scoring presentation.

### Methodology Extensions

- Additional benchmark windows and trend views
- Better cross-season comparison support
- Optional expanded model-tier weighting profiles

### Hosting/Operations Hardening

- Stronger Docker self-hosting path
- Better production diagnostics
- Documented upgrade playbooks between schema/protocol revisions

## Out of Scope for Now

- Rewriting historical benchmark records
- Automated claim generation outside supported publication thresholds
- Domain-pack rollout without frozen-season guarantees

## How to Influence Priorities

- Open a feature request with the use case and success criteria
- Share methodology concerns in Discussions
- Contribute focused PRs tied to roadmap items
