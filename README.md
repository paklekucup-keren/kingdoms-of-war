# Kingdoms of War — Offline Strategy Game

A complete, playable, **100% offline** medieval RTS for low-end Android devices (and desktop browsers).
Build a kingdom, manage gold/food, train four troop types, raid AI enemy bases in a 10-mission
campaign, defend your walls in siege missions and endless mode, chase the local high-score table,
and fight co-op battles over a local room — with **no internet, no accounts, no servers**.

## Play

```bash
npm install
npm run dev      # develop
npm run build    # production bundle in dist/
npm run preview  # serve the production build
```

Open the game, then fully disconnect: everything (save, campaign, battles, music, co-op transport)
runs locally. A service worker precaches the app, so once loaded it is a true offline app.

## Install on Android

**Easiest (PWA):** host `dist/` on any static host (or `python3 -m http.server` on your LAN), open in
Chrome on the Android device → menu → **Add to Home screen**. It installs as a fullscreen offline app
(`manifest.webmanifest` + `sw.js` are already wired in `index.html`).

**Native APK (~5 min with Capacitor):**

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "Kingdoms of War" com.example.kingdomsofwar --web-dir=dist
npm run build
npx cap add android
npx cap open android   # opens Android Studio → Run ▶ / Build APK
```

All gameplay is local by design: no Android permissions are required beyond the defaults.
The local co-op transport (BroadcastChannel in this web build) maps 1:1 onto a WebRTC
datachannel / NSD socket implementation inside the native shell for true Wi-Fi pairing —
the host-authoritative protocol in `src/game/net.ts` stays identical.

## Architecture (modular, maintainable)

| File | Responsibility |
| --- | --- |
| `src/game/types.ts` | Shared data types, grid constants, math helpers, seeded RNG |
| `src/game/content.ts` | Building/troop stats, costs, timers, TH unlock tables, campaign, wave & enemy-base generators |
| `src/game/engine.ts` | Realtime battle simulation: flow-field pathfinding, targeting, projectiles, waves, garrison AI |
| `src/game/render.ts` | Procedural canvas art (buildings, units, terrain) + pooled particles/shake/floaters |
| `src/game/audio.ts` | Fully synthesized WebAudio SFX + adaptive calm/battle music (zero audio assets) |
| `src/game/save.ts` | localStorage persistence — dual slots + checksum (corruption-tolerant), score table |
| `src/game/net.ts` | Local co-op: lobby discovery, room codes, host-authoritative snapshots/commands |
| `src/components/*` | Start screen, kingdom builder, battle view, campaign map, co-op lobby, modals |

### Low-end performance choices
- One `<canvas>` per view, plain 2D paths (no WebGL, no shaders), DPR clamped to 2.
- Object-pooled particles (capped, quality switch in Settings), ground pre-rendered to an offscreen canvas.
- BFS flow fields computed lazily per target and cached; invalidated only when a wall falls.
- Timer-based economy (catch-up on load) instead of per-frame sim for the kingdom; battle sim is a single
  fixed-structure update with early-outs. Background tabs pause music and skip simulation.
- All artwork and audio are generated at runtime → tiny download, small install footprint.

### Save & reliability
Saves use two alternating slots with a djb2 checksum; a corrupted slot automatically falls back to the
other. Writes happen on every action, on a timer, and on `visibilitychange`/`beforeunload`.

### Co-op protocol
Host opens a room (4-letter code + lobby discovery broadcast). Guests send compact deploy commands;
the host validates troop counts, runs the single authoritative simulation, and broadcasts quantized
snapshots at ~8 Hz plus discrete FX events. Guests interpolate unit positions between snapshots.
Each player keeps individual, permanent progress; mission rewards are applied locally per player.

## Build an Android APK without a powerful PC

This project includes a GitHub Actions workflow at `.github/workflows/build-android.yml`.
It builds the APK on GitHub's cloud runners, so the local computer does not need Android Studio
or a large amount of RAM. The first build needs an internet connection on GitHub's runner.

1. Upload the contents of this project to a GitHub repository (not just the ZIP file).
2. Open the repository's **Actions** tab and select **Build Kingdoms of War APK**.
3. Press **Run workflow** and wait for the run to finish successfully.
4. Open the completed run and download the `kingdoms-of-war-debug-apk` artifact.
5. Extract the downloaded artifact ZIP; it contains `app-debug.apk`.
6. Transfer the APK to the Android phone and install it. Only install APKs built from a source you trust.

The workflow uses Capacitor 6 and Java 17. The resulting APK is a debug build for testing, not a
Play Store release. The minimum Android version and older WebView behavior should be verified on
the target phone. Some co-op functionality uses the browser BroadcastChannel API and may not work
inside older Android WebViews; test the single-player game first.
