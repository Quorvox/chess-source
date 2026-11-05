// Жалоба на соперника из партии: читерство, оскорбления, другое
import { api, toast } from './util.js';
import { t } from './i18n.js';

export function openReport(gameId) {
  document.querySelector('.modal.report')?.remove();
  const m = document.createElement('div');
  m.className = 'modal report';
  m.innerHTML = `<form class="sheet" style="width:min(460px,100%)"><h2>${t('rep.title')}</h2>
    <p class="muted" style="margin-top:0">${t('rep.hint')}</p>
    <label class="switch" style="border-top:0"><span>${t('rep.cheat')}</span><input type="radio" name="r" value="cheat" checked></label>
    <label class="switch"><span>${t('rep.abuse')}</span><input type="radio" name="r" value="abuse"></label>
    <label class="switch"><span>${t('rep.other')}</span><input type="radio" name="r" value="other"></label>
    <label for="rep-t">${t('rep.comment')}</label><textarea id="rep-t" maxlength="300"></textarea>
    <div class="err" id="rep-err"></div>
    <div class="row" style="margin-top:14px"><button>${t('rep.send')}</button><button type="button" class="ghost" data-x>${t('pe.close')}</button></div></form>`;
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-x]')) m.remove(); });
  m.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/report', { method: 'POST', body: { game: gameId, reason: f.r.value, text: f.querySelector('#rep-t').value } });
      toast(t('rep.sent'));
      m.remove();
    } catch (ex) { m.querySelector('#rep-err').textContent = ex.message; }
  };
  document.body.append(m);
}
