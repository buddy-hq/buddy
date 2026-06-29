# Skill Library Candidates (Teaching/Learning Focus)

This is the initial shortlist of skills to import into Buddy **after verification pass**.

## Selection criteria

- Directly improves teaching, learning, assessment, or study workflows
- Reusable for multiple subjects (not too domain-locked)
- Practical for Buddy's local-first single-user setup

## Candidate list

| Candidate | Source agent | Why it's useful for Buddy | Verification focus |
| --- | --- | --- | --- |
| `memento-flashcards` | Hermes | Native spaced repetition, free-text grading, quiz flows, and deck import/export align tightly with Buddy learning loops. | Check data format, review scheduling logic, and answer-grading safety/tone. |
| `concept-diagrams` | Hermes | Educational diagram generation for science/math/process teaching with consistent visual language. | Validate output quality, readability, and classroom-safe defaults. |
| `excalidraw` | Hermes | Fast hand-drawn concept maps/flows that fit explanation and step-by-step tutoring. | Verify JSON generation reliability and export/open workflow. |
| `ocr-and-documents` | Hermes/OpenClaw | Converts PDFs/scans into usable text for reading companion, summarization, and question generation. | Verify extraction accuracy, OCR fallback behavior, and file-size limits. |
| `nano-pdf` | Hermes/OpenClaw | Natural-language PDF edits for learning materials and handout fixes. | Verify edit precision, page targeting consistency, and model dependency handling. |
| `powerpoint` | Hermes | Create/read/edit `.pptx` lessons and speaker notes for teaching sessions. | Verify dependency footprint and slide QA workflow quality. |
| `pptx-author` | Hermes (optional-skills) | Headless deck authoring with stronger structure for instructional decks. | Compare overlap with `powerpoint`; decide merge vs separate import. |
| `notion` | Hermes/OpenClaw | Structured notes, databases, and learning trackers for curriculum progress. | Validate auth flow, safe write actions, and schema templates for education use. |
| `google-workspace` | Hermes | Gmail/Docs/Sheets/Calendar automation for study planning and assignment workflows. | Verify OAuth setup complexity and strict confirmation gates for mutating actions. |
| `siyuan` | Hermes (optional-skills) | Local knowledge-base CRUD/search for personal study systems. | Validate API stability and offline/local-first compatibility. |
| `qmd` | Hermes (optional-skills) | Hybrid local retrieval across notes/transcripts/docs; strong for "what did I learn before?" flows. | Verify indexing latency, model downloads, and retrieval quality on real learner data. |
| `duckduckgo-search` | Hermes (optional-skills) | No-key web research fallback for finding supplemental explanations/resources. | Verify source quality controls and citation discipline. |
| `searxng-search` | Hermes (optional-skills) | Meta-search fallback to diversify source retrieval for research tasks. | Verify instance reliability and safety filtering behavior. |
| `openai-docs` | Codex sample skills | Reliable doc-grounded lookup pattern for technical learning topics. | Verify whether this pattern should be generalized beyond OpenAI docs. |
| `skill-creator` | Codex/Gemini/OpenClaw | Useful meta-skill to speed authoring of new Buddy teaching skills. | Verify alignment with Buddy pedagogy skill contract before importing templates/scripts. |

## Quick caveman flow + files (per candidate)

### `memento-flashcards`
- **Flow:** User gives fact -> skill makes Q/A card -> saves card -> later shows due cards -> user answers -> skill grades -> next review date updates.
- **Files:** `SKILL.md`, `scripts/memento_cards.py`, `scripts/youtube_quiz.py`.

### `concept-diagrams`
- **Flow:** User asks concept visual -> skill picks diagram pattern -> fills SVG in template -> outputs standalone HTML diagram.
- **Files:** `SKILL.md`, `templates/template.html`, `references/*.md`, `examples/*.md`.

### `excalidraw`
- **Flow:** User asks map/flow -> skill writes Excalidraw JSON -> saves `.excalidraw` -> optional upload for share link.
- **Files:** `SKILL.md`, `scripts/upload.py`, `references/colors.md`, `references/dark-mode.md`, `references/examples.md`.

