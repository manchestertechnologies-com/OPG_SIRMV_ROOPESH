// Questions → Syllabus (chapters and topics of the college databases, with question counts)
// and Questions → Table (build a table and copy it into a question as LaTeX).

import { esc, renderMath } from "./render.js";
import { icon } from "./icons.js";

const SUBJECTS = ["Physics", "Chemistry", "Mathematics", "Biology"];

export async function viewSyllabus(view, { shell, tabs }) {
  shell("Questions", { label: "Back to Tests", href: "#tests/unpublished", crumbs: ["Questions"] }, tabs);
  let subject = viewSyllabus.subject || "Physics";
  view.innerHTML = `
    <div class="pb-head"><div class="pills">${SUBJECTS.map((s) => `<button data-s="${s}" class="${s === subject ? "on" : ""}">${s}</button>`).join("")}</div></div>
    <div class="card narrow"><div class="card-h"><span class="dot"></span> Syllabus <span class="sp"></span><span class="muted sy-sum"></span></div>
      <div class="sy-list"><p class="muted">Loading…</p></div></div>`;
  const load = async () => {
    const box = view.querySelector(".sy-list");
    box.innerHTML = `<p class="muted">Loading chapters…</p>`;
    let chs;
    try {
      const r = await fetch(`/api/wizard/chapters?subject=${encodeURIComponent(subject)}&klass=Both`);
      chs = await r.json();
      if (!r.ok) throw new Error(chs.detail || "Couldn't load chapters.");
    } catch (e) { box.innerHTML = `<p class="err-text">${esc(e.message)}</p>`; return; }
    const total = chs.reduce((s, c) => s + c.count, 0);
    view.querySelector(".sy-sum").textContent = `${chs.length} chapters · ${total} questions`;
    const byClass = {};
    chs.forEach((c) => (byClass[c.klass] ||= []).push(c));
    let n = 0;
    box.innerHTML = Object.keys(byClass).sort().map((k) => `<div class="t-day">Class ${esc(k)}</div>` + byClass[k].map((c) => `
      <details class="sy-ch" data-db="${esc(c.db)}" data-ch="${esc(c.chapter)}"><summary><b>${++n}.</b> ${esc(c.chapter || "(no chapter)")}<span class="sp"></span><span class="chip">${c.count} Q</span></summary>
        <div class="sy-topics muted">Loading topics…</div></details>`).join("")).join("") || `<p class="muted">No chapters.</p>`;
    box.querySelectorAll(".sy-ch").forEach((d) => d.addEventListener("toggle", async () => {
      if (!d.open || d.dataset.loaded) return;
      d.dataset.loaded = 1;
      const t = d.querySelector(".sy-topics");
      try {
        const r = await fetch("/api/wizard/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ picks: [{ db: d.dataset.db, chapter: d.dataset.ch }] }) });
        const tops = await r.json();
        if (!r.ok) throw new Error(tops.detail || "Couldn't load topics.");
        t.classList.remove("muted");
        t.innerHTML = tops.map((x, i) => `<div class="sy-topic">${i + 1}. ${esc(x.topic || "(no topic)")}<span class="sp"></span><span class="muted">${x.count} Q</span></div>`).join("") || "No topics.";
      } catch (e) { t.textContent = e.message; }
    }));
  };
  view.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => {
    subject = viewSyllabus.subject = b.dataset.s;
    view.querySelectorAll("[data-s]").forEach((x) => x.classList.toggle("on", x === b));
    load();
  }));
  load();
}

