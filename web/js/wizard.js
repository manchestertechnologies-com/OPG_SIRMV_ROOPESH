// Create Paper wizard: the same steps as the college's existing question paper generator.
//   Auto:   Subject -> Chapters -> Concepts -> Questions per Chapter -> Questions per Type -> Preview & Save
//   Manual: Subject -> Chapters -> Concepts -> Select Questions -> Preview & Save
// Questions come from the 8 subject databases. "Preview & Save" makes the paper (sets A-H) and
// opens it in the paper builder.

import { esc, renderMath, figureEl } from "./render.js";
import { icon } from "./icons.js";

export const PATTERNS = {
  NEET: { id: "NEET", title: "NEET (National Eligibility Entrance Test)", badge: "Medical UG", subjects: ["Physics", "Chemistry", "Botany", "Zoology"], defaultTotal: 45, marksPerQ: 4, numerical: false },
  JEE: { id: "JEE", title: "JEE Main (Joint Entrance Examination)", badge: "Engineering", subjects: ["Physics", "Chemistry", "Mathematics"], defaultTotal: 25, marksPerQ: 4, numerical: true },
  CET: { id: "CET", title: "KCET (Karnataka Common Entrance Test)", badge: "Karnataka CET", subjects: ["Physics", "Chemistry", "Mathematics", "Biology"], defaultTotal: 60, marksPerQ: 1, numerical: false },
  ASSIGNMENT: { id: "ASSIGNMENT", title: "Institutional Assignment / Practice Paper", badge: "Assignment", subjects: ["Physics", "Chemistry", "Mathematics", "Biology"], defaultTotal: 30, marksPerQ: 1, numerical: true },
};
const TYPES = [
  { key: "mcq", label: "Single Correct MCQ", desc: "Standard 4-option multiple choice" },
  { key: "ar", label: "Assertion & Reasoning", desc: "Assertion (A) and Reason (R)" },
  { key: "match", label: "Match the Following", desc: "Column I with Column II pairs" },
  { key: "diag", label: "Diagrammatic Questions", desc: "Circuits, graphs and ray diagrams" },
  { key: "stmt", label: "Statement-Based Questions", desc: "Statement I and Statement II" },
  { key: "numerical", label: "Numerical Questions (JEE Sec B)", desc: "Integer value answers, JEE only" },
];
const TYPE_SHORT = { mcq: "MCQ", ar: "A & R", match: "Match", diag: "Diagram", stmt: "Statement", numerical: "Numerical" };

const fresh = () => ({
  step: 1, mode: "", title: "", klass: "Both", pattern: "", subject: "",
  chapters: [], picked: [],            // [{db, chapter, klass, count}]
  topics: [], pickedTopics: [],        // topic names
  total: 0, quota: {},                 // "db|chapter" -> count
  typeCount: {}, diff: { easy: 30, medium: 50, hard: 20 },
  pool: [], selected: new Map(),       // manual pool / chosen questions
  filters: { chapter: "", topic: "", diff: "all", type: "all", search: "" },
  short: [],
});
let S = fresh();

const stepsOf = () => S.mode === "auto"
  ? [[1, "Subject"], [2, "Chapters"], [3, "Concepts"], [4, "Questions per Chapter"], [5, "Questions per Type"], [7, "Preview & Save"]]
  : [[1, "Subject"], [2, "Chapters"], [3, "Concepts"], [6, "Select Questions"], [7, "Preview & Save"]];

async function api(path, body) {
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const d = await r.json();
  if (!r.ok) throw new Error(d.detail || `Error ${r.status}`);
  return d;
}
const qkey = (p) => `${p.db}|${p.chapter}`;

