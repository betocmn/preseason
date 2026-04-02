# Top 50 Ranked Tools For Logo Sync

- Generated: 2026-04-02
- Source: production database

## Query

```sql
WITH current_season AS ( SELECT s.id FROM preseason_benchmark_season s JOIN preseason_benchmark_protocol p ON p.id = s.protocol_id WHERE p.mode = 'benchmark' AND s.status = 'active' ORDER BY s."createdAt" DESC LIMIT 1 ), published_runs AS ( SELECT r.id FROM preseason_benchmark_run r WHERE r.season_id = (SELECT id FROM current_season) AND r.status = 'published' ORDER BY r."createdAt" DESC LIMIT 28 ) SELECT t.slug, COUNT(*)::int AS mentions FROM preseason_benchmark_case_decision d JOIN preseason_benchmark_case_result r ON r.id = d.case_result_id JOIN preseason_tool t ON t.id = d.tool_id WHERE r.run_id IN (SELECT id FROM published_runs) AND r.status = 'completed' AND d.resolution_status = 'resolved' AND d.decision_type = 'tool' GROUP BY t.slug ORDER BY mentions DESC, t.slug ASC LIMIT 50;
```

## Results

| # | Slug | Mentions |
| --- | --- | ---: |
| 1 | prisma | 717 |
| 2 | postgresql | 709 |
| 3 | vercel | 664 |
| 4 | supabase | 427 |
| 5 | auth0 | 360 |
| 6 | firebase | 328 |
| 7 | aws-s3 | 312 |
| 8 | sendgrid | 296 |
| 9 | aws | 292 |
| 10 | tailwind-css | 273 |
| 11 | stripe | 256 |
| 12 | resend | 250 |
| 13 | clerk | 242 |
| 14 | algolia | 239 |
| 15 | shadcn-ui | 194 |
| 16 | posthog | 126 |
| 17 | elasticsearch | 97 |
| 18 | zustand | 95 |
| 19 | typeorm | 83 |
| 20 | cloudflare-r2 | 68 |
| 21 | openweathermap | 67 |
| 22 | twilio | 67 |
| 23 | tanstack-query | 62 |
| 24 | meilisearch | 58 |
| 25 | cloudinary | 56 |
| 26 | railway | 55 |
| 27 | socket-io | 55 |
| 28 | radix-ui | 50 |
| 29 | onesignal | 49 |
| 30 | mui | 48 |
| 31 | pusher | 48 |
| 32 | django | 44 |
| 33 | sqlalchemy | 43 |
| 34 | heroku | 41 |
| 35 | nextauth | 41 |
| 36 | neon | 40 |
| 37 | postmark | 40 |
| 38 | ably | 38 |
| 39 | docusaurus | 35 |
| 40 | mixpanel | 35 |
| 41 | novu | 32 |
| 42 | strapi | 32 |
| 43 | fly-io | 31 |
| 44 | recharts | 28 |
| 45 | firestore | 27 |
| 46 | google-analytics | 25 |
| 47 | clickhouse | 24 |
| 48 | render | 24 |
| 49 | react | 23 |
| 50 | redux-toolkit | 23 |

## Missing Local Logos

- `postgresql`
- `aws`
- `zustand`
- `openweathermap`
- `twilio`
- `tanstack-query`
- `django`
- `sqlalchemy`
- `heroku`
- `docusaurus`
- `recharts`
- `firestore`
- `clickhouse`
- `react`
- `redux-toolkit`
