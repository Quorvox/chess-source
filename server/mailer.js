// Письма (подтверждение почты). Без SMTP_URL ничего не отправляется, а вход и игра работают как обычно.
const nodemailer = require('nodemailer');

let transport = null;
const enabled = () => !!process.env.SMTP_URL;

const LOGO = require('path').join(__dirname, '..', 'public', 'logo-email.png');

async function sendMail({ to, subject, text, html }) {
  if (!enabled()) {
    console.log('[почта выключена]', to, subject);
    if (process.env.MAIL_OUTBOX) require('fs').appendFileSync(process.env.MAIL_OUTBOX, JSON.stringify({ to, subject, text, html }) + '\n'); // только для тестов
    return false;
  }
  try {
    if (!transport) transport = nodemailer.createTransport(process.env.SMTP_URL);
    await transport.sendMail({ from: process.env.MAIL_FROM || 'QuorChess <no-reply@quorvox.ru>', to, subject, text, ...(html ? { html, attachments: [{ filename: 'quorchess.png', path: LOGO, cid: 'logo@quorchess' }] } : {}) });
    return true;
  } catch (e) {
    console.error('Ошибка отправки письма:', e.message);
    return false;
  }
}

module.exports = { sendMail, enabled };
