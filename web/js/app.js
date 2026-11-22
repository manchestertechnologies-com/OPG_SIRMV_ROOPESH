// Paper Studio: Add Question · Question Bank · Papers (8 sets, keys, solutions, reshuffle, bulk print)

import * as store from "./store.js";
import { esc, renderMath, LETTERS, optionLabel, figureEl } from "./render.js";
import { mountQuestionForm, blankQuestion } from "./question-form.js";
import { buildPages, blankPage } from "./paper.js";
import { keySheetPage, fitKeySheet, downloadKeyXlsx } from "./keysheet.js";
import { generateSets, syncSets, reshuffleSet, swapInSet, moveInSet, keyText, setAnswerFromSet, positionsOf } from "./shuffle.js";
import { SAMPLE_QUESTIONS } from "./samples.js";
import { icon } from "./icons.js";
import { viewWizard } from "./wizard.js";

const $ = (s, r = document) => r.querySelector(s);
const view = $("#view");

function toast(msg, kind = "ok") {
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function modal(title, bodyHTML, { wide } = {}) {
  const m = document.createElement("div");
  m.className = "cm-backdrop";
  m.innerHTML = `<div class="cm modal ${wide ? "wide" : ""}" role="dialog" aria-label="${esc(title)}">
    <div class="modal-h"><b>${esc(title)}</b><button class="modal-x" title="Close">×</button></div>
    <div class="modal-b">${bodyHTML}</div></div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.querySelector(".modal-x").onclick = close;
  m.addEventListener("click", (e) => { if (e.target === m) close(); });
  return { el: m, close };
}

// ======================================================================== shell: sidebar, banner, tabs
const SIDE = [
  { r: "add", label: "New", ic: "plus", match: ["add"] },
  { r: "bank", label: "Bank", ic: "bank", match: ["bank"] },
  { r: "db", label: "Database", ic: "layers", match: ["db"] },
  { r: "create", label: "Create", ic: "doc", match: ["create"] },
  { r: "papers", label: "Papers", ic: "papers", match: ["papers", "paper"] },
];
$("#hamb").innerHTML = icon("menu", 18);
$("#hamb").onclick = () => document.body.classList.toggle("rail-mini");

/** Page header (back button, title, breadcrumb line) and the step tabs under it. */
function shell(title, back, tabs) {
  $("#page-title").textContent = title;
  const b = $("#page-back");
  b.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`;
  b.href = back?.href || "#add";
  b.title = back?.label || "Back";
  $("#page-crumbs").textContent = ["Paper Studio", ...(back?.crumbs || [title]), ...(tabs.find((t) => t.on)?.label ? [tabs.find((t) => t.on).label] : [])].join(" · ");
  const t = $("#tabs");
  t.innerHTML = "";
  for (const tab of tabs) {
    const el = document.createElement(tab.href ? "a" : "button");
    if (tab.href) el.href = tab.href;
    el.innerHTML = `${icon(tab.ic, 15)} ${esc(tab.label)}`;
    if (tab.on) el.classList.add("on");
    if (tab.onClick) el.onclick = tab.onClick;
    if (tab.id) el.dataset.tab = tab.id;
    t.appendChild(el);
  }
}
const questionTabs = (on) => [
  { label: "New", ic: "plus", href: "#add", on: on === "add" },
  { label: "View", ic: "eye", href: "#bank", on: on === "bank" },
  { label: "Database", ic: "layers", href: "#db", on: on === "db" },
  { label: "Papers", ic: "papers", href: "#papers" },
];

// ======================================================================== College database
let dbState = { key: "", chapter: "", search: "", offset: 0, picked: new Map() };

async function viewDb() {
  shell("Questions", { label: "Back to Question Bank", href: "#bank" }, questionTabs("db"));
  let sources = [];
  try { sources = await (await fetch("/api/db/sources")).json(); } catch { /* server offline */ }
  const ok = sources.filter((s) => s.configured);
  if (!dbState.key && ok.length) dbState.key = ok[0].key;
  view.innerHTML = `
    <div class="pb-head">
      <div class="pills dbsrc">${sources.map((s) => `<button data-key="${s.key}" ${s.configured ? "" : "disabled title='Not set in .env'"} class="${s.key === dbState.key ? "on" : ""}">${esc(s.subject)} ${s.klass}</button>`).join("")}</div>
    </div>
    <div class="bank-tools">
      <select class="db-chapter"><option value="">All chapters</option></select>
      <input class="db-search" placeholder="Search question text" value="${esc(dbState.search)}">
      <button class="btn btn-blue btn-sm db-go">${icon("refresh", 14)} Load</button>
    </div>
    <div class="bank-tools db-picked-bar">
      <span class="db-picked muted"></span>
      <button class="btn btn-sm db-add" disabled>${icon("download", 14)} Add selected to bank</button>
      <button class="btn btn-blue btn-sm db-paper" disabled>${icon("papers", 14)} Create paper from selected</button>
    </div>
    <p class="db-status muted center"></p>
    <div class="qcards db-list"></div>
    <div class="bank-tools db-more" hidden><button class="btn btn-sm">Load more</button></div>`;
  const status = (m, err) => { const s = $(".db-status"); s.textContent = m; s.style.color = err ? "var(--red)" : ""; };
  const pickedInfo = () => {
    const n = dbState.picked.size;
    $(".db-picked").textContent = n ? `${n} question${n > 1 ? "s" : ""} selected (from any subject)` : "Tick questions to use them";
    $(".db-add").disabled = $(".db-paper").disabled = !n;
  };
  pickedInfo();
  if (!sources.length) return status("Couldn't reach the server.", true);
  if (!ok.length) return status("No database links found. Add SUPABASE_1_DB_URL … SUPABASE_8_DB_URL to paper-studio/.env and restart.", true);

  async function loadChapters() {
    const sel = $(".db-chapter");
    sel.innerHTML = `<option value="">All chapters</option>`;
    status("Loading chapters…");
    const r = await fetch(`/api/db/${dbState.key}/chapters`);
    const data = await r.json();
    if (!r.ok) return status(data.detail || "Couldn't load chapters.", true), false;
    sel.innerHTML += data.map((c) => `<option value="${esc(c.chapter)}">${esc(c.chapter || "(no chapter)")} (${c.count})</option>`).join("");
    sel.value = dbState.chapter;
    status("");
    return true;
  }
  async function load(append = false) {
    if (!append) { dbState.offset = 0; $(".db-list").innerHTML = ""; }
    status("Loading questions…");
    const qsp = new URLSearchParams({ chapter: dbState.chapter, search: dbState.search, limit: 50, offset: dbState.offset });
    const r = await fetch(`/api/db/${dbState.key}/questions?${qsp}`);
    const data = await r.json();
    if (!r.ok) return status(data.detail || "Couldn't load questions.", true);
    data.questions.forEach((q, i) => $(".db-list").appendChild(dbCard(q, dbState.offset + i + 1)));
    dbState.offset += data.questions.length;
    status(data.total ? `Showing ${dbState.offset} of ${data.total}` : "No questions match.");
    $(".db-more").hidden = dbState.offset >= data.total;
  }
  function dbCard(q, n) {
    const card = document.createElement("div");
    card.className = "qcard";
    card.innerHTML = `
      <div class="qcard-top">
        <label class="chip sq" title="Select"><input type="checkbox" ${dbState.picked.has(q.id) ? "checked" : ""}></label>
        <span class="chip">${icon("bank", 11)} ${esc(q.subject)}</span>
        ${q.chapter ? `<span class="chip">${esc(q.chapter)}</span>` : ""}
        ${q.type === "NUMERICAL" ? `<span class="chip">Numerical</span>` : ""}
      </div>
      <div class="qcard-q"><b>Q${n}.</b><span class="t"></span></div>
      ${q.type === "NUMERICAL" ? `<div class="qopt ok"><span class="l">✓</span><span class="t">${esc(q.numAnswer)}</span></div>`
        : q.options.map((o, i) => `<div class="qopt ${q.answer.includes(i) ? "ok" : ""}"><span class="l">${"ABCD"[i]}</span><span class="t" data-o="${i}"></span></div>`).join("")}
      ${q.solution ? `<div class="qsol"><span class="t"></span></div>` : ""}`;
    const t = card.querySelector(".qcard-q .t");
    renderMath(t, q.text);
    for (const f of q.images) t.appendChild(figureEl({ ...f, width: 55 }));
    card.querySelectorAll("[data-o]").forEach((el) => renderMath(el, q.options[+el.dataset.o].text));
    if (q.solution) renderMath(card.querySelector(".qsol .t"), q.solution);
    card.querySelector("input").onchange = (e) => { e.target.checked ? dbState.picked.set(q.id, q) : dbState.picked.delete(q.id); pickedInfo(); };
    return card;
  }
  async function copyPicked() {
    const list = [...dbState.picked.values()].map((q, i) => ({ ...q, createdAt: Date.now() + i }));
    for (const q of list) await store.saveQuestion(q);
    return list;
  }

  view.querySelectorAll("[data-key]").forEach((b) => (b.onclick = async () => {
    dbState.key = b.dataset.key; dbState.chapter = "";
    view.querySelectorAll("[data-key]").forEach((x) => x.classList.toggle("on", x === b));
    if (await loadChapters()) load();
  }));
  $(".db-chapter").onchange = (e) => { dbState.chapter = e.target.value; load(); };
  $(".db-go").onclick = () => { dbState.search = $(".db-search").value.trim(); load(); };
  $(".db-search").onkeydown = (e) => { if (e.key === "Enter") $(".db-go").click(); };
  $(".db-more button").onclick = () => load(true);
  $(".db-add").onclick = async () => { const l = await copyPicked(); toast(`${l.length} questions added to the bank.`); dbState.picked.clear(); viewDb(); };
  $(".db-paper").onclick = async () => {
    const order = ["Physics", "Chemistry", "Mathematics", "Biology"];
    const l = (await copyPicked()).sort((a, b) => (order.indexOf(a.subject) + 1 || 9) - (order.indexOf(b.subject) + 1 || 9) || a.createdAt - b.createdAt);
    const p = newPaper(l.map((q) => q.id), l);
    await store.savePaper(p);
    dbState.picked.clear();
    location.hash = `paper/${p.id}`;
  };
  if (await loadChapters()) load();
}

// ======================================================================== routing
const routes = { add: viewAdd, bank: viewBank, db: viewDb, create: (a) => viewWizard(view, { shell, toast, store, newPaper }), papers: viewPapers, paper: viewPaper };
async function go() {
  const [name, arg] = (location.hash.slice(1) || "add").split("/");
  $("#side-nav").innerHTML = SIDE.map((s) => `<a href="#${s.r}" class="rail-tile ${s.match.includes(name) ? "on" : ""}" title="${s.label}">
    <span class="rail-ic">${icon(s.ic, 18)}</span><span class="rail-l">${s.label}</span></a>`).join("");
  window.scrollTo(0, 0);
  view.innerHTML = "";
  await (routes[name] || viewAdd)(arg);
}
window.addEventListener("hashchange", go);

// ======================================================================== Add Question
async function viewAdd() {
  shell("Questions", { label: "Back to Question Bank", href: "#bank" }, questionTabs("add"));
  view.innerHTML = `<div class="card narrow"><div class="card-h"><span class="dot"></span> New Question</div>
    <div id="qform"></div></div>`;
  const mount = (subject = "", chapter = "") => {
    const b = blankQuestion();
    b.subject = subject; b.chapter = chapter;
    mountQuestionForm($("#qform"), b, {
      saveLabel: "Create Question",
      onSave: async (q) => { await store.saveQuestion(q); toast("Question saved to the bank."); mount(q.subject, q.chapter); },
    });
  };
  mount();
}

// ======================================================================== Question Bank
async function viewBank() {
  shell("Questions", { label: "Back to New Question", href: "#add" }, questionTabs("bank"));
  let qs = (await store.listQuestions()).sort((a, b) => b.createdAt - a.createdAt);
  const subjects = [...new Set(qs.map((q) => q.subject || "Other"))];
  let subj = "";
  view.innerHTML = `
    <div class="pb-head">
      <div class="pills subj">${[["", `All (${qs.length}Q)`], ...subjects.map((s) => [s, `${s} (${qs.filter((q) => (q.subject || "Other") === s).length}Q)`])]
        .map(([v, l]) => `<button data-subj="${esc(v)}" class="${v === "" ? "on" : ""}">${esc(l)}</button>`).join("")}</div>
    </div>
    <div class="bank-tools">
      <input class="bank-filter" placeholder="Search chapter or text">
      <button class="btn btn-blue btn-sm" id="b-paper" disabled>${icon("papers", 14)} Create paper from selected</button>
      <button class="btn btn-sm" id="b-import">${icon("upload", 14)} Import</button>
      <button class="btn btn-sm" id="b-export">${icon("download", 14)} Export</button>
      ${qs.length ? "" : `<button class="btn btn-sm" id="b-sample">Load sample questions</button>`}
    </div>
    <div class="qcards"></div>`;
  const list = $(".qcards");
  const selected = new Set();
  view.querySelectorAll("[data-subj]").forEach((b) => (b.onclick = () => {
    subj = b.dataset.subj;
    view.querySelectorAll("[data-subj]").forEach((x) => x.classList.toggle("on", x === b));
    draw();
  }));
  const draw = () => {
    const f = $(".bank-filter").value.toLowerCase();
    list.innerHTML = "";
    qs.filter((q) => (!subj || (q.subject || "Other") === subj) && (!f || `${q.chapter} ${q.text}`.toLowerCase().includes(f))).forEach((q, n) => {
      const card = document.createElement("div");
      card.className = "qcard";
      card.innerHTML = `
        <div class="qcard-top">
          <label class="chip sq" title="Select for a paper"><input type="checkbox" ${selected.has(q.id) ? "checked" : ""}></label>
          <span class="chip">${icon("bank", 11)} ${esc(q.subject || "—")}</span>
          ${q.chapter ? `<span class="chip">${esc(q.chapter)}</span>` : ""}
          <span class="sp"></span>
          <button class="btn btn-red btn-xs" data-del>${icon("trash", 11)} Remove</button>
        </div>
        <div class="qcard-q"><b>Q${n + 1}.</b><span class="t"></span><button class="btn btn-ico light" data-edit title="Edit">${icon("edit", 14)}</button></div>
        ${q.type === "NUMERICAL" ? `<div class="qopt ok"><span class="l">✓</span><span class="t">${esc(q.numAnswer)}</span></div>`
          : q.options.map((o, i) => `<div class="qopt ${q.answer.includes(i) ? "ok" : ""}"><span class="l">${"ABCD"[i]}</span><span class="t" data-o="${i}"></span></div>`).join("")}
        ${q.solution ? `<div class="qsol"><span class="t"></span></div>` : ""}`;
      renderMath(card.querySelector(".qcard-q .t"), q.text);
      for (const f of q.images || []) card.querySelector(".qcard-q .t").appendChild(figureEl({ ...f, width: Math.min(f.width || 70, 55) }));
      card.querySelectorAll("[data-o]").forEach((el) => renderMath(el, q.options[+el.dataset.o].text));
      if (q.solution) renderMath(card.querySelector(".qsol .t"), q.solution);
      card.querySelector("input").onchange = (e) => { e.target.checked ? selected.add(q.id) : selected.delete(q.id); $("#b-paper").disabled = !selected.size; };
      card.querySelector("[data-edit]").onclick = () => editQuestion(q, null, async () => { qs = await store.listQuestions(); draw(); });
      card.querySelector("[data-del]").onclick = async () => {
        if (!confirm("Remove this question from the bank?")) return;
        await store.deleteQuestion(q.id); qs = qs.filter((x) => x.id !== q.id); draw();
      };
      list.appendChild(card);
    });
    if (!qs.length) list.innerHTML = `<p class="muted center">No questions yet. Add some on the New tab, import a JSON file, or load the samples.</p>`;
  };
  $(".bank-filter").oninput = draw;
  $("#b-sample")?.addEventListener("click", async () => { for (const q of SAMPLE_QUESTIONS) await store.saveQuestion(structuredClone(q)); go(); });
  $("#b-export").onclick = () => download(new Blob([JSON.stringify(qs, null, 1)], { type: "application/json" }), "questions.json");
  $("#b-import").onclick = () => pickFile("application/json", async (file) => {
    const arr = JSON.parse(await file.text());
    for (const q of arr) await store.saveQuestion({ ...blankQuestion(), ...q });
    toast(`Imported ${arr.length} questions.`); go();
  });
  $("#b-paper").onclick = async () => {
    const ids = qs.filter((q) => selected.has(q.id)).sort((a, b) => a.createdAt - b.createdAt).map((q) => q.id);
    const p = newPaper(ids, qs);
    await store.savePaper(p);
    location.hash = `paper/${p.id}`;
  };
  draw();
}

function newPaper(ids, qs) {
  const subj = [...new Set(qs.filter((q) => ids.includes(q.id)).map((q) => q.subject).filter(Boolean))].join(", ");
  const p = {
    id: store.uid("p"), name: "New paper",
    header: { collegeName: "YOUR COLLEGE NAME", subTitle: "", examTitle: "UNIT TEST", subject: subj, className: "II PUC",
      time: "1 Hour", maxMarks: String(ids.length * 4), date: new Date().toLocaleDateString("en-GB").replace(/\//g, "."),
      instructions: ["Each question carries 4 marks.", "Choose the correct option and mark it in the OMR sheet."], logo: "" },
    settings: { columns: 2, fontSize: 13, optionLabels: "(1)", shuffleOptions: true, duplexPad: true, keyPerRow: 15 },
    questionIds: ids.slice(), sets: null, seed: (Math.random() * 2 ** 31) | 0,
  };
  generateSets(p, qs);
  return p;
}

// ======================================================================== Papers list
async function viewPapers() {
  shell("Papers", { label: "Back to Questions", href: "#add" }, [
    { label: "All papers", ic: "list", href: "#papers", on: true },
    { label: "Create paper (step by step)", ic: "doc", href: "#create" },
    { label: "From the bank", ic: "bank", href: "#bank" },
  ]);
  const ps = (await store.listPapers()).sort((a, b) => b.updatedAt - a.updatedAt);
  view.innerHTML = `<div class="card narrow"><div class="card-h"><span class="dot"></span> Papers
    <span class="sp"></span><a class="btn btn-blue btn-sm" href="#create">${icon("plus", 14)} Create paper</a></div>
    <div class="paper-list">${ps.map((p) => `<div class="paper-row"><a href="#paper/${p.id}">${esc(p.header?.examTitle || p.name)}</a>
      <span class="muted">${esc(p.header?.subject || "")} · ${p.questionIds.length} questions · Sets A-H</span><span class="sp"></span>
      <button class="btn btn-red btn-xs" data-del="${p.id}">${icon("trash", 11)} Remove</button></div>`).join("") || `<p class="muted">No papers yet. Pick questions in the bank and press "Create paper from selected".</p>`}</div></div>`;
  view.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (confirm("Delete this paper? The questions stay in the bank.")) { await store.deletePaper(b.dataset.del); go(); }
  }));
}

