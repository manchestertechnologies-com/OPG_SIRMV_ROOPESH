// Shared rendering: text with $LaTeX$, and figures with their editable labels.

const DELIMS = [
  { left: "$$", right: "$$", display: true },
  { left: "$", right: "$", display: false },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---- maths written without $…$ (some bank questions: "(5^{1/2} + 7^{1/8})¹⁰²⁴", "x^{n−r}")
const SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-", "ⁿ": "n" };
const SUB = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9", "₊": "+", "₋": "-", "ᵣ": "r" };
// Words are sorted into: M = maths (has \frac-style command, x^…, x_{…}/x_1),
// J = joins two sides (+ − = × … or a lone command like \times, \sin), O = short operand (1.496, a, dx).
// A run like  O J M,  M J O J M  or  O \sin O  is wrapped; a run needs at least one M or command,
// and an operand only joins across a J, so "If x^{n−r} is" never swallows "is".
const MATHY = /\\[a-zA-Z]{2,}|[\w)\]}]\^(\{|[\w(\\])|[\w)\]}]_(\{|\w(?!\w))/;
const CMD = /^\\[a-zA-Z]+$/;
const JOIN = /^(?:[+\-−=×·÷<>≤≥≠±*/]|\\[a-zA-Z]+)$/;
const OPERAND = /^(?:\(?-?\d[\d.]*\)?|\(?[A-Za-z]{1,2}\d?\)?)[,.]?$/;
const balanced = (s, a, b) => { let d = 0; for (const c of s) { if (c === a) d++; else if (c === b && --d < 0) return false; } return d === 0; };
const supSub = (s) => s
  .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ]+/g, (m) => `^{${[...m].map((c) => SUP[c]).join("")}}`)
  .replace(/[₀₁₂₃₄₅₆₇₈₉₊₋ᵣ]+/g, (m) => `_{${[...m].map((c) => SUB[c]).join("")}}`);

/** Wrap runs of bare LaTeX in plain text with $…$ so KaTeX typesets them. */
export function wrapBareMath(text) {
  if (!MATHY.test(text)) return text;
  const parts = text.split(/(\s+)/);                       // words (even) and the spaces between them (odd)
  const isM = (w) => MATHY.test(w) && !CMD.test(w), isJ = (w) => JOIN.test(w), isO = (w) => OPERAND.test(w);
  const term = (w) => w !== undefined && (isM(w) || isO(w));
  const sameLine = (k) => !/\n/.test(parts[k] || "");
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i];
    if (i % 2) { out.push(w); continue; }
    // a run starts at a maths word, or at an operand that is followed by a joiner
    const startsRun = isM(w) || (isO(w) && isJ(parts[i + 2] || "") && sameLine(i + 1));
    if (!startsRun) { out.push(w); continue; }
    let j = i, hasMath = isM(w);
    while (j + 4 < parts.length + 1 && isJ(parts[j + 2] || "") && term(parts[j + 4]) && sameLine(j + 1) && sameLine(j + 3)
      && !/[,.;:]$/.test(parts[j].replace(/\\[,;:!]$/, ""))) {
      hasMath ||= CMD.test(parts[j + 2]) || isM(parts[j + 4]);
      j += 4;
    }
    if (!hasMath) { out.push(w); continue; }
    let run = parts.slice(i, j + 1).join("");
    const lead = run.match(/^[^\w(\\[{]*/)[0];              // quotes etc. stay outside
    let trail = run.match(/[.,;:!?]*$/)[0];                 // sentence punctuation stays outside…
    if (trail && run.slice(0, run.length - trail.length).endsWith("\\")) trail = trail.slice(1);   // …but "\," is a LaTeX space
    run = run.slice(lead.length, run.length - trail.length);
    if (run && balanced(run, "{", "}") && !/https?:|\$/.test(run)) out.push(`${lead}$${supSub(run)}$${trail}`);
    else out.push(parts.slice(i, j + 1).join(""));
    i = j;
  }
  return out.join("");
}

/** Put text (with $maths$ and \n line breaks) into el, rendered. */
export function renderMath(el, text) {
  // line breaks become <br> only OUTSIDE maths; inside $$…$$ they are spaces, or KaTeX
  // would see the formula split across lines and leave it unrendered.
  // Text outside $…$ is checked for bare LaTeX first.
  const MATH = /(\$\$[\s\S]*?\$\$|\$[^$\n]*\$)/g;
  const src = String(text ?? "").split(MATH).map((p, i) => (i % 2 ? p : wrapBareMath(p))).join("");
  el.innerHTML = src.split(MATH)
    .map((part, i) => (i % 2 ? esc(part.replace(/\s*\n\s*/g, " ")) : esc(part).replace(/\n/g, "<br>")))
    .join("");
  if (window.renderMathInElement) {
    window.renderMathInElement(el, { delimiters: DELIMS, throwOnError: false, strict: "ignore" });
  }
  return el;
}

export function mathHTML(text) {
  const d = document.createElement("span");
  renderMath(d, text);
  return d.innerHTML;
}

/** A figure: image + label overlays positioned in % so they scale with the image. */
export function figureEl(fig, { maxWidthPct } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "fig";
  const inner = document.createElement("div");
  inner.className = "fig-inner";
  inner.style.width = `${Math.min(100, fig.width || 70, maxWidthPct || 100)}%`;
  const img = document.createElement("img");
  img.src = fig.src;
  img.alt = "Diagram";
  inner.appendChild(img);
  for (const lb of fig.labels || []) inner.appendChild(labelEl(lb));
  wrap.appendChild(inner);
  return wrap;
}

export function labelEl(lb) {
  const el = document.createElement("span");
  el.className = "fig-label" + (lb.cover !== false ? " cover" : "");
  el.style.left = `${lb.x}%`;
  el.style.top = `${lb.y}%`;
  el.style.fontSize = `${lb.size || 13}px`;
  renderMath(el, lb.text || "");
  return el;
}

export const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export function optionLabel(i, style = "(1)") {
  if (style === "(a)") return `(${"abcd"[i]})`;
  if (style === "(A)") return `(${"ABCD"[i]})`;
  return `(${i + 1})`;
}
