-- Custom SQL migration file, put your code below! --

-- Update the tracked LLM catalog to the latest model versions (June 2026).
-- Archived (superseded) models are NOT deleted: their rows and all historical
-- benchmark data are preserved, and they are merely marked is_active = false so
-- they are excluded from new benchmark seasons while still counting in rankings.
-- This migration is idempotent (safe to re-run) and mirrors src/server/llm/catalog.ts.

-- 1. Add the latest model versions (active). Upsert on slug so re-runs are no-ops.
INSERT INTO "preseason_llm"
  ("id", "name", "slug", "provider", "company", "model_family", "model_version", "model_id", "is_active", "createdAt")
VALUES
  (gen_random_uuid(), 'GPT 5.5',           'gpt-5-5',           'openai',     'OpenAI',     'GPT',          '5.5',      'openai/gpt-5.5',             true, now()),
  (gen_random_uuid(), 'Claude Opus 4.8',   'claude-opus-4-8',   'anthropic',  'Anthropic',  'Opus',         '4.8',      'anthropic/claude-opus-4.8',  true, now()),
  (gen_random_uuid(), 'Gemini 3.5 Flash',  'gemini-3-5-flash',  'google',     'Google',     'Gemini Flash', '3.5',      'google/gemini-3.5-flash',    true, now()),
  (gen_random_uuid(), 'GLM 5.2',           'glm-5-2',           'zai',        'Z.ai',       'GLM',          '5.2',      'z-ai/glm-5.2',               true, now()),
  (gen_random_uuid(), 'MiniMax M3',        'minimax-m3',        'minimax',    'MiniMax',    'MiniMax M',    '3',        'minimax/minimax-m3',         true, now()),
  (gen_random_uuid(), 'MiMo V2.5 Pro',     'mimo-v2-5-pro',     'xiaomi',     'Xiaomi',     'MiMo V2',      '2.5 Pro',  'xiaomi/mimo-v2.5-pro',       true, now()),
  (gen_random_uuid(), 'DeepSeek V4 Pro',   'deepseek-v4-pro',   'deepseek',   'DeepSeek',   'DeepSeek V',   '4 Pro',    'deepseek/deepseek-v4-pro',   true, now()),
  (gen_random_uuid(), 'DeepSeek V4 Flash', 'deepseek-v4-flash', 'deepseek',   'DeepSeek',   'DeepSeek V',   '4 Flash',  'deepseek/deepseek-v4-flash', true, now()),
  (gen_random_uuid(), 'Kimi K2.7 Code',    'kimi-k2-7-code',    'moonshotai', 'MoonshotAI', 'Kimi K',       '2.7 Code', 'moonshotai/kimi-k2.7-code',  true, now())
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "provider" = EXCLUDED."provider",
  "company" = EXCLUDED."company",
  "model_family" = EXCLUDED."model_family",
  "model_version" = EXCLUDED."model_version",
  "model_id" = EXCLUDED."model_id",
  "is_active" = true,
  "updatedAt" = now();
--> statement-breakpoint

-- 2. Archive the superseded versions (kept for their historical data / votes).
UPDATE "preseason_llm"
SET "is_active" = false, "updatedAt" = now()
WHERE "slug" IN (
  'gpt-5-4',
  'claude-opus-4-6',
  'gemini-2-5-flash',
  'glm-5-turbo',
  'minimax-m2-7',
  'mimo-v2-pro',
  'deepseek-v3-2',
  'kimi-k2-5'
);
