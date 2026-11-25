/* Bharat Temple Darshan - single-page frontend (no build step, no dependencies). */
(() => {
'use strict';

// ------------------------------------------------------------------ helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const cache = new Map();
let navToken = 0;

async function api(path) {
  if (cache.has(path)) return cache.get(path);
  let res;
  try { res = await fetch(path, { headers: { Accept: 'application/json' } }); }
  catch (e) { throw new Error('Could not reach the server. Please check your connection and try again.'); }
  if (!res.ok) {
    let msg = `The server returned an error (${res.status}).`;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch (_) {}
    const err = new Error(msg); err.status = res.status; throw err;
  }
  const data = await res.json();
  if (!path.startsWith('/api/search')) cache.set(path, data);
  return data;
}
const debounce = (fn, ms = 180) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const fmt = (n) => (n == null || n === '' ? 'n/a' : Number(n).toLocaleString('en-IN'));
const qs = () => new URLSearchParams(location.search);

function setMeta(title, desc) {
  document.title = title ? `${title} | Bharat Temple Darshan` : "Bharat Temple Darshan - Explore India's Sacred Heritage";
  if (desc) $('meta[name=description]').setAttribute('content', desc);
}
const progress = {
  el: $('#progress'),
  start() { this.el.classList.add('on'); this.el.style.width = '35%'; setTimeout(() => this.el.style.width = '70%', 250); },
  done() { this.el.style.width = '100%'; setTimeout(() => { this.el.classList.remove('on'); this.el.style.width = '0'; }, 300); }
};
const loadingHtml = (msg = 'Loading...') => `<div class="loading" role="status"><div class="spinner"></div><div>${esc(msg)}</div></div>`;
const errorHtml = (title, msg, retry = true) => `<div class="wrap"><div class="error-box fade-in"><h2>${esc(title)}</h2><p>${esc(msg)}</p>
  <p>${retry ? '<button class="btn btn-gold" data-retry>Try again</button> ' : ''}<a class="btn btn-ghost" href="/" data-link>Back to home</a></p></div></div>`;
const orn = (t, sub) => `<div class="sec-head"><div class="orn"><i></i></div><h2>${esc(t)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;

// ------------------------------------------------------------------ cards
const templeCard = (t) => `<a class="card fade-in" href="/temple/${esc(t.slug)}" data-link>
  <div class="card-img"><img src="${esc(t.image)}" alt="${esc(t.name)}" loading="lazy" decoding="async" width="480" height="360"><span class="tag">${esc(t.state)}</span></div>
  <div class="card-body"><h3>${esc(t.name)}</h3><div class="loc">${esc(t.city)}</div><p>${esc(t.tagline)}</p><span class="more">View details &rarr;</span></div></a>`;
const recCard = (r, cfg) => {
  const place = r[cfg.place_col] || '';
  const type = cfg.type_col ? r[cfg.type_col] : '';
  const desc = r.Description || r['Top Tourism Highlights'] || '';
  const extra = r.Artist ? `<p><b>Artist:</b> ${esc(r.Artist)}</p>` : '';
  const region = r.region ? ` &middot; ${esc(r.region)} India` : '';
  return `<div class="rec fade-in"><h3>${esc(r[cfg.name_col])}</h3><div class="meta">${esc(place)}${place && r.State ? ', ' : ''}${esc(r.State)}${region}</div>
   ${type ? `<div><span class="pill">${esc(type)}</span></div>` : ''}<p>${esc(desc)}</p>${extra}</div>`;
};

// ------------------------------------------------------------------ map
const OUTLINE = [[74.3,37.0],[75.9,36.9],[77.8,35.5],[78.9,34.3],[78.2,32.5],[79.0,31.0],[80.2,30.5],[81.0,30.2],[80.1,28.8],[81.9,27.9],[84.1,27.4],[87.0,26.6],[88.1,26.5],[88.9,27.3],[89.8,26.8],[92.0,26.9],[94.3,28.6],[96.1,29.3],[97.3,28.2],[95.9,27.0],[96.0,26.0],[94.6,24.3],[93.4,22.9],[92.2,23.3],[92.1,24.1],[91.2,23.7],[89.8,25.2],[88.8,25.2],[88.2,24.6],[88.4,22.8],[89.0,21.7],[87.0,21.5],[86.5,20.0],[85.0,19.2],[83.0,17.3],[80.3,15.5],[80.2,13.0],[79.9,11.5],[79.3,10.3],[78.2,8.9],[77.5,8.1],[76.5,8.7],[75.7,11.3],[74.8,12.9],[74.0,15.0],[73.3,17.5],[72.8,19.5],[72.7,21.0],[72.2,21.2],[70.0,20.8],[69.0,22.3],[70.0,22.9],[68.2,23.7],[70.0,24.2],[71.0,24.6],[70.1,25.8],[69.5,26.8],[71.0,27.8],[72.8,29.5],[74.0,31.0],[74.6,32.0],[74.3,34.0],[73.4,35.0]];
const proj = (lon, lat) => [(lon - 67.5) * 17.5, (37.5 - lat) * 19];
function mapSvg({ heritage = [], temples = [], focus = null }) {
  const path = OUTLINE.map(([lo, la], i) => `${i ? 'L' : 'M'}${proj(lo, la).map((n) => n.toFixed(1)).join(' ')}`).join('') + 'Z';
  const dots = heritage.map((p, i) => { const [x, y] = proj(p.lon, p.lat);
    return `<circle class="dot${/temple/i.test(p.type) ? ' tmp' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" data-tip="${esc(p.name)} &middot; ${esc(p.place)}, ${esc(p.state)} (${esc(p.type)})"></circle>`; }).join('');
  const tm = temples.map((t) => { const [x, y] = proj(t.lon, t.lat);
    const r = focus === t.slug ? 9 : 6.5;
    return `<a href="/temple/${esc(t.slug)}" data-link aria-label="${esc(t.name)}"><circle class="tm" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" data-tip="${esc(t.name)} (${esc(t.state)})"></circle></a>`; }).join('');
  return `<div class="map-wrap"><svg class="map-svg" viewBox="0 0 540 610" role="img" aria-label="Schematic map of India with heritage sites and featured temples"><path class="out" d="${path}"></path>${dots}${tm}</svg><div class="tip"></div></div>`;
}
function wireTips(root) {
  $$('.map-wrap', root).forEach((w) => {
    const tip = $('.tip', w);
    w.addEventListener('pointermove', (e) => {
      const t = e.target.closest('[data-tip]');
      if (!t) { tip.style.display = 'none'; return; }
      const b = w.getBoundingClientRect();
      tip.textContent = t.getAttribute('data-tip');
      tip.style.display = 'block';
      tip.style.left = Math.min(e.clientX - b.left + 12, b.width - 200) + 'px';
      tip.style.top = (e.clientY - b.top + 12) + 'px';
    });
    w.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
  });
}

// ------------------------------------------------------------------ lightbox
const LB = {
  el: $('#lightbox'), img: $('#lb-img'), cap: $('#lb-caption'), spin: $('#lb-spinner'), list: [], i: 0, opener: null,
  open(list, i, opener) { this.list = list; this.i = i; this.opener = opener; this.el.hidden = false; document.body.style.overflow = 'hidden'; this.show(); $('#lb-close').focus(); },
  close() { this.el.hidden = true; document.body.style.overflow = ''; this.img.removeAttribute('src'); if (this.opener) this.opener.focus?.(); },
  show() {
    const it = this.list[this.i]; if (!it) return;
    this.spin.classList.remove('off'); this.img.style.opacity = .3;
    this.img.onload = () => { this.spin.classList.add('off'); this.img.style.opacity = 1; };
    this.img.onerror = () => { this.spin.classList.add('off'); this.cap.textContent = 'This photograph could not be loaded.'; };
    this.img.alt = it.alt; this.img.src = it.src;
    this.cap.textContent = `${it.alt}  |  ${this.i + 1} of ${this.list.length}`;
    [this.i + 1, this.i - 1].forEach((k) => { const n = this.list[(k + this.list.length) % this.list.length]; if (n) new Image().src = n.src; });
  },
  step(d) { this.i = (this.i + d + this.list.length) % this.list.length; this.show(); }
};
$('#lb-close').onclick = () => LB.close();
$('#lb-prev').onclick = () => LB.step(-1);
$('#lb-next').onclick = () => LB.step(1);
LB.el.addEventListener('click', (e) => { if (e.target === LB.el) LB.close(); });
let tx = 0, ty = 0;
LB.el.addEventListener('touchstart', (e) => { tx = e.changedTouches[0].clientX; ty = e.changedTouches[0].clientY; }, { passive: true });
LB.el.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) LB.step(dx < 0 ? 1 : -1);
  else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) LB.close();
}, { passive: true });

