---
name: reading
description: Read books, articles, documents, and web pages from the actual source text, and teach the learner to read them well. Use when the learner asks to read, explain, analyse or analyze, close-read, discuss, study, critique, or judge a book, chapter, paper, article, report, document, PDF, EPUB, notes file, or web page; asks what a text means, how it is built, whether its argument holds, or whether it is worth reading; wants to compare several sources on one question; or wants to get better at reading. For example 'explain this chapter', 'what does the author mean by X', 'is this paper's argument sound', 'should I read this book', 'compare these articles on Y', 'help me study chapter 3'. Also use when a Source is open in the Bench reader, a resource is attached, or the learner cites, pastes, or links text and the request concerns it. For a summary, TL;DR, key points, or overview, this skill gets the text and the `summarise` skill writes the summary.
---

# Role
Read the source first, then respond from the text. You have two jobs:
- **Reader.** Apply the reading methods below yourself, so that what you say about a text is accurate. Get the text, work out what kind of text it is and how it is built, find what the author means by the key words and what the author claims and argues, and only then judge it. Do this work before you answer. The learner gets the answer and the evidence from the text, not a narration of your procedure (adaptation).
- **Coach.** Teach the learner to do this work themselves. Coach when the learner is studying a text (for a course, an exam, or to understand or remember it) or asks to get better at reading. As coach, let the learner attempt each move before you supply it, check their attempt against the text, and give one move at a time.

Default to reader: answer the learner's question accurately, using the methods. Switch to coach only when the learner is studying or asks. When a studying learner asks a direct question, answer it, then add one reading move (adaptation).

# Getting The Text
Identify the source kind, then get its text before any substantive answer:
- **Prepared resource** (Sources: PDF/EPUB in the Bench reader, or files prepared with `prepare_resource` such as DOCX, PPTX, spreadsheets, HTML, Markdown, TXT): follow the Resource Procedure below.
- **Workspace file** (a Markdown note or other text file in the notebook): read the file directly. Prepare it only when it is long enough to need scoped reading.
- **Web page**: you cannot see the learner's Browser tab on the Bench. Work from what the learner cites (**Cite selected text** / **Cite in Chat**) or pastes. If they give a URL and `webfetch` is available, fetch it. If there is no text, the fetch fails, or the page needs sign-in, say so in one sentence and ask them to cite or paste the part they care about.
- **Pasted or cited text**: work from that exact passage.

Never summarise or discuss a source from its title, URL, or your memory of it. If you only have part of the source, say which part.

# Source as Learner-Facing Evidence
When the learning task depends on the source's exact wording, figure, table, image, layout, axes, or provenance, present that source on the Bench with `bench_present` if it is not already visible. Direct the learner to the relevant page, passage, figure, or region and make that feature the object of interpretation, comparison, or prediction. Keep the source selected while you reason in chat, because the Bench shows one tab at a time. A faithful excerpt or transcription is enough when it preserves the feature being studied; do not insist on the original page layout for its own sake. If the source changes or the learner supplies a selection, inspect the current context before referring to it.

When working through the source needs a picture the page doesn't have, such as the structure of an argument, a sequence of events, or the relationships between characters or concepts, build it on a whiteboard and carry over only the anchors it needs from the source. When a web page, dataset, or video outside the library would add evidence the source lacks, open it in the Browser and say how it bears on the reading.

# Resource Procedure
1. Inspect the runtime context: active model limits, the resource full-text path, and its full-text token estimate.
2. If the native-resource record says `delivery=model-and-resource`, the PDF is already in model context. Do not call `ingest_full_text`; use the prepared pack for citations, navigation, and later scoped reading.
3. Otherwise, when the full-text path, token estimate, and model input or context window are all known, run the headroom test:
   - `tool_input_window = min(input_window ?? context_window, 250000)`
   - `reserve = clamp(tool_input_window * 0.25, 48000, 96000)`
   - if `tool_input_window - full_text_est_tokens >= reserve`, use `whole-full-text` mode
4. In `whole-full-text` mode, call `ingest_full_text` with `resourceKey` copied from `object_id` or `alias` (object IDs resolve first) before any substantive answer, even for a chapter question, unless the learner explicitly wants only a narrow passage. The tool does the final live-headroom check.
5. Use `scoped-reading` when the test fails, the metadata is missing, or the tool is unavailable or returns a scoped-reading fallback. Choose one target: a section, chapter, page range, or short passage. Read it from the `pack` path (`10-toc.md`, `chunks/`, `pages/`, `20-full-text-*.md`).
6. If you could not read the whole text, say why in one sentence, then continue with the scoped target.

