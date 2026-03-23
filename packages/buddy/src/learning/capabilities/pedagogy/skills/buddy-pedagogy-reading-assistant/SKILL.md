---
name: buddy-pedagogy-reading-assistant
description: Use this skill when the user asks for help with reading a book, article, paper or any other long form resource from he workspace resoruces. It will provide you the right workflow and knowledge to guide the reader through the reading session like when and how to read the whole book, when to read only chunks and how to guide the reader through the reading session.

personas:
  - buddy
  - code-buddy
  - math-buddy
---

# Role
Run the reading workflow over the attached resource. Read first, then respond from the text.

# Use When
- the learner wants help reading an attached book, textbook, chapter, paper, or long passage
- the session already has a readable resource and the goal is to work from that source instead of giving generic reading advice

# Default Procedure
1. Inspect the runtime context before giving user-facing guidance:
   - active model limits
   - resource full-text path
   - resource full-text token estimate
2. Decide between `whole-full-text` and `scoped-reading`.
3. If a resource exposes both a full-text path and a full-text token estimate, and the active model exposes an input window or context window, run the headroom test first.
4. If `(input_window ?? context_window) - full_text_est_tokens >= 100000`, enter `whole-full-text` mode.
5. In `whole-full-text` mode, read the entire full-text file before giving any substantive user-facing guidance.
   - if `pedagogy_resource_ingest_full_text` is available, call it
   - pass the resource alias or ID
   - let the tool do the live context-budget check before ingestion
   - do this even if the learner asked about a chapter, unless they explicitly want a narrow passage-only reading
   - if the tool succeeds, the full text is now in context and you can respond from it
   - if the tool is unavailable or errors because the context is too full, state that briefly and fall back to `scoped-reading`
6. If the headroom test fails, or the metadata needed for it is unavailable, fall back to `scoped-reading`.
7. In `scoped-reading`, choose one narrow target:
   - one section
   - one chapter
   - one page range
   - one short passage
8. After reading, respond with content grounded in the source:
   - what this text is doing
   - the main structure, major claims, or major themes
   - the next concrete reading move
9. After the learner responds, continue with exactly one next move:
   - explain
   - assess
   - practice

# Gotchas
- Do not explain the skill, summarize your capabilities, or say what you can do unless the user explicitly asks about the skill itself.
- Do not announce a reading plan before checking whether the whole full text should be read first.
- Do not say you have read the resource unless you have actually used the tool and completed the required reading pass.
- In `whole-full-text` mode, when the ingestion tool is available, the required reading pass means the full-text ingestion tool completed successfully.
- If the whole-full-text rule passes, do not start with TOC-only, chunk-only, or section-only reading.
- If a readable resource is already attached, do not start by asking broad setup questions that delay reading.
- Do not give generic reading advice when you can read the actual source.

# Tool Hints
- When the whole-full-text rule passes and `pedagogy_resource_ingest_full_text` is available, call it before doing anything else substantive.
- The ingestion tool already checks live session headroom against the active model limits and throws if the remaining budget is not large enough.
- If the whole-full-text rule does not pass, use the processed TOC, chunks, or pages structure to stay scoped.
- Use learner state only after you have grounded yourself in the source text.
- If the learner shares the text directly, work from that actual passage instead of generic reading advice.
- For a lightweight refresher on study strategy for nonfiction, see [references/NONFICTION.md](references/NONFICTION.md).

# Response Rules
- The first substantive response after loading this skill must be about the resource, not about the skill.
- In `whole-full-text` mode, when the ingestion tool is available, do not produce a substantive reading response until `pedagogy_resource_ingest_full_text` succeeds.
- If the ingestion tool succeeds, say that briefly and then move directly into a grounded summary of the book's structure, themes, or argument.
- If you could not read the whole full text, say exactly why in one sentence and then continue with the scoped target you chose.
- After reading, prefer grounded statements about the text over process narration.
- When proposing the next step, give one concrete next move, not a menu of equal options.

# Bad And Good
Bad:
- "I can help you read this book by summarizing, checking understanding, and guiding you section by section."
- "This book seems to have three major parts..." when you have not finished the required reading pass.

Good:
- When the ingestion tool is available, call `pedagogy_resource_ingest_full_text`, wait for it to succeed, then respond with a grounded account of the book.
- "I read the full text. The book is organized into ..."

# Validation Loop
Before responding, check:
1. Did I inspect the runtime context for the full-text headroom rule?
2. If the whole-full-text rule passed and the ingestion tool was available, did `pedagogy_resource_ingest_full_text` succeed before responding?
3. If the whole-full-text rule did not pass, did I read the scoped target I chose?
4. Did I either read the required text or explicitly state why I could not?
5. Is my first real response about the resource rather than about the skill?

# Avoid
- Do not skip the full-text headroom check when the runtime context gives you enough data to make it.
- Do not default to chunk-by-chunk reading when the whole full-text file easily fits with at least 100000 tokens of spare room.
- Do not respond with a capability overview when you should already be reading or reporting on the text.
- Do not summarize a whole book before reading it.
- Do not confuse "I started reading" with "I read the book".

# Output
A grounded reading response that proves you have read the relevant source material and moves the learner to the next concrete step.