// ------------------------------------------------------------------ search overlay
const SO = { el: $('#search-overlay'), input: $('#search-input'), out: $('#search-results'), clear: $('#search-clear'), opener: null };
function renderSearchResults(data, q) {
  if (!q) { SO.out.innerHTML = '<div class="hint">Try &ldquo;Madurai&rdquo;, &ldquo;Kerala&rdquo;, &ldquo;Shiva&rdquo; or a temple name.</div>'; return; }
  if (!data.count) { SO.out.innerHTML = `<div class="empty"><b>No temples found for &ldquo;${esc(q)}&rdquo;</b>Check the spelling or try a city, state or temple name. <br><br><button class="btn btn-ghost btn-sm" data-clear-search>Clear search</button></div>`; return; }
  SO.out.innerHTML = `<div class="hint">${data.count} temple${data.count > 1 ? 's' : ''} found</div>` + data.results.map((t) =>
    `<a class="result-row" href="/temple/${esc(t.slug)}" data-link><img src="${esc(t.image)}" alt="" loading="lazy"><span><b>${esc(t.name)}</b><small>${esc(t.city)}, ${esc(t.state)} &middot; ${esc(t.deity)}</small></span></a>`).join('') +
    `<div class="hint"><a href="/temples?q=${encodeURIComponent(q)}" data-link>See these results on the Famous Temples page &rarr;</a></div>`;
}
const runSearch = debounce(async () => {
  const q = SO.input.value.trim();
  SO.clear.hidden = !q;
  if (!q) return renderSearchResults(null, '');
  try { const d = await api('/api/search?q=' + encodeURIComponent(q)); if (SO.input.value.trim() === q) renderSearchResults(d, q); }
  catch (e) { SO.out.innerHTML = `<div class="empty"><b>Search is unavailable</b>${esc(e.message)}</div>`; }
}, 160);
function openSearch() { SO.opener = document.activeElement; SO.el.hidden = false; document.body.style.overflow = 'hidden'; SO.input.focus(); runSearch(); }
function closeSearch() { SO.el.hidden = true; document.body.style.overflow = ''; SO.opener?.focus?.(); }
$('#search-open').onclick = openSearch;
$('#search-close').onclick = closeSearch;
SO.clear.onclick = () => { SO.input.value = ''; SO.input.focus(); runSearch(); };
SO.input.addEventListener('input', runSearch);
SO.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && SO.input.value.trim()) { closeSearch(); go('/temples?q=' + encodeURIComponent(SO.input.value.trim())); } });
SO.el.addEventListener('click', (e) => { if (e.target === SO.el) closeSearch(); if (e.target.closest('[data-clear-search]')) { SO.input.value = ''; SO.input.focus(); runSearch(); } if (e.target.closest('a[data-link]')) closeSearch(); });

document.addEventListener('keydown', (e) => {
  if (!LB.el.hidden) { if (e.key === 'Escape') LB.close(); else if (e.key === 'ArrowRight') LB.step(1); else if (e.key === 'ArrowLeft') LB.step(-1); return; }
  if (!SO.el.hidden && e.key === 'Escape') { closeSearch(); return; }
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
});

// nav toggle
const navEl = $('#main-nav'), navBtn = $('#nav-toggle');
navBtn.onclick = () => { const o = navEl.classList.toggle('open'); navBtn.setAttribute('aria-expanded', o); navBtn.setAttribute('aria-label', o ? 'Close menu' : 'Open menu'); };
function closeNav() { navEl.classList.remove('open'); navBtn.setAttribute('aria-expanded', 'false'); }

