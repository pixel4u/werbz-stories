# Developer Handoff

## What this app is

A standalone Stories platform at `werbz.com` with:
- public library
- OTP-gated story reading
- owner Studio + editor + analytics

## Critical Constraints

1. Do not touch RB monolith infra/app.
2. Deploy only `werbz-stories`.
3. Restart only `werbz-stories` PM2 process.
4. Do not replace full Caddy config; only additive safe edits if ever needed.

## Local Runbook

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Production Runbook

```bash
cd /var/www/werbz-stories
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate
pnpm db:seed
pm2 restart werbz-stories --update-env
pm2 save
```

## Smoke Tests

```bash
curl https://werbz.com/api/storybooks
curl https://werbz.com/api/storybooks/the-lighthouse
curl -I https://werbz.com/the-lighthouse
pm2 status
```

Manual:
- `/` library loads
- `/studio` login works
- `/studio/analytics` loads
- private window `/the-lighthouse` shows OTP gate
- verified flow unlocks book

## Key Files

- `src/lib/stories/schema.ts`
- `src/db/schema.ts`
- `src/db/client.ts`
- `src/app/api/storybooks/`
- `src/app/api/book/[slug]/route.ts`
- `src/app/studio/`
- `src/app/[slug]/`

## Environment Variables

Core:
- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `STUDIO_PASSWORD`
- `COOKIE_SECRET`

Reader/Auth:
- `RESEND_API_KEY`
- `EMAIL_FROM`

Uploads:
- `UPLOADS_DIR` (if local storage path override is needed)

## Next Recommended Work

1. Finalize embed live-mode behavior (Prompt 6 continuation).
2. Add video upload/storage pipeline.
3. Migrate asset storage to R2.
