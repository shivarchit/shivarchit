# PRODUCT.md

## What this is
A single SVG rendered nightly by GitHub Actions, embedded in the profile README of github.com/shivarchit. It is the first thing a visitor sees on the profile.

## Subject truth
- Shiv Archit, developer in Chandigarh, India (city designed by Le Corbusier).
- Work pattern is bursty: months of silence (Sep–Jan), then single days of 150–243 commits. The burst IS the signature — steady-green heatmaps misrepresent him.
- Languages: TypeScript (majority), Python, Go.
- No stars, no followers — designs must not depend on social proof metrics.
- Available data per render: GitHub GraphQL contribution calendar, language split, recently-pushed repos, commit hour-of-day; Chandigarh weather via Open-Meteo (no key).

## Audience
Developers and recruiters landing on the profile. They see the SVG for ~3 seconds before scrolling to repos.

## Constraints (hard)
- SVG inside GitHub's `<img>` sandbox: system fonts only, CSS/SMIL animation OK, no JS, no external images.
- Rendered by `scripts/terrain.mjs` (to be replaced), published to `output` branch, cached ~5 min by raw.githubusercontent CDN.
- Dark and light GitHub themes both real; `prefers-color-scheme` works.

## Taste record (user feedback, binding)
- Rejected: neon/terminal/cyan aesthetic ("cringe", harsh).
- Rejected: quiet notebook/museum-label round ("too simple or too much").
- Wants: middle density, refined, modern, confident. Gave "surprise me" on vibe/density/color for round 3.

*Assumptions inferred from session, not interviewed: audience, 3-second glance model.*
