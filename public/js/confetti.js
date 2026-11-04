// Конфетти при победе. Если в системе включено «меньше анимации», ничего не показываем.
export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:95';
  c.width = innerWidth;
  c.height = innerHeight;
  document.body.append(c);
  const g = c.getContext('2d');
  const cols = ['#f0a73b', '#ffd96b', '#7fb85a', '#5b9bd5', '#e5534b', '#ffffff'];
  const ps = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 260, y: innerHeight * 0.62,
    vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 17 - 6, s: 6 + Math.random() * 7,
    r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35, c: cols[Math.floor(Math.random() * cols.length)],
  }));
  const start = performance.now();
  (function frame() {
    g.clearRect(0, 0, c.width, c.height);
    let alive = 0;
    for (const p of ps) {
      p.vy += 0.36; p.vx *= 0.995; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      if (p.y < c.height + 30) alive++;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.fillStyle = p.c;
      g.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.62);
      g.restore();
    }
    if (alive && performance.now() - start < 4500) requestAnimationFrame(frame); else c.remove();
  })();
}