// ======================================================================== Paper builder
let P = null, QS = [], curSet = "A", mode = "paper";

async function viewPaper(id) {
  P = await store.getPaper(id);
  if (!P) { view.innerHTML = `<div class="card"><p>Paper not found.</p></div>`; return; }
  QS = await store.getQuestionsByIds(P.questionIds);
  syncSets(P, QS);
  const setMode = (m) => () => { mode = m; draw(); };
  shell(P.header?.examTitle || P.name, { label: "Back to Papers", href: "#papers" }, [
    { label: "Question paper", ic: "doc", id: "paper", onClick: setMode("paper") },
    { label: "Answers & Solutions", ic: "layers", id: "solutions", onClick: setMode("solutions") },
    { label: "Key Sheet", ic: "key", id: "keys", onClick: setMode("keys") },
    { label: "Settings", ic: "gear", id: "settings", onClick: () => settingsModal() },
  ]);
  view.innerHTML = `
    <div class="pb-head no-print">
      <div class="pills sets">${LETTERS.map((L) => `<button data-set="${L}">Set ${L}</button>`).join("")}</div>
      <div class="pb-actions">
        <button class="btn btn-blue btn-sm" id="pb-shuffle">${icon("shuffle", 14)} Reshuffle</button>
        <button class="btn btn-blue btn-sm" id="pb-add">${icon("list", 14)} Add / remove questions</button>
        <button class="btn btn-blue btn-sm" id="pb-xlsx">${icon("download", 14)} Key sheet Excel</button>
        <button class="btn btn-blue btn-sm" id="pb-print">${icon("printer", 14)} Print this view</button>
        <button class="btn btn-green btn-sm" id="pb-bulk">${icon("printer", 14)} Bulk print</button>
      </div>
    </div>
    <div class="pb-note no-print"></div>
    <div class="pb-pages"></div>`;
  view.querySelectorAll("[data-set]").forEach((b) => (b.onclick = () => { curSet = b.dataset.set; draw(); }));
  $("#pb-add").onclick = pickQuestionsModal;
  $("#pb-shuffle").onclick = reshuffleModal;
  $("#pb-xlsx").onclick = () => downloadKeyXlsx(P, QS);
  $("#pb-print").onclick = () => printPages([...view.querySelectorAll(".pb-pages .qp-page")].map((p) => p.cloneNode(true)));
  $("#pb-bulk").onclick = bulkModal;
  await draw();
}

