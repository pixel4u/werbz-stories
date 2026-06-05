# Project Status

## Repository

- Name: `werbz-stories`
- Type: standalone Next.js app
- Current known head during handoff: `c746674`

## Live Environment

- Domain: `https://werbz.com`
- App dir: `/var/www/werbz-stories`
- PM2 process: `werbz-stories`
- Port: `3005`

## Implemented

- Public library (`/`)
- Public story reader (`/[slug]`)
- 3D book runtime with data-driven pages
- Open Studio (`/studio`)
- Studio CRUD
- Studio page editor (`/studio/[id]`)
- Studio analytics + CSV
- Local image upload flow

## Known Product Notes

- Book engine was upgraded from v27 baseline to v28 runtime behavior in app code.
- Cover behavior was iterated toward closed-cover first; visual fine-tuning may still continue.
- Placeholder/debug artifacts were previously cleaned up; debug mode is off by default.

## Pending Items

- Full live embed mounting behavior improvements
- Video upload pipeline
- Move uploads from local VPS storage to R2
- Continued UI polish
