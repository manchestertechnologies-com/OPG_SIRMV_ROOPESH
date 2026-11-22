// The question form, laid out like the reference video: every field has its text box, an
// image picker and an edit (crop) button that opens the crop window.
// Used on the Add Question page and when editing a question from a paper.

import { esc, renderMath, figureEl } from "./render.js";
import { openCropModal } from "./crop-modal.js";
import { openDiagramEditor } from "./diagram.js";
import { uid } from "./store.js";
import { icon } from "./icons.js";

export function blankQuestion() {
  return {
    id: uid("q"), subject: "", chapter: "", type: "MCQ", text: "", images: [],
    options: [0, 1, 2, 3].map(() => ({ text: "", images: [] })),
    answer: [], numAnswer: "", solution: "", solutionImages: [], lockOptions: false, createdAt: Date.now(),
  };
}

const fileToUrl = (file) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });

/**
 * Mount the form. opts: { onSave(q), saveLabel, onCancel, answerLabels: ["(1)",...] }
 * answerLabels lets the paper editor show the SET's option numbering.
 */
export function mountQuestionForm(root, q0, opts = {}) {
  const q = structuredClone(q0 || blankQuestion());
  root.innerHTML = `
    <form class="qf" onsubmit="return false">
      <div class="qf-grid3">
        <label>Question Type <span class="req">*</span><select name="type"><option value="MCQ">1. MCQ Question</option><option value="NUMERICAL">2. Numerical Question</option></select></label>
        <label>Select subject <span class="req">*</span><input name="subject" value="${esc(q.subject)}" placeholder="Mathematics" list="subject-list"></label>
        <label>Select chapter<input name="chapter" value="${esc(q.chapter)}" placeholder="Triangles"></label>
      </div>
      <datalist id="subject-list"><option>Mathematics</option><option>Physics</option><option>Chemistry</option><option>Biology</option></datalist>
      <div class="qf-fields"></div>
      <div class="qf-answers"></div>
      <div class="qf-field-slot" data-slot="solution"></div>
      <div class="qf-foot">
        ${opts.onCancel ? `<button class="btn btn-grey qf-cancel" type="button">Cancel</button>` : ""}
        <button class="btn btn-blue qf-save" type="button">${esc(opts.saveLabel || "Create Question")}</button>
        <span class="qf-msg"></span>
      </div>
    </form>`;
  const form = root.querySelector("form");
  form.type.value = q.type;

  function field(slot, label, getText, setText, getImgs, target) {
    const wrap = document.createElement("div");
    wrap.className = "qf-field";
    const req = label.endsWith("*");
    const name = label.replace(/\s*\*$/, "");
    wrap.innerHTML = `
      <div class="qf-l"><label>${name}${req ? ' <span class="req">*</span>' : ""}</label>
        <textarea rows="2" placeholder=""></textarea>
        <div class="qf-render"></div>
        <div class="qf-imgs"></div>
      </div>
      <div class="qf-r">
        <label class="qf-imglab">${name} Image(s)</label>
        <div class="qf-row">
          <label class="filebox"><b>Choose File</b><span class="fname">No file</span><input type="file" accept="image/*" hidden multiple></label>
          <button type="button" class="btn btn-ico" title="Crop and convert from a page">${icon("edit", 15)}</button>
        </div>
      </div>`;
    const ta = wrap.querySelector("textarea"), rd = wrap.querySelector(".qf-render"), imgs = wrap.querySelector(".qf-imgs");
    ta.value = getText();
    renderMath(rd, ta.value);
    ta.oninput = () => { setText(ta.value); renderMath(rd, ta.value); };
    const drawImgs = () => {
      imgs.innerHTML = "";
      getImgs().forEach((fig, i) => {
        const card = document.createElement("div");
        card.className = "qf-img";
        card.appendChild(figureEl(fig));
        const bar = document.createElement("div");
        bar.className = "qf-img-bar";
        bar.innerHTML = `<button type="button" class="btn btn-sm">Edit labels</button><button type="button" class="btn btn-sm">Remove</button>`;
        bar.children[0].onclick = () => openDiagramEditor(fig, (nf) => { getImgs()[i] = nf; drawImgs(); });
        bar.children[1].onclick = () => { getImgs().splice(i, 1); drawImgs(); };
        card.appendChild(bar);
        imgs.appendChild(card);
      });
    };
    drawImgs();
    wrap.querySelector('input[type="file"]').onchange = async (e) => {
      wrap.querySelector(".fname").textContent = e.target.files[0]?.name || "No file";
      for (const file of e.target.files) getImgs().push({ src: await fileToUrl(file), width: 70, labels: [] });
      e.target.value = "";
      drawImgs();
    };
    wrap.querySelector(".btn-ico").onclick = () => openCropModal(target, (res) => {
      if (res.kind === "image") { getImgs().push({ src: res.image, width: 70, labels: [] }); drawImgs(); return; }
      if (res.mode === "question_options") {
        q.text = res.data.question;
        res.data.options.forEach((t, i) => (q.options[i].text = t));
        redrawFields();
        return;
      }
      const t = res.data.solution ?? res.data.text ?? "";
      setText(t); ta.value = t; renderMath(rd, t);
    });
    (slot || form.querySelector(".qf-fields")).appendChild(wrap);
    return wrap;
  }

  function redrawFields() {
    const box = form.querySelector(".qf-fields");
    box.innerHTML = "";
    field(null, "Question *", () => q.text, (v) => (q.text = v), () => q.images, "question");
    if (q.type === "MCQ") {
      q.options.forEach((o, i) => field(null, `Option ${i + 1} *`, () => o.text, (v) => (o.text = v), () => o.images, "option"));
    }
    drawAnswers();
  }

  function drawAnswers() {
    const box = form.querySelector(".qf-answers");
    if (q.type === "NUMERICAL") {
      box.innerHTML = `<label class="qf-ans-t">Answer *<input class="qf-num" value="${esc(q.numAnswer)}" placeholder="e.g. 12.5"></label>`;
      box.querySelector(".qf-num").oninput = (e) => (q.numAnswer = e.target.value);
      return;
    }
    const labels = opts.answerLabels || ["Option (1)", "Option (2)", "Option (3)", "Option (4)"];
    const map = opts.answerMap || [0, 1, 2, 3];        // printed position -> base option index
    box.innerHTML = `<div class="qf-ans-t">Answer(s) <span class="req">*</span></div><div class="qf-ans">${labels.map((l, i) =>
      `<label><input type="checkbox" data-i="${map[i]}" ${q.answer.includes(map[i]) ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div>
      <label class="qf-lock"><input type="checkbox" ${q.lockOptions ? "checked" : ""}> Keep option order in all sets (e.g. "All of the above")</label>`;
    box.querySelectorAll("[data-i]").forEach((c) => (c.onchange = () => {
      q.answer = [...box.querySelectorAll("[data-i]:checked")].map((x) => +x.dataset.i).sort();
    }));
    box.querySelector(".qf-lock input").onchange = (e) => (q.lockOptions = e.target.checked);
  }

  field(form.querySelector('[data-slot="solution"]'), "Solution", () => q.solution, (v) => (q.solution = v), () => q.solutionImages, "solution");
  redrawFields();

  form.subject.oninput = (e) => (q.subject = e.target.value.trim());
  form.chapter.oninput = (e) => (q.chapter = e.target.value.trim());
  form.type.onchange = (e) => { q.type = e.target.value; redrawFields(); };
  root.querySelector(".qf-cancel")?.addEventListener("click", () => opts.onCancel());
  root.querySelector(".qf-save").onclick = async () => {
    const msg = root.querySelector(".qf-msg");
    const problem = !q.text.trim() && !q.images.length ? "Add the question text."
      : q.type === "MCQ" && q.options.some((o) => !o.text.trim() && !o.images.length) ? "Fill in all 4 options."
      : q.type === "MCQ" && !q.answer.length ? "Tick the correct answer."
      : q.type === "NUMERICAL" && !String(q.numAnswer).trim() ? "Enter the answer." : "";
    if (problem) { msg.textContent = problem; msg.className = "qf-msg err"; return; }
    if (q.type === "NUMERICAL") { q.options = []; q.answer = []; }
    await opts.onSave(q);
    msg.textContent = "Saved.";
    msg.className = "qf-msg ok";
  };
  return q;
}
