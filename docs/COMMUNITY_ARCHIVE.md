# Community Features — Archived

**Date:** 2026-04-20
**Reason:** Community layer (social feed, adoption listings, causes/donations) archived to focus on core marketplace features pre-launch. Pet-friendly places map retained as utility.

## What's Preserved

- **All code** — service classes, controllers, modules remain intact
- **All Supabase rows** — Cause, Donation, AdoptionPost, AdoptionMessage tables untouched
- **No database migrations** — zero schema changes

## What's Hidden (returns 404 when `ENABLE_COMMUNITY=false`)

- **Social feed** — `POST /social/posts`, `GET /social/feed`, `GET /social/playdates`
- **Adoption listings** — `GET /adoption`, `POST /adoption`, `GET /adoption/:id`, messages
- **Causes & donations** — `GET /causes`, `POST /causes`, `POST /causes/:id/donate`, withdrawals, admin endpoints
- **Community notifications** — adoption messages, cause donations/updates/approvals, withdrawal events all suppressed at emission time

## What's NOT Archived

- **Pet-friendly places** — utility feature, fully active, no dependency on community module

## To Restore

1. Set `ENABLE_COMMUNITY=true` in Railway environment variables
2. Redeploy backend (auto-deploys on env var change)
3. All endpoints return live data immediately — no migration needed
