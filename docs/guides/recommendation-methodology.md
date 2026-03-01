# Recommendation Methodology

## Goal

Capture realistic model behavior while still producing structured data for rankings and matches.

## Core approach

Preseason uses a two-stage pipeline:

1. **Generation stage (realism-first)**
   - Send the original prompt text from `src/server/llm/prompts/<level>/`.
   - Use a light, level-aware system prompt.
   - Avoid forcing category lists or strict output structure in the first response.

2. **Normalization stage (structure-on-demand)**
   - Parse the raw response with `parseRecommendations`.
   - If parsing returns no recommendations, run one fallback extraction completion with strict JSON and known categories.
   - Parse fallback output and persist recommendations.

This keeps first-pass behavior closer to real user interactions while preserving ingestion reliability.

## Prompt levels

Prompt levels are treated as separate populations:

- `vibe-coder`
- `software-dev-beginner`
- `software-dev-experienced`

Rankings and feed queries should be filtered or segmented by level when comparing model behavior.

## Follow-up turns

Single-turn is default for cost and consistency. Follow-up turns are allowed when needed:

- extraction fallback (already implemented)
- future level-specific clarification turns (optional, must be explicit and deterministic)

## Guardrails

- Only third-party tools are stored as recommendations.
- Unknown tool names are auto-created as unverified entries for admin review.
- `expectedCategories` is used as a validation signal, not as a hard generation constraint.
