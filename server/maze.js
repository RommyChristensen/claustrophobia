const C = require('./config');

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// BFS path distance from (sx,sy) to every cell; -1 = unreachable. walls is flat array [y*n+x].
function bfs(walls, n, sx, sy) {
  const dist = new Array(n * n).fill(-1);
  const q = [sy * n + sx];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % n, y = (i / n) | 0;
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const j = ny * n + nx;
      if (walls[j] || dist[j] !== -1) continue;
      dist[j] = dist[i] + 1;
      q.push(j);
    }
  }
  return dist;
}

function tryGenerate({ size: n, wallRatio, vaultMinSteps }) {
  const s1 = { x: 0, y: n - 1 };
  const s2 = { x: n - 1, y: n - 1 };
  const idx = (p) => p.y * n + p.x;
  const reserved = new Set([idx(s1), idx(s2)]);

  const wallCount = Math.round(n * n * wallRatio);
  const candidates = shuffle([...Array(n * n).keys()].filter((i) => !reserved.has(i)));
  const walls = new Array(n * n).fill(false);
  for (let k = 0; k < wallCount; k++) walls[candidates[k]] = true;

  const d1 = bfs(walls, n, s1.x, s1.y);
  const d2 = bfs(walls, n, s2.x, s2.y);
  // every open cell must be reachable
  for (let i = 0; i < n * n; i++) if (!walls[i] && d1[i] < 0) return null;

  const minD = (i) => Math.min(d1[i], d2[i]);
  const open = [...Array(n * n).keys()].filter((i) => !walls[i]);

  const vaultCands = open.filter((i) => minD(i) >= vaultMinSteps);
  if (!vaultCands.length) return null;
  const vault = vaultCands[Math.floor(Math.random() * vaultCands.length)];

  // assassin: edge cell farthest from both miners
  const isEdge = (i) => { const x = i % n, y = (i / n) | 0; return x === 0 || y === 0 || x === n - 1 || y === n - 1; };
  // never on or next to the vault (8 surrounding cells, incl. diagonals)
  const nearVault = (i) => Math.max(Math.abs((i % n) - (vault % n)), Math.abs(((i / n) | 0) - ((vault / n) | 0))) <= 1;
  const edgeCands = open.filter((i) => isEdge(i) && !nearVault(i) && !reserved.has(i));
  if (!edgeCands.length) return null;
  const best = Math.max(...edgeCands.map(minD));
  const bestCells = edgeCands.filter((i) => minD(i) === best);
  const assassin = bestCells[Math.floor(Math.random() * bestCells.length)];

  // chests: random open cells, never on spawns / vault / assassin spawn
  const taken = new Set([...reserved, vault, assassin]);
  const chestCells = shuffle(open.filter((i) => !taken.has(i)));
  const tiers = [];
  for (const [tier, { count }] of Object.entries(C.CHESTS)) for (let k = 0; k < count; k++) tiers.push(tier);
  if (chestCells.length < tiers.length) return null;

  const toXY = (i) => ({ x: i % n, y: (i / n) | 0 });
  const grid = [];
  for (let y = 0; y < n; y++) grid.push(walls.slice(y * n, y * n + n).map((w) => (w ? 1 : 0)));

  return {
    size: n,
    walls: grid,
    spawns: { miner1: s1, miner2: s2, assassin: toXY(assassin) },
    vault: toXY(vault),
    vaultSteps: { miner1: d1[vault], miner2: d2[vault] },
    chests: tiers.map((tier, k) => ({ id: k, tier, points: C.CHESTS[tier].points, ...toXY(chestCells[k]), collected: false })),
  };
}

function generateMaze(opts = {}) {
  const o = { size: C.GRID_SIZE, wallRatio: C.WALL_RATIO, vaultMinSteps: C.VAULT_MIN_STEPS, ...opts };
  // If the constraint can't be met, relax the vault distance one step at a time.
  for (let steps = o.vaultMinSteps; steps >= 1; steps--) {
    for (let a = 0; a < C.MAX_MAZE_ATTEMPTS; a++) {
      const m = tryGenerate({ ...o, vaultMinSteps: steps });
      if (m) {
        if (steps !== o.vaultMinSteps) console.warn(`[maze] relaxed vault distance to ${steps}`);
        m.id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        return m;
      }
    }
  }
  throw new Error('Could not generate maze');
}

module.exports = { generateMaze, bfs, DIRS };

// `node server/maze.js --test` : generate many mazes and verify properties
if (require.main === module && process.argv.includes('--test')) {
  const N = 1000;
  const t0 = Date.now();
  let fails = 0;
  for (let k = 0; k < N; k++) {
    const m = generateMaze();
    const n = m.size;
    const flat = m.walls.flat().map(Boolean);
    const wallCount = flat.filter(Boolean).length;
    const d1 = bfs(flat, n, 0, n - 1);
    const d2 = bfs(flat, n, n - 1, n - 1);
    const vi = m.vault.y * n + m.vault.x;
    const errs = [];
    if (wallCount !== Math.round(n * n * C.WALL_RATIO)) errs.push('wall count');
    if (flat.some((w, i) => !w && d1[i] < 0)) errs.push('not connected');
    if (Math.min(d1[vi], d2[vi]) < C.VAULT_MIN_STEPS) errs.push('vault too close');
    if (m.chests.length !== 10) errs.push('chest count');
    if (m.chests.some((c) => m.walls[c.y][c.x])) errs.push('chest in wall');
    const tiers = m.chests.reduce((a, c) => ((a[c.tier] = (a[c.tier] || 0) + 1), a), {});
    if (tiers.bronze !== 5 || tiers.silver !== 3 || tiers.gold !== 2) errs.push('tiers');
    const a = m.spawns.assassin;
    if (!(a.x === 0 || a.y === 0 || a.x === n - 1 || a.y === n - 1)) errs.push('assassin not on edge');
    if (Math.max(Math.abs(a.x - m.vault.x), Math.abs(a.y - m.vault.y)) <= 1) errs.push('assassin next to vault');
    if (errs.length) { fails++; console.log('FAIL', errs.join(', ')); }
  }
  console.log(`${N} mazes, ${fails} failures, ${((Date.now() - t0) / N).toFixed(1)}ms avg`);
  process.exit(fails ? 1 : 0);
}
