// The crop window, laid out like the reference video:
//   top    - the page with a crop box, then a large preview of the crop
//   bottom - "Converted text" (editable LaTeX) on the left, rendered preview on the right,
//            "Select image" + Convert, then Cancel and the send buttons.
// Reading is done offline by the server (GLM-OCR); no API key.

import { renderMath } from "./render.js";
import { icon } from "./icons.js";

let state = null;

const BUTTONS = {
  question: [["question", "Question", "green"], ["question_options", "Question & Options", "blue"]],
  option: [["image", "Option Image", "blue"], ["text", "Option", "blue"]],
  solution: [["image", "Solution Image", "blue"], ["solution", "Solution", "blue"]],
};

function el(html) {
  const d = document.createElement("div");
  d.innerHTML = html.trim();
  return d.firstChild;
}

/**
 * Open the crop window.
 * target: "question" | "option" | "solution"
 * onResult({ kind: "text"|"image", mode, data, image }) is called for the button pressed.
 */
export function openCropModal(target, onResult) {
  close();
  const m = el(`
    <div class="cm-backdrop">
      <div class="cm" role="dialog" aria-label="Crop and convert">
        <div class="cm-top">
          <div class="cm-stage"><div class="cm-hint">Choose a page image or PDF below, or paste a screenshot (Ctrl+V).<br>Then drag a box over the part you want.</div></div>
          <div class="cm-pdfnav" hidden><button data-a="prev">‹ Page</button><span class="cm-page"></span><button data-a="next">Page ›</button></div>
          <div class="cm-preview" hidden></div>
        </div>
        <div class="cm-bottom">
          <div class="cm-left">
            <label class="cm-lab">Converted Text</label>
            <textarea class="cm-text" rows="7"></textarea>
            <label class="cm-lab">Select Image <span class="req">*</span></label>
            <div class="cm-row">
              <label class="filebox"><b>Choose File</b><span class="fname">No file chosen</span><input type="file" class="cm-file" accept="image/*,application/pdf" hidden></label>
              <button class="btn btn-blue cm-convert">${icon("refresh", 15)} Convert</button>
            </div>
            <div class="cm-status"></div>
          </div>
          <div class="cm-right"><div class="cm-render"></div></div>
        </div>
        <div class="cm-actions">
          <button class="btn btn-grey" data-a="cancel">Cancel</button>
          <span class="cm-spacer"></span>
          ${BUTTONS[target].map(([mode, label, color]) => `<button class="btn btn-${color}" data-send="${mode}">${label}</button>`).join("")}
        </div>
      </div>
    </div>`);
  document.body.appendChild(m);
  state = { m, target, onResult, cropper: null, pdf: null, page: 1, lastMode: null, raw: null };

  const text = m.querySelector(".cm-text"), render = m.querySelector(".cm-render");
  text.addEventListener("input", () => renderMath(render, text.value));
  m.querySelector(".cm-file").onchange = (e) => {
    m.querySelector(".fname").textContent = e.target.files[0]?.name || "No file chosen";
    loadFile(e.target.files[0]);
  };
  m.querySelector(".cm-convert").onclick = () => convert(target === "solution" ? "solution" : target === "option" ? "question" : "question_options");
  m.querySelector('[data-a="cancel"]').onclick = close;
  m.querySelector('[data-a="prev"]').onclick = () => { if (state.pdf && state.page > 1) { state.page--; showPdf(); } };
  m.querySelector('[data-a="next"]').onclick = () => { if (state.pdf && state.page < state.pdf.numPages) { state.page++; showPdf(); } };
  m.querySelectorAll("[data-send]").forEach((b) => (b.onclick = () => send(b.dataset.send)));
  m.addEventListener("click", (e) => { if (e.target === m) close(); });
  document.addEventListener("paste", onPaste);
  document.addEventListener("keydown", onKey);
}

function onPaste(e) {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item && state) loadFile(item.getAsFile());
}
function onKey(e) { if (e.key === "Escape") close(); }

export function close() {
  if (!state) return;
  state.cropper?.destroy();
  state.m.remove();
  document.removeEventListener("paste", onPaste);
  document.removeEventListener("keydown", onKey);
  state = null;
}

function status(msg, kind = "") {
  const s = state.m.querySelector(".cm-status");
  s.textContent = msg;
  s.className = "cm-status " + kind;
}

async function loadFile(file) {
  if (!file) return;
  status("");
  if (file.type === "application/pdf") {
    state.pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    state.page = 1;
    state.m.querySelector(".cm-pdfnav").hidden = false;
    await showPdf();
  } else {
    state.pdf = null;
    state.m.querySelector(".cm-pdfnav").hidden = true;
    showImage(URL.createObjectURL(file));
  }
}

