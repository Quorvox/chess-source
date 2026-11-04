// Звание по рейтингу. Шкала QuorChess близка к chess.com
const STEPS = [[2500, 'gm'], [1900, 'cm'], [1400, 'adv'], [1100, 'club'], [0, 'new']];
export const rankOf = (rating) => STEPS.find(([min]) => rating >= min)[1];
