/**
 * ABANDONED. Kept for the record.
 *
 * A persistent SquadCalc session held by the bot: a headless tab joined server
 * mode, created a shared session and stayed open for the bot's lifetime, which
 * kept the session alive, cut a screenshot to about a second instead of eleven,
 * and let the tab receive members' CLICK_LAYER events so the image showed the
 * flags someone had clicked.
 *
 * Replaced by server-side composition (`render-map.js`): sharp plus an SVG
 * overlay renders in roughly half a second, in tens of megabytes rather than a
 * gigabyte, which is what makes free hosting viable. The one thing lost is the
 * shared session, so other people's pings no longer reach the image.
 *
 * Proven here and worth keeping: a plain Node WebSocket client can join a
 * SquadCalc session and receive `selectedFlags`, `weapons`, `targets` and
 * `markers` with no browser at all.
 */

import { chromium } from "playwright";
import { APP_URL, fetchServerState } from "../src/servers.js";

// A bigger viewport makes Leaflet draw the map into more pixels, pulling more
// detail from the source image. At deviceScaleFactor 2 this lands near 3000px.
const VIEWPORT = { width: 1600, height: 1600 };
const LOAD_TIMEOUT = 45000;

// Map style, used both for the bot's screenshot and for the published link, so
// a member sees what the image shows: a session syncs map and layer but not the
// style, and without this they would land on the plain basemap.
const MAP_TYPE = "terrainmap";

export class BotSession {
    /** @param {string} serverId  BattleMetrics server id */
    constructor(serverId) {
        if (!serverId) throw new Error("BotSession needs a serverId");
        this.serverId = String(serverId);

        this.browser = null;
        this.ctx = null;
        this.page = null;
        this.sessionId = null;
        this.loadedMap = null; // name of the map the tab is showing
    }

    /**
     * The link the bot publishes for members to join.
     *
     * Carries `session` and `type`, and deliberately not `server`. With
     * `server`, every member would sync with the server themselves and
     * broadcast UPDATE_LAYER on a layer change; since each change fires
     * `_resetLayer()`, a group of five would produce five resets and wipe the
     * flags just marked. The bot stays the only authority on the layer.
     *
     * `map` and `layer` are left out too: with the bot in server mode they are
     * overwritten by whatever the server is actually playing.
     */
    get link() {
        if (!this.sessionId) return null;
        return `${APP_URL}/?session=${this.sessionId}&type=${MAP_TYPE}`;
    }

    async start() {
        this.browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
        this.ctx = await this.browser.newContext({
            viewport: VIEWPORT,
            deviceScaleFactor: 2,
            locale: "en-GB",
        });
        this.page = await this.ctx.newPage();

        // Silences SquadMortarOverlay noise: SquadCalc probes 127.0.0.1 for it
        // every 5s and it will never exist here.
        this.page.on("console", () => {});

        await this.page.goto(`${APP_URL}/?server=${this.serverId}&type=${MAP_TYPE}`, {
            waitUntil: "domcontentloaded",
            timeout: LOAD_TIMEOUT,
        });
    }

    async stop() {
        if (this.browser?.isConnected()) await this.browser.close();
        this.browser = this.ctx = this.page = null;
        this.sessionId = null;
    }

    /**
     * Ensures a session is live, creating one when needed.
     * @returns {Promise<{ sessionId: string|null, created: boolean }>}
     */
    async ensureSession() {
        const live = await this.page
            .locator(".btn-session")
            .evaluate((el) => el.classList.contains("active"))
            .catch(() => false);

        if (live && this.sessionId) return { sessionId: this.sessionId, created: false };

        await this.page.click(".btn-session");
        await this.page.waitForFunction(
            () => new URLSearchParams(location.search).has("session"),
            null,
            { timeout: 15000 },
        );

        this.sessionId = await this.page.evaluate(
            () => new URLSearchParams(location.search).get("session"),
        );
        return { sessionId: this.sessionId, created: true };
    }

    /**
     * The server's state, read from the API rather than the browser.
     * `live: false` means there is no drawable match and the bot should pause
     * instead of rendering.
     */
    async state() {
        const s = await fetchServerState(this.serverId);

        if (!s.found) {
            return { ...s, live: false, reasonKey: "reason.offline" };
        }
        if (!s.playable) {
            return { ...s, live: false, reasonKey: "reason.seed" };
        }
        return { ...s, live: true, reasonKey: null };
    }

    /**
     * Screenshots the map from the live tab.
     * @returns {Promise<Buffer>} JPEG
     */
    async capture(expectedMap) {
        await this.waitForMap(expectedMap);
        await this.hideUiNoise();
        await this.page.waitForTimeout(600);

        return this.page.screenshot({
            type: "jpeg",
            quality: 90,
            clip: await this.cropBox(expectedMap),
        });
    }

    /**
     * Waits for the map to settle.
     *
     * The elements existing is not enough: SquadCalc opens on its default map
     * and only then does server mode switch to the real layer. Shooting early
     * catches the transition, spinner on top and the wrong image underneath.
     */
    async waitForMap(expectedMap) {
        const target = String(expectedMap).toLowerCase();

        await this.page.waitForFunction(
            (name) => {
                if (document.querySelector(".spinner")) return false;
                return [...document.querySelectorAll("#map .leaflet-image-layer")].some((el) =>
                    (el.src || "").toLowerCase().includes(`/${name}/`),
                );
            },
            target,
            { timeout: LOAD_TIMEOUT },
        );

        // marker count stable across two samples
        let previous = -1;
        for (let i = 0; i < 20; i++) {
            const current = await this.page.evaluate(
                () => document.querySelectorAll(".leaflet-marker-pane > *").length,
            );
            if (current === previous && current > 5) break;
            previous = current;
            await this.page.waitForTimeout(400);
        }

        this.loadedMap = expectedMap;
    }

    /** How many objective flags are revealed, i.e. clicked by someone in the session. */
    async countFlags() {
        return this.page.evaluate(() => ({
            mains: document.querySelectorAll(".leaflet-marker-pane .flag.main").length,
            objectives: document.querySelectorAll(".leaflet-marker-pane .flag:not(.main)").length,
        }));
    }

    async hideUiNoise() {
        await this.page.addStyleTag({
            content: `
                header,
                #toast,
                #mapLayerMenu,
                #mapButtons,
                .btn-session,
                #sessionActions,
                .leaflet-control-container,
                dialog { display: none !important; }
            `,
        });
    }

    /** Crops to the useful area: Leaflet leaves a lot of black around the map. */
    async cropBox(expectedMap) {
        const target = String(expectedMap).toLowerCase();
        const box = await this.page.evaluate((name) => {
            const layer = [...document.querySelectorAll("#map .leaflet-image-layer")].find((el) =>
                (el.src || "").toLowerCase().includes(`/${name}/`),
            );
            if (!layer) return null;
            const r = layer.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
        }, target);

        if (!box || box.width < 50) return undefined;

        // Tight margin: every pixel of black background is a pixel of map lost
        // in Discord's thumbnail. 2% still fits the main labels.
        const pad = Math.round(box.width * 0.02);
        const x = Math.max(0, box.x - pad);
        const y = Math.max(0, box.y - pad);
        return {
            x,
            y,
            width: Math.min(VIEWPORT.width - x, box.width + pad * 2),
            height: Math.min(VIEWPORT.height - y, box.height + pad * 2),
        };
    }
}
