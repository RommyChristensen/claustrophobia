const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { Game } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/healthz', (_req, res) => res.send('ok'));

let pending = false;
function broadcast() {
  // coalesce multiple changes in the same tick into one broadcast
  if (pending) return;
  pending = true;
  process.nextTick(() => {
    pending = false;
    for (const [, s] of io.of('/').sockets) s.emit('state', game.viewFor(s.data.token));
  });
}

const game = new Game(broadcast);

function guard(socket, fn) {
  return (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      const result = fn(payload) || { ok: true };
      reply(result);
    } catch (e) {
      if (!e.userFacing) console.error(e);
      reply({ error: e.userFacing ? e.message : 'Server error' });
    }
  };
}

function requireAdmin(socket) {
  const p = game.players[socket.data.token];
  if (!p?.isAdmin) {
    const e = new Error('Admin only');
    e.userFacing = true;
    throw e;
  }
}

io.on('connection', (socket) => {
  socket.on('hello', guard(socket, ({ token }) => {
    token = String(token || '').slice(0, 64);
    if (!token) throw Object.assign(new Error('Missing token'), { userFacing: true });
    if (socket.data.token && socket.data.token !== token) {
      game.online[socket.data.token] = Math.max(0, (game.online[socket.data.token] || 1) - 1);
    }
    socket.data.token = token;
    game.online[token] = (game.online[token] || 0) + 1;
    broadcast();
  }));

  const t = () => socket.data.token;

  socket.on('login', guard(socket, ({ name, password }) => game.login(t(), name, password)));
  socket.on('logout', guard(socket, () => game.logout(t())));
  socket.on('join', guard(socket, ({ slot }) => game.join(t(), slot)));
  socket.on('leave', guard(socket, () => game.leave(t())));
  socket.on('move', guard(socket, ({ dir }) => game.move(t(), dir)));

  socket.on('admin', guard(socket, ({ action, team, slot, value, winner }) => {
    requireAdmin(socket);
    switch (action) {
      case 'start': return game.start();
      case 'setLives': return game.setLives(team, value);
      case 'kick': return game.kick(slot);
      case 'skipMemorize': return game.endMemorize();
      case 'resolveBattle': return game.resolveBattle(winner);
      case 'continue': return game.continueGame();
      case 'lifeDown': return game.adjustLives(team, -1);
      case 'lifeUp': return game.adjustLives(team, +1);
      case 'eliminate': return game.eliminate(team);
      case 'skipTurn': return game.skipTurn();
      case 'lobby': return game.resetToLobby();
      default: throw Object.assign(new Error('Unknown action'), { userFacing: true });
    }
  }));

  socket.on('disconnect', () => {
    const tk = socket.data.token;
    if (tk) game.online[tk] = Math.max(0, (game.online[tk] || 1) - 1);
    broadcast();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Claustrophobia running on http://localhost:${PORT}`));
