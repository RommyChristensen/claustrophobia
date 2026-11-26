// All tunable game settings live here.
module.exports = {
  GRID_SIZE: 10,
  WALL_RATIO: 0.30,          // fraction of cells that are walls
  MEMORIZE_SECONDS: 60,     // how long navigators see the map at game start
  VAULT_MIN_STEPS: 15,       // vault must be at least this many path steps from BOTH miner spawns
  VAULT_MULTIPLIER: 3,       // chest points multiplier when reaching the vault
  ASSASSIN_RESPAWN_COOLDOWN: 1, // assassin turns skipped after losing a battle before it respawns
  DEFAULT_LIVES: 3,         // default lives per miner team (admin can change in lobby)
  CHESTS: {
    bronze: { count: 5, points: 500 },
    silver: { count: 3, points: 1000 },
    gold:   { count: 2, points: 2000 },
  },
  ADMIN_USER: 'ADMIN-GAME',
  ADMIN_PASS: process.env.ADMIN_PASS || '1357',
  MAX_MAZE_ATTEMPTS: 5000,
};
