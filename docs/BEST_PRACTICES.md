# Best Practices

## Architecture

- Keep shared Storybook schema as single source of truth.
- Validate DB-loaded story JSON with `parseStorybook()` before render/use.
- Keep Studio writes server-side and validated.

## Data Safety

- Use idempotent seed and migration scripts.
- Normalize page positions after page mutations.
- Keep `assets.id` as stable text ID.

## Security

- Never log secrets.
- Keep Studio/public-reader access expectations explicit in docs and deploy notes.
- Store OTP as secure hash with expiry if the legacy gate is ever re-enabled.
- Keep uploads constrained by mime and size.

## Frontend/Viewer

- Preserve page-flip physics and tune by minimal deltas.
- Keep placeholders neutral and readable.
- Keep debug overlays off by default and query-flagged only.

## Deploy Hygiene

- Scope every deploy to werbz app only.
- Do not run broad process commands (`pm2 restart all`, `pm2 delete all`).
- Verify API and page routes after deploy.
- Confirm PM2 status before/after deploy.

## Git Hygiene

- Keep commits focused per prompt/fix.
- Include concise commit message with scope.
- Update docs when behavior changes (especially reader/studio/auth/deploy flow).

## Collaboration Handoff

- Update `docs/STATUS.md` after major milestones.
- Record known caveats and how to reproduce.
- Keep runbooks copy-paste safe.