export async function viewWizard(root, ctx) {
  const { shell, toast, store, newPaper } = ctx;
  shell("Question Paper Generator", { label: "Back to Papers", href: "#papers", crumbs: ["Papers", "Create paper"] }, []);
  const steps = stepsOf();
  const pos = Math.max(0, steps.findIndex(([n]) => n === S.step));
  const P = PATTERNS[S.pattern];

  root.innerHTML = `
    <div class="wz ${S.step === 7 ? "wide" : ""}">
      <aside class="wz-side">
        <nav class="wz-card wz-steps" aria-label="Progress"><p class="eyebrow">Your steps</p><ol>
          ${steps.map(([n, label], i) => `<li class="${i < pos ? "done" : i === pos ? "cur" : ""}">
            <button ${i < pos ? `data-go="${n}"` : "disabled"}><span class="dotn">${i < pos ? "✓" : i + 1}</span>
            <span><b>${label}</b>${summary(n) && i <= pos ? `<small>${esc(summary(n))}</small>` : ""}</span></button></li>`).join("")}
        </ol></nav>
        <div class="wz-paper"><p class="eyebrow">Your paper</p>
          ${facts().length ? `<ul>${facts().map(([k, v]) => `<li><span>${k}</span><b>${esc(v)}</b></li>`).join("")}</ul>`
            : `<p class="muted-w">Pick an exam and subject: the paper takes shape here as you go.</p>`}
        </div>
      </aside>
      <section class="wz-main">
        <div class="wz-head"><span class="wz-pill">Step ${pos + 1} of ${steps.length}</span><h2></h2><p></p></div>
        <div class="wz-body"></div>
        <p class="wz-err"></p>
      </section>
    </div>`;
  root.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { S.step = +b.dataset.go; viewWizard(root, ctx); }));
  const head = (t, s) => { root.querySelector(".wz-head h2").textContent = t; root.querySelector(".wz-head p").textContent = s; };
  const body = root.querySelector(".wz-body");
  const err = (m) => { root.querySelector(".wz-err").textContent = m || ""; };
  const go = (n) => { S.step = n; window.scrollTo(0, 0); viewWizard(root, ctx); };
  const foot = (backTo, nextLabel, onNext, extra = "") => {
    const f = document.createElement("div");
    f.className = "wz-foot";
    f.innerHTML = `${backTo ? `<button class="btn btn-grey" data-back>← Back</button>` : ""}<span class="sp"></span>${extra}
      ${nextLabel ? `<button class="btn btn-blue" data-next>${nextLabel}</button>` : ""}`;
    f.querySelector("[data-back]")?.addEventListener("click", () => go(backTo));
    f.querySelector("[data-next]")?.addEventListener("click", onNext);
    body.appendChild(f);
    return f;
  };

  // ---------------------------------------------------------------- 1. exam pattern & subject
  if (S.step === 1) {
    head("Exam Pattern & Subject Selection", "Select the exam blueprint and click your subject block to choose chapters.");
    body.innerHTML = `
      <div class="wz-card grid2w">
        <label>Assessment title (optional)<input class="wz-title" placeholder="e.g. Grand Mock Test #1" value="${esc(S.title)}"></label>
        <label>Target class<select class="wz-class">
          <option value="Both">Both (Class 11 / PUC-I + Class 12 / PUC-II)</option><option value="11">Class 11 / PUC-I</option><option value="12">Class 12 / PUC-II</option></select></label>
      </div>
      <div class="wz-patterns">${Object.values(PATTERNS).map((p) => `
        <div class="wz-pat ${S.pattern === p.id ? "on" : ""}" data-pat="${p.id}">
          <div class="wz-pat-top"><span class="wz-badge">${p.badge}</span><span class="muted">${p.subjects.length} blocks</span></div>
          <h3>${p.id}</h3><p class="muted">${p.title}</p>
          <span class="eyebrow">Click subject block to open:</span>
          <div class="wz-subs">${p.subjects.map((s) => `<button data-sub="${s}" data-pat="${p.id}">${s} <span>→</span></button>`).join("")}</div>
        </div>`).join("")}</div>`;
    body.querySelector(".wz-class").value = S.klass;
    body.querySelector(".wz-title").oninput = (e) => (S.title = e.target.value);
    body.querySelector(".wz-class").onchange = (e) => (S.klass = e.target.value);
    body.querySelectorAll(".wz-pat").forEach((c) => (c.onclick = () => { S.pattern = c.dataset.pat; body.querySelectorAll(".wz-pat").forEach((x) => x.classList.toggle("on", x === c)); }));
    body.querySelectorAll("[data-sub]").forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      const changed = S.subject !== b.dataset.sub || S.pattern !== b.dataset.pat;
      const keep = { title: S.title, klass: S.klass };
      if (changed) S = { ...fresh(), ...keep };
      S.pattern = b.dataset.pat; S.subject = b.dataset.sub;
      modeModal();
    }));
    return;
  }

  function modeModal() {
    const m = document.createElement("div");
    m.className = "cm-backdrop";
    m.innerHTML = `<div class="cm modal wz-mode">
      <div class="modal-h"><div><span class="wz-badge gold">${esc(S.subject)} • ${esc(S.pattern)}</span>
        <h3>Choose question acquisition mode</h3><p class="muted">How would you like to source questions for this paper?</p></div>
        <button class="modal-x" title="Close">×</button></div>
      <div class="grid2w">
        <div class="wz-modecard" data-mode="auto"><div class="wz-modeic amber">⚡</div><h4>Auto Fetch Mode</h4>
          <p class="muted">Set chapter quotas and question type split. The system samples and balances the paper for you.</p>
          <button class="btn btn-green">Use Auto Fetch →</button></div>
        <div class="wz-modecard" data-mode="manual"><div class="wz-modeic">✏️</div><h4>Manual Fetch Mode</h4>
          <p class="muted">Hand-pick every question. Filter by chapter, concept, difficulty and question type.</p>
          <button class="btn btn-green">Use Manual Fetch →</button></div>
      </div></div>`;
    document.body.appendChild(m);
    m.querySelector(".modal-x").onclick = () => m.remove();
    m.querySelectorAll("[data-mode]").forEach((c) => (c.onclick = () => { S.mode = c.dataset.mode; m.remove(); go(2); }));
  }

  // ---------------------------------------------------------------- 2. chapters
  if (S.step === 2) {
    head("Chapter Selection", `Choose the ${S.subject} chapters this paper covers.`);
    body.innerHTML = `<div class="wz-card"><p class="muted center">Loading chapters…</p></div>`;
    try {
      if (!S.chapters.length || S.chapters._for !== `${S.subject}|${S.klass}`) {
        S.chapters = await api(`/api/wizard/chapters?subject=${encodeURIComponent(S.subject)}&klass=${S.klass}`);
        S.chapters._for = `${S.subject}|${S.klass}`;
      }
    } catch (e) { body.innerHTML = ""; err(e.message); foot(1); return; }
    const sel = new Set(S.picked.map(qkey));
    body.innerHTML = `<div class="wz-card">
      <div class="wz-tools"><input class="wz-search" placeholder="Search ${S.chapters.length} ${esc(S.subject)} chapters..."><span class="sp"></span>
        <button class="btn btn-sm" data-all>Select all</button><button class="btn btn-sm" data-none>Clear</button></div>
      ${["11", "12"].filter((k) => S.chapters.some((c) => c.klass === k)).map((k) => `
        <p class="eyebrow">Class ${k} / PUC-${k === "11" ? "I" : "II"}</p>
        <div class="wz-chips">${S.chapters.filter((c) => c.klass === k).map((c) => `
          <label class="wz-chip" data-t="${esc(c.chapter.toLowerCase())}"><input type="checkbox" value="${esc(qkey(c))}" ${sel.has(qkey(c)) ? "checked" : ""}>
          <span>${esc(c.chapter || "(no chapter)")}</span><em>${c.count}</em></label>`).join("")}</div>`).join("")}
    </div>`;
    const sync = () => {
      const on = new Set([...body.querySelectorAll(".wz-chip input:checked")].map((i) => i.value));
      S.picked = S.chapters.filter((c) => on.has(qkey(c)));
      S.pickedTopics = []; S.topics = [];
      body.querySelector("[data-next]").disabled = !S.picked.length;
      body.querySelector("[data-next]").textContent = `Next: Concepts (${S.picked.length} chapters) →`;
    };
    body.querySelector(".wz-search").oninput = (e) => body.querySelectorAll(".wz-chip").forEach((c) => (c.hidden = !c.dataset.t.includes(e.target.value.toLowerCase())));
    body.querySelectorAll(".wz-chip input").forEach((i) => (i.onchange = sync));
    body.querySelector("[data-all]").onclick = () => { body.querySelectorAll(".wz-chip:not([hidden]) input").forEach((i) => (i.checked = true)); sync(); };
    body.querySelector("[data-none]").onclick = () => { body.querySelectorAll(".wz-chip input").forEach((i) => (i.checked = false)); sync(); };
    foot(1, "Next: Concepts →", () => go(3));
    sync();
    return;
  }

  // ---------------------------------------------------------------- 3. concepts
  if (S.step === 3) {
    head("Concept Selection", "Narrow the paper to particular concepts, or leave all unticked to use every concept in the chosen chapters.");
    body.innerHTML = `<div class="wz-card"><p class="muted center">Loading concepts…</p></div>`;
    try {
      if (!S.topics.length) S.topics = await api("/api/wizard/topics", { picks: S.picked.map(({ db, chapter }) => ({ db, chapter })) });
    } catch (e) { body.innerHTML = ""; err(e.message); foot(2); return; }
    const on = new Set(S.pickedTopics);
    const chs = [...new Set(S.topics.map((t) => t.chapter))];
    body.innerHTML = `<div class="wz-card">
      <div class="wz-tools"><input class="wz-search" placeholder="Search target concepts..."><span class="sp"></span>
        <button class="btn btn-sm" data-none>Use all concepts</button></div>
      ${chs.map((ch) => `<p class="eyebrow">${esc(ch)}</p><div class="wz-chips">${S.topics.filter((t) => t.chapter === ch && t.topic).map((t) => `
        <label class="wz-chip" data-t="${esc(t.topic.toLowerCase())}"><input type="checkbox" value="${esc(t.topic)}" ${on.has(t.topic) ? "checked" : ""}>
        <span>${esc(t.topic)}</span><em>${t.count}</em></label>`).join("") || `<span class="muted">No concepts recorded.</span>`}</div>`).join("")}
    </div>`;
    const sync = () => { S.pickedTopics = [...new Set([...body.querySelectorAll(".wz-chip input:checked")].map((i) => i.value))]; S.pool = []; };
    body.querySelector(".wz-search").oninput = (e) => body.querySelectorAll(".wz-chip").forEach((c) => (c.hidden = !c.dataset.t.includes(e.target.value.toLowerCase())));
    body.querySelectorAll(".wz-chip input").forEach((i) => (i.onchange = sync));
    body.querySelector("[data-none]").onclick = () => { body.querySelectorAll(".wz-chip input").forEach((i) => (i.checked = false)); sync(); };
    foot(2, S.mode === "auto" ? "Next: Questions per Chapter →" : "Next: Select Questions →", () => go(S.mode === "auto" ? 4 : 6));
    return;
  }

  // ---------------------------------------------------------------- 4. questions per chapter (auto)
  if (S.step === 4) {
    head("Questions per Chapter", "Set how many questions each chapter contributes.");
    if (!S.total) S.total = P.defaultTotal;
    if (!Object.keys(S.quota).length) spread();
    body.innerHTML = `<div class="wz-card">
      <div class="wz-tools"><label class="inline">Target total questions <input type="number" class="wz-total" min="1" max="300" value="${S.total}" placeholder="e.g. 25, 50"></label>
        <button class="btn btn-sm" data-even>Distribute evenly</button></div>
      <div class="wz-quota">${S.picked.map((c) => `<div class="wz-qrow"><div><b>${esc(c.chapter)}</b>
        <small class="muted">Class ${c.klass} · ${c.count} in bank</small></div>
        <label><span class="muted">Questions from this chapter</span><input type="number" min="0" max="${c.count}" data-q="${esc(qkey(c))}" value="${S.quota[qkey(c)] || 0}"></label></div>`).join("")}</div>
      <div class="wz-sum">Total questions across chapters: <b class="wz-tq"></b> / <span class="wz-tt">${S.total}</span></div></div>`;
    const sum = () => {
      const t = Object.values(S.quota).reduce((a, b) => a + (+b || 0), 0);
      body.querySelector(".wz-tq").textContent = t;
      body.querySelector(".wz-sum").classList.toggle("off", t !== S.total);
      return t;
    };
    body.querySelectorAll("[data-q]").forEach((i) => (i.oninput = () => { S.quota[i.dataset.q] = Math.max(0, +i.value || 0); sum(); }));
    body.querySelector(".wz-total").oninput = (e) => { S.total = Math.max(1, +e.target.value || 1); body.querySelector(".wz-tt").textContent = S.total; sum(); };
    body.querySelector("[data-even]").onclick = () => { spread(); viewWizard(root, ctx); };
    foot(3, "Next: Questions per Type →", () => {
      const t = sum();
      if (!t) return err("Give at least one chapter some questions.");
      S.total = t; S.typeCount = {}; go(5);
    });
    sum();
    return;
  }

  function spread() {
    S.quota = {};
    const n = S.picked.length;
    S.picked.forEach((c, i) => (S.quota[qkey(c)] = Math.floor(S.total / n) + (i < S.total % n ? 1 : 0)));
  }

  // ---------------------------------------------------------------- 5. questions per type (auto)
  if (S.step === 5) {
    head("Questions per Type", "Split the paper by question type and difficulty.");
    const types = TYPES.filter((t) => t.key !== "numerical" || P.numerical);
    if (!Object.keys(S.typeCount).length) S.typeCount = { mcq: S.total };
    body.innerHTML = `<div class="wz-card">
      <div class="wz-types">${types.map((t) => `<div class="wz-type"><div><h4>${t.label}</h4><small class="muted">${t.desc}</small></div>
        <input type="number" min="0" max="${S.total}" data-t="${t.key}" value="${S.typeCount[t.key] || 0}"></div>`).join("")}</div>
      <div class="wz-sum">Question type allocation vs chapter total: <b class="wz-ty"></b> / ${S.total}</div>
      <p class="eyebrow" style="margin-top:18px">Difficulty distribution</p>
      <div class="wz-diff">${["easy", "medium", "hard"].map((d) => `<label class="d-${d}"><span>${d[0].toUpperCase() + d.slice(1)} <b data-dv="${d}">${S.diff[d]}%</b></span>
        <input type="range" min="0" max="100" step="5" data-d="${d}" value="${S.diff[d]}"></label>`).join("")}</div>
      <p class="muted small">Questions are fetched to match this split where the bank allows. Sliders auto-balance to 100%.</p></div>`;
    const tsum = () => {
      const t = Object.values(S.typeCount).reduce((a, b) => a + (+b || 0), 0);
      body.querySelector(".wz-ty").textContent = t;
      body.querySelectorAll(".wz-sum")[0].classList.toggle("off", t !== S.total);
      return t;
    };
    body.querySelectorAll("[data-t]").forEach((i) => (i.oninput = () => { S.typeCount[i.dataset.t] = Math.max(0, +i.value || 0); tsum(); }));
    body.querySelectorAll("[data-d]").forEach((r) => (r.oninput = () => {
      const d = r.dataset.d, v = +r.value, others = ["easy", "medium", "hard"].filter((x) => x !== d);
      const rest = 100 - v, cur = others.reduce((a, x) => a + S.diff[x], 0) || 1;
      S.diff[d] = v;
      others.forEach((x, i) => (S.diff[x] = i === 0 ? Math.round((S.diff[x] / cur) * rest / 5) * 5 : 0));
      S.diff[others[1]] = 100 - v - S.diff[others[0]];
      ["easy", "medium", "hard"].forEach((x) => { body.querySelector(`[data-d="${x}"]`).value = S.diff[x]; body.querySelector(`[data-dv="${x}"]`).textContent = `${S.diff[x]}%`; });
    }));
    const f = foot(4, "Execute Auto Fetch & Preview →", async () => {
      if (tsum() !== S.total) return err(`The type split must add up to ${S.total}.`);
      const btn = f.querySelector("[data-next]");
      btn.disabled = true; btn.textContent = "Fetching questions…"; err("");
      try {
        const res = await api("/api/wizard/autofetch", {
          picks: S.picked.map((c) => ({ db: c.db, chapter: c.chapter, count: S.quota[qkey(c)] || 0 })),
          topics: S.pickedTopics, types: S.typeCount, difficulty: S.diff,
        });
        S.selected = new Map(res.questions.map((q) => [q.id, q]));
        S.short = res.short;
        go(7);
      } catch (e) { err(`Fetch failed: ${e.message}`); btn.disabled = false; btn.textContent = "Execute Auto Fetch & Preview →"; }
    });
    tsum();
    return;
  }

  // ---------------------------------------------------------------- 6. select questions (manual)
  if (S.step === 6) {
    head("Select Questions", "Click any question card to select or unselect it.");
    body.innerHTML = `<div class="wz-card"><p class="muted center">Loading questions…</p></div>`;
    try {
      if (!S.pool.length) S.pool = await api("/api/wizard/browse", { picks: S.picked.map(({ db, chapter }) => ({ db, chapter })), topics: S.pickedTopics });
    } catch (e) { body.innerHTML = ""; err(e.message); foot(3); return; }
    const F = S.filters;
    const topicsHere = [...new Set(S.pool.map((q) => q.topic).filter(Boolean))].sort();
    body.innerHTML = `<div class="wz-card wz-filters">
        <select data-f="chapter"><option value="">All chapters</option>${S.picked.map((c) => `<option>${esc(c.chapter)}</option>`).join("")}</select>
        <select data-f="topic"><option value="">All concepts</option>${topicsHere.map((t) => `<option>${esc(t)}</option>`).join("")}</select>
        <div class="pills small">${[["all", "All"], ["easy", "Easy"], ["medium", "Med"], ["hard", "Hard"]].map(([k, l]) => `<button data-diff="${k}" class="${F.diff === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <select data-f="type"><option value="all">All question types</option><option value="match">Match the Following (MTF)</option><option value="ar">Assertion & Reason (AR)</option>
          <option value="mcq">Standard MCQ (Single Correct)</option><option value="stmt">Statement Based</option><option value="diag">Diagram Based</option>
          ${P.numerical ? `<option value="numerical">Numerical / Section B (JEE)</option>` : ""}</select>
        <input data-f="search" placeholder="Search questions by text or keywords..." value="${esc(F.search)}">
      </div>
      <div class="wz-selbar"><span class="wz-count"></span><span class="muted">Click any question card to select / unselect</span></div>
      <div class="qcards wz-pool"></div>`;
    ["chapter", "topic", "type"].forEach((k) => (body.querySelector(`[data-f="${k}"]`).value = F[k]));
    const list = body.querySelector(".wz-pool");
    const count = () => (body.querySelector(".wz-count").innerHTML = `<b>${S.selected.size}</b> selected`);
    const draw = () => {
      const s = F.search.toLowerCase();
      const shown = S.pool.filter((q) => (!F.chapter || q.chapter === F.chapter) && (!F.topic || q.topic === F.topic)
        && (F.diff === "all" || q.difficulty === F.diff) && (F.type === "all" || q.category === F.type) && (!s || q.text.toLowerCase().includes(s)));
      list.innerHTML = shown.length ? "" : `<div class="wz-card center"><div style="font-size:28px">🔍</div><b>No questions match your current filters</b></div>`;
      shown.slice(0, 120).forEach((q, i) => list.appendChild(card(q, i + 1, true)));
      if (shown.length > 120) list.insertAdjacentHTML("beforeend", `<p class="muted center">Showing 120 of ${shown.length}. Narrow the filters to see the rest.</p>`);
    };
    body.querySelectorAll("[data-f]").forEach((el) => (el.oninput = () => { F[el.dataset.f] = el.value; draw(); }));
    body.querySelectorAll("[data-diff]").forEach((b) => (b.onclick = () => { F.diff = b.dataset.diff; body.querySelectorAll("[data-diff]").forEach((x) => x.classList.toggle("on", x === b)); draw(); }));
    list.addEventListener("click", (e) => {
      const c = e.target.closest(".qcard[data-id]");
      if (!c) return;
      const q = S.pool.find((x) => x.id === c.dataset.id);
      S.selected.has(q.id) ? S.selected.delete(q.id) : S.selected.set(q.id, q);
      c.classList.toggle("picked", S.selected.has(q.id));
      count();
    });
    draw(); count();
    foot(3, "Done Selection → Proceed to Preview & Save", () => { if (!S.selected.size) return err("Select at least one question."); go(7); });
    return;
  }

  // ---------------------------------------------------------------- 7. preview & save
  if (S.step === 7) {
    head("Preview & Save", "Check the questions, then create the paper. It opens in the paper builder with sets A-H, keys and solutions.");
    const qs = [...S.selected.values()];
    const byType = qs.reduce((m, q) => ((m[q.category] = (m[q.category] || 0) + 1), m), {});
    body.innerHTML = `
      ${S.short.length ? `<div class="wz-card warn">Not enough questions in the bank for: ${S.short.map((s) => `${esc(s.chapter)} (${s.got} of ${s.wanted})`).join(", ")}.</div>` : ""}
      <div class="wz-card wz-summary">
        <div><span class="eyebrow">Questions</span><b>${qs.length}</b></div>
        <div><span class="eyebrow">Marks each</span><input type="number" class="wz-mpq" min="0" value="${P.marksPerQ}"></div>
        <div><span class="eyebrow">Total marks</span><b class="wz-tm">${qs.length * P.marksPerQ}</b></div>
        <div><span class="eyebrow">Types</span><span>${Object.entries(byType).map(([k, v]) => `${TYPE_SHORT[k] || k} ${v}`).join(" · ")}</span></div>
      </div>
      <div class="qcards wz-preview"></div>`;
    const list = body.querySelector(".wz-preview");
    qs.forEach((q, i) => {
      const c = card(q, i + 1, false);
      const rm = document.createElement("button");
      rm.className = "btn btn-red btn-xs wz-rm";
      rm.innerHTML = `${icon("trash", 11)} Remove`;
      rm.onclick = () => { S.selected.delete(q.id); viewWizard(root, ctx); };
      c.querySelector(".qcard-top").appendChild(rm);
      list.appendChild(c);
    });
    body.querySelector(".wz-mpq").oninput = (e) => (body.querySelector(".wz-tm").textContent = qs.length * (+e.target.value || 0));
    const f = foot(S.mode === "auto" ? 5 : 6, `${icon("papers", 14)} Create paper (sets A-H)`, async () => {
      if (!qs.length) return err("No questions selected.");
      const btn = f.querySelector("[data-next]");
      btn.disabled = true;
      const order = ["Physics", "Chemistry", "Mathematics", "Biology", "Botany", "Zoology"];
      const saved = qs.map((q, i) => ({ ...q, subject: q.subject || S.subject, createdAt: Date.now() + i }))
        .sort((a, b) => (order.indexOf(a.subject) + 1 || 9) - (order.indexOf(b.subject) + 1 || 9));
      for (const q of saved) await store.saveQuestion(q);
      const p = newPaper(saved.map((q) => q.id), saved);
      const mpq = +body.querySelector(".wz-mpq").value || 0;
      p.name = S.title || `${S.pattern} ${S.subject} Examination`;
      Object.assign(p.header, {
        examTitle: p.name, subject: S.subject, maxMarks: String(saved.length * mpq),
        className: S.klass === "Both" ? "I & II PUC" : S.klass === "11" ? "I PUC" : "II PUC",
        instructions: [`Each question carries ${mpq} mark${mpq === 1 ? "" : "s"}.`, "Choose the correct option and mark it in the OMR sheet."],
      });
      await store.savePaper(p);
      toast("Paper created with sets A-H.");
      S = fresh();
      location.hash = `paper/${p.id}`;
    });
    return;
  }

  // ---------------------------------------------------------------- helpers
  function card(q, n, selectable) {
    const c = document.createElement("div");
    c.className = "qcard" + (selectable ? " selectable" : "") + (S.selected.has(q.id) ? " picked" : "");
    c.dataset.id = q.id;
    c.innerHTML = `<div class="qcard-top"><span class="chip">${esc(q.chapter)}</span>${q.topic ? `<span class="chip">${esc(q.topic)}</span>` : ""}
      <span class="chip">${TYPE_SHORT[q.category] || "MCQ"}</span>${q.difficulty ? `<span class="chip d-${q.difficulty}">${q.difficulty}</span>` : ""}
      <span class="sp"></span>${selectable ? `<span class="wz-tick">✓</span>` : ""}</div>
      <div class="qcard-q"><b>Q${n}.</b><span class="t"></span></div>
      ${q.type === "NUMERICAL" ? `<div class="qopt ok"><span class="l">✓</span><span class="t">${esc(q.numAnswer)}</span></div>`
        : q.options.map((o, i) => `<div class="qopt ${q.answer.includes(i) ? "ok" : ""}"><span class="l">${"ABCD"[i]}</span><span class="t" data-o="${i}"></span></div>`).join("")}`;
    const t = c.querySelector(".qcard-q .t");
    renderMath(t, q.text);
    for (const f of q.images || []) t.appendChild(figureEl({ ...f, width: 50 }));
    c.querySelectorAll("[data-o]").forEach((el) => renderMath(el, q.options[+el.dataset.o].text));
    return c;
  }
}

function summary(n) {
  if (n === 1) return S.subject ? `${S.pattern} · ${S.subject}` : "";
  if (n === 2) return S.picked.length ? `${S.picked.length} chapter${S.picked.length > 1 ? "s" : ""}` : "";
  if (n === 3) return S.step > 3 ? (S.pickedTopics.length ? `${S.pickedTopics.length} concepts` : "All concepts") : "";
  if (n === 4) return S.step > 4 ? `${S.total} questions` : "";
  if (n === 5) return S.step > 5 ? `${Object.values(S.typeCount).filter(Boolean).length} types` : "";
  if (n === 6) return S.selected.size ? `${S.selected.size} selected` : "";
  return "";
}

function facts() {
  const f = [];
  if (S.pattern) f.push(["Exam", S.pattern]);
  if (S.subject) f.push(["Subject", S.subject]);
  f.push(["Class", S.klass === "Both" ? "11 & 12" : S.klass]);
  if (S.mode) f.push(["Mode", S.mode === "auto" ? "Auto fetch" : "Manual"]);
  if (S.picked.length) f.push(["Chapters", String(S.picked.length)]);
  const n = S.selected.size || (S.step >= 4 && S.mode === "auto" ? S.total : 0);
  if (n) f.push(["Questions", String(n)]);
  return S.pattern || S.subject ? f : [];
}
