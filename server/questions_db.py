"""Read questions from the college's 8 question databases (Supabase Postgres, table public.questions).

Connection strings come from paper-studio/.env (SUPABASE_1_DB_URL ... SUPABASE_8_DB_URL). Nothing
here writes: every session is set READ ONLY.

The row -> question mapping follows the column layout of the existing question bank:
question, opt_a..opt_d (or option_a..option_d / options / options_json), correct_option,
num_answer, q_type, chapter, topic, image_url, solution_text, solution_image_url.

SSL: connections are always encrypted. The server certificate is verified against
DB_SSL_CA (path to Supabase's CA certificate, from the Supabase dashboard -> Database ->
SSL) or the system's trusted certificates. Set DB_SSL_VERIFY=off in .env only if you
accept an unverified connection.
"""
from __future__ import annotations

import json
import os
import re
import ssl
from pathlib import Path
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# which database holds which class / subject (from the SUPABASE_n names)
SOURCES = [
    {"key": "math_11", "env": "SUPABASE_1_DB_URL", "subject": "Mathematics", "klass": "11"},
    {"key": "math_12", "env": "SUPABASE_2_DB_URL", "subject": "Mathematics", "klass": "12"},
    {"key": "bio_12", "env": "SUPABASE_3_DB_URL", "subject": "Biology", "klass": "12"},
    {"key": "bio_11", "env": "SUPABASE_4_DB_URL", "subject": "Biology", "klass": "11"},
    {"key": "phy_11", "env": "SUPABASE_5_DB_URL", "subject": "Physics", "klass": "11"},
    {"key": "phy_12", "env": "SUPABASE_6_DB_URL", "subject": "Physics", "klass": "12"},
    {"key": "chem_11", "env": "SUPABASE_7_DB_URL", "subject": "Chemistry", "klass": "11"},
    {"key": "chem_12", "env": "SUPABASE_8_DB_URL", "subject": "Chemistry", "klass": "12"},
]
BY_KEY = {s["key"]: s for s in SOURCES}


def sources() -> list[dict]:
    return [{"key": s["key"], "subject": s["subject"], "klass": s["klass"],
             "label": f"{s['subject']} · Class {s['klass']}",
             "configured": bool(os.environ.get(s["env"], "").strip())} for s in SOURCES]