async function save() { await store.savePaper(P); }

async function draw() {
  view.querySelectorAll("[data-set]").forEach((b) => b.classList.toggle("on", b.dataset.set === curSet));
  document.querySelectorAll("#tabs [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === mode));
  view.querySelector(".sets").style.display = mode === "keys" ? "none" : "";
  const box = $(".pb-pages"), note = $(".pb-note");
  box.innerHTML = `<p class="muted center">Laying out pages…</p>`;
  if (mode === "keys") {
    note.innerHTML = `All 8 answer keys on one page. Click a key to change it: the change goes to the question, so every set and the solutions update.`;
    const page = keySheetPage(P, QS, LETTERS, true);
    box.innerHTML = "";
    box.appendChild(page);
    fitKeySheet(page);
    page.querySelectorAll("td[data-set]").forEach((td) => {
      td.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); td.blur(); } });
      td.addEventListener("blur", () => editKeyCell(td));
    });
    return;
  }
  note.innerHTML = mode === "paper"
    ? `Set ${curSet}${curSet === "A" ? " is the base paper" : " is shuffled from Set A"}. Press ✎ on a question to edit its text, options, answer, solution or diagram labels: edits apply to all 8 sets.`
    : `Set ${curSet} answers and solutions. Each solution follows its question, so a question that is Q1 in Set A shows its solution under its own number here.`;
  const pages = await buildPages(P, QS, curSet, { kind: mode, onEdit: (q, num) => editQuestion(q, num, draw) });
  box.innerHTML = "";
  pages.forEach((p) => box.appendChild(p));
}

