# werbz Stories — Architecture & Build Plan

Standalone Stories platform for `werbz.com` root.

## Production Route Map

- `/` public Stories library (published only)
- `/studio` public dashboard
- `/studio/[id]` public page editor
- `/studio/analytics` public analytics
- `/[slug]` public story reader

No `/stories` prefix.

## Current Build State

Completed:
1. Prompt 1 foundation (schema, DB, migrations, seed)
2. Prompt 2 3D viewer integration (v27 baseline, now v28 runtime version)
3. Prompt 3 Studio auth + Storybook CRUD
4. Prompt 4 Studio page editor CRUD + reorder
5. Prompt 5 image uploads (local VPS fallback)
6. Prompt 7 library + analytics
7. UX polish pass

Pending / later:
- Full live embed runtime (beyond poster behavior)
- Video upload pipeline
- R2 migration for assets
- additional theme/editor polish

## Stack (standalone)

- Next.js App Router
- PostgreSQL + Drizzle ORM
- Route Handlers for public/API endpoints
- Server Actions for Studio mutations
- Resend (optional; only needed if OTP is re-enabled)
- Hostinger VPS + PM2 + Caddy

## Data Model

Primary tables:
- `storybooks`
- `pages`
- `assets`
- `viewers`
- `view_events`

Asset ID strategy:
- `assets.id` is `text` primary key
- `storybooks.cover_asset_id` is `text` FK to `assets.id`

## Rendering Contract

Source of truth:
- `specs/storybook-schema.ts`

Book engine reference:
- `specs/book-engine-v27.html` baseline
- runtime app currently uses updated v28 behavior (single-page closed cover start)

Path A page types implemented:
- `text`
- `image`
- `video` (poster)
- `embed` (poster)

## Deployment Target

- App path: `/var/www/werbz-stories`
- PM2 process: `werbz-stories`
- Internal port: `3005`
- Domain: `werbz.com`

Hard safety rule:
- Never modify/touch RB monolithic app during werbz deploys.
