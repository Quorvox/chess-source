const handlers = new Map();
let ws;
let retry = 0;
const pending = [];

function emit(t, m) { handlers.get(t)?.forEach((fn) => fn(m)); }

export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => { retry = 0; for (const s of pending.splice(0)) ws.send(s); emit('open', {}); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } emit(m.t, m); };
  ws.onclose = () => { emit('close', {}); setTimeout(connect, Math.min(10000, 500 * 2 ** retry++)); };
}

// после входа/выхода переподключаемся, чтобы сокет подхватил новую сессию
export function reconnect() { if (ws) ws.close(); }

export function send(o) {
  const s = JSON.stringify(o);
  if (ws && ws.readyState === 1) ws.send(s); else pending.push(s);
}

export function on(t, fn) {
  if (!handlers.has(t)) handlers.set(t, new Set());
  handlers.get(t).add(fn);
  return () => handlers.get(t).delete(fn);
}
