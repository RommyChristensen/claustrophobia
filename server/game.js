const C = require('./config');
const { generateMaze, DIRS } = require('./maze');

const MINERS = ['miner1', 'miner2'];
const ORDER = ['miner1', 'miner2', 'assassin'];
const SLOT_IDS = ['miner1.miner', 'miner1.navigator', 'miner2.miner', 'miner2.navigator', 'assassin'];
const TEAM_NAMES = { miner1: 'Miner Team 1', miner2: 'Miner Team 2', assassin: 'Assassin' };

class Game {
  constructor(onChange) {
    this.onChange = onChange;
    this.players = {};      // token -> { name, isAdmin }
    this.online = {};       // token -> number of open sockets
    this.slots = Object.fromEntries(SLOT_IDS.map((s) => [s, null])); // slot -> token
    this.livesSetting = { miner1: C.DEFAULT_LIVES, miner2: C.DEFAULT_LIVES }; // per-team lives
    this.seq = 0;
    this.resetToLobby(true);
  }

  // ---------- helpers ----------
  changed() { this.onChange(); }
  slotOf(token) { return SLOT_IDS.find((s) => this.slots[s] === token) || null; }
  teamOfSlot(slot) { return slot ? slot.split('.')[0] : null; }
  currentTurn() { return this.phase === 'lobby' ? null : ORDER[this.turnIndex]; }
  event(text, kind = 'info', team = null) {
    this.events.push({ seq: ++this.seq, text, kind, team, at: Date.now() });
    if (this.events.length > 60) this.events.shift();
  }
  fail(msg) { const e = new Error(msg); e.userFacing = true; throw e; }

  // ---------- players / lobby ----------
  login(token, name, password) {
    name = String(name || '').trim().slice(0, 24);
    if (!name) this.fail('Please enter a username');
    const isAdmin = name.toUpperCase() === C.ADMIN_USER;
    if (isAdmin) {
      if (password === undefined || password === null || password === '') return { needPassword: true };
      if (String(password) !== C.ADMIN_PASS) this.fail('Wrong admin password');
    }
    this.players[token] = { name: isAdmin ? C.ADMIN_USER : name, isAdmin };
    this.changed();
    return { ok: true };
  }

  logout(token) {
    const slot = this.slotOf(token);
    if (slot && this.phase === 'lobby') this.slots[slot] = null;
    delete this.players[token];
    this.changed();
  }

  join(token, slot) {
    const p = this.players[token];
    if (!p) this.fail('Not logged in');
    if (p.isAdmin) this.fail('Admin cannot take a player slot');
    if (this.phase !== 'lobby') this.fail('Game already started');
    if (!SLOT_IDS.includes(slot)) this.fail('Unknown slot');
    if (this.slots[slot] && this.slots[slot] !== token) this.fail('Slot already taken');
    const prev = this.slotOf(token);
    if (prev) this.slots[prev] = null;
    this.slots[slot] = token;
    this.changed();
  }

  leave(token) {
    if (this.phase !== 'lobby') this.fail('Game already started');
    const slot = this.slotOf(token);
    if (slot) this.slots[slot] = null;
    this.changed();
  }

  // ---------- game lifecycle ----------
  resetToLobby(silent) {
    clearTimeout(this.memoTimer);
    this.phase = 'lobby';
    this.maze = null;
    this.teams = null;
    this.turnIndex = 0;
    this.battle = null;
    this.winner = null;
    this.memorizeEndsAt = null;
    this.events = [];
    if (!silent) this.changed();
  }

  start() {
    if (this.phase !== 'lobby' && this.phase !== 'finished') this.fail('Game already running');
    if (SLOT_IDS.some((s) => !this.slots[s])) this.fail('All 5 slots must be filled');
    clearTimeout(this.memoTimer);
    this.maze = generateMaze();
    const sp = this.maze.spawns;
    this.teams = {
      miner1: { pos: { ...sp.miner1 }, spawn: sp.miner1, lives: this.livesSetting.miner1, points: 0, chests: { bronze: 0, silver: 0, gold: 0 }, eliminated: false },
      miner2: { pos: { ...sp.miner2 }, spawn: sp.miner2, lives: this.livesSetting.miner2, points: 0, chests: { bronze: 0, silver: 0, gold: 0 }, eliminated: false },
      assassin: { pos: { ...sp.assassin }, spawn: sp.assassin, cooldown: 0 },
    };
    this.turnIndex = 0;
    this.battle = null;
    this.winner = null;
    this.events = [];
    this.phase = 'memorize';
    this.memorizeEndsAt = Date.now() + C.MEMORIZE_SECONDS * 1000;
    this.memoTimer = setTimeout(() => this.endMemorize(), C.MEMORIZE_SECONDS * 1000);
    this.event(`Game started. Navigators: memorize the maze! (${C.MEMORIZE_SECONDS}s)`, 'info');
    this.changed();
  }

