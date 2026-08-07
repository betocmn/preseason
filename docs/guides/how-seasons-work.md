# How Seasons Work

## TL;DR

A season is one frozen benchmark panel: a specific set of prompt versions and
model snapshots that are evaluated together over time.

Once a season is frozen and activated:

- the prompt set is locked
- the model set is locked
- cron adds benchmark runs against that same frozen panel on the 5th, 15th, and 25th of each month at 12:00 UTC

## Why Seasons Exist

Seasons make benchmark history comparable.

If prompts or models changed in place every day, rankings would drift for two
different reasons at once:

1. the tools actually recommended changed
2. the benchmark panel itself changed

A season prevents that. It gives you one stable benchmark edition, then a new
season starts only when you intentionally want a new panel.

## Lifecycle

Typical lifecycle:

- `draft` - season record exists but nothing is frozen yet
- `active` - prompts and models are frozen and cron can run it
- `completed` - the season is no longer the live benchmark panel

`archived` also exists in schema, but the normal admin workflow today is
`draft` -> `active` -> `completed`.

## How Long A Season Lasts

There is no fixed duration in code.

A season lasts until you manually complete it. In practice, that means:

- keep the season active while you want the same prompt panel and model panel
- complete it when you want to change prompts, models, or benchmark framing
- create a new season for the next benchmark edition

So a season can last:

- a day for testing
- a few weeks for a short launch cycle
- much longer if you want a stable public benchmark period

## When To Start A New Season

Start a new season when you want a real panel change, for example:

- adding or removing prompts
- adding or removing models
- changing which prompts are active
- changing the benchmark panel you want the public site to represent

Do not mutate an active season in place.

## Related Docs

- [how-benchmarks-work.md](how-benchmarks-work.md)
