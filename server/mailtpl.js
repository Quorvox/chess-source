// Оформление писем: шапка с логотипом, карточка, большая кнопка, подвал. Таблицы и inline-стили, чтобы открывалось везде
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const GOLD = '#f0a73b';
const block = (b, first) => `
  <tr><td style="padding:${first ? '30px' : '26px'} 36px 0 36px;${first ? '' : 'border-top:1px solid #ece7dc;'}">
    <div style="font:700 22px/1.25 Arial,Helvetica,sans-serif;color:#1f1e1b;margin:0 0 10px 0">${esc(b.title)}</div>
    <div style="font:16px/1.55 Arial,Helvetica,sans-serif;color:#3b3833;margin:0 0 22px 0">${b.text}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0"><tr><td style="background:${GOLD};border-radius:10px">
      <a href="${esc(b.url)}" target="_blank" style="display:inline-block;padding:14px 30px;font:700 16px Arial,Helvetica,sans-serif;color:#2a1c00;text-decoration:none;border-radius:10px">${esc(b.button)}</a>
    </td></tr></table>
    <div style="font:13px/1.5 Arial,Helvetica,sans-serif;color:#8a8478;margin:0 0 4px 0">${esc(b.note)}</div>
    <div style="font:12px/1.5 Arial,Helvetica,sans-serif;color:#a39d90;margin:0 0 26px 0;word-break:break-all">${esc(b.fallback)} <a href="${esc(b.url)}" style="color:#b97a1c">${esc(b.url)}</a></div>
  </td></tr>`;

// blocks: [{ title, text(html), button, url, note, fallback }]: обычно русский и английский
function render({ blocks, footer }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f1ede4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1ede4"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#1f1e1b;padding:22px 36px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:12px"><img src="cid:logo@quorchess" width="48" height="48" alt="" style="display:block;border:0"></td>
        <td style="font:800 26px Arial,Helvetica,sans-serif;color:#ffffff;letter-spacing:-.3px">Quor<span style="color:${GOLD}">Chess</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="height:4px;background:${GOLD};font-size:0;line-height:0">&nbsp;</td></tr>
    ${blocks.map((b, i) => block(b, i === 0)).join('')}
    <tr><td style="background:#faf8f3;padding:18px 36px;font:12px/1.5 Arial,Helvetica,sans-serif;color:#9a9486">${esc(footer)}</td></tr>
  </table>
</td></tr></table></body></html>`;
}

module.exports = { render, esc };
