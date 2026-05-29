# ReallyVibrant Stories — Architecture & Build Plan

A small platform for authoring **Storybooks** (short illustrated stories that
render inside the 3D WebGL book) and sharing them with an audience whose emails
you capture at the door.

## Vocabulary

| Term | What it is | Who touches it |
|---|---|---|
| **Storybook** | One story = an ordered list of pages | You author it |
| **Page** | One leaf (left or right), of a typed kind | — |
| **Library** | Public list page: "Stories" + the books underneath | Your audience lands here |
| **Studio** | Admin area to create / edit / delete Storybooks | Only you |
| **The Book** | The 3D WebGL viewer (your tuned v10 engine) | Renders a Storybook |

Flow: **author in the Studio → saved to the repository (Postgres) → the Library
lists published books → the audience picks one → the Book renders it.**

## Stack (no new infrastructure)

Reuses your existing ReallyVibrant stack:

- **Next.js** app, route group under `/stories`
- **Hono / tRPC** for the API
- **PostgreSQL + Drizzle** for the repository
- **Object storage** for media (recommend **Cloudflare R2** — no egress fees,
  you already use Cloudflare; VPS `/uploads` + Nginx is the fallback)
- **Resend or Postmark** for OTP email (free at your volume)
- Hostinger VPS, behind Cloudflare — same deployment, same domain, same TLS

## The content contract (the most important decision)

A page is a **typed block**, never freeform HTML. Four types cover everything:

| Type | Render path | Notes |
|---|---|---|
| `text` | **A** — canvas texture | title/body/eyebrow, optional solid background color |
| `image` | **A** — canvas texture | still becomes the page texture |
| `video` | **A** — `VideoTexture` | animates only once the leaf is settled |
| `embed` | **B** — live overlay | your OpenGL/HTML pages; poster during flip, live iframe on settle |

Typed blocks (not snowflake HTML) are what make the books re-renderable,
validatable, and safely extensible. The full contract lives in
`storybook-schema.ts` (Zod + TS) and is imported by **both** the Studio and the
Book so they can't drift.

### Two render paths — why `embed` is special

- **Path A (text/image/video):** rides the existing `loadPageTexture(i)`
  pipeline. The curl, stack, lighting and smooth landing you tuned all work
  unchanged because they're texture-agnostic. ~90% of content, basically free.
- **Path B (embed):** a live WebGL/HTML animation can't be a texture on a
  curling mesh. During the flip the leaf shows a **poster** (required field);
  once the page **settles**, a **sandboxed `<iframe>`** is mounted, aligned to
  the leaf's on-screen rectangle. Sandbox is non-negotiable even though you're
  the only author — it's free insurance against a self-inflicted footgun.

## Data model

`storybooks` → `pages` (jsonb `content`) → `assets` (storage keys only).
`viewers` + `view_events` capture the audience and analytics. Full Drizzle
definitions in `db-schema.ts`. Media bytes never go in Postgres.

## The three surfaces (UX)

### 1. Studio — `/stories/studio` (you only)
- **Dashboard:** grid of Storybook cards (cover, title, draft/published badge,
  view count) with **create / duplicate / edit / delete**. This is your "repository."
- **Editor:** a **two-column spread mirroring the open book** (left leaf | right
  leaf), a reorderable strip of page-pairs along the bottom, and an **"Add page"**
  button that asks *type* then shows the right form:
  - text → rich text fields (+ optional background color)
  - image / video → upload dropzone
  - embed → HTML bundle upload or URL + **poster upload**
- **"Preview in Book"** launches the real 3D viewer against the draft.
- The editor edits **data**; the Book renders **data** — same JSON, two
  consumers. You never hand-edit book code again.

### 2. Library + Book — `/stories` and `/stories/[slug]`
- `/stories` — the page you envisioned: **"Stories"** heading, published books
  listed underneath (cover + title + summary). Audience picks one.
- Selecting a book hits the **email gate**, then opens the Book at `/stories/[slug]`.
- The Book is your v10 engine, refactored to **fetch a Storybook JSON** instead
  of hardcoding `pages`. Everything you tuned stays.

### 3. Email gate (simple by design)
1. Visitor enters email → generate a 6-digit OTP, store **hash** + 5-min expiry,
   email it.
2. They type it back → set a long-lived **signed cookie**, record the viewer +
   a `view_event`.
3. Cookie = verify once, roam freely after. No passwords, no profiles.

> **Data-collection caveat (not legal advice):** even simple email capture means
> you hold personal data. Add a one-line "we'll email you about new stories"
> notice at the gate and an opt-out. Trivial now, awkward to retrofit.

## Build order (working loop as early as possible)

1. **Schema + JSON contract** — `storybook-schema.ts` shared by both sides.
   *Everything keys off this.* ← start here
2. **Refactor the Book to data-driven** — fetch a Storybook JSON, render
   text/image. Proves the contract end-to-end with a hand-written JSON, no
   editor yet.
3. **Studio CRUD + text/image editor** — author without touching code. The
   milestone where it becomes yours to run.
4. **Email gate + Library** — now you can share a link.
5. **Embed pages (Path B)** — iframe-overlay-on-settle. Most complex, least
   frequent — do it last, on a solid base.
6. **Analytics view** in the Studio — who viewed what, when.

After step 2 you can see real stories; after 3 you can author them; after 4 you
can ship a link. Each step is independently useful.

## Files in this spec

- `storybook-schema.ts` — the shared TS/Zod contract (the foundation)
- `db-schema.ts` — Drizzle Postgres tables
- `sample-storybook.json` — a full example using all four page types
