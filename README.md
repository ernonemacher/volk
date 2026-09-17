# Volk

Live Squad intel, built on public data. Volk is the umbrella; each part is its
own repository, pulled in here as a submodule.

| Part | What it does |
|---|---|
| [`volk-bot/`](https://github.com/ernonemacher/volk-bot) | Discord bot publishing a live match map, with the lane walked by hand |
| [`volk-web/`](https://github.com/ernonemacher/volk-web) | Uniform and vehicle catalogues, for what the map cannot answer |

The folders carry the repository names so a checkout reads the same as GitHub
does. `volk-web` is private for now: the uniform imagery and the vehicle
catalogue are other people's extraction work, and the crediting is worth
settling before any of it is public.

Both run off public sources: the [SquadCalc](https://github.com/sh4rkman/SquadCalc)
API for layers and servers, snapshots of community catalogues for the rest. See
each part's own README, and the licence it inherits.

## Working on it

Clone with the parts, not just the shell:

```bash
git clone --recurse-submodules git@github.com:ernonemacher/volk.git
```

A plain `git clone` leaves `volk-bot/` and `volk-web/` empty. If that happens:

```bash
git submodule update --init --recursive
```

Each submodule is an ordinary repository: `cd volk-bot`, branch, commit and push as
usual. The catch is that this repository records **which commit** of each part
it points at, so publishing a change is two steps:

```bash
cd volk-bot && git commit && git push      # the change itself
cd .. && git add volk-bot && git commit    # move the pointer here
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