### `ocr-and-documents`
- **Flow:** URL PDF? try web extract first -> if local/failed, run pymupdf or marker OCR -> return clean text/markdown for teaching tasks.
- **Files:** `SKILL.md`, `DESCRIPTION.md`, `scripts/extract_pymupdf.py`, `scripts/extract_marker.py`.

### `nano-pdf`
- **Flow:** User says "change PDF text" -> run NL edit command on page -> verify result -> return edited file.
- **Files:** `SKILL.md`.

### `powerpoint`
- **Flow:** Read/edit/create deck -> use guide (`editing.md` or `pptxgenjs.md`) -> render -> QA slides -> iterate fixes.
- **Files:** `SKILL.md`, `editing.md`, `pptxgenjs.md`, `scripts/add_slide.py`, `scripts/clean.py`.

### `pptx-author`
- **Flow:** Build deck from structured content (often model-backed numbers) -> generate final PPTX.
- **Files:** `SKILL.md`.

### `notion`
- **Flow:** Connect API key -> search/get/create/update pages/databases/blocks -> keep learning tracker in sync.
- **Files:** `SKILL.md`, `references/block-types.md`.

### `google-workspace`
- **Flow:** OAuth setup once -> use wrapper CLI -> read/send Gmail, manage Calendar, read/write Docs/Sheets/Drive.
- **Files:** `SKILL.md`, `scripts/setup.py`, `scripts/google_api.py`, `scripts/gws_bridge.py`, `references/gmail-search-syntax.md`.

### `siyuan`
- **Flow:** Connect to SiYuan API -> search notes -> read/update/create blocks/docs -> maintain personal knowledge base.
- **Files:** `SKILL.md`.

### `qmd`
- **Flow:** Add doc collections -> build local index/embeddings -> hybrid search/rerank query -> pull best matching notes/transcripts.
- **Files:** `SKILL.md`.

### `duckduckgo-search`
- **Flow:** Run DDG query -> collect results/snippets -> feed into explanation/research answer.
- **Files:** `SKILL.md`, `scripts/duckduckgo.sh`.

### `searxng-search`
- **Flow:** Query SearXNG meta-search -> aggregate multi-engine results -> use for broader research coverage.
- **Files:** `SKILL.md`, `scripts/searxng.sh`.

### `openai-docs`
- **Flow:** User asks API/model question -> skill fetches official docs/model refs -> returns cited answer.
- **Files:** `SKILL.md`, `scripts/resolve-latest-model-info.js`, `references/latest-model.md`, `references/prompting-guide.md`, `references/upgrade-guide.md`, `agents/openai.yaml`.

### `skill-creator`
- **Flow:** User wants new skill -> run init scaffolder -> fill SKILL + refs/scripts -> run validator -> package metadata.
- **Files:** `SKILL.md`, `scripts/init_skill.py`, `scripts/quick_validate.py`, `scripts/generate_openai_yaml.py`, `references/openai_yaml.md`, `agents/openai.yaml`.

## BTS engineering flow + damage surface

### `memento-flashcards`
- **BTS flow:** prompt -> `memento_cards.py`/`youtube_quiz.py` -> read/write `cards.json` local store.
- **Can touch:** local flashcard DB.
- **Damage potential:** **Low-Med** (data corruption/loss if bad writes, mostly local scope).

### `concept-diagrams`
- **BTS flow:** prompt -> build SVG/HTML -> write output file.
- **Can touch:** output HTML/SVG files only.
- **Damage potential:** **Low** (content quality risk, not system-control risk).

### `excalidraw`
- **BTS flow:** prompt -> generate `.excalidraw` JSON -> optional upload script.
- **Can touch:** local diagram files; optional remote upload endpoint.
- **Damage potential:** **Low-Med** (minor network exfil risk if upload used).

