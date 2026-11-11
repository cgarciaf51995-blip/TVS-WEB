(() => {
  'use strict';
  const section = document.getElementById('tvsShowcase');
  if (!section) return;
  const el = id => section.querySelector('#' + id);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let items = [], index = 0, timer = null, visible = false;
  let playing = true, touch = null;
  const labels = {sport: 'Deportiva', trabajo: 'Trabajo', scooter: 'Scooter', king: 'King'};
  const pad = n => String(n).padStart(2, '0');
  const modelAt = offset => items[(index + offset + items.length) % items.length];

  function photo(slot, bike) {
    slot.replaceChildren();
    if (!bike) return;
    const placeholder = document.createElement('span');
    placeholder.className = 'tvs-showcase-placeholder';
    placeholder.textContent = 'Fotografía por actualizar';
    slot.append(placeholder);
    const src = typeof bike.img === 'string' && bike.img ? bike.img : (bike.images || []).find(x => typeof x === 'string');
    if (!src || !/^(https?:|data:image\/|blob:|\/|\.?\.?\/)/i.test(src)) return;
    const img = document.createElement('img');
    img.alt = bike.name || 'Motocicleta TVS';
    img.decoding = 'async';
    img.onload = () => placeholder.hidden = true;
    img.onerror = () => {img.remove(); placeholder.hidden = false;};
    img.src = src;
    slot.append(img);
  }

  function queue() {
    clearTimeout(timer);
    timer = null;
    if (!playing || !visible || document.hidden || items.length < 2) return;
    timer = setTimeout(() => {
      if (!document.body.classList.contains('portal-open') && !document.body.classList.contains('bike-modal-open')) step(1);
      else queue();
    }, 5000);
  }

  function render(animate = true) {
    const bike = items[index];
    section.hidden = !bike;
    if (!bike) {clearTimeout(timer); return;}
    const year = String(bike.year || '');
    const fullName = String(bike.name);
    el('tvsShowcaseName').textContent = year && fullName.endsWith(' ' + year) ? fullName.slice(0, -(year.length + 1)).trim() : fullName;
    el('tvsShowcaseCategory').textContent = labels[bike.cat] || 'Colección TVS';
    el('tvsShowcaseSpecs').replaceChildren();
    [bike.cc, bike.year].filter(Boolean).forEach(value => {const tag = document.createElement('span'); tag.textContent = value; el('tvsShowcaseSpecs').append(tag);});
    el('tvsShowcaseCount').textContent = pad(index + 1) + ' / ' + pad(items.length);
    photo(el('tvsShowcaseCurrent'), bike);
    photo(el('tvsShowcasePrevious'), modelAt(-1));
    photo(el('tvsShowcaseNext'), modelAt(1));
    const previous = el('tvsShowcasePreviousButton'), next = el('tvsShowcaseNextButton');
    previous.setAttribute('aria-label', 'Ver ' + modelAt(-1).name);
    next.setAttribute('aria-label', 'Ver ' + modelAt(1).name);
    section.querySelectorAll('[data-showcase-step]').forEach(btn => btn.disabled = items.length < 2);
    previous.hidden = next.hidden = items.length < 2;
    el('tvsShowcasePlay').hidden = items.length < 2;
    el('tvsShowcasePlay').textContent = playing ? 'Ⅱ Pausar' : '▷ Reproducir';
    section.dataset.playing = String(playing);
    el('tvsShowcasePlay').setAttribute('aria-pressed', String(playing));
    el('tvsShowcasePlay').setAttribute('aria-label', playing ? 'Pausar cambio automático' : 'Activar cambio automático cada 5 segundos');
    el('tvsShowcaseDots').querySelectorAll('button').forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
      btn.setAttribute('aria-current', i === index ? 'true' : 'false');
    });
    if (animate && !reducedMotion.matches) {
      el('tvsShowcaseCopy').animate([{opacity: .2, transform: 'translateY(16px)'}, {opacity: 1, transform: 'translateY(0)'}], {duration: 420, easing: 'ease-out'});
      el('tvsShowcaseCurrent').animate([{opacity: .2, transform: 'translateY(22px) scale(.97)'}, {opacity: 1, transform: 'translateY(0) scale(1)'}], {duration: 480, easing: 'ease-out'});
    }
    queue();
  }

  function step(amount) {
    if (!items.length) return;
    index = (index + amount + items.length) % items.length;
    render();
  }

  window.gysRefreshShowcase = () => {
    const currentName = items[index]?.name;
    items = (typeof bikes === 'undefined' ? [] : bikes).filter(b => b && b.name && b.cat !== 'accesorios');
    index = Math.max(0, items.findIndex(b => b.name === currentName));
    const dots = el('tvsShowcaseDots');
    dots.replaceChildren();
    items.forEach((bike, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Mostrar ' + bike.name);
      btn.addEventListener('click', () => {index = i; render();});
      dots.append(btn);
    });
    render(false);
  };
  section.querySelectorAll('[data-showcase-step]').forEach(btn => btn.addEventListener('click', () => step(Number(btn.dataset.showcaseStep))));
  el('tvsShowcaseDetails').addEventListener('click', () => {if (items[index]) openBike(items[index].name);});
  el('tvsShowcasePlay').addEventListener('click', () => {playing = !playing; render(false);});
  section.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1);}
  });
  section.addEventListener('touchstart', event => {const point = event.touches[0]; touch = {x: point.clientX, y: point.clientY};}, {passive: true});
  section.addEventListener('touchend', event => {
    if (!touch) return;
    const point = event.changedTouches[0], dx = point.clientX - touch.x, dy = point.clientY - touch.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) step(dx < 0 ? 1 : -1);
    touch = null;
  }, {passive: true});
  document.addEventListener('visibilitychange', queue);
  reducedMotion.addEventListener('change', () => render(false));
  window.addEventListener('pagehide', () => clearTimeout(timer));
  new IntersectionObserver(entries => {visible = entries[0].isIntersecting; queue();}, {threshold: .2}).observe(section);
  window.gysRefreshShowcase();
})();
