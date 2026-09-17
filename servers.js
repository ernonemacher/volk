/**
 * Server catalogue for the panel.
 *
 * Two sources, merged:
 *
 *   PINNED     ids an admin chose. Always listed, even while seeding or
 *              offline, so the panel never loses sight of the home server.
 *   DISCOVERY  servers currently in a match, taken from the SquadCalc API.
 *              Exists so there is something to test against when the pinned
 *              ones are down.
 *
 * Pinned servers are per guild and arrive in `cfg`; discovery is global and
 * comes from the store, because "which servers are in a match right now" has
 * the same answer for everyone.
 */
import { API_URL, APP_URL } from "./layer.js";
import { readDiscovery } from "./store.js";

// Same backend the layers come from, deliberately. Production reports
// `mapName: null` for modded layers, which the panel reads as "not drawable",
// so pointing the two at different builds made every modded server look
// unplayable while the layer endpoint had the full data.
export { API_URL, APP_URL } from "./layer.js";

/** Discord's cap on the number of options in a select menu. */
export const MAX_OPTIONS = 25;

/**
 * Map styles SquadCalc accepts in its `type` parameter. Anything else makes it
 * silently fall back to the basemap, so an invalid config must not reach the URL.
 */
export const MAP_TYPES = ["basemap", "terrainmap", "topomap"];

/** Bounds for the automatic refresh interval, in seconds. */
export const AUTO_MIN = 30;
export const AUTO_MAX = 3600;

/**
 * Public SquadCalc link for a server.
 *
 * Carries `server` rather than a fixed map and layer: SquadCalc then reads the
 * server's current layer and factions on its own, so the same link keeps
 * working across a rotation and the bot never has to republish it.
 */
export function squadcalcUrl(serverId, mapType) {
    const type = MAP_TYPES.includes(mapType) ? mapType : "terrainmap";
    return `${APP_URL}/?server=${serverId}&type=${type}`;
}

// --- API -------------------------------------------------------------------

/** Raw server list from the API, briefly cached to avoid repeat calls. */
let serverCache = { em: 0, data: null };

async function fetchAll() {
    if (Date.now() - serverCache.em < 10000 && serverCache.data) {
        return serverCache.data;
    }
    const res = await fetch(`${API_URL}/get/servers`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`API respondeu ${res.status}`);
    const { servers } = await res.json();
    serverCache = { em: Date.now(), data: servers };
    return servers;
}

function normalise(server) {
    const det = server.attributes.details ?? {};
    return {
        id: server.id,
        name: server.attributes.name,
        map: server.mapName,
        layer: det.map,
        team1: server.team1,
        team2: server.team2,
        unit1: det.squad_teamOne,
        unit2: det.squad_teamTwo,
        players: server.attributes.players,
        maxPlayers: server.attributes.maxPlayers,
        playTimeMin: Math.round((det.squad_playTime ?? 0) / 60),
        // A null `mapName` means a layer SquadCalc cannot draw, in practice a
        // seed layer behind a mod prefix. Without it there is no image to make.
        playable: Boolean(server.mapName && det.map),
    };
}

/**
 * A server's state. Always returns an object, even when the server dropped off
 * the list, so the panel can explain why instead of breaking.
 */
export async function fetchServerState(serverId) {
    const servers = await fetchAll();
    const s = servers.find((x) => x.id === String(serverId));
    if (!s) {
        return { found: false, playable: false, reason: "not in the server list" };
    }
    const n = normalise(s);
    return {
        found: true,
        reason: n.playable ? null : "layer not recognised by SquadCalc",
        ...n,
    };
}

/**
 * Builds the selector options: pinned first, then discovered.
 *
 * @returns {Promise<Array<{id, label, description, isPinned, playable}>>}
 */
export async function listServers(cfg) {
    const discovery = await readDiscovery();
    const all = await fetchAll();
    const byId = new Map(all.map((s) => [s.id, normalise(s)]));

    const options = [];
    const seen = new Set();

    for (const f of cfg.pinned ?? []) {
        const state = byId.get(f.id);
        seen.add(f.id);
        options.push({
            id: f.id,
            label: f.label,
            description: state
                ? state.playable
                    ? `${state.layer} · ${state.players}/${state.maxPlayers}`
                    : `seeding · ${state.players}/${state.maxPlayers}`
                : "offline",
            isPinned: true,
            playable: state?.playable ?? false,
        });
    }

    if (discovery?.active) {
        const candidates = all
            .map(normalise)
            .filter((s) => s.playable && !seen.has(s.id))
            .filter((s) => s.players >= (discovery.minPlayers ?? 50))
            .sort((a, b) => b.players - a.players)
            .slice(0, Math.min(discovery.count ?? 8, MAX_OPTIONS - options.length));

        for (const s of candidates) {
            options.push({
                id: s.id,
                // Squad server names run long and full of decoration; Discord
                // cuts at 100 and they are unreadable well before that.
                label: s.name.replace(/\s+/g, " ").trim().slice(0, 45),
                description: `${s.layer} · ${s.players}/${s.maxPlayers}`,
                isPinned: false,
                playable: true,
            });
        }
    }

    return options.slice(0, MAX_OPTIONS);
}

/** A server's label, for titles. Falls back to the id when unknown. */
export async function labelFor(serverId, cfg) {
    const isPinned = (cfg?.pinned ?? []).find((f) => f.id === String(serverId));
    if (isPinned) return isPinned.label;

    const state = await fetchServerState(serverId);
    return state.name ? state.name.replace(/\s+/g, " ").trim().slice(0, 45) : `Server ${serverId}`;
}
