"""Offline reader for cropped exam questions, using GLM-OCR (zai-org/GLM-OCR, 0.9B, MIT).

Same method as the team's OCR repository (examocr/ocr/glmocr.py): the crop is scaled so
letters are ~16 px tall (never enlarged), blank margins are trimmed, a white border is added,
and the model reads it with greedy decoding. A reading that starts looping is cut.

Unlike the OCR repository, the LaTeX is KEPT ($\\frac{a L}{2 g}$) so the editor can render
it with KaTeX, the way the reference video shows it.

No API key and no internet after the one-time model download (~2.6 GB, ~4 GB RAM).
"""
from __future__ import annotations

import logging
import os
import re
import threading

import numpy as np
from PIL import Image

log = logging.getLogger(__name__)
MODEL = os.environ.get("GLM_OCR_MODEL", "zai-org/GLM-OCR")
LETTER_PX = 16.0
MAX_PIXELS = 1_400_000


# ----------------------------------------------------------------- image preparation
def _gray(rgb: np.ndarray) -> np.ndarray:
    return (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]).astype(np.uint8)


def _ink(rgb: np.ndarray) -> np.ndarray:
    g = _gray(rgb)
    thr = min(180, int(g.mean()) - 30) if g.size else 128
    return g < max(60, thr)


