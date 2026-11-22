// A4 question paper layout: header, 1 or 2 columns with a rule between them, numbered
// questions with options laid out by length, page footer, end-of-paper line.
// Pages are cut here (not by the browser) so every printed copy has a known page count:
// that is what lets bulk printing pad each copy to an even number of pages for duplex.

import { esc, renderMath, figureEl, optionLabel, mathHTML } from "./render.js";
import { setOptions, keyText } from "./shuffle.js";

export const PAGE_W = 794, PAGE_H = 1123;           // A4 at 96 dpi
const MARGIN_X = 34, MARGIN_TOP = 26, MARGIN_BOTTOM = 30, FOOTER_H = 22, COL_GAP = 22;

// ----------------------------------------------------------------- header
function headerEl(paper, L, kind = "paper") {
  const h = paper.header || {};
  const el = document.createElement("div");
  el.className = "qp-header";
  el.innerHTML = `
    <div class="qp-head-row">
      <div class="qp-logo">${h.logo ? `<img src="${esc(h.logo)}" alt="Logo">` : ""}</div>
      <div class="qp-titles">
        <div class="qp-college">${esc(h.collegeName || "")}</div>
        ${h.subTitle ? `<div class="qp-sub">${esc(h.subTitle)}</div>` : ""}
        <div class="qp-exam">${esc(h.examTitle || paper.name || "")}${kind === "solutions" ? " · ANSWERS & SOLUTIONS" : ""}</div>
      </div>
      <div class="qp-set"><span>SET</span><b>${L}</b></div>
    </div>
    <div class="qp-info">
      <span>Subject: <b>${esc(h.subject || "")}</b></span>
      <span>Class: <b>${esc(h.className || "")}</b></span>
      ${kind === "paper" ? `<span>Time: <b>${esc(h.time || "")}</b></span>` : ""}
      <span>Max Marks: <b>${esc(h.maxMarks || "")}</b></span>
      ${h.date ? `<span>Date: <b>${esc(h.date)}</b></span>` : ""}
    </div>
    ${kind === "paper" && (h.instructions || []).filter(Boolean).length ? `
      <div class="qp-instr"><div class="qp-instr-t">General Instructions:</div>
        <ol>${h.instructions.filter(Boolean).map((i) => `<li>${mathHTML(i)}</li>`).join("")}</ol></div>` : ""}`;
  return el;
}

// ----------------------------------------------------------------- one question
function optionGridCols(opts, twoCol) {
  // rendered maths is roughly 60% as wide as its LaTeX source
  const plain = (t) => String(t || "").replace(/\$[^$]*\$/g, (m) => "x".repeat(Math.ceil(m.replace(/\\[a-z]+|[{}^_$]/gi, "").length * 0.9)));
  const hasFig = opts.some((o) => o.images?.length);
  const lens = opts.map((o) => plain(o.text).length);
  const max = Math.max(0, ...lens);
  const complex = opts.some((o) => /\\(frac|dfrac|sqrt|int|sum|begin|vec|hat|lim)/.test(o.text || ""));
  if (hasFig) return twoCol ? 2 : 4;
  if (max <= (twoCol ? 8 : 14) && !complex) return 4;
  if (max <= (twoCol ? 22 : 40)) return 2;
  return 1;
}

