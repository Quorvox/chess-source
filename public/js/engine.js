// Stockfish в браузере (Web Worker), для игры с ботом и подсказок: серверу это ничего не стоит
let worker = null;

function get() {
  if (!worker) {
    worker = new Worker('/vendor/stockfish/stockfish-19-lite-single.js');
    worker.postMessage('uci');
    worker.postMessage('setoption name Hash value 16');
  }
  return worker;
}

export function bestMove(fen, st) {
  return new Promise((resolve) => {
    const w = get();
    const timer = setTimeout(() => { w.removeEventListener('message', on); resolve(null); }, 15000);
    function on(e) {
      const m = /^bestmove (\S+)/.exec(typeof e.data === 'string' ? e.data : '');
      if (!m) return;
      clearTimeout(timer);
      w.removeEventListener('message', on);
      resolve(m[1] === '(none)' ? null : m[1]);
    }
    w.addEventListener('message', on);
    if (st.full) {
      w.postMessage('setoption name UCI_LimitStrength value false');
      w.postMessage('setoption name Skill Level value 20');
    } else if (st.elo) {
      w.postMessage('setoption name UCI_LimitStrength value true');
      w.postMessage('setoption name UCI_Elo value ' + st.elo);
    } else {
      w.postMessage('setoption name UCI_LimitStrength value false');
      w.postMessage('setoption name Skill Level value ' + (st.skill ?? 0));
    }
    w.postMessage('position fen ' + fen);
    w.postMessage(st.movetime ? 'go movetime ' + st.movetime : 'go depth ' + st.depth);
  });
}

export const hint = (fen) => bestMove(fen, { depth: 12, skill: 20 });

export function stop() { if (worker) { worker.terminate(); worker = null; } }