async function editKeyCell(td) {
  const L = td.dataset.set, n = +td.dataset.n;
  const set = P.sets[L];
  const q = QS.find((x) => x.id === set.order[n - 1]);
  const v = td.textContent.trim();
  if (!q || v === keyText(set, q)) return;
  if (q.type === "NUMERICAL") q.numAnswer = v;
  else {
    const pos = v.split(/[,\s]+/).map(Number).filter((k) => k >= 1 && k <= q.options.length).map((k) => k - 1);
    if (!pos.length) { td.textContent = keyText(set, q); return toast("Type an option number 1-4 (or 1,3 for two answers).", "err"); }
    setAnswerFromSet(set, q, pos);
  }
  await store.saveQuestion(q);
  toast(`Set ${L} Q${n} key changed. All sets updated.`);
  draw();
}

// ---------------------------------------------------------------- edit one question
function editQuestion(q, num, after) {
  const m = modal(num ? `Edit Q${num}${P ? ` (Set ${curSet})` : ""}` : "Edit question", `<div class="qedit"></div>`, { wide: true });
  let answerLabels, answerMap;
  if (P && num && q.type === "MCQ") {
    // tick boxes follow the printed order of the set being viewed
    const perm = P.sets[curSet].opt?.[q.id] || [0, 1, 2, 3];
    answerMap = perm;
    answerLabels = perm.map((b, i) => `Option ${optionLabel(i, P.settings.optionLabels)}: ${q.options[b].text.slice(0, 24)}`);
  }
  mountQuestionForm(m.el.querySelector(".qedit"), q, {
    saveLabel: "Save changes", answerLabels, answerMap, onCancel: m.close,
    onSave: async (nq) => {
      await store.saveQuestion(nq);
      const i = QS.findIndex((x) => x.id === nq.id);
      if (i >= 0) QS[i] = nq;
      m.close();
      toast("Saved. All sets updated.");
      after?.();
    },
  });
}

