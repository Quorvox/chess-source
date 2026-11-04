// рейтинг бота -> настройки движка
function strength(elo) {
  elo = Math.max(300, Math.min(3200, Math.round(elo)));
  if (elo >= 2800) return { full: true, movetime: 800, random: 0 };
  if (elo < 700) return { depth: 1, random: 0.3 };
  if (elo < 1000) return { depth: 1, random: 0.12 };
  if (elo < 1320) return { depth: 2, random: 0.05 };
  return { elo: Math.min(elo, 3190), movetime: elo > 2400 ? 400 : 150, random: 0 };
}

module.exports = { strength };