  endMemorize() {
    if (this.phase !== 'memorize') return;
    clearTimeout(this.memoTimer);
    this.phase = 'playing';
    this.memorizeEndsAt = null;
    this.event('The lights go out. Hunt begins!', 'info');
    this.event(`${TEAM_NAMES[this.currentTurn()]}'s turn`, 'turn');
    this.changed();
  }

  setLives(team, n) {
    if (this.phase !== 'lobby') this.fail('Lives can only be set in the lobby');
    if (!MINERS.includes(team)) this.fail('Bad team');
    n = Math.max(1, Math.min(20, parseInt(n, 10) || C.DEFAULT_LIVES));
    this.livesSetting[team] = n;
    this.changed();
  }

  kick(slot) {
    if (!SLOT_IDS.includes(slot)) this.fail('Unknown slot');
    if (this.phase !== 'lobby') this.fail('Kick players from the lobby only');
    this.slots[slot] = null;
    this.changed();
  }

  // Moves to the next playable turn. Skips eliminated miner teams, and burns the
  // assassin's turn while it is on respawn cooldown (respawning when it hits 0).
  advanceTurn() {
    for (let k = 0; k < ORDER.length * 3; k++) {
      this.turnIndex = (this.turnIndex + 1) % ORDER.length;
      if (this.turnPlayable()) return;
    }
  }

  turnPlayable() {
    const t = ORDER[this.turnIndex];
    if (t !== 'assassin') return !this.teams[t].eliminated;
    const a = this.teams.assassin;
    if (a.cooldown <= 0) return true;
    a.cooldown--;
    if (a.cooldown === 0) {
      a.pos = { ...a.spawn };
      this.event('Assassin skipped its turn and has RESPAWNED', 'respawn', 'assassin');
    } else {
      this.event(`Assassin is recovering (${a.cooldown} turn(s) left)`, 'info', 'assassin');
    }
    return false;
  }

  ensureValidTurn() {
    if (!this.turnPlayable()) this.advanceTurn();
  }

  // after any turn change outside a normal move: a respawned assassin may land on a miner
  afterTurnChange() {
    const fights = this.collisions();
    if (fights.length) return this.startBattle(fights);
    this.event(`${TEAM_NAMES[this.currentTurn()]}'s turn`, 'turn');
    this.changed();
  }

  // ---------- moves ----------
  move(token, dir) {
    if (this.phase !== 'playing') this.fail('You cannot move right now');
    const slot = this.slotOf(token);
    let team = null;
    if (slot === 'miner1.navigator') team = 'miner1';
    else if (slot === 'miner2.navigator') team = 'miner2';
    else if (slot === 'assassin') team = 'assassin';
    if (!team) this.fail('Only navigators and the assassin can move');
    if (this.currentTurn() !== team) this.fail('Not your turn');
    const d = DIRS[dir];
    if (!d) this.fail('Bad direction');

    const t = this.teams[team];
    const n = this.maze.size;
    const nx = t.pos.x + d[0], ny = t.pos.y + d[1];
    const blocked = nx < 0 || ny < 0 || nx >= n || ny >= n || this.maze.walls[ny][nx] === 1;

    if (blocked) {
      this.event(`${TEAM_NAMES[team]} hit a wall. Turn lost!`, 'blocked', team);
      this.advanceTurn();
      this.event(`${TEAM_NAMES[this.currentTurn()]}'s turn`, 'turn');
      return this.changed();
    }

    t.pos = { x: nx, y: ny };
    this.event(`${TEAM_NAMES[team]} moved ${dir}`, 'move', team);

    if (team !== 'assassin') {
      const chest = this.maze.chests.find((c) => !c.collected && c.x === nx && c.y === ny);
      if (chest) {
        chest.collected = true;
        t.points += chest.points;
        t.chests[chest.tier]++;
        this.event(`${TEAM_NAMES[team]} found a ${chest.tier} chest! +${chest.points}`, 'chest', team);
      }
    }

    this.advanceTurn();

    const fights = this.collisions();
    if (fights.length) return this.startBattle(fights);

    if (team !== 'assassin' && this.onVault(team)) return this.finish(team);

    this.event(`${TEAM_NAMES[this.currentTurn()]}'s turn`, 'turn');
    this.changed();
  }

