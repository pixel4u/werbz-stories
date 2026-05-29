# Engineering Prompts — werbz.com (ReallyVibrant Stories)

These are sequenced, self-contained prompts for the engineer building the
Storybook platform. Execute **in order** — each builds on the last and is
independently testable. Hand the engineer this file plus the four spec files
(`storybook-schema.ts`, `db-schema.ts`, `sample-storybook.json`, `PLAN.md`) and
the tuned 3D book engine (`book-engine-v10.html`).

---

## Project context (give this to the engineer first)

> We are building a small content platform called **Stories**. An author (just
> the owner, for now) creates **Storybooks** — short illustrated stories — in an
> admin area called the **Studio**. Each Storybook is an ordered list of typed
> **pages** (text, image, video, or live embed). The public **Library** lists
> published Storybooks; a reader picks one and it renders inside a **3D WebGL
> book** (the "Book"). Readers must enter an email and verify a one-time code
> before reading; we capture their email and log which books they open.
>
> **Stack (do not introduce new infrastructure):** existing Turborepo monorepo,
> Next.js (App Router), Hono + tRPC API, PostgreSQL with Drizzle ORM. Hosted on
> a **Hostinger VPS**. DNS is on **Cloudflare** (domain registered at
> ScalaHosting, nameservers already delegated to Cloudflare).
>
> **Domain:** the product will be served from its own domain **werbz.com**. All
> routes are at the root of that domain (e.g. `werbz.com/`, `werbz.com/studio`,
> `werbz.com/[slug]`) — NOT under a subpath. Build everything domain-relative so
> there is no hardcoded base path to unwind later.
>
> **Content contract:** the shared types in `storybook-schema.ts` are the single
> source of truth, imported by BOTH the Studio and the Book. Never let the two
> sides diverge. The DB tables are in `db-schema.ts`. A full example is in
> `sample-storybook.json`.
>
> **Two render paths (critical):** `text`/`image`/`video` pages render as
> textures on the curling page mesh (Path A). `embed` pages (live OpenGL/HTML)
> CANNOT be a texture — they show a poster image during the flip, then mount as
> a sandboxed iframe aligned to the settled leaf (Path B).

---

## Prompt 1 — Monorepo package, schema, and database

> Create a shared package `@repo/stories-core` in the monorepo and place
> `storybook-schema.ts` in it as the public export. This package must be
> importable by both the web app and the API with no duplication.
>
> Add the Drizzle tables from `db-schema.ts` to our existing Drizzle setup
> (`storybooks`, `pages`, `assets`, `viewers`, `view_events`). Generate and run
> the migration against our Postgres instance. Write a seed script that inserts
> `sample-storybook.json` as a published Storybook (create placeholder `assets`
> rows for its referenced asset IDs so foreign keys resolve).
>
> Add a `zod`-based validator at the API boundary: any Storybook read from or
> written to the DB must pass `parseStorybook()` before use. Deliver: the
> package, the migration, the seed script, and a short README showing how to run
> the seed.

**Test:** `select * from storybooks` shows the seeded book; the seed script
re-runs idempotently.

---

## Prompt 2 — Make the 3D Book data-driven (the core proof)

