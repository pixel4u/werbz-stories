# Engineering Prompts — werbz.com (Standalone Stories)

This project is a standalone app. It is not part of RB/ReallyVibrant monorepo.

References:
- `specs/PLAN.md`
- `specs/storybook-schema.ts`
- `specs/db-schema.ts`
- `specs/sample-storybook.json`
- `specs/book-engine-v27.html` (baseline)

## Prompt Progress Snapshot

Completed:
- Prompt 1: foundations + DB + seed + API
- Prompt 2: data-driven 3D reader
- Prompt 3: Studio dashboard CRUD
- Prompt 4: Studio page editor CRUD/reorder
- Prompt 5: image uploads (local fallback storage)
- Prompt 7: library + analytics

Remaining major work:
- Prompt 6 live embed behavior enhancements
- R2 asset storage migration
- richer media workflows (video upload pipeline)

## Prompt 1 (done)

- `src/lib/stories/schema.ts`
- `src/db/schema.ts`
- `src/db/client.ts`
- `scripts/seed.ts`
- Drizzle migration setup

Rules:
- text IDs for assets
- idempotent seed
- `parseStorybook()` for validated data boundaries

## Prompt 2 (done)

- Refactored book engine into app runtime
- Reader mounted at `/[slug]`
- Pulls data from `/api/storybooks/[slug]`
- Path A rendering for text/image/video(embed poster)
- Visual QA and orientation/debug pass completed
- Later change added v28-style closed-cover start behavior

## Prompt 3 (done)

- `/studio` dashboard
- dashboard CRUD for storybooks

## Prompt 4 (done)

- `/studio/[id]` editor
- add/edit/delete/reorder/side swap page operations
- position normalization on updates
- page content validation through shared schema

## Prompt 5 (done, phase 1)

- Image upload enabled in Studio editor
- assets rows persisted
- local file storage fallback in VPS app path
- viewer resolves uploaded asset URLs

## Prompt 7 (done)

- Public Library at `/`
- public reader flow
- viewer cookie verify flow
- analytics page + CSV export

## Deployment Guardrails

For werbz deploys:
- Path: `/var/www/werbz-stories`
- PM2 app: `werbz-stories`
- restart only: `pm2 restart werbz-stories --update-env`

Never:
- restart/delete all PM2 apps
- overwrite whole Caddyfile
- touch RB app infra

## Next Prompt (recommended)

Prompt 6 continuation:
- Improve embed live mode with settle/unsettle mount control
- keep flip performance intact
- maintain existing library/studio behavior
