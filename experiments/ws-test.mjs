/**
 * Joins a SquadCalc shared session as a plain participant, no browser at all.
 *
 * Proves the session protocol is reachable from Node: the JOIN_SESSION reply
 * carries the full map state, and a member clicking a flag arrives as
 * CLICK_LAYER.
 *
 *   node experiments/ws-test.mjs <sessionId>
 */

import WebSocket from "ws";

const ENDPOINT = "wss://squadcalc.app/api/";
const sessionId = process.argv[2];
const ws = new WebSocket(ENDPOINT);

ws.onopen = () => {
    console.log("connected, joining session", sessionId);
    ws.send(JSON.stringify({ type: "JOIN_SESSION", sessionId, mapState: {} }));
};

ws.onmessage = (m) => {
    const data = JSON.parse(m.data);
    console.log("\n<<", data.type);

    if (data.type === "SESSION_JOINED") {
        const state = data.mapState || {};
        console.log("   activeMap    :", state.activeMap);
        console.log("   activeLayer  :", state.activeLayer);
        console.log("   selectedFlags:", JSON.stringify(state.selectedFlags));
        console.log("   weapons      :", (state.weapons || []).length);
        console.log("   targets      :", (state.targets || []).length);
        console.log("   markers      :", (state.markers || []).length);
        console.log("   keys         :", Object.keys(state).join(", "));
    } else if (data.type === "CLICK_LAYER") {
        console.log("   flag clicked by someone:", data.flag);
    } else {
        console.log("  ", JSON.stringify(data).slice(0, 160));
    }
};

ws.onerror = (e) => console.log("error", e.message);
setTimeout(() => {
    ws.close();
    process.exit(0);
}, 12000);
