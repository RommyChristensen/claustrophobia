# Claustrophobia: Can you outrun the blade?

A real-time, turn-based maze game: 2 miner teams vs 1 assassin. One session, no database.

## Run locally
```bash
npm install
npm start          # http://localhost:3000
npm run test:maze  # checks 1000 generated mazes against the rules
```

## How to play
1. Everyone opens the site and enters a username.
2. Players join a slot in the lobby: Miner Team 1 (Miner + Navigator), Miner Team 2 (Miner + Navigator), Assassin.
3. The admin logs in as `ADMIN-GAME` (password `1357`), sets the lives for each miner team (the +/− in each team's card) and presses **Start**.
   The admin screen is meant to be shown on the projector.
4. Navigators get `MEMORIZE_SECONDS` (default 60s) to memorize the maze, then it disappears. After that they only see the arrows and the assassin's `x,y`.
5. Turns go Miner 1 → Miner 2 → Assassin. A move into a wall or off the map loses the turn.
6. Miner and assassin on the same cell → **BATTLE BEGIN** on every screen. Play the battle offline, then the admin picks the winner and presses Continue.
   - Miner loses: the team loses 1 life and respawns. At 0 lives the team is eliminated.
   - Assassin loses: the assassin leaves the board, skips its next turn, then respawns at its start point (`ASSASSIN_RESPAWN_COOLDOWN`).
7. The first miner team to reach the vault wins, with chest points × 3. If both miner teams are eliminated, the assassin wins.

## Settings
Edit `server/config.js`: grid size, wall ratio (default 30%), memorize time, vault minimum distance, chest counts and points, default lives.
You can also set the admin password with the `ADMIN_PASS` environment variable.

## Background music
Put MP3 files in `public/music/` and list them in `public/music/playlist.json`:
```json
[
  { "title": "Dark Tension", "file": "dark-tension.mp3" },
  { "title": "Chase", "file": "chase.mp3" }
]
```
Each screen picks its own track and volume with the ♪ button (bottom right).

### Battle music
Save the track as `public/music/battleMusic.mp3` (it does not go in `playlist.json`).
It plays on every player's and the admin's screen while a battle is waiting for a winner, even if the background music is set to Off, then the background track resumes. Use **Mute** in the ♪ panel to silence all music and sounds; the choice is remembered on that device.

### Chest sounds
Save them as `public/music/bronzeMusic.mp3`, `silverMusic.mp3` and `goldMusic.mp3`.
When a team collects a chest, its miner, its navigator and the admin hear the sound for that tier. The background track pauses meanwhile. Only the first 6 seconds are played.

## Board images
Put PNG files in `public/tiles/` with these names, then reload the page. Square images (about 256×256) work best. Any file you leave out keeps the default look.

| File | Used for | Background |
|---|---|---|
| `tile.png` | floor cell | solid |
| `wall.png` | wall cell | solid or transparent |
| `chest-bronze.png`, `chest-silver.png`, `chest-gold.png` | chests | transparent |
| `vault.png` | treasure vault | transparent |
| `pawn-miner1.png`, `pawn-miner2.png`, `pawn-assassin.png` | pawns | transparent |

## Battle screen images
Put these in `public/background/`. Either can be left out to keep the default look.

| File | Used for |
|---|---|
| `battle-begin-background.jpeg` | full-screen artwork (landscape, about 1920 px wide) |
| `battle-begin-text.png` | title image with a transparent background, trimmed. If you replace it with a different shape, update `aspect-ratio` in `style.css` |

## Deploy to Render
1. Push this folder to a GitHub repo.
2. On Render: **New → Blueprint** and pick the repo (it uses `render.yaml`). Or choose **New → Web Service** with build `npm install` and start `npm start`.
3. Share the `https://<name>.onrender.com` URL with players.

The free tier sleeps after about 15 minutes idle. Open the URL a minute before the game.
All state is in memory, so a restart or redeploy resets the session.
