'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const TOTAL = 200, PER_SEC = 25, MARKS = 2, DURATION = 600;

  // ---------- views / routing ----------
  function show(id) {
    for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== 'v-' + id;
    scrollTo(0, 0);
  }

  // ---------- question generation (Level 3) ----------
  const rint = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const ofDigits = d => rint(d === 1 ? 1 : 10 ** (d - 1), 10 ** d - 1);

  // One spec per 25-question section: digits per row, rows, subtraction allowed
  const SECTIONS = [
    { d: [1, 1], rows: 5, neg: true },
    { d: [1, 2], rows: 5, neg: true },
    { d: [1, 2], rows: 5, neg: true },
    { d: [2, 2], rows: 4, neg: true },
    { d: [2, 2], rows: 4, neg: true },
    { d: [2, 2], rows: 4, neg: true },
    { d: [3, 3], rows: 3, neg: false },
    { d: [3, 3], rows: 3, neg: false }
  ];

  function makeQ({ d, rows, neg }) {
    const nums = [];
    let total = 0;
    for (let i = 0; i < rows; i++) {
      let n = ofDigits(rint(d[0], d[1]));
      // first row always positive; a subtraction must never take the running total below 0
      if (neg && i > 0 && Math.random() < 0.3 && total - n >= 0) n = -n;
      nums.push(n); total += n;
    }
    return { nums, answer: total };
  }
  const makePaper = () => SECTIONS.flatMap(s => Array.from({ length: PER_SEC }, () => makeQ(s)));

  // ---------- login ----------
  $('eye').onclick = () => { const p = $('pwd'); p.type = p.type === 'password' ? 'text' : 'password'; };
  $('loginForm').onsubmit = async e => {
    e.preventDefault();
    $('loginErr').hidden = true;
    try { await API.login($('loginId').value, $('pwd').value); $('pwd').value = ''; openDash(); }
    catch (err) { $('loginErr').textContent = err.message; $('loginErr').hidden = false; }
  };

  // ---------- dashboard ----------
  let user = null, history = [];
  const fmtDate = t => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  async function openDash() {
    user = API.me();
    if (!user) return show('login');
    $('uname').textContent = user.name;
    $('avatar').textContent = user.name[0].toUpperCase();
    history = await API.results(user.id);
    const max = TOTAL * MARKS;
    const best = history.reduce((m, r) => Math.max(m, r.score), 0);
    const pct = Math.round(best / max * 100);
    $('best').textContent = `${best}/${max}`;
    $('ringFg').setAttribute('stroke-dasharray', `${pct} 100`);
    $('ringTxt').textContent = pct + '%';
    $('taken').textContent = history.length;
    $('histEmpty').hidden = history.length > 0;
    $('histBody').innerHTML = history.map((r, i) =>
      `<tr><td>${history.length - i}</td><td>${fmtDate(r.date)}</td><td>Level ${r.level}</td>` +
      `<td class="sc${r.score / max >= .6 ? ' good' : ''}">${r.score}/${max}</td>` +
      `<td class="r"><button class="vlink" data-i="${i}">View Results</button></td></tr>`).join('');
    show('dash');
  }
  $('histBody').onclick = e => { const b = e.target.closest('[data-i]'); if (b) openResult(history[+b.dataset.i]); };
  $('userBtn').onclick = () => { $('userMenu').hidden = !$('userMenu').hidden; };
  document.addEventListener('click', e => { if (!e.target.closest('.user')) $('userMenu').hidden = true; });
  $('logoutBtn').onclick = () => { API.logout(); $('userMenu').hidden = true; show('login'); };
  $('startPractice').onclick = () => show('cam');

  // ---------- camera proctoring ----------
  let stream = null, snapTimer = 0, snaps = [];
  $('camYes').onclick = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
      startTest(true);
    } catch { alert('Camera unavailable or permission denied. Starting without camera.'); startTest(false); }
  };
  $('camNo').onclick = () => startTest(false);

  function startCamera() {
    const v = $('camVideo');
    v.srcObject = stream; v.hidden = false; v.play().catch(() => {});
    const c = document.createElement('canvas'); c.width = 160; c.height = 120;
    // Small JPEG snapshot every 30s; with a backend these would be uploaded
    snapTimer = setInterval(() => {
      c.getContext('2d').drawImage(v, 0, 0, 160, 120);
      snaps.push({ t: Date.now(), img: c.toDataURL('image/jpeg', 0.5) });
    }, 30000);
  }
  function stopCamera() {
    clearInterval(snapTimer);
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; $('camVideo').hidden = true; $('camVideo').srcObject = null;
  }

  // ---------- test ----------
  let T = null, tick = 0, page = 0, perPage = 10;

  function calcPerPage() {
    const w = innerWidth;
    return w >= 1400 ? 10 : w >= 1100 ? 8 : w >= 800 ? 6 : w >= 520 ? 4 : 3;
  }

  function startTest(proctored) {
    T = { paper: makePaper(), ans: new Array(TOTAL).fill(''), start: Date.now(), proctored, done: false };
    snaps = [];
    const b = $('procBadge');
    b.textContent = proctored ? 'Proctoring on — camera snapshots enabled' : 'Proctoring off — you started without a camera';
    b.classList.toggle('on', proctored);
    if (proctored) startCamera();
    $('jumpBtns').innerHTML = SECTIONS.map((_, i) =>
      `<button data-s="${i}">Q${i * PER_SEC + 1}-${(i + 1) * PER_SEC}</button>`).join('');
    perPage = calcPerPage();
    page = 0;
    show('test');
    renderPage();
    clearInterval(tick);
    tickFn(); tick = setInterval(tickFn, 500);
    addEventListener('beforeunload', warnLeave);
  }

  function tickFn() {
    const left = Math.max(0, DURATION - Math.floor((Date.now() - T.start) / 1000));
    $('timer').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    $('timer').classList.toggle('low', left <= 60);
    if (left === 0) submit();
  }
  const warnLeave = e => { e.preventDefault(); e.returnValue = ''; };

  function renderPage() {
    const from = page * perPage, to = Math.min(TOTAL, from + perPage);
    const grid = $('qgrid');
    grid.style.setProperty('--cols', to - from);
    let html = '';
    for (let i = from; i < to; i++) {
      const q = T.paper[i];
      html += `<div class="qcol"><div class="qn">${i + 1}</div><div class="qnums">` +
        q.nums.map(n => `<div>${n < 0 ? '−&nbsp;' + -n : n}</div>`).join('') +
        `<div class="ul"></div></div><input data-q="${i}" inputmode="numeric" enterkeyhint="next" maxlength="6" aria-label="Answer ${i + 1}" value="${T.ans[i]}"${T.ans[i] ? ' class="filled"' : ''}></div>`;
    }
    grid.innerHTML = html;
    $('showing').textContent = `Showing ${from + 1} - ${to} of ${TOTAL}`;
    $('prevPg').disabled = page === 0;
    $('nextPg').disabled = to >= TOTAL;
    const sec = Math.floor(from / PER_SEC);
    [...$('jumpBtns').children].forEach((b, i) => b.classList.toggle('on', i === sec));
  }

  function goPage(p, focusIdx) {
    const max = Math.ceil(TOTAL / perPage) - 1;
    page = Math.max(0, Math.min(max, p));
    renderPage();
    if (focusIdx != null) grid().querySelector(`[data-q="${focusIdx}"]`)?.focus();
  }
  const grid = () => $('qgrid');

  // Event delegation: one listener for all answer boxes
  $('qgrid').addEventListener('input', e => {
    const el = e.target; if (!el.dataset.q) return;
    el.value = el.value.replace(/[^0-9]/g, '');
    T.ans[+el.dataset.q] = el.value;
    el.classList.toggle('filled', !!el.value);
  });
  $('qgrid').addEventListener('keydown', e => {
    const el = e.target; if (!el.dataset.q) return;
    const i = +el.dataset.q;
    let j = null;
    if (e.key === 'Enter' || e.key === 'ArrowRight' && el.selectionStart === el.value.length) j = i + 1;
    else if (e.key === 'ArrowLeft' && el.selectionStart === 0) j = i - 1;
    if (j == null || j < 0 || j >= TOTAL) return;
    e.preventDefault();
    const target = grid().querySelector(`[data-q="${j}"]`);
    target ? target.focus() : goPage(Math.floor(j / perPage), j);
  });

  $('prevPg').onclick = () => goPage(page - 1);
  $('nextPg').onclick = () => goPage(page + 1);
  $('jumpBtns').onclick = e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    goPage(Math.floor(+b.dataset.s * PER_SEC / perPage));
  };
  let rz = 0;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if ($('v-test').hidden) return;
      const n = calcPerPage(); if (n === perPage) return;
      const first = page * perPage; perPage = n; page = Math.floor(first / n); renderPage();
    }, 150);
  });

  // ---------- submit ----------
  const openModal = () => { $('modal').hidden = false; $('mOk').focus(); };
  $('submitBtn').onclick = openModal;
  $('mCancel').onclick = () => { $('modal').hidden = true; };
  $('mOk').onclick = () => { $('modal').hidden = true; submit(); };
  $('backBtn').onclick = () => { if (confirm('Leave the test? Your answers will be lost.')) { endTest(); openDash(); } };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('modal').hidden = true; });

  function endTest() {
    clearInterval(tick); stopCamera();
    removeEventListener('beforeunload', warnLeave);
    if (T) T.done = true;
  }

  async function submit() {
    if (!T || T.done) return;
    endTest();
    $('modal').hidden = true;
    const secs = Math.min(DURATION, Math.round((Date.now() - T.start) / 1000));
    let correct = 0, blank = 0;
    const sections = SECTIONS.map(() => ({ c: 0, a: 0 }));
    T.paper.forEach((q, i) => {
      const s = sections[Math.floor(i / PER_SEC)];
      if (T.ans[i] === '') { blank++; return; }
      s.a++;
      if (+T.ans[i] === q.answer) { correct++; s.c++; }
    });
    const r = {
      id: Date.now().toString(36), date: Date.now(), level: user.level, secs,
      score: correct * MARKS, correct, blank, wrong: TOTAL - correct - blank,
      proctored: T.proctored, snaps: snaps.length, sections,
      // store compact paper + answers for review
      paper: T.paper.map(q => q.nums), ans: T.ans
    };
    await API.saveResult(user.id, r);
    openResult(r);
  }

  // ---------- result ----------
  function openResult(r) {
    const max = TOTAL * MARKS;
    const pct = Math.round(r.score / max * 100);
    const attempted = TOTAL - r.blank, attWrong = attempted - r.correct;
    // answers per minute, gauge full scale = 20/min
    const speed = r.secs ? Math.floor(attempted / (r.secs / 60)) : 0;
    const frac = Math.min(1, speed / 20), ang = Math.PI * (1 - frac);
    $('rName').textContent = user.name;
    $('rAvatar').textContent = user.name[0].toUpperCase();
    $('rRing').setAttribute('stroke-dasharray', `${pct} 100`);
    $('rPct').textContent = pct + '%';
    $('rPts').textContent = r.score;
    $('rMax').textContent = max;
    $('rCorrect').textContent = r.correct;
    $('rWrong').textContent = TOTAL - r.correct; // unanswered count as wrong
    $('rTime').textContent = `${Math.floor(r.secs / 60)}m ${r.secs % 60}s`;
    $('rSpeed').textContent = speed;
    $('gArc').setAttribute('stroke-dasharray', `${frac * 100} 100`);
    $('gNeedle').setAttribute('x2', (60 + 40 * Math.cos(ang)).toFixed(1));
    $('gNeedle').setAttribute('y2', (62 - 40 * Math.sin(ang)).toFixed(1));
    $('bAtt').textContent = `${attempted}/${TOTAL} attempted`;
    $('bC').textContent = `${r.correct} correct`;
    $('bW').textContent = `${attWrong} wrong`;
    $('gotoBtns').innerHTML = SECTIONS.map((_, i) =>
      `<button data-q="${i * PER_SEC}">Q${i * PER_SEC + 1}–${(i + 1) * PER_SEC}</button>`).join('');
    $('review').innerHTML = r.paper.map((nums, i) => {
      const ans = nums.reduce((a, b) => a + b, 0), you = r.ans[i];
      const ok = you !== '' && +you === ans;
      return `<div class="rc${ok ? '' : ' bad'}" id="rq${i}"><div class="no">#${i + 1}</div><div class="nums">` +
        nums.map(n => `<div>${n < 0 ? '−&nbsp;' + -n : n}</div>`).join('') +
        `</div><div class="you">${you}</div>${ok ? '' : `<div class="ans">Ans: <b>${ans}</b></div>`}</div>`;
    }).join('');
    show('result');
  }
  $('resBack').onclick = openDash;
  $('gotoBtns').onclick = e => {
    const b = e.target.closest('[data-q]');
    if (b) $('rq' + b.dataset.q).scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ---------- boot ----------
  API.me() ? openDash() : show('login');

  if ('serviceWorker' in navigator && location.protocol.startsWith('http'))
    navigator.serviceWorker.register('sw.js').catch(() => {});
})();
