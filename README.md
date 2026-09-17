# Volk

Live Squad intel, built on public data. Volk is the umbrella; each part is its
own repository, pulled in here as a submodule.

| Part | What it does |
|---|---|
| [`bot/`](https://github.com/ernonemacher/volk-bot) | Discord bot publishing a live match map, with the lane walked by hand |
| `web/` | Uniform and vehicle catalogues, for what the map cannot answer |

`web/` is not published yet: its submodule points at a local checkout, so a
clone on another machine will fail to fetch it until it has a remote.

Both run off public sources: the [SquadCalc](https://github.com/sh4rkman/SquadCalc)
API for layers and servers, snapshots of community catalogues for the rest. See
each part's own README, and the licence it inherits.

## Working on it

Clone with the parts, not just the shell:

```bash
git clone --recurse-submodules git@github.com:ernonemacher/volk.git
```

A plain `git clone` leaves `bot/` and `web/` empty. If that happens:

```bash
git submodule update --init --recursive
```

Each submodule is an ordinary repository: `cd bot`, branch, commit and push as
usual. The catch is that this repository records **which commit** of each part
it points at, so publishing a change is two steps:

```bash
cd bot && git commit && git push      # the change itself
cd .. && git add bot && git commit    # move the pointer here
```

Skip the second and this repository still points at the old commit, which is the
usual way a submodule setup confuses people. To pull everyone else's work:

```bash
git pull --recurse-submodules
```

## Why separate repositories

The bot and the web face answer the same question from different angles, and
began in one repository. They are split because they have different lifecycles:
the bot is a long-running service with a deployment and a Discord token, the web
face is a static catalogue that gets rebuilt when a game version lands.
