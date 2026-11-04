// Галочки у ников: зелёная (аккаунт подтверждён), синяя (заслуги), золотая (команда проекта)
// Синюю и золотую выдаёт админ, зелёная считается сама
function badgeOf(u) {
  if (!u) return '';
  if (u.badge === 'gold' || u.badge === 'blue') return u.badge;
  if (u.is_bot) return '';
  if (u.email_verified || (u.provider && u.provider !== 'password')) return 'green';
  return '';
}

module.exports = { badgeOf };