> Take `book-engine-v10.html` (a self-contained Three.js page-flip book with a
> hardcoded `pages` array and a `loadPageTexture(i)` function) and refactor it
> into a reusable client component in our Next.js app, mounted at the dynamic
> route `/[slug]`.
>
> Instead of the hardcoded array, the component fetches a Storybook by slug from
> our API and renders its `pages`. Implement the **Path A** renderers inside
> `loadPageTexture`:
> - `text`: draw eyebrow/title/body to the page canvas (reuse the existing
>   `wrapText`/`drawCard` canvas code); honor the optional `background` solid color.
> - `image`: load the asset and draw it to the canvas with `cover`/`contain` fit.
> - `video`: show the poster as the texture for now (full video playback comes later).
> - `embed`: show the poster as the texture for now (live mount comes in Prompt 6).
>
> Apply the Storybook's optional `theme` object to the book's config (it has the
> exact shape the engine's "Copy config" exports); fall back to the engine
> defaults when absent. Preserve ALL existing tuning — curl, stack, lighting,
> drag-to-flip, smooth landing — unchanged.
>
> Add a tiny API endpoint `getStorybookBySlug(slug)` returning the full
> Storybook (validated). Do NOT add auth yet.

**Test:** visiting `/the-lighthouse` renders the seeded book in 3D with real
text/image/color pages; flipping still feels identical to v10.

---

## Prompt 3 — Studio: dashboard + CRUD

> Build the **Studio** at `/studio`, gated by a single-owner login (reuse our
> app's existing auth/session; if none exists, a single env-var password with a
> signed session cookie is acceptable). Non-authenticated hits to `/studio/*`
> redirect to the Studio login.
>
> Studio dashboard: a grid of Storybook cards showing cover, title,
> draft/published badge, and lifetime view count. Actions per card: **edit,
> duplicate, delete** (delete asks for confirmation; cascade deletes pages).
> A **"New Storybook"** button creates a draft and opens the editor.
>
> Implement the tRPC procedures: `listStorybooks` (admin, includes drafts +
> view counts), `createStorybook`, `duplicateStorybook`, `deleteStorybook`,
> `updateStorybookMeta` (title, slug, summary, status, cover, theme). Slugs must
> be unique and auto-suggested from the title.

**Test:** owner can log in, create/duplicate/delete books, toggle
draft↔published, and the list reflects changes immediately.

---

## Prompt 4 — Studio: the page editor

> Build the Storybook **editor** at `/studio/[id]`. Layout mirrors the open
> book: a **two-leaf spread** (left leaf | right leaf) showing the currently
> selected page-pair, with a **reorderable horizontal strip** of all page-pairs
> beneath it (drag to reorder updates `position`). An **"Add page"** control
> asks for the page `type`, then shows the matching form:
> - `text`: eyebrow, title, body, alignment, optional background color picker
> - `image`/`video`: drag-and-drop upload (see Prompt 5 for the upload pipeline);
>   video also takes a poster upload
> - `embed`: choice of (a) upload an HTML bundle (.zip or single .html) or
>   (b) external URL, PLUS a required poster image upload
>
> Each page can be assigned to the left or right leaf and deleted. Provide a
> **"Preview in Book"** button that opens the real 3D Book against the current
> draft (a preview route that bypasses the email gate for the authenticated
> owner).
>
> Persist via tRPC: `addPage`, `updatePage`, `deletePage`, `reorderPages`. Every
> write validates the `content` against the `PageContent` union from
> `stories-core` before saving. The editor edits DATA only — it must never emit
> book rendering code.

**Test:** owner builds a multi-page book from scratch (mixing text/image),
reorders pages by drag, previews it in 3D, and the saved JSON round-trips
through the Book identically.

---

## Prompt 5 — Asset uploads (object storage)

> Add a media upload pipeline. Use **Cloudflare R2** (S3-compatible, no egress
> fees; we already use Cloudflare). Provide presigned-URL uploads so bytes go
> browser→R2 directly, never through our API. On completion, create an `assets`
> row (storage key, mime, bytes, and width/height for images) and return its id
> to the editor.
>
> Serve assets through a stable public URL (R2 public bucket or a Cloudflare
> Worker/`cdn.werbz.com` route). Enforce limits: images ≤ 10MB, video ≤ 100MB,
> embed bundles ≤ 20MB; reject other mime types. The Book's Path A renderers
> resolve `assetId` → URL via a small `getAssetUrl(id)` helper.
>
> Bytes must never touch Postgres. Provide a fallback config flag to use a local
> VPS `/uploads` dir served by Nginx if R2 is unavailable.

**Test:** uploading an image in the editor stores it in R2, the asset appears on
the page in both the editor preview and the live Book.

---

## Prompt 6 — Embed pages (Path B: live overlay on settle)

> Implement live `embed` rendering in the Book. During a flip, the embed leaf
> shows its `poster` as a normal Path-A texture (already done in Prompt 2). When
> a page **settles** (flip animation completes and that leaf is at rest), mount
> the embed's `source` in a **sandboxed `<iframe>`** absolutely positioned and
> sized to match the settled leaf's on-screen rectangle (project the leaf's
> world-space corners to screen coordinates; reposition on resize/scroll).
>
> When the leaf starts flipping again, unmount the iframe and revert to the
> poster texture. The iframe MUST use `sandbox="allow-scripts"` (add
> `allow-same-origin` only for bundles we host and trust); `interactive: false`
> pages get `pointer-events: none`. Asset-bundle embeds are served from an
> isolated origin/path; URL embeds load the given URL.

