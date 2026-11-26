# Paper Studio

Crop questions from scanned papers into editable text (offline, no API key), build a question
paper, and print 8 shuffled sets (A-H) with matching answer keys and solutions.

The database is **not** included: data is kept in the browser (IndexedDB) through
`web/js/store.js`. To connect the main app, replace the functions in that one file.

## Setup (Windows)

```powershell
cd paper-studio
py -3.11 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

Step 2, the offline OCR model (only needed for the crop ✎ button; everything else works without it):

```powershell
.venv\Scripts\pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\pip install "transformers>=5.2" "jinja2>=3.1.6"
```

The model itself (GLM-OCR, ~2.6 GB) downloads on the first start of the server. After that, no internet.
It needs ~4 GB of free RAM. On a laptop CPU a crop takes about 30-90 seconds.

Run:

```powershell
.venv\Scripts\python -m uvicorn server.app:app --port 8010
```

Open http://localhost:8010

## College question databases

**Questions → Database** reads questions from the 8 Supabase databases (Maths, Physics, Chemistry,
Biology for Class 11 and 12; table `public.questions`). The links go in `paper-studio/.env`
(`SUPABASE_1_DB_URL` … `SUPABASE_8_DB_URL`); that file is in `.gitignore` and must never be committed.
The app only reads: every connection is set read-only.

Pick a subject, a chapter, tick questions (from any subjects), then *Create paper from selected* or
*Add selected to bank*. Questions are copied into the paper, so editing them for a paper does not
change the database.

The connection is encrypted and the database's certificate is checked. Supabase signs its
certificates with its own authority, so add it once:

1. Supabase dashboard → any of the projects → Project Settings → Database → SSL Configuration → **Download certificate**.
2. Save it as `paper-studio/certs/supabase-ca.crt`.
3. Add to `.env`: `DB_SSL_CA=certs/supabase-ca.crt`, then restart the server.

(`DB_SSL_VERIFY=off` in `.env` skips the check, as the existing main app does. Encrypted, but the
server's identity is not verified. Use it only if you accept that.)

## What it does

| Page | |
| --- | --- |
| **Tests → New Test** | Test type, Offline (OMR/paper) / Online / Both, name, short name, description, time & marks pattern (old NEET/JEE, NEET 2021/2024/2025, JEE Main 2020-2025, KCET, KVPY SA/SX, Custom with duration, +marks and negative marking), total questions, start/close time, classes, subjects (Botany & Zoology optional), staff. *Create Test Template* opens the test editor. |
| **Tests → Unpublished / Published** | Tests grouped by day, filter All · P · C · M · Bio; each shows time, mode, questions, duration, marks, classes. |
| **Test editor** | *Bank Questions*: subject → chapter (Class 11 / 12) → filter (topic, question type, difficulty, random N, all) → Load; **Add** turns into an `n/N` counter + Remove; the ↻ badge lists earlier tests that used the question. *Institution Questions*: from the question bank, published or unpublished tests, or copy all questions of a test. *Review*: Update (question number, section, track), Edit, Remove, a ✎ on the question, each option and the solution (type, choose an image, or crop & convert); **Publish Test** appears when the count equals Total Questions and builds sets A-H. *Settings*: the same form with Update and Delete. |
| **Questions → Syllabus / Table** | Chapters and topics of the college databases with question counts; a table builder that copies the table into a question as LaTeX. |
| **Add Question** | Question, Options 1-4, Answer(s), Solution. Each field has *Choose file* and ✎. ✎ opens the crop window (layout of the reference video): crop on the page, *Convert*, check the text on the left and the rendered maths on the right, then *Question*, *Question & Options*, *Solution* or *… Image*. |
| **Question Bank** | All questions; filter, edit, delete, import/export JSON, make a paper from the ticked ones. |
| **Papers → paper** | Sets A-H, three views: *Question paper*, *Answers & solutions*, *Key sheet (all sets)*. |

In a paper:

- **Edit anything**: ✎ on a question (hover) opens its text, options, answer, solution and
  diagrams. Edits go to the question, so all 8 sets update.
- **Answer keys are editable** in the key sheet: click a cell, type the option number (or `1,3`),
  press Enter. The change is mapped back to the question, so every other set's key and the
  solutions change with it.
- **Reshuffle…**: pick a set, then *Q1 ⇄ Swap with Q50* or *Q1 → Move to Q50* (several rows at
  once). Also *Shuffle this set randomly* and *Regenerate sets B-H*.
- **Diagram labels**: *Edit labels* on any diagram. Add a label over the printed one (the white
  box hides the old text) and type the new value: `7 cm`, `$60^\circ$`, `$\theta$`. Drag to move.
  The width slider sets how big the diagram prints.
- **Key sheet**: every set's key on one landscape A4 page in the spreadsheet layout
  (Q. NO / KEY rows, 15 per row by default), scaled to fit. *Key sheet Excel* downloads the same
  layout as `.xlsx`.
- **Bulk print**: tick the sets, type the copies (e.g. 10) → one print job in the order
  10 × A, 10 × B, 10 × C, 10 × D. Choose *Save as PDF* in the print window for a PDF.
  *Two-sided printing* adds a blank page after a copy with an odd page count so each copy starts
  on a new sheet. Optionally the key sheet is added at the end.

## How the sets are shuffled

- Set A is the base paper (the order you built).
- Sets B-H shuffle questions **within each subject** and shuffle the 4 options of each MCQ.
- Options stay in place when they refer to each other ("All of the above", "Both (1) and (2)",
  "None of these") or when *Keep option order in all sets* is ticked on the question.
- Each set is tried 30 times and the one that differs most from the sets before it is kept
  (fewest questions at the same number, fewest identical answers at the same number).
- The shuffle is seeded and saved, so reopening or reprinting a paper gives the same sets.
- Solutions are stored once per question; a question that is Q1 in Set A and Q19 in Set D shows
  its solution and its Set D answer under Q19 in Set D.

## Files

```
server/app.py          FastAPI: serves web/, POST /api/convert, GET /api/ocr/status
server/glm_reader.py   offline GLM-OCR reader (method of the team OCR repo; keeps LaTeX), option splitter
web/index.html         the app (no build step)
web/js/store.js        DATA LAYER: swap for the main app's API. Schema documented at the top.
web/js/question-form.js  question form (video layout)
web/js/crop-modal.js   crop window
web/js/diagram.js      diagram label editor
web/js/shuffle.js      sets A-H, key mapping, swap/move
web/js/paper.js        A4 layout and page cutting (header, 2 columns, footer)
web/js/keysheet.js     all-sets key page + .xlsx export
web/js/app.js          pages, reshuffle window, bulk print
web/css/paper.css      printed paper styles
```

Libraries load from cdnjs: KaTeX 0.16.9, Cropper.js 1.6.2, pdf.js 3.11.174, ExcelJS 4.4.0.