// ------------------------------------------------------------------ router
const routes = [
  [/^\/$/, viewHome, 'home'],
  [/^\/india\/?$/, viewIndia, 'india'],
  [/^\/states\/?$/, viewStates, 'states'],
  [/^\/states\/([a-z0-9-]+)\/?$/, viewState, 'states'],
  [/^\/temples\/?$/, viewTemples, 'temples'],
  [/^\/temple\/([a-z0-9-]+)\/?$/, viewTemple, 'temples'],
  [/^\/about\/?$/, viewAbout, 'about'],
];
function go(url, replace = false) { history[replace ? 'replaceState' : 'pushState']({}, '', url); render(); }
async function render(restoreScroll = false) {
  const token = ++navToken;
  closeNav();
  const path = location.pathname;
  const m = routes.map(([re, fn, nav]) => [re.exec(path), fn, nav]).find((x) => x[0]);
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', !!m && a.dataset.nav === m[2]));
  if (!m) { setMeta('Page not found'); app.innerHTML = errorHtml('Page not found', 'The page you are looking for does not exist.', false); window.scrollTo(0, 0); return; }
  progress.start();
  app.innerHTML = loadingHtml();
  try {
    const html = await m[1](...m[0].slice(1).map(decodeURIComponent), () => token === navToken);
    if (token !== navToken) return;
    if (html != null) app.innerHTML = html;
    if (typeof app._after === 'function') { const f = app._after; app._after = null; f(); }
    wireTips(app);
  } catch (e) {
    if (token !== navToken) return;
    const nf = e.status === 404;
    setMeta(nf ? 'Not found' : 'Error');
    app.innerHTML = errorHtml(nf ? 'We could not find that page' : 'Something went wrong', e.message, !nf);
  } finally { if (token === navToken) progress.done(); }
  if (!restoreScroll) window.scrollTo(0, 0);
}
document.addEventListener('click', (e) => {
  const retry = e.target.closest('[data-retry]'); if (retry) { cache.clear(); render(); return; }
  const a = e.target.closest('a[data-link]');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || a.getAttribute('target') === '_blank') return;
  const u = new URL(a.getAttribute('href'), location.href);
  if (u.origin !== location.origin) return;
  e.preventDefault();
  if (u.pathname + u.search === location.pathname + location.search) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  history.pushState({}, '', u.pathname + u.search); render();
});
window.addEventListener('popstate', () => render(true));

// ------------------------------------------------------------------ live temple list (shared)
function liveTempleList(host, { q = '', state = '' } = {}, onChange) {
  const out = $('.live-out', host);
  async function draw() {
    out.innerHTML = loadingHtml('Searching...');
    try {
      const p = new URLSearchParams(); if (q) p.set('q', q); if (state) p.set('state', state);
      const d = await api('/api/temples?' + p);
      if (!d.count) {
        out.innerHTML = `<div class="empty"><b>No temples match${q ? ` &ldquo;${esc(q)}&rdquo;` : ''}${state ? ` in ${esc(state)}` : ''}</b>Try a different spelling, or clear the filters to see all ten temples.<br><br><button class="btn btn-ghost btn-sm" data-reset>Clear search and filters</button></div>`;
      } else {
        out.innerHTML = `<p class="count" aria-live="polite">Showing ${d.count} of ten temples</p><div class="grid grid-temples">${d.temples.map(templeCard).join('')}</div>`;
      }
    } catch (e) { out.innerHTML = errorHtml('Could not load temples', e.message); }
  }
  return { set(next) { if ('q' in next) q = next.q; if ('state' in next) state = next.state; draw(); onChange?.({ q, state }); }, draw, get: () => ({ q, state }) };
}

