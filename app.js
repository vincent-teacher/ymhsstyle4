/* ============================================================
   楊梅高中梅岡風 — 網站主程式
   資料來源：data/issues.js（期別、版面、標題）、data/text.js（OCR 全文）
   皆由 tools/build.py 自動產生；新增期別只要放圖片再執行 更新網站.bat
   ============================================================ */
(function () {
  'use strict';

  const ISSUES = (window.MGF_ISSUES || []).slice().sort((a, b) => a.no - b.no);
  const BY_NO = new Map(ISSUES.map(i => [i.no, i]));
  const PAGES = [];
  ISSUES.forEach(i => i.pages.forEach(p => { p.issue = i; PAGES.push(p); }));
  const BY_KEY = new Map(PAGES.map(p => [p.k, p]));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const app = $('#app');
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CN_MONTH = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  const thumb = p => `img/thumb/${p.k}.webp`;
  const webimg = p => `img/web/${p.k}.webp`;
  const orig = p => `../梅岡風/${encodeURIComponent(p.src)}`;
  const issueDate = i => i.year ? `${i.year} 年${i.month ? ' ' + i.month + ' 月' : ''}` : '年份未詳';
  const semester = i => i.year && i.month ? (i.month >= 8 || i.month <= 1 ? '上學期' : '下學期') : '';

  /* ---------- 版別配色 ---------- */
  const SEC_COLOR = { '學校要聞': '#e3263a', '藝智園': '#9c65b9', '生活與休閒': '#16a394', '多元學習': '#3b8edb', '擲地有聲': '#f07c2b' };
  const EXTRA = ['#d4418e', '#0ea5b7', '#c08400', '#6d5bd0', '#2f9e44'];
  const secColor = s => SEC_COLOR[s] || EXTRA[[...(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % EXTRA.length];
  const ISSUE_COLORS = ['#9c65b9', '#e3263a', '#16a394', '#f4b400', '#3b8edb', '#f07c2b', '#d4418e'];
  const issueColor = i => ISSUE_COLORS[i.no % ISSUE_COLORS.length];
  const SEC_ICON = { '學校要聞': '📰', '藝智園': '🎨', '生活與休閒': '☕', '多元學習': '🧪', '擲地有聲': '✍️' };
  const secIcon = s => SEC_ICON[s] || '🌸';

  /* ---------- 本機儲存（失敗時仍可運作） ---------- */
  const KEY = 'mgf-v1';
  let S = {};
  try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
  const DEF_SET = { sound: true, petals: true, big: false, dark: false, motion: false, contrast: false, panel: false };
  S.set = Object.assign({}, DEF_SET, S.set || {});
  S.read = S.read || {}; S.fav = S.fav || []; S.hist = S.hist || []; S.badges = S.badges || {};
  S.cnt = Object.assign({ search: 0, random: 0, gameBest: 0, games: 0 }, S.cnt || {});
  S.flags = S.flags || {};
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 私密模式 */ } }

  /* ============================================================
     音效（Web Audio 即時合成，不需外部音檔）
     ============================================================ */
  const Sfx = {
    ctx: null,
    ac() {
      if (!S.set.sound) return null;
      if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    tone(f, dur, type = 'sine', vol = .15, delay = 0, f2) {
      const c = this.ac(); if (!c) return;
      const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .05);
    },
    noise(dur, f1, f2, vol = .2, delay = 0, type = 'bandpass') {
      const c = this.ac(); if (!c) return;
      const t = c.currentTime + delay, n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5);
      const s = c.createBufferSource(); s.buffer = buf;
      const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = 1.2;
      fl.frequency.setValueAtTime(f1, t); fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
      const g = c.createGain(); g.gain.value = vol;
      s.connect(fl).connect(g).connect(c.destination); s.start(t);
    },
    click() { this.tone(700, .07, 'triangle', .12); this.tone(1050, .06, 'triangle', .07, .03); },
    pop() { this.tone(420, .12, 'sine', .16, 0, 880); },
    flip() { this.noise(.28, 3500, 700, .35); this.tone(180, .08, 'sine', .05, .18); },
    whoosh() { this.noise(.5, 400, 2400, .18, 0, 'lowpass'); },
    chime() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .6, 'sine', .1, i * .08)); },
    right() { [659, 880, 1175].forEach((f, i) => this.tone(f, .35, 'triangle', .13, i * .09)); },
    wrong() { this.tone(260, .3, 'sawtooth', .07, 0, 140); this.tone(200, .3, 'square', .04, .12, 110); },
    badge() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, .5, 'triangle', .11, i * .07)); this.noise(.6, 6000, 9000, .06, .35, 'highpass'); },
    wind() { this.noise(1.4, 300, 900, .12, 0, 'bandpass'); [1568, 2093, 1760].forEach((f, i) => this.tone(f, 1.2, 'sine', .04, .3 + i * .22)); },
    tick() { this.tone(1400, .03, 'square', .04); }
  };
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-sfx]');
    if (t) Sfx[t.dataset.sfx] && Sfx[t.dataset.sfx]();
    else if (e.target.closest('a,button') && !e.target.closest('.reader, .opt, .switch')) Sfx.click();
  });

  /* ============================================================
     飄落梅花
     ============================================================ */
  const Petals = (() => {
    const cv = $('#petals'), cx = cv.getContext('2d');
    let W, H, list = [], raf = 0, wind = 0, windT = 0;
    const COLORS = ['#f7a8c0', '#e3263a', '#ffd1dc', '#c89ce0', '#ffffff', '#f48fb1'];
    function size() { W = cv.width = innerWidth * devicePixelRatio; H = cv.height = innerHeight * devicePixelRatio; }
    function make(y) {
      return { x: Math.random() * W, y: y == null ? Math.random() * H : y, r: (6 + Math.random() * 9) * devicePixelRatio,
        vy: (.4 + Math.random() * .9) * devicePixelRatio, vx: (Math.random() - .5) * .6, a: Math.random() * 6.28,
        va: (Math.random() - .5) * .04, ph: Math.random() * 6.28, c: COLORS[Math.random() * COLORS.length | 0], o: .45 + Math.random() * .45, flower: Math.random() < .35 };
    }
    function draw(p) {
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a); cx.globalAlpha = p.o; cx.fillStyle = p.c;
      if (p.flower) {
        for (let i = 0; i < 5; i++) { cx.rotate(1.2566); cx.beginPath(); cx.ellipse(0, -p.r * .55, p.r * .42, p.r * .55, 0, 0, 6.28); cx.fill(); }
        cx.fillStyle = '#f4b400'; cx.beginPath(); cx.arc(0, 0, p.r * .2, 0, 6.28); cx.fill();
      } else {
        cx.beginPath(); cx.moveTo(0, -p.r); cx.bezierCurveTo(p.r * .8, -p.r * .6, p.r * .6, p.r * .6, 0, p.r);
        cx.bezierCurveTo(-p.r * .6, p.r * .6, -p.r * .8, -p.r * .6, 0, -p.r); cx.fill();
      }
      cx.restore();
    }
    function loop(t) {
      cx.clearRect(0, 0, W, H);
      windT += .005; const w = Math.sin(windT) * .6 + wind; wind *= .96;
      for (const p of list) {
        p.ph += .02; p.y += p.vy; p.x += p.vx + Math.sin(p.ph) * .5 + w * devicePixelRatio; p.a += p.va + w * .01;
        if (p.y > H + 30 || p.x < -60 || p.x > W + 60) Object.assign(p, make(-20), p.x < -60 ? { x: W + 20 } : p.x > W + 60 ? { x: -20 } : {});
        draw(p);
      }
      raf = requestAnimationFrame(loop);
    }
    function on() {
      const want = S.set.petals && !S.set.motion && !document.hidden && $('#reader').hidden;
      if (want && !raf) { size(); if (!list.length) list = Array.from({ length: innerWidth < 700 ? 16 : 30 }, () => make()); raf = requestAnimationFrame(loop); cv.style.display = ''; }
      if (!want && raf) { cancelAnimationFrame(raf); raf = 0; cx.clearRect(0, 0, W, H); cv.style.display = 'none'; }
      if (!want) cv.style.display = 'none';
    }
    addEventListener('resize', () => raf && size());
    document.addEventListener('visibilitychange', on);
    let lx = 0;
    addEventListener('mousemove', e => { const dx = e.clientX - lx; lx = e.clientX; wind += Math.max(-1, Math.min(1, dx / 80)) * .15; });
    function burst(x, y) {
      if (!raf) return;
      for (let i = 0; i < 14; i++) { const p = make(y * devicePixelRatio); p.x = x * devicePixelRatio; p.vx = (Math.random() - .5) * 8; p.vy = (Math.random() * 2 + .5) * devicePixelRatio; list.push(p); }
      setTimeout(() => list.splice(0, 14), 9000);
    }
    return { on, burst, gust() { wind += 4; } };
  })();

  /* ============================================================
     設定
     ============================================================ */
  const SETTINGS = [
    ['sound', '🔊', '音效', '按鈕、翻頁、答題時播放音效'],
    ['petals', '🌸', '梅花飄落', '背景飄落的梅花動畫'],
    ['big', '🔠', '大字模式', '放大全站文字，閱讀更輕鬆'],
    ['dark', '🌙', '深色模式', '夜間閱讀較不刺眼'],
    ['motion', '🐢', '減少動態', '關閉大部分動畫效果'],
    ['contrast', '◐', '高對比文字', '加深次要文字的顏色'],
    ['panel', '📝', '閱讀時顯示文字面板', '開啟版面時自動顯示辨識文字']
  ];
  function applySettings() {
    const r = document.documentElement;
    r.dataset.theme = S.set.dark ? 'dark' : 'light';
    r.dataset.size = S.set.big ? 'l' : 'm';
    r.dataset.motion = S.set.motion ? 'reduce' : '';
    r.dataset.contrast = S.set.contrast ? 'high' : '';
    const b = $('#btnSound'); b.classList.toggle('off', !S.set.sound);
    b.querySelector('use').setAttribute('href', S.set.sound ? '#i-sound' : '#i-mute');
    Petals.on();
  }
  function renderSettings() {
    $('#setList').innerHTML = SETTINGS.map(([k, em, t, d]) => `
      <div class="set-row"><span class="em">${em}</span><div><b>${t}</b><small>${d}</small></div>
      <button class="switch ${S.set[k] ? 'on' : ''}" data-set="${k}" role="switch" aria-checked="${!!S.set[k]}" aria-label="${t}"></button></div>`).join('');
  }
  $('#setList').addEventListener('click', e => {
    const b = e.target.closest('[data-set]'); if (!b) return;
    S.set[b.dataset.set] = !S.set[b.dataset.set]; save(); applySettings(); renderSettings(); Sfx.pop();
  });
  $('#btnSettings').onclick = () => { renderSettings(); $('#settings').hidden = false; };
  $('#settings').addEventListener('click', e => { if (e.target.id === 'settings' || e.target.closest('[data-close]')) $('#settings').hidden = true; });
  $('#setReset').onclick = () => { S.set = Object.assign({}, DEF_SET); save(); applySettings(); renderSettings(); toast('↺', '已恢復預設設定'); };
  $('#setClear').onclick = () => {
    if (!confirm('確定要清除閱讀紀錄、收藏與徽章嗎？')) return;
    S.read = {}; S.fav = []; S.hist = []; S.badges = {}; S.flags = {}; S.cnt = { search: 0, random: 0, gameBest: 0, games: 0 };
    save(); toast('🧹', '足跡已清除'); route();
  };
  $('#btnSound').onclick = () => { S.set.sound = !S.set.sound; save(); applySettings(); if (S.set.sound) Sfx.chime(); };
  $('#btnMenu').onclick = () => $('#mainnav').classList.toggle('open');
  $('#quicksearch').onsubmit = e => { e.preventDefault(); const q = $('#qs').value.trim(); if (q) location.hash = '#/search?q=' + encodeURIComponent(q); };

  /* ---------- 通知、彩帶 ---------- */
  function toast(em, html, ms = 3200) {
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = `<span class="em">${em}</span><div>${html}</div>`;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }
  function confetti(n = 80) {
    if (S.set.motion) return;
    const cols = ['#9c65b9', '#e3263a', '#f4b400', '#16a394', '#3b8edb', '#f7a8c0'];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i'); c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length];
      c.style.setProperty('--dx', (Math.random() - .5) * 300 + 'px');
      c.style.animationDuration = 2 + Math.random() * 2.5 + 's'; c.style.animationDelay = Math.random() * .5 + 's';
      c.style.borderRadius = Math.random() < .5 ? '50%' : '2px';
      document.body.appendChild(c); setTimeout(() => c.remove(), 5500);
    }
  }

  /* ============================================================
     徽章
     ============================================================ */
  const readCount = () => Object.keys(S.read).length;
  const issuesTouched = () => new Set(Object.keys(S.read).map(k => +k.split('-')[0])).size;
  const MAIN_SECS = ['學校要聞', '藝智園', '生活與休閒', '多元學習', '擲地有聲'];
  const BADGES = [
    ['first', '🌸', '初來乍到', '翻開第一個版面', () => readCount() >= 1],
    ['r10', '📖', '小書蟲', '閱讀 10 個版面', () => readCount() >= 10],
    ['r50', '📚', '閱讀達人', '閱讀 50 個版面', () => readCount() >= 50],
    ['allIssues', '🏛️', '梅岡史官', '每一期都至少讀過一版', () => issuesTouched() >= ISSUES.length],
    ['allPages', '👑', '全刊制霸', '讀完全部版面', () => readCount() >= PAGES.length],
    ['secs', '🌈', '版面巡禮', '五大版別都讀過', () => MAIN_SECS.every(s => Object.keys(S.read).some(k => BY_KEY.get(k) && BY_KEY.get(k).sec === s))],
    ['search', '🔍', '搜尋偵探', '進行 10 次全文搜尋', () => S.cnt.search >= 10],
    ['time', '⏳', '時光旅人', '走訪時光軸', () => S.flags.timeline],
    ['game', '🎯', '神準猜題王', '猜年份單局獲得 60 分以上', () => S.cnt.gameBest >= 60],
    ['fav', '❤️', '收藏家', '收藏 5 個版面', () => S.fav.length >= 5],
    ['owl', '🦉', '夜貓讀者', '在晚上 10 點後閱讀', () => S.flags.owl],
    ['dice', '🎲', '隨緣翻閱', '使用「隨機翻一版」5 次', () => S.cnt.random >= 5],
    ['zoom', '🔭', '放大鏡', '把版面放大到 400%', () => S.flags.zoom]
  ];
  function checkBadges() {
    let got = 0;
    for (const [id, em, name, , test] of BADGES) {
      if (!S.badges[id] && test()) {
        S.badges[id] = Date.now(); got++;
        setTimeout(() => { toast(em, `<b>獲得徽章：${name}</b><br><small>到「我的足跡」看看吧！</small>`, 4200); Sfx.badge(); confetti(60); }, 400 + got * 900);
      }
    }
    if (got) save();
  }

  /* ============================================================
     OCR 全文載入與搜尋
     ============================================================ */
  let textReady = null;
  function loadText() {
    if (textReady) return textReady;
    textReady = new Promise(res => {
      if (window.MGF_TEXT) return res(window.MGF_TEXT);
      const m = document.querySelector('meta[name=mgf-text]');
      const s = document.createElement('script'); s.src = m ? m.content : 'data/text.js';
      s.onload = () => res(window.MGF_TEXT || {}); s.onerror = () => res({});
      document.head.appendChild(s);
    });
    return textReady;
  }
  // 異體字、OCR 常見誤字的一對一對應（保持字串長度不變）
  const VARIANT = { '閲': '閱', '啓': '啟', '悦': '悅', '説': '說', '爲': '為', '衞': '衛', '峯': '峰', '綫': '線', '眞': '真', '裏': '裡', '着': '著', '台': '臺', '銹': '鏽', '麪': '麵', '竸': '競', '夲': '本', '敎': '教', '内': '內', '彥': '彦', '兑': '兌', '税': '稅', '脱': '脫', '鋭': '銳', '温': '溫', '録': '錄', '縁': '緣', '黄': '黃', '査': '查', '横': '橫', '緑': '綠', '奬': '獎', '団': '團', '学': '學', '国': '國', '会': '會', '体': '體', '长': '長' };
  const norm = s => s.replace(/[\s　]/g, '').replace(/./g, c => VARIANT[c] || c).toLowerCase();
  let IDX = null;
  function buildIndex(T) {
    if (IDX) return IDX;
    IDX = [];
    for (const p of PAGES) {
      const L = T[p.k] || []; let s = '', starts = [];
      for (const l of L) { starts.push(s.length); s += l[0].replace(/[\s　]/g, ''); }   // 去空白，讓 raw 與 n 的字元位置一一對應
      IDX.push({ p, L, raw: s, n: norm(s), starts });
    }
    return IDX;
  }
  function lineAt(e, pos) { let lo = 0, hi = e.starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (e.starts[m] <= pos) lo = m; else hi = m - 1; } return lo; }
  function searchAll(q) {
    const terms = q.split(/[\s,，]+/).map(norm).filter(Boolean);
    if (!terms.length || !IDX) return [];
    const out = [];
    for (const e of IDX) {
      if (!terms.every(t => e.n.includes(t))) continue;
      const hits = [];
      for (const t of terms) {
        let i = e.n.indexOf(t);
        while (i >= 0 && hits.length < 60) { hits.push([i, i + t.length]); i = e.n.indexOf(t, i + t.length); }
      }
      hits.sort((a, b) => a[0] - b[0]);
      out.push({ p: e.p, e, hits });
    }
    return out;
  }
  function snippet(r, max = 3) {
    const seen = new Set(), out = [];
    for (const [a, b] of r.hits) {
      const li = lineAt(r.e, a); if (seen.has(li)) continue; seen.add(li);
      const s0 = Math.max(0, a - 22), s1 = Math.min(r.e.raw.length, b + 22);
      let html = '', cur = s0;
      for (const [x, y] of r.hits) {
        if (y <= s0 || x >= s1 || x < cur) continue;
        html += esc(r.e.raw.slice(cur, x)) + '<mark>' + esc(r.e.raw.slice(x, y)) + '</mark>'; cur = y;
      }
      html += esc(r.e.raw.slice(cur, s1));
      out.push((s0 > 0 ? '…' : '') + html + (s1 < r.e.raw.length ? '…' : ''));
      if (out.length >= max) break;
    }
    return out;
  }
  function hitBoxes(e, hits) {
    const boxes = [];
    for (const [a, b] of hits) {
      const l0 = lineAt(e, a), l1 = lineAt(e, Math.max(a, b - 1));
      for (let li = l0; li <= l1; li++) {
        const L = e.L[li], st = e.starts[li], len = ((e.starts[li + 1] != null ? e.starts[li + 1] : e.raw.length) - st) || 1;
        const ca = Math.max(0, a - st), cb = Math.min(len, b - st);
        const w = L[3] - L[1];
        boxes.push([L[1] + w * ca / len - 2, L[2] - 3, L[1] + w * cb / len + 2, L[4] + 3]);
      }
    }
    return boxes;
  }

  /* ============================================================
     路由
     ============================================================ */
  function parseHash() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const [path, qs] = h.split('?');
    const q = {}; (qs || '').split('&').forEach(kv => { if (!kv) return; const [k, v = ''] = kv.split('='); q[k] = v; });
    return { parts: path.split('/').filter(Boolean), q };
  }
  let lastView = '';
  function route() {
    const { parts, q } = parseHash();
    const v = parts[0] || 'home';
    if (v === 'read') {
      const no = +parts[1], pg = +parts[2] || 1;
      if (lastView !== 'issue/' + no) renderView('issue', [no], q);
      Reader.open(no, pg, q.q || '');
      return;
    }
    Reader.close(true);
    renderView(v, parts.slice(1), q);
  }
  function renderView(v, args, q) {
    const views = { home: vHome, issues: vIssues, issue: vIssue, search: vSearch, timeline: vTimeline, game: vGame, me: vMe, help: vHelp, sec: vSec };
    const fn = views[v] || vHome;
    lastView = v + (args[0] ? '/' + args[0] : '');
    $$('.mainnav a').forEach(a => a.classList.toggle('on', a.dataset.nav === (v === 'issue' || v === 'sec' ? 'issues' : v)));
    $('#mainnav').classList.remove('open');
    app.innerHTML = '';
    app.className = '';
    fn(args, q);
    void app.offsetWidth; app.className = 'view-enter';
    observeReveal();
    scrollTo({ top: 0, behavior: 'instant' });
  }
  addEventListener('hashchange', route);

  let io;
  function observeReveal() {
    if (io) io.disconnect();
    io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -40px 0px' });
    $$('.reveal, .tl-item', app).forEach(el => io.observe(el));
  }

  /* ---------- 共用元件 ---------- */
  function issueCard(i) {
    const p1 = i.pages[0], readN = i.pages.filter(p => S.read[p.k]).length, fav = i.pages.some(p => S.fav.includes(p.k));
    return `<a class="icard reveal" href="#/issue/${i.no}" style="--c:${issueColor(i)}">
      <div class="cover"><img loading="lazy" src="${thumb(p1)}" alt="梅岡風第${i.no}期封面">
        <span class="no">No.${pad(i.no)}</span>${readN ? `<span class="seen">已讀 ${readN}/${i.pages.length}</span>` : ''}
        ${fav ? '<svg class="ic fav"><use href="#i-heart"/></svg>' : ''}</div>
      <div class="meta"><b>第 ${i.no} 期</b><small>${issueDate(i)}${i.title ? '・' + esc(i.title) : ''}・${i.pages.length} 個版面</small>
        <div class="dots">${i.pages.map(p => `<i class="${S.read[p.k] ? 'r' : ''}" title="第${p.p}版 ${esc(p.sec)}"></i>`).join('')}</div></div></a>`;
  }
  function randomPage() {
    S.cnt.random++; save();
    const unread = PAGES.filter(p => !S.read[p.k]);
    const pool = unread.length ? unread : PAGES;
    const p = pool[Math.random() * pool.length | 0];
    Sfx.whoosh(); location.hash = `#/read/${p.issue.no}/${p.p}`;
  }
  function countUp(el) {
    const to = +el.dataset.to, t0 = performance.now(), dur = S.set.motion ? 1 : 1400;
    const step = t => { const k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString(); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    setTimeout(() => { el.textContent = to.toLocaleString(); }, dur + 300);   // 背景分頁不跑動畫時也顯示正確數字
  }

  /* ============================================================
     首頁
     ============================================================ */
  function vHome() {
    const latest = ISSUES[ISSUES.length - 1], first = ISSUES[0];
    const years = ISSUES.filter(i => i.year).map(i => i.year);
    const span = years.length ? Math.max(...years) - Math.min(...years) + 1 : 0;
    const day = Math.floor(Date.now() / 864e5), daily = PAGES[(day * 37) % PAGES.length];
    const last = S.hist[0] && BY_KEY.get(S.hist[0]);
    const secs = {}; PAGES.forEach(p => { if (p.sec) secs[p.sec] = (secs[p.sec] || 0) + 1; });
    const secList = Object.entries(secs).sort((a, b) => b[1] - a[1]);
    const n = latest.pages.length;
    app.innerHTML = `
    <section class="hero" id="hero">
      <div class="hero-left">
        <span class="hero-badge"><img src="assets/emblem.png" alt="">國立楊梅高級中學 校刊</span>
        <div class="hero-logo-wrap"><img class="hero-logo" src="assets/梅岡風Logo.png" alt="梅岡風"><span class="hero-brush"></span></div>
        <h1>楊梅高中梅岡風</h1>
        <p>從 ${first.year || ''} 年第 ${first.no} 期到 ${latest.year || ''} 年第 ${latest.no} 期，<br>一起翻閱梅岡校園 ${span} 年來的點點滴滴。</p>
        <div class="hero-actions">
          <a class="btn gold" href="#/read/${latest.no}/1" data-sfx="flip"><svg class="ic"><use href="#i-book"/></svg>閱讀最新一期</a>
          <button class="btn ghost" id="btnRandom"><svg class="ic"><use href="#i-dice"/></svg>隨機翻一版</button>
          ${last ? `<a class="btn ghost" href="#/read/${last.issue.no}/${last.p}">繼續閱讀 第${last.issue.no}期</a>` : ''}
        </div>
      </div>
      <div class="hero-right"><div class="fan" id="fan">
        ${latest.pages.map((p, i) => `<a href="#/read/${latest.no}/${p.p}" data-sfx="flip" style="z-index:${i};--i:${i}" title="第${p.p}版 ${esc(p.sec)}"><img src="${thumb(p)}" alt="第${latest.no}期第${p.p}版"></a>`).join('')}
      </div><div class="hero-stamp"><span>最新<b>${latest.no}</b>期</span></div></div>
      <svg class="wind" viewBox="0 0 1200 80" preserveAspectRatio="none"><path d="M0 40 C200 0 400 80 600 40 S1000 0 1200 40"/><path d="M0 60 C250 20 450 90 700 50 S1050 20 1200 55"/><path d="M0 20 C150 50 380 0 620 30 S980 60 1200 20"/></svg>
    </section>

    <div class="stats">
      <div class="stat reveal" style="--c:var(--plum)"><svg class="ic"><use href="#i-book"/></svg><div><b data-to="${ISSUES.length}">0</b><span>期校刊</span></div></div>
      <div class="stat reveal" style="--c:var(--purple)"><svg class="ic"><use href="#i-grid"/></svg><div><b data-to="${PAGES.length}">0</b><span>個版面</span></div></div>
      <div class="stat reveal" style="--c:var(--teal)"><svg class="ic"><use href="#i-clock"/></svg><div><b data-to="${span}">0</b><span>年的校園記憶</span></div></div>
      <div class="stat reveal" style="--c:var(--gold)"><svg class="ic"><use href="#i-text"/></svg><div><b data-to="0" id="charCount">0</b><span>個可搜尋文字</span></div></div>
    </div>

    <div class="sec-title reveal"><svg class="ic"><use href="#i-star"/></svg><h2>今日一版</h2><span class="muted">每天換一個版面</span></div>
    <div class="panel daily reveal">
      <img src="${thumb(daily)}" alt="今日一版" id="dailyImg">
      <div>
        <span class="chip" style="background:${secColor(daily.sec)};color:#fff">${secIcon(daily.sec)} ${esc(daily.sec || '版面')}</span>
        <h3 style="margin-top:10px">第 ${daily.issue.no} 期・第 ${daily.p} 版</h3>
        <p class="muted">${issueDate(daily.issue)} ${semester(daily.issue)}</p>
        ${daily.heads.length ? `<ul>${daily.heads.slice(0, 4).map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        <a class="btn purple" href="#/read/${daily.issue.no}/${daily.p}" data-sfx="flip">打開這一版</a>
      </div>
    </div>

    <div class="sec-title reveal"><svg class="ic"><use href="#i-list"/></svg><h2>版別專欄</h2><span class="muted">依版面主題瀏覽</span></div>
    <div class="secgrid">${secList.map(([s, c]) => `<button class="secbtn reveal" style="--c:${secColor(s)}" data-sec="${esc(s)}"><span style="font-size:1.6rem">${secIcon(s)}</span><b>${esc(s)}</b><small>${c} 個版面</small></button>`).join('')}</div>

    <div class="sec-title reveal"><svg class="ic"><use href="#i-grid"/></svg><h2>近期出刊</h2><a class="more" href="#/issues">看全部 ${ISSUES.length} 期 →</a></div>
    <div class="issue-grid">${ISSUES.slice(-8).reverse().map(issueCard).join('')}</div>

    <div class="sec-title reveal"><svg class="ic"><use href="#i-search"/></svg><h2>熱門關鍵字</h2><span class="muted">點一下就能搜尋歷年內容</span></div>
    <div class="suggest reveal" id="hotwords"><span class="muted">載入全文中…</span></div>

    <div class="two" style="margin-top:34px">
      <a class="panel reveal" href="#/game" style="text-decoration:none;color:inherit;background:linear-gradient(135deg,var(--gold-l),var(--card))">
        <h3>🎯 猜猜哪一年？</h3><p class="muted">看版面局部，猜出是哪一年出刊的！挑戰你的梅岡記憶。</p><span class="btn gold small">開始挑戰</span></a>
      <a class="panel reveal" href="#/timeline" style="text-decoration:none;color:inherit;background:linear-gradient(135deg,var(--teal-l),var(--card))">
        <h3>⏳ 梅岡時光軸</h3><p class="muted">沿著時間線，從 ${first.year || ''} 年一路走到 ${latest.year || ''} 年。</p><span class="btn teal small">出發</span></a>
    </div>`;

    // 扇形排列最新一期
    const fanEls = $$('#fan a');
    const layout = hover => fanEls.forEach((a, i) => {
      const mid = (fanEls.length - 1) / 2, d = i - mid;
      const spread = hover != null ? (i === hover ? 0 : (i < hover ? -1 : 1) * 14) : 0;
      a.style.transform = `translate(-50%,-50%) rotate(${d * 9 + spread}deg) translateY(${Math.abs(d) * 8 - (i === hover ? 30 : 0)}px) translateX(${d * 30}px)`;
    });
    layout(null);
    fanEls.forEach((a, i) => { a.onmouseenter = () => { layout(i); Sfx.tick(); }; a.onmouseleave = () => layout(null); });

    $('#btnRandom').onclick = randomPage;
    $('#dailyImg').onclick = () => { Sfx.flip(); location.hash = `#/read/${daily.issue.no}/${daily.p}`; };
    $$('.secbtn').forEach(b => b.onclick = () => location.hash = '#/sec/' + encodeURIComponent(b.dataset.sec));
    $('#hero').addEventListener('click', e => { if (!e.target.closest('a,button')) { Petals.burst(e.clientX, e.clientY); Petals.gust(); Sfx.wind(); } });
    $$('.stat b').forEach(b => b.dataset.to !== '0' && countUp(b));

    loadText().then(T => {
      const idx = buildIndex(T);
      const cc = $('#charCount'); if (cc) { cc.dataset.to = idx.reduce((a, e) => a + e.raw.replace(/[\s\x00-\x2f\x3a-\x40]/g, '').length, 0); countUp(cc); }
      const words = ['校慶', '管樂', '繁星', '美術班', '畢業', '圖書館', '志工', '校友', '日本', '技藝競賽', '運動會', '社團', '新生', '閱讀', '環境', '科展', '英文', '桃園'];
      const hw = $('#hotwords'); if (!hw) return;
      hw.innerHTML = words.map(w => [w, idx.filter(e => e.n.includes(w)).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1])
        .map(([w, c], i) => `<a class="chip" style="font-size:${.8 + Math.min(.5, c / 120)}rem;background:${ISSUE_COLORS[i % ISSUE_COLORS.length]};color:#fff;text-decoration:none" href="#/search?q=${encodeURIComponent(w)}">${w} <small>${c}</small></a>`).join('');
    });
  }

  /* ============================================================
     歷年期刊
     ============================================================ */
  const listState = { year: 0, sort: 'desc', view: 'grid', q: '' };
  function vIssues() {
    const years = [...new Set(ISSUES.map(i => i.year).filter(Boolean))].sort();
    app.innerHTML = `
      <div class="sec-title" style="margin-top:6px"><svg class="ic"><use href="#i-grid"/></svg><h1 style="margin:0">歷年期刊</h1><span class="muted">共 ${ISSUES.length} 期、${PAGES.length} 個版面</span></div>
      <div class="toolbar">
        <input type="search" id="fq" placeholder="輸入期別或標題…" value="${esc(listState.q)}" class="grow">
        <div class="seg" id="sortSeg"><button data-v="desc">新到舊</button><button data-v="asc">舊到新</button></div>
        <div class="seg" id="viewSeg"><button data-v="grid">封面</button><button data-v="list">列表</button></div>
        <button class="btn small" id="btnRandom2"><svg class="ic"><use href="#i-dice"/></svg>隨機</button>
      </div>
      <div class="decades" id="yearChips"><button class="chip" data-y="0">全部年份</button>${years.map(y => `<button class="chip" data-y="${y}">${y}</button>`).join('')}</div>
      <div id="ilist" style="margin-top:20px"></div>`;
    const draw = () => {
      let list = ISSUES.slice();
      if (listState.year) list = list.filter(i => i.year === listState.year);
      const q = listState.q.trim();
      if (q) {
        const n = q.replace(/[第期\s]/g, '');
        list = list.filter(i => String(i.no) === n || pad(i.no) === n || String(i.year) === n || i.title.includes(q) || i.pages.some(p => p.sec.includes(q) || p.heads.some(h => h.includes(q))));
      }
      if (listState.sort === 'desc') list.reverse();
      $$('#sortSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === listState.sort));
      $$('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === listState.view));
      $$('#yearChips button').forEach(b => b.classList.toggle('on', +b.dataset.y === listState.year));
      const box = $('#ilist');
      if (!list.length) { box.innerHTML = `<div class="empty"><span class="big">🍃</span>找不到符合的期別，試試其他關鍵字吧！</div>`; return; }
      box.innerHTML = listState.view === 'grid'
        ? `<div class="issue-grid">${list.map(issueCard).join('')}</div>`
        : `<div class="issue-list">${list.map(i => `<a class="irow reveal" href="#/issue/${i.no}"><img loading="lazy" src="${thumb(i.pages[0])}" alt=""><span class="n">No.${pad(i.no)}</span>
            <div><b>${issueDate(i)} ${semester(i)}</b><div class="h">${i.pages.map(p => p.heads[0]).filter(Boolean).map(esc).join('・')}</div></div>
            <span class="chip">${i.pages.length} 版</span></a>`).join('')}</div>`;
      observeReveal();
    };
    $('#fq').oninput = e => { listState.q = e.target.value; draw(); };
    $('#sortSeg').onclick = e => { const b = e.target.closest('button'); if (b) { listState.sort = b.dataset.v; draw(); } };
    $('#viewSeg').onclick = e => { const b = e.target.closest('button'); if (b) { listState.view = b.dataset.v; draw(); } };
    $('#yearChips').onclick = e => { const b = e.target.closest('button'); if (b) { listState.year = +b.dataset.y; draw(); Sfx.pop(); } };
    $('#btnRandom2').onclick = randomPage;
    draw();
  }

  /* ---------- 單期 ---------- */
  function vIssue([no]) {
    const i = BY_NO.get(+no);
    if (!i) { app.innerHTML = `<div class="empty"><span class="big">🍂</span>找不到第 ${esc(no)} 期。<br><a href="#/issues">回歷年期刊</a></div>`; return; }
    const idx = ISSUES.indexOf(i), prev = ISSUES[idx - 1], next = ISSUES[idx + 1];
    app.innerHTML = `
      <div class="issue-head">
        <div class="bignum">${pad(i.no)}<small>期</small></div>
        <div><h1 style="margin:0">梅岡風 第 ${i.no} 期</h1>
          <p class="lead" style="margin:4px 0">${issueDate(i)} ${semester(i)}${i.guess ? '（年份為推估）' : ''}${i.title ? '・' + esc(i.title) : ''} ・ 共 ${i.pages.length} 個版面</p>
          ${i.note ? `<p class="muted">${esc(i.note)}</p>` : ''}
          <a class="btn small" href="#/read/${i.no}/1" data-sfx="flip"><svg class="ic"><use href="#i-book"/></svg>從第一版開始讀</a></div>
        <div class="issue-nav">
          ${prev ? `<a class="btn ghost small" href="#/issue/${prev.no}" data-sfx="whoosh">← 第${prev.no}期</a>` : ''}
          ${next ? `<a class="btn ghost small" href="#/issue/${next.no}" data-sfx="whoosh">第${next.no}期 →</a>` : ''}
        </div>
      </div>
      <div class="pages">${i.pages.map(p => `
        <button class="pcard reveal" data-p="${p.p}" style="--c:${secColor(p.sec)}">
          <div class="pimg"><img loading="lazy" src="${thumb(p)}" alt="第${p.p}版"><span class="ptag">第 ${p.p} 版</span></div>
          <div class="pbody"><b>${secIcon(p.sec)} ${esc(p.sec || '版面')}</b> ${S.read[p.k] ? '<span class="chip" style="background:var(--teal);color:#fff">已讀</span>' : ''} ${S.fav.includes(p.k) ? '❤️' : ''}
            ${p.heads.length ? `<ul>${p.heads.slice(0, 4).map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}</div>
        </button>`).join('')}</div>`;
    $$('.pcard').forEach(b => b.onclick = () => { Sfx.flip(); location.hash = `#/read/${i.no}/${b.dataset.p}`; });
  }

  /* ---------- 版別 ---------- */
  function vSec([name]) {
    const list = PAGES.filter(p => p.sec === name).reverse();
    app.innerHTML = `
      <div class="sec-title" style="margin-top:6px"><span style="font-size:2rem">${secIcon(name)}</span><h1 style="margin:0;color:${secColor(name)}">${esc(name)}</h1><span class="muted">${list.length} 個版面</span><a class="more" href="#/">← 回首頁</a></div>
      <div class="pages">${list.map(p => `
        <button class="pcard reveal" data-k="${p.k}" style="--c:${secColor(p.sec)}">
          <div class="pimg"><img loading="lazy" src="${thumb(p)}" alt=""><span class="ptag">第 ${p.issue.no} 期</span></div>
          <div class="pbody"><b>${issueDate(p.issue)}・第 ${p.p} 版</b>${p.heads.length ? `<ul>${p.heads.slice(0, 3).map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}</div>
        </button>`).join('') || '<div class="empty">沒有這個版別</div>'}</div>`;
    $$('.pcard').forEach(b => b.onclick = () => { const p = BY_KEY.get(b.dataset.k); Sfx.flip(); location.hash = `#/read/${p.issue.no}/${p.p}`; });
  }

  /* ============================================================
     全文搜尋
     ============================================================ */
  function vSearch(args, q) {
    const query = q.q || '';
    const years = [...new Set(ISSUES.map(i => i.year).filter(Boolean))].sort();
    const secs = [...new Set(PAGES.map(p => p.sec).filter(Boolean))];
    app.innerHTML = `
      <div class="sec-title" style="margin-top:6px"><svg class="ic"><use href="#i-search"/></svg><h1 style="margin:0">全文搜尋</h1></div>
      <p class="lead">搜尋歷年《梅岡風》版面上的文字。文字由電腦自動辨識，偶有誤字；多個關鍵字請用空白隔開。</p>
      <form class="search-box" id="sform"><svg class="ic" style="width:1.5em;height:1.5em;fill:var(--purple)"><use href="#i-search"/></svg>
        <input type="search" id="sq" value="${esc(query)}" placeholder="例如：校慶、管樂社、繁星…" autofocus>
        <button class="btn" type="submit">搜尋</button></form>
      <div class="filters">
        <label>年份 <select id="fy0" class="field"><option value="">不限</option>${years.map(y => `<option>${y}</option>`).join('')}</select></label>
        <label>到 <select id="fy1" class="field"><option value="">不限</option>${years.map(y => `<option>${y}</option>`).join('')}</select></label>
        <label>版別 <select id="fsec" class="field"><option value="">全部</option>${secs.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>
      </div>
      <div id="sres"><div class="empty"><span class="spinner" style="display:inline-block"></span><br>正在載入全文資料…</div></div>`;
    const run = () => {
      const qv = $('#sq').value.trim();
      const box = $('#sres');
      if (!qv) {
        box.innerHTML = `<div class="suggest"><span class="muted">試試看：</span>${['校慶', '畢業典禮', '管樂社', '美術班', '繁星', '圖書館', '日本', '志工', '運動會'].map(w => `<button class="chip" data-w="${w}">${w}</button>`).join('')}</div>
          <div class="empty"><span class="big">🔍</span>輸入關鍵字，找找梅岡的故事</div>`;
        $$('[data-w]', box).forEach(b => b.onclick = () => { $('#sq').value = b.dataset.w; go(); });
        return;
      }
      let res = searchAll(qv);
      const y0 = +$('#fy0').value || 0, y1 = +$('#fy1').value || 9999, sec = $('#fsec').value;
      res = res.filter(r => (!r.p.issue.year || (r.p.issue.year >= y0 && r.p.issue.year <= y1)) && (!sec || r.p.sec === sec));
      if (!res.length) { box.innerHTML = `<div class="empty"><span class="big">🍃</span>找不到「${esc(qv)}」。<br>試試較短的關鍵字，或換個說法。</div>`; Sfx.wrong(); return; }
      const total = res.reduce((a, r) => a + r.hits.length, 0);
      const byIssue = new Map(); res.forEach(r => { if (!byIssue.has(r.p.issue)) byIssue.set(r.p.issue, []); byIssue.get(r.p.issue).push(r); });
      // 各期命中數長條圖
      const cnt = ISSUES.map(i => (byIssue.get(i) || []).reduce((a, r) => a + r.hits.length, 0));
      const mx = Math.max(...cnt), bw = 1000 / ISSUES.length;
      const chart = `<svg viewBox="0 0 1000 130" preserveAspectRatio="none">${ISSUES.map((i, k) => {
        const h = cnt[k] ? 12 + (cnt[k] / mx) * 95 : 2;
        return `<rect data-no="${i.no}" x="${k * bw + 1.5}" y="${112 - h}" width="${bw - 3}" height="${h}" rx="3" fill="${cnt[k] ? issueColor(i) : 'var(--line)'}"><title>第${i.no}期（${i.year || ''}）：${cnt[k]} 處</title></rect>`;
      }).join('')}<text x="0" y="128" font-size="13" fill="currentColor">第${ISSUES[0].no}期 ${ISSUES[0].year || ''}</text><text x="1000" y="128" font-size="13" text-anchor="end" fill="currentColor">第${ISSUES[ISSUES.length - 1].no}期 ${ISSUES[ISSUES.length - 1].year || ''}</text></svg>`;
      box.innerHTML = `
        <p><b style="color:var(--plum);font-size:1.2rem">${total}</b> 處符合，分布在 <b>${byIssue.size}</b> 期、<b>${res.length}</b> 個版面。</p>
        <div class="hitchart"><b>「${esc(qv)}」在各期出現的次數</b>${chart}</div>
        <div class="results">${[...byIssue.entries()].sort((a, b) => b[0].no - a[0].no).map(([i, rs]) => `
          <div class="rgroup reveal" id="g${i.no}"><header><span class="chip" style="background:${issueColor(i)};color:#fff">No.${pad(i.no)}</span><b>第 ${i.no} 期</b><span class="muted">${issueDate(i)}</span></header>
          ${rs.map(r => `<div class="rhit" data-k="${r.p.k}"><img loading="lazy" src="${thumb(r.p)}" alt="">
            <div><span class="chip" style="background:${secColor(r.p.sec)};color:#fff">第${r.p.p}版 ${esc(r.p.sec)}</span> <small class="muted">${r.hits.length} 處</small>
            <div class="snip">${snippet(r).map(s => `<div>${s}</div>`).join('')}</div></div></div>`).join('')}</div>`).join('')}</div>`;
      $$('.rhit', box).forEach(d => d.onclick = () => { const p = BY_KEY.get(d.dataset.k); Sfx.flip(); location.hash = `#/read/${p.issue.no}/${p.p}?q=${encodeURIComponent(qv)}`; });
      $$('rect[data-no]', box).forEach(r => r.onclick = () => { const g = $('#g' + r.dataset.no); if (g) { g.scrollIntoView({ behavior: 'smooth', block: 'center' }); Sfx.pop(); } });
      observeReveal(); Sfx.chime();
    };
    const go = () => {
      const qv = $('#sq').value.trim();
      if (qv) { S.cnt.search++; save(); checkBadges(); }
      history.replaceState(null, '', '#/search' + (qv ? '?q=' + encodeURIComponent(qv) : ''));
      run();
    };
    $('#sform').onsubmit = e => { e.preventDefault(); go(); };
    ['#fy0', '#fy1', '#fsec'].forEach(s => $(s).onchange = run);
    loadText().then(T => { buildIndex(T); if (query) { S.cnt.search++; save(); checkBadges(); } run(); });
  }

  /* ============================================================
     時光軸
     ============================================================ */
  function vTimeline() {
    S.flags.timeline = 1; save(); checkBadges();
    const groups = new Map();
    ISSUES.forEach(i => { const y = i.year || '未詳'; if (!groups.has(y)) groups.set(y, []); groups.get(y).push(i); });
    let side = 0;
    app.innerHTML = `
      <div class="sec-title" style="margin-top:6px"><svg class="ic"><use href="#i-clock"/></svg><h1 style="margin:0">梅岡時光軸</h1><span class="muted">往下捲動，穿越 ${groups.size} 個年份</span></div>
      <div class="decades" id="tlJump">${[...groups.keys()].map(y => `<button class="chip" data-y="${y}">${y}</button>`).join('')}</div>
      <div class="timeline">${[...groups.entries()].map(([y, list]) => `
        <div class="tl-year" id="y${y}"><span>${y}</span></div>
        ${list.map(i => `<div class="tl-item ${side++ % 2 ? 'r' : 'l'}" style="--c:${issueColor(i)}">
          <a class="tl-card" href="#/issue/${i.no}"><img loading="lazy" src="${thumb(i.pages[0])}" alt="">
          <div><b>第 ${i.no} 期</b> <span class="chip">${i.month ? CN_MONTH[i.month] + '月號' : ''}</span>
          <ul>${i.pages.slice(0, 4).map(p => p.heads[0] ? `<li>${esc(p.heads[0])}</li>` : '').join('')}</ul></div></a></div>`).join('')}`).join('')}
      </div>`;
    $('#tlJump').onclick = e => { const b = e.target.closest('button'); if (b) { $('#y' + b.dataset.y).scrollIntoView({ behavior: 'smooth', block: 'start' }); Sfx.whoosh(); } };
  }

  /* ============================================================
     小遊戲：猜猜哪一年
     ============================================================ */
  function vGame() {
    const pool = ISSUES.filter(i => i.year && !i.guess);
    const years = [...new Set(pool.map(i => i.year))].sort();
    const G = { round: 0, score: 0, streak: 0, total: 10, cur: null, zoom: 260, hints: 0, done: false };
    app.innerHTML = `
      <div class="sec-title" style="margin-top:6px"><svg class="ic"><use href="#i-game"/></svg><h1 style="margin:0">猜猜哪一年？</h1><span class="muted">看版面局部，猜出版年份 · 一局 ${G.total} 題</span></div>
      <div class="game">
        <div class="game-stage"><div class="game-img" id="gimg"><img id="gpic" alt="版面局部"><div class="mask">🔒 報頭日期已遮住</div></div></div>
        <div class="game-side">
          <div class="scoreboard"><div>題數<b id="gRound">1</b></div><div>得分<b id="gScore">0</b></div><div>連對<b id="gStreak">0</b></div></div>
          <div class="progress"><i id="gProg" style="width:0"></i></div>
          <h3 style="margin:6px 0 0">這個版面出自哪一年？</h3>
          <div class="options" id="gOpts"></div>
          <div class="hintbar"><button class="btn ghost small" id="gHint">🔎 看大一點（-3 分）</button><button class="btn ghost small" id="gSec">💡 提示版別（-2 分）</button></div>
          <div class="game-msg" id="gMsg"></div>
          <div class="hintbar"><button class="btn purple" id="gNext" hidden>下一題 →</button><a class="btn teal small" id="gRead" hidden>閱讀這一版</a></div>
          <p class="muted" style="font-size:.85rem">最佳紀錄：<b id="gBest">${S.cnt.gameBest}</b> 分　答對得 10 分，連對 3 題以上每題再加 2 分！</p>
        </div>
      </div>`;
    const img = $('#gpic'), box = $('#gimg');
    const place = () => {
      const z = G.zoom / 100, ar = 1.3, ph = z / (G.cur.w / G.cur.h), vis = (1 / ar) / ph;
      const f = .16 + G.fy * Math.max(0, .94 - vis - .16), g = G.fx * Math.max(0, 1 - 1 / z);
      img.style.width = G.zoom + '%'; img.style.left = -g * G.zoom + '%'; img.style.top = -(f * ph * ar) * 100 + '%';
    };
    function next() {
      if (G.round >= G.total) return finish();
      G.round++; G.hints = 0; G.zoom = 260; G.fx = Math.random(); G.fy = Math.random();
      const iss = pool[Math.random() * pool.length | 0];
      G.issue = iss; G.cur = iss.pages[Math.random() * iss.pages.length | 0];
      const opts = new Set([iss.year]);
      const near = years.filter(y => y !== iss.year).sort((a, b) => Math.abs(a - iss.year) - Math.abs(b - iss.year));
      while (opts.size < 4 && near.length) opts.add(near.splice(Math.random() * Math.min(near.length, 6) | 0, 1)[0]);
      box.classList.remove('reveal'); img.src = webimg(G.cur); place();
      $('#gOpts').innerHTML = [...opts].sort(() => Math.random() - .5).map(y => `<button class="opt" data-y="${y}">${y}</button>`).join('');
      $('#gMsg').textContent = ''; $('#gNext').hidden = $('#gRead').hidden = true; $('#gHint').disabled = $('#gSec').disabled = false;
      $('#gRound').textContent = G.round; $('#gProg').style.width = (G.round - 1) / G.total * 100 + '%';
      Sfx.whoosh();
    }
    $('#gOpts').onclick = e => {
      const b = e.target.closest('.opt'); if (!b || b.disabled) return;
      const ok = +b.dataset.y === G.issue.year;
      $$('.opt').forEach(o => { o.disabled = true; if (+o.dataset.y === G.issue.year) o.classList.add('right'); });
      if (ok) {
        G.streak++; const pts = Math.max(1, 10 - G.hints) + (G.streak >= 3 ? 2 : 0); G.score += pts;
        $('#gMsg').innerHTML = `🎉 答對了！+${pts} 分${G.streak >= 3 ? `（${G.streak} 連對！）` : ''}`; Sfx.right(); if (G.streak >= 3) confetti(30);
      } else {
        G.streak = 0; b.classList.add('wrong');
        $('#gMsg').innerHTML = `😅 差一點！正確答案是 <b>${G.issue.year}</b> 年`; Sfx.wrong();
      }
      $('#gMsg').innerHTML += `<br><small class="muted">第 ${G.issue.no} 期・${issueDate(G.issue)}・第 ${G.cur.p} 版 ${esc(G.cur.sec)}</small>`;
      box.classList.add('reveal'); img.style.cssText = '';
      $('#gScore').textContent = G.score; $('#gStreak').textContent = G.streak;
      $('#gNext').hidden = false; $('#gNext').textContent = G.round >= G.total ? '看成績 🏆' : '下一題 →';
      $('#gRead').hidden = false; $('#gRead').href = `#/read/${G.issue.no}/${G.cur.p}`;
      $('#gHint').disabled = $('#gSec').disabled = true;
    };
    $('#gHint').onclick = () => { if (G.zoom <= 140) return; G.zoom -= 60; G.hints += 3; place(); Sfx.pop(); if (G.zoom <= 140) $('#gHint').disabled = true; };
    $('#gSec').onclick = () => { G.hints += 2; $('#gMsg').innerHTML = `💡 這是「${esc(G.cur.sec || '未知')}」版（第 ${G.cur.p} 版）`; $('#gSec').disabled = true; Sfx.pop(); };
    $('#gNext').onclick = next;
    function finish() {
      $('#gProg').style.width = '100%';
      const best = G.score > S.cnt.gameBest; S.cnt.games++;
      if (best) S.cnt.gameBest = G.score; save(); checkBadges();
      const rank = G.score >= 90 ? ['👑', '梅岡活字典'] : G.score >= 60 ? ['🥇', '校史小達人'] : G.score >= 30 ? ['🥈', '認真的讀者'] : ['🌱', '新生報到'];
      $('.game-side').innerHTML = `<div class="panel" style="text-align:center"><div style="font-size:4rem">${rank[0]}</div><h2>${rank[1]}</h2>
        <p style="font-size:1.3rem">本局得分 <b style="color:var(--plum);font-size:2rem">${G.score}</b> 分</p>
        ${best ? '<p>🎊 刷新個人最佳紀錄！</p>' : `<p class="muted">最佳紀錄：${S.cnt.gameBest} 分</p>`}
        <button class="btn" id="gAgain">再玩一局</button></div>`;
      $('#gAgain').onclick = () => vGame();
      Sfx.badge(); confetti(G.score >= 60 ? 120 : 40);
    }
    next();
  }

  /* ============================================================
     我的足跡
     ============================================================ */
  function vMe() {
    const n = readCount(), pct = Math.round(n / PAGES.length * 100);
    const earned = BADGES.filter(b => S.badges[b[0]]).length;
    app.innerHTML = `
      <div class="sec-title" style="margin-top:6px"><svg class="ic"><use href="#i-foot"/></svg><h1 style="margin:0">我的足跡</h1><span class="muted">紀錄只存在這台電腦的瀏覽器中</span></div>
      <div class="two">
        <div class="panel reveal"><h3>📖 閱讀進度</h3>
          <p style="font-size:1.1rem">已讀 <b style="color:var(--plum);font-size:1.6rem">${n}</b> / ${PAGES.length} 個版面（${pct}%），走訪過 <b>${issuesTouched()}</b> / ${ISSUES.length} 期</p>
          <div class="progress"><i style="width:${pct}%"></i></div>
          <p class="muted" style="margin-top:12px">搜尋 ${S.cnt.search} 次・猜年份最佳 ${S.cnt.gameBest} 分・隨機翻閱 ${S.cnt.random} 次</p>
          <button class="btn small" id="btnRandom3"><svg class="ic"><use href="#i-dice"/></svg>幫我挑一版沒讀過的</button></div>
        <div class="panel reveal"><h3>🗺️ 各期閱讀地圖</h3><p class="muted" style="margin-top:-6px;font-size:.85rem">顏色越深代表讀過越多版</p>
          <div class="heat">${ISSUES.map(i => { const r = i.pages.filter(p => S.read[p.k]).length, lv = r === 0 ? 0 : r >= i.pages.length ? 4 : Math.ceil(r / i.pages.length * 3);
            return `<a class="l${lv}" href="#/issue/${i.no}" title="第${i.no}期：已讀 ${r}/${i.pages.length}">${pad(i.no)}</a>`; }).join('')}</div></div>
      </div>
      <div class="sec-title reveal"><svg class="ic"><use href="#i-trophy"/></svg><h2>我的徽章</h2><span class="muted">${earned} / ${BADGES.length}</span></div>
      <div class="badges">${BADGES.map(([id, em, name, desc]) => `<div class="badge reveal ${S.badges[id] ? '' : 'locked'}"><div class="medal">${S.badges[id] ? em : '🔒'}</div><b>${name}</b><small>${desc}</small>
        ${S.badges[id] ? `<small style="color:var(--teal)">${new Date(S.badges[id]).toLocaleDateString('zh-TW')} 獲得</small>` : ''}</div>`).join('')}</div>
      <div class="sec-title reveal"><svg class="ic"><use href="#i-heart"/></svg><h2>我的收藏</h2></div>
      ${S.fav.length ? `<div class="pages">${S.fav.map(k => BY_KEY.get(k)).filter(Boolean).map(p => `<button class="pcard reveal" data-k="${p.k}" style="--c:${secColor(p.sec)}"><div class="pimg"><img loading="lazy" src="${thumb(p)}" alt=""><span class="ptag">第${p.issue.no}期 第${p.p}版</span></div><div class="pbody"><b>${esc(p.sec)}</b><small class="muted"> ${issueDate(p.issue)}</small></div></button>`).join('')}</div>`
        : '<div class="empty"><span class="big">💝</span>閱讀時按下 ❤ 就能收藏喜歡的版面</div>'}
      <div class="sec-title reveal"><svg class="ic"><use href="#i-clock"/></svg><h2>最近讀過</h2></div>
      ${S.hist.length ? `<div class="suggest">${S.hist.map(k => BY_KEY.get(k)).filter(Boolean).map(p => `<a class="chip" href="#/read/${p.issue.no}/${p.p}">第${p.issue.no}期 第${p.p}版・${esc(p.sec)}</a>`).join('')}</div>` : '<p class="muted">還沒有閱讀紀錄。</p>'}`;
    $$('.pcard').forEach(b => b.onclick = () => { const p = BY_KEY.get(b.dataset.k); Sfx.flip(); location.hash = `#/read/${p.issue.no}/${p.p}`; });
    $('#btnRandom3').onclick = randomPage;
  }

  /* ============================================================
     說明
     ============================================================ */
  function vHelp() {
    app.innerHTML = `
      <div class="sec-title" style="margin-top:6px"><svg class="ic"><use href="#i-help"/></svg><h1 style="margin:0">使用說明</h1></div>
      <div class="two">
        <div class="panel reveal"><h3>📖 閱讀版面</h3>
          <ul><li>點任一期封面進入該期，再點版面即可開啟閱讀器。</li>
          <li>滑鼠滾輪或雙指縮放，拖曳移動，雙擊快速放大。</li>
          <li>按 <kbd>←</kbd> <kbd>→</kbd> 翻頁，<kbd>+</kbd> <kbd>-</kbd> 縮放，<kbd>0</kbd> 符合視窗，<kbd>T</kbd> 文字面板，<kbd>F</kbd> 收藏，<kbd>Esc</kbd> 關閉。</li>
          <li>「文字」面板列出電腦辨識出的文字，點一行就會標示在版面上。</li>
          <li>「原檔」可開啟高解析原始掃描檔。</li></ul></div>
        <div class="panel reveal"><h3>🔍 全文搜尋</h3>
          <ul><li>所有版面都經過文字辨識（OCR），可以搜尋版面內文。</li>
          <li>多個關鍵字以空白隔開，會找出同時包含的版面。</li>
          <li>搜尋結果點進去，關鍵字會以黃框標示在版面上。</li>
          <li>辨識難免有誤字，找不到時可換個較短的詞。</li></ul></div>
      </div>
      <div class="sec-title reveal"><svg class="ic"><use href="#i-plus"/></svg><h2>如何新增期別（給管理者）</h2></div>
      <div class="steps">
        <div class="step reveal"><b>準備圖片</b><br>把新一期的掃描檔依規則命名：<code>梅岡風45期第1版.JPG</code>、<code>梅岡風45期第2版.JPG</code>…（副檔名可省略；超過 4 版也沒問題）。</div>
        <div class="step reveal"><b>放進資料夾</b><br>把圖片放到與本網站並列的 <code>梅岡風</code> 資料夾中。</div>
        <div class="step reveal"><b>執行更新</b><br>雙擊網站資料夾內的 <code>更新網站.bat</code>。程式只會處理新增或更動的圖片（每版約數秒），並自動辨識出刊年月、版名與標題。</div>
        <div class="step reveal"><b>（選用）修正資訊</b><br>若自動辨識的年月不正確，或想替某期加上標題、備註，可編輯 <code>data/meta.json</code>，例如：<br><code>"45": {"year": 2026, "month": 11, "title": "校慶特刊", "note": "…"}</code>，再執行一次更新。</div>
      </div>
      <p class="muted" style="margin-top:20px">本站所有圖片、圖示、音效皆為本機資源，不需連網即可使用。資料更新時間：${esc(window.MGF_BUILT || '')}</p>`;
  }

  /* ============================================================
     閱讀器
     ============================================================ */
  const Reader = (() => {
    const R = $('#reader'), stage = $('#rStage'), canvas = $('#rCanvas'), img = $('#rImg'), boxes = $('#rBoxes');
    let issue = null, page = null, sc = 1, fit = 1, x = 0, y = 0, query = '', open_ = false, loadTok = 0;
    const W = () => page.w, H = () => page.h;
    function apply() {
      canvas.style.width = W() * sc + 'px'; canvas.style.height = H() * sc + 'px';
      canvas.style.left = x + 'px'; canvas.style.top = y + 'px';
      $('#rZoomVal').textContent = Math.round(sc / fit * 100) + '%';
    }
    function clamp() {
      const sw = stage.clientWidth || innerWidth || 1000, sh = stage.clientHeight || innerHeight || 800, cw = W() * sc, ch = H() * sc;
      x = cw <= sw ? (sw - cw) / 2 : Math.min(40, Math.max(sw - cw - 40, x));
      y = ch <= sh ? (sh - ch) / 2 : Math.min(40, Math.max(sh - ch - 40, y));
    }
    function doFit(width) {
      const sw = stage.clientWidth || innerWidth || 1000, sh = stage.clientHeight || innerHeight || 800;
      fit = Math.min((sw - 24) / W(), (sh - 24) / H());
      if (width || sw < 700) fit = Math.min((sw - 16) / W(), 3 * (sh / H()));
      sc = fit; x = 0; y = sw < 700 ? 8 : 0; clamp(); if (sw < 700) y = 8; apply();
    }
    function zoomAt(ns, cx, cy) {
      ns = Math.max(fit * .5, Math.min(fit * 8, ns));
      const r = stage.getBoundingClientRect(); cx = cx == null ? r.width / 2 : cx - r.left; cy = cy == null ? r.height / 2 : cy - r.top;
      x = cx - (cx - x) * ns / sc; y = cy - (cy - y) * ns / sc; sc = ns; clamp(); apply();
      if (sc / fit >= 3.99 && !S.flags.zoom) { S.flags.zoom = 1; save(); checkBadges(); }
    }
    function title() {
      $('#rTitle').innerHTML = `<span class="chip">No.${pad(issue.no)}</span>第 ${issue.no} 期・第 ${page.p} 版　${esc(page.sec)}　<small style="opacity:.75">${issueDate(issue)}</small>`;
    }
    function strip() {
      $('#rStrip').innerHTML = issue.pages.map(p => `<button data-p="${p.p}" class="${p === page ? 'on' : ''}" title="第${p.p}版 ${esc(p.sec)}"><img src="${thumb(p)}" alt=""><span>第${p.p}版</span></button>`).join('');
      const on = $('#rStrip .on'); on && on.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
    function neighbours() {
      const all = PAGES, i = all.indexOf(page);
      return [all[i - 1], all[i + 1]];
    }
    function drawBoxes(list, cls = '') {
      boxes.innerHTML = list.map(b => `<i class="${cls}" style="left:${b[0] / 10}%;top:${b[1] / 10}%;width:${(b[2] - b[0]) / 10}%;height:${(b[3] - b[1]) / 10}%"></i>`).join('');
    }
    function focusBox(b) {
      if (!b) return;
      const tx = (b[0] + b[2]) / 2000 * W(), ty = (b[1] + b[3]) / 2000 * H();
      if (sc < fit * 2.2) sc = fit * 2.2;
      x = stage.clientWidth / 2 - tx * sc; y = stage.clientHeight / 2 - ty * sc; clamp(); apply();
    }
    function highlight() {
      boxes.innerHTML = '';
      if (!query) return;
      loadText().then(T => {
        const idx = buildIndex(T), e = idx.find(e => e.p === page); if (!e) return;
        const terms = query.split(/[\s,，]+/).map(norm).filter(Boolean), hits = [];
        terms.forEach(t => { let i = e.n.indexOf(t); while (i >= 0) { hits.push([i, i + t.length]); i = e.n.indexOf(t, i + t.length); } });
        const bx = hitBoxes(e, hits); drawBoxes(bx);
        if (bx.length) { focusBox(bx[0]); toast('🔍', `本版找到 <b>${hits.length}</b> 處「${esc(query)}」`, 2500); }
      });
    }
    function panel() {
      const P = $('#rPanel'), body = $('#rPanelBody');
      $('#rText').classList.toggle('on', !P.hidden);
      $('.reader-body').classList.toggle('panel', !P.hidden);
      if (P.hidden) return;
      body.innerHTML = '<p class="muted">載入中…</p>';
      loadText().then(T => {
        const L = T[page.k] || [];
        if (!L.length) { body.innerHTML = '<p>本版沒有辨識到文字。</p>'; return; }
        const hs = L.map(l => l[4] - l[2]).sort((a, b) => a - b), med = hs[hs.length >> 1] || 1;
        body.innerHTML = L.map((l, i) => `<p data-i="${i}" class="${l[4] - l[2] >= med * 1.8 ? 'hd' : ''}">${esc(l[0])}</p>`).join('');
      });
    }
    function show(p, dir) {
      page = p; issue = p.issue;
      const tok = ++loadTok;
      title(); strip();
      const [pv, nx] = neighbours();
      $('#rPrev').disabled = !pv; $('#rNext').disabled = !nx;
      $('#rFav').classList.toggle('on', S.fav.includes(p.k));
      $('#rOrig').href = orig(p);
      img.src = thumb(p); doFit();
      canvas.classList.remove('flip-l', 'flip-r'); void canvas.offsetWidth;
      if (dir) canvas.classList.add(dir < 0 ? 'flip-l' : 'flip-r');
      $('#rLoading').hidden = false;
      const hi = new Image(); hi.onload = () => { if (tok !== loadTok) return; img.src = hi.src; $('#rLoading').hidden = true; }; hi.onerror = () => { $('#rLoading').hidden = true; }; hi.src = webimg(p);
      if (nx) new Image().src = webimg(nx);
      // 閱讀紀錄
      S.read[p.k] = (S.read[p.k] || 0) + 1;
      S.hist = [p.k, ...S.hist.filter(k => k !== p.k)].slice(0, 20);
      const h = new Date().getHours(); if (h >= 22 || h < 5) S.flags.owl = 1;
      save(); checkBadges();
      highlight(); panel();
    }
    function go(d) {
      const [pv, nx] = neighbours(), t = d < 0 ? pv : nx; if (!t) return;
      Sfx.flip(); query = '';
      history.replaceState(null, '', `#/read/${t.issue.no}/${t.p}`);
      if (t.issue !== issue && lastView !== 'issue/' + t.issue.no) { /* 背景頁跟著換期 */ renderView('issue', [t.issue.no], {}); }
      show(t, d);
    }
    // ---- 互動 ----
    const pts = new Map(); let pinch = null, moved = false, lastTap = 0;
    stage.addEventListener('pointerdown', e => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = false; stage.classList.add('drag');
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: sc }; } });
    stage.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const [ox, oy] = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; zoomAt(pinch.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); moved = true; return; }
      const dx = e.clientX - ox, dy = e.clientY - oy; if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      x += dx; y += dy; clamp(); apply();
    });
    const up = e => {
      pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) stage.classList.remove('drag');
      if (!moved && e.type === 'pointerup') { const t = Date.now(); if (t - lastTap < 320) { zoomAt(sc / fit > 1.5 ? fit : fit * 2.5, e.clientX, e.clientY); Sfx.pop(); lastTap = 0; } else lastTap = t; }
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(sc * Math.pow(1.0018, -e.deltaY), e.clientX, e.clientY); }, { passive: false });
    addEventListener('resize', () => { if (open_ && page) { const r = sc / fit; doFit(); zoomAt(fit * r); } });
    $('#rZoomIn').onclick = () => zoomAt(sc * 1.35);
    $('#rZoomOut').onclick = () => zoomAt(sc / 1.35);
    $('#rFit').onclick = () => doFit();
    $('#rPrev').onclick = () => go(-1);
    $('#rNext').onclick = () => go(1);
    $('#rClose').onclick = () => { close(); };
    $('#rText').onclick = () => { $('#rPanel').hidden = !$('#rPanel').hidden; panel(); setTimeout(() => { const r = sc / fit; doFit(); zoomAt(fit * r); }, 30); };
    $('#rFav').onclick = () => {
      const i = S.fav.indexOf(page.k);
      if (i >= 0) { S.fav.splice(i, 1); toast('💔', '已取消收藏'); } else { S.fav.push(page.k); toast('❤️', `已收藏 第${issue.no}期 第${page.p}版`); Sfx.chime(); }
      $('#rFav').classList.toggle('on', i < 0); save(); checkBadges();
    };
    $('#rFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else R.requestFullscreen && R.requestFullscreen().catch(() => {}); };
    $('#rStrip').onclick = e => { const b = e.target.closest('button'); if (!b) return; const p = issue.pages.find(q => q.p === +b.dataset.p); if (p && p !== page) { Sfx.flip(); query = ''; history.replaceState(null, '', `#/read/${issue.no}/${p.p}`); show(p, p.p < page.p ? -1 : 1); } };
    $('#rPanelBody').onclick = e => {
      const pEl = e.target.closest('p[data-i]'); if (!pEl) return;
      $$('#rPanelBody p.on').forEach(q => q.classList.remove('on')); pEl.classList.add('on');
      const L = window.MGF_TEXT[page.k][+pEl.dataset.i], b = [L[1] - 3, L[2] - 3, L[3] + 3, L[4] + 3];
      drawBoxes([b], 'cur'); focusBox(b); Sfx.tick();
    };
    $('#rFind').oninput = e => {
      const v = norm(e.target.value);
      $$('#rPanelBody p').forEach(p => p.hidden = v && !norm(p.textContent).includes(v));
      query = e.target.value.trim(); if (query) highlight(); else boxes.innerHTML = '';
    };
    document.addEventListener('keydown', e => {
      if (!open_ || (e.target.closest && e.target.closest('input, textarea, select'))) return;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'PageUp') go(-1);
      else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') { e.preventDefault(); go(1); }
      else if (k === '+' || k === '=') zoomAt(sc * 1.35);
      else if (k === '-') zoomAt(sc / 1.35);
      else if (k === '0') doFit();
      else if (k === 't' || k === 'T') $('#rText').click();
      else if (k === 'f' || k === 'F') $('#rFav').click();
      else if (k === 'Escape') close();
    });
    function open(no, pg, q) {
      const i = BY_NO.get(no); if (!i) { location.hash = '#/issues'; return; }
      const p = i.pages.find(x => x.p === pg) || i.pages[0];
      const wasOpen = open_;
      open_ = true; R.hidden = false; document.body.classList.add('lock'); Petals.on();
      if (!wasOpen && S.set.panel) $('#rPanel').hidden = false;
      query = q || '';
      const hint = $('.reader-hint'); hint.style.animation = 'none'; void hint.offsetWidth; hint.style.animation = '';
      setTimeout(() => show(p, 0), 0);
    }
    function close(silent) {
      if (!open_) return;
      open_ = false; R.hidden = true; document.body.classList.remove('lock'); Petals.on();
      if (document.fullscreenElement) document.exitFullscreen();
      if (!silent) { location.hash = `#/issue/${issue.no}`; }
    }
    return { open, close };
  })();

  /* ---------- 回到頂端 ---------- */
  const top = document.createElement('button'); top.className = 'totop'; top.title = '回到頂端'; top.innerHTML = '<svg class="ic"><use href="#i-left"/></svg>';
  top.onclick = () => { scrollTo({ top: 0, behavior: 'smooth' }); Sfx.whoosh(); };
  document.body.appendChild(top);
  addEventListener('scroll', () => top.classList.toggle('show', scrollY > 600), { passive: true });

  /* ---------- 啟動 ---------- */
  $('#footIssues').textContent = ISSUES.length; $('#footPages').textContent = PAGES.length; $('#footBuilt').textContent = window.MGF_BUILT || '';
  applySettings();
  if (!ISSUES.length) { app.innerHTML = '<div class="empty"><span class="big">📭</span>尚未建立資料。請執行 <code>更新網站.bat</code>。</div>'; return; }
  route();
  setTimeout(loadText, 1500);
})();
