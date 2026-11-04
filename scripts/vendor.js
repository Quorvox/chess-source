// копирует браузерные библиотеки из node_modules в public/vendor
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nm = (p) => path.join(root, 'node_modules', p);
const out = (p) => path.join(root, 'public', 'vendor', p);

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, filter: (s) => !s.endsWith('.map') && !s.endsWith('.d.ts') });
}

copy(nm('chessground/dist'), out('chessground'));
copy(nm('chessground/assets/chessground.base.css'), out('chessground/chessground.base.css'));
copy(nm('chessground/assets/chessground.cburnett.css'), out('chessground/chessground.cburnett.css'));
copy(nm('chess.js/dist/esm/chess.js'), out('chess.js/chess.js'));
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) copy(nm('stockfish/bin/' + f), out('stockfish/' + f));

// Three.js для 3D на главной (грузится только там)
copy(nm('three/build/three.module.js'), out('three/three.module.js'));
copy(nm('three/build/three.core.js'), out('three/three.core.js'));
const env = fs.readFileSync(nm('three/examples/jsm/environments/RoomEnvironment.js'), 'utf8').replace(/from\s+'three'/g, "from './three.module.js'");
fs.mkdirSync(out('three'), { recursive: true });
fs.writeFileSync(out('three/RoomEnvironment.js'), env);

// шрифты с кириллицей и латиницей
for (const [pkg, name] of [['unbounded', 'unbounded'], ['onest', 'onest']]) {
  for (const sub of ['latin', 'cyrillic']) {
    copy(nm(`@fontsource-variable/${pkg}/files/${name}-${sub}-wght-normal.woff2`), out(`fonts/${name}-${sub}.woff2`));
  }
}
console.log('vendor ok');
