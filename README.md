# werbz-stories

Standalone Stories platform for `werbz.com`.

## Current Status

Production is live with:
- Public Library at `/`
- Public Story Reader at `/[slug]`
- 3D Book viewer (active engine: `specs/best.html`, see below)
- Open Studio dashboard CRUD at `/studio`
- Studio page editor CRUD at `/studio/[id]`
- Studio analytics at `/studio/analytics`
- Local VPS file uploads for image assets (Prompt 5)

## Reader engine (source of truth)

- **Active reader engine: `specs/best.html`** (PixiJS page-curl), served by
  `/api/book/[slug]` — the no-query-param URL and `?engine=best` are identical.
  `BookViewer` (the public reader) loads `?engine=best`.
- **Pixi** is served from a single source: **`/api/book/pixi`** (vendored from
  `node_modules`). Engine HTML references `/api/book/pixi` directly; do not point
  it at a CDN or a `/public` copy.
- The engine maps the canonical story payload: `storybook.cover` → first face,
  `storybook.pages[]` → ordered middle faces, `storybook.end` → final face.
- Older engines are explicit debug/reference escape hatches only:
  `?engine=v30` (`specs/book-engine-v30.html`) and `?engine=v29` (legacy
  server-transformed Three.js engine). Nothing reader-facing depends on them.
- `?debug=1` enables the engine's debug overlay; normal mode shows no debug labels.

## Stack

- Next.js App Router
- PostgreSQL
- Drizzle ORM
- Route Handlers + Server Actions
- PM2 on Hostinger VPS
- Caddy reverse proxy

## Routes

- `/` public published stories library
- `/studio` open dashboard
- `/studio/[id]` open story page editor
- `/studio/analytics` open analytics
- `/[slug]` public story reader

API:
- `GET /api/storybooks` (published only)
- `GET /api/storybooks/[slug]` (published only)
- `GET /api/assets/[assetId]`
- `GET /api/book/[slug]`

## Environment

Copy `.env.example` and fill values:

```bash
cp .env.example .env
```

Core:
- `DATABASE_URL`
- `STUDIO_PASSWORD`
- `COOKIE_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `UPLOADS_DIR` (optional; defaults to `./uploads`)

Optional email / legacy viewer tracking:
- `RESEND_API_KEY` (only needed if OTP is re-enabled later)
- `EMAIL_FROM`

## Local Setup

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Verification

- App:
  - `/`
  - `/studio`
  - `/the-lighthouse`
- API:
  - `/api/storybooks`
  - `/api/storybooks/the-lighthouse`
- DB:
  - `select * from storybooks;`

## Deployment (werbz-only)

On VPS at `/var/www/werbz-stories`:

```bash
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate
pnpm db:seed
pm2 restart werbz-stories --update-env
pm2 save
```

Safety rules:
- Only touch process `werbz-stories`
- Do not modify RB app/processes
- Do not overwrite entire Caddyfile

## Handoff Docs

- `docs/HANDOFF.md`
- `docs/BEST_PRACTICES.md`
- `docs/STATUS.md`