  onVault(team) {
    const p = this.teams[team].pos, v = this.maze.vault;
    return p.x === v.x && p.y === v.y;
  }

  collisions() {
    const a = this.teams.assassin.pos;
    if (!a) return []; // assassin is off the board (cooldown)
    return MINERS.filter((m) => !this.teams[m].eliminated && this.teams[m].pos.x === a.x && this.teams[m].pos.y === a.y);
  }

  // ---------- battles ----------
  startBattle(miners) {
    this.phase = 'battle';
    this.battle = { miner: miners[0], result: null };
    this.event(`BATTLE BEGIN: ${TEAM_NAMES[miners[0]]} vs Assassin`, 'battle', miners[0]);
    this.changed();
  }

  resolveBattle(winner) {
    if (this.phase !== 'battle' || !this.battle) this.fail('No battle in progress');
    if (this.battle.result) this.fail('Battle already resolved. Press Continue');
    const m = this.battle.miner;
    const mt = this.teams[m];
    if (winner === 'assassin') {
      mt.lives = Math.max(0, mt.lives - 1);
      mt.pos = { ...mt.spawn };
      if (mt.lives === 0) {
        mt.eliminated = true;
        this.event(`${TEAM_NAMES[m]} has been ELIMINATED`, 'eliminated', m);
      } else {
        this.event(`Assassin won. ${TEAM_NAMES[m]} loses a life and respawns (${mt.lives} left)`, 'battle', m);
      }
      this.battle.result = 'assassin';
    } else if (winner === 'miner') {
      const cd = C.ASSASSIN_RESPAWN_COOLDOWN;
      this.teams.assassin.pos = cd > 0 ? null : { ...this.teams.assassin.spawn };
      this.teams.assassin.cooldown = cd;
      this.event(`${TEAM_NAMES[m]} won the battle! Assassin is down${cd > 0 ? ` for ${cd} turn(s)` : ' and respawns'}`, 'battle', m);
      this.battle.result = 'miner';
    } else this.fail('Bad winner');
    this.changed();
  }

  continueGame() {
    if (this.phase !== 'battle' || !this.battle?.result) this.fail('Resolve the battle first');
    const prevMiner = this.battle.miner;
    this.battle = null;
    if (this.checkAssassinWin()) return;
    const fights = this.collisions();
    if (fights.length) return this.startBattle(fights);
    if (!this.teams[prevMiner].eliminated && this.onVault(prevMiner)) return this.finish(prevMiner);
    this.phase = 'playing';
    this.ensureValidTurn();
    this.afterTurnChange();
  }

  checkAssassinWin() {
    if (MINERS.every((m) => this.teams[m].eliminated)) {
      this.finish('assassin');
      return true;
    }
    return false;
  }

  finish(team) {
    clearTimeout(this.memoTimer);
    this.phase = 'finished';
    this.battle = null;
    const scores = Object.fromEntries(MINERS.map((m) => [m, this.teams[m].points]));
    if (team !== 'assassin') scores[team] = this.teams[team].points * C.VAULT_MULTIPLIER;
    this.winner = { team, name: TEAM_NAMES[team], scores, chestPoints: team !== 'assassin' ? this.teams[team].points : null };
    this.event(team === 'assassin' ? 'The Assassin has slain every miner!' : `${TEAM_NAMES[team]} reached the vault!`, 'win', team);
    this.changed();
  }

  // ---------- admin manual adjustments ----------
  adjustLives(team, delta) {
    if (!MINERS.includes(team)) this.fail('Bad team');
    if (!['playing', 'memorize'].includes(this.phase)) this.fail('Only during play');
    const t = this.teams[team];
    if (t.eliminated && delta < 0) return;
    t.lives = Math.max(0, t.lives + delta);
    if (t.lives === 0) {
      t.eliminated = true;
      this.event(`Admin eliminated a life: ${TEAM_NAMES[team]} is ELIMINATED`, 'eliminated', team);
    } else if (t.eliminated && t.lives > 0) {
      t.eliminated = false;
      t.pos = { ...t.spawn };
      this.event(`${TEAM_NAMES[team]} is back in the game (${t.lives} lives)`, 'info', team);
    } else {
      this.event(`Admin set ${TEAM_NAMES[team]} lives to ${t.lives}`, 'info', team);
    }
    if (this.checkAssassinWin()) return;
    this.ensureValidTurn();
    const fights = this.phase === 'playing' ? this.collisions() : [];
    if (fights.length) return this.startBattle(fights); // e.g. revived onto the assassin
    this.changed();
  }

