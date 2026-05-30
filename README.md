# werbz-stories

Standalone Stories platform for `werbz.com`.

## Current Status

Production is live with:
- Public Library at `/`
- OTP-gated Story Reader at `/[slug]`
- 3D Book viewer (v28 runtime based on v27 tuning)
- Studio auth + dashboard CRUD at `/studio`
- Studio page editor CRUD at `/studio/[id]`
- Studio analytics at `/studio/analytics`
- Local VPS file uploads for image assets (Prompt 5)

Latest known project commit in this repo: `c746674`.

## Stack

- Next.js App Router
- PostgreSQL
- Drizzle ORM
- Route Handlers + Server Actions
- PM2 on Hostinger VPS
- Caddy reverse proxy

## Routes

- `/` public published stories library
- `/studio` owner dashboard (auth required)
- `/studio/[id]` story page editor (auth required)
- `/studio/analytics` analytics (auth required)
- `/[slug]` public story reader (OTP-gated)

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

OTP / email:
- `RESEND_API_KEY` (or alternate provider vars if supported)
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
