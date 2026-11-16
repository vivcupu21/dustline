// DOM HUD for DUSTLINE. No THREE here; main.js pushes state in, reads play/buy callbacks out.
const COPY = {
  start: { title: 'DUSTLINE', copy: '3v3 taktis di Ember District. Plant spike, first to 5.', action: 'Click to play' },
  paused: { title: 'DUSTLINE', copy: 'Paused.', action: 'Click to resume' },
  round: { title: 'Round', copy: '', action: 'Continue' },
  end: { title: 'Match over', copy: '', action: 'Play again' },
  dead: { title: 'Kamu gugur', copy: 'Tunggu ronde berakhir.', action: 'Spectate' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay'), title = $('overlay-title'), copy = $('overlay-copy'), play = $('play');
  const ammo = $('ammo'), ammoMag = $('ammo-mag'), ammoReserve = $('ammo-reserve');
  const health = $('health'), healthValue = $('health-value'), armorValue = $('armor-value');
  const moneyValue = $('money-value'), timerValue = $('timer-value');
  const scoreEmber = $('score-ember'), scoreSlate = $('score-slate'), roundLabel = $('round-label');
  const killfeed = $('killfeed'), bannerEl = $('banner'), bannerText = $('banner-text'), bannerSub = $('banner-sub');
  const buymenu = $('buymenu'), buyMoney = $('buy-money'), buyList = $('buy-list');
  const progress = $('progress'), progressFill = $('progress-fill'), progressLabel = $('progress-label');
  const spikeText = $('spike-text'), vignette = $('vignette'), scope = $('scope');
  const crosshair = $('crosshair'), hitmarker = $('hitmarker');
  let hitTimer = 0, bannerTimer = 0, buyHandler = null;

  buyList.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-weapon]');
    if (!li || li.classList.contains('cant') || !buyHandler) return;
    buyHandler(li.dataset.weapon);
  });

  return {
    setAmmo(mag, reserve) {
      ammoMag.textContent = mag;
      ammoReserve.textContent = `/ ${reserve}`;
      ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(hp, armor) {
      healthValue.textContent = Math.max(0, Math.round(hp));
      armorValue.textContent = `Armor ${Math.round(armor)}`;
      health.classList.toggle('low', hp <= 30);
    },
    setMoney(n) { moneyValue.textContent = `$${n}`; },
    setTimer(sec) {
      const s = Math.max(0, Math.ceil(sec));
      const t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (timerValue.textContent !== t) timerValue.textContent = t;
    },
    setScore(ember, slate) {
      scoreEmber.textContent = `EMBER ${ember}`;
      scoreSlate.textContent = `${slate} SLATE`;
    },
    setRound(n) { roundLabel.textContent = `ROUND ${n}`; },
    setWeaponName() {},
    banner(text, sub = '', ms = 2500) {
      bannerText.textContent = text;
      bannerSub.textContent = sub;
      bannerEl.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => bannerEl.classList.remove('on'), ms);
    },
    killfeed(text, head = false) {
      const li = document.createElement('li');
      if (head) li.classList.add('head');
      li.innerHTML = text;
      killfeed.prepend(li);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => li.remove(), 5000);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => { hitmarker.classList.remove('on'); hitmarker.style.transform = ''; }, holdMs);
    },
    showOverlay(mode, data = {}) {
      const c = COPY[mode] || COPY.start;
      title.textContent = data.title || c.title;
      copy.textContent = data.copy || c.copy;
      if (mode === 'end' && data.ember != null) copy.textContent = `Skor akhir: EMBER ${data.ember} — ${data.slate} SLATE.`;
      play.textContent = data.action || c.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    showBuy(open, money, owned = [], WEAPONS = null) {
      buymenu.hidden = !open;
      if (!open) return;
      buyMoney.textContent = `$${money}`;
      const ownedSet = new Set(owned);
      for (const li of buyList.children) {
        const id = li.dataset.weapon;
        const priceEl = li.querySelector('.price');
        const w = WEAPONS?.find((x) => x.id === id);
        const price = w ? w.price : parseInt(priceEl.textContent.slice(1), 10) || 0;
        if (w) priceEl.textContent = `$${w.price}`;
        li.classList.toggle('owned', ownedSet.has(id));
        li.classList.toggle('cant', !ownedSet.has(id) && price > money);
      }
    },
    progress(kind, frac, label = '') {
      if (frac <= 0) { progress.hidden = true; return; }
      progress.hidden = false;
      progressFill.style.width = `${Math.min(100, Math.round(frac * 100))}%`;
      progressLabel.textContent = label || (kind === 'plant' ? 'Planting…' : 'Defusing…');
    },
    setSpikeStatus(text) { spikeText.textContent = text || ''; },
    vignette(amount) { vignette.style.opacity = Math.max(0, Math.min(1, amount)); },
    scope(on) { scope.hidden = !on; },
    setMuted() {},
    onPlay(handler) { play.addEventListener('click', handler); },
    onBuySelect(handler) { buyHandler = handler; },
    setCrosshairSpread(px) { crosshair.style.setProperty('--gap', `${Math.max(0, px)}px`); },
  };
}
