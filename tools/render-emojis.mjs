/**
 * Turns the emoji SVGs into PNGs with real transparency.
 *
 * Uses Playwright's Chromium with `omitBackground`, which produces a genuine
 * alpha channel. Image generators do not do this reliably: the first batch came
 * back with the transparency checkerboard painted in as pixels.
 */
import { chromium } from "playwright";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const DIR = "assets";
const SIZES = [128, 512]; // 128 for Discord, 512 for later touch-ups

const browser = await chromium.launch();
const files = (await readdir(DIR)).filter((f) => f.endsWith(".svg"));

for (const svgFile of files) {
    const svg = await readFile(join(DIR, svgFile), "utf8");
    const name = svgFile.replace(/\.svg$/, "");

    for (const size of SIZES) {
        const page = await browser.newPage({ viewport: { width: size, height: size } });
        await page.setContent(
            `<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg.replace(
                /width="\d+" height="\d+"/,
                `width="${size}" height="${size}"`,
            )}`,
        );
        await page.screenshot({
            path: join(DIR, `${name}-${size}.png`),
            omitBackground: true, // real alpha
        });
        await page.close();
    }
    console.log(`  ${name}: PNG at ${SIZES.join(" and ")}px`);
}

await browser.close();
