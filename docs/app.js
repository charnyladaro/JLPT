/* JLPT 道場 — app logic. Vanilla JS, hash-routed, works from file://. */
(function () {
  "use strict";

  /* ============================== state ============================== */
  const LEVELS = ["n5", "n4", "n3", "n2", "n1"];
  const LEVEL_INFO = {
    n5: { name: "N5", desc: "Beginner", color: "var(--n5)" },
    n4: { name: "N4", desc: "Elementary", color: "var(--n4)" },
    n3: { name: "N3", desc: "Intermediate", color: "var(--n3)" },
    n2: { name: "N2", desc: "Upper-intermediate", color: "var(--n2)" },
    n1: { name: "N1", desc: "Advanced", color: "var(--n1)" },
  };
  const SECTIONS = ["grammar", "vocabulary", "kanji", "reading"];
  const SECTION_JP = { grammar: "文法", vocabulary: "語彙", kanji: "漢字", reading: "読解" };

  const store = loadStore();
  let level = LEVELS.includes(store.level) ? store.level : "n5";
  let quiz = null;          // active quiz session
  let audioEl = null;       // shared audio element

  const $view = document.getElementById("view");
  const $pills = document.getElementById("levelpills");
  const D = window.JLPT_DATA || {};
  const manifest = (D.manifest && D.manifest.levels) || {};

  function loadStore() {
    try { return JSON.parse(localStorage.getItem("jlpt-dojo") || "{}"); }
    catch { return {}; }
  }
  function save() {
    try { localStorage.setItem("jlpt-dojo", JSON.stringify(store)); } catch {}
  }
  function bag(key, lv) {
    store[key] = store[key] || {};
    store[key][lv] = store[key][lv] || {};
    return store[key][lv];
  }

  /* ============================ utilities ============================ */
  function esc(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* Lazy-load per-level data via <script> injection (file:// safe). */
  const loading = {};
  function loadData(key) {
    if (D[key]) return Promise.resolve(D[key]);
    if (loading[key]) return loading[key];
    loading[key] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "data/" + key + ".js";
      s.onload = () => {
        Object.assign(D, window.JLPT_DATA);
        D[key] ? resolve(D[key]) : reject(new Error("no data in " + key));
      };
      s.onerror = () => reject(new Error("failed to load " + key));
      document.head.appendChild(s);
    });
    return loading[key];
  }
  function withData(keys, render) {
    const missing = keys.filter(k => !D[k]);
    if (!missing.length) return render();
    $view.innerHTML = `<div class="notice"><span class="spin"></span>Loading data…</div>`;
    Promise.all(missing.map(loadData))
      .then(render)
      .catch(e => { $view.innerHTML = `<div class="notice">Could not load data (${esc(e.message)}).</div>`; });
  }

  /* ============================== theme ============================== */
  function applyTheme() {
    const t = store.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = t;
  }
  document.getElementById("themebtn").addEventListener("click", () => {
    store.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(); save();
  });
  applyTheme();

  /* ============================== router ============================= */
  /* Routes:
     #/home | #/docs/<page?>
     #/<lv>/grammar/<id?> | #/<lv>/vocab/<mode?> | #/<lv>/reviewer
     #/<lv>/practice/<section?>  | #/<lv>/practice/<section>/<testIdx|drill>  */
  function parseHash() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (!parts.length) return { view: "home" };
    if (parts[0] === "home") return { view: "home" };
    if (parts[0] === "docs") return { view: "docs", page: parts[1] || "about" };
    if (LEVELS.includes(parts[0])) {
      return { view: parts[1] || "grammar", lv: parts[0], a: parts[2], b: parts[3] };
    }
    // old-style docs deep link (#/star, #/n2-reading) used inside docs pages
    if (D.docs && D.docs.pages[parts[0]]) return { view: "docs", page: parts[0] };
    // bare view name -> current level
    return { view: parts[0], lv: level, a: parts[1], b: parts[2] };
  }
  function nav(hash) { location.hash = hash; }
  function route() {
    const r = parseHash();
    if (r.lv && r.lv !== level) { level = r.lv; store.level = level; save(); }
    document.documentElement.style.setProperty("--accent", LEVEL_INFO[level].color);
    renderPills();
    renderNavLinks(r.view);
    quiz = r.view === "practice" ? quiz : null;
    stopAudio();
    switch (r.view) {
      case "home": return renderHome();
      case "grammar": return renderGrammar(r.a);
      case "vocab": return renderVocab(r.a === "cards");
      case "practice": return renderPractice(r.a, r.b);
      case "reviewer": return renderReviewer();
      case "docs": return renderDocs(r.page || "about");
      default: return renderHome();
    }
  }
  window.addEventListener("hashchange", route);

  function renderPills() {
    $pills.innerHTML = "";
    for (const lv of LEVELS) {
      const b = el(`<button style="--pill:${LEVEL_INFO[lv].color}">${LEVEL_INFO[lv].name}</button>`);
      if (lv === level) b.classList.add("active");
      b.addEventListener("click", () => {
        const r = parseHash();
        const view = ["home", "docs"].includes(r.view) ? "grammar" : r.view;
        nav(`/${lv}/${view}`);
      });
      $pills.appendChild(b);
    }
  }
  function renderNavLinks(active) {
    document.querySelectorAll("#mainnav a").forEach(a => {
      const v = a.dataset.nav;
      a.classList.toggle("active", v === active || (active === "home" && v === "home"));
      if (["grammar", "vocab", "practice", "reviewer"].includes(v)) a.href = `#/${level}/${v}`;
    });
  }

  /* ============================== audio ============================== */
  function stopAudio() {
    if (audioEl) { audioEl.pause(); audioEl = null; }
    document.querySelectorAll(".ex-play.playing").forEach(b => b.classList.remove("playing"));
  }
  function playAudio(url, btn) {
    if (btn.classList.contains("playing")) { stopAudio(); return; }
    stopAudio();
    audioEl = new Audio(url);
    btn.classList.add("playing");
    audioEl.onended = audioEl.onerror = () => btn.classList.remove("playing");
    audioEl.play().catch(() => btn.classList.remove("playing"));
  }

  /* =============================== home =============================== */
  function renderHome() {
    const cards = LEVELS.map(lv => {
      const m = manifest[lv] || {};
      const known = Object.keys(bag("knownG", lv)).length;
      const total = m.grammar_points || 0;
      const pct = total ? Math.round(100 * known / total) : 0;
      return `
      <a class="level-card" style="--lv:${LEVEL_INFO[lv].color}" href="#/${lv}/grammar">
        <div class="lv-name">${LEVEL_INFO[lv].name}</div>
        <div class="lv-desc">${LEVEL_INFO[lv].desc}</div>
        <div class="lv-stats">
          <span><b>${total}</b> grammar points</span>
          <span><b>${m.vocab_words || 0}</b> vocabulary words</span>
          <span><b>${m.tests || 0}</b> tests · <b>${m.questions || 0}</b> questions</span>
        </div>
        <div class="lv-progress" title="${known}/${total} grammar marked known"><i style="width:${pct}%"></i></div>
      </a>`;
    }).join("");

    $view.innerHTML = `
      <div class="home-hero">
        <h1><span class="jp">日本語能力試験</span><br>One place to drill N5 → N1.</h1>
        <p>Grammar with real example sentences, vocabulary decks, and ${totalQ()} exam-style questions —
           plus your reviewers and the full JLPT reference, all offline in one app.</p>
      </div>
      <div class="level-grid">${cards}</div>
      <div class="home-cols">
        <a class="home-tile" href="#/${level}/grammar"><h3><span class="jp-label">文法</span>Grammar library</h3>
          <p>Every grammar point with meaning, formation and native example sentences. Mark what you know.</p></a>
        <a class="home-tile" href="#/${level}/vocab"><h3><span class="jp-label">語彙</span>Vocabulary</h3>
          <p>Full word lists per level, searchable — or drill them as flashcards until they stick.</p></a>
        <a class="home-tile" href="#/${level}/practice"><h3><span class="jp-label">練習</span>Practice tests</h3>
          <p>Real exercise sets for grammar, vocab, kanji and reading, with answer keys and explanations.</p></a>
        <a class="home-tile" href="#/${level}/reviewer"><h3><span class="jp-label">復習</span>Reviewer</h3>
          <p>Your pass-focused reviewer: scoring rules, traps, time budgets and the final-48-hours plan.</p></a>
        <a class="home-tile" href="#/docs"><h3><span class="jp-label">参考</span>Docs</h3>
          <p>The complete JLPT reference — scoring, test-day tactics, and per-level strategy guides.</p></a>
      </div>`;
    document.getElementById("foot-stats").textContent =
      `${totalG()} grammar points · ${totalV()} words · ${totalQ()} questions`;
  }
  function totalG() { return LEVELS.reduce((s, l) => s + ((manifest[l] || {}).grammar_points || 0), 0); }
  function totalV() { return LEVELS.reduce((s, l) => s + ((manifest[l] || {}).vocab_words || 0), 0); }
  function totalQ() { return LEVELS.reduce((s, l) => s + ((manifest[l] || {}).questions || 0), 0); }

  /* ============================== grammar ============================= */
  function renderGrammar(gid) {
    withData(["grammar-" + level], () => {
      const points = D["grammar-" + level];
      const known = bag("knownG", level);
      let q = "", onlyUnknown = false;

      $view.innerHTML = `
        <h1 class="page-title"><span class="jp-label">文法</span>${LEVEL_INFO[level].name} Grammar</h1>
        <p class="page-sub">${points.length} grammar points · ${Object.keys(known).length} marked known</p>
        <div class="toolbar">
          <div class="searchbox"><input id="gq" type="search" placeholder="Search grammar (japanese, romaji, meaning)…" aria-label="Search grammar"></div>
          <div class="seg" id="gfilter">
            <button data-f="all" class="active">All</button>
            <button data-f="unknown">To learn</button>
          </div>
          <span class="count-note" id="gcount"></span>
        </div>
        <div class="split">
          <div class="g-list" id="glist" role="listbox"></div>
          <div class="g-detail" id="gdetail"></div>
        </div>`;

      const $list = document.getElementById("glist");
      const $detail = document.getElementById("gdetail");
      const $count = document.getElementById("gcount");
      let current = gid && points.find(p => p.id === gid) ? gid : null;

      function filtered() {
        const needle = q.toLowerCase();
        return points.filter(p => {
          if (onlyUnknown && known[p.id]) return false;
          if (!needle) return true;
          return (p.title + " " + p.meaning).toLowerCase().includes(needle);
        });
      }
      function drawList() {
        const items = filtered();
        $count.textContent = `${items.length} shown`;
        $list.innerHTML = "";
        for (const p of items) {
          const b = el(`<button class="g-item${p.id === current ? " active" : ""}" role="option">
            ${known[p.id] ? '<span class="g-known">✓</span>' : ""}${esc(p.title)}
            <small>${esc(p.meaning.split(";")[0].slice(0, 60))}</small></button>`);
          b.addEventListener("click", () => { history.replaceState(null, "", `#/${level}/grammar/${p.id}`); current = p.id; drawList(); drawDetail(); });
          $list.appendChild(b);
        }
        if (!items.length) $list.innerHTML = `<div class="g-empty">No matches.</div>`;
      }
      function drawDetail() {
        stopAudio();
        const p = points.find(x => x.id === current) || null;
        if (!p) {
          $detail.innerHTML = `<div class="g-empty">Select a grammar point<br><small>or press ↑/↓ to browse</small></div>`;
          return;
        }
        const isKnown = !!known[p.id];
        const exHtml = (ex, i) => `
          <div class="example" data-i="${i}">
            ${ex.audio ? `<button class="ex-play" data-a="${esc(ex.audio)}" title="Play audio">▶</button>` : ""}
            <div class="ex-jp">${esc(ex.jp)}</div>
            <div class="ex-en">${esc(ex.en)}</div>
            <div class="ex-ro">${esc(ex.romaji)}</div>
          </div>`;
        const firstN = 6;
        $detail.innerHTML = `
          <div class="g-head">
            <h2>${esc(p.title)}</h2>
            <button class="known-btn${isKnown ? " on" : ""}" id="knownbtn">${isKnown ? "✓ Known" : "Mark as known"}</button>
          </div>
          <p class="g-meaning"><b>Meaning</b>${esc(p.meaning) || "—"}</p>
          ${p.formation ? `<h3>Formation</h3><div class="g-formation">${esc(p.formation)}</div>` : ""}
          <div class="g-examples">
            <h3>Example sentences (${p.examples.length})</h3>
            ${p.examples.slice(0, firstN).map(exHtml).join("")}
            <div id="gmore-slot"></div>
            ${p.examples.length > firstN ? `<button class="more-btn" id="gmore">Show ${p.examples.length - firstN} more examples</button>` : ""}
          </div>`;

        document.getElementById("knownbtn").addEventListener("click", () => {
          if (known[p.id]) delete known[p.id]; else known[p.id] = 1;
          save(); drawList(); drawDetail();
        });
        const more = document.getElementById("gmore");
        if (more) more.addEventListener("click", () => {
          document.getElementById("gmore-slot").innerHTML = p.examples.slice(firstN).map(exHtml).join("");
          more.remove();
          bindAudio();
        });
        bindAudio();
        function bindAudio() {
          $detail.querySelectorAll(".ex-play").forEach(b =>
            b.addEventListener("click", () => playAudio(b.dataset.a, b)));
        }
      }

      document.getElementById("gq").addEventListener("input", e => { q = e.target.value; drawList(); });
      document.getElementById("gfilter").addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        onlyUnknown = b.dataset.f === "unknown";
        document.querySelectorAll("#gfilter button").forEach(x => x.classList.toggle("active", x === b));
        drawList();
      });
      if (!current && points.length) current = points[0].id;
      drawList(); drawDetail();
    });
  }

  /* =============================== vocab ============================== */
  function renderVocab(cardsMode) {
    withData(["vocab-" + level], () => {
      const words = D["vocab-" + level];
      const done = bag("vocabDone", level);

      $view.innerHTML = `
        <h1 class="page-title"><span class="jp-label">語彙</span>${LEVEL_INFO[level].name} Vocabulary</h1>
        <p class="page-sub">${words.length} words · ${Object.keys(done).length} mastered</p>
        <div class="toolbar">
          <div class="searchbox"><input id="vq" type="search" placeholder="Search words…" aria-label="Search vocabulary"></div>
          <div class="seg">
            <button id="vlist-btn" class="${cardsMode ? "" : "active"}">List</button>
            <button id="vcards-btn" class="${cardsMode ? "active" : ""}">Flashcards</button>
          </div>
          <span class="count-note" id="vcount"></span>
        </div>
        <div id="vbody"></div>`;

      document.getElementById("vlist-btn").addEventListener("click", () => nav(`/${level}/vocab`));
      document.getElementById("vcards-btn").addEventListener("click", () => nav(`/${level}/vocab/cards`));
      const $body = document.getElementById("vbody");
      const $vq = document.getElementById("vq");
      const $count = document.getElementById("vcount");

      if (cardsMode) { $vq.closest(".searchbox").style.display = "none"; drawCards(); }
      else {
        let q = "", limit = 150;
        $vq.addEventListener("input", e => { q = e.target.value; limit = 150; drawTable(); });
        drawTable();
        function drawTable() {
          const needle = q.toLowerCase();
          const items = needle
            ? words.filter(w => (w.word + " " + w.romaji + " " + w.meaning).toLowerCase().includes(needle))
            : words;
          $count.textContent = `${items.length} word${items.length === 1 ? "" : "s"}`;
          const rows = items.slice(0, limit).map(w => `
            <tr><td class="v-word">${esc(w.word)}</td><td class="v-ro">${esc(w.romaji)}</td>
            <td>${esc(w.meaning)}</td><td>${done[w.word] ? '<span style="color:var(--ok)">✓</span>' : ""}</td></tr>`).join("");
          $body.innerHTML = `<div class="vocab-wrap"><table>
            <thead><tr><th>Word</th><th>Reading</th><th>Meaning</th><th style="width:30px" title="Mastered in flashcards">✓</th></tr></thead>
            <tbody>${rows}</tbody></table>
            ${items.length > limit ? `<div class="vocab-more"><button class="more-btn" id="vmore">Show ${Math.min(300, items.length - limit)} more (${items.length - limit} left)</button></div>` : ""}
          </div>`;
          const more = document.getElementById("vmore");
          if (more) more.addEventListener("click", () => { limit += 300; drawTable(); });
        }
      }

      function drawCards() {
        let deck = shuffle(words.filter(w => !done[w.word]));
        let idx = 0, flipped = false, sessionGot = 0, sessionAgain = 0;

        function draw() {
          $count.textContent = `${Object.keys(done).length}/${words.length} mastered`;
          if (!deck.length || idx >= deck.length) {
            $body.innerHTML = `
              <div class="fc-done">
                <div class="big">お疲れ様！</div>
                <p>${deck.length ? "Deck finished." : "Every word is mastered."}
                   Session: ${sessionGot} got · ${sessionAgain} again.</p>
                <div class="qr-actions" style="display:flex;gap:10px;justify-content:center">
                  <button class="btn" id="fc-restart">New session</button>
                  <button class="btn ghost" id="fc-resetall">Reset mastered (${Object.keys(done).length})</button>
                </div>
              </div>`;
            document.getElementById("fc-restart").addEventListener("click", () => { deck = shuffle(words.filter(w => !done[w.word])); idx = 0; sessionGot = sessionAgain = 0; draw(); });
            document.getElementById("fc-resetall").addEventListener("click", () => {
              store.vocabDone[level] = {}; save(); deck = shuffle(words.slice()); idx = 0; draw();
            });
            return;
          }
          const w = deck[idx];
          $body.innerHTML = `
            <div class="fc-stage">
              <div class="fc-meta"><span>Card ${idx + 1} / ${deck.length}</span><span>✓ ${sessionGot} · ↻ ${sessionAgain}</span></div>
              <div class="fc-card" id="fc" tabindex="0" role="button" aria-label="Flashcard — click to flip">
                <div>
                  <div class="fc-front">${esc(w.word)}</div>
                  ${flipped ? `<div class="fc-back-ro">${esc(w.romaji)}</div><div class="fc-back-en">${esc(w.meaning)}</div>`
                            : `<div class="fc-hint">click / space to flip</div>`}
                </div>
              </div>
              <div class="fc-actions">
                <button class="fc-again" id="fc-again" ${flipped ? "" : "disabled"}>↻ Again</button>
                <button class="fc-got" id="fc-got" ${flipped ? "" : "disabled"}>✓ Got it</button>
              </div>
              <div class="fc-sub">
                <button id="fc-shuffle">reshuffle</button>
                <button id="fc-skip">skip</button>
              </div>
            </div>`;
          document.getElementById("fc").addEventListener("click", flip);
          document.getElementById("fc-again").addEventListener("click", () => { deck.push(w); sessionAgain++; next(); });
          document.getElementById("fc-got").addEventListener("click", () => { done[w.word] = 1; save(); sessionGot++; next(); });
          document.getElementById("fc-shuffle").addEventListener("click", () => { deck = shuffle(deck.slice(idx)); idx = 0; flipped = false; draw(); });
          document.getElementById("fc-skip").addEventListener("click", next);
        }
        function flip() { flipped = !flipped; draw(); }
        function next() { idx++; flipped = false; draw(); }
        function onKey(e) {
          if (!document.getElementById("fc")) return;
          if (e.code === "Space") { e.preventDefault(); flip(); }
          if (flipped && e.key === "1") document.getElementById("fc-again").click();
          if (flipped && e.key === "2") document.getElementById("fc-got").click();
        }
        document.addEventListener("keydown", onKey);
        window.addEventListener("hashchange", () => document.removeEventListener("keydown", onKey), { once: true });
        draw();
      }
    });
  }

  /* ============================== practice ============================ */
  function renderPractice(section, which) {
    section = SECTIONS.includes(section) ? section : "grammar";
    withData(["tests-" + level], () => {
      const all = D["tests-" + level];
      const tests = all.filter(t => t.section === section);

      if (which !== undefined) return renderQuiz(section, which, tests);

      store.best = store.best || {};
      const segBtns = SECTIONS.map(s =>
        `<button data-s="${s}" class="${s === section ? "active" : ""}">${SECTION_JP[s]} ${s[0].toUpperCase() + s.slice(1)}</button>`).join("");
      const cards = tests.map((t, i) => {
        const best = store.best[t.url];
        const title = t.title.replace(/^JLPT\s+N\d\s*[–—-]\s*/i, "");
        return `<button class="test-card" data-i="${i}">
          <div class="t-title">${esc(title)}</div>
          <div class="t-meta"><span>${t.questions.length} questions</span>
          ${best != null ? `<span class="t-best">${best}%</span>` : ""}</div>
        </button>`;
      }).join("");

      const drillBest = store.best[`drill:${level}:${section}`];
      $view.innerHTML = `
        <h1 class="page-title"><span class="jp-label">練習</span>${LEVEL_INFO[level].name} Practice</h1>
        <p class="page-sub">${tests.length} ${section} tests · ${tests.reduce((s, t) => s + t.questions.length, 0)} questions with answer keys</p>
        <div class="toolbar"><div class="seg" id="pseg">${segBtns}</div></div>
        <div class="drill-banner">
          <div class="db-text"><b>Random drill</b>
            <p>10 random ${SECTION_JP[section]} questions pulled from every ${LEVEL_INFO[level].name} test.${drillBest != null ? ` Best: ${drillBest}%` : ""}</p>
          </div>
          <button class="btn" id="drillbtn">Start drill</button>
        </div>
        <div class="test-grid" id="tgrid">${cards || '<div class="notice">No tests in this section.</div>'}</div>`;

      document.getElementById("pseg").addEventListener("click", e => {
        const b = e.target.closest("button"); if (b) nav(`/${level}/practice/${b.dataset.s}`);
      });
      document.getElementById("drillbtn").addEventListener("click", () => nav(`/${level}/practice/${section}/drill`));
      document.getElementById("tgrid").addEventListener("click", e => {
        const b = e.target.closest(".test-card"); if (b) nav(`/${level}/practice/${section}/${b.dataset.i}`);
      });
    });
  }

  function renderQuiz(section, which, tests) {
    if (!quiz || quiz.key !== `${level}/${section}/${which}`) {
      let qs, title, passage = null, scoreKey;
      if (which === "drill") {
        const pool = tests.flatMap(t => t.questions
          .filter(q => q.answer)
          .map(q => ({ ...q, passage: t.passage || null })));
        qs = shuffle(pool).slice(0, 10);
        title = `Random ${SECTION_JP[section]} drill`;
        scoreKey = `drill:${level}:${section}`;
      } else {
        const t = tests[+which];
        if (!t) { nav(`/${level}/practice/${section}`); return; }
        qs = t.questions.filter(q => q.answer).map(q => ({ ...q, passage: null }));
        title = t.title.replace(/^JLPT\s+N\d\s*[–—-]\s*/i, "");
        passage = t.passage || null;
        scoreKey = t.url;
      }
      if (!qs.length) { nav(`/${level}/practice/${section}`); return; }
      quiz = { key: `${level}/${section}/${which}`, qs, i: 0, answered: null, right: 0, wrong: [], title, passage, scoreKey, section };
    }
    drawQuiz();
  }

  function drawQuiz() {
    const z = quiz;
    if (z.i >= z.qs.length) return drawQuizResult();
    const q = z.qs[z.i];
    const passage = q.passage || (z.i === 0 || z.qs[0].passage == null ? z.passage : z.passage);
    const opts = q.options.map((o, i) => {
      let cls = "q-opt";
      if (z.answered != null) {
        if (i + 1 === q.answer) cls += " correct";
        else if (i + 1 === z.answered) cls += " wrong";
        else cls += " dim";
      }
      return `<button class="${cls}" data-i="${i + 1}" ${z.answered != null ? "disabled" : ""}>
        <span class="q-key">${i + 1}</span><span>${esc(o)}</span></button>`;
    }).join("");

    const explain = z.answered == null ? "" : `
      <div class="q-explain ${z.answered === q.answer ? "" : "was-wrong"}">
        <span class="verdict">${z.answered === q.answer ? "正解 · Correct" : "不正解 · Incorrect"}</span><br>
        ${q.explanation ? esc(q.explanation) : `Answer: ${esc(q.options[q.answer - 1] || q.answer)}`}
      </div>
      <div class="q-next"><button class="btn" id="qnext">${z.i + 1 === z.qs.length ? "See results" : "Next question"} →</button></div>`;

    $view.innerHTML = `
      <div class="quiz">
        <div class="quiz-top">
          <a href="#/${level}/practice/${z.section}">← ${LEVEL_INFO[level].name} ${SECTION_JP[z.section]} tests</a>
          <span>${esc(z.title)} · ${z.i + 1}/${z.qs.length}</span>
        </div>
        <div class="quiz-bar"><i style="width:${(z.i / z.qs.length) * 100}%"></i></div>
        ${passage ? `<div class="q-passage">${esc(passage)}</div>` : ""}
        <p class="q-stem"><b class="jp-num">${z.i + 1}.</b> ${esc(q.stem)}</p>
        <div class="q-opts">${opts}</div>
        ${explain}
      </div>`;

    if (z.answered == null) {
      $view.querySelectorAll(".q-opt").forEach(b => b.addEventListener("click", () => answer(+b.dataset.i)));
    } else {
      document.getElementById("qnext").addEventListener("click", nextQ);
    }
    function answer(i) {
      z.answered = i;
      if (i === q.answer) z.right++;
      else z.wrong.push({ q, picked: i });
      drawQuiz();
    }
    function nextQ() { z.i++; z.answered = null; drawQuiz(); }
    onQuizKeys(q);
  }

  function onQuizKeys(q) {
    function h(e) {
      if (!quiz) return document.removeEventListener("keydown", h);
      if (quiz.answered == null && ["1", "2", "3", "4"].includes(e.key) && +e.key <= q.options.length) {
        const b = $view.querySelector(`.q-opt[data-i="${e.key}"]`);
        if (b) { b.click(); document.removeEventListener("keydown", h); }
      } else if (quiz.answered != null && e.key === "Enter") {
        const b = document.getElementById("qnext");
        if (b) { b.click(); document.removeEventListener("keydown", h); }
      }
    }
    document.addEventListener("keydown", h);
    window.addEventListener("hashchange", () => document.removeEventListener("keydown", h), { once: true });
  }

  function drawQuizResult() {
    const z = quiz;
    const pct = Math.round(100 * z.right / z.qs.length);
    store.best = store.best || {};
    const prev = store.best[z.scoreKey];
    if (prev == null || pct > prev) { store.best[z.scoreKey] = pct; save(); }
    const grade = pct >= 90 ? "素晴らしい！" : pct >= 70 ? "合格圏です" : pct >= 50 ? "もう少し！" : "復習しましょう";
    const wrongHtml = z.wrong.length ? `
      <div class="quiz-review"><h3>Review — ${z.wrong.length} missed</h3>
      ${z.wrong.map(w => `<div class="qr-item">
        <div class="qr-q">${esc(w.q.stem)}</div>
        <span class="bad">${esc(w.q.options[w.picked - 1] || "")}</span> →
        <span class="ok">${esc(w.q.options[w.q.answer - 1] || "")}</span>
        ${w.q.explanation ? `<div style="color:var(--muted);font-size:13px">${esc(w.q.explanation)}</div>` : ""}
      </div>`).join("")}</div>` : "";

    $view.innerHTML = `
      <div class="quiz-result">
        <div class="score">${pct}<small>%</small></div>
        <div class="grade-jp">${grade}</div>
        <p style="color:var(--muted)">${z.right} of ${z.qs.length} correct · ${esc(z.title)}
          ${prev != null && prev >= pct ? ` · best ${prev}%` : pct > 0 ? " · new best" : ""}</p>
        <div class="qr-actions">
          <button class="btn" id="retry">Try again</button>
          <a class="btn ghost" href="#/${level}/practice/${z.section}" style="text-decoration:none">All tests</a>
        </div>
      </div>${wrongHtml}`;
    document.getElementById("retry").addEventListener("click", () => {
      const key = z.key.split("/")[2];
      quiz = null;
      renderPractice(z.section, key);
    });
    quiz = null;
  }

  /* ============================== reviewer ============================ */
  function renderReviewer() {
    const md = (D.reviewers || {})[LEVEL_INFO[level].name];
    if (!md) { $view.innerHTML = `<div class="notice">No reviewer for this level.</div>`; return; }
    const { html, toc } = window.renderMarkdown(md);
    $view.innerHTML = `
      <div class="md-layout">
        <nav class="md-toc" id="mdtoc" aria-label="Reviewer contents">
          ${toc.map(t => `<a class="${t.lvl === 3 ? "h3" : ""}" href="#${t.id}" data-id="${t.id}">${esc(t.text)}</a>`).join("")}
        </nav>
        <article class="md-body" id="mdbody">${html}</article>
      </div>`;

    // toc click: scroll without changing route hash
    const $toc = document.getElementById("mdtoc");
    $toc.addEventListener("click", e => {
      const a = e.target.closest("a"); if (!a) return;
      e.preventDefault();
      const t = document.getElementById(a.dataset.id);
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    // scrollspy
    const links = [...$toc.querySelectorAll("a")];
    const targets = links.map(a => document.getElementById(a.dataset.id)).filter(Boolean);
    if ("IntersectionObserver" in window && targets.length) {
      const io = new IntersectionObserver(entries => {
        for (const en of entries) {
          if (en.isIntersecting) {
            links.forEach(l => l.classList.toggle("active", l.dataset.id === en.target.id));
            break;
          }
        }
      }, { rootMargin: "-80px 0px -70% 0px" });
      targets.forEach(t => io.observe(t));
    }
  }

  /* =============================== docs =============================== */
  function renderDocs(pageId) {
    const docs = D.docs;
    if (!docs) { $view.innerHTML = `<div class="notice">Docs data missing.</div>`; return; }
    const { nav: NAV, pages } = docs;
    const order = NAV.flatMap(g => g.items.map(i => i[0]));
    if (!pages[pageId]) pageId = "about";
    const p = pages[pageId];
    store.docsOpen = store.docsOpen || {};
    // auto-open the group containing the current page
    for (const g of NAV) if (g.items.some(i => i[0] === pageId)) store.docsOpen[g.title] = 1;

    let filter = "";
    function navHtml() {
      const f = filter.trim().toLowerCase();
      return NAV.map(g => {
        const items = g.items.filter(([id, title, kw]) =>
          !f || (title + " " + (kw || "")).toLowerCase().includes(f));
        if (f && !items.length) return "";
        const open = f || store.docsOpen[g.title];
        const dotColor = g.dot ? `style="--dot:var(--${g.dot.replace("d-", "")})" data-c="1"` : "";
        return `<div class="docs-group${open ? " open" : ""}" data-g="${esc(g.title)}">
          <button class="docs-group-h"><span class="dot" ${dotColor}></span>${esc(g.title)}<span class="tw">▶</span></button>
          <div class="docs-items">
            ${items.map(([id, title]) => `<a href="#/docs/${id}" class="${id === pageId ? "active" : ""}">${esc(title)}</a>`).join("")}
          </div></div>`;
      }).join("");
    }

    const idx = order.indexOf(pageId);
    const prev = idx > 0 ? order[idx - 1] : null;
    const next = idx < order.length - 1 ? order[idx + 1] : null;
    const pTitle = id => { for (const g of NAV) for (const it of g.items) if (it[0] === id) return it[1]; return id; };

    $view.innerHTML = `
      <div class="docs-layout">
        <nav class="docs-nav" aria-label="Docs">
          <div class="searchbox" style="margin-bottom:10px"><input id="docq" type="search" placeholder="Filter docs…" aria-label="Filter docs"></div>
          <div id="docnav">${navHtml()}</div>
        </nav>
        <article class="docs-article">
          <div class="crumb">${esc(p.crumb || "")}</div>
          <h1>${esc(p.title)}${p.badge ? `<span class="badge ${esc(p.badge[1])}">${esc(p.badge[0])}</span>` : ""}</h1>
          ${p.html}
          <div class="pn">
            ${prev ? `<a href="#/docs/${prev}"><small>← Previous</small>${esc(pTitle(prev))}</a>` : "<span></span>"}
            ${next ? `<a href="#/docs/${next}" style="text-align:right"><small>Next →</small>${esc(pTitle(next))}</a>` : "<span></span>"}
          </div>
        </article>
      </div>`;

    const $nav = document.getElementById("docnav");
    $nav.addEventListener("click", e => {
      const h = e.target.closest(".docs-group-h");
      if (h) {
        const g = h.parentElement.dataset.g;
        store.docsOpen[g] = store.docsOpen[g] ? 0 : 1;
        save();
        h.parentElement.classList.toggle("open");
      }
    });
    document.getElementById("docq").addEventListener("input", e => {
      filter = e.target.value;
      $nav.innerHTML = navHtml();
    });
    window.scrollTo(0, 0);
  }

  /* ========================== update check =========================== */
  /* Compares the latest GitHub release tag against APP_VERSION; shows the
     topbar icon when a newer release exists. Silent offline / rate-limited. */
  const APP_VERSION = "1.0.0";
  const RELEASES_API = "https://api.github.com/repos/charnyladaro/JLPT/releases/latest";
  function newerVersion(latest, current) {
    const a = String(latest).split(".").map(n => parseInt(n, 10) || 0);
    const b = String(current).split(".").map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    }
    return false;
  }
  function showUpdate(tag, url) {
    if (!newerVersion(String(tag).replace(/^v/i, ""), APP_VERSION)) return;
    const btn = document.getElementById("updatebtn");
    btn.href = url || "https://github.com/charnyladaro/JLPT/releases";
    btn.title = `New version ${tag} available — you have v${APP_VERSION}`;
    btn.hidden = false;
  }
  function checkForUpdate() {
    const last = store.updateCheck || {};
    if (last.tag) showUpdate(last.tag, last.url);
    if (Date.now() - (last.at || 0) < 6 * 3600e3) return;
    fetch(RELEASES_API)
      .then(r => (r.ok ? r.json() : null))
      .then(rel => {
        if (!rel || !rel.tag_name) return;
        store.updateCheck = { at: Date.now(), tag: rel.tag_name, url: rel.html_url };
        save();
        showUpdate(rel.tag_name, rel.html_url);
      })
      .catch(() => {});
  }
  checkForUpdate();

  /* Hide the APK download link inside the Android app itself. */
  if (window.ReactNativeWebView) document.getElementById("apkbtn").hidden = true;

  /* ============================= donate =============================== */
  const $donate = document.getElementById("donate-overlay");
  document.getElementById("donatebtn").addEventListener("click", () => { $donate.hidden = false; });
  $donate.addEventListener("click", e => {
    if (e.target === $donate || e.target.closest(".donate-close")) $donate.hidden = true;
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") $donate.hidden = true; });

  /* ============================== boot ================================ */
  route();
})();