export function viewTable(view, { shell, tabs, toast }) {
  shell("Questions", { label: "Back to Tests", href: "#tests/unpublished", crumbs: ["Questions"] }, tabs);
  const st = viewTable.state || (viewTable.state = { rows: 4, cols: 4, header: true, cells: {} });
  view.innerHTML = `
    <div class="card narrow"><div class="card-h"><span class="dot"></span> Tables <span class="sp"></span><span class="muted">For match-the-column and data questions</span></div>
      <div class="tb-wrap"><table class="tb-grid"></table></div>
      <div class="tb-tools">
        <button class="btn btn-sm" data-a="row">${icon("plus", 13)} Add Row</button>
        <button class="btn btn-sm" data-a="col">${icon("plus", 13)} Add Column</button>
        <button class="btn btn-sm" data-a="delrow">Remove Row</button>
        <button class="btn btn-sm" data-a="delcol">Remove Column</button>
        <label class="chk"><input type="checkbox" class="tb-head" ${st.header ? "checked" : ""}> First row is a header</label>
        <span class="sp"></span>
        <button class="btn btn-red btn-sm" data-a="clear">${icon("trash", 13)} Clear Table</button>
        <button class="btn btn-blue btn-sm" data-a="copy">${icon("download", 13)} Copy Table</button>
      </div>
      <div class="cm-lab">Preview (as it prints in a question)</div><div class="qf-render tb-prev"></div>
      <div class="cm-lab">Text to paste into a question</div><textarea class="tb-out" rows="4" readonly></textarea>
    </div>`;
  const grid = view.querySelector(".tb-grid");
  const cell = (r, c) => st.cells[`${r},${c}`] || "";
  const latex = () => {
    const rows = [];
    for (let r = 0; r < st.rows; r++) {
      const vals = [];
      for (let c = 0; c < st.cols; c++) {
        const v = cell(r, c).trim();
        // cells may contain $maths$; outside maths the text goes in \text{}
        const parts = v.split(/(\$[^$]*\$)/g).filter(Boolean).map((p, i) => (p.startsWith("$") ? p.slice(1, -1) : `\\text{${p.replace(/([{}%&#_])/g, "\\$1")}}`));
        vals.push(st.header && r === 0 && v ? `\\textbf{${v.replace(/\$/g, "").replace(/([{}%&#_])/g, "\\$1")}}` : parts.join(" ") || "\\,");
      }
      rows.push(vals.join(" & "));
    }
    const colSpec = "|" + Array(st.cols).fill("c").join("|") + "|";
    return `$$\\begin{array}{${colSpec}}\\hline ${rows.map((r, i) => r + " \\\\ \\hline").join(" ")}\\end{array}$$`;
  };
  const out = () => {
    const t = latex();
    view.querySelector(".tb-out").value = t;
    renderMath(view.querySelector(".tb-prev"), t);
  };
  const draw = () => {
    grid.innerHTML = Array.from({ length: st.rows }, (_, r) => `<tr>${Array.from({ length: st.cols }, (_, c) =>
      `<td><input data-k="${r},${c}" class="${st.header && r === 0 ? "th" : ""}" value="${esc(cell(r, c))}" placeholder="${st.header && r === 0 ? `Column ${c + 1}` : ""}"></td>`).join("")}</tr>`).join("");
    grid.querySelectorAll("input").forEach((i) => (i.oninput = () => { st.cells[i.dataset.k] = i.value; out(); }));
    out();
  };
  view.querySelector(".tb-head").onchange = (e) => { st.header = e.target.checked; draw(); };
  view.querySelectorAll("[data-a]").forEach((b) => (b.onclick = async () => {
    const a = b.dataset.a;
    if (a === "row") st.rows++;
    else if (a === "col") st.cols++;
    else if (a === "delrow" && st.rows > 1) st.rows--;
    else if (a === "delcol" && st.cols > 1) st.cols--;
    else if (a === "clear") st.cells = {};
    else if (a === "copy") {
      try { await navigator.clipboard.writeText(latex()); toast("Table copied. Paste it into a question, option or solution."); }
      catch { view.querySelector(".tb-out").select(); toast("Select the text below and copy it (Ctrl+C).", "err"); }
      return;
    }
    draw();
  }));
  draw();
}
