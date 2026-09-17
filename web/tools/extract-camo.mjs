/**
 * Extrai o guia "All Faction Uniforms" do Steam para um catalogo de camuflagem.
 *
 * Saida: camo/index.json + camo/<FACTION>-<variant>-{hero,roles}.png
 *
 * O guia separa Forest/Desert como secoes distintas, que e exatamente a
 * distincao que importa em jogo: o mesmo exercito aparece diferente conforme
 * o bioma do mapa.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const GUIDE = "https://steamcommunity.com/sharedfiles/filedetails/?id=3187707602";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** IDs do guia que divergem dos que a API de servidores reporta. */
const ALIAS = { US: "USA", INS: "MEI" };

const OUT = process.argv[2] ?? "./camo";

async function main() {
    const html = await (await fetch(GUIDE, { headers: { "User-Agent": UA } })).text();

    const re = /<div class="subSectionTitle">([\s\S]*?)<\/div>([\s\S]*?)(?=<div class="subSectionTitle">|<\/div>\s*<\/div>\s*<div class="rightContents)/g;
    const entries = [];

    for (const m of html.matchAll(re)) {
        const title = m[1].replace(/<[^>]*>/g, "").trim();
        const imgs = [
            ...new Set(
                [...m[2].matchAll(/href="(https:\/\/images\.steamusercontent\.com\/ugc\/[^"]+)"/g)].map((x) => x[1]),
            ),
        ];
        if (!imgs.length) continue; // cabecalhos de bloco (BLUFOR, PAC...)

        const t = title.match(/^(.*?)(?:\s*-\s*(Forest|Desert)\s*Camo)?\s*-\s*([A-Z/]+)$/);
        if (!t) {
            console.warn("titulo fora do padrao, ignorado:", title);
            continue;
        }

        const ids = t[3].split("/").map((id) => ALIAS[id] ?? id);
        entries.push({
            name: t[1].trim(),
            variant: (t[2] ?? "default").toLowerCase(),
            factionIds: ids,
            // A 1a imagem e a arte da faccao; a 2a e a grade role a role.
            hero: imgs[0],
            roles: imgs[1] ?? null,
        });
    }

    await mkdir(OUT, { recursive: true });

    for (const e of entries) {
        const base = `${e.factionIds[0]}-${e.variant}`;
        for (const [kind, url] of [["hero", e.hero], ["roles", e.roles]]) {
            if (!url) continue;
            const png = Buffer.from(await (await fetch(url, { headers: { "User-Agent": UA } })).arrayBuffer());

            // Os PNGs somam ~60 MB, o que inviabiliza hospedagem estatica. Em
            // WebP o conjunto cai para ~6 MB sem perder legibilidade. A grade
            // de roles precisa de mais largura que a arte: ela e lida, nao vista.
            const webp = await sharp(png)
                .resize({ width: kind === "roles" ? 1400 : 1100, withoutEnlargement: true })
                .webp({ quality: 82 })
                .toBuffer();

            const file = `${base}-${kind}.webp`;
            await writeFile(join(OUT, file), webp);
            e[`${kind}File`] = file;
            console.log(`${file.padEnd(28)} ${(webp.length / 1024).toFixed(0)} KB`);
        }
    }

    await writeFile(
        join(OUT, "index.json"),
        JSON.stringify(
            {
                source: GUIDE,
                sourceTitle: "All Faction Uniforms (Steam Community guide)",
                extractedAt: new Date().toISOString().slice(0, 10),
                factions: entries,
            },
            null,
            2,
        ),
    );

    const variants = entries.filter((e) => e.variant !== "default").length;
    console.log(`\n${entries.length} entradas (${variants} com variante de bioma)`);
}

main();
