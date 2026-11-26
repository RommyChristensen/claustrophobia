/* Claustrophobia client */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- identity ----------
  function newToken() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch {}
    return 't-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  let token;
  try { token = localStorage.getItem('cl_token'); } catch {}
  if (!token) { token = newToken(); try { localStorage.setItem('cl_token', token); } catch {} }

  const socket = io({ transports: ['websocket', 'polling'] });
  let S = null;            // latest state
  let clockOffset = 0;     // serverNow - Date.now()
  let lastSeq = null;      // last seen event seq (for toasts)
  let moving = false;

  socket.on('connect', () => { $('#conn-banner').classList.add('hidden'); socket.emit('hello', { token }); });
  socket.on('disconnect', () => $('#conn-banner').classList.remove('hidden'));
  socket.on('state', (st) => { S = st; clockOffset = st.serverNow - Date.now(); moving = false; render(); });

  function send(ev, payload = {}) {
    return new Promise((resolve) => {
      socket.emit(ev, payload, (res) => {
        if (res?.error) toast(res.error, 'error');
        resolve(res || {});
      });
    });
  }
  const admin = (action, extra = {}) => send('admin', { action, ...extra });

  // ---------- toasts ----------
  function toast(text, kind = 'info', ms = 2600) {
    const el = document.createElement('div');
    el.className = `toast k-${kind}`;
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
  }

  // ---------- login ----------
  const nameInput = $('#login-name'), passInput = $('#login-pass');
  nameInput.addEventListener('input', () => {
    const isAdmin = nameInput.value.trim().toUpperCase() === 'ADMIN-GAME';
    passInput.classList.toggle('hidden', !isAdmin);
  });
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-error').textContent = '';
    const name = nameInput.value.trim();
    const password = passInput.classList.contains('hidden') ? undefined : passInput.value;
    socket.emit('login', { name, password }, (res) => {
      if (res?.needPassword) { passInput.classList.remove('hidden'); passInput.focus(); $('#login-error').textContent = 'Enter admin password'; }
      else if (res?.error) $('#login-error').textContent = res.error;
      else passInput.value = '';
    });
  });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action],[data-admin],[data-join],[data-kick],[data-lives],[data-move]');
    if (!t || t.disabled) return;
    if (t.dataset.action === 'logout') send('logout');
    if (t.dataset.action === 'leave') send('leave');
    if (t.dataset.join) send('join', { slot: t.dataset.join });
    if (t.dataset.kick) admin('kick', { slot: t.dataset.kick });
    if (t.dataset.lives) admin('setLives', { team: t.dataset.team, value: (S?.livesSetting?.[t.dataset.team] || 3) + Number(t.dataset.lives) });
    if (t.dataset.admin) admin(t.dataset.admin, { team: t.dataset.team, winner: t.dataset.winner });
    if (t.dataset.move) doMove(t.dataset.move);
  });

  // ---------- screens ----------
  function show(id) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  }

  function render() {
    if (!S) return;
    const me = S.me;
    if (!me) { show('screen-login'); hideOverlays(); return; }
    const inGame = S.phase !== 'lobby' && (me.isAdmin || me.slot);
    if (!inGame) { renderLobby(); show('screen-lobby'); hideOverlays(); layoutKey = null; return; }
    renderGame();
    show('screen-game');
  }

  // ---------- lobby ----------
  const SLOT_LABEL = { miner: 'Miner', navigator: 'Navigator', assassin: 'Assassin' };
  function renderLobby() {
    const me = S.me;
    $('#lobby-me').innerHTML = `${esc(me.name)}${me.isAdmin ? ' · <b style="color:var(--accent)">ADMIN</b>' : ''}`;
    const filled = Object.values(S.lobby).filter(Boolean).length;
    $('#lobby-status').textContent = S.phase !== 'lobby'
      ? 'A game is in progress. Wait for the next round.'
      : me.isAdmin
        ? `${filled}/5 players joined${filled === 5 ? '. Ready to start!' : ''}`
        : me.slot ? 'Waiting for the admin to start the game…' : 'Pick your role';

    $$('.slot').forEach((el) => {
      const id = el.dataset.slot;
      const role = SLOT_LABEL[id.split('.').pop()];
      const p = S.lobby[id];
      el.classList.toggle('filled', !!p);
      el.classList.toggle('mine', !!p?.you);
      let right = '';
      if (!p && !me.isAdmin && S.phase === 'lobby') right = `<button class="btn btn-sm" data-join="${id}">Join</button>`;
      if (p?.you && S.phase === 'lobby') right = `<button class="btn btn-ghost btn-sm" data-action="leave">Leave</button>`;
      if (p && me.isAdmin && S.phase === 'lobby') right = `<button class="btn btn-danger btn-sm" data-kick="${id}">Kick</button>`;
      el.innerHTML = `<div><div class="slot-role">${role}</div><div class="slot-name">${p ? `<span class="dot ${p.online ? 'on' : ''}"></span>${esc(p.name)}${p.you ? ' (you)' : ''}` : '<span class="muted">Empty</span>'}</div></div>${right}`;
    });

    $$('[data-lives-for]').forEach((el) => { el.textContent = S.livesSetting[el.dataset.livesFor]; });
    $$('#screen-lobby .admin-only').forEach((el) => el.classList.toggle('hidden', !me.isAdmin || S.phase !== 'lobby'));
    $('#admin-lobby').classList.toggle('hidden', !me.isAdmin);
    if (me.isAdmin) {
      $('#btn-start').disabled = filled < 5 || S.phase !== 'lobby';
    }
  }

  // ---------- board component ----------
  function createBoard(host) {
    host.innerHTML = `
      <div class="board-wrap">
        <div></div><div class="axis axis-x"></div>
        <div class="axis axis-y"></div>
        <div class="board"><div class="pawn-layer"></div></div>
      </div>`;
    const boardEl = $('.board', host), layer = $('.pawn-layer', host);
    let mazeId = null, n = 0;
    const cells = [];
    const pawns = {};
    const items = new Map();

    function build(b) {
      n = b.size;
      mazeId = b.id;
      $$('.cell', boardEl).forEach((c) => c.remove());
      items.clear();
      cells.length = 0;
      boardEl.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
      boardEl.style.gridTemplateRows = `repeat(${n}, 1fr)`;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const c = document.createElement('div');
        c.className = 'cell' + (b.walls[y][x] ? ' wall' : '');
        boardEl.insertBefore(c, layer);
        cells.push(c);
      }
      const ax = $('.axis-x', host), ay = $('.axis-y', host);
      ax.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
      ay.style.gridTemplateRows = `repeat(${n}, 1fr)`;
      ax.innerHTML = ay.innerHTML = '';
      for (let i = 0; i < n; i++) { ax.innerHTML += `<span>${i}</span>`; ay.innerHTML += `<span>${i}</span>`; }
      Object.values(pawns).forEach((p) => p.remove());
      for (const k in pawns) delete pawns[k];
    }

    function setItem(key, x, y, cls, label) {
      if (items.has(key)) return;
      const el = document.createElement('div');
      el.className = 'item ' + cls;
      el.textContent = label;
      cells[y * n + x].appendChild(el);
      items.set(key, el);
    }

    function update(b, { activeTurn } = {}) {
      if (b.id !== mazeId) build(b);
      const keep = new Set();
      setItem('vault', b.vault.x, b.vault.y, 'vault', '◆'); keep.add('vault');
      for (const c of b.chests) {
        const key = 'c' + c.id;
        setItem(key, c.x, c.y, 'chest-' + c.tier, c.tier[0].toUpperCase());
        keep.add(key);
      }
      for (const [key, el] of items) {
        if (!keep.has(key)) { items.delete(key); el.classList.add('removing'); setTimeout(() => el.remove(), 500); }
      }

      const labels = { miner1: 'M1', miner2: 'M2', assassin: 'A' };
      for (const k of Object.keys(labels)) {
        const pos = b.pawns[k];
        if (!pos) { if (pawns[k]) { pawns[k].style.opacity = 0; pawns[k].dataset.hidden = '1'; } continue; }
        if (!pawns[k]) {
          const el = document.createElement('div');
          el.className = 'pawn ' + k;
          el.innerHTML = `<i><b>${labels[k]}</b></i>`;
          el.style.width = el.style.height = 100 / n + '%';
          layer.appendChild(el);
          pawns[k] = el;
        }
        const el = pawns[k];
        const transform = `translate(${pos.x * 100}%, ${pos.y * 100}%)`;
        if (el.dataset.hidden) {
          // respawn: jump to the spawn cell (no slide), then fade in
          el.style.transition = 'none';
          el.style.transform = transform;
          void el.offsetWidth;
          el.style.transition = '';
          delete el.dataset.hidden;
        }
        el.style.opacity = 1;
        el.style.transform = transform;
        el.classList.toggle('active', activeTurn === k);
        el.classList.remove('shift-a', 'shift-b');
      }
      // offset pawns sharing a cell
      const keys = Object.keys(b.pawns);
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        const a = b.pawns[keys[i]], c = b.pawns[keys[j]];
        if (a.x === c.x && a.y === c.y) { pawns[keys[i]]?.classList.add('shift-a'); pawns[keys[j]]?.classList.add('shift-b'); }
      }
    }
    return { update, el: boardEl, shake() { boardEl.classList.remove('shake'); void boardEl.offsetWidth; boardEl.classList.add('shake'); } };
  }

  // ---------- game screen ----------
  let layoutKey = null;
  let board = null;
  const body = $('#game-body');

  const legendHTML = `
    <div class="legend">
      <span><i style="background:var(--bronze)"></i>Bronze 500</span>
      <span><i style="background:var(--silver)"></i>Silver 1000</span>
      <span><i style="background:var(--gold)"></i>Gold 2000</span>
      <span><i style="border:2px solid var(--vault)"></i>Vault ×3</span>
      <span><i style="background:var(--wall)"></i>Wall</span>
    </div>`;

  const dpadHTML = `
    <div class="dpad">
      <button class="up" data-move="up" aria-label="Up">▲</button>
      <button class="left" data-move="left" aria-label="Left">◀</button>
      <div class="center"></div>
      <button class="right" data-move="right" aria-label="Right">▶</button>
      <button class="down" data-move="down" aria-label="Down">▼</button>
    </div>`;

  const ringHTML = `
    <div class="ring"><svg width="84" height="84"><circle class="track" cx="42" cy="42" r="36" fill="none" stroke-width="6"/>
    <circle class="prog" cx="42" cy="42" r="36" fill="none" stroke-width="6" stroke-dasharray="226.2" stroke-dashoffset="0"/></svg>
    <div class="num"></div></div>`;

  function buildLayout(role, team) {
    board = null;
    if (role === 'admin') {
      body.innerHTML = `
        <div class="layout-admin">
          <div class="board-col"><div id="board-host"></div><div style="margin-top:10px">${legendHTML}</div></div>
          <div class="side">
            <div class="panel" id="memo-panel"><h3>Memorize phase</h3><div style="display:flex;align-items:center;gap:16px">${ringHTML}<button class="btn" data-admin="skipMemorize">Skip</button></div></div>
            <div class="panel"><h3>Scoreboard</h3><div id="scoreboard"></div></div>
            <div class="panel"><h3>Controls</h3><div class="admin-actions">
              <button class="btn btn-sm" data-admin="skipTurn">Skip turn</button>
              <button class="btn btn-sm" data-admin="start">New maze (restart)</button>
              <button class="btn btn-danger btn-sm" data-admin="lobby">Back to lobby</button>
            </div><div class="muted small" id="vault-info" style="margin-top:10px"></div></div>
            <div class="panel"><h3>Event log</h3><div class="log" id="log"></div></div>
          </div>
        </div>`;
      board = createBoard($('#board-host'));
    } else if (role === 'assassin') {
      body.innerHTML = `
        <div class="layout-player team-assassin">
          <div class="turn-banner" id="turn-banner"></div>
          <div id="board-host"></div>
          ${legendHTML}
          ${dpadHTML}
          <div class="panel"><h3>Targets</h3><div id="scoreboard"></div></div>
        </div>`;
      board = createBoard($('#board-host'));
    } else if (role === 'navigator') {
      body.innerHTML = `
        <div class="layout-player team-${team}">
          <div class="turn-banner" id="turn-banner"></div>
          <div class="memorize" id="memo-panel">
            <div class="memorize-title">MEMORIZE THE MAZE</div>
            ${ringHTML}
            <div id="board-host" style="width:100%"></div>
            ${legendHTML}
          </div>
          <div class="stats">
            <div class="stat"><div class="v" id="st-lives">-</div><div class="l">Lives</div></div>
            <div class="stat"><div class="v" id="st-points">0</div><div class="l">Points</div></div>
          </div>
          <div class="coords"><div class="l">Assassin location (x,y)</div><div class="v" id="assassin-xy">-,-</div></div>
          ${dpadHTML}
        </div>`;
      board = createBoard($('#board-host'));
    } else {
      body.innerHTML = `
        <div class="layout-player team-${team}">
          <div class="turn-banner" id="turn-banner"></div>
          <div class="card placeholder">
            <div class="big">${esc(S.teamNames[team])}</div>
            <div class="muted">You are the Miner. Your navigator guides you through the maze.</div>
          </div>
          <div class="stats">
            <div class="stat"><div class="v" id="st-lives">-</div><div class="l">Lives</div></div>
            <div class="stat"><div class="v" id="st-points">0</div><div class="l">Points</div></div>
          </div>
        </div>`;
    }
  }

  function hearts(n) { return n > 0 ? '♥'.repeat(Math.min(n, 10)) + (n > 10 ? ` +${n - 10}` : '') : '-'; }

  function renderScoreboard(isAdmin) {
    const el = $('#scoreboard');
    if (!el || !S.teams) return;
    el.innerHTML = ['miner1', 'miner2'].filter((t) => S.teams[t]).map((t) => {
      const d = S.teams[t];
      const btns = isAdmin && !d.eliminated && ['playing', 'memorize'].includes(S.phase)
        ? `<div class="score-btns"><button class="btn btn-sm" data-admin="lifeDown" data-team="${t}" title="Remove 1 life">−♥</button><button class="btn btn-sm" data-admin="lifeUp" data-team="${t}" title="Add 1 life">+♥</button><button class="btn btn-danger btn-sm" data-admin="eliminate" data-team="${t}">Eliminate</button></div>`
        : isAdmin && d.eliminated && ['playing', 'memorize'].includes(S.phase)
          ? `<div class="score-btns"><button class="btn btn-sm" data-admin="lifeUp" data-team="${t}">Revive +♥</button></div>` : '';
      return `<div class="score-row team-${t} ${d.eliminated ? 'out' : ''}">
        <div class="name">${esc(S.teamNames[t])}${d.eliminated ? ' · OUT' : ''}</div>
        <div class="pts">${d.points.toLocaleString()}</div>
        <div class="meta"><span class="hearts">${hearts(d.lives)}</span><span>B${d.chests.bronze} S${d.chests.silver} G${d.chests.gold}</span></div>
        ${btns ? `<div class="meta">${btns}</div>` : ''}
      </div>`;
    }).join('');
  }

  function renderGame() {
    const me = S.me;
    const key = `${me.role}|${me.team}`;
    if (key !== layoutKey) { buildLayout(me.role, me.team); layoutKey = key; }

    const names = S.teamNames;
    $('#game-me').textContent = me.isAdmin ? 'ADMIN' : `${me.name} · ${names[me.team]} ${me.role !== 'assassin' ? '· ' + me.role : ''}`;
    $('#turn-pill').textContent = S.phase === 'memorize' ? 'Memorize phase' : S.phase === 'playing' ? `Turn: ${names[S.turn]}` : S.phase === 'battle' ? 'Battle!' : S.phase === 'finished' ? 'Game over' : '';
    const pill = $('#turn-pill');
    pill.style.borderColor = S.phase === 'playing' ? `var(--${S.turn})` : '';
    pill.style.color = S.phase === 'playing' ? `var(--${S.turn})` : '';

    // board
    if (board && S.board) board.update(S.board, { activeTurn: S.phase === 'playing' ? S.turn : null });

    // memorize panel
    const memo = $('#memo-panel');
    if (memo) {
      if (me.role === 'admin') memo.classList.toggle('hidden', S.phase !== 'memorize');
      if (me.role === 'navigator') {
        if (S.phase === 'memorize') { memo.classList.remove('hidden'); board?.el.classList.remove('fade-out'); }
        else if (!memo.classList.contains('hidden')) {
          board?.el.classList.add('fade-out');
          $('.ring', memo)?.classList.add('hidden');
          setTimeout(() => { if (S.phase !== 'memorize') memo.classList.add('hidden'); }, 900);
        }
      }
    }

    // turn banner (players)
    const tb = $('#turn-banner');
    if (tb) {
      const myTeam = me.team;
      const mine = S.phase === 'playing' && S.turn === myTeam;
      tb.classList.toggle('yours', mine);
      tb.textContent = S.phase === 'memorize'
        ? (me.role === 'navigator' ? 'Memorize the maze!' : 'Navigators are memorizing the maze…')
        : S.phase === 'playing' && me.role === 'assassin' && S.assassinCooldown > 0
          ? `You are down! Respawning after ${S.assassinCooldown} skipped turn${S.assassinCooldown > 1 ? 's' : ''}`
        : S.phase === 'playing'
          ? (mine ?(me.role === 'miner' ? 'YOUR TEAM IS MOVING' : 'YOUR TURN') : `${names[S.turn]}'s turn`)
          : S.phase === 'battle' ? 'BATTLE' : 'GAME OVER';
    }

    // stats
    if (S.teams && me.team && S.teams[me.team]) {
      const d = S.teams[me.team];
      const sl = $('#st-lives'), sp = $('#st-points');
      if (sl) sl.textContent = d.eliminated ? 'OUT' : d.lives;
      if (sp) sp.textContent = d.points.toLocaleString();
    }
    renderScoreboard(me.isAdmin);

    // assassin coords
    const xy = $('#assassin-xy');
    if (xy && 'assassinPos' in S) {
      const txt = S.assassinPos ? `${S.assassinPos.x},${S.assassinPos.y}` : 'OUT';
      if (xy.textContent !== txt) { xy.textContent = txt; xy.classList.remove('bump'); void xy.offsetWidth; xy.classList.add('bump'); }
    }

    // dpad
    const canMove = S.phase === 'playing' && S.turn === me.team && (me.role === 'navigator' || me.role === 'assassin') && !S.teams?.[me.team]?.eliminated;
    $$('.dpad button').forEach((b) => (b.disabled = !canMove || moving));

    // admin extras
    if (me.isAdmin) {
      const vi = $('#vault-info');
      if (vi && S.vaultSteps) vi.textContent = `Vault shortest path: M1 ${S.vaultSteps.miner1} steps · M2 ${S.vaultSteps.miner2} steps`;
      const log = $('#log');
      if (log) log.innerHTML = (S.events || []).slice().reverse().map((e) => `<div class="k-${e.kind}">${esc(e.text)}</div>`).join('');
    }

    handleEvents();
    renderOverlays();
    tickCountdown();
  }

  // toasts + effects for new events
  function handleEvents() {
    const evs = S.events || [];
    const maxSeq = evs.length ? evs[evs.length - 1].seq : 0;
    if (lastSeq === null || maxSeq < lastSeq) { lastSeq = maxSeq; return; }
    const me = S.me;
    for (const e of evs) {
      if (e.seq <= lastSeq) continue;
      if (me.isAdmin) { if (e.kind === 'blocked') board?.shake(); continue; }
      if (e.kind === 'blocked' && e.team === me.team) { toast('Blocked! You hit a wall. Turn lost.', 'blocked'); board?.shake(); navigator.vibrate?.(200); }
      else if (e.kind === 'chest' && (e.team === me.team || me.role === 'assassin')) toast(e.text, 'chest');
      else if (e.kind === 'turn' && S.turn === me.team && S.phase === 'playing' && me.role !== 'miner') navigator.vibrate?.(60);
      else if ((e.kind === 'eliminated' || e.kind === 'battle') && (e.team === me.team || me.role === 'assassin') && S.phase !== 'battle') toast(e.text, 'info', 3500);
    }
    lastSeq = maxSeq;
  }

  // ---------- overlays ----------
  function hideOverlays() { $('#overlay-battle').classList.add('hidden'); $('#overlay-finish').classList.add('hidden'); finishShown = false; }
  let finishShown = false;

  function renderOverlays() {
    const me = S.me;
    const ob = $('#overlay-battle');
    if (S.phase === 'battle' && S.battle) {
      const wasHidden = ob.classList.contains('hidden');
      ob.classList.remove('hidden');
      const m = S.battle.miner;
      $('#battle-vs').innerHTML = `<span style="color:var(--${m})">${esc(S.teamNames[m])}</span> <span class="muted">vs</span> <span style="color:var(--assassin)">Assassin</span>`;
      const res = S.battle.result;
      $('#battle-msg').textContent = res
        ? (res === 'miner' ? `${S.teamNames[m]} wins! The assassin is down and skips its next turn.` : `The Assassin wins! ${S.teamNames[m]} loses a life.`)
        : 'Battle is being played offline… waiting for the admin.';
      $('#battle-actions').innerHTML = me.isAdmin
        ? res
          ? `<button class="btn btn-primary btn-lg" data-admin="continue">Continue game</button>`
          : `<button class="btn btn-lg" style="border-color:var(--${m});color:var(--${m})" data-admin="resolveBattle" data-winner="miner">${esc(S.teamNames[m])} wins</button>
             <button class="btn btn-lg" style="border-color:var(--assassin);color:var(--assassin)" data-admin="resolveBattle" data-winner="assassin">Assassin wins</button>`
        : '';
      if (wasHidden) navigator.vibrate?.([200, 100, 200]);
    } else ob.classList.add('hidden');

    const of = $('#overlay-finish');
    if (S.phase === 'finished' && S.winner) {
      of.classList.remove('hidden');
      const w = S.winner;
      const title = $('#finish-title');
      title.textContent = w.name;
      of.style.setProperty('--team', `var(--${w.team})`);
      $('#finish-scores').innerHTML = ['miner1', 'miner2'].map((t) => {
        const isW = w.team === t;
        return `<div class="stat team-${t}" style="${isW ? 'border-color:var(--team)' : ''}">
          <div class="v" style="color:var(--team)">${(w.scores[t] ?? 0).toLocaleString()}</div>
          <div class="l">${esc(S.teamNames[t])}${isW ? ` · ${w.chestPoints.toLocaleString()} × ${S.config.multiplier}` : ''}</div></div>`;
      }).join('');
      $('#finish-actions').innerHTML = me.isAdmin
        ? `<button class="btn btn-primary btn-lg" data-admin="start">Play again (new maze)</button><button class="btn btn-lg" data-admin="lobby">Back to lobby</button>`
        : `<div class="muted">Waiting for the admin…</div>`;
      if (!finishShown) { finishShown = true; confetti(getComputedStyle(document.documentElement).getPropertyValue(`--${w.team}`).trim()); }
    } else { of.classList.add('hidden'); finishShown = false; }
  }

  // ---------- memorize countdown ----------
  function tickCountdown() {
    if (!S || S.phase !== 'memorize' || !S.memorizeEndsAt) return;
    const total = S.config.memorizeSeconds * 1000;
    const left = Math.max(0, S.memorizeEndsAt - (Date.now() + clockOffset));
    $$('.ring').forEach((r) => {
      $('.num', r).textContent = Math.ceil(left / 1000);
      $('.prog', r).style.strokeDashoffset = 226.2 * (1 - left / total);
    });
  }
  setInterval(tickCountdown, 250);

  // ---------- moving ----------
  function doMove(dir) {
    if (!S || moving) return;
    const btn = $(`.dpad [data-move="${dir}"]`);
    if (!btn || btn.disabled) return;
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 150);
    moving = true;
    $$('.dpad button').forEach((b) => (b.disabled = true));
    send('move', { dir }).then((res) => { if (res.error) { moving = false; render(); } });
  }
  const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    const dir = KEYMAP[e.key];
    if (dir && $('.dpad')) { e.preventDefault(); doMove(dir); }
  });

  // ---------- confetti ----------
  function confetti(color) {
    const cv = $('#confetti');
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = [color || '#a78bfa', '#facc15', '#e7e9ee', '#34d399'];
    const parts = Array.from({ length: 160 }, () => ({
      x: innerWidth / 2, y: innerHeight / 2.4,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
      r: Math.random() * 6 + 3, c: colors[(Math.random() * colors.length) | 0], a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
      }
      if (t - t0 < 4000 && finishShown) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(t0);
  }
})();