### `ocr-and-documents`
- **BTS flow:** prompt -> choose extractor -> run `extract_pymupdf.py` or `extract_marker.py` -> emit extracted text/files.
- **Can touch:** local docs + extracted outputs; possible model downloads for OCR stack.
- **Damage potential:** **Med** (large file/model operations, potential sensitive-doc extraction).

### `nano-pdf`
- **BTS flow:** prompt -> `nano-pdf edit` on target page -> rewrite PDF.
- **Can touch:** target PDF content.
- **Damage potential:** **Med** (easy destructive edits to original documents if no backup policy).

### `powerpoint`
- **BTS flow:** prompt -> script-driven PPTX edits/build -> unpack/repack slides -> optional conversion tools for QA.
- **Can touch:** PPTX files and derived images/PDFs.
- **Damage potential:** **Med** (file mutation + content integrity drift risk).

### `pptx-author`
- **BTS flow:** prompt -> structured deck synthesis -> write PPTX.
- **Can touch:** generated deck artifacts.
- **Damage potential:** **Low-Med** (mostly output artifact risk).

### `notion`
- **BTS flow:** prompt -> Notion API calls (search/read/write DB/pages/blocks) via key auth.
- **Can touch:** remote Notion workspace data.
- **Damage potential:** **High** (remote data create/update/delete scope).

### `google-workspace`
- **BTS flow:** OAuth setup -> wrapper CLI -> Gmail/Calendar/Drive/Docs/Sheets operations.
- **Can touch:** email send/reply, calendar events, cloud docs/files.
- **Damage potential:** **Very High** (broad account-level external side effects).

### `siyuan`
- **BTS flow:** prompt -> SiYuan API read/write blocks/docs.
- **Can touch:** local/self-hosted note base.
- **Damage potential:** **Med** (knowledge-base mutation at scale).

### `qmd`
- **BTS flow:** add collections -> index/embed local corpus -> query/rerank retrieval.
- **Can touch:** local index DB + read access to indexed folders.
- **Damage potential:** **Med** (wide local read surface; low direct destructive writes).

### `duckduckgo-search`
- **BTS flow:** prompt -> shell script query -> fetch search results.
- **Can touch:** external web only, no core data writes.
- **Damage potential:** **Low-Med** (source quality/toxicity risk, low system write risk).

### `searxng-search`
- **BTS flow:** prompt -> script query -> multi-engine aggregated results.
- **Can touch:** network to SearXNG/public instances.
- **Damage potential:** **Low-Med** (same as above + instance trust variability).

### `openai-docs`
- **BTS flow:** prompt -> resolve docs/model refs -> fetch official docs -> return citations.
- **Can touch:** outbound web/docs APIs; mostly read-only.
- **Damage potential:** **Low** (minimal write surface).

### `skill-creator`
- **BTS flow:** prompt -> scaffold files (`init`) -> generate agent yaml -> validate/package.
- **Can touch:** many local files/dirs under skill roots.
- **Damage potential:** **Med-High** (can mass-create/overwrite skill content; indirect runtime behavior risk).

## Proposed import order

1. **Learning core:** `memento-flashcards`, `ocr-and-documents`, `concept-diagrams`
2. **Teaching artifacts:** `powerpoint`, `excalidraw`, `nano-pdf`
3. **Knowledge workflows:** `qmd`, `notion`, `google-workspace`, `siyuan`
4. **Research helpers:** `duckduckgo-search`, `searxng-search`, `openai-docs`
5. **Meta authoring:** `skill-creator` (only after Buddy-specific adaptation)

## Source references used

- `/Users/prashantbhudwal/code/agentic/.agents/skills/*/SKILL.md`
- `/Users/prashantbhudwal/code/agentic/skills_vault/hermes-agent_skills.md`
- `/Users/prashantbhudwal/code/agentic/skills_vault/openclaw_skills.md`
- `/Users/prashantbhudwal/code/agentic/skills_vault/codex_skills.md`
- `/Users/prashantbhudwal/code/agentic/comprehensive_skills_vault.md`
