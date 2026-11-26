// Tests: New Test (session form + marking pattern) · Unpublished · Published, and the test editor
// (Bank Questions · Institution Questions · Review · Settings). A test is stored as a Paper with a
// `test` block; publishing builds sets A-H and opens the printable paper.
//
// Paper.test {
//   mode: "offline" | "online" | "both", name, shortName, description,
//   pattern, total, minutes, plus, minus, marks,
//   start, close (ms), classes: [string], subjects: [string], staff: [string],
//   status: "draft" | "published", createdAt, publishedAt
// }
// Paper.qmeta { [questionId]: { section, track } }

import { esc, renderMath, figureEl } from "./render.js";
import { icon } from "./icons.js";
import { openCropModal } from "./crop-modal.js";
import { generateSets, syncSets } from "./shuffle.js";

// ------------------------------------------------------------------ marking patterns
const PCM = ["Physics", "Chemistry", "Mathematics"];
const NEET_SUBJ = ["Physics", "Chemistry", "Biology"];
export const PATTERNS = [
  { id: "old", label: "1 min per question · +4 correct · −1 wrong (old NEET/JEE)", perQMin: 1, plus: 4, minus: -1 },
  { id: "neet25", label: "NEET 2025 · 180 Q · 180 min · 720 marks (each subject 45 Q)", total: 180, minutes: 180, plus: 4, minus: -1, marks: 720, subjects: NEET_SUBJ, sections: [{ name: "Section A", q: 45 }] },
  { id: "neet24", label: "NEET 2024 · 200 Q · 200 min · 720 marks (each subject: Section A 35 Q + Section B 15 Q)", total: 200, minutes: 200, plus: 4, minus: -1, marks: 720, subjects: NEET_SUBJ, sections: [{ name: "Section A", q: 35 }, { name: "Section B", q: 15 }] },
  { id: "neet21", label: "NEET 2021 · 200 Q · 180 min · 720 marks (each subject: Section A 35 Q + Section B 15 Q)", total: 200, minutes: 180, plus: 4, minus: -1, marks: 720, subjects: NEET_SUBJ, sections: [{ name: "Section A", q: 35 }, { name: "Section B", q: 15 }] },
  { id: "jee25", label: "JEE Main 2025 · 75 Q · 180 min · 300 marks (each subject: 20 MCQ + 5 integer, both negative)", total: 75, minutes: 180, plus: 4, minus: -1, marks: 300, subjects: PCM, sections: [{ name: "Section A (MCQ)", q: 20 }, { name: "Section B (Integer)", q: 5, integer: true }] },
  { id: "jee23", label: "JEE Main 2023 · 90 Q · 180 min · 300 marks (each subject: 20 MCQ + 10 integer, both negative)", total: 90, minutes: 180, plus: 4, minus: -1, marks: 300, subjects: PCM, sections: [{ name: "Section A (MCQ)", q: 20 }, { name: "Section B (Integer)", q: 10, integer: true }] },
  { id: "jee21", label: "JEE Main 2021 · 90 Q · 180 min · 300 marks (each subject: 20 MCQ + 10 integer)", total: 90, minutes: 180, plus: 4, minus: -1, marks: 300, subjects: PCM, sections: [{ name: "Section A (MCQ)", q: 20 }, { name: "Section B (Integer)", q: 10, integer: true }] },
  { id: "jee20", label: "JEE Main 2020 · 75 Q · 180 min · 300 marks (each subject: 20 MCQ + 5 integer)", total: 75, minutes: 180, plus: 4, minus: -1, marks: 300, subjects: PCM, sections: [{ name: "Section A (MCQ)", q: 20 }, { name: "Section B (Integer)", q: 5, integer: true }] },
  { id: "kcet", label: "KCET · 1 min per question · +1 correct · 0 wrong", perQMin: 1, plus: 1, minus: 0 },
  { id: "kvpysa", label: "KVPY SA · each subject 45 min: Part I 15 MCQ + Part II 5 MCQ (25 marks)", perSubjectMin: 45, plus: 1, minus: -0.25, sections: [{ name: "Part I", q: 15 }, { name: "Part II", q: 5 }], marksPerSubject: 25 },
  { id: "kvpysx", label: "KVPY SX · each subject 45 min: Part I 20 MCQ + Part II 10 MCQ (40 marks)", perSubjectMin: 45, plus: 1, minus: -0.25, sections: [{ name: "Part I", q: 20 }, { name: "Part II", q: 10 }], marksPerSubject: 40 },
  { id: "custom", label: "Custom: set your own time and marks", custom: true },
];
const patternOf = (id) => PATTERNS.find((p) => p.id === id) || PATTERNS[0];
const NEG = [0, -0.25, -0.5, -0.75, -1, -2, -3, -4];
const SUBJECTS = ["Physics", "Chemistry", "Mathematics", "Biology"];
const BIO_SPLIT = ["Botany", "Zoology"];
const SUBJ_SHORT = { Physics: "P", Chemistry: "C", Mathematics: "M", Biology: "Bio", Botany: "Bio", Zoology: "Bio" };
const CATEGORIES = [["mcq", "4 options (single correct)"], ["numerical", "Integer / numerical"], ["ar", "Assertion and reason"],
  ["match", "Match / table based"], ["stmt", "Statement based"], ["diag", "Diagram based"]];
const LEVELS = { 1: "Easy", 2: "Medium", 3: "Difficult", 4: "Very hard" };
const MODES = { offline: "Offline (OMR / paper)", online: "Online", both: "Online and offline" };

/** Time, total questions and marks of a test from its pattern (custom values win for Custom). */
function computeTiming(t) {
  const p = patternOf(t.pattern);
  const nSubj = Math.max(1, t.subjects?.length || 1);
  if (p.custom) return { minutes: +t.minutes || 0, plus: +t.plus || 0, minus: +t.minus || 0, marks: (+t.total || 0) * (+t.plus || 0) };
  const total = +t.total || p.total || 0;
  const minutes = p.minutes || (p.perQMin ? total * p.perQMin : p.perSubjectMin ? p.perSubjectMin * nSubj : 0);
  const marks = p.marks || (p.marksPerSubject ? p.marksPerSubject * nSubj : total * p.plus);
  return { minutes, plus: p.plus, minus: p.minus, marks };
}
const defaultTotal = (patternId, subjects) => {
  const p = patternOf(patternId);
  if (p.total) return p.total;
  if (p.sections && p.perSubjectMin) return p.sections.reduce((s, x) => s + x.q, 0) * Math.max(1, subjects.length);
  return "";
};

