// Комнаты в стиле R.E.P.O.: лобби создаёт игрок и он же хост.
// Правила партии и часы считает браузер хоста, сервер только список лобби и пересылка сообщений.
const crypto = require('crypto');

const MAX_MEMBERS = 12; // хост + соперник + зрители
const rooms = new Map(); // code -> room
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  for (;;) {
    let c = '';
    const b = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) c += ALPHABET[b[i] % ALPHABET.length];
    if (!rooms.has(c)) return c;
  }
}

const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

function create(ws, o) {
  leave(ws);
  const room = {
    code: makeCode(),
    title: clean(o.title, 40) || ws.user.display + ' — комната',
    base: [1, 3, 5, 10, 15, 30].includes(o.base) ? o.base : 10,
    inc: [0, 1, 2, 3, 5, 10].includes(o.inc) ? o.inc : 0,
    open: !!o.open,
    host: ws,
    members: new Map(), // id -> ws
    nextId: 1,
    created: Date.now(),
  };
  ws.room = room;
  ws.roomId = 0;
  rooms.set(room.code, room);
  send(ws, { t: 'room-created', room: info(room) });
}

function join(ws, code) {
  leave(ws);
  const room = rooms.get(String(code || '').toUpperCase().trim());
  if (!room) return send(ws, { t: 'room-error', m: 'room.notFound' });
  if (room.members.size + 1 >= MAX_MEMBERS) return send(ws, { t: 'room-error', m: 'room.full' });
  const id = room.nextId++;
  room.members.set(id, ws);
  ws.room = room;
  ws.roomId = id;
  send(ws, { t: 'room-joined', room: info(room), id });
  send(room.host, { t: 'room-peer', id, user: pubUser(ws.user) });
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  if (room.host === ws) {
    rooms.delete(room.code);
    for (const m of room.members.values()) { m.room = null; send(m, { t: 'room-closed' }); }
  } else {
    room.members.delete(ws.roomId);
    send(room.host, { t: 'room-peer-left', id: ws.roomId });
  }
}

// хост -> {to: id | undefined=всем}, гость -> хосту
function relay(ws, m) {
  const room = ws.room;
  if (!room) return;
  const data = m.data;
  if (JSON.stringify(data || null).length > 4000) return;
  if (room.host === ws) {
    if (m.to != null) {
      const target = room.members.get(m.to);
      if (target) send(target, { t: 'room-data', data });
    } else {
      for (const t of room.members.values()) send(t, { t: 'room-data', data });
    }
  } else {
    send(room.host, { t: 'room-data', from: ws.roomId, data });
  }
}

const pubUser = (u) => ({ username: u.username, display: u.display, rating: Math.round(u.rating), avatar: u.avatar, country: u.country });
const info = (r) => ({ code: r.code, title: r.title, base: r.base, inc: r.inc, open: r.open, host: pubUser(r.host.user), players: r.members.size + 1 });

function list() {
  return [...rooms.values()].filter((r) => r.open).sort((a, b) => b.created - a.created).slice(0, 50).map(info);
}

const count = () => rooms.size;

const listAll = () => [...rooms.values()].map(info);

function closeByCode(code) {
  const room = rooms.get(String(code).toUpperCase());
  if (!room) return false;
  leave(room.host);
  return true;
}

module.exports = { create, join, leave, relay, list, listAll, closeByCode, count };