def _char_height(ink: np.ndarray) -> float:
    """Median height of the ink runs in each column: a cheap letter-height estimate."""
    heights = []
    for x in range(0, ink.shape[1], max(1, ink.shape[1] // 120)):
        col = ink[:, x]
        if not col.any():
            continue
        d = np.diff(np.concatenate([[0], col.view(np.int8), [0]]))
        starts, ends = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
        heights += [e - s for s, e in zip(starts, ends) if 3 <= e - s < 0.5 * ink.shape[0]]
    return float(np.median(heights)) * 1.6 if heights else 0.0   # stroke runs < letter height


def prepare(img: Image.Image) -> Image.Image:
    rgb = np.asarray(img.convert("RGB"))
    ink = _ink(rgb)
    if ink.any():                                    # trim blank margins
        rows, cols = np.flatnonzero(ink.any(1)), np.flatnonzero(ink.any(0))
        rgb = rgb[max(0, rows[0] - 2):rows[-1] + 3, max(0, cols[0] - 2):cols[-1] + 3]
        ink = _ink(rgb)
    ch = _char_height(ink)
    h, w = rgb.shape[:2]
    s = min(1.0, LETTER_PX / ch) if ch > 0 else 1.0
    s = min(s, (MAX_PIXELS / max(1, h * w)) ** 0.5)
    out = Image.fromarray(rgb)
    if s < 0.98:
        out = out.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    w, h = out.size
    py, px = max(12, (56 - h + 1) // 2), max(12, (56 - w + 1) // 2)
    canvas = Image.new("RGB", (w + 2 * px, h + 2 * py), "white")
    canvas.paste(out, (px, py))
    return canvas


def _repeat_tail(ids: list[int], min_repeats: int = 4, min_span: int = 48, max_period: int = 24) -> int:
    n = len(ids)
    for p in range(1, max_period + 1):
        r = 1
        while n >= (r + 1) * p and ids[n - (r + 1) * p:n - r * p] == ids[n - p:]:
            r += 1
        if r >= min_repeats and r * p >= min_span:
            return (r - 1) * p
    return 0


# ----------------------------------------------------------------- the model
class GlmReader:
    def __init__(self):
        import torch
        import transformers
        from transformers import AutoModelForImageTextToText, AutoProcessor, StoppingCriteria

        transformers.logging.set_verbosity_error()
        try:
            import psutil
            torch.set_num_threads(psutil.cpu_count(logical=False) or 4)
        except Exception:
            pass
        self.torch = torch
        log.info("loading %s (first start downloads ~2.6 GB)", MODEL)
        self.proc = AutoProcessor.from_pretrained(MODEL)
        self.model = AutoModelForImageTextToText.from_pretrained(
            MODEL, dtype=torch.float32, attn_implementation="sdpa").eval()
        self.lock = threading.Lock()

        class StopLoop(StoppingCriteria):
            def __init__(self, start):
                self.start, self.looped = start, False

            def __call__(self, input_ids, scores, **kw):
                ids = input_ids[0, self.start:].tolist()
                if len(ids) >= 48 and len(ids) % 8 == 0 and _repeat_tail(ids):
                    self.looped = True
                    return torch.ones(input_ids.shape[0], dtype=torch.bool)
                return torch.zeros(input_ids.shape[0], dtype=torch.bool)
        self.StopLoop = StopLoop

    def read(self, img: Image.Image) -> str:
        """Image -> the model's Markdown with LaTeX formulas."""
        torch = self.torch
        im = prepare(img)
        msgs = [{"role": "user", "content": [{"type": "image", "image": im},
                                             {"type": "text", "text": "Text Recognition:"}]}]
        inputs = self.proc.apply_chat_template(msgs, tokenize=True, add_generation_prompt=True,
                                               return_dict=True, return_tensors="pt")
        inputs.pop("token_type_ids", None)
        start = inputs["input_ids"].shape[1]
        lines = max(1.0, im.height / (2.0 * LETTER_PX))
        per_line = max(24.0, im.width / LETTER_PX)
        max_new = int(min(2048, max(64, 1.5 * lines * per_line)))
        stop = self.StopLoop(start)
        with torch.inference_mode(), self.lock:
            out = self.model.generate(**inputs, max_new_tokens=max_new, do_sample=False,
                                      stopping_criteria=[stop])
        ids = out[0, start:].tolist()
        if stop.looped:
            ids = ids[:len(ids) - _repeat_tail(ids)]
        return self.proc.decode(ids, skip_special_tokens=True).strip()


_reader: GlmReader | None = None
_reader_error: str | None = None
_reader_lock = threading.Lock()


def reader() -> GlmReader:
    global _reader, _reader_error
    with _reader_lock:
        if _reader is None and _reader_error is None:
            try:
                _reader = GlmReader()
            except ImportError:
                _reader_error = ("The OCR model is not installed. Run setup step 2 in README.md "
                                 "(torch + transformers), then restart the server.")
            except Exception as e:  # download failed, out of memory, ...
                log.exception("model load failed")
                _reader_error = f"The OCR model could not be loaded: {e}"
        if _reader is None:
            raise RuntimeError(_reader_error)
        return _reader


def status() -> dict:
    return {"loaded": _reader is not None, "error": _reader_error}


# ----------------------------------------------------------------- text clean-up
def to_editor_latex(md: str) -> str:
    """Model Markdown -> editor text: $...$ inline maths, $$...$$ display maths, plain lines."""
    s = md.replace("\r\n", "\n")
    s = re.sub(r"\\\((.+?)\\\)", lambda m: f"${m.group(1).strip()}$", s, flags=re.S)
    s = re.sub(r"\\\[(.+?)\\\]", lambda m: f"$${m.group(1).strip()}$$", s, flags=re.S)
    s = re.sub(r"<sup>(.*?)</sup>", r"$^{\1}$", s, flags=re.I | re.S)
    s = re.sub(r"<sub>(.*?)</sub>", r"$_{\1}$", s, flags=re.I | re.S)
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    lines = []
    for ln in s.split("\n"):
        ln = re.sub(r"^\s{0,3}#{1,6}\s+", "", ln)          # headings
        ln = re.sub(r"(\*\*|__)(.+?)\1", r"\2", ln)         # bold
        lines.append(ln.rstrip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


# "11. A U-tube", "Q.11 A U-tube", "11) ..." and the bare "11 A U-tube" the reader writes
QNUM = re.compile(r"^\s*(?:Q\.?\s*)?\d{1,3}(?:\s*[.)]\s+|\s+(?=[A-Z(]))")
OPT = re.compile(r"(?:(?<=\s)|^)(?:\(\s*([a-dA-D1-4])\s*\)|([a-dA-D1-4])\s*[.)])\s+")


def split_options(text: str) -> tuple[str, list[str]]:
    """Find four option markers in order: (a)..(d), (A)..(D), (1)..(4), a)..d), 1. .. 4."""
    marks = [(m.start(), m.end(), (m.group(1) or m.group(2)).lower()) for m in OPT.finditer(text)]
    for seq in ("abcd", "1234"):
        # the LAST a-b-c-d run in order (a question stem can contain "(a)" itself)
        chosen = None
        for i, (s, e, lab) in enumerate(marks):
            if lab != seq[0]:
                continue
            run, k = [marks[i]], 1
            for m in marks[i + 1:]:
                if k < 4 and m[2] == seq[k]:
                    run.append(m)
                    k += 1
            if k == 4:
                chosen = run
        if chosen:
            stem = text[:chosen[0][0]].strip()
            opts = []
            for j, (s, e, _) in enumerate(chosen):
                end = chosen[j + 1][0] if j + 1 < 4 else len(text)
                opts.append(text[e:end].strip())
            return stem, opts
    return text.strip(), []


def convert(img: Image.Image, mode: str) -> dict:
    text = to_editor_latex(reader().read(img))
    text = QNUM.sub("", text, count=1)
    if mode == "solution":
        return {"question": "", "options": [], "solution": text, "raw": text}
    if mode == "question_options":
        stem, opts = split_options(text)
        return {"question": stem, "options": opts, "solution": "", "raw": text}
    return {"question": text, "options": [], "solution": "", "raw": text}