// ---------------------------------------------------------------- settings
function settingsModal() {
  const h = P.header, s = P.settings;
  const m = modal("Paper settings", `
    <form class="settings">
      <fieldset><legend>Header</legend>
        <label>College name<input name="collegeName" value="${esc(h.collegeName)}"></label>
        <label>Line under the name<input name="subTitle" value="${esc(h.subTitle)}"></label>
        <label>Exam title<input name="examTitle" value="${esc(h.examTitle)}"></label>
        <div class="grid2">
          <label>Subject<input name="subject" value="${esc(h.subject)}"></label>
          <label>Class<input name="className" value="${esc(h.className)}"></label>
          <label>Time<input name="time" value="${esc(h.time)}"></label>
          <label>Max marks<input name="maxMarks" value="${esc(h.maxMarks)}"></label>
          <label>Date<input name="date" value="${esc(h.date)}"></label>
          <label>Logo<input type="file" name="logo" accept="image/*"></label>
        </div>
        <label>General instructions (one per line)<textarea name="instructions" rows="4">${esc((h.instructions || []).join("\n"))}</textarea></label>
      </fieldset>
      <fieldset><legend>Layout</legend>
        <div class="grid2">
          <label>Columns<select name="columns"><option value="2">2 columns</option><option value="1">1 column</option></select></label>
          <label>Font size (px)<input type="number" name="fontSize" min="10" max="18" value="${s.fontSize}"></label>
          <label>Option labels<select name="optionLabels"><option>(1)</option><option>(a)</option><option>(A)</option></select></label>
          <label>Key sheet: questions per row<input type="number" name="keyPerRow" min="5" max="30" value="${s.keyPerRow || 15}"></label>
        </div>
        <label class="chk"><input type="checkbox" name="shuffleOptions" ${s.shuffleOptions !== false ? "checked" : ""}> Shuffle options in sets B-H (applies when sets are regenerated)</label>
      </fieldset>
      <div class="modal-foot"><button type="button" class="btn btn-grey" data-x>Cancel</button><button class="btn btn-blue">Save</button></div>
    </form>`);
  const f = m.el.querySelector("form");
  f.columns.value = String(s.columns);
  f.optionLabels.value = s.optionLabels;
  m.el.querySelector("[data-x]").onclick = m.close;
  f.onsubmit = async (e) => {
    e.preventDefault();
    for (const k of ["collegeName", "subTitle", "examTitle", "subject", "className", "time", "maxMarks", "date"]) h[k] = f[k].value.trim();
    h.instructions = f.instructions.value.split("\n").map((x) => x.trim()).filter(Boolean);
    if (f.logo.files[0]) h.logo = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f.logo.files[0]); });
    s.columns = +f.columns.value; s.fontSize = +f.fontSize.value || 13; s.optionLabels = f.optionLabels.value;
    s.keyPerRow = +f.keyPerRow.value || 15; s.shuffleOptions = f.shuffleOptions.checked;
    P.name = h.examTitle || P.name;
    await save(); m.close(); draw();
  };
}

