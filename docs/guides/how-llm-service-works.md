# How LLM Service Works

## Overview

The LLM service is the server-side layer that sends prompts to models via OpenRouter using a provider pattern.

It standardizes one interface for all providers:

- Input: `model`, `systemPrompt`, `userPrompt`
- Output: `content`, `usage`, `finishReason`, `latencyMs`

This lets callers (like automation runner) stay provider-agnostic.

## File structure

```
src/server/llm/service/
  index.ts                 <-- LlmService factory + provider resolution
  types.ts                 <-- shared request/response/provider types
  system-prompt.ts         <-- system prompt template builder
  openrouter-client.ts     <-- low-level OpenRouter HTTP client
  providers/
    base.ts                <-- abstract provider base class
    anthropic.ts
    openai.ts
    google.ts
    meta.ts
    mistral.ts
    deepseek.ts
```

## High-level flow

```
Caller (runner/route)
  -> LlmService.complete(provider, request)
  -> Provider.complete(request)
  -> OpenRouter client complete(model, messages)
  -> OpenRouter /chat/completions
  -> CompletionResponse
```

## Shared types

Defined in `src/server/llm/service/types.ts`:

- `ProviderId`: `anthropic | openai | google | meta | mistral | deepseek`
- `CompletionRequest`:
  - `model`
  - `systemPrompt`
  - `userPrompt`
- `CompletionResponse`:
  - `content`
  - `model`
  - `provider`
  - `finishReason`
  - `usage.promptTokens`
  - `usage.completionTokens`
  - `usage.totalTokens`
  - `latencyMs`

## OpenRouter client

`src/server/llm/service/openrouter-client.ts` handles all low-level transport details.

### API setup

- Uses `openai` npm SDK with:
  - `baseURL: https://openrouter.ai/api/v1`
  - `apiKey: OPENROUTER_API_KEY`
- Sends OpenRouter metadata headers:
  - `HTTP-Referer` (if app URL can be derived)
  - `X-OpenRouter-Title`
  - `X-Title`

### Request/response behavior

- Sends chat completion requests as standard OpenAI-style `messages`.
- Measures and returns latency in milliseconds.
- Normalizes usage/token fields to `0` when missing.
- Converts transport/API failures into a single error string: `OpenRouter completion failed: ...`.

## Provider pattern

### Base provider

`src/server/llm/service/providers/base.ts`:

- Builds two-message prompt:
  - `system`
  - `user`
- Adds model namespace prefix when needed.

Model normalization rules:

1. If model already starts with this provider prefix, keep as-is.
2. If model already contains a slash (`/`), keep as-is.
3. Otherwise prepend provider prefix (e.g. `openai/`).

### Provider-specific prefixes

- Anthropic: `anthropic/`
- OpenAI: `openai/`
- Google: `google/`
- Meta: `meta-llama/`
- Mistral: `mistralai/`
- DeepSeek: `deepseek/`

## Provider resolution

`src/server/llm/service/index.ts` maps free-form provider strings from DB to `ProviderId`.

Supported aliases currently include:

- `mistral ai` -> `mistral`
- `meta-llama` -> `meta`
- `gemini` -> `google`

If provider is unknown, service throws `Unsupported provider`.

## System prompt builders

`src/server/llm/service/system-prompt.ts` provides two prompt builders:

- `buildGenerationSystemPrompt(level)`:
  - Level-aware (`vibe-coder`, `software-dev-beginner`, `software-dev-experienced`)
  - Minimal instructions so responses resemble real user interactions
- `buildExtractionSystemPrompt(categorySlugs)`:
  - Strict JSON + category-constrained format
  - Used only for fallback extraction when primary parsing fails

Fallback extraction contract:

```json
{"recommendations":[{"category":"<slug>","tool":"<name>","reasoning":"<1-2 sentences>","confidence":0.0}]}
```

## Environment

Required/used vars:

- `OPENROUTER_API_KEY` (required for real completions)
- `NEXT_PUBLIC_APP_URL` / `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` (optional, used for `HTTP-Referer`)

## Tests

Provider/service behavior is covered in:

- `src/server/llm/service/providers.test.ts`

It validates prefixing, factory resolution, aliases, and provider error propagation.