// ------------------------------------------------------------------ small helpers
const pad2 = (n) => String(n).padStart(2, "0");
const toLocalInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");
const fmtDay = (ms) => { const d = new Date(ms); return `${ordinal(d.getDate())} ${d.toLocaleString("en-GB", { month: "long" })} ${d.getFullYear()} · ${d.toLocaleString("en-GB", { weekday: "long" })}`; };
const fmtWhen = (ms) => new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${pad2(m % 60)} min` : `${m} min`);
const ago = (ms) => {
  const d = (Date.now() - ms) / 86400000;
  return d < 1 ? "today" : d < 30 ? `${Math.round(d)} day${Math.round(d) > 1 ? "s" : ""} ago` : d < 365 ? `${Math.round(d / 30)} month${Math.round(d / 30) > 1 ? "s" : ""} ago` : `${Math.round(d / 365)} year(s) ago`;
};
const isTest = (p) => !!p.test;
const isPublished = (p) => !p.test || p.test.status === "published";
const testName = (p) => p.test?.name || p.header?.examTitle || p.name;

async function api(path, body) {
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || `Request failed (${r.status})`);
  return data;
}

// remembered pick lists (classes, staff) so the next test offers them again
function remembered(key, defaults) {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); return Array.isArray(v) ? v : defaults; } catch { return defaults; }
}
function remember(key, values, defaults) {
  const all = [...new Set([...remembered(key, defaults), ...values])];
  try { localStorage.setItem(key, JSON.stringify(all)); } catch { /* storage blocked */ }
}

/** Chips + text box. Enter or comma adds; the list offers earlier entries. */
function tagPicker(el, values, suggestions, placeholder) {
  const id = `dl_${Math.random().toString(36).slice(2, 8)}`;
  const draw = () => {
    el.innerHTML = `<div class="tagsel">${values.map((v, i) => `<span class="tag">${esc(v)}<button type="button" data-i="${i}" title="Remove">×</button></span>`).join("")}
      <input list="${id}" placeholder="${esc(values.length ? "" : placeholder)}"><datalist id="${id}">${suggestions.filter((s) => !values.includes(s)).map((s) => `<option value="${esc(s)}">`).join("")}</datalist></div>`;
    const inp = el.querySelector("input");
    const add = () => {
      const v = inp.value.replace(/,$/, "").trim();
      inp.value = "";             // cleared first: redrawing blurs this box, and blur must not add it again
      if (v && !values.includes(v)) values.push(v);
      draw();
      el.querySelector("input").focus();
    };
    inp.onkeydown = (e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } else if (e.key === "Backspace" && !inp.value && values.length) { values.pop(); draw(); el.querySelector("input").focus(); } };
    inp.onchange = () => { if (suggestions.includes(inp.value)) add(); };
    inp.onblur = () => { if (inp.value.trim()) add(); };
    el.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { values.splice(+b.dataset.i, 1); draw(); }));
    el.querySelector(".tagsel").onclick = (e) => { if (e.target.classList.contains("tagsel")) inp.focus(); };
  };
  draw();
  return values;
}

/** Question card used by every list in the test editor. */
function qCard(q, num, { top = "", right = "", partEdit } = {}) {
  const card = document.createElement("div");
  card.className = "qcard tcard";
  const lvl = q.level ? `L${q.level} ${LEVELS[q.level]}` : q.difficulty ? q.difficulty[0].toUpperCase() + q.difficulty.slice(1) : "";
  const pencil = (part, i = "") => (partEdit ? `<button class="btn btn-ico light pe" data-part="${part}" data-i="${i}" title="Edit">${icon("edit", 13)}</button>` : "");
  card.innerHTML = `
    <div class="qcard-top">${top}
      ${q.subject ? `<span class="chip">${esc(q.subject)}</span>` : ""}
      ${lvl ? `<span class="chip">${esc(lvl)}</span>` : ""}
      <span class="sp"></span>${right}</div>
    <div class="qcard-q"><b>Q${num}.</b><span class="t"></span>${pencil("text")}</div>
    ${q.type === "NUMERICAL" ? `<div class="qopt ok"><span class="l">✓</span><span class="t">${esc(q.numAnswer)}</span>${pencil("num")}</div>`
      : (q.options || []).map((o, i) => `<div class="qopt ${q.answer?.includes(i) ? "ok" : ""}"><span class="l">${"ABCD"[i]}</span><span class="t" data-o="${i}"></span>${pencil("option", i)}</div>`).join("")}
    ${q.solution || q.solutionImages?.length || partEdit ? `<div class="qsol"><span class="t"></span>${pencil("solution")}</div>` : ""}`;
  const t = card.querySelector(".qcard-q .t");
  renderMath(t, q.text);
  for (const f of q.images || []) t.appendChild(figureEl({ ...f, width: Math.min(f.width || 70, 55) }));
  card.querySelectorAll("[data-o]").forEach((el) => {
    const o = q.options[+el.dataset.o];
    renderMath(el, o.text);
    for (const f of o.images || []) el.appendChild(figureEl({ ...f, width: 40 }));
  });
  const sol = card.querySelector(".qsol .t");
  if (sol) {
    renderMath(sol, q.solution || (partEdit ? "No solution yet." : ""));
    for (const f of q.solutionImages || []) sol.appendChild(figureEl({ ...f, width: 50 }));
  }
  if (partEdit) card.querySelectorAll(".pe").forEach((b) => (b.onclick = () => partEdit(b.dataset.part, b.dataset.i === "" ? null : +b.dataset.i)));
  return card;
}

// ================================================================== module entry
export function initTests(ctx) {
  const { view, shell, toast, store, modal, editQuestion } = ctx;
  const $ = (s, r = view) => r.querySelector(s);

  const testsTabs = (on) => [
    { label: "New Test", ic: "plus", href: "#tests", on: on === "new" },
    { label: "Unpublished Tests", ic: "edit", href: "#tests/unpublished", on: on === "unpublished" },
    { label: "Published Tests", ic: "papers", href: "#tests/published", on: on === "published" },
  ];

  // ---------------------------------------------------------------- session form (new + settings)
  function sessionForm(root, t, { submitLabel, onSubmit, onDelete }) {
    const classes = t.classes.slice(), staff = t.staff.slice();
    const showBZ = t.subjects.some((s) => BIO_SPLIT.includes(s));
    root.innerHTML = `
      <form class="tform" novalidate>
        <div class="tgrid">
          <label>Test type <span class="req">*</span><select name="kind"><option>1. Standard test</option></select></label>
          <label>Offline / online? <span class="req">*</span><select name="mode">${Object.entries(MODES).map(([k, v], i) => `<option value="${k}">${i + 1}. ${v}</option>`).join("")}</select></label>
        </div>
        <label>Test name <span class="req">*</span><input name="name" value="${esc(t.name)}" placeholder="Unit test, chapter test, weekly test, cumulative test…"></label>
        <label>Short name (for PDFs and reports) <span class="req">*</span><input name="shortName" value="${esc(t.shortName)}" placeholder="Test-1, NEET-1, Weekly-3"></label>
        <label>Description <span class="req">*</span><textarea name="description" rows="2" placeholder="Chapters and topics in this test">${esc(t.description)}</textarea></label>
        <label>Time and marks pattern <span class="req">*</span><select name="pattern">${PATTERNS.map((p, i) => `<option value="${p.id}">${i + 1}. ${esc(p.label)}</option>`).join("")}</select></label>
        <div class="tgrid">
          <label>Total questions <span class="req">*</span><input name="total" type="number" min="1" max="500" value="${esc(t.total)}" placeholder="Total questions"></label>
          <label class="t-custom">Total duration (minutes) <span class="req">*</span><input name="minutes" type="number" min="1" value="${esc(t.minutes || "")}"></label>
          <label class="t-custom">Marks for a correct answer <span class="req">*</span><input name="plus" type="number" step="0.25" value="${esc(t.plus ?? 4)}"></label>
          <label class="t-custom">Marks for a wrong answer <span class="req">*</span><select name="minus">${NEG.map((n) => `<option value="${n}">${n === 0 ? "No negative marking" : n}</option>`).join("")}</select></label>
        </div>
        <p class="t-summary muted"></p>
        <div class="tgrid">
          <label>Start time <span class="req">*</span><input name="start" type="datetime-local" value="${toLocalInput(t.start)}"></label>
          <label>Close time <span class="req">*</span><input name="close" type="datetime-local" value="${toLocalInput(t.close)}"></label>
        </div>
        <div class="tfield"><span class="tl">Class(es) <span class="req">*</span></span><div class="t-classes"></div></div>
        <div class="tfield"><span class="tl">Subject(s) <span class="req">*</span> <button type="button" class="linkbtn t-bz">${showBZ ? "Hide" : "Show"} Botany &amp; Zoology</button></span>
          <div class="t-subj">${[...SUBJECTS, ...BIO_SPLIT].map((s) => `<label class="chk ${BIO_SPLIT.includes(s) ? "bz" : ""}" ${BIO_SPLIT.includes(s) && !showBZ ? "hidden" : ""}><input type="checkbox" value="${s}" ${t.subjects.includes(s) ? "checked" : ""}> ${s}</label>`).join("")}</div></div>
        <div class="tfield"><span class="tl">Staff <span class="muted">(who prepares the test)</span></span><div class="t-staff"></div></div>
        <div class="tform-foot">
          ${onDelete ? `<button type="button" class="btn btn-red t-del">${icon("trash", 14)} Delete</button>` : ""}
          <span class="sp"></span><span class="t-msg"></span>
          <button class="btn btn-blue">${esc(submitLabel)}</button>
        </div>
      </form>`;
    const f = root.querySelector("form");
    f.mode.value = t.mode; f.pattern.value = t.pattern; f.minus.value = String(t.minus ?? -1);
    tagPicker(root.querySelector(".t-classes"), classes, remembered("ps.classes", ["11th PCMB", "11th PCMC", "12th PCMB", "12th PCMC"]), "Type a class and press Enter, e.g. 12th PCMB - A");
    tagPicker(root.querySelector(".t-staff"), staff, remembered("ps.staff", []), "Type a name and press Enter");
    const subjects = () => [...f.querySelectorAll(".t-subj input:checked")].map((c) => c.value);
    const read = () => ({
      ...t, mode: f.mode.value, name: f.name.value.trim(), shortName: f.shortName.value.trim(), description: f.description.value.trim(),
      pattern: f.pattern.value, total: +f.total.value || 0, minutes: +f.minutes.value || 0, plus: +f.plus.value || 0, minus: +f.minus.value,
      start: new Date(f.start.value).getTime(), close: new Date(f.close.value).getTime(), classes, staff, subjects: subjects(),
    });
    const refresh = () => {
      const p = patternOf(f.pattern.value);
      root.querySelectorAll(".t-custom").forEach((x) => (x.hidden = !p.custom));
      const c = computeTiming(read());
      root.querySelector(".t-summary").textContent = c.minutes
        ? `${fmtMin(c.minutes)} · ${c.marks} marks · +${c.plus} correct, ${c.minus || 0} wrong${p.sections ? ` · each subject: ${p.sections.map((s) => `${s.name} ${s.q} Q`).join(" + ")}` : ""}`
        : "";
    };
    f.pattern.onchange = () => {
      const p = patternOf(f.pattern.value);
      if (p.subjects) f.querySelectorAll(".t-subj input").forEach((c) => (c.checked = p.subjects.includes(c.value)));
      const d = defaultTotal(p.id, subjects());
      if (d) f.total.value = d;
      refresh();
    };
    f.oninput = refresh;
    f.start.onchange = () => {
      const c = computeTiming(read());
      if (c.minutes && f.start.value) f.close.value = toLocalInput(new Date(f.start.value).getTime() + c.minutes * 60000);
    };
    root.querySelector(".t-bz").onclick = (e) => {
      const show = e.target.textContent.startsWith("Show");
      root.querySelectorAll(".chk.bz").forEach((x) => { x.hidden = !show; if (!show) x.querySelector("input").checked = false; });
      e.target.textContent = `${show ? "Hide" : "Show"} Botany & Zoology`;
    };
    root.querySelector(".t-del")?.addEventListener("click", onDelete);
    refresh();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const v = read();
      const msg = root.querySelector(".t-msg");
      const problem = !v.name ? "Enter the test name." : !v.shortName ? "Enter the short name." : !v.description ? "Enter a description."
        : !(v.total > 0) ? "Enter the total number of questions."
        : patternOf(v.pattern).custom && !(v.minutes > 0) ? "Enter the duration in minutes."
        : !(v.start > 0) || !(v.close > 0) ? "Set the start and close time." : v.close <= v.start ? "Close time must be after the start time."
        : !v.classes.length ? "Add at least one class." : !v.subjects.length ? "Tick at least one subject." : "";
      if (problem) { msg.textContent = problem; msg.className = "t-msg err"; return; }
      Object.assign(v, computeTiming(v));
      remember("ps.classes", v.classes, []);
      remember("ps.staff", v.staff, []);
      msg.textContent = "";
      await onSubmit(v);
    };
  }

  /** Paper header fields that follow the test details. */
  function applyHeader(p, first) {
    const t = p.test, h = p.header;
    Object.assign(h, {
      examTitle: t.name, subject: t.subjects.join(", "), className: t.classes.join(", "), time: fmtMin(t.minutes),
      maxMarks: String(t.marks), date: new Date(t.start).toLocaleDateString("en-GB").replace(/\//g, "."),
    });
    if (first) h.instructions = [
      `Each question carries ${t.plus} mark${t.plus === 1 ? "" : "s"}.${t.minus ? ` ${Math.abs(t.minus)} mark${Math.abs(t.minus) === 1 ? "" : "s"} will be deducted for a wrong answer.` : " There is no negative marking."}`,
      t.mode === "online" ? "Answer on the screen." : "Choose the correct option and mark it in the OMR sheet.",
    ];
    p.name = t.name;
  }

  // ---------------------------------------------------------------- New Test
  async function viewNewTest() {
    shell("Tests", { label: "Back to Questions", href: "#add", crumbs: ["Tests"] }, testsTabs("new"));
    const now = Date.now() + 5 * 60000;
    const t = { mode: "offline", name: "", shortName: "", description: "", pattern: "old", total: "", minutes: 60, plus: 4, minus: -1,
      start: now, close: now + 60 * 60000, classes: [], subjects: [], staff: [], status: "draft" };
    view.innerHTML = `<div class="card narrow"><div class="card-h"><span class="dot"></span> New Test</div><div class="t-form"></div></div>`;
    sessionForm($(".t-form"), t, {
      submitLabel: "Create Test Template",
      onSubmit: async (v) => {
        const p = ctx.newPaper([], []);
        p.test = { ...v, status: "draft", createdAt: Date.now() };
        p.qmeta = {};
        applyHeader(p, true);
        await store.savePaper(p);
        toast("Test template created. Now add its questions.");
        location.hash = `test/${p.id}/bank`;
      },
    });
  }

  // ---------------------------------------------------------------- lists
  async function viewList(which) {
    shell("Tests", { label: "Back to Questions", href: "#add", crumbs: ["Tests"] }, testsTabs(which));
    const all = (await store.listPapers()).filter((p) => (which === "published" ? isPublished(p) : !isPublished(p)));
    const when = (p) => p.test?.start || p.updatedAt || 0;
    all.sort((a, b) => when(b) - when(a));
    let subj = "";
    view.innerHTML = `
      <div class="pb-head"><div class="pills subj">${[["", "All"], ["P", "P"], ["C", "C"], ["M", "M"], ["Bio", "Bio"]]
        .map(([v, l]) => `<button data-s="${v}" class="${v === subj ? "on" : ""}">${l}</button>`).join("")}</div>
        <span class="sp"></span><a class="btn btn-blue btn-sm" href="#tests">${icon("plus", 14)} New Test</a></div>
      <div class="t-list"></div>`;
    const draw = () => {
      const box = $(".t-list");
      const list = all.filter((p) => !subj || (p.test?.subjects || (p.header?.subject || "").split(/,\s*/)).some((s) => SUBJ_SHORT[s] === subj));
      if (!list.length) {
        box.innerHTML = `<div class="card narrow empty">${icon("papers", 34)}<p>${which === "published" ? "No published tests yet. Publish a test from its Review tab." : "No unpublished tests. Create one on the New Test tab."}</p></div>`;
        return;
      }
      const groups = new Map();
      for (const p of list) { const k = new Date(when(p)).toDateString(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
      let n = 0;
      box.innerHTML = [...groups.values()].map((ps) => `
        <div class="t-day">${esc(fmtDay(when(ps[0])))} (${ps.length})</div>
        ${ps.map((p) => {
          const t = p.test;
          n++;
          const count = p.questionIds.length;
          return `<div class="t-item" data-id="${p.id}">
            <div class="t-item-h"><b>${n}. ${esc(testName(p))}</b><span class="sp"></span>
              ${which === "published" ? `<a class="btn btn-blue btn-xs" href="#paper/${p.id}">${icon("printer", 12)} Paper &amp; keys</a>` : ""}
              ${t ? `<a class="btn btn-xs" href="#test/${p.id}/${which === "published" ? "review" : "bank"}">${icon("edit", 12)} ${which === "published" ? "Questions" : "Open"}</a>` : ""}</div>
            <div class="t-item-chips">${t ? `<span class="chip blue">${icon("refresh", 11)} ${esc(fmtWhen(t.start))}</span><span class="chip green">${esc(t.mode === "online" ? "Online" : t.mode === "both" ? "Online + offline" : "Offline")}</span>` : `<span class="chip">Paper</span>`}
              <span class="muted">${esc(t?.description || p.header?.subject || "")}</span></div>
            <div class="t-item-stats"><span>${icon("list", 13)} ${count}${t ? ` / ${t.total}` : ""} Q</span>${t ? `<span>${icon("refresh", 13)} ${fmtMin(t.minutes)}</span><span>${icon("key", 13)} ${t.marks} marks</span>` : ""}
              ${t?.classes?.length ? `<span>${icon("layers", 13)} ${esc(t.classes.join(", "))}</span>` : ""}</div>
            ${t ? `<div class="t-item-by muted">Created${t.staff?.length ? ` by ${esc(t.staff.join(", "))}` : ""} on ${esc(fmtWhen(t.createdAt || p.updatedAt))}</div>` : ""}
          </div>`;
        }).join("")}`).join("");
      box.querySelectorAll(".t-item").forEach((el) => (el.onclick = (e) => {
        if (e.target.closest("a")) return;
        const p = all.find((x) => x.id === el.dataset.id);
        location.hash = p.test ? `test/${p.id}/${isPublished(p) ? "review" : "bank"}` : `paper/${p.id}`;
      }));
    };
    view.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => {
      subj = b.dataset.s;
      view.querySelectorAll("[data-s]").forEach((x) => x.classList.toggle("on", x === b));
      draw();
    }));
    draw();
  }

  // ---------------------------------------------------------------- test editor
  let P = null;
  async function loadTest(id) {
    P = await store.getPaper(id);
    if (!P || !P.test) { view.innerHTML = `<div class="card narrow"><p>Test not found. <a href="#tests/unpublished">Back to tests</a></p></div>`; return null; }
    P.qmeta ||= {};
    return P;
  }
  const editorTabs = (id, on) => [
    { label: "Bank Questions", ic: "layers", href: `#test/${id}/bank`, on: on === "bank" },
    { label: "Institution Questions", ic: "bank", href: `#test/${id}/inst`, on: on === "inst" },
    { label: "Review", ic: "eye", href: `#test/${id}/review`, on: on === "review" },
    { label: "Settings", ic: "gear", href: `#test/${id}/settings`, on: on === "settings" },
  ];
  const editorShell = (on) => shell(P.test.name, { label: "Back to Tests", href: isPublished(P) ? "#tests/published" : "#tests/unpublished", crumbs: ["Tests", P.test.name] }, editorTabs(P.id, on));

  /** question id -> earlier tests that used it */
  async function appearedMap() {
    const map = new Map();
    for (const p of await store.listPapers()) {
      if (p.id === P.id) continue;
      for (const id of p.questionIds) {
        if (!map.has(id)) map.set(id, []);
        map.get(id).push({ name: testName(p), when: p.test?.start || p.updatedAt || 0 });
      }
    }
    return map;
  }

  /** Where a new question goes: after the last question of the same subject (and section). */
  function sectionFor(q) {
    const secs = patternOf(P.test.pattern).sections;
    if (!secs || secs.length < 2) return secs?.[0]?.name || "";
    const integer = secs.find((s) => s.integer);
    if (integer) return q.type === "NUMERICAL" ? integer.name : secs[0].name;
    // fill sections in order: first section's quota, then the next
    const same = P.questionIds.filter((id) => P.qmeta[id]?.subject === q.subject);
    let n = same.length;
    for (const s of secs) { if (n < s.q) return s.name; n -= s.q; }
    return secs[secs.length - 1].name;
  }
  function insertIndex(q, section) {
    const order = [...P.test.subjects];
    const rank = (subject, sec) => {
      const si = order.findIndex((s) => s === subject || (s === "Biology" && BIO_SPLIT.includes(subject)) || (BIO_SPLIT.includes(s) && subject === "Biology"));
      const secs = patternOf(P.test.pattern).sections || [];
      return (si < 0 ? 99 : si) * 100 + Math.max(0, secs.findIndex((s) => s.name === sec));
    };
    const r = rank(q.subject, section);
    let at = P.questionIds.length;
    for (let i = P.questionIds.length - 1; i >= 0; i--) {
      const m = P.qmeta[P.questionIds[i]] || {};
      if (rank(m.subject, m.section) <= r) { at = i + 1; break; }
      at = i;
    }
    return at;
  }
  async function addToTest(q) {
    if (P.questionIds.includes(q.id)) return true;
    if (P.questionIds.length >= P.test.total) {
      toast(`This test is full (${P.test.total}/${P.test.total}). Remove a question or raise Total Questions in Settings.`, "err");
      return false;
    }
    const existing = await store.getQuestion(q.id);
    if (!existing) await store.saveQuestion({ ...q, createdAt: Date.now() });
    const section = sectionFor(q);
    P.questionIds.splice(insertIndex(q, section), 0, q.id);
    P.qmeta[q.id] = { ...(P.qmeta[q.id] || {}), subject: q.subject, section };
    await store.savePaper(P);
    if (P.questionIds.length === P.test.total) toast(`All ${P.test.total} questions added. Check them on the Review tab, then publish.`);
    return true;
  }
  async function removeFromTest(id) {
    P.questionIds = P.questionIds.filter((x) => x !== id);
    delete P.qmeta[id];
    await store.savePaper(P);
  }

  /** Add/Remove + "n/N" counter + "Appeared in" badge on a result card. */
  function pickable(q, num, appeared) {
    const seen = appeared.get(q.id) || [];
    const card = qCard(q, num, {
      top: seen.length ? `<button class="chip rbadge" title="Appeared in earlier tests">${icon("refresh", 11)} ${seen.length}</button>` : "",
      right: `<span class="t-act"></span>`,
    });
    const act = card.querySelector(".t-act");
    const draw = () => {
      const pos = P.questionIds.indexOf(q.id);
      card.classList.toggle("picked", pos >= 0);
      act.innerHTML = pos >= 0
        ? `<span class="chip green">${pos + 1}/${P.test.total}</span><button class="btn btn-red btn-xs">${icon("trash", 11)} Remove</button>`
        : `<button class="btn btn-blue btn-xs">${icon("plus", 11)} Add</button>`;
      act.querySelector("button").onclick = async () => {
        if (pos >= 0) await removeFromTest(q.id); else await addToTest(q);
        refreshCounters();
      };
    };
    card._draw = draw;
    draw();
    card.querySelector(".rbadge")?.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".rpop").forEach((x) => x.remove());
      const pop = document.createElement("div");
      pop.className = "rpop";
      pop.innerHTML = `<b>Appeared in</b>${seen.map((s) => `<div>${esc(s.name)} <span class="muted">(${esc(ago(s.when))})</span></div>`).join("")}`;
      e.currentTarget.after(pop);
      setTimeout(() => document.addEventListener("click", () => pop.remove(), { once: true }));
    });
    return card;
  }
  function refreshCounters() {
    view.querySelectorAll(".tcard").forEach((c) => c._draw?.());
    const b = $(".t-count");
    if (b) b.textContent = `${P.questionIds.length} / ${P.test.total} questions added`;
  }
  const countBar = () => `<div class="t-countbar"><span class="t-count"></span><span class="sp"></span><a class="btn btn-sm" href="#test/${P.id}/review">${icon("eye", 13)} Review</a></div>`;

  // ---- Bank Questions (the college databases)
  const chapterCache = new Map();
  async function viewBankTab(id) {
    if (!(await loadTest(id))) return;
    editorShell("bank");
    const st = viewBankTab.state?.id === id ? viewBankTab.state : (viewBankTab.state = { id, subject: P.test.subjects[0], chapter: "", mode: "topic", value: "", count: 10 });
    view.innerHTML = `
      ${countBar()}
      <div class="card narrow"><div class="card-h"><span class="dot"></span> Bank Questions</div>
        <div class="tform">
          <div class="tgrid">
            <label>Subject <span class="req">*</span><select class="b-subj">${P.test.subjects.map((s) => `<option>${esc(s)}</option>`).join("")}</select></label>
            <label>Chapter <span class="req">*</span><select class="b-ch"><option value="">Loading…</option></select></label>
          </div>
          <div class="tgrid">
            <label>Question filter<select class="b-mode">
              <option value="topic">Topic wise</option><option value="type">Question type wise</option>
              <option value="difficulty">Difficulty level wise</option><option value="random">Random question generator</option>
              <option value="all">All questions of the chapter</option></select></label>
            <label class="b-val"></label>
          </div>
          <div class="tform-foot"><span class="b-status muted"></span><span class="sp"></span><button class="btn btn-blue b-load">${icon("refresh", 14)} Load Questions</button></div>
        </div></div>
      <div class="qcards b-list"></div>
      <div class="bank-tools b-more" hidden><button class="btn btn-sm">Load more</button></div>`;
    refreshCounters();
    const status = (m, err) => { const s = $(".b-status"); s.textContent = m; s.style.color = err ? "var(--red)" : ""; };
    $(".b-subj").value = st.subject;
    $(".b-mode").value = st.mode;
    let appeared = await appearedMap();
    let offset = 0, last = null;

    async function loadChapters() {
      const sel = $(".b-ch");
      sel.innerHTML = `<option value="">Loading…</option>`;
      try {
        if (!chapterCache.has(st.subject)) chapterCache.set(st.subject, await api(`/api/wizard/chapters?subject=${encodeURIComponent(st.subject)}&klass=Both`));
        const chs = chapterCache.get(st.subject);
        const byClass = {};
        chs.forEach((c) => (byClass[c.klass] ||= []).push(c));
        sel.innerHTML = `<option value="">Select chapter</option>` + Object.keys(byClass).sort().map((k) => `<optgroup label="Class ${esc(k)}">${byClass[k]
          .map((c) => `<option value="${esc(`${c.db}|${c.chapter}`)}">${esc(c.chapter || "(no chapter)")} (${c.count})</option>`).join("")}</optgroup>`).join("");
        if (st.chapter && [...sel.options].some((o) => o.value === st.chapter)) sel.value = st.chapter; else st.chapter = "";
        status(chs.length ? "" : "No chapters found for this subject.");
      } catch (e) { sel.innerHTML = `<option value="">—</option>`; status(e.message, true); }
      await drawValue();
    }
    async function drawValue() {
      const box = $(".b-val");
      const mode = st.mode;
      if (mode === "topic") {
        box.innerHTML = `Topic <span class="req">*</span><select class="b-v"><option value="">${st.chapter ? "Loading…" : "Select a chapter first"}</option></select>`;
        if (!st.chapter) return;
        const [db, chapter] = st.chapter.split("|");
        try {
          const tops = await api("/api/wizard/topics", { picks: [{ db, chapter }] });
          box.querySelector("select").innerHTML = `<option value="">Select topic</option>` + tops.map((t) => `<option value="${esc(t.topic)}">${esc(t.topic || "(no topic)")} (${t.count})</option>`).join("");
          if (tops.some((t) => t.topic === st.value)) box.querySelector("select").value = st.value;
        } catch (e) { status(e.message, true); }
      } else if (mode === "type") {
        box.innerHTML = `Question type <span class="req">*</span><select class="b-v">${CATEGORIES.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>`;
      } else if (mode === "difficulty") {
        box.innerHTML = `Difficulty level <span class="req">*</span><select class="b-v"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>`;
      } else if (mode === "random") {
        box.innerHTML = `How many questions <span class="req">*</span><input class="b-v" type="number" min="1" max="200" value="${st.count}">`;
        return;
      } else { box.innerHTML = ""; return; }
      const v = box.querySelector(".b-v");
      if (st.value && [...(v.options || [])].some((o) => o.value === st.value)) v.value = st.value;
    }
    async function load(append) {
      if (!st.chapter) return status("Select a chapter.", true);
      const v = $(".b-val .b-v");
      if (st.mode === "random") st.count = Math.max(1, Math.min(200, +v.value || 10));
      else if (v) st.value = v.value;
      if (st.mode === "topic" && v && v.selectedIndex <= 0) return status("Select a topic.", true);
      const [db, chapter] = st.chapter.split("|");
      if (!append) { offset = 0; $(".b-list").innerHTML = ""; appeared = await appearedMap(); }
      status("Loading questions…");
      $(".b-load").disabled = true;
      try {
        const qs = new URLSearchParams({ db, chapter, mode: st.mode, value: st.value || "", limit: st.mode === "random" ? st.count : 50, offset });
        last = await api(`/api/tests/bank?${qs}`);
        last.questions.forEach((q, i) => $(".b-list").appendChild(pickable(q, offset + i + 1, appeared)));
        offset += last.questions.length;
        status(last.total ? `Showing ${offset} of ${last.total}` : "No questions match this filter.");
        $(".b-more").hidden = st.mode === "random" || offset >= last.total;
      } catch (e) { status(e.message, true); }
      $(".b-load").disabled = false;
    }
    $(".b-subj").onchange = (e) => { st.subject = e.target.value; st.chapter = ""; st.value = ""; loadChapters(); };
    $(".b-ch").onchange = (e) => { st.chapter = e.target.value; st.value = ""; drawValue(); };
    $(".b-mode").onchange = (e) => { st.mode = e.target.value; st.value = ""; drawValue(); };
    $(".b-load").onclick = () => load(false);
    $(".b-more button").onclick = () => load(true);
    await loadChapters();
  }

  // ---- Institution Questions (our own bank and other tests)
  async function viewInstTab(id) {
    if (!(await loadTest(id))) return;
    editorShell("inst");
    const papers = (await store.listPapers()).filter((p) => p.id !== P.id && p.questionIds.length);
    const bank = await store.listQuestions();
    const subjects = [...new Set(bank.map((q) => q.subject).filter(Boolean))].sort();
    view.innerHTML = `
      ${countBar()}
      <div class="card narrow"><div class="card-h"><span class="dot"></span> Institution Questions</div>
        <div class="tform">
          <label>Load questions from <span class="req">*</span><select class="i-src">
            <option value="bank">1. Question bank</option><option value="pub">2. Published tests</option>
            <option value="unpub">3. Unpublished tests</option><option value="clone">4. Copy all questions of a test</option></select></label>
          <div class="tgrid i-opts"></div>
          <div class="tform-foot"><span class="i-status muted"></span><span class="sp"></span><button class="btn btn-blue i-load">${icon("refresh", 14)} Load Questions</button></div>
        </div></div>
      <div class="qcards i-list"></div>`;
    refreshCounters();
    const status = (m, err) => { const s = $(".i-status"); s.textContent = m; s.style.color = err ? "var(--red)" : ""; };
    const testOpts = (list) => list.length ? list.map((p) => `<option value="${p.id}">${esc(testName(p))} (${p.questionIds.length} Q)</option>`).join("") : `<option value="">No tests</option>`;
    const drawOpts = () => {
      const src = $(".i-src").value, box = $(".i-opts");
      if (src === "bank") {
        box.innerHTML = `<label>Subject<select class="i-subj"><option value="">All subjects</option>${subjects.map((s) => `<option>${esc(s)}</option>`).join("")}</select></label>
          <label>Chapter<select class="i-ch"><option value="">All chapters</option></select></label>`;
        const fillCh = () => {
          const s = $(".i-subj").value;
          const chs = [...new Set(bank.filter((q) => !s || q.subject === s).map((q) => q.chapter).filter(Boolean))].sort();
          $(".i-ch").innerHTML = `<option value="">All chapters</option>` + chs.map((c) => `<option>${esc(c)}</option>`).join("");
        };
        $(".i-subj").onchange = fillCh; fillCh();
      } else {
        const list = papers.filter((p) => (src === "pub" ? isPublished(p) : src === "unpub" ? !isPublished(p) : true));
        box.innerHTML = `<label>Test<select class="i-test">${testOpts(list)}</select></label>`;
      }
      $(".i-load").innerHTML = src === "clone" ? `${icon("plus", 14)} Add all questions` : `${icon("refresh", 14)} Load Questions`;
    };
    $(".i-src").onchange = drawOpts; drawOpts();
    $(".i-load").onclick = async () => {
      const src = $(".i-src").value;
      const list = $(".i-list");
      list.innerHTML = "";
      let qs;
      if (src === "bank") {
        const s = $(".i-subj").value, c = $(".i-ch").value;
        qs = bank.filter((q) => (!s || q.subject === s) && (!c || q.chapter === c)).sort((a, b) => b.createdAt - a.createdAt);
      } else {
        const p = papers.find((x) => x.id === $(".i-test").value);
        if (!p) return status("Pick a test.", true);
        qs = await store.getQuestionsByIds(p.questionIds);
        if (src === "clone") {
          let added = 0;
          for (const q of qs) { if (P.questionIds.includes(q.id)) continue; if (!(await addToTest(q))) break; added++; }
          refreshCounters();
          return status(`${added} question${added === 1 ? "" : "s"} copied from ${testName(p)}.`);
        }
      }
      const appeared = await appearedMap();
      qs.forEach((q, i) => list.appendChild(pickable(q, i + 1, appeared)));
      status(qs.length ? `${qs.length} questions` : "No questions found.");
    };
  }

  // ---- Review
  async function viewReviewTab(id) {
    if (!(await loadTest(id))) return;
    editorShell("review");
    const QS = await store.getQuestionsByIds(P.questionIds);
    const n = P.questionIds.length, total = P.test.total;
    const full = n === total;
    const pub = isPublished(P);
    view.innerHTML = `
      <div class="t-revhead"><h2>Total Questions · ${n}${n !== total ? ` / ${total}` : ""} Q</h2>
        <p class="muted">${esc(patternOf(P.test.pattern).label)} · ${fmtMin(P.test.minutes)} · ${P.test.marks} marks</p></div>
      <div class="qcards r-list"></div>
      <div class="t-publish card narrow">
        ${pub ? `<p>This test is published. Changes here update its paper and all 8 sets.</p><a class="btn btn-green" href="#paper/${P.id}">${icon("printer", 15)} Open paper, keys &amp; print</a>`
          : full ? `<p>All ${total} questions are in. Publishing builds sets A-H with answer keys, ready to print.</p><button class="btn btn-green r-pub">${icon("papers", 15)} Publish Test</button>`
          : `<p>${n < total ? `Add ${total - n} more question${total - n === 1 ? "" : "s"}` : `Remove ${n - total} question${n - total === 1 ? "" : "s"}`} to publish (the test has ${total} questions). You can change the total in Settings.</p>
             <button class="btn btn-green" disabled>${icon("papers", 15)} Publish Test</button>`}
      </div>`;
    const list = $(".r-list");
    if (!n) list.innerHTML = `<div class="card narrow empty">${icon("list", 34)}<p>No questions yet. Add them from Bank Questions or Institution Questions.</p></div>`;
    QS.forEach((q, i) => {
      const meta = P.qmeta[q.id] || {};
      const card = qCard(q, i + 1, {
        top: `${meta.section ? `<span class="chip blue">${esc(meta.section)}</span>` : ""}${meta.track ? `<span class="chip">Track ${meta.track}</span>` : ""}`,
        right: `<button class="btn btn-blue btn-xs r-upd" title="Question number, section, track">${icon("list", 11)} Update</button>
          <button class="btn btn-xs r-edit" title="Edit the whole question">${icon("edit", 11)} Edit</button>
          <button class="btn btn-red btn-xs r-del">${icon("trash", 11)} Remove</button>`,
        partEdit: (part, idx) => partEditor(q, part, idx, () => viewReviewTab(id)),
      });
      card.querySelector(".r-upd").onclick = () => updateDialog(q, i + 1, () => viewReviewTab(id));
      card.querySelector(".r-edit").onclick = () => editQuestion(q, null, () => viewReviewTab(id));
      card.querySelector(".r-del").onclick = async () => { await removeFromTest(q.id); toast(`Q${i + 1} removed.`); viewReviewTab(id); };
      list.appendChild(card);
    });
    $(".r-pub")?.addEventListener("click", async () => {
      const qs = await store.getQuestionsByIds(P.questionIds);
      P.test.status = "published";
      P.test.publishedAt = Date.now();
      applyHeader(P, false);
      generateSets(P, qs);
      await store.savePaper(P);
      toast("Test published. Sets A-H are ready.");
      location.hash = `paper/${P.id}`;
    });
  }

  function updateDialog(q, num, after) {
    const meta = P.qmeta[q.id] || {};
    const secs = patternOf(P.test.pattern).sections || [];
    const n = P.questionIds.length;
    const m = modal("Update question", `
      <form class="settings">
        <label>Track<select name="track"><option value="">No track</option>${[1, 2, 3, 4, 5].map((t) => `<option value="${t}">Track ${t}</option>`).join("")}</select></label>
        <label>Question number (1-${n})<input name="num" type="number" min="1" max="${n}" value="${num}"></label>
        <label>Section<select name="section">${secs.length ? secs.map((s) => `<option>${esc(s.name)}</option>`).join("") : `<option value="">One section (this pattern has no parts)</option>`}</select></label>
        <div class="modal-foot"><button type="button" class="btn btn-grey" data-x>Cancel</button><button class="btn btn-blue">Update</button></div>
      </form>`);
    const f = m.el.querySelector("form");
    f.track.value = meta.track || "";
    if (meta.section) f.section.value = meta.section;
    m.el.querySelector("[data-x]").onclick = m.close;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const to = Math.max(1, Math.min(n, +f.num.value || num));
      P.questionIds.splice(num - 1, 1);
      P.questionIds.splice(to - 1, 0, q.id);
      P.qmeta[q.id] = { ...meta, subject: meta.subject || q.subject, track: f.track.value ? +f.track.value : "", section: f.section.value };
      if (P.sets) syncSets(P, await store.getQuestionsByIds(P.questionIds));
      await store.savePaper(P);
      m.close();
      toast(to !== num ? `Moved to Q${to}.` : "Updated.");
      after();
    };
  }

  /** Edit one part (question, an option, the solution): type, or crop + convert from a page. */
  function partEditor(q, part, idx, after) {
    const name = part === "text" ? "Question" : part === "option" ? `Option ${idx + 1}` : part === "num" ? "Answer" : "Solution";
    const get = () => (part === "text" ? q.text : part === "option" ? q.options[idx].text : part === "num" ? String(q.numAnswer ?? "") : q.solution || "");
    const imgs = part === "text" ? (q.images ||= []) : part === "option" ? (q.options[idx].images ||= []) : part === "solution" ? (q.solutionImages ||= []) : null;
    const work = imgs ? imgs.slice() : null;
    const m = modal(name, `
      <div class="pe-box">
        ${imgs ? `<div class="pe-row"><label class="filebox"><b>Choose image</b><span class="fname">No file</span><input type="file" accept="image/*" hidden></label>
          <button type="button" class="btn btn-blue btn-sm pe-crop">${icon("edit", 13)} Crop &amp; convert from a page</button></div>` : ""}
        <label>${esc(name)} text<textarea rows="5" class="pe-ta"></textarea></label>
        <div class="cm-lab">Preview</div><div class="qf-render pe-prev"></div>
        ${imgs ? `<div class="pe-imgs"></div>` : ""}
        <div class="modal-foot"><button class="btn btn-grey" data-x>Cancel</button><button class="btn btn-blue" data-ok>Save ${esc(name)}</button></div>
      </div>`, { wide: true });
    const ta = m.el.querySelector(".pe-ta"), prev = m.el.querySelector(".pe-prev");
    ta.value = get();
    const render = () => renderMath(prev, ta.value);
    ta.oninput = render; render();
    const drawImgs = () => {
      const box = m.el.querySelector(".pe-imgs");
      if (!box) return;
      box.innerHTML = "";
      work.forEach((f, i) => {
        const c = document.createElement("div");
        c.className = "qf-img";
        c.appendChild(figureEl(f));
        const b = document.createElement("button");
        b.className = "btn btn-sm"; b.textContent = "Remove image";
        b.onclick = () => { work.splice(i, 1); drawImgs(); };
        c.appendChild(b);
        box.appendChild(c);
      });
    };
    drawImgs();
    m.el.querySelector('input[type="file"]')?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      m.el.querySelector(".fname").textContent = file.name;
      const fr = new FileReader();
      fr.onload = () => { work.push({ src: fr.result, width: 70, labels: [] }); drawImgs(); };
      fr.readAsDataURL(file);
    });
    m.el.querySelector(".pe-crop")?.addEventListener("click", () => openCropModal(part === "option" ? "option" : part === "solution" ? "solution" : "question", (res) => {
      if (res.kind === "image") { work.push({ src: res.image, width: 70, labels: [] }); drawImgs(); return; }
      ta.value = res.data.solution ?? res.data.text ?? res.data.question ?? "";
      render();
    }));
    m.el.querySelector("[data-x]").onclick = m.close;
    m.el.querySelector("[data-ok]").onclick = async () => {
      const v = ta.value;
      if (part === "text") q.text = v; else if (part === "option") q.options[idx].text = v; else if (part === "num") q.numAnswer = v.trim(); else q.solution = v;
      if (imgs) imgs.splice(0, imgs.length, ...work);
      await store.saveQuestion(q);
      m.close();
      toast(`${name} saved.`);
      after();
    };
  }

  // ---- Settings
  async function viewSettingsTab(id) {
    if (!(await loadTest(id))) return;
    editorShell("settings");
    view.innerHTML = `<div class="card narrow"><div class="card-h"><span class="dot"></span> Test Settings</div><div class="t-form"></div></div>`;
    sessionForm($(".t-form"), P.test, {
      submitLabel: "Update",
      onSubmit: async (v) => {
        P.test = { ...P.test, ...v };
        applyHeader(P, false);
        await store.savePaper(P);
        toast("Test updated.");
        viewSettingsTab(id);
      },
      onDelete: async () => {
        if (!confirm(`Delete the test "${P.test.name}"? Its questions stay in the question bank.`)) return;
        await store.deletePaper(P.id);
        toast("Test deleted.");
        location.hash = isPublished(P) ? "tests/published" : "tests/unpublished";
      },
    });
  }

  return {
    tests: (arg) => (arg === "unpublished" || arg === "published" ? viewList(arg) : viewNewTest()),
    test: (id, tab) => ({ inst: viewInstTab, review: viewReviewTab, settings: viewSettingsTab }[tab] || viewBankTab)(id),
    unpublishedTests: async () => (await store.listPapers()).filter((p) => p.test && !isPublished(p)),
    addToTestById: async (testId, q, number) => {
      P = await store.getPaper(testId);
      if (!P?.test) return false;
      P.qmeta ||= {};
      if (P.questionIds.includes(q.id)) return true;
      if (P.questionIds.length >= P.test.total) { toast(`That test is full (${P.test.total}/${P.test.total}).`, "err"); return false; }
      const section = sectionFor(q);
      const at = number >= 1 ? Math.min(number - 1, P.questionIds.length) : insertIndex(q, section);
      P.questionIds.splice(at, 0, q.id);
      P.qmeta[q.id] = { subject: q.subject, section, track: q.track || "" };
      await store.savePaper(P);
      return at + 1;
    },
  };
}