// ---------------------------------------------------------------- add / remove questions
async function pickQuestionsModal() {
  const all = await store.listQuestions();
  const inPaper = new Set(P.questionIds);
  const m = modal("Questions in this paper", `
    <p class="muted">Ticked questions are in the paper. New questions are added to the end of Set A and to a random place in sets B-H; existing numbering stays as it is.</p>
    <input class="bank-filter" placeholder="Filter">
    <div class="pick-list">${all.map((q) => `<label class="pick-row" data-t="${esc(`${q.subject} ${q.chapter} ${q.text}`.toLowerCase())}">
      <input type="checkbox" value="${q.id}" ${inPaper.has(q.id) ? "checked" : ""}><b>${esc(q.subject)}</b> <span class="pick-text"></span></label>`).join("")}</div>
    <div class="modal-foot"><button class="btn btn-grey" data-x>Cancel</button><button class="btn btn-blue" data-ok>Apply</button></div>`, { wide: true });
  m.el.querySelectorAll(".pick-text").forEach((el, i) => renderMath(el, all[i].text.slice(0, 160)));
  m.el.querySelector(".bank-filter").oninput = (e) => m.el.querySelectorAll(".pick-row").forEach((r) => (r.hidden = !r.dataset.t.includes(e.target.value.toLowerCase())));
  m.el.querySelector("[data-x]").onclick = m.close;
  m.el.querySelector("[data-ok]").onclick = async () => {
    const ticked = new Set([...m.el.querySelectorAll(".pick-row input:checked")].map((c) => c.value));
    P.questionIds = P.questionIds.filter((id) => ticked.has(id)).concat([...ticked].filter((id) => !inPaper.has(id)));
    QS = await store.getQuestionsByIds(P.questionIds);
    syncSets(P, QS);
    await save(); m.close(); draw();
  };
}

