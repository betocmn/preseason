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
- Color pass: recolored simple-icons and upgraded selected assets, commits
  `df40939` and `183c90c`

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
2. Official brand/media-kit colored logo
3. Official project repository colored logo
4. `simple-icons` with explicit brand hex fill
5. Last resort: closest official parent-product logo (document this decision)
6. Monochrome-only logo when no trustworthy color asset exists

## Color First Policy

Always prefer multicolor brand assets when available.

- Do not convert raw `simple-icons` SVG directly without setting fill color.
- If using `simple-icons`, inject `fill="#<hex>"` from
  `_data/simple-icons.json` before conversion.
- Accept monochrome only when official and community sources do not provide a
  reliable color variant.

Known monochrome-by-default slugs as of April 2, 2026:

- `next-js`
- `flask`
- `ghost`
- `tremor`
- `recharts`

Useful colored-source examples from completed batches:

- `react-native-paper` from
  `https://raw.githubusercontent.com/callstack/react-native-paper/main/docs/static/images/paper-logo.svg`
- `mux` from
  `https://cdn.sanity.io/images/2ejqxsnu/production/3018ded4b1220fd0329c82e150fd22fcbd832ce3-280x48.png`
- `opentelemetry` from
  `https://opentelemetry.io/img/logos/opentelemetry-logo-nav.png`

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
6. Run a quick color sanity check on new files and replace obvious unintended
   monochrome outputs.
7. Commit assets.
8. Generate SQL updates to run after deploying the branch.

Color sanity check example:

```bash
python3 - <<'PY'
from PIL import Image
import colorsys
for slug in ['react-native-paper', 'mux']:
    img = Image.open(f'public/logos/{slug}.png').convert('RGBA')
    sats = []
    for r, g, b, a in img.getdata():
        if a < 16:
            continue
        sats.append(colorsys.rgb_to_hsv(r/255, g/255, b/255)[1])
    avg = sum(sats) / len(sats) if sats else 0
    print(slug, round(avg, 3))
PY
```

Interpretation:

- `avg_sat` near `0.0` means likely monochrome.
- Low saturation can still be valid for some brand palettes; verify manually
  before replacing.

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
