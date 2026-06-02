# Recommendation Methodology

## Goal

Capture reproducible model behavior without pretending the rankings are an
independent quality review of the tools themselves.

## Core Approach

Preseason now uses a benchmark-only pipeline:

1. Freeze prompt versions and model snapshots into an active season.
2. Run every prompt x model case for that season.
3. Require a strict machine-readable appendix for every eligible category.
4. Store category-level case decisions.
5. Publish rankings and head-to-heads only from benchmark runs that clear QC.

## Parsing Rules

- The benchmark parser is strict.
- There is no heuristic rescue path for malformed output.
- A category decision is one of `tool`, `none`, or `invalid`.
- Unknown tool names are held out of rankings until reviewed through the tool
  candidate workflow.

This is stricter than the old exploration pipeline by design. The system prefers
dropping low-integrity data over guessing what a model meant.

## What Rankings Mean

Rankings reflect what LLMs recommend for the current benchmark panel. They do
not prove that a tool is objectively best.

Interpret every published result with the following scope in mind:

- The prompt panel is currently focused on web application and SaaS scenarios.
- Results are scoped to the active season's frozen prompt and model panel.
- Unresolved tool names do not count until an admin reviews them.
- Confidence intervals communicate statistical uncertainty, not product quality.

## Season 1 Positioning

Season 1 uses uniform model weights and a web-app-heavy prompt corpus. That is a
deliberate choice to keep the first public methodology simple, transparent, and
hard to misread.

For the full scoring, QC, and publication details, see
`docs/guides/how-benchmarks-work.md`.
