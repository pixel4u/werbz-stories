# werbz-stories

Standalone Stories platform for `werbz.com` using Next.js App Router, PostgreSQL, and Drizzle ORM.

## Prompt 1 Foundation Included

- Shared schema: `src/lib/stories/schema.ts`
- DB schema/client: `src/db/schema.ts`, `src/db/client.ts`
- Drizzle config + migration: `drizzle.config.ts`, `drizzle/`
- Idempotent seed: `scripts/seed.ts`
- Read repository functions:
  - `getStorybookBySlug(slug)`
  - `listPublishedStorybooks()`
- Public read endpoints:
  - `GET /api/storybooks`
  - `GET /api/storybooks/[slug]`

## Environment

Create `.env`:

```bash
cp .env.example .env
```

Required vars:

- `DATABASE_URL` (PostgreSQL connection string)
- `STUDIO_PASSWORD` (owner login password)
- `COOKIE_SECRET` (used to sign studio auth cookie)
- `UPLOADS_DIR` (optional, defaults to `./uploads`; local image uploads stored here)

Example is provided in `.env.example`.

## Run

Install:

```bash
pnpm install
```

Generate migrations from schema:

```bash
pnpm db:generate
```

Apply migrations:

```bash
pnpm db:migrate
```

Seed sample storybook (safe to run repeatedly):

```bash
pnpm db:seed
```

Start app:

```bash
pnpm dev
```

## Quick checks

- Routes:
  - `/`
  - `/studio`
  - `/the-lighthouse`
- API:
  - `/api/storybooks`
  - `/api/storybooks/the-lighthouse`
- DB:
  - `select * from storybooks;`

## Notes

- Asset IDs are text IDs (for example `asset-cover-lighthouse`), not UUID-only.
- `assets.id` is `text` PK.
- `storybooks.cover_asset_id` is a `text` FK to `assets.id`.
- Prompt 5 image upload uses local file storage fallback and stores metadata in `assets`.
- Uploaded media is served via `GET /api/assets/[assetId]`.
