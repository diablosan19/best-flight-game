[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/diablosan19/best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/diablosan19/best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Kestrel Run — Meridian Ridge Courier

A complete original flight game for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057). Fly a mail plane through the Meridian Ridge valley: thread the ring course, land on Kestrel Field, drop a crate on the high mountain strip, or race the clock through the gates.

## Play

Serve `game/` with any static server and open `index.html` in desktop Chrome:

```sh
node serve.ts
# open http://localhost:8080
```

No network needed — every file the game loads lives under `game/`, and the engine sound is generated with WebAudio.

## Controls

- **W/S or ↑/↓** — pitch (nose up / down)
- **A/D or ←/→** — bank and turn
- **SHIFT / CTRL** (or `+`/`-`) — throttle up / down
- **Mouse** — steer (move to bank and pitch)
- **C** — chase / cockpit view
- **SPACE** — drop the cargo crate (cargo mission) / brake on the ground
- **1–4** — pick a sortie from the menu, **ENTER** to fly
- **P** pause, **R** restart, **M** mission menu

## The four sorties

1. **Ring Run** — thread all 8 rings down the valley. A missed ring costs 15 seconds.
2. **Valley Landing** — bring her down gently on the Kestrel Field runway.
3. **Cargo Drop** — carry the crate to the mountain strip and drop it low and slow (SPACE), or land there with it.
4. **Time Trial** — five gates against the clock; each gate adds 4 seconds.

Fuel burns with throttle and damage accumulates on hard contact — a stall below flying speed, a steep descent into the ridge, or an empty tank turns a sortie into decisions.

## Layout

- `game/index.html` — page shell, one canvas
- `game/src/main.js` — game loop and screen state machine
- `game/src/flight.js` — flight model (throttle, pitch/roll/yaw, stall, landings)
- `game/src/terrain.js` — procedural valley: heightfield, river, town, runways, rings
- `game/src/render.js` — sky, projected terrain, aircraft, cockpit, particles
- `game/src/hud.js` — HUD instruments and menu / pause / end screens
- `game/src/missions.js` — mission definitions, objectives and scoring
- `game/src/input.js` — keyboard and mouse controls
- `game/src/audio.js` — code-generated engine hum, wind and beeps (WebAudio)
- `game/src/rng.js` — seeded randomness so the valley is identical every load
- `main.ts` — hand-in program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`

## License

MIT — see [LICENSE](LICENSE).