// ------------------------------------------------------------------ HOME
const HERO_SLUGS = ['golden-temple', 'meenakshi-amman', 'kedarnath', 'jagannath', 'tirumala-venkateswara'];
async function viewHome() {
  setMeta('', "Explore ten of India's most celebrated temples with photographs, history, architecture, festivals and visitor information.");
  const [stats, temples, states] = await Promise.all([api('/api/stats'), api('/api/temples'), api('/api/states')]);
  const withTemples = states.states.filter((s) => s.temple_count);
  const circuits = {};
  temples.temples.forEach((t) => t.circuits.forEach((c) => (circuits[c] ||= []).push(t)));
  const circ = Object.entries(circuits).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, 6);
  const heroes = HERO_SLUGS.map((s) => temples.temples.find((t) => t.slug === s)).filter(Boolean);
  setMeta('');
  app._after = () => {
    // hero slider
    const imgs = $$('.hero-slides img'), dots = $$('.hero-dots button'), cred = $('#hero-credit');
    let i = 0, timer;
    const show = (n) => { i = n; imgs.forEach((im, k) => im.classList.toggle('on', k === n)); dots.forEach((d, k) => d.classList.toggle('on', k === n)); cred.innerHTML = `<a href="/temple/${esc(heroes[n].slug)}" data-link>${esc(heroes[n].name)}</a>`; };
    dots.forEach((d, k) => d.onclick = () => { show(k); restart(); });
    const restart = () => { clearInterval(timer); if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => { if (!document.body.contains(imgs[0])) return clearInterval(timer); show((i + 1) % imgs.length); }, 6500); };
    show(0); restart();
    // live search section
    const host = $('#home-search'), input = $('input', host);
    const list = liveTempleList(host, {});
    list.draw();
    input.addEventListener('input', debounce(() => list.set({ q: input.value.trim() }), 150));
    host.addEventListener('click', (e) => { if (e.target.closest('[data-reset]')) { input.value = ''; list.set({ q: '' }); } });
    $('form', host).addEventListener('submit', (e) => { e.preventDefault(); list.set({ q: input.value.trim() }); });
    $('#home-search-clear').onclick = () => { input.value = ''; list.set({ q: '' }); input.focus(); };
    // famous temples carousel is static grid; states section
    const sHost = $('#home-states');
    const chips = $$('.chip', sHost), sOut = $('.live-out', sHost);
    const sList = liveTempleList(sHost, {});
    chips.forEach((c) => c.onclick = () => { chips.forEach((x) => x.classList.toggle('on', x === c)); sList.set({ state: c.dataset.state }); });
    sList.draw();
  };
  return `
<section class="hero" aria-label="Introduction">
  <div class="hero-slides">${heroes.map((t, k) => `<img src="${esc(t.hero)}" alt="${esc(t.name)}" ${k ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">`).join('')}</div>
  <div class="wrap"><div class="hero-content fade-in">
    <div class="eyebrow">Explore India's Sacred Heritage</div>
    <h1>BHARAT<span>TEMPLE DARSHAN</span></h1>
    <p class="lead">Journey through ten of India's most revered shrines: from the golden sanctum of Amritsar and the colourful gopurams of Madurai to the snow-bound stone temple of Kedarnath. Discover their history, architecture, festivals and the practical details you need to visit.</p>
    <div class="hero-cta"><a class="btn btn-gold" href="/temples" data-link>Explore Temples</a><a class="btn btn-ghost" href="/india" data-link>India Heritage Data</a></div>
  </div></div>
  <div class="hero-dots" role="group" aria-label="Hero slides">${heroes.map((t, k) => `<button type="button" aria-label="Show ${esc(t.name)}"></button>`).join('')}</div>
  <div class="hero-credit" id="hero-credit"></div>
</section>

<section class="block" id="search"><div class="wrap">
  ${orn('Search Temples', 'Search by temple name, city or state and see matching temples instantly.')}
  <div id="home-search">
    <form class="big-search" role="search"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style="color:var(--gold);flex:none"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="search" placeholder="Try Madurai, Kerala, Shiva..." aria-label="Search temples by name, city or state" autocomplete="off"><button type="button" class="btn btn-ghost btn-sm" id="home-search-clear">Clear</button></form>
    <div class="live-out"></div>
  </div>
</div></section>

<section class="block alt"><div class="wrap">
  ${orn('Explore by State', 'Choose a state to see the temples in it. This filter is applied by the server, not hard-coded.')}
  <div id="home-states">
    <div class="chips" role="group" aria-label="Filter by state"><button class="chip on" data-state="">All states<small>${temples.count}</small></button>
    ${withTemples.map((s) => `<button class="chip" data-state="${esc(s.name)}">${esc(s.name)}<small>${s.temple_count}</small></button>`).join('')}</div>
    <div class="live-out"></div>
    <p style="text-align:center;margin-top:2rem"><a class="btn btn-ghost" href="/states" data-link>Browse all ${stats.states_total} states and union territories</a></p>
  </div>
</div></section>

<section class="block"><div class="wrap">
  ${orn('Popular Pilgrimage Circuits', 'Temples grouped by the pilgrimage traditions they belong to.')}
  <div class="grid grid-3">${circ.map(([name, list]) => `<div class="card circuit"><h3>${esc(name)}</h3><div class="thumbs">${list.map((t) => `<img src="${esc(t.image)}" alt="${esc(t.name)}" loading="lazy" width="54" height="54">`).join('')}</div>
    <p class="muted" style="font-size:.95rem">${list.map((t) => `<a href="/temple/${esc(t.slug)}" data-link>${esc(t.name)}</a>`).join(', ')}</p></div>`).join('')}</div>
</div></section>

<section class="block alt"><div class="wrap">
  ${orn('Indian Cultural Heritage', 'Beyond the ten temples: explore your Indian heritage datasets of monuments, sites, museums, art forms and tourism.')}
  <div class="stat-row">
    <div class="stat"><b>${stats.temples}</b><span>Temples</span></div><div class="stat"><b>${stats.photos}</b><span>Photographs</span></div>
    <div class="stat"><b>${stats.monuments}</b><span>Monuments</span></div><div class="stat"><b>${stats.heritage}</b><span>Heritage sites</span></div>
    <div class="stat"><b>${stats.museums}</b><span>Museums</span></div><div class="stat"><b>${stats.art}</b><span>Art records</span></div>
  </div>
  <p style="text-align:center"><a class="btn btn-gold" href="/india" data-link>Explore the heritage data</a></p>
</div></section>`;
}

// ------------------------------------------------------------------ TEMPLES
async function viewTemples() {
  setMeta('Famous Temples', 'Ten famous temples of India with photographs, history and visitor information.');
  const [states] = await Promise.all([api('/api/states')]);
  const p = qs(); const q0 = p.get('q') || '', s0 = p.get('state') || '';
  const opts = states.states.filter((s) => s.temple_count);
  app._after = () => {
    const host = $('#t-list'), input = $('#f-q'), sel = $('#f-state');
    const sync = ({ q, state }) => { const u = new URLSearchParams(); if (q) u.set('q', q); if (state) u.set('state', state); history.replaceState({}, '', '/temples' + (u.toString() ? '?' + u : '')); };
    const list = liveTempleList(host, { q: q0, state: s0 }, sync);
    list.draw();
    input.addEventListener('input', debounce(() => list.set({ q: input.value.trim() }), 150));
    sel.addEventListener('change', () => list.set({ state: sel.value }));
    const reset = () => { input.value = ''; sel.value = ''; list.set({ q: '', state: '' }); };
    $('#f-clear').onclick = reset;
    host.addEventListener('click', (e) => { if (e.target.closest('[data-reset]')) reset(); });
  };
  return `<div class="page-head"><div class="wrap"><div class="crumbs"><a href="/" data-link>Home</a> / Famous Temples</div><h1>Famous Temples</h1><p>Ten celebrated shrines across India. Search by name, city or state, or filter by state.</p></div></div>
  <section class="block" style="padding-top:2rem"><div class="wrap" id="t-list">
    <div class="filters" role="search"><input id="f-q" type="search" placeholder="Search temple, city or state..." value="${esc(q0)}" aria-label="Search temples"><select id="f-state" aria-label="Filter by state"><option value="">All states</option>${opts.map((s) => `<option value="${esc(s.name)}" ${s.name === s0 ? 'selected' : ''}>${esc(s.name)} (${s.temple_count})</option>`).join('')}</select><button class="btn btn-ghost btn-sm" id="f-clear" type="button">Clear</button></div>
    <div class="live-out"></div></div></section>`;
}

// ------------------------------------------------------------------ TEMPLE DETAIL
const paras = (arr) => arr.map((x) => `<p>${esc(x)}</p>`).join('');
async function viewTemple(slug) {
  const t = await api('/api/temples/' + encodeURIComponent(slug));
  setMeta(t.name, t.summary);
  const PAGE = 24; let shown = 0;
  const drawGallery = () => {
    const host = $('#gal'); const next = t.gallery.slice(shown, shown + PAGE);
    host.insertAdjacentHTML('beforeend', next.map((g, k) => `<figure><button type="button" data-i="${shown + k}" aria-label="Open photograph ${g.n} of ${t.gallery.length}"><img src="${esc(g.thumb)}" alt="${esc(g.alt)}" width="${g.tw}" height="${g.th}" loading="lazy" decoding="async"></button></figure>`).join(''));
    shown += next.length;
    const more = $('#gal-more'); more.hidden = shown >= t.gallery.length; $('#gal-left').textContent = t.gallery.length - shown;
    $('#gal-count').textContent = `${shown} of ${t.gallery.length} photographs shown`;
  };
  app._after = () => {
    drawGallery();
    $('#gal').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) LB.open(t.gallery, +b.dataset.i, b); });
    $('#gal').addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.closest('figure')?.remove(); }, true);
    $('#gal-more button').onclick = drawGallery;
    // sub nav scroll spy
    const links = $$('.subnav a'); const secs = links.map((a) => $(a.dataset.target));
    links.forEach((a) => a.onclick = (e) => { e.preventDefault(); $(a.dataset.target).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    const spy = () => { if (!document.body.contains(secs[0])) return window.removeEventListener('scroll', spy); let cur = 0; secs.forEach((s, k) => { if (s.getBoundingClientRect().top < 180) cur = k; }); links.forEach((a, k) => a.classList.toggle('on', k === cur)); };
    window.addEventListener('scroll', spy, { passive: true }); spy();
    $('.t-hero img').addEventListener('error', (e) => { e.target.style.display = 'none'; });
  };
  const sections = [['#s-overview', 'Overview'], ['#s-history', 'History'], ['#s-arch', 'Architecture'], ['#s-sig', 'Significance'], ['#s-fest', 'Festivals'], ['#s-gallery', 'Gallery'], ['#s-related', 'Related temples']];
  const sd = t.state_stats;
  return `
<div class="t-hero"><img src="${esc(t.hero)}" alt="${esc(t.name)}" fetchpriority="high"><span class="note">Photograph with a hover zoom effect</span>
  <div class="wrap fade-in"><a class="back-link" href="/temples" data-link>&larr; Back to temples</a>
    <div class="eyebrow">${esc(t.region)}</div><h1>${esc(t.name)}</h1>
    <div class="loc">${esc(t.city)} &middot; ${esc(t.district)} &middot; ${esc(t.state)}</div></div></div>
<div class="wrap"><div class="facts">
  <div class="fact"><span>Location</span><div>${esc(t.city)}, ${esc(t.state)}</div></div>
  <div class="fact"><span>Deity / significance</span><div>${esc(t.deity)}</div></div>
  ${t.facts.map((f) => `<div class="fact"><span>${esc(f[0])}</span><div>${esc(f[1])}</div></div>`).join('')}
</div></div>
<nav class="subnav" aria-label="Page sections"><div class="wrap">${sections.map(([id, n]) => `<a href="${id}" data-target="${id}">${n}</a>`).join('')}</div></nav>
<div class="wrap t-layout"><article>
  <section id="s-overview"><h2>Overview</h2><p class="lead-p">${esc(t.summary)}</p><p>${esc(t.tagline)}</p>
    <p>${t.circuits.map((c) => `<span class="pill">${esc(c)}</span>`).join('')}</p></section>
  <section id="s-history"><h2>Historical Background</h2>
    <div class="callout"><h4>Documented history</h4>${paras(t.history.documented)}</div>
    <div class="callout tradition"><h4>Tradition and belief</h4>${paras(t.history.tradition)}</div>
    <p class="muted sans" style="font-size:.85rem">History is separated from religious tradition on purpose. Treat dates as approximate and consult the official sources listed on this page for citations.</p></section>
  <section id="s-arch"><h2>Architecture</h2>${paras(t.architecture)}</section>
  <section id="s-sig"><h2>Religious and Cultural Significance</h2>${paras(t.significance)}</section>
  <section id="s-fest"><h2>Festivals and Celebrations</h2><div class="fest">${t.festivals.map((f) => `<div class="card"><div class="card-body"><h3>${esc(f.n)}</h3><div class="when">${esc(f.w)}</div><p>${esc(f.d)}</p></div></div>`).join('')}</div></section>
  <section id="s-gallery"><h2>Photo Gallery</h2>
    <p class="muted sans" style="font-size:.9rem" id="gal-count"></p>
    <div class="gallery" id="gal"></div>
    <div class="gal-more" id="gal-more"><button class="btn btn-ghost" type="button">Show more photographs (<span id="gal-left"></span> left)</button></div>
    <p class="muted sans" style="font-size:.82rem;margin-top:1.2rem">Tap or click a photograph to enlarge it, then swipe or use the arrow keys to browse. These are individual photographs, not a 360-degree frame sequence, so no 360-degree viewer is offered.</p></section>
  <section id="s-related"><h2>Related Temples</h2><div class="grid grid-temples">${t.related.map((r) => `<a class="card" href="/temple/${esc(r.slug)}" data-link><div class="card-img"><img src="${esc(r.image)}" alt="${esc(r.name)}" loading="lazy" width="480" height="360"></div><div class="card-body"><h3>${esc(r.name)}</h3><div class="loc">${esc(r.city)}, ${esc(r.state)}</div><p>${esc(r.why)}</p></div></a>`).join('')}</div>
    <p style="margin-top:2rem"><a class="btn btn-ghost" href="/temples" data-link>&larr; Back to all temples</a></p></section>
</article>
<aside class="side">
  <div class="panel"><h4>Visitor information</h4>
    <p><b>Best time:</b> ${esc(t.visit.best_time)}</p>
    <b>Getting there</b><ul class="visit-list">${t.visit.reach.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <b>Tips</b><ul class="visit-list">${t.visit.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <a class="btn btn-gold btn-sm" href="${esc(t.visit.official.url)}" target="_blank" rel="noopener noreferrer">${esc(t.visit.official.label)} &#8599;</a>
    <p class="muted sans" style="font-size:.78rem;margin-top:.8rem">Timings, fees, dress codes and rules change. Always confirm with the official source.</p></div>
  <div class="panel"><h4>Location</h4><div class="map-box">${mapSvg({ temples: [{ slug: t.slug, name: t.name, lat: t.coords[0], lon: t.coords[1], state: t.state }], focus: t.slug })}</div>
    <p style="margin:.8rem 0 0"><a href="https://www.openstreetmap.org/?mlat=${t.coords[0]}&mlon=${t.coords[1]}#map=12/${t.coords[0]}/${t.coords[1]}" target="_blank" rel="noopener noreferrer">Open in OpenStreetMap &#8599;</a></p></div>
  <div class="panel"><h4>In ${esc(t.state)}</h4><p style="margin:0">Your datasets list ${sd.monuments} monuments, ${sd.heritage} heritage sites, ${sd.museums} museums and ${sd.art} art records for this state.</p><p style="margin:.6rem 0 0"><a href="/states/${esc(t.state_key)}" data-link>View state page &rarr;</a></p></div>
</aside></div>`;
}

// ------------------------------------------------------------------ STATES
async function viewStates() {
  setMeta('All States', 'Browse every Indian state and union territory with temples, heritage records and tourism highlights.');
  const d = await api('/api/states');
  const card = (s) => `<a class="card hover" href="/states/${esc(s.slug)}" data-link><div class="card-body"><h3>${esc(s.name)}</h3>
    ${s.temple_count ? `<div><span class="pill" style="border-color:var(--gold);color:var(--gold)">${s.temple_count} featured temple${s.temple_count > 1 ? 's' : ''}</span></div>` : ''}
    <div class="loc">${s.monuments} monuments &middot; ${s.heritage} heritage sites &middot; ${s.museums} museums &middot; ${s.art} art records</div>
    ${s.tourism ? `<p>${esc(s.tourism.highlights)}</p>` : ''}<span class="more">Explore &rarr;</span></div></a>`;
  app._after = () => {
    const input = $('#s-q'), only = $('#s-only'), out = $('#s-out');
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const items = d.states.filter((s) => (!only.checked || s.temple_count) && (!q || (s.name + ' ' + (s.tourism?.highlights || '')).toLowerCase().includes(q)));
      out.innerHTML = items.length ? `<p class="count">${items.length} of ${d.count} states and union territories</p><div class="grid grid-3">${items.map(card).join('')}</div>` : `<div class="empty"><b>No states match &ldquo;${esc(input.value)}&rdquo;</b>Try a shorter name.</div>`;
    };
    input.addEventListener('input', debounce(draw, 120)); only.addEventListener('change', draw); $('#s-clear').onclick = () => { input.value = ''; only.checked = false; draw(); }; draw();
  };
  return `<div class="page-head"><div class="wrap"><div class="crumbs"><a href="/" data-link>Home</a> / All States</div><h1>All States</h1><p>Every state and union territory in your tourism dataset, with the temples, monuments, museums and art records linked to it.</p></div></div>
  <section class="block" style="padding-top:2rem"><div class="wrap"><div class="filters"><input id="s-q" type="search" placeholder="Search states or highlights..." aria-label="Search states"><label><input type="checkbox" id="s-only"> Only states with featured temples</label><button class="btn btn-ghost btn-sm" id="s-clear" type="button">Clear</button></div><div id="s-out"></div></div></section>`;
}
async function viewState(slug) {
  const s = await api('/api/states/' + slug);
  setMeta(s.name, `Temples, monuments, museums, art and tourism in ${s.name}.`);
  const tr = s.tourism;
  const block = (title, rows, cfg) => rows.length ? `<h2 style="margin-top:2.5rem">${title} <small class="muted sans" style="font-size:.5em">(${rows.length})</small></h2><div class="grid grid-3">${rows.map((r) => recCard(r, cfg)).join('')}</div>` : '';
  return `<div class="page-head"><div class="wrap"><div class="crumbs"><a href="/" data-link>Home</a> / <a href="/states" data-link>All States</a> / ${esc(s.name)}</div><h1>${esc(s.name)}</h1>
   ${tr ? `<p>${esc(tr.highlights)}</p>` : '<p>No tourism row for this state in the dataset.</p>'}</div></div>
  <section class="block" style="padding-top:2.5rem"><div class="wrap">
   ${tr ? `<div class="stat-row"><div class="stat"><b>${fmt(tr.domestic_millions)}</b><span>Domestic arrivals (millions, as supplied)</span></div><div class="stat"><b>${fmt(tr.foreign_2023)}</b><span>Foreign arrivals (2023)</span></div></div>` : ''}
   <h2>Featured temples</h2>${s.temples.length ? `<div class="grid grid-temples">${s.temples.map(templeCard).join('')}</div>` : `<div class="empty"><b>No featured temple pages for ${esc(s.name)} yet</b>This project covers ten temples. See the records below from your heritage datasets, or <a href="/temples" data-link>browse the ten temples</a>.</div>`}
   ${block('Monuments', s.monuments, { name_col: 'Monument Name', place_col: 'Location (Village/City)', type_col: 'Type' })}
   ${block('Cultural heritage sites', s.heritage, { name_col: 'Site Name', place_col: 'Location (Village/City)', type_col: 'Type' })}
   ${block('Museums', s.museums, { name_col: 'Museum Name', place_col: 'Location(City/Town)', type_col: null })}
   ${block('Art forms and artists', s.art, { name_col: 'Art Form', place_col: 'Location (Village/City)', type_col: 'Type' })}
   <p style="margin-top:2.5rem"><a class="btn btn-ghost" href="/states" data-link>&larr; All states</a></p></div></section>`;
}

// ------------------------------------------------------------------ INDIA (datasets)
const TABS = [['overview', 'Overview & Map'], ['monuments', 'Monuments'], ['heritage', 'Cultural Heritage'], ['museums', 'Museums'], ['art', 'Art & Artists'], ['tourism', 'Tourism']];
async function viewIndia() {
  const p = qs(); let tab = TABS.some((t) => t[0] === p.get('tab')) ? p.get('tab') : 'overview';
  setMeta('India Heritage', 'Explore monuments, cultural heritage sites, museums, art forms and tourism data from your Indian heritage datasets.');
  app._after = () => {
    const body = $('#tab-body');
    const open = async (name, push = true) => {
      tab = name; $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
      if (push) history.replaceState({}, '', '/india?tab=' + name);
      body.innerHTML = loadingHtml();
      try { await ({ overview: tabOverview, tourism: tabTourism }[name] || ((b) => tabDataset(b, name)))(body); wireTips(body); }
      catch (e) { body.innerHTML = errorHtml('Could not load this section', e.message); }
    };
    $$('.tabs button').forEach((b) => b.onclick = () => open(b.dataset.tab));
    open(tab, false);
  };
  return `<div class="page-head"><div class="wrap"><div class="crumbs"><a href="/" data-link>Home</a> / India</div><h1>India Heritage Explorer</h1><p>Your original CSV datasets, shown with search, filters, charts and a map. Values are displayed as supplied.</p></div></div>
  <section class="block" style="padding-top:2rem"><div class="wrap"><div class="tabs" role="tablist">${TABS.map(([k, n]) => `<button role="tab" data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div><div id="tab-body"></div></div></section>`;
}
async function tabOverview(body) {
  const [stats, map] = await Promise.all([api('/api/stats'), api('/api/map')]);
  body.innerHTML = `<div class="stat-row">
   <div class="stat"><b>${stats.monuments}</b><span>Monuments</span></div><div class="stat"><b>${stats.heritage}</b><span>Heritage sites</span></div><div class="stat"><b>${stats.museums}</b><span>Museums</span></div><div class="stat"><b>${stats.art}</b><span>Art records</span></div><div class="stat"><b>${stats.tourism}</b><span>Tourism rows</span></div></div>
   <div class="two-col"><div><h2>Where the sites are</h2><p>Each dot is a site from <code>cultural_heritage.csv</code> that has latitude and longitude (${map.heritage.length} of ${stats.heritage} plotted). Gold markers are the ten featured temples; click one to open its page.</p>
   <div class="legend"><span><i style="background:#e8bd45"></i>Featured temples</span><span><i style="background:#e79ab0"></i>Heritage sites of type temple</span><span><i style="background:#c8a85a"></i>Other heritage sites</span></div>
   <p class="muted sans" style="font-size:.82rem">A schematic outline drawn from approximate coordinates, for orientation only. It is not an official map and does not show disputed boundaries.</p></div>
   <div class="card" style="padding:1rem">${mapSvg({ heritage: map.heritage, temples: map.temples })}</div></div>`;
}
async function tabDataset(body, name) {
  let page = 1; const state = { q: '', state: '', type: '' };
  const first = await api(`/api/datasets/${name}?per=1`);
  body.innerHTML = `<div class="filters"><input type="search" id="d-q" placeholder="Search ${esc(first.title.toLowerCase())}..." aria-label="Search"><select id="d-state" aria-label="State"><option value="">All states</option>${first.states.map((s) => `<option>${esc(s)}</option>`).join('')}</select>
   ${first.types.length ? `<select id="d-type" aria-label="Type"><option value="">All types</option>${first.types.map((s) => `<option>${esc(s)}</option>`).join('')}</select>` : ''}<button class="btn btn-ghost btn-sm" id="d-clear" type="button">Clear</button></div><div id="d-out"></div>`;
  const out = $('#d-out');
  const draw = async () => {
    const u = new URLSearchParams({ page, per: 24 }); Object.entries(state).forEach(([k, v]) => v && u.set(k, v));
    try {
      const d = await api(`/api/datasets/${name}?${u}`);
      if (!d.total) { out.innerHTML = `<div class="empty"><b>No records match your filters</b>Try removing a filter or shortening the search.<br><br><button class="btn btn-ghost btn-sm" data-dclear>Clear filters</button></div>`; return; }
      const pages = Math.ceil(d.total / d.per);
      out.innerHTML = `<p class="count">${d.total} record${d.total > 1 ? 's' : ''}</p><div class="grid grid-3">${d.rows.map((r) => recCard(r, d)).join('')}</div>
       ${pages > 1 ? `<div class="pager"><button class="btn btn-ghost btn-sm" data-pg="-1" ${page <= 1 ? 'disabled' : ''}>&larr; Previous</button><span>Page ${page} of ${pages}</span><button class="btn btn-ghost btn-sm" data-pg="1" ${page >= pages ? 'disabled' : ''}>Next &rarr;</button></div>` : ''}`;
    } catch (e) { out.innerHTML = errorHtml('Could not load records', e.message); }
  };
  const set = (k, v) => { state[k] = v; page = 1; draw(); };
  $('#d-q').addEventListener('input', debounce((e) => set('q', e.target.value.trim()), 150));
  $('#d-state').onchange = (e) => set('state', e.target.value);
  $('#d-type')?.addEventListener('change', (e) => set('type', e.target.value));
  const clear = () => { $('#d-q').value = ''; $('#d-state').value = ''; if ($('#d-type')) $('#d-type').value = ''; state.q = state.state = state.type = ''; page = 1; draw(); };
  $('#d-clear').onclick = clear;
  out.addEventListener('click', (e) => { if (e.target.closest('[data-dclear]')) clear(); const b = e.target.closest('[data-pg]'); if (b && !b.disabled) { page += +b.dataset.pg; draw(); $('#d-q').scrollIntoView({ behavior: 'smooth', block: 'center' }); } });
  draw();
}
async function tabTourism(body) {
  const d = await api('/api/tourism');
  let metric = 'domestic_millions', q = '', sortKey = 'value', dir = -1;
  body.innerHTML = `<div class="notice"><b>Data note.</b> ${esc(d.note)}</div>
   <div class="filters"><label>Chart metric <select id="t-metric" class="field"><option value="domestic_millions">Domestic arrivals (millions)</option><option value="foreign_2023">Foreign arrivals (2023)</option></select></label><input id="t-q" type="search" placeholder="Filter states..." aria-label="Filter states"></div>
   <div class="two-col" style="align-items:start"><div><h2 id="t-title"></h2><div class="bars" id="t-bars"></div><p class="muted sans" style="font-size:.82rem">&#10022; marks states with a featured temple. Select a state name to open its page.</p></div><div><h2>Data table</h2><div class="table-wrap" style="max-height:620px;overflow:auto"><table id="t-table"></table></div></div></div>`;
  const draw = () => {
    const rows = d.rows.filter((r) => !q || (r.state + ' ' + r.highlights).toLowerCase().includes(q));
    const val = (r) => r[metric]; const max = Math.max(...d.rows.map((r) => val(r) || 0));
    const top = [...rows].sort((a, b) => (val(b) || 0) - (val(a) || 0)).slice(0, 12);
    $('#t-title').textContent = `Top ${top.length}: ${metric === 'foreign_2023' ? 'foreign arrivals (2023)' : 'domestic arrivals (millions)'}`;
    $('#t-bars').innerHTML = top.length ? top.map((r) => `<div class="bar-row${r.has_temples ? ' hl' : ''}"><a class="nm" href="/states/${esc(r.slug)}" data-link>${esc(r.state)}</a><div class="bar-track"><div class="bar-fill" style="width:${max ? (val(r) / max * 100).toFixed(1) : 0}%"></div></div><span class="val">${fmt(val(r))}</span></div>`).join('') : '<div class="empty">No states match.</div>';
    const sorted = [...rows].sort((a, b) => sortKey === 'state' ? dir * a.state.localeCompare(b.state) : dir * ((a[sortKey === 'value' ? metric : sortKey] || 0) - (b[sortKey === 'value' ? metric : sortKey] || 0)));
    $('#t-table').innerHTML = `<thead><tr><th data-k="state">State</th><th data-k="domestic_millions">Domestic (M)</th><th data-k="foreign_2023">Foreign (2023)</th><th>Highlights</th></tr></thead><tbody>${sorted.map((r) => `<tr><td><a href="/states/${esc(r.slug)}" data-link>${esc(r.state)}</a></td><td>${fmt(r.domestic_millions)}</td><td>${fmt(r.foreign_2023)}</td><td>${esc(r.highlights)}</td></tr>`).join('')}</tbody>`;
  };
  $('#t-metric').onchange = (e) => { metric = e.target.value; sortKey = 'value'; dir = -1; draw(); };
  $('#t-q').addEventListener('input', debounce((e) => { q = e.target.value.trim().toLowerCase(); draw(); }, 120));
  $('#t-table').addEventListener('click', (e) => { const th = e.target.closest('th[data-k]'); if (!th) return; if (sortKey === th.dataset.k) dir *= -1; else { sortKey = th.dataset.k; dir = sortKey === 'state' ? 1 : -1; } draw(); });
  draw();
}

// ------------------------------------------------------------------ ABOUT
async function viewAbout() {
  setMeta('About', 'About the Bharat Temple Darshan project: sources, method, image curation and technology.');
  const s = await api('/api/stats');
  return `<div class="page-head"><div class="wrap"><div class="crumbs"><a href="/" data-link>Home</a> / About</div><h1>About Bharat Temple Darshan</h1><p>A B.Tech college project exploring India's sacred heritage.</p></div></div>
  <section class="block" style="padding-top:2rem"><div class="wrap prose">
  <h2>What this website is</h2><p>Bharat Temple Darshan presents ${s.temples} celebrated temples and shrines with photographs, history, architecture, festivals and visitor information, together with an explorer for the heritage datasets from the original Indian Heritage project (${s.monuments} monuments, ${s.heritage} cultural heritage sites, ${s.museums} museums, ${s.art} art records and ${s.tourism} tourism rows).</p>
  <h2>Photographs</h2><ul><li>${s.photos} photographs from the supplied image collection are shown, each only on the page of the temple whose folder it came from.</li>
  <li>The supplied folders held 904 files. Near-duplicates, images with advertising or watermark overlays, collages, and photographs that show a different building were left out of the galleries. For example, in the Kashi Vishwanath folder many photographs show the separate Vishwanath Temple at Banaras Hindu University, so only photographs of the Kashi Vishwanath complex and its sanctum are used.</li>
  <li>Photographs were resized to WebP for fast loading and are loaded lazily. The original files were not modified.</li>
  <li>The collection contains individual photographs, not genuine 360-degree frame sequences, so no 360-degree viewer is shown. Photographs keep a gentle hover zoom, described on the page as a visual effect.</li></ul>
  <h2>Content and accuracy</h2><p>Each temple page separates documented history (inscriptions, records, named patrons) from religious tradition and legend. Dates and attributions are given only where they are widely established, and uncertain points are marked as such. Timings, fees, bookings, dress codes and access rules change often, so each page links to the managing organisation's official website. For a formal report, please verify and cite primary and scholarly sources such as the Archaeological Survey of India, temple trusts and published histories.</p>
  <h2>Datasets</h2><p>The five original CSV files are included unchanged. State names are matched across files so that, for example, &ldquo;Jammu &amp; Kashmir&rdquo; and &ldquo;Jammu and Kashmir&rdquo; refer to the same state. The tourism file does not state a year for domestic arrivals and some values look unusual, so a data note is displayed beside the charts.</p>
  <h2>Technology</h2><ul><li>Backend: Python and Flask, providing a JSON API and serving the pages.</li><li>Frontend: plain HTML, CSS and JavaScript with client-side routing (browser back and forward buttons work).</li><li>No database is used; data comes from the CSV and JSON files in the <code>data</code> folder.</li></ul>
  <p style="margin-top:2rem"><a class="btn btn-gold" href="/temples" data-link>Explore the temples</a></p></div></section>`;
}

render();
})();
