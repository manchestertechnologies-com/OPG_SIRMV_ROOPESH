// Data layer. Everything the app saves goes through these functions.
// INTEGRATION: replace the bodies with calls to the main app's API/database.
// The rest of the app only uses this exported interface.
//
// Question {
//   id, subject, chapter, type: "MCQ" | "NUMERICAL",
//   text,                       // question text, maths as $LaTeX$
//   images: [Figure],           // diagrams under the question text
//   options: [{ text, images: [Figure] }],   // 4 options (MCQ)
//   answer: [0..3],             // correct option index(es) in the BASE order
//   numAnswer: "",              // NUMERICAL answer
//   solution, solutionImages: [Figure],
//   lockOptions: false,         // true = never shuffle this question's options
//   createdAt
// }
// Figure { src (data URL or URL), width (% of column, default 70),
//          labels: [{ x, y (% of image), text, size (px), cover (white box behind) }] }
//
// Paper {
//   id, name, header: { collegeName, subTitle, examTitle, subject, className, time,
//                       maxMarks, instructions: [string], logo, date },
//   settings: { columns: 1|2, fontSize, optionLabels: "(1)"|"(a)"|"(A)",
//               shuffleOptions: true, duplexPad: true },
//   questionIds: [id],          // Set A order = the base paper
//   sets: { A: { order: [id], opt: { [id]: [perm] } }, B: ..., ... H },
//   seed, updatedAt
// }

const DB_NAME = "paper-studio", DB_VER = 1;
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("questions")) d.createObjectStore("questions", { keyPath: "id" });
        if (!d.objectStoreNames.contains("papers")) d.createObjectStore("papers", { keyPath: "id" });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && "result" in out ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}

export const uid = (p = "q") => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const listQuestions = () => tx("questions", "readonly", (s) => s.getAll());
export const getQuestion = (id) => tx("questions", "readonly", (s) => s.get(id));
export const saveQuestion = (q) => tx("questions", "readwrite", (s) => { s.put(q); return q; });
export const deleteQuestion = (id) => tx("questions", "readwrite", (s) => s.delete(id));

export const listPapers = () => tx("papers", "readonly", (s) => s.getAll());
export const getPaper = (id) => tx("papers", "readonly", (s) => s.get(id));
export const savePaper = (p) => tx("papers", "readwrite", (s) => { p.updatedAt = Date.now(); s.put(p); return p; });
export const deletePaper = (id) => tx("papers", "readwrite", (s) => s.delete(id));

export async function getQuestionsByIds(ids) {
  const all = await listQuestions();
  const map = new Map(all.map((q) => [q.id, q]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}
