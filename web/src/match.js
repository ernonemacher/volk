/**
 * Resolve o estado de uma partida para o que a pagina precisa mostrar.
 *
 * Roda no browser: a API do SquadCalc manda CORS liberado, entao nao ha
 * servidor no meio. Os dois catalogos (camuflagem, veiculos) sao arquivos
 * estaticos gerados por `tools/extract-*.mjs`.
 */

const API = "https://beta.squadcalc.app/api";

/** IDs que a API reporta mas os catalogos nao cobrem (faccoes de mod). */
export const isCovered = (factionId, camo) => camo.factions.some((f) => f.factionIds.includes(factionId));

/**
 * Bioma da partida, deduzido dos veiculos em jogo.
 *
 * As unidades nao carregam o bioma no nome, mas os veiculos sim: o mesmo USMC
 * recebe `BP_M1A1_USMC_Woodland` em Yehorivka e a variante Desert em Al Basrah.
 * Contar isso evita manter uma tabela mapa -> bioma, que envelheceria a cada
 * mapa novo e nao cobriria mod nenhum.
 */
export function biomeOf(unit) {
    let woodland = 0;
    let desert = 0;
    for (const v of unit.vehicles ?? []) {
        if (/woodland|forest/i.test(v.rawType)) woodland++;
        if (/desert|arid/i.test(v.rawType)) desert++;
    }
    if (!woodland && !desert) return null; // faccao sem variante, ou mapa neutro
    return desert > woodland ? "desert" : "forest";
}

/**
 * A entrada de camuflagem para uma faccao neste mapa.
 *
 * `biome` null (faccao de uma camuflagem so, como ADF) cai na entrada
 * `default`. Faccao fora do guia devolve null, e a pagina omite a secao em vez
 * de mostrar a camuflagem de outro exercito.
 */
export function camoFor(factionId, biome, camo) {
    const mine = camo.factions.filter((f) => f.factionIds.includes(factionId));
    if (!mine.length) return null;
    return mine.find((f) => f.variant === biome) ?? mine.find((f) => f.variant === "default") ?? mine[0];
}

/**
 * Os veiculos de uma unidade, cruzados com os componentes destrutiveis.
 *
 * `rawType` vem com sufixo `_C` (`BP_M1A1_USMC_C`); o catalogo usa o nome sem
 * ele. Sao duas fontes independentes, entao um veiculo sem match nao e erro:
 * aparece sem weakspots em vez de sumir.
 */
export function vehiclesOf(unit, catalogue) {
    return (unit.vehicles ?? []).map((v) => {
        const entry = catalogue.vehicles[String(v.rawType).replace(/_C$/, "")];
        return {
            name: v.type,
            count: v.count,
            icon: v.icon,
            delay: v.delay,
            respawn: v.respawnTime,
            tickets: v.ticketValue,
            health: entry?.health ?? null,
            parts: entry?.parts ?? [],
        };
    });
}

/** Estado bruto do servidor, da mesma API que o bot usa. */
export async function fetchServer(serverId) {
    const { servers } = await (await fetch(`${API}/get/servers`)).json();
    const s = servers.find((x) => x.id === String(serverId));
    if (!s) return { found: false };

    const det = s.attributes.details ?? {};
    return {
        found: true,
        name: s.attributes.name,
        players: s.attributes.players,
        maxPlayers: s.attributes.maxPlayers,
        layer: det.map,
        gamemode: det.gameMode,
        // `mapName` nulo e o sinal de layer que o SquadCalc nao desenha, em
        // geral um seed atras de prefixo de mod.
        playable: Boolean(s.mapName && det.map),
        teams: [
            { factionId: s.team1FactionId, unit: s.unit1 },
            { factionId: s.team2FactionId, unit: s.unit2 },
        ],
    };
}

/** Tudo que a pagina desenha, para um servidor. */
export async function resolveMatch(serverId, { camo, vehicles }) {
    const server = await fetchServer(serverId);
    if (!server.found || !server.playable) return { server, teams: [] };

    const layer = await (await fetch(`${API}/get/layer?name=${encodeURIComponent(server.layer)}`)).json();
    const units = [...(layer.units?.team1Units ?? []), ...(layer.units?.team2Units ?? [])];

    const teams = server.teams.map(({ factionId, unit }) => {
        const entry = units.find((u) => u.unitObjectName === unit);
        const biome = entry ? biomeOf(entry) : null;
        return {
            factionId,
            factionName: entry?.factionName ?? factionId,
            unitName: entry?.displayName ?? unit,
            biome,
            camo: camoFor(factionId, biome, camo),
            vehicles: entry ? vehiclesOf(entry, vehicles) : [],
        };
    });

    return { server, layer: { name: layer.Name, map: layer.mapName }, teams };
}
