// Answer key of all sets on ONE page, in the spreadsheet look of the reference sheet:
// per set, rows of "Q. NO" / "KEY" with N question columns, all sets stacked, scaled to fit.
// Also exports the same layout as a real .xlsx (ExcelJS).

import { esc, LETTERS } from "./render.js";
import { keyText } from "./shuffle.js";

const PER_ROW = 15;

function keyRows(paper, questions, L) {
  const qmap = new Map(questions.map((q) => [q.id, q]));
  const set = paper.sets[L];
  return set.order.map((id, i) => ({ n: i + 1, key: qmap.get(id) ? keyText(set, qmap.get(id)) : "-" }));
}

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function titleOf(paper) {
  const h = paper.header || {};
  return [h.examTitle || paper.name, "KEY ANS", h.subject ? `(${h.subject})` : "", h.date || ""].filter(Boolean).join(" - ").replace(" - (", " (");
}

/** One landscape A4 page holding the keys of the chosen sets. */
export function keySheetPage(paper, questions, letters = LETTERS, editable = false) {
  const page = document.createElement("div");
  page.className = "qp-page key-page landscape";
  const fit = document.createElement("div");
  fit.className = "key-fit";
  fit.innerHTML = `<div class="key-title">${esc(titleOf(paper))}</div>`;
  const perRow = paper.settings.keyPerRow || PER_ROW;
  for (const L of letters) {
    const rows = keyRows(paper, questions, L);
    const parts = chunks(rows, perRow);
    const t = document.createElement("table");
    t.className = "key-table";
    t.innerHTML = parts.map((part, pi) => `
      <tr class="key-qno">${pi === 0 ? `<th rowspan="${parts.length * 2}" class="key-set">SET ${L}</th>` : ""}
        <th class="key-lab">Q. NO</th>${part.map((r) => `<td>${r.n}</td>`).join("")}${"<td></td>".repeat(perRow - part.length)}</tr>
      <tr class="key-key"><th class="key-lab">KEY</th>${part.map((r) => `<td data-set="${L}" data-n="${r.n}" ${editable ? 'contenteditable="true"' : ""}>${esc(r.key)}</td>`).join("")}${"<td></td>".repeat(perRow - part.length)}</tr>`).join("");
    fit.appendChild(t);
  }
  page.appendChild(fit);
  return page;
}

/** After the page is in the document: shrink the content until it fits one page. */
export function fitKeySheet(page) {
  const fit = page.querySelector(".key-fit");
  fit.style.transform = "none";
  const availW = page.clientWidth - 40, availH = page.clientHeight - 40;
  // grow small keys up to 1.8x so they fill the sheet; shrink big ones until they fit
  const s = Math.min(1.8, availW / fit.scrollWidth, availH / fit.scrollHeight);
  const left = Math.max(0, (availW - fit.scrollWidth * s) / 2);
  fit.style.transform = `translateX(${left}px) scale(${s})`;
}

export async function downloadKeyXlsx(paper, questions, letters = LETTERS) {
  const ExcelJS = window.ExcelJS;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Answer keys", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  const perRow = paper.settings.keyPerRow || PER_ROW;
  const border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  ws.mergeCells(1, 1, 1, perRow + 2);
  Object.assign(ws.getCell(1, 1), { value: titleOf(paper) });
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(1, 1).alignment = { horizontal: "center" };
  let r = 3;
  for (const L of letters) {
    const parts = chunks(keyRows(paper, questions, L), perRow);
    const top = r;
    parts.forEach((part) => {
      ws.getCell(r, 2).value = "Q. NO";
      ws.getCell(r + 1, 2).value = "KEY";
      for (let c = 0; c < perRow; c++) {
        const row = part[c];
        ws.getCell(r, c + 3).value = row ? row.n : null;
        const k = row ? row.key : null;
        ws.getCell(r + 1, c + 3).value = k !== null && /^\d+$/.test(k) ? Number(k) : k;
      }
      for (const rr of [r, r + 1]) {
        for (let c = 2; c <= perRow + 2; c++) {
          const cell = ws.getCell(rr, c);
          cell.border = border;
          cell.alignment = { horizontal: "center", vertical: "middle" };
          if (c === 2 || rr === r) cell.font = { bold: true };
        }
      }
      ws.getRow(r).getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
      r += 2;
    });
    ws.mergeCells(top, 1, r - 1, 1);
    const sc = ws.getCell(top, 1);
    sc.value = `SET ${L}`;
    sc.font = { bold: true };
    sc.alignment = { horizontal: "center", vertical: "middle" };
    sc.border = border;
    r += 1;
  }
  ws.getColumn(1).width = 9;
  ws.getColumn(2).width = 8;
  for (let c = 3; c <= perRow + 2; c++) ws.getColumn(c).width = 5;
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  a.download = `${(paper.header?.examTitle || paper.name || "paper").replace(/[^\w-]+/g, "_")}_keys.xlsx`;
  a.click();
}
