"""Paper Studio server: serves the web app and reads cropped questions offline.

    python -m uvicorn server.app:app --port 8010        (run from the paper-studio folder)

The database is not part of this project: the web app keeps data in the browser (IndexedDB)
through web/js/store.js, which is the one file to swap for the main app's API.
"""
from __future__ import annotations

import base64
import io
import logging
import re
import ssl
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel

from . import glm_reader, questions_db

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
WEB = Path(__file__).resolve().parent.parent / "web"
app = FastAPI(title="Paper Studio")


@app.middleware("http")
async def no_stale_files(request, call_next):
    # the browser must re-check app files, or an update leaves an old copy of a module running
    resp = await call_next(request)
    if not request.url.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


class ConvertIn(BaseModel):
    image: str          # data:image/png;base64,...
    mode: str           # question | question_options | solution


@app.on_event("startup")
def warm_up():
    # load the model in the background so the first crop does not wait ~40 s for it
    threading.Thread(target=lambda: _try_load(), daemon=True).start()


def _try_load():
    try:
        glm_reader.reader()
    except RuntimeError as e:
        logging.warning("%s", e)


@app.get("/api/ocr/status")
def ocr_status():
    return glm_reader.status()


@app.post("/api/convert")
def convert(body: ConvertIn):
    if body.mode not in ("question", "question_options", "solution"):
        raise HTTPException(400, "mode must be question, question_options or solution")
    m = re.match(r"^data:image/(png|jpeg|webp);base64,(.+)$", body.image or "", re.S)
    if not m:
        raise HTTPException(400, "Send the crop as a PNG/JPEG data URL.")
    try:
        img = Image.open(io.BytesIO(base64.b64decode(m.group(2))))
    except Exception:
        raise HTTPException(400, "The image could not be opened.")
    try:
        return glm_reader.convert(img, body.mode)
    except RuntimeError as e:
        raise HTTPException(503, str(e))


def _db_call(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except KeyError:
        raise HTTPException(404, "Unknown database.")
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except ssl.SSLError as e:
        raise HTTPException(502, f"Secure connection failed ({e.reason}). Set DB_SSL_CA in .env to Supabase's CA certificate.")
    except Exception as e:
        logging.exception("database error")
        raise HTTPException(502, f"Database error: {e}")


@app.get("/api/db/sources")
def db_sources():
    return questions_db.sources()


@app.get("/api/db/{key}/chapters")
def db_chapters(key: str):
    return _db_call(questions_db.chapters, key)


@app.get("/api/db/{key}/questions")
def db_questions(key: str, chapter: str = "", search: str = "", limit: int = 50, offset: int = 0):
    return _db_call(questions_db.questions, key, chapter, search, limit, offset)


class Picks(BaseModel):
    picks: list[dict] = []          # [{db, chapter}] or, for autofetch, [{db, chapter, count}]
    topics: list[str] = []
    search: str = ""
    types: dict = {}
    difficulty: dict = {}


@app.get("/api/wizard/chapters")
def wizard_chapters(subject: str, klass: str = "Both"):
    return _db_call(questions_db.wizard_chapters, subject, klass)


@app.post("/api/wizard/topics")
def wizard_topics(body: Picks):
    return _db_call(questions_db.wizard_topics, body.picks)


@app.post("/api/wizard/browse")
def wizard_browse(body: Picks):
    return _db_call(questions_db.wizard_browse, body.picks, body.topics, body.search)


@app.post("/api/wizard/autofetch")
def wizard_autofetch(body: Picks):
    return _db_call(questions_db.wizard_autofetch, body.picks, body.topics, body.types, body.difficulty)


@app.get("/")
def index():
    return FileResponse(WEB / "index.html")


app.mount("/", StaticFiles(directory=WEB), name="web")