async function showPdf() {
  const p = await state.pdf.getPage(state.page);
  const vp = p.getViewport({ scale: 2.5 });          // ~250 dpi: crisp crops for the reader
  const c = document.createElement("canvas");
  c.width = vp.width; c.height = vp.height;
  await p.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  state.m.querySelector(".cm-page").textContent = `Page ${state.page} / ${state.pdf.numPages}`;
  showImage(c.toDataURL("image/png"));
}

function showImage(src) {
  state.cropper?.destroy();
  const stage = state.m.querySelector(".cm-stage");
  stage.innerHTML = `<img alt="Page">`;
  const img = stage.querySelector("img");
  img.onload = () => {
    state.cropper = new window.Cropper(img, {
      viewMode: 1, autoCropArea: 0.4, background: false, zoomable: true,
      crop: debounce(preview, 120),
    });
  };
  img.src = src;
}

export function cropUrl() {
  const c = state?.cropper?.getCroppedCanvas({ maxWidth: 3000, maxHeight: 3000, fillColor: "#fff", imageSmoothingQuality: "high" });
  return c && c.width > 4 && c.height > 4 ? c.toDataURL("image/png") : null;
}

function preview() {
  if (!state) return;
  const url = cropUrl(), pv = state.m.querySelector(".cm-preview");
  pv.hidden = !url;
  if (url) pv.innerHTML = `<img src="${url}" alt="Crop preview">`;
}

function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

async function convert(mode) {
  const image = cropUrl();
  if (!image) return status("Choose an image and drag a box over the text first.", "err");
  const btn = state.m.querySelector(".cm-convert");
  btn.disabled = true;
  const t0 = Date.now();
  const tick = setInterval(() => (btn.innerHTML = `${icon("refresh", 15)} Converting… ${Math.round((Date.now() - t0) / 1000)}s`), 500);
  status("Reading offline. On a laptop this takes about 30-90 seconds.");
  try {
    const r = await fetch("/api/convert", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, mode: "question_options" }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || `Error ${r.status}`);
    if (!state) return;
    state.raw = data;
    const t = state.m.querySelector(".cm-text");
    t.value = data.raw;
    renderMath(state.m.querySelector(".cm-render"), t.value);
    status("Done. Check the text, edit if needed, then press a button below.", "ok");
  } catch (e) {
    if (state) status(e.message, "err");
  } finally {
    clearInterval(tick);
    if (state) { btn.disabled = false; btn.innerHTML = `${icon("refresh", 15)} Convert`; }
  }
}

async function send(mode) {
  if (mode === "image") {
    const image = cropUrl();
    if (!image) return status("Drag a box over the diagram first.", "err");
    state.onResult({ kind: "image", image });
    return close();
  }
  const text = state.m.querySelector(".cm-text").value.trim();
  if (!text) return status("Convert the crop first, or type the text in the box.", "err");
  let data;
  if (mode === "question_options") {
    // split the (possibly edited) text into stem + options on the server's rules
    data = splitOptions(text);
    if (data.options.length !== 4) {
      return status("Couldn't find 4 options marked (a)-(d) or (1)-(4). Fix the text or use Question.", "err");
    }
  } else if (mode === "solution") data = { solution: text };
  else data = { question: text, text };
  state.onResult({ kind: "text", mode, data });
  close();
}

// Same rule as the server: the last run of four markers in order, (a)-(d) or (1)-(4).
export function splitOptions(text) {
  const re = /(?:(?<=\s)|^)(?:\(\s*([a-dA-D1-4])\s*\)|([a-dA-D1-4])\s*[.)])\s+/g;
  const marks = [...text.matchAll(re)].map((m) => ({ s: m.index, e: m.index + m[0].length, l: (m[1] || m[2]).toLowerCase() }));
  for (const seq of ["abcd", "1234"]) {
    let chosen = null;
    marks.forEach((m, i) => {
      if (m.l !== seq[0]) return;
      const run = [m];
      for (const n of marks.slice(i + 1)) if (run.length < 4 && n.l === seq[run.length]) run.push(n);
      if (run.length === 4) chosen = run;
    });
    if (chosen) {
      return {
        question: text.slice(0, chosen[0].s).trim(),
        options: chosen.map((m, j) => text.slice(m.e, j < 3 ? chosen[j + 1].s : text.length).trim()),
      };
    }
  }
  return { question: text, options: [] };
}
