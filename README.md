# PhytoAtlas — Explore every plant through AI

Photograph a leaf and get a **Plant Passport**: identity with confidence, health reading (observation vs inference), taxonomy, context reasoning, a dated timeline, change detection between scans, and an investigation chat. Built for Hack2Skill Build for AI, Track 4 (AgriN & Regenerative Agricultural Intelligence).

Plant ID, disease detection and biodiversity apps already exist (Pl@ntNet, Plantix, PictureThis, iNaturalist). PhytoAtlas's angle is what happens *after* identification: a persistent record per plant, change over time, and reasoning that keeps observation, inference and uncertainty separate.

## Run locally
```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY (and optionally PLANTNET_API_KEY)
npm run dev
```
No keys? The app runs in a clearly labelled **demo mode** with sample data.

## Deploy to Vercel
1. Push to GitHub, then **Add New → Project** on vercel.com and import the repo (framework auto-detects as Next.js).
2. Add `GEMINI_API_KEY` (and optional `PLANTNET_API_KEY`, `GEMINI_MODEL`) under Environment Variables.
3. Deploy. Open the URL on your phone: the Scan button opens the camera.

## How it works
- `app/api/analyze/route.ts` — server-only: validates images, optionally calls Pl@ntNet, then Gemini with a JSON-only prompt for `scan`, `compare` and `ask`. Keys never reach the browser.
- `app/page.tsx` — UI: scanner, passports, timeline, tabs, chat. Photos are downscaled on-device before upload.
- **Storage (current):** passports live in the browser's `localStorage` (no setup, private to the device).
- **Evidence (current):** claims are model-generated and labelled as such. There is no retrieval/RAG yet.

## Honest limits and next steps
Supabase (Postgres + Storage) for cross-device persistence, a pgvector RAG layer over curated botanical sources for real citations, weather enrichment, and pixel-level change metrics. Until then, changes are described qualitatively; no measurements are invented.

## 2-minute pitch
Plant identification is solved well enough. A plant, though, is not a static image: it changes with weather, care and disease pressure. PhytoAtlas gives each plant a passport. One photo gives identity, health and context. Every later photo joins the timeline, and PhytoAtlas explains what changed, how sure it is, and which photo to take next. Existing tools identify plants; PhytoAtlas remembers them.

## Demo flow (2–3 min)
Scan a damaged leaf → passport appears → Taxonomy tab → Health tab (observation vs inference) → add location/context → Evidence tab → add a second scan → change panel → Ask "Why is my plant changing?" → agent lists photos to take.