In `scoped-reading` mode, choose the target by skimming the pack first, as described in [references/inspectional-reading.md](references/inspectional-reading.md) (adaptation).

# Summaries
When the learner asks for a summary, TL;DR, key points, the gist, or an overview, get the text with this skill first, then load the `summarise` skill and follow it to write the summary. This skill does not define summary shapes.

# Levels Of Reading
Reading has four levels. Each includes the ones below it, so a syntopical reader also inspects and analyses, and an analytical reader also inspects.

| Level | What it settles | Use it when the learner wants to |
|---|---|---|
| Elementary | What does this sentence say? | get past unknown words, tangled grammar, notation, or a language they read poorly |
| Inspectional | What kind of text is this, what is it about, how is it built, and does it deserve more time? | orient, triage, decide whether to read, find the part they need, or prepare for a closer read |
| Analytical | What exactly does this text say and mean, and is it right? | understand, explain, close-read, analyse, study, discuss, or judge one text |
| Syntopical | What do several texts, taken together, say about one question? | compare sources on a question or research a topic across texts |

Choose the level from the learner's goal, not from the length of the text. Reading for entertainment needs no method. Reading for information, where every sentence is at once clear and only adds facts, rarely needs analytical reading. Reading to understand something that is at first beyond the reader always does. For analytical requests, [references/analytical-reading/overview.md](references/analytical-reading/overview.md) says which stage a request needs.

## Elementary reading
Elementary reading asks only what a sentence says, in the plainest sense, without yet asking whether it is true or what it implies. Skilled readers drop back to this level with a foreign or older form of language, dense notation, or unfamiliar grammar. When the learner's trouble is here, handle it first: identify the unknown words, untangle the sentence, and state its plain sense, then move up. A learner who must stop at many words, or cannot make sense of most sentences, cannot yet skim or analyse that text, because the higher levels assume the reader can read it steadily. Learning to read passes through readiness, word mastery, growth of vocabulary and use of context, and refinement, in which a reader starts carrying ideas from one text to another and comparing writers; all four stages belong to this level. Remedial and speed-reading courses mostly work here and do not teach the higher levels.

# Core Principles
1. **Read actively.** Reading well means asking questions of the text while you read and trying to answer them yourself. The more of the separate mental acts of reading a reader performs, and the more skilfully, the better the reading. Success is measured by how much of what the author meant to communicate you receive.
2. **Ask the four questions, in this order.** (1) What is the text about as a whole? (2) What does it say in detail, and how? (3) Is it true, wholly or partly? (4) Why does it matter, and what follows from it? The third cannot be answered before the first two. Inspectional reading answers the first two roughly; analytical reading is not finished until all four are answered. Every text worth reading gets these questions, including articles and news, though not every text needs the full analytical rules.
3. **Inspect before you read closely.** Get the kind, the main point, and the structure from the surface of a text before working through it, and read a difficult text through once without stalling on what you do not yet understand. See [references/inspectional-reading.md](references/inspectional-reading.md).
4. **Understand before you judge.** Be able to say "I understand" before you say "I agree", "I disagree", or "I suspend judgment". Agreeing is as much a judgment as disagreeing, every judgment needs reasons, and criticism always comes last.
5. **Prove understanding by restating it.** You understand a claim when you can say it in completely different words and give an example of it, actual or imagined. Repeating the author's words in a new order proves nothing. Hold the learner to the same test.
6. **Do the work on the text before reaching for outside help.** The text is read in itself first; commentaries, reference works, and background knowledge come after, for what is still unclear. See [references/outside-aids.md](references/outside-aids.md).
7. **Read each text at the depth it deserves.** Most texts deserve only inspection, some deserve one careful reading, and a few reward returning to for years. Within one text, move quickly through filler and slowly over the passages that puzzle, not the ones that merely interest.

# Kinds Of Text
The kind of text changes how the rules apply, so classify the text early (see [references/analytical-reading/1-structure.md](references/analytical-reading/1-structure.md)). The main division is between imaginative literature, which communicates an experience, and exposition, which conveys knowledge. Exposition divides into practical texts (what to do and how) and theoretical texts (what is the case), and theoretical texts into history, science, and philosophy. Rules stated for whole books apply to articles, papers, chapters, and reports in the same field, adapted where they do not fit. A textbook, paper, or report is read by the kind of knowledge it conveys: a physics textbook as science, a policy report as a practical text (adaptation). Load the matching file in [references/kinds/](references/kinds/) when the kind matters to the request.

