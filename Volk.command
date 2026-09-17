#!/bin/bash
#
# Double-click target: starts the control panel and opens it in the browser.
#
# Lives at the repo root so it is the obvious thing to click. The terminal
# window macOS opens for it is the supervisor itself: closing it stops the
# panel and the bot with it, which is the point. An orphaned bot holding the
# Discord gateway with its logs going nowhere is what this replaces.

cd "$(dirname "$0")" || exit 1

PORT="${VOLK_PANEL_PORT:-7317}"

if [ ! -f .env ]; then
    echo "Falta o arquivo .env com DISCORD_TOKEN. Copie .env.example e preencha."
    echo
    read -r -p "Enter para fechar."
    exit 1
fi

# node lands in different places depending on how it was installed, and a
# double-clicked script gets a login shell that may not have the PATH the
# terminal does.
if ! command -v node >/dev/null 2>&1; then
    for candidate in /usr/local/bin /opt/homebrew/bin "$HOME/.volta/bin"; do
        [ -x "$candidate/node" ] && PATH="$candidate:$PATH" && break
    done
fi

if ! command -v node >/dev/null 2>&1; then
    echo "Node não encontrado. Instale com: brew install node"
    echo
    read -r -p "Enter para fechar."
    exit 1
fi

if [ ! -d node_modules ]; then
    echo "Instalando dependências (primeira execução)…"
    npm install || { echo "npm install falhou."; read -r -p "Enter para fechar."; exit 1; }
fi

# The panel serves the page; give it a moment before pointing a browser at it.
( sleep 1.5; open "http://localhost:${PORT}" ) &

echo "Painel: http://localhost:${PORT}"
echo "Feche esta janela para desligar o bot e o painel."
echo

exec node tools/control/server.js