export function questionEl(q, num, set, settings, { onEdit } = {}) {
  const twoCol = settings.columns === 2;
  const el = document.createElement("div");
  el.className = "qp-q";
  el.dataset.qid = q.id;
  const head = document.createElement("div");
  head.className = "qp-q-row";
  head.innerHTML = `<span class="qp-num">${num}.</span>`;
  const body = document.createElement("div");
  body.className = "qp-q-body";
  const text = document.createElement("div");
  text.className = "qp-text";
  renderMath(text, q.text || "");
  body.appendChild(text);
  for (const f of q.images || []) body.appendChild(figureEl(f));

  if (q.type === "NUMERICAL") {
    const n = document.createElement("div");
    n.className = "qp-num-ans";
    n.textContent = "Answer: ____________";
    body.appendChild(n);
  } else if (q.options?.length) {
    const opts = setOptions(set, q);
    const grid = document.createElement("div");
    grid.className = "qp-opts";
    grid.style.gridTemplateColumns = `repeat(${optionGridCols(opts, twoCol)}, minmax(0, 1fr))`;
    opts.forEach((o, i) => {
      const cell = document.createElement("div");
      cell.className = "qp-opt";
      cell.innerHTML = `<span class="qp-opt-l">${optionLabel(i, settings.optionLabels)}</span>`;
      const t = document.createElement("span");
      t.className = "qp-opt-t";
      renderMath(t, o.text || "");
      for (const f of o.images || []) t.appendChild(figureEl(f));
      cell.appendChild(t);
      grid.appendChild(cell);
    });
    body.appendChild(grid);
  }
  head.appendChild(body);
  el.appendChild(head);
  if (onEdit) {
    const b = document.createElement("button");
    b.className = "qp-edit no-print";
    b.title = `Edit Q${num}`;
    b.textContent = "✎";
    b.onclick = (e) => { e.stopPropagation(); onEdit(q, num); };
    el.appendChild(b);
  }
  return el;
}

function sectionEl(subject) {
  const el = document.createElement("div");
  el.className = "qp-section";
  el.textContent = subject.toUpperCase();
  return el;
}

/**
 * Solutions written for the base order say "option C is correct". In a shuffled set that
 * option is printed elsewhere, so "option X" / "option (X)" is rewritten to the set's label.
 */
export function solutionForSet(q, set, settings) {
  const s = q.solution || "";
  if (q.type === "NUMERICAL" || !q.options?.length) return s;
  const perm = set.opt?.[q.id] || q.options.map((_, i) => i);
  return s.replace(/\b(options?)\s*\(?\s*([A-Da-d1-4])\s*\)?(?![\w])/g, (m, word, tok) => {
    const base = /[A-Da-d]/.test(tok) ? "abcd".indexOf(tok.toLowerCase()) : +tok - 1;
    const pos = perm.indexOf(base);
    if (pos < 0) return m;
    const lab = optionLabel(pos, settings.optionLabels);
    // keep the original style: "option C" -> "option (3)" in the set's numbering
    return `${word} ${lab}`;
  });
}

function solutionEl(q, num, set, settings, { onEdit } = {}) {
  const el = document.createElement("div");
  el.className = "qp-sol";
  const key = keyText(set, q);
  const keyLabel = q.type === "NUMERICAL" ? key
    : key.split(",").map((k) => (k === "-" ? "-" : optionLabel(+k - 1, settings.optionLabels))).join(", ");
  el.innerHTML = `<div class="qp-sol-h"><b>Q${num}.</b> <span class="qp-sol-key">Answer: ${esc(keyLabel)}</span></div>`;
  const body = document.createElement("div");
  body.className = "qp-sol-b";
  renderMath(body, solutionForSet(q, set, settings) || "—");
  for (const f of q.solutionImages || []) body.appendChild(figureEl(f));
  el.appendChild(body);
  if (onEdit) {
    const b = document.createElement("button");
    b.className = "qp-edit no-print";
    b.title = `Edit solution of Q${num}`;
    b.textContent = "✎";
    b.onclick = () => onEdit(q, num);
    el.appendChild(b);
  }
  return el;
}

// ----------------------------------------------------------------- pagination
async function settle(node) {
  const imgs = [...node.querySelectorAll("img")];
  await Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : i.decode().catch(() => {}))));
}

/**
 * Build the pages for one set.
 * kind: "paper" (questions) | "solutions" (answer + solution per question)
 */
