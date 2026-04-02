# How To Retrieve Missing Tool Logons

## Goal

Backfill missing `public/logos/<slug>.png` files for the highest-ranked tools and
prepare SQL updates for `preseason_tool.logo_url` after the image deploy.

This guide is designed for agent handoff:

- "Get me the next top 50 tools missing images."

## What Was Done Previously

Two batches were completed on April 2, 2026:

- Batch 1: top ranked missing set (15 logos), commit `efb186f`
- Batch 2: next ranked missing set (30 logos), commit `7eb70f0`

Batch 1 slugs:

- `aws`, `clickhouse`, `docusaurus`, `django`, `firestore`, `heroku`,
  `openweathermap`, `postgresql`, `recharts`, `react`, `redux-toolkit`,
  `sqlalchemy`, `tanstack-query`, `twilio`, `zustand`

Batch 2 slugs:

- `kong`, `metabase`, `ghost`, `redux`, `kubernetes`, `fastapi`, `wordpress`,
  `mailchimp`, `shopify`, `opensearch`, `amazon-rds`, `chart-js`, `okta`,
  `redis`, `sequelize`, `apache-kafka`, `next-js`, `react-native-paper`,
  `amazon-sns`, `hubspot`, `mux`, `mysql`, `timescaledb`, `decap-cms`,
  `opentelemetry`, `segment`, `teachable`, `tremor`, `digitalocean`, `flask`

## Data Sources

Ranking source: production benchmark decision data, trailing published runs.

Primary tables:

- `preseason_benchmark_season`
- `preseason_benchmark_protocol`
- `preseason_benchmark_run`
- `preseason_benchmark_case_result`
- `preseason_benchmark_case_decision`
- `preseason_tool`

Logo source priority:

1. Existing file in `public/logos/<slug>.png`
2. `simple-icons` CDN slug match
3. Official brand assets or project repository logos
4. Last resort: closest official parent-product logo (document this decision)

## Ranking Query

Use this query to get ranked tools from production:

```sql
WITH current_season AS (
  SELECT s.id
  FROM preseason_benchmark_season s
  JOIN preseason_benchmark_protocol p ON p.id = s.protocol_id
  WHERE p.mode = 'benchmark'
    AND s.status = 'active'
  ORDER BY s."createdAt" DESC
  LIMIT 1
),
published_runs AS (
  SELECT r.id
  FROM preseason_benchmark_run r
  WHERE r.season_id = (SELECT id FROM current_season)
    AND r.status = 'published'
  ORDER BY r."createdAt" DESC
  LIMIT 28
)
SELECT
  t.slug,
  t.name,
  COALESCE(t.website, '') AS website,
  COUNT(*)::int AS mentions
FROM preseason_benchmark_case_decision d
JOIN preseason_benchmark_case_result r ON r.id = d.case_result_id
JOIN preseason_tool t ON t.id = d.tool_id
WHERE r.run_id IN (SELECT id FROM published_runs)
  AND r.status = 'completed'
  AND d.resolution_status = 'resolved'
  AND d.decision_type = 'tool'
GROUP BY t.slug, t.name, t.website
ORDER BY mentions DESC, t.slug ASC;
```

## Procedure For Next Top 50 Missing Logos

1. Export ranked tools from production with a larger limit (for example 300).
2. Select the first 50 slugs that do not already have `public/logos/<slug>.png`.
3. Build a `slug -> source URL` map in a TSV file.
4. Download logos and normalize to `200x200` PNG:

```bash
while IFS=$'\t' read -r slug url; do
  curl -sL "$url" -o ".context/logo-sources/${slug}.src"
  npx -y sharp-cli -i ".context/logo-sources/${slug}.src" \
    -o "public/logos/${slug}.png" resize 200 200 --fit contain
done < /tmp/top50_next_sources.tsv
```

5. Verify every target slug now has a file under `public/logos`.
6. Commit assets.
7. Generate SQL updates to run after deploying the branch.

## SQL Generation

After files are present, generate SQL update lines:

```bash
while IFS= read -r slug; do
  printf "UPDATE preseason_tool SET logo_url = '/logos/%s.png' WHERE slug = '%s';\n" "$slug" "$slug"
done < /tmp/selected_slugs.txt
```

Recommended execution wrapper:

```sql
BEGIN;
-- generated UPDATE lines
COMMIT;
```

## Conventions

- Filename format is strictly `public/logos/<slug>.png`.
- `logo_url` format is strictly `/logos/<slug>.png`.
- Do not run DB updates before image deploy.
- If a direct product logo is unavailable, document the chosen fallback source.
