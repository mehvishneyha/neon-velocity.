# NEON VELOCITY: STREET LEGENDS

An original, playable, *Fast & Furious*-inspired neon street-racing browser game. Stylized pseudo-3D road renderer, procedurally drawn city and cars, seven rival racers, traffic, three-lap race, drift and nitro, desktop/mobile controls, synth-engine audio. **No runtime or build dependencies.**

## Play locally

Requires Node.js 18+.

```bash
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Upload this folder to GitHub.
2. In [Vercel](https://vercel.com/new), choose **Add New Project**, import the repository.
3. Framework preset: **Other**. Build command: `npm run build`. Output directory: `dist` (also defined in `vercel.json`).
4. Deploy. No environment variables or server needed.

Alternatively install Vercel CLI, run `vercel` inside the project folder, and follow the prompts.

## Controls

| Action | Desktop | Mobile |
|---|---|---|
| Accelerate | W / ↑ (auto-accelerates when not braking) | GO |
| Brake | S / ↓ | BRAKE |
| Steer | A/D or ←/→ | ◀/▶ |
| Nitro | Shift | N₂O |
| Drift | Space | DRIFT |
| Pause | Esc or P | Pause button |

Tips: Drift through a corner to refill your nitrous. A light collision with traffic cuts speed. Keep to the road to avoid off-road drag. Complete all three laps to see your result.

## Customize

- Race tuning and number of laps: constants near the top of `src/main.js`.
- Track: `buildRoad()` in `src/main.js`.
- Car colors and rival names: `palette` and `carNames`.
- UI and visuals: `src/style.css`.

The visuals and title are original and are not affiliated with any film or game franchise. No proprietary car marques or movie characters are included.