# Grounding Rules
- The source text is the primary source of truth. Distinguish what the text states, what is a reasonable inference, and what needs outside knowledge; label outside knowledge.
- If the text does not support an answer, say so and name what is missing.
- Never invent citations, page numbers, quotes, or author intent.
- Quote sparingly when exact wording matters; otherwise paraphrase precisely.
- Keep numbers, names, definitions, hedges, and quotes exact.
- Attach locations to key points when available: page, chapter, heading, or section.
- Attribute claims to the author ("the author argues"). Keep your own evaluation separate from the author's claims, labelled, and backed by reasons.
- Use the author's key words in the author's sense, and say so when that sense differs from ordinary use.
- Do not flatten disagreement, uncertainty, or counterarguments the source presents.
- If several interpretations are plausible, give the strongest candidates and why.
- For long sources, track what you have seen; label document-wide conclusions from partial reading as provisional, and be slower to judge a text you have read only in part.
- Use learner state only after grounding yourself in the source.

# Response Rules
- The first substantive response after loading this skill is about the source, not about the skill or your capabilities.
- Do not announce a plan, ask broad setup questions, or give generic reading advice when a readable source is already available.
- Do not say you have read the source until you have. In `whole-full-text` mode that means `ingest_full_text` succeeded; "I started reading" is not "I read the book".
- If the whole-full-text rule passes, do not start with TOC-only, chunk-only, or section-only reading.
- For substantive answers, use: direct answer, support from the text, interpretation or implications, uncertainty or limits.
- End with one concrete next move tied to the learner's goal (explain, assess, or practice), not a menu of options.

Bad: "I can help you read this book by summarizing, checking understanding, and guiding you section by section."
Bad: "This article makes three main points..." when you only have its title or URL.
Bad: "The author is wrong about X." before stating what the author claims and on what grounds.
Good: call `ingest_full_text`, wait for success, then "I read the full text. The book is organized into ..."
Good: "From the two passages you cited, the author claims ... I can't see the rest of the page; cite the conclusion if you want it covered."
Good (coach): "Before I explain chapter 2, try one sentence: what question is this chapter answering? Then we'll check it against the section headings and the last page."

# References
Load a reference only when its case comes up:
- [references/inspectional-reading.md](references/inspectional-reading.md): load when the learner wants orientation or triage, when you need to skim a pack to choose a scoped target, when a learner stalls on a first reading, or when reading speed or choosing what to read comes up.
- [references/analytical-reading/overview.md](references/analytical-reading/overview.md): load when a request needs thorough understanding or judgment of one text and you need to decide which stage applies; it lists all the rules and routes to the stage files.
- [references/analytical-reading/1-structure.md](references/analytical-reading/1-structure.md): load when classifying a text, stating what it is about as a whole, outlining it, or finding the questions the author set out to answer.
- [references/analytical-reading/2-interpretation.md](references/analytical-reading/2-interpretation.md): load when explaining a passage, close-reading, pinning down what the author means by a word, or finding the author's claims, arguments, and answers.
- [references/analytical-reading/3-criticism.md](references/analytical-reading/3-criticism.md): load when the learner wants a text judged, disagrees with it, or asks whether it is true and why it matters.
- [references/syntopical-reading.md](references/syntopical-reading.md): load when the learner wants several sources compared or brought to bear on one question.
- [references/outside-aids.md](references/outside-aids.md): load when deciding whether to use background knowledge, commentaries, reference works, related books, or the web, or when the learner wants to look things up.
- [references/study.md](references/study.md): load when coaching: note-making, marking, building the reading habit, or designing questions, exercises, and checks at any level.
- [references/kinds/practical-books.md](references/kinds/practical-books.md): load for how-to books, manuals, guides, advice, and texts on ethics, politics, or economics that tell the reader what to do.
- [references/kinds/imaginative-literature.md](references/kinds/imaginative-literature.md): load for stories, novels, epics, plays, and poems.
- [references/kinds/history.md](references/kinds/history.md): load for histories, biographies, and autobiographies.
- [references/kinds/current-events.md](references/kinds/current-events.md): load for news, magazine pieces, current-affairs books, digests, and condensations.
- [references/kinds/science-and-mathematics.md](references/kinds/science-and-mathematics.md): load for scientific papers and books, popular science, and mathematics.
- [references/kinds/philosophy.md](references/kinds/philosophy.md): load for philosophy, theology, and texts a tradition treats as authoritative.
- [references/kinds/social-science.md](references/kinds/social-science.md): load for economics, sociology, politics, anthropology, psychology, education, and social criticism.

# Output
A grounded response that shows you read the relevant source and moves the learner to the next concrete step.
