// Письма (подтверждение почты). Без SMTP_URL ничего не отправляется, а вход и игра работают как обычно.
const nodemailer = require('nodemailer');

let transport = null;
const enabled = () => !!process.env.SMTP_URL;

async function sendMail({ to, subject, text }) {
  if (!enabled()) { console.log('[почта выключена]', to, subject); return false; }
  try {
    if (!transport) transport = nodemailer.createTransport(process.env.SMTP_URL);
    await transport.sendMail({ from: process.env.MAIL_FROM || 'QuorChess <no-reply@quorvox.ru>', to, subject, text });
    return true;
  } catch (e) {
    console.error('Ошибка отправки письма:', e.message);
    return false;
  }
}

module.exports = { sendMail, enabled };
