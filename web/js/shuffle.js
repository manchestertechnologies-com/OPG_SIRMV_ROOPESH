// Building sets A-H from the base paper, and keeping keys/solutions correct for each set.
//
// How the sets are made (decided here):
//   * Set A is the base paper: the order and options exactly as built.
//   * Sets B-H shuffle the question order WITHIN each subject (subjects stay in their blocks),
//     and shuffle the four options of every MCQ unless its options must stay put.
//   * A seeded random generator is used, so the same paper + seed always gives the same sets
//     (a reprint months later matches the keys already handed out).
//   * Each set is tried several times and the version that differs most from the sets
//     before it is kept: fewest questions in the same position, fewest identical answers
//     in the same position. That makes copying from a neighbour's paper useless.
//   * Options are kept in place when they refer to each other ("All of the above",
//     "Both (1) and (2)", "None of these") or when the question is marked lockOptions.
//
// Every set stores { order: [question ids], opt: { id: perm } }. perm[newPos] = basePos.
// Solutions are stored once, on the question, so a question's solution always appears under
// whatever number it has in that set.

import { LETTERS } from "./render.js";

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const LOCK_RE = /\b(all|none|both|neither)\b.*\b(above|these|of|and|nor)\b|\babove\b|\(\s*[1-4a-dA-D]\s*\)\s*(and|&|or)\s*\(\s*[1-4a-dA-D]\s*\)/i;

export function optionsLocked(q) {
  if (q.type === "NUMERICAL" || !q.options?.length) return true;
  if (q.lockOptions) return true;
  return q.options.some((o) => LOCK_RE.test(o.text || ""));
}

const identity = (n) => Array.from({ length: n }, (_, i) => i);

/** Correct option positions (0-based) of q inside a set. */
export function answerPositions(set, q) {
  const perm = set.opt?.[q.id] || identity(q.options?.length || 4);
  return (q.answer || []).map((b) => perm.indexOf(b)).filter((i) => i >= 0).sort();
}

/** What goes in the answer key for q in this set: "2", "1,3" or the numerical value. */
export function keyText(set, q) {
  if (q.type === "NUMERICAL") return String(q.numAnswer ?? "");
  const pos = answerPositions(set, q);
  return pos.length ? pos.map((i) => i + 1).join(",") : "-";
}

/** Set an answer typed in a set's key back onto the base question. */
export function setAnswerFromSet(set, q, positions) {
  const perm = set.opt?.[q.id] || identity(q.options.length);
  q.answer = positions.map((p) => perm[p]).sort();
}

/** The set's options for q, in printed order. */
export function setOptions(set, q) {
  const perm = set.opt?.[q.id] || identity(q.options?.length || 0);
  return perm.map((b) => q.options[b]);
}

function groupBySubject(ids, qmap) {
  const groups = [];
  for (const id of ids) {
    const s = qmap.get(id)?.subject || "";
    if (!groups.length || groups[groups.length - 1].subject !== s) groups.push({ subject: s, ids: [] });
    groups[groups.length - 1].ids.push(id);
  }
  return groups;
}

function buildOne(baseIds, qmap, rand, shuffleOpts) {
  const order = groupBySubject(baseIds, qmap).flatMap((g) => shuffled(g.ids, rand));
  const opt = {};
  for (const id of baseIds) {
    const q = qmap.get(id);
    if (shuffleOpts && !optionsLocked(q)) opt[id] = shuffled(identity(q.options.length), rand);
  }
  return { order, opt };
}

function similarity(a, b, qmap) {
  let s = 0;
  for (let i = 0; i < a.order.length; i++) {
    if (a.order[i] === b.order[i]) s += 2;                      // same question, same number
    const qa = qmap.get(a.order[i]), qb = qmap.get(b.order[i]);
    if (qa && qb && keyText(a, qa) === keyText(b, qb)) s += 1;  // same answer at that number
  }
  return s;
}

/** Make all 8 sets. Set A = base. */
export function generateSets(paper, questions, seed = paper.seed || Date.now()) {
  const qmap = new Map(questions.map((q) => [q.id, q]));
  const base = paper.questionIds.filter((id) => qmap.has(id));
  const rand = rng(seed);
  const sets = { A: { order: base.slice(), opt: {} } };
  for (const L of LETTERS.slice(1)) {
    let best = null, bestScore = Infinity;
    for (let t = 0; t < 30; t++) {
      const cand = buildOne(base, qmap, rand, paper.settings.shuffleOptions !== false);
      const score = Object.values(sets).reduce((m, s) => Math.max(m, similarity(cand, s, qmap)), 0);
      if (score < bestScore) { best = cand; bestScore = score; }
    }
    sets[L] = best;
  }
  paper.seed = seed;
  paper.sets = sets;
  return sets;
}

/** Re-shuffle one set only (keeps the others and their keys). */
export function reshuffleSet(paper, questions, L) {
  if (L === "A") return;
  const qmap = new Map(questions.map((q) => [q.id, q]));
  const rand = rng((paper.seed || 1) + Date.now());
  paper.sets[L] = buildOne(paper.questionIds.filter((id) => qmap.has(id)), qmap, rand,
    paper.settings.shuffleOptions !== false);
}

/** Keep every set in step with the base question list (added / removed questions). */
export function syncSets(paper, questions) {
  if (!paper.sets) return generateSets(paper, questions);
  const ids = paper.questionIds;
  const qmap = new Map(questions.map((q) => [q.id, q]));
  const rand = rng(Date.now());
  for (const L of LETTERS) {
    const s = paper.sets[L] || (paper.sets[L] = { order: [], opt: {} });
    s.order = s.order.filter((id) => ids.includes(id));
    for (const id of ids) {
      if (s.order.includes(id)) continue;
      // a new question: Set A keeps base position, other sets get a random slot in its subject
      if (L === "A") s.order.splice(ids.indexOf(id), 0, id);
      else {
        const subj = qmap.get(id)?.subject;
        const slots = s.order.map((x, i) => [x, i]).filter(([x]) => qmap.get(x)?.subject === subj);
        const at = slots.length ? slots[Math.floor(rand() * slots.length)][1] : s.order.length;
        s.order.splice(at, 0, id);
        const q = qmap.get(id);
        if (paper.settings.shuffleOptions !== false && !optionsLocked(q)) s.opt[id] = shuffled(identity(q.options.length), rand);
      }
    }
    if (L === "A") s.order = ids.slice();
  }
  return paper.sets;
}

/** Swap question numbers a and b (1-based) in one set. */
export function swapInSet(paper, L, a, b) {
  const o = paper.sets[L].order;
  [o[a - 1], o[b - 1]] = [o[b - 1], o[a - 1]];
  if (L === "A") paper.questionIds = o.slice();
}

/** Move question number a to position b (1-based); the questions between shift by one. */
export function moveInSet(paper, L, a, b) {
  const o = paper.sets[L].order;
  const [id] = o.splice(a - 1, 1);
  o.splice(b - 1, 0, id);
  if (L === "A") paper.questionIds = o.slice();
}

/** Where a question sits in every set: { A: 1, B: 19, ... } */
export function positionsOf(paper, id) {
  return Object.fromEntries(LETTERS.map((L) => [L, (paper.sets[L]?.order.indexOf(id) ?? -1) + 1]));
}