// ---------------------------------------------------------------- reshuffle window
function reshuffleModal() {
  const n = P.questionIds.length;
  const m = modal("Reshuffle questions", `
    <div class="rs">
      <label>Set <select class="rs-set">${LETTERS.map((L) => `<option ${L === curSet ? "selected" : ""}>${L}</option>`).join("")}</select></label>
      <p class="muted">Enter question numbers as they are printed in this set (1-${n}). <b>Swap</b> exchanges two questions.
        <b>Move</b> takes the first question to the new number and shifts the ones in between.
        Answer keys and solutions follow automatically.</p>
      <div class="rs-rows"></div>
      <button class="btn btn-sm rs-addrow">+ Add another</button>
      <div class="modal-foot">
        <button class="btn" data-rand>Shuffle this set randomly</button>
        <button class="btn" data-all>Regenerate sets B-H</button>
        <span class="sp"></span>
        <button class="btn btn-grey" data-x>Cancel</button><button class="btn btn-blue" data-ok>Apply</button>
      </div>
    </div>`);
  const rows = m.el.querySelector(".rs-rows");
  const setSel = m.el.querySelector(".rs-set");
  const snippet = (num) => {
    const id = P.sets[setSel.value].order[num - 1];
    const q = QS.find((x) => x.id === id);
    return q ? q.text.replace(/\\[a-z]+|[${}\\]/gi, " ").replace(/\s+/g, " ").trim().slice(0, 50) : "";
  };
  const addRow = () => {
    const r = document.createElement("div");
    r.className = "rs-row";
    r.innerHTML = `Q <input type="number" min="1" max="${n}" class="rs-a" placeholder="1">
      <select class="rs-op"><option value="swap">⇄ Swap with</option><option value="move">→ Move to</option></select>
      Q <input type="number" min="1" max="${n}" class="rs-b" placeholder="${n}">
      <button class="btn btn-sm rs-del" title="Remove">×</button>
      <div class="rs-hint muted"></div>`;
    const hint = () => {
      const a = +r.querySelector(".rs-a").value, b = +r.querySelector(".rs-b").value;
      r.querySelector(".rs-hint").textContent = [a && `Q${a}: ${snippet(a)}`, b && `Q${b}: ${snippet(b)}`].filter(Boolean).join("   |   ");
    };
    r.querySelectorAll("input").forEach((i) => (i.oninput = hint));
    r.querySelector(".rs-del").onclick = () => r.remove();
    rows.appendChild(r);
  };
  addRow();
  m.el.querySelector(".rs-addrow").onclick = addRow;
  m.el.querySelector("[data-x]").onclick = m.close;
  m.el.querySelector("[data-rand]").onclick = async () => {
    const L = setSel.value;
    if (L === "A") return toast("Set A is the base paper. Use Swap/Move for it.", "err");
    reshuffleSet(P, QS, L); await save(); m.close(); curSet = L; draw(); toast(`Set ${L} reshuffled.`);
  };
  m.el.querySelector("[data-all]").onclick = async () => {
    if (!confirm("Make new sets B-H? Keys already printed for the old sets will no longer match.")) return;
    generateSets(P, QS, (Math.random() * 2 ** 31) | 0); await save(); m.close(); draw(); toast("Sets B-H regenerated.");
  };
  m.el.querySelector("[data-ok]").onclick = async () => {
    const L = setSel.value;
    const ops = [...rows.querySelectorAll(".rs-row")].map((r) => ({ a: +r.querySelector(".rs-a").value, b: +r.querySelector(".rs-b").value, op: r.querySelector(".rs-op").value }));
    const bad = ops.find((o) => !(o.a >= 1 && o.a <= n && o.b >= 1 && o.b <= n) || o.a === o.b);
    if (!ops.length || bad) return toast(`Use two different numbers from 1 to ${n}.`, "err");
    for (const o of ops) (o.op === "swap" ? swapInSet : moveInSet)(P, L, o.a, o.b);
    await save(); m.close(); curSet = L; draw();
    toast(`Set ${L}: ${ops.map((o) => `Q${o.a} ${o.op === "swap" ? "⇄" : "→"} Q${o.b}`).join(", ")}`);
  };
}

