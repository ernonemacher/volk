# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Discord bot that publishes a live Squad match map into a channel. It keeps **two messages**, edited in place: an embed with match state and controls, and a bare image attachment below it (Discord renders loose attachments much larger than embedded images).

Everything runs off public data. The server's current layer comes from the SquadCalc API (fed by BattleMetrics); the lane graph comes from the layer endpoint. **No flag capture state is public anywhere**, so members walk the lane by hand through a dropdown: pick a flag, the map narrows to what is still reachable.

## Commands

```bash
node bot.js                                   # run the bot (npm run bot)
node render-map.js <Layer_Name>               # render a layer to preview-<Layer>.jpg
node render-map.js Yehorivka_RAAS_v2 B1 B2    # render with a lane walked
node render-map.js Yehorivka_RAAS_v2 --team2  # render from team 2's main
node render-emojis.mjs                        # rebuild assets/*.svg into PNGs
node ws-test.mjs <sessionId>                  # probe a SquadCalc websocket session
```

`render-map.js` is the main development loop: it prints gamemode, live cluster count, next lane step and timing, and needs no Discord token. There is no test suite and no linter.

Requires Node with ESM (`"type": "module"`). `.env` needs `DISCORD_TOKEN` and `DISCORD_CHANNEL_ID` (see `.env.example`). `SQUADCALC_API` optionally overrides the API base.

## Architecture

Data flows one way, and each module has a single upstream concern:

```
servers.js   config.json + /api/get/servers  -> which server, what layer is live
layer.js     /api/get/layer                  -> lane graph, projector, gamemode rules
render-map.js  basemap + SVG overlay         -> JPEG buffer
panel.js     panel state                     -> embed + components
bot.js       Discord client                  -> orchestrates the above
commands.js  /squadcalc slash command        -> admin config, writes config.json
i18n.js      locales/                        -> translator(lng)
```

**Two API bases, on purpose.** `servers.js` uses production `squadcalc.app/api`; `layer.js` and `render-map.js` default to `beta.squadcalc.app/api`, which carries modded layers and classifies gamemodes production still reports as "Unknown". Beta is the `dev` branch and can break without notice.

**No browser in the live path.** Rendering is a cached basemap plus an SVG composite flattened by sharp, a few hundred ms once cached. This is what makes free hosting viable. `experiments/session.js` (Playwright, persistent headless SquadCalc session) belongs to the **superseded** architecture and is not reachable from `bot.js`.

### Rendering constraints

- Everything composes at `OUTPUT_WIDTH` 1600. Source textures are 4096²; shrinking *before* compositing cuts ~4.5s to a fraction.
- The overlay and the basemap need **two separate sharp pipelines**: within one pipeline sharp applies `resize` before `composite`, which shrinks the basemap and rejects the overlay.
- Styling deliberately mirrors SquadCalc's own `mapObjectives.scss` so the two read as one tool. The one intentional departure is labelling every live objective, since a static image has no hover.
- Capture zones are ported from SquadCalc's `createCapZone`, with Leaflet `Circle`/`Rectangle` objects replaced by SVG. They are drawn only for objectives still in play; all 35 would bury the map.

### Lane logic (layer.js)

Gamemode, not data shape, decides behaviour. Invasion stores its links under `clusters` yet is randomised, and reading the structure instead of the mode got this backwards once:

- `RANDOMISED` (RAAS, RVAAS, RINV, Invasion): lane drawn at match start, walked one flag at a time.
- `LINEAR` (AAS, Seed, Skirmish): fixed chain, dropdown hidden, everything drawn alive.
- Anything else (Destruction, TC, TDM…) has no lane.
- `needsPerspective` is RAAS/RVAAS only: those are symmetric so either main is a valid viewpoint. Invasion is asymmetric, so offering the choice would be wrong.

`reversed` walks the graph backwards because links are stored one way only (main 1 towards main 2).

### Discord plumbing gotchas

- The map is re-uploaded with a **fresh filename every time** (`map-${Date.now()}.jpg`): Discord's CDN caches by URL, so reusing a name leaves the stale image on screen.
- `lastRenderKey` (`layerName|picked`) skips re-uploading several hundred KB when the image would be identical. Reset it to `null` whenever the image must come back.
- `adoptMessages` claims the bot's own messages on boot and deletes leftovers, so a restart edits the panel in place instead of stacking a new one.
- Select menus cap at 25 options; `listServers` and the flag menu both slice to that.
- Picks are validated through `canPick` before being trusted: interactions arrive late for options a layer change already invalidated.
- Picks reset automatically on layer change (`syncLayer`), mirroring SquadCalc's `_resetLayer`.

## Configuration

`config.json` is written at runtime by `/squadcalc` and cached in memory by `servers.js` (`configCache`). Always go through `readConfig`/`writeConfig`; never write the file directly.

Server list is two sources merged: **pinned** ids (always shown, even offline or seeding) and **discovery** (in-match servers from the API, above a player threshold). Auto-refresh defaults to 60s, clamped to `AUTO_MIN`/`AUTO_MAX` (30–3600).

## i18n

Two layers per language in `locales/`:

- `_termos_<lng>.json` — domain labels (`teams`, `players`, `Faction`, `Layer`) copied from SquadCalc itself, so the panel uses the same word the member sees in the app.
- `<lng>.json` — the bot's own phrases, which override the imported terms.

Missing keys fall back to `en`, then to the key itself, so an incomplete language degrades instead of breaking. Admin replies in `commands.js` are currently hardcoded Portuguese and bypass i18n entirely.

Keys live under the English namespace (`panel.*`, `warn.*`, `reason.*`, `select.*`, `button.*`). Add every new key to all seven languages (`de en fr pt ru uk zh`); a missing one falls back to English and then to the raw key, which is what users see if you forget.

## Legacy files

Not reachable from `bot.js`: `experiments/` holds superseded approaches (a persistent Playwright SquadCalc session, a bare WebSocket session client), and `tools/` holds asset generation plus a read-only PowerShell analysis of the Squad client log.

`BACKLOG.md` holds the investigated-but-unstarted work, notably the Windows log-reading agent, along with what the log does and does not expose. Read it before designing anything that touches layer detection.
