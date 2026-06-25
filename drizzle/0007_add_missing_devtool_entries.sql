-- Custom SQL migration file, put your code below! --

-- Add GitHub Copilot, Weights & Biases, and Llama to the tool catalog with logo URLs.
-- Mirrors src/server/db/ai-devtools-catalog.ts and src/server/db/seed.ts.
--
-- Idempotent (safe to re-run): inserts use ON CONFLICT DO NOTHING; logo_url updates are
-- idempotent assignments.

-- 1. New tools.
INSERT INTO "preseason_tool" ("id", "name", "slug", "description", "website", "createdAt")
SELECT gen_random_uuid(), v.name, v.slug, v.description, v.website, now()
FROM (VALUES
  ('GitHub Copilot', 'github-copilot', 'AI pair programmer integrated into editors and GitHub', 'https://github.com/features/copilot'),
  ('Weights & Biases', 'weights-biases', 'ML experiment tracking, evaluation, and LLM observability platform', 'https://wandb.ai'),
  ('Llama', 'llama', 'Meta open-source large language model family', 'https://www.llama.com')
) AS v(name, slug, description, website)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- 2. Aliases.
INSERT INTO "preseason_tool_alias" ("id", "tool_id", "alias", "normalized_alias", "source", "createdAt")
SELECT gen_random_uuid(), t.id, v.alias, lower(trim(v.alias)), 'seed', now()
FROM (VALUES
  ('github-copilot', 'Copilot'),
  ('github-copilot', 'GitHub Copilot'),
  ('weights-biases', 'W&B'),
  ('weights-biases', 'Weights and Biases'),
  ('weights-biases', 'wandb'),
  ('llama', 'Meta Llama'),
  ('llama', 'Llama 3')
) AS v(tool_slug, alias)
JOIN "preseason_tool" t ON t.slug = v.tool_slug
ON CONFLICT ("normalized_alias") DO NOTHING;
--> statement-breakpoint

-- 3. Tool ↔ category assignments.
INSERT INTO "preseason_tool_category" ("id", "tool_id", "category_id", "is_primary")
SELECT gen_random_uuid(), t.id, c.id, v.is_primary
FROM (VALUES
  ('github-copilot', 'llm-coding-agents', true),
  ('weights-biases', 'llm-observability', true),
  ('weights-biases', 'llm-evals', false),
  ('llama', 'ai', true)
) AS v(tool_slug, category_slug, is_primary)
JOIN "preseason_tool" t ON t.slug = v.tool_slug
JOIN "preseason_category" c ON c.slug = v.category_slug
ON CONFLICT ("tool_id", "category_id") DO NOTHING;
--> statement-breakpoint

-- 4. Logo URLs (requires logo PNGs deployed under public/logos/).
UPDATE "preseason_tool" SET "logo_url" = '/logos/github-copilot.png' WHERE "slug" = 'github-copilot';
--> statement-breakpoint
UPDATE "preseason_tool" SET "logo_url" = '/logos/weights-biases.png' WHERE "slug" = 'weights-biases';
--> statement-breakpoint
UPDATE "preseason_tool" SET "logo_url" = '/logos/llama.png' WHERE "slug" = 'llama';
