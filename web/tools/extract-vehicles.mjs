/**
 * Reduz o dataset de veiculos do squad-armor ao que a pagina usa.
 *
 * A fonte tem 14 MB: 473 veiculos com malhas, rotacoes e curvas de penetracao.
 * Servir isso a cada visita seria abusar de infra de terceiro, e o JSON nao
 * manda CORS, entao o browser nao o busca direto de qualquer forma. Aqui ele
 * vira um arquivo de ~150 KB versionado no repo.
 *
 * A chave de saida e o `rawName` (`BP_M1A1`), que casa com o `rawType` que a
 * API do SquadCalc entrega por veiculo — verificado em 262/262 veiculos.
 *
 * Fonte: https://squad-armor.com (dados extraidos dos arquivos do jogo)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SOURCE = "https://squad-armor.com/assets/Game_vehicles-DgyyVa3G.json";
const OUT = process.argv[2] ?? "./data/vehicles.json";

/** Componentes que importam em combate; o resto e malha de colisao e decoracao. */
const RELEVANT = /engine|ammo|track|fueltank|turret|gunner|driver|optic/i;

/**
 * Os nomes vem como asset do jogo (`SM_Kraz_Engine_Col`, `BTRD_Tracks_Col_Left`).
 * A pagina e lida durante a partida, entao o que importa e "engine" ou "track
 * esquerda", nao o nome da malha.
 */
function labelOf(name) {
    const n = name.toLowerCase();
    const side = /left/.test(n) ? " esquerda" : /right/.test(n) ? " direita" : "";
    if (/ammo/.test(n)) return "Munição";
    if (/track/.test(n)) return `Lagarta${side}`;
    if (/fueltank/.test(n)) return "Tanque de combustível";
    if (/engine/.test(n)) return "Motor";
    if (/turret/.test(n)) return "Torre";
    if (/optic/.test(n)) return "Óptica";
    if (/gunner|driver/.test(n)) return /gunner/.test(n) ? "Artilheiro" : "Motorista";
    return name;
}

/**
 * Achata a arvore de componentes. A estrutura mistura arrays e objetos em
 * profundidades diferentes conforme o veiculo, entao vale percorrer tudo em
 * vez de assumir um formato.
 */
function partsOf(node, found = new Map()) {
    if (Array.isArray(node)) {
        for (const x of node) partsOf(x, found);
        return found;
    }
    if (!node || typeof node !== "object") return found;

    if (node.displayName && node.componentHealth !== undefined && RELEVANT.test(node.displayName)) {
        // O mesmo componente aparece repetido em varios niveis da arvore.
        found.set(node.displayName, {
            name: labelOf(node.displayName),
            raw: node.displayName,
            hp: node.componentHealth,
            repairable: node.canBeRepairedAfterDestroy ?? false,
        });
    }
    for (const v of Object.values(node)) partsOf(v, found);
    return found;
}

async function main() {
    console.log("baixando", SOURCE);
    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`squad-armor respondeu ${res.status}`);
    const raw = await res.json();

    const vehicles = {};
    for (const [key, v] of Object.entries(raw.vehicles)) {
        const parts = [...partsOf(v.components).values()].sort((a, b) => a.hp - b.hp);
        vehicles[key] = {
            name: v.displayName,
            type: v.type,
            icon: v.icon,
            health: v.vehicleHealth,
            tickets: v.ticketValue,
            respawn: v.respawnTime,
            factions: v.factions,
            amphibious: v.amphibious,
            parts,
        };
    }

    const out = {
        source: SOURCE,
        sourceName: "squad-armor.com",
        gameVersion: raw.version,
        extractedAt: new Date().toISOString().slice(0, 10),
        vehicles,
    };

    await mkdir(dirname(OUT), { recursive: true });
    const json = JSON.stringify(out);
    await writeFile(OUT, json);

    const withParts = Object.values(vehicles).filter((v) => v.parts.length).length;
    console.log(`${Object.keys(vehicles).length} veiculos (${withParts} com componentes)`);
    console.log(`Squad ${raw.version} -> ${OUT}  ${(json.length / 1024).toFixed(0)} KB`);
}

main();