export async function buildPages(paper, questions, L, { kind = "paper", onEdit } = {}) {
  const settings = paper.settings;
  const cols = kind === "solutions" ? 1 : settings.columns === 2 ? 2 : 1;
  const set = paper.sets[L];
  const qmap = new Map(questions.map((q) => [q.id, q]));
  const contentW = PAGE_W - 2 * MARGIN_X;
  const colW = cols === 2 ? (contentW - COL_GAP) / 2 : contentW;
  const contentH = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM - FOOTER_H;

  // measuring area, same fonts and widths as the real page
  const meas = document.createElement("div");
  meas.className = "qp-page qp-measure";
  meas.style.setProperty("--qp-font", `${settings.fontSize || 13}px`);
  document.body.appendChild(meas);

  const header = headerEl(paper, L, kind);
  header.style.width = `${contentW}px`;
  meas.appendChild(header);

  const blocks = [];
  let lastSubject = null;
  const subjects = new Set(set.order.map((id) => qmap.get(id)?.subject || ""));
  set.order.forEach((id, i) => {
    const q = qmap.get(id);
    if (!q) return;
    if (kind === "paper" && subjects.size > 1 && q.subject !== lastSubject && q.subject) blocks.push(sectionEl(q.subject));
    lastSubject = q.subject;
    blocks.push(kind === "paper" ? questionEl(q, i + 1, set, settings, { onEdit }) : solutionEl(q, i + 1, set, settings, { onEdit }));
  });
  const end = document.createElement("div");
  end.className = "qp-end";
  end.textContent = kind === "paper" ? "*** End of Question Paper ***" : "*** End of Solutions ***";
  blocks.push(end);

  const colBox = document.createElement("div");
  colBox.style.width = `${colW}px`;
  meas.appendChild(colBox);
  blocks.forEach((b) => colBox.appendChild(b));
  await settle(meas);
  const headerH = header.offsetHeight + 8;
  const heights = blocks.map((b) => {
    const cs = getComputedStyle(b);
    return b.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
  });

  // greedy fill: column by column, page by page
  const pages = [];
  let page = null, col = 0, used = 0;
  const newPage = () => {
    page = { cols: Array.from({ length: cols }, () => []), header: pages.length === 0 };
    pages.push(page);
    col = 0; used = 0;
  };
  newPage();
  const colHeight = () => contentH - (page.header ? headerH : 0);
  blocks.forEach((b, i) => {
    let h = heights[i];
    const isSection = b.classList.contains("qp-section");
    const need = isSection ? h + (heights[i + 1] || 0) : h;   // keep a section title with its first question
    if (used > 0 && used + need > colHeight()) {
      if (col + 1 < cols) { col++; used = 0; } else newPage();
    }
    page.cols[col].push(b);
    used += h;
  });
  meas.remove();

  // real page elements
  const total = pages.length;
  return pages.map((p, n) => {
    const el = document.createElement("div");
    el.className = "qp-page";
    el.style.setProperty("--qp-font", `${settings.fontSize || 13}px`);
    const content = document.createElement("div");
    content.className = "qp-content";
    if (p.header) {
      const hh = headerEl(paper, L, kind);
      content.appendChild(hh);
    }
    const row = document.createElement("div");
    row.className = "qp-cols" + (cols === 2 ? " two" : "");
    p.cols.forEach((list) => {
      const c = document.createElement("div");
      c.className = "qp-col";
      list.forEach((b) => c.appendChild(b));
      row.appendChild(c);
    });
    content.appendChild(row);
    el.appendChild(content);
    const f = document.createElement("div");
    f.className = "qp-footer";
    f.innerHTML = `<span>${esc(paper.header?.examTitle || paper.name || "")}</span><span>Set ${L}</span><span>Page ${n + 1} of ${total}</span>`;
    el.appendChild(f);
    return el;
  });
}

export function blankPage() {
  const el = document.createElement("div");
  el.className = "qp-page qp-blank";
  el.innerHTML = `<div class="qp-blank-note">This page is intentionally left blank</div>`;
  return el;
}