  eliminate(team) {
    if (!MINERS.includes(team)) this.fail('Bad team');
    if (!['playing', 'memorize'].includes(this.phase)) this.fail('Only during play');
    const t = this.teams[team];
    t.lives = 0;
    t.eliminated = true;
    this.event(`Admin ELIMINATED ${TEAM_NAMES[team]}`, 'eliminated', team);
    if (this.checkAssassinWin()) return;
    this.ensureValidTurn();
    const fights = this.phase === 'playing' ? this.collisions() : [];
    if (fights.length) return this.startBattle(fights);
    this.changed();
  }

  skipTurn() {
    if (this.phase !== 'playing') this.fail('Only during play');
    this.event(`Admin skipped ${TEAM_NAMES[this.currentTurn()]}'s turn`, 'info');
    this.advanceTurn();
    this.afterTurnChange();
  }

  // ---------- views (only send what each role may see) ----------
  fullBoard() {
    return {
      size: this.maze.size,
      id: this.maze.id,
      walls: this.maze.walls,
      chests: this.maze.chests.filter((c) => !c.collected).map(({ id, tier, x, y }) => ({ id, tier, x, y })),
      vault: this.maze.vault,
      pawns: Object.fromEntries(
        Object.entries(this.teams)
          .filter(([k, t]) => !t.eliminated && t.pos)
          .map(([k, t]) => [k, t.pos])
      ),
    };
  }

  teamSummary(team) {
    const t = this.teams[team];
    return { lives: t.lives, points: t.points, chests: t.chests, eliminated: t.eliminated };
  }

  viewFor(token) {
    const p = this.players[token] || null;
    const slot = this.slotOf(token);
    const role = p?.isAdmin ? 'admin' : slot ? slot.split('.').pop() === 'assassin' ? 'assassin' : slot.split('.').pop() : 'spectator';
    const team = p?.isAdmin ? null : this.teamOfSlot(slot);

    const view = {
      serverNow: Date.now(),
      phase: this.phase,
      me: p ? { name: p.name, isAdmin: p.isAdmin, slot, role, team } : null,
      lobby: Object.fromEntries(SLOT_IDS.map((s) => {
        const tk = this.slots[s];
        return [s, tk ? { name: this.players[tk]?.name || '?', online: !!this.online[tk], you: tk === token } : null];
      })),
      livesSetting: { ...this.livesSetting },
      config: { gridSize: C.GRID_SIZE, memorizeSeconds: C.MEMORIZE_SECONDS, multiplier: C.VAULT_MULTIPLIER },
      teamNames: TEAM_NAMES,
    };
    if (!p || this.phase === 'lobby') return view;

    view.turn = this.currentTurn();
    view.memorizeEndsAt = this.memorizeEndsAt;
    view.winner = this.winner;
    view.battle = this.battle ? { miner: this.battle.miner, result: this.battle.result } : null;

    if (role === 'admin' || role === 'assassin') {
      view.board = this.fullBoard();
      view.teams = { miner1: this.teamSummary('miner1'), miner2: this.teamSummary('miner2') };
      view.events = this.events.slice(-40);
      view.vaultSteps = role === 'admin' ? this.maze.vaultSteps : undefined;
      view.assassinCooldown = this.teams.assassin.cooldown;
    } else if (team && MINERS.includes(team)) {
      view.teams = { [team]: this.teamSummary(team) };
      view.events = this.events.filter((e) => e.team === team || e.kind === 'turn' || e.kind === 'win').slice(-20);
      if (role === 'navigator') {
        const a = this.teams.assassin.pos;
        view.assassinPos = a ? { x: a.x, y: a.y } : null; // null = off the board (respawn cooldown)
        if (this.phase === 'memorize') {
          const b = this.fullBoard();
          b.pawns = { [team]: b.pawns[team], assassin: b.pawns.assassin };
          view.board = b;
        }
      }
    } else {
      view.teams = { miner1: this.teamSummary('miner1'), miner2: this.teamSummary('miner2') };
    }
    return view;
  }
}

module.exports = { Game, SLOT_IDS, TEAM_NAMES };