// ---------------------------------------------------------------- printing
let printBox = null;
function printPages(pages) {
  printBox?.remove();
  printBox = document.createElement("div");
  printBox.id = "print-root";
  pages.forEach((p) => printBox.appendChild(p));
  document.body.appendChild(printBox);
  document.body.classList.add("printing");
  printBox.querySelectorAll(".key-page").forEach(fitKeySheet);
  const done = () => { document.body.classList.remove("printing"); printBox?.remove(); printBox = null; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 150);
}

function bulkModal() {
  const m = modal("Bulk print", `
    <form class="bulk">
      <div class="bulk-sets">${LETTERS.map((L) => `<label><input type="checkbox" value="${L}" ${"ABCD".includes(L) ? "checked" : ""}> Set ${L}</label>`).join("")}</div>
      <label>Copies of each set <input type="number" name="copies" min="1" max="500" value="10"></label>
      <label class="chk"><input type="checkbox" name="pad" ${P.settings.duplexPad !== false ? "checked" : ""}>
        Two-sided printing: add a blank page when a copy has an odd number of pages, so every copy starts on a new sheet</label>
      <label class="chk"><input type="checkbox" name="keys"> Add the all-sets key sheet at the end</label>
      <p class="bulk-sum muted"></p>
      <div class="modal-foot"><button type="button" class="btn btn-grey" data-x>Cancel</button><button class="btn btn-blue">Make PDF</button></div>
    </form>`);
  const f = m.el.querySelector("form");
  const sum = async () => {
    const sets = [...f.querySelectorAll(".bulk-sets input:checked")].map((c) => c.value);
    const c = +f.copies.value || 0;
    f.querySelector(".bulk-sum").textContent = sets.length && c
      ? `Order: ${sets.map((L) => `${c} × Set ${L}`).join(", then ")}. In the print window choose "Save as PDF" or your printer.`
      : "Choose at least one set and a number of copies.";
  };
  f.oninput = sum; sum();
  m.el.querySelector("[data-x]").onclick = m.close;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const sets = [...f.querySelectorAll(".bulk-sets input:checked")].map((c) => c.value);
    const copies = Math.max(1, Math.min(500, +f.copies.value || 1));
    if (!sets.length) return;
    P.settings.duplexPad = f.pad.checked; await save();
    const btn = f.querySelector(".btn-blue");
    btn.disabled = true; btn.textContent = "Preparing pages…";
    const out = [];
    for (const L of sets) {
      const pages = await buildPages(P, QS, L, { kind: "paper" });
      const pad = f.pad.checked && pages.length % 2 === 1;
      for (let c = 0; c < copies; c++) {
        pages.forEach((p) => out.push(p.cloneNode(true)));
        if (pad) out.push(blankPage());
      }
    }
    if (f.keys.checked) out.push(keySheetPage(P, QS, LETTERS));
    m.close();
    toast(`${out.length} pages ready.`);
    printPages(out);
  };
}

// ======================================================================== helpers
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
}
function pickFile(accept, cb) {
  const i = document.createElement("input");
  i.type = "file"; i.accept = accept;
  i.onchange = () => i.files[0] && cb(i.files[0]);
  i.click();
}

// OCR status in the header
fetch("/api/ocr/status").then((r) => r.json()).then((s) => {
  const b = $("#ocr-status");
  b.textContent = s.loaded ? "Offline reader ready" : s.error ? "Offline reader not installed" : "Offline reader loading…";
  b.className = "ocr-status " + (s.loaded ? "ok" : s.error ? "err" : "");
  if (s.error) b.title = s.error;
}).catch(() => {});

go();