**Test:** a book with an embed page flips smoothly showing the poster, then the
live OpenGL/HTML animation appears and is interactive once the page is at rest,
and cleanly disappears when flipping away.

---

## Prompt 7 — Email gate + Library + analytics

> Build the public **Library** at `/` (root of werbz.com): a heading "Stories"
> and a list/grid of **published** Storybooks (cover, title, summary). Selecting
> one routes to `/[slug]`, which is gated.
>
> **Email gate:** before the Book renders for an unverified visitor, show an
> email form. On submit: upsert a `viewers` row, generate a 6-digit OTP, store
> its **hash** + 5-minute expiry, and email it via **Resend** (or Postmark).
> The visitor enters the code; on success set a long-lived **signed httpOnly
> cookie**, clear the OTP, stamp `verified_at`, and let them read. A verified
> cookie skips the gate on future visits. Include a one-line consent notice
> ("we'll email you about new stories") and an unsubscribe link that stamps
> `opted_out`.
>
> **Analytics:** each time a verified viewer opens a book, insert a `view_event`.
> Add a Studio page `/studio/analytics` listing viewers (email, first seen,
> books opened) and per-book open counts, with CSV export.

**Test:** a fresh browser must enter email + code to read; the viewer and each
open appear in Studio analytics; re-visiting skips the gate.

---

## Prompt 8 — Deploy to werbz.com on the Hostinger VPS

> Deploy the app to our **Hostinger VPS** served at **werbz.com**.
>
> - The VPS already runs our other site; add this app as a separate process
>   (PM2 or systemd) on its own internal port, reverse-proxied by Nginx for the
>   `werbz.com` server block.
> - **DNS/TLS:** in **Cloudflare** (nameservers already delegated there; the
>   domain is registered at ScalaHosting — no registrar change needed), add an
>   A record `werbz.com` → VPS IP, plus `www` and `cdn` as needed, proxied
>   (orange cloud). Use Cloudflare **Full (strict)** TLS with an origin
>   certificate installed in Nginx; redirect `www`→apex and force HTTPS.
> - Set production env: `DATABASE_URL`, R2 credentials + bucket/public URL,
>   Resend/Postmark API key, the signed-cookie secret, and the Studio owner
>   credential. Run migrations on deploy; do NOT auto-run the demo seed in prod.
> - Provide a one-command deploy (build → migrate → restart) and a rollback
>   note. Confirm `werbz.com` serves the Library over HTTPS, the Studio login
>   works, and a seeded/published book reads end-to-end through the gate.
>
> (We previously prototyped under reallyvibrant.com/stories — ignore that path;
> werbz.com at the root is the only target.)

**Test:** `https://werbz.com` loads the Library; `https://werbz.com/studio`
gates to login; a published book reads end-to-end after email verification;
TLS is valid and `www`→apex redirect works.

---

## Suggested order & dependencies

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Prompts 5 (uploads) and 6 (embeds) can be
deferred if you want a text/image-only launch sooner: 1→2→3→4→7→8 ships a
working product, then add 5 and 6.
