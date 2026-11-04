// рейтинг бота -> настройки движка (та же логика, что на сервере)
export function strength(elo) {
  elo = Math.max(300, Math.min(3200, Math.round(elo)));
  if (elo >= 2800) return { full: true, movetime: 1200, random: 0 };
  if (elo < 700) return { depth: 1, random: 0.3 };
  if (elo < 1000) return { depth: 1, random: 0.12 };
  if (elo < 1320) return { depth: 2, random: 0.05 };
  return { elo: Math.min(elo, 3190), movetime: elo > 2400 ? 400 : 150, random: 0 };
}

// уровни 1-10 для игры с компьютером
export const LEVELS = [
  { n: 1, elo: 400, name: 'Новичок' }, { n: 2, elo: 600, name: 'Любитель' }, { n: 3, elo: 800, name: 'Школьник' },
  { n: 4, elo: 1000, name: 'Клубный' }, { n: 5, elo: 1250, name: 'Уверенный' }, { n: 6, elo: 1500, name: 'Сильный' },
  { n: 7, elo: 1800, name: 'Кандидат' }, { n: 8, elo: 2100, name: 'Мастер' }, { n: 9, elo: 2500, name: 'Гроссмейстер' },
  { n: 10, elo: 3000, name: 'Максимум' },
];
