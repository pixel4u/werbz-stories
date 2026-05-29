# Engineering Prompts — werbz.com (Standalone Stories)

Execute these prompts in order. This is a **brand-new standalone project**, not
part of any existing monorepo/CRM app.

Reference specs:
- `storybook-schema.ts`
- `db-schema.ts`
- `sample-storybook.json`
- `PLAN.md`
- `book-engine-v27.html`

---

## Project context

> Build a standalone Stories platform for `werbz.com`.
>
> - Public Library at `/`
> - Studio at `/studio`
> - Story viewer at `/[slug]`
>
> Storybooks are ordered typed pages (`text`, `image`, `video`, `embed`).
> Readers are gated by OTP email (later phase). Book rendering uses the tuned
> `book-engine-v27.html` as baseline.
>
> Stack:
> - Next.js App Router
> - PostgreSQL + Drizzle ORM
> - Route Handlers (public API)
> - Server Actions (Studio mutations where practical)
> - Resend/Postmark later
> - Cloudflare R2 later
> - Hostinger VPS deploy later

---

## Prompt 1 — Local schema modules + database baseline

> Create local shared modules and DB foundations:
>
> - `src/lib/stories/schema.ts` (from `storybook-schema.ts`)
> - `src/db/schema.ts` (from `db-schema.ts`)
> - `src/db/client.ts`
> - migration files
> - `scripts/seed.ts`
>
> Seed `sample-storybook.json` as published. Seed must be idempotent.
>
> Add Zod validation at API boundaries via `parseStorybook()`.
>
> **Important:** use **text asset IDs** (human-readable IDs) instead of UUID-only
> asset IDs.

**Test:** `storybooks` contains seeded row; re-running seed is safe.

---

## Prompt 2 — Make the Book data-driven with v27 engine

> Refactor `book-engine-v27.html` into a reusable Next.js client component used
> by route `/[slug]`.
>
> Replace hardcoded pages with Storybook data fetched by slug from a Route
> Handler.
>
> Implement Path A:
> - `text`: render eyebrow/title/body to canvas
> - `image`: draw asset with `cover`/`contain`
> - `video`: poster texture for now
> - `embed`: poster texture for now
>
> Apply optional Storybook `theme` overrides to engine config.
>
> Preserve tuned page-flip behavior from v27.

**Test:** `/the-lighthouse` renders seeded book with unchanged flip feel.

---

## Prompt 3 — Studio auth + dashboard CRUD

> Build `/studio` with single-owner auth:
> - env password + signed httpOnly cookie is acceptable
>
> Build Storybook dashboard:
> - list cards with cover/title/status/view count
> - create, duplicate, delete, update metadata
>
> Implement via Server Actions and/or internal Route Handlers.

**Test:** owner can log in and manage Storybooks end-to-end.

---

## Prompt 4 — Studio page editor

> Build `/studio/[id]` editor:
> - two-leaf spread preview
> - reorder pages
> - typed forms for page content
> - preview in `/[slug]` for draft
>
> Persist writes through validated server-side paths (Server Actions or Route
> Handlers) with `PageContent` validation.

**Test:** create and reorder mixed text/image pages, preview successfully.

---

## Prompt 5 — Asset uploads (R2)

> Add presigned uploads to Cloudflare R2 (browser direct upload), store metadata
> in `assets`, and enforce file/mime limits.

**Test:** uploaded image appears in Studio preview and Book.

---

## Prompt 6 — Embed pages (Path B)

> Implement poster-during-flip and live sandboxed iframe-on-settle behavior for
> `embed` pages.

**Test:** embed appears only when leaf settles; unmounts during flip.

---

## Prompt 7 — OTP gate + analytics

> Build OTP gate for `/[slug]` using viewer email + hashed code + signed cookie.
> Log view events and add `/studio/analytics` with CSV export.

**Test:** unverified user must verify OTP; verified revisits skip gate.

---

## Prompt 8 — Deploy to Hostinger VPS (`werbz.com`)

> Deploy Next.js app to Hostinger VPS behind Nginx + Cloudflare, enforce HTTPS,
> configure env vars, run migrations on deploy, and verify end-to-end routes.

**Test:** `https://werbz.com`, `/studio`, and `/<slug>` all function correctly.

---

## Suggested order

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

Fast launch variant: 1 → 2 → 3 → 4 → 7 → 8, then 5 and 6.
