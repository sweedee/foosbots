# ⚽ FoosBots

Single-player foosball where you build bots and watch them battle.

- **Build bots** – 5 stats (Speed, Power, Reflex, Control, Accuracy; 1–10, 30 points total) plus perks from an 8-point pool. Strong perks cost more and some need stat minimums.
- **Customize** – name, shape, colors, ball trail, goal effect and sound pack with a live preview.
- **Modes** – 1v1 (pick or random opponent), knockout Tournament, and Benchmark (one bot vs all others).
- **Playback** – 1/2/4/8x speed, Instant results, Auto-next and mute.
- **Rules** – goals to win and time limit are configurable. A tie at full time means sudden death: the next goal wins, and the goals get wider over time.
- **Ranks** – win rate and Elo for every bot.

UI uses [Dynatrace Strato](https://developer.dynatrace.com/design/about-strato-design-system/) components; the table is drawn on a canvas. Everything is saved in localStorage.

## Develop

```bash
npm install
npm run dev
npm run build   # outputs static site to dist/
```

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`
(enable Pages → Source: *GitHub Actions* in the repo settings). The build uses relative paths, so it works under any sub-path.
