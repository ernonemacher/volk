# volk/web

The web face of volk: a one pager per server, showing what the bot's map does
not — who you are looking at, and where their vehicles break.

The bot answers *where to go*. This answers *what that is, and how to kill it*.
Same product, different question, so it lives in the same repo and shares the
data sources.

## Why it exists

The information is already out there, and that is the problem: it is spread
across the Squad wiki, a Steam guide on uniforms, and two or three armour
sites. Looking anything up mid-match costs an alt-tab and a page that was never
meant to be read in ten seconds.

This page shows only the two factions currently playing, picked from the live
server, and hides the rest of Squad.

## Layout

```
web/
  tools/extract-camo.mjs       Steam uniforms guide -> data/camo.json + public/camo/*.webp
  tools/extract-vehicles.mjs   squad-armor.com      -> data/vehicles.json
  src/match.js                 live server + catalogues -> what the page draws
  data/                        generated catalogues, versioned
  public/camo/                 46 uniform images, WebP
```

## Regenerating the catalogues

Both are snapshots, not live dependencies. Run them when Squad ships a new
version, not on every build:

```bash
node tools/extract-camo.mjs ./public/camo      # ~6 MB, 23 entries
node tools/extract-vehicles.mjs ./data/vehicles.json   # ~139 KB, 473 vehicles
```

`data/vehicles.json` carries the `gameVersion` it was cut from (`v10.5.0`), so
a stale catalogue is visible rather than silent.

## How the biome is chosen

Desert camouflage on a forest map is noise, so each faction's uniform has to
match the map. There is no map-to-biome table: units do not carry the biome,
but their vehicles do, and the layer API already returns it.

The same USMC Combined Arms unit fields 7 Woodland vehicles on Yehorivka and
Desert ones on Al Basrah, Tallil and Fallujah. `biomeOf` counts them and takes
the majority. A faction with a single uniform (ADF, BAF, AFU) returns null and
falls back to its default entry.

This costs nothing to maintain and works on maps that do not exist yet.

## Coverage

Vanilla only. Of the 35 faction IDs seen live across 172 servers, the modded
ones (`SU_*`, `WZ_*`, `DAC`, `IRGC-2`…) have no uniform or kit data anywhere.
The page omits the section for them instead of showing another army's kit.

Known gaps: **WPMC** is missing from the uniforms guide, and **CRF**'s hero
image is a logo rather than soldiers.

## Sources

None of these declare a licence. They are credited on the page, and the data is
kept as a versioned snapshot rather than fetched in a loop.

- [SquadCalc](https://squadcalc.app) — live server, layer and unit data
- [squad-armor.com](https://squad-armor.com) — vehicle components, extracted
  from the game files
- [All Faction Uniforms](https://steamcommunity.com/sharedfiles/filedetails/?id=3187707602)
  — uniform and role imagery
- [Squad Wiki](https://squad.fandom.com) — kit and weapon data
