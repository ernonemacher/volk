# Third-party code

This project is a derivative work of **SquadCalc** by Maxime *"sharkman"*
Boussard, released under the MIT License (Non-Commercial).

- Original project: https://github.com/sh4rkman/SquadCalc
- Live site: https://squadcalc.app

SquadCalc's licence carries a non-commercial restriction, which this project
inherits in full. It may not be sold, bundled into a paid product or service, or
run on anything that earns revenue from it, donations tied to access or
functionality included. See [LICENSE](LICENSE).

## What is derived, and how

| File | Relationship to SquadCalc |
|---|---|
| `lane-solver.js` | **Verbatim copy** of `src/js/squadLaneSolver.js` (dev branch). It was written free of Leaflet, the DOM and the app singleton, so it is taken unchanged: any divergence would show up as this bot disagreeing with squadcalc.app about the same match. |
| `layer.js` | Flag construction ported from `squadLayer.js` (`initRandomizedLayer`, `areLatLngsClose`), including the rule that a flag is a capture point and nearby points merge. |
| `render-map.js` | Drawing logic ported from `squadObjective.js`, `squadLayer.js` and `mapObjectives.scss`: flag colours per lane depth, capture-zone geometry (`createCapZone`), playable-area spline (`createSplineBorders`) and protection zones. |
| `locales/_terms_*.json` | Nine domain terms copied from SquadCalc's `public/locales/*/common.json`, so both tools call the same things by the same names in every language. |

## Runtime data

Map imagery, layer data and faction badges are fetched at request time from the
public SquadCalc API and are **not** redistributed in this repository.