def _ssl_context() -> ssl.SSLContext:
    ca = os.environ.get("DB_SSL_CA", "").strip()
    if ca and not os.path.isabs(ca):
        ca = str(Path(__file__).resolve().parent.parent / ca)
    ctx = ssl.create_default_context(cafile=ca or None)
    if os.environ.get("DB_SSL_VERIFY", "").strip().lower() == "off":
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _connect(key: str):
    import pg8000.native as pg
    src = BY_KEY.get(key)
    if not src:
        raise KeyError(key)
    url = os.environ.get(src["env"], "").strip()
    if not url:
        raise RuntimeError(f"{src['env']} is not set in paper-studio/.env")
    u = urlparse(url)
    conn = pg.Connection(user=unquote(u.username or ""), password=unquote(u.password or ""),
                         host=u.hostname, port=u.port or 5432, database=(u.path or "/postgres").lstrip("/"),
                         ssl_context=_ssl_context(), timeout=20)
    conn.run("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
    return conn


def _rows(conn, sql, **params) -> list[dict]:
    rows = conn.run(sql, **params)
    cols = [c["name"] for c in conn.columns]
    return [dict(zip(cols, r)) for r in rows]


NOT_TF = "(q_type IS NULL OR (q_type NOT ILIKE '%true%' AND q_type NOT ILIKE '%false%'))"


def chapters(key: str) -> list[dict]:
    conn = _connect(key)
    try:
        rows = _rows(conn, f"SELECT chapter, count(*) AS n FROM public.questions WHERE {NOT_TF} "
                           "GROUP BY chapter ORDER BY chapter")
        return [{"chapter": r["chapter"] or "", "count": int(r["n"])} for r in rows]
    finally:
        conn.close()


def questions(key: str, chapter: str = "", search: str = "", limit: int = 50, offset: int = 0) -> dict:
    limit = max(1, min(200, int(limit)))
    offset = max(0, int(offset))
    where, params = [NOT_TF], {}
    if chapter:
        where.append("lower(chapter) = lower(:chapter)")
        params["chapter"] = chapter
    if search:
        where.append("question ILIKE :search")
        params["search"] = f"%{search}%"
    w = " AND ".join(where)
    conn = _connect(key)
    try:
        total = int(conn.run(f"SELECT count(*) FROM public.questions WHERE {w}", **params)[0][0])
        rows = _rows(conn, f"SELECT * FROM public.questions WHERE {w} ORDER BY chapter, id "
                           f"LIMIT {limit} OFFSET {offset}", **params)
    finally:
        conn.close()
    src = BY_KEY[key]
    return {"total": total, "questions": [to_question(r, src) for r in rows]}


# ------------------------------------------------------------------ paper wizard
def keys_for(subject: str, klass: str) -> list[str]:
    """Wizard subject + class -> database keys. Botany / Zoology live in the Biology databases."""
    s = (subject or "").lower()
    stem = "math" if "math" in s else "phy" if "phys" in s else "chem" if "chem" in s else "bio" if s[:3] in ("bio", "bot", "zoo") else ""
    if not stem:
        return []
    classes = ["11", "12"] if klass not in ("11", "12") else [klass]
    return [f"{stem}_{c}" for c in classes if f"{stem}_{c}" in BY_KEY]


def wizard_chapters(subject: str, klass: str) -> list[dict]:
    out = []
    for key in keys_for(subject, klass):
        for c in chapters(key):
            out.append({**c, "db": key, "klass": BY_KEY[key]["klass"]})
    return out


def wizard_topics(picks: list[dict]) -> list[dict]:
    """picks: [{db, chapter}] -> [{db, chapter, topic, count}]"""
    by_db: dict[str, list[str]] = {}
    for p in picks:
        by_db.setdefault(p["db"], []).append(p["chapter"].lower())
    out = []
    for key, chs in by_db.items():
        conn = _connect(key)
        try:
            rows = _rows(conn, f"SELECT chapter, topic, count(*) AS n FROM public.questions WHERE {NOT_TF} "
                               "AND lower(chapter) = ANY(CAST(:chs AS text[])) GROUP BY chapter, topic ORDER BY chapter, topic",
                         chs=chs)
        finally:
            conn.close()
        out += [{"db": key, "chapter": r["chapter"] or "", "topic": r["topic"] or "", "count": int(r["n"])} for r in rows]
    return out


def _fetch(key: str, chapter: str, topics: list[str], limit: int, random_order: bool, search: str = "") -> list[dict]:
    where, params = [NOT_TF, "lower(chapter) = lower(:chapter)"], {"chapter": chapter}
    if topics:
        where.append("topic = ANY(CAST(:topics AS text[]))")
        params["topics"] = topics
    if search:
        where.append("question ILIKE :search")
        params["search"] = f"%{search}%"
    order = "random()" if random_order else "id"
    conn = _connect(key)
    try:
        rows = _rows(conn, f"SELECT * FROM public.questions WHERE {' AND '.join(where)} ORDER BY {order} LIMIT {int(limit)}", **params)
    finally:
        conn.close()
    return [to_question(r, BY_KEY[key]) for r in rows]


def wizard_browse(picks: list[dict], topics: list[str], search: str = "", per_chapter: int = 150) -> list[dict]:
    """Manual mode: questions of the chosen chapters (and concepts), for hand-picking."""
    out = []
    for p in picks:
        out += _fetch(p["db"], p["chapter"], topics, per_chapter, False, search)
    return out


def bank_load(key: str, chapter: str, mode: str = "all", value: str = "", limit: int = 50, offset: int = 0) -> dict:
    """Test editor, bank questions of one chapter.
    mode: all | topic (value = topic) | type (value = mcq/ar/match/diag/stmt/numerical)
          | difficulty (value = easy/medium/hard) | random (limit = how many)."""
    limit = max(1, min(200, int(limit)))
    offset = max(0, int(offset))
    if key not in BY_KEY:
        raise KeyError(key)
    if mode == "random":
        qs = _fetch(key, chapter, [], limit, True)
        return {"total": len(qs), "questions": qs}
    if mode == "topic":
        qs = _fetch(key, chapter, [value] if value else [], 1000, False)
    else:
        qs = _fetch(key, chapter, [], 1000, False)
        if mode == "type" and value:
            qs = [q for q in qs if q["category"] == value]
        elif mode == "difficulty" and value:
            qs = [q for q in qs if (q["difficulty"] or "medium") == value]
    return {"total": len(qs), "questions": qs[offset: offset + limit]}


def wizard_autofetch(quotas: list[dict], topics: list[str], types: dict, difficulty: dict) -> dict:
    """Auto mode. quotas: [{db, chapter, count}]; types: {category: weight}; difficulty: {easy: %, medium: %, hard: %}.
    Draws random candidates per chapter, then picks to follow the type and difficulty split as closely
    as the bank allows; the rest of a chapter's quota is filled with any remaining questions."""
    import random
    type_w = {k: float(v) for k, v in (types or {}).items() if float(v or 0) > 0}
    diff_w = {k: float(v) for k, v in (difficulty or {}).items() if float(v or 0) > 0}
    picked, short = [], []
    for qu in quotas:
        n = int(qu.get("count") or 0)
        if n <= 0:
            continue
        cand = _fetch(qu["db"], qu["chapter"], topics, max(40, n * 8), True)
        if type_w:
            cand = [q for q in cand if q["category"] in type_w] or cand
        tq = _split(n, type_w) if type_w else {}
        dq = _split(n, diff_w) if diff_w else {}
        chosen, tc, dc = [], {}, {}
        for strict in (True, False):
            for q in cand:
                if len(chosen) >= n or q in chosen:
                    continue
                t, d = q["category"], q["difficulty"] or "medium"
                if strict and ((tq and tc.get(t, 0) >= tq.get(t, 0)) or (dq and d in dq and dc.get(d, 0) >= dq[d])):
                    continue
                chosen.append(q)
                tc[t] = tc.get(t, 0) + 1
                dc[d] = dc.get(d, 0) + 1
        random.shuffle(chosen)
        picked += chosen
        if len(chosen) < n:
            short.append({"chapter": qu["chapter"], "wanted": n, "got": len(chosen)})
    return {"questions": picked, "short": short}


def _split(n: int, weights: dict) -> dict:
    """n into whole numbers in proportion to weights (largest remainder)."""
    tot = sum(weights.values()) or 1
    raw = {k: n * w / tot for k, w in weights.items()}
    out = {k: int(v) for k, v in raw.items()}
    for k in sorted(raw, key=lambda k: raw[k] - out[k], reverse=True)[: n - sum(out.values())]:
        out[k] += 1
    return out


# ------------------------------------------------------------------ row -> question
MARKERS = re.compile(r"\[(?:QPV|QBP)_[A-Za-z0-9_]+:[^\]]*\]|\[(?:QPV_|QBP_)?DIFFICULTY:\s*[^\]]+\]", re.I)
LEAD_NUM = re.compile(r"^\s*(?:Q\.?\s*)?\d{1,3}\s*[.)]\s+(?=\S)")   # "9. A series LCR..." -> "A series LCR..."
DIFF_TAG = re.compile(r"\s*\((?:easy|medium|hard)\)\s*$", re.I)


def _clean(s) -> str:
    s = MARKERS.sub("", str(s or ""))
    return DIFF_TAG.sub("", s).strip()


def _options(r: dict) -> list[str]:
    for keys in (("opt_a", "opt_b", "opt_c", "opt_d"), ("option_a", "option_b", "option_c", "option_d")):
        vals = [r.get(k) for k in keys]
        if any(vals):
            return [_clean(v) for v in vals if v not in (None, "")]
    for k in ("options", "options_json"):
        v = r.get(k)
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except ValueError:
                v = None
        if isinstance(v, list) and v:
            return [_clean(x.get("text") if isinstance(x, dict) else x) for x in v]
    return []


def _answer_indices(raw, n: int) -> list[int]:
    """'A' / 'b' / '2' / '(3)' / 'A,C' / 'Option 2' -> [0-based indices]."""
    out = []
    for tok in re.findall(r"[A-Da-d]|[1-4]", re.sub(r"(?i)option", "", str(raw or ""))):
        i = "abcd".index(tok.lower()) if tok.isalpha() else int(tok) - 1
        if 0 <= i < n and i not in out:
            out.append(i)
    return sorted(out)


def _fig(url) -> list[dict]:
    url = str(url or "").strip()
    return [{"src": url, "width": 70, "labels": []}] if url.startswith(("http://", "https://", "data:")) else []


# diagrams written inside the text: {{IMG::url}}, [DIAGRAM: url], ![alt](url), <img src="url">
IMG_TOKEN = re.compile(r"\{\{IMG::\s*([^}\s]+)\s*\}\}|\[DIAGRAM:\s*(https?://[^\]\s]+)\s*\]|!\[[^\]]*\]\((https?://[^)\s]+)\)"
                       r"|<img[^>]*?src=[\"']([^\"']+)[\"'][^>]*>", re.I)


def _split_imgs(text: str, width: int = 70) -> tuple[str, list[dict]]:
    figs = []

    def take(m):
        url = next(g for g in m.groups() if g)
        if url.startswith(("http://", "https://", "data:")):
            figs.append({"src": url, "width": width, "labels": []})
        return " "
    clean = IMG_TOKEN.sub(take, text or "")
    return re.sub(r"[ \t]{2,}", " ", clean).strip(), figs


DIFF_RE = re.compile(r"\[(?:QBP_|QPV_)?DIFFICULTY:\s*(easy|medium|hard)\s*\]|\((easy|medium|hard)\)\s*$", re.I)
QBP_TYPE = re.compile(r"\[QBP_TYPE:(statement_based|match|true_false)\]", re.I)


def _difficulty(r: dict) -> str:
    for k in ("difficulty", "level"):
        v = str(r.get(k) or "").strip().lower()
        if v[:3] in ("eas", "med", "har"):
            return {"eas": "easy", "med": "medium", "har": "hard"}[v[:3]]
    for k in ("solution_text", "question"):
        m = DIFF_RE.search(str(r.get(k) or ""))
        if m:
            return (m.group(1) or m.group(2)).lower()
    return ""


def _category(r: dict, numerical: bool) -> str:
    """mcq | ar | match | diag | stmt | numerical (same rules as the existing generator)."""
    t = (r.get("q_type") or "").lower()
    txt = str(r.get("question") or "")
    marker = QBP_TYPE.search(str(r.get("solution_text") or ""))
    marker = marker.group(1).lower() if marker else ""
    if numerical:
        return "numerical"
    if "assert" in t or r.get("assertion") or re.search(r"Assertion\s*(?:\(A\))?\s*[:\-]", txt, re.I):
        return "ar"
    if "match" in t or marker == "match" or r.get("column_a") or re.search(r"Column\s*(?:I|1|A)\b|Match the following", txt, re.I):
        return "match"
    if "statement" in t or marker == "statement_based" or re.search(r"Statement\s*(?:I|1)\b", txt, re.I):
        return "stmt"
    if str(r.get("image_url") or "").strip() or "diagram" in t or IMG_TOKEN.search(txt):
        return "diag"
    if any(IMG_TOKEN.search(str(r.get(k) or "")) for k in ("opt_a", "opt_b", "opt_c", "opt_d", "option_a", "option_b", "option_c", "option_d")):
        return "diag"
    return "mcq"


def to_question(r: dict, src: dict) -> dict:
    opts = _options(r)
    qtype = (r.get("q_type") or "").lower()
    numerical = "numer" in qtype or "integer" in qtype or not opts
    text, text_figs = _split_imgs(LEAD_NUM.sub("", _clean(r.get("question")), count=1))
    sol, sol_figs = _split_imgs(_clean(r.get("solution_text")))
    options = []
    for t in ([] if numerical else opts[:4]):
        ot, ofigs = _split_imgs(t, width=90)
        options.append({"text": ot, "images": ofigs})
    return {
        "category": _category(r, numerical),
        "difficulty": _difficulty(r),
        "klass": src["klass"],
        "id": f"db_{src['key']}_{r.get('id')}",
        "source": {"db": src["key"], "id": str(r.get("id"))},
        "subject": r.get("subject") or src["subject"],
        "chapter": r.get("chapter") or "",
        "topic": r.get("topic") or "",
        "type": "NUMERICAL" if numerical else "MCQ",
        "text": text,
        "images": _fig(r.get("image_url")) + [f for f in text_figs if f["src"] != str(r.get("image_url") or "").strip()],
        "options": options,
        "answer": [] if numerical else _answer_indices(r.get("correct_option") or r.get("answer"), len(options)),
        "numAnswer": str(r.get("num_answer") or r.get("correct_option") or "") if numerical else "",
        "solution": sol,
        "solutionImages": _fig(r.get("solution_image_url")) + sol_figs,
        "lockOptions": False,
        "createdAt": 0,
    }
