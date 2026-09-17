/**
 * Bot message translation.
 *
 * Two layers, on purpose:
 *
 *   `_terms_<lng>.json`  domain labels (Teams, Players, Faction, Layer) copied
 *                        from SquadCalc itself. Reusing them means the panel
 *                        calls things what the member already sees on screen in
 *                        the app, translated by the people who maintain it.
 *   `<lng>.json`         the bot's own phrases, written here.
 *
 * A key missing from the chosen language falls back to English, and only then
 * to the key itself, so an incomplete language degrades instead of breaking.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "locales");
const FALLBACK = "en";
const TERMS_PREFIX = "_terms_";

/** @type {Record<string, Record<string, string>>} */
const dictionaries = {};

function load() {
    for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
        const base = file.replace(/\.json$/, "");
        const isTerms = base.startsWith(TERMS_PREFIX);
        const lng = isTerms ? base.slice(TERMS_PREFIX.length) : base;

        dictionaries[lng] ??= {};
        const content = JSON.parse(readFileSync(join(DIR, file), "utf8"));

        // The bot's own phrases win over the imported terms, so it can override
        // a label when it needs a different tone.
        dictionaries[lng] = isTerms
            ? { ...content, ...dictionaries[lng] }
            : { ...dictionaries[lng], ...content };
    }
}
load();

/** Languages with their own phrase file, not only imported terms. */
export function availableLanguages() {
    return readdirSync(DIR)
        .filter((f) => f.endsWith(".json") && !f.startsWith(TERMS_PREFIX))
        .map((f) => f.replace(/\.json$/, ""))
        .sort();
}

export function isValidLanguage(lng) {
    return availableLanguages().includes(lng);
}

/**
 * Translates a key.
 *
 * @param {string} lng   language code
 * @param {string} key
 * @param {Record<string, string|number>} [vars]  replaces {var} in the text
 */
export function t(lng, key, vars = {}) {
    const text = dictionaries[lng]?.[key] ?? dictionaries[FALLBACK]?.[key] ?? key;

    return String(text).replace(/\{(\w+)\}/g, (match, name) =>
        name in vars ? String(vars[name]) : match,
    );
}

/** Bound to one language, so callers do not repeat the code every time. */
export function translator(lng) {
    return (key, vars) => t(lng, key, vars);
}
