// Diagram label editor. A diagram keeps its original image; labels are text placed on top
// of it (with a white box that hides the old printed label). Changing a triangle's "5 cm" to
// "7 cm": add a label over "5 cm", type "7 cm". Labels accept $LaTeX$ ($60^\circ$, $\theta$).

import { esc, labelEl } from "./render.js";

export function openDiagramEditor(fig, onSave) {
  const f = structuredClone(fig);
  f.labels ||= [];
  f.width ||= 70;
  let placing = false;

  const m = document.createElement("div");
  m.className = "cm-backdrop";
  m.innerHTML = `
    <div class="cm dg" role="dialog" aria-label="Edit diagram labels">
      <div class="dg-head">
        <b>Edit diagram</b>
        <span class="muted">Click <i>Add label</i>, then click on the diagram where it goes. Drag labels to move them.</span>
      </div>
      <div class="dg-body">
        <div class="dg-canvas"><div class="fig-inner dg-inner"><img src="${esc(f.src)}" alt="Diagram"></div></div>
        <div class="dg-side">
          <button class="btn btn-blue dg-add">+ Add label</button>
          <div class="dg-list"></div>
          <label class="dg-w">Diagram width on paper: <b class="dg-wv">${f.width}%</b>
            <input type="range" min="20" max="100" step="5" value="${f.width}" class="dg-wr"></label>
        </div>
      </div>
      <div class="cm-actions">
        <button class="btn btn-grey dg-cancel">Cancel</button><span class="cm-spacer"></span>
        <button class="btn btn-green dg-save">Save diagram</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const inner = m.querySelector(".dg-inner"), list = m.querySelector(".dg-list");

  function draw() {
    inner.querySelectorAll(".fig-label").forEach((n) => n.remove());
    f.labels.forEach((lb, i) => {
      const n = labelEl(lb);
      n.classList.add("dg-drag");
      n.title = "Drag to move";
      n.onpointerdown = (e) => drag(e, i, n);
      inner.appendChild(n);
    });
    list.innerHTML = f.labels.length ? "" : `<p class="muted">No labels yet.</p>`;
    f.labels.forEach((lb, i) => {
      const row = document.createElement("div");
      row.className = "dg-row";
      row.innerHTML = `
        <input class="dg-t" value="${esc(lb.text)}" placeholder="e.g. 7 cm or $60^\\circ$">
        <input class="dg-s" type="number" min="8" max="40" value="${lb.size || 13}" title="Text size">
        <label title="White box hides the old label underneath"><input type="checkbox" class="dg-c" ${lb.cover !== false ? "checked" : ""}> cover</label>
        <button class="dg-del" title="Delete label">×</button>`;
      row.querySelector(".dg-t").oninput = (e) => { lb.text = e.target.value; refreshLabel(i); };
      row.querySelector(".dg-s").oninput = (e) => { lb.size = +e.target.value || 13; refreshLabel(i); };
      row.querySelector(".dg-c").onchange = (e) => { lb.cover = e.target.checked; refreshLabel(i); };
      row.querySelector(".dg-del").onclick = () => { f.labels.splice(i, 1); draw(); };
      list.appendChild(row);
    });
  }
  function refreshLabel(i) {
    const old = inner.querySelectorAll(".fig-label")[i];
    const n = labelEl(f.labels[i]);
    n.classList.add("dg-drag");
    n.onpointerdown = (e) => drag(e, i, n);
    old.replaceWith(n);
  }
  function drag(e, i, node) {
    e.preventDefault();
    const r = inner.getBoundingClientRect();
    node.setPointerCapture(e.pointerId);
    node.onpointermove = (ev) => {
      f.labels[i].x = Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100));
      f.labels[i].y = Math.max(0, Math.min(100, ((ev.clientY - r.top) / r.height) * 100));
      node.style.left = `${f.labels[i].x}%`;
      node.style.top = `${f.labels[i].y}%`;
    };
    node.onpointerup = () => { node.onpointermove = null; };
  }

  m.querySelector(".dg-add").onclick = () => { placing = true; inner.classList.add("placing"); };
  inner.addEventListener("click", (e) => {
    if (!placing || e.target.closest(".fig-label")) return;
    const r = inner.getBoundingClientRect();
    f.labels.push({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100, text: "label", size: 13, cover: true });
    placing = false;
    inner.classList.remove("placing");
    draw();
    list.querySelectorAll(".dg-t")[f.labels.length - 1]?.select();
  });
  m.querySelector(".dg-wr").oninput = (e) => { f.width = +e.target.value; m.querySelector(".dg-wv").textContent = `${f.width}%`; };
  const closeIt = () => m.remove();
  m.querySelector(".dg-cancel").onclick = closeIt;
  m.querySelector(".dg-save").onclick = () => { onSave(f); closeIt(); };
  draw();
}
