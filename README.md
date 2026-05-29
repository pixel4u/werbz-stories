# werbz-stories

Standalone Stories platform for `werbz.com`, built with Next.js App Router, PostgreSQL, and Drizzle ORM.

## Milestone 1 Scope

- Fresh standalone app scaffold
- Shared stories schema from specs
- Drizzle schema + migration scaffold
- Idempotent seed script using `specs/sample-storybook.json`
- Placeholder routes:
  - `/` public Stories library placeholder
  - `/studio` Studio placeholder
  - `/[slug]` viewer placeholder

## Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL 15+

## Local setup

1. Install dependencies:

```bash
pnpm install
```

2. Create `.env`:

```bash
cp .env.example .env
```

3. Set `DATABASE_URL` in `.env`.

4. Run migration SQL (choose one):

```bash
pnpm db:migrate
```

or manually apply `drizzle/0000_initial_stories.sql` in Postgres.

5. Seed sample data:

```bash
pnpm db:seed
```

6. Run the app:

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Notes

- Source-of-truth specs are in `specs/`.
- Book engine reference for later integration is `specs/book-engine-v27.html`.
- This milestone does not implement the full editor or deploy flow yet.
