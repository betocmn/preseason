# Next 30 Ranked Tools For Logo Sync

- Generated: 2026-04-02
- Selection: first 30 missing `public/logos/<slug>.png` from top 200 ranked tools

## Query

```sql
WITH current_season AS ( SELECT s.id FROM preseason_benchmark_season s JOIN preseason_benchmark_protocol p ON p.id = s.protocol_id WHERE p.mode = 'benchmark' AND s.status = 'active' ORDER BY s."createdAt" DESC LIMIT 1 ), published_runs AS ( SELECT r.id FROM preseason_benchmark_run r WHERE r.season_id = (SELECT id FROM current_season) AND r.status = 'published' ORDER BY r."createdAt" DESC LIMIT 28 ) SELECT t.slug, t.name, COALESCE(t.website, ''), COUNT(*)::int AS mentions FROM preseason_benchmark_case_decision d JOIN preseason_benchmark_case_result r ON r.id = d.case_result_id JOIN preseason_tool t ON t.id = d.tool_id WHERE r.run_id IN (SELECT id FROM published_runs) AND r.status = 'completed' AND d.resolution_status = 'resolved' AND d.decision_type = 'tool' GROUP BY t.slug, t.name, t.website ORDER BY mentions DESC, t.slug ASC LIMIT 200;
```

## Selected Slugs

| # | Slug | Name | Mentions |
| --- | --- | --- | ---: |
| 1 | kong | Kong | 22 |
| 2 | metabase | Metabase | 19 |
| 3 | ghost | Ghost | 18 |
| 4 | redux | Redux | 17 |
| 5 | kubernetes | Kubernetes | 16 |
| 6 | fastapi | FastAPI | 15 |
| 7 | wordpress | WordPress | 14 |
| 8 | mailchimp | Mailchimp | 13 |
| 9 | shopify | Shopify | 13 |
| 10 | opensearch | OpenSearch | 12 |
| 11 | amazon-rds | Amazon RDS | 11 |
| 12 | chart-js | Chart.js | 11 |
| 13 | okta | Okta | 11 |
| 14 | redis | Redis | 11 |
| 15 | sequelize | Sequelize | 10 |
| 16 | apache-kafka | Apache Kafka | 9 |
| 17 | next-js | Next.js | 9 |
| 18 | react-native-paper | React Native Paper | 8 |
| 19 | amazon-sns | Amazon SNS | 7 |
| 20 | hubspot | HubSpot | 7 |
| 21 | mux | Mux | 7 |
| 22 | mysql | MySQL | 7 |
| 23 | timescaledb | TimescaleDB | 7 |
| 24 | decap-cms | Decap CMS | 6 |
| 25 | opentelemetry | OpenTelemetry | 6 |
| 26 | segment | Segment | 6 |
| 27 | teachable | Teachable | 6 |
| 28 | tremor | Tremor | 6 |
| 29 | digitalocean | DigitalOcean | 5 |
| 30 | flask | Flask | 5 |

## Sources

| Slug | Source URL |
| --- | --- |
| kong | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/kong.svg |
| metabase | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/metabase.svg |
| ghost | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/ghost.svg |
| redux | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/redux.svg |
| kubernetes | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/kubernetes.svg |
| fastapi | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/fastapi.svg |
| wordpress | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/wordpress.svg |
| mailchimp | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/mailchimp.svg |
| shopify | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/shopify.svg |
| opensearch | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/opensearch.svg |
| amazon-rds | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/amazonrds.svg |
| chart-js | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/chartdotjs.svg |
| okta | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/okta.svg |
| redis | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/redis.svg |
| sequelize | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/sequelize.svg |
| apache-kafka | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/apachekafka.svg |
| next-js | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/nextdotjs.svg |
| react-native-paper | https://callstack.github.io/react-native-paper/images/sidebar-logo.svg |
| amazon-sns | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/amazonwebservices.svg |
| hubspot | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/hubspot.svg |
| mux | https://cdn.sanity.io/images/2ejqxsnu/production/7d8925312aed3d83ed67fc27e65743cada225d29-1423x236.svg |
| mysql | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/mysql.svg |
| timescaledb | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/timescale.svg |
| decap-cms | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/decapcms.svg |
| opentelemetry | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/opentelemetry.svg |
| segment | https://www.vectorlogo.zone/logos/segment/segment-icon.svg |
| teachable | https://cdn.prod.website-files.com/687904fb2b26c434698c47e9/68daba31282892b31e937809_teachable-logo-color.svg |
| tremor | https://raw.githubusercontent.com/tremorlabs/tremor/main/public/images/tremor-logo-dark.svg |
| digitalocean | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/digitalocean.svg |
| flask | https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/flask.svg |
