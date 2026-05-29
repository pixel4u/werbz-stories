# werbz Stories — Architecture & Build Plan

A standalone platform for authoring **Storybooks** (short illustrated stories
rendered in a 3D WebGL book) and sharing them with readers via `werbz.com`.

## Vocabulary

| Term | What it is | Who touches it |
|---|---|---|
| **Storybook** | One story = an ordered list of pages | Owner author |
| **Page** | One leaf (left or right), of a typed kind | — |
| **Library** | Public list page: "Stories" + published books | Readers |
| **Studio** | Admin area to create / edit / delete Storybooks | Owner only |
| **The Book** | 3D WebGL viewer (tuned v27 engine) | Renders a Storybook |

Flow: **author in Studio → save in Postgres → list in Library → open in Book**.

## Stack (standalone, no unnecessary complexity)

- **Next.js App Router**
- **PostgreSQL + Drizzle ORM**
- **Route Handlers** for public JSON endpoints
- **Server Actions** for Studio mutations where practical
- **Resend or Postmark** later for OTP email
- **Cloudflare R2** later for media uploads (VPS uploads fallback optional)
- **Hostinger VPS** deployment later, behind Cloudflare

## Routes (werbz.com root)

- `/` — public Stories library
- `/studio` — owner Studio
- `/[slug]` — Storybook viewer

No `/stories` base path.

## Content contract (single source of truth)

A page is a typed block, never freeform HTML. Four page types:

| Type | Render path | Notes |
|---|---|---|
| `text` | Path A — canvas texture | title/body/eyebrow + optional background |
| `image` | Path A — canvas texture | image asset drawn on page |
| `video` | Path A — poster first, video on settle | optimize flip performance |
| `embed` | Path B — poster + live iframe on settle | sandboxed iframe |

The contract lives in `storybook-schema.ts` and is used by both Studio and Book.

## Two render paths

- **Path A (`text`/`image`/`video`)**: uses the existing `loadPageTexture(i)`
  style pipeline from the tuned engine.
- **Path B (`embed`)**: shows poster during flip, mounts live sandboxed iframe
  when the page settles.

## Data model

- `storybooks` → `pages` (`content` jsonb union)
- `assets` (metadata + storage key, no bytes in Postgres)
- `viewers` + `view_events` for OTP and analytics

Asset IDs are **text IDs** (human-readable), not UUID-only.

## Surfaces

### 1) Studio — `/studio`
- Dashboard: list/grid of Storybooks, create/duplicate/edit/delete
- Editor: two-leaf spread, reorder pages, add typed pages
- Preview in real Book viewer against current draft

### 2) Library + Book — `/` and `/[slug]`
- `/`: "Stories" heading + published books list
- `/[slug]`: the v27 book engine, data-driven from Storybook JSON

### 3) Email gate (later phase)
1. Enter email
2. Verify 6-digit OTP
3. Receive signed cookie and continue

## Build order

1. Shared schema + DB schema + migrations + idempotent seed
2. Public read endpoints (library + story-by-slug) with Zod validation
3. Refactor `book-engine-v27.html` into `/[slug]` data-driven viewer (Path A first)
4. Studio auth (`env` password + signed httpOnly cookie)
5. Studio CRUD + page editor (data-only editing)
6. OTP gate + analytics
7. R2 asset uploads
8. Embed live overlay (Path B)
9. VPS deploy to `werbz.com`

## Files in this spec

- `storybook-schema.ts` — shared content contract
- `db-schema.ts` — Drizzle Postgres schema
- `sample-storybook.json` — reference seeded Storybook
- `book-engine-v27.html` — tuned baseline engine to integrate
