# Open Source Launch Checklist

This checklist covers manual launch work that is intentionally not automated in
the codebase.

## 1) Repository Configuration (GitHub UI)

- [ ] Enable **Discussions** in repository settings.
- [ ] Set repository description and topics (example: `llm`, `benchmark`,
      `developer-tools`, `nextjs`, `open-source`).
- [ ] Create and pin a welcome issue.
- [ ] Confirm default branch is `main`.

## 2) Labels and Issue Hygiene

Create baseline labels (safe to rerun with `--force`):

```bash
gh label create bug --color d73a4a --description "Something is broken" --force
gh label create enhancement --color a2eeef --description "New capability request" --force
gh label create documentation --color 0075ca --description "Docs improvements" --force
gh label create good-first-issue --color 7057ff --description "Good first contribution" --force
gh label create help-wanted --color 008672 --description "Maintainers want community help" --force
gh label create needs-triage --color fbca04 --description "Needs maintainer triage" --force
```

## 3) Welcome Issue + Pin

```bash
WELCOME_URL=$(gh issue create \
  --title "Welcome to Preseason open source" \
  --label documentation \
  --body "Thanks for checking out Preseason. Start with README + CONTRIBUTING, and use Discussions for questions.")

gh issue pin "$WELCOME_URL"
```

## 4) Seed Discussions from CLI

First, inspect category IDs:

```bash
OWNER=betocmn
REPO=preseason

gh api graphql \
  -f query='query($owner:String!, $repo:String!) { repository(owner:$owner, name:$repo) { id discussionCategories(first:20) { nodes { id name } } } }' \
  -F owner="$OWNER" \
  -F repo="$REPO"
```

Then create discussions (replace `CATEGORY_ID` with a real ID from the query):

```bash
REPOSITORY_ID=$(gh api graphql \
  -f query='query($owner:String!, $repo:String!) { repository(owner:$owner, name:$repo) { id } }' \
  -F owner="$OWNER" \
  -F repo="$REPO" \
  --jq '.data.repository.id')

CATEGORY_ID="REPLACE_WITH_DISCUSSION_CATEGORY_ID"

gh api graphql \
  -f query='mutation($repositoryId:ID!, $categoryId:ID!, $title:String!, $body:String!) { createDiscussion(input:{repositoryId:$repositoryId, categoryId:$categoryId, title:$title, body:$body}) { discussion { url } } }' \
  -F repositoryId="$REPOSITORY_ID" \
  -F categoryId="$CATEGORY_ID" \
  -F title="How to contribute benchmark ideas" \
  -F body="Share prompt corpus suggestions, scoring concerns, and reproducibility questions here."
```

## 5) Pre-Launch Content + Data

- [ ] Capture screenshots:
  - `public/screenshots/homepage.png`
  - `public/screenshots/rankings.png`
  - `public/screenshots/match.png`
- [ ] Remove README screenshot TODO comment block after images are added.
- [ ] Ensure at least one benchmark season is active and data is populated.
- [ ] Pre-warm benchmark run:

```bash
curl -sS \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://preseason.ai/api/cron/benchmark-run"
```

## 6) Monitoring Setup

Check GitHub Actions quickly during launch window:

```bash
gh run list --limit 10
gh run view --log-failed
```

Optional deploy/runtime checks:

- Vercel dashboard logs for route errors
- Supabase query performance and connection health
- Cron run cadence and unauthorized request noise

## 7) Launch Day Plan

- [ ] Prepare Hacker News post title:
  - `Show HN: Preseason — track what tools LLMs recommend for vibe-coded SaaS`
- [ ] Suggested launch window: Tuesday–Thursday, US morning hours.
- [ ] Keep a maintainer online for at least 2-3 hours after posting.
- [ ] Triage first issues/discussions the same day.
- [ ] Post first-day findings in Discussions for transparency.
