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

/** Put text (with $maths$ and \n line breaks) into el, rendered. */
export function renderMath(el, text) {
  // line breaks become <br> only OUTSIDE maths; inside $$…$$ they are spaces, or KaTeX
  // would see the formula split across lines and leave it unrendered
  el.innerHTML = String(text ?? "").split(/(\$\$[\s\S]*?\$\$|\$[^$\n]*\$)/g)
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
