# LUDUS / PLAYTEST OS · v0.4

A working product-demo MVP based on the six LUDUS UI reference screenshots and the **AI Playtesting Platform MVP Functional Specification (v0.1)**.

This version replaces Snake with a **Connect your game** flow using a YouTube gameplay-video link. The default example is Markiplier's Five Nights at Freddy's video: https://www.youtube.com/watch?v=iOztnsBPrAA. This is a prototype of the workflow, not a trained game-playing agent.

## Run locally

Requires **Node.js 20+**. No npm dependencies or API keys are necessary to run locally.

```bash
cd ludus-mvp
npm start
# Visit http://localhost:3000
```

`npm test` runs the automated API, fixtures, and navigation-source checks.

## Walkthrough

1. **Connect your game**: paste a `youtube.com/watch`, `youtu.be`, or supported YouTube embed/shorts link and click **CONNECT**. The opening page shows an embedded video preview in place of the old Snake board. It starts from the beginning; users can play the video within the iframe. The FNAF link is prefilled for an instant demo.
2. **Choose an archetype**: select one of six example personas (First-Time, Casual, Expert, Risk Taker, Completionist, Speedrunner). For now, every archetype intentionally uses **the same human-recorded gameplay video**, not different synthetic agent behavior.
3. **Simulation preview**: select **START PLAYTEST**. An API request persists your selected video and archetype as a session. The next page auto-starts a **separate 2:45 clip**, by default from **4:00 to 6:45** of the same video. The YouTube player auto-starts muted because browser autoplay policies often block sound. Users can turn the sound on in the player. If autoplay is blocked, press Play in the player. YouTube and the video's owner must permit embedding for playback to work.
4. **Report**: navigate the three sections, What worked, Where it broke, and What to improve. Illustrative findings link to offsets in the simulation excerpt. These are prepared example hypotheses, **not observations derived from AI analysis**.

Your recorded video ID and archetype selection are preserved in this browser session. Each created playtest has a unique URL and remains available across server restarts.

## Clip behavior

- Opening preview: YouTube video **0:00 to 1:15** (not autoplayed; interact with player to start it).
- Simulation preview: YouTube video **4:00 to 6:45**, maximum **165 seconds (2 minutes 45 seconds)**. Autoplay is requested, **muted**, with YouTube's native controls visible.
- Custom YouTube links will substitute your chosen video for both excerpts, while retaining those time ranges. Use a sufficiently long video. YouTube can block an embed, prevent autoplay, or skip timestamps for certain content or viewers. An **Open original video** link remains available.
- A third-party video is **not hosted, downloaded, cropped, or redistributed** by this app. It is streamed through YouTube's embed player.

## UI and motion

The project keeps the user-approved Figma presentation language: LUDUS mark, textured charcoal surface, typography, workflow sidebar, archetype cards, and editorial report tables. The v0.3 page navigation animation remains in place:

- Old screen exits with a 290 ms slide, fade, and subtle blur.
- New screen enters with a 570 ms slide, fade, and deblur.
- Background and sidebar remain stable while screen content moves.
- Reverse navigation slides in the opposite direction, and reduced-motion preferences disable choreography.

## Tech and persistence

This portable version uses a **dependency-free Node.js HTTP server** and a browser-side single-page app, not Next.js. It uses the API contracts from the spec. Sessions are stored in `data/sessions.json` by default. An optional Supabase Postgres adapter is included.

```text
GET  /api/health
GET  /api/games
GET  /api/archetypes?gameId=fnaf-video
GET  /api/playtests
POST /api/playtests
GET  /api/playtests/:id
GET  /api/playtests/:id/replay
GET  /api/playtests/:id/report
```

Session-creation request:

```json
{
  "gameId": "fnaf-video",
  "gameUrl": "https://www.youtube.com/watch?v=iOztnsBPrAA",
  "archetypeId": "first-time",
  "runCount": 1,
  "mode": "demo"
}
```

The backend validates video URLs against actual YouTube hosts and stores video IDs rather than arbitrary iframe HTML. API access to past sessions and session identifiers is intentionally minimal, suitable for a local demo only. Add authentication, authorization, rate limits, and privacy controls before production use.

### Optional Supabase

1. Create a Supabase project and run `sql/schema.sql` in its SQL Editor.
2. Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Restart the server. The health endpoint returns `"storageMode":"supabase"` when active.

For existing v0.3 databases, the script includes a migration to add `video_id`. Service-role keys must stay server-side.

## Limits and disclaimers

- **No trained AI model or automated gameplay** is running; the source is human-recorded footage from YouTube.
- All report contents and timeline annotations are **illustrative examples**, not verified behavioral analysis of the footage.
- A connected video link is a source of footage, **not a playable game engine connection**.
- The sample clip is the same for all archetypes. This is intentional until actual persona-conditioned simulations exist.
- YouTube embeds and autoplay depend on YouTube, the uploader's permissions, viewer/browser policies, and network availability.
- The previous Snake feature is replaced in this build. The older v0.3 ZIP remains separate.

## Design source

Figma: https://www.figma.com/design/rIKydZIhQ4L0i73SPDP6ab/lava-week-2-layan-tongfei-deck?node-id=184-2

All six original screenshots and the functional specification are included in `docs/`.
