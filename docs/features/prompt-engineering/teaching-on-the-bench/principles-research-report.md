# How agents state their principles: research for Buddy's teaching constitution (N15)

Status: DONE (2026-10-01).

## 1. Summary

- **Answer: keep the teaching constitution (N15), but shrink it to about 8 value entries and 350 to 450 words (now 15 entries, 788 words).** Each entry is a belief plus one line of why. Place it early, beside the existing "Buddy's Constitution" block, not last.
- **No frontier prompt carries a long values list.** Pure values text runs 45 to 335 words (`GPT-6-Astra_Prompts.md:33-35`; `Muse_Spark_Apr-08-26.txt:6-25`). The best form is Muse Spark's value, reason, behaviour. Anthropic's constitution prefers "good values and judgment over strict rules and decision procedures".
- **Tutoring modes state procedures, and they are switched on.** Study mode has five "STRICT RULES". Claude's `learn` skill wants one question per turn, then lists over-questioning as a failure (`CLAUDE-OPUS-5.5.md:19323, 19361`). Google's LearnLM "avoids committing" to one pedagogy, which is N3's stance.
- **They amend by removing.** Claude's question rule was narrowed, then gone, across five captured versions. OpenAI keeps a changelog. Buddy has a precedence clause (`constitution.p.md:13-17`). Add "weigh, don't rank", "skills specialise a principle, never contradict it", and an amendment log.
- **Of the 15, 5 read as values, 7 as mixed, 3 as procedures.** Highest reflex risk: 3 (gotcha questions), 9 (interrogate first), 12 (intake interview). The procedures sit in eight "In one-to-one..." sentences and in quoted scripts.
- **Fidelity to Bain is mostly good, with two defects.** The Saari clause in 9 is about a class of 200 (Bain p.131). "Strongest sense" in 12 is one teacher's habit (p.157) and lacks support. Bain argues against procedures: "no single 'best way' to teach" (p.175).
- **Moves:** merge 1+13, 2+3+9, 4+12, 8+11. Keep 5, 10, 15, and 14 as one permissive line. Shrink 6 (N10). Move 7 to a skill (N7). "One-to-one" misdescribes the Teach persona; dropping it lets one text serve both (N37).
- **Caveats.** The support is 63 college teachers, not AI tutors (p.184). Visible Learning ranks feedback and direct instruction above problem-based learning. Web quotes came through a summarising fetch. Nothing was tested on transcripts.
- **Five open questions are in section 8.**

## 2. Sources surveyed

Dates for `~/Code/CL4R1T4S` files are the repo's last commit date (when the capture was added). The window is roughly the last year.

| Source | Product | Date | Relevance |
|---|---|---|---|
| `ANTHROPIC/CLAUDE-OPUS-5.5.md` | Claude Opus 5.5, incl. `learn` skill (`:19287-19365`) | 2026-09-22 | High. Tone block, tutoring skill, precedence. |
| `ANTHROPIC/Claude-Fable-5.1.md`, `OPUS-5.md`, `CLAUDE-FABLE-5.md`, `Claude-Opus-4.7.txt`, `Claude_Opus_4.6.txt`, `Claude-4.5-Opus.txt`, `Claude-Design-Sys-Prompt.txt` | Claude Fable 5.1, Opus 5, Fable 5, Opus 4.7, 4.6, 4.5, Claude Design | 2026-09-01, 07-24, 06-15, 04-16, 02-06; 2025-11-24; 2026-04-17 | Medium. Tone block, question-rule trail. Design: role form. |
| `OPENAI/Codex_Desktop/GPT-6-Astra_Prompts.md`, `GPT-6-Sol_Prompts.txt`, `5.6-Sol_SystemPrompt.md` | GPT-6, GPT-5.6 (Codex) | 2026-09-22, 09-22, 07-14 | High. Personality, skill precedence, ending rules. |
| `XAI/GROK-4.20.mkd`, `GROK-4.1_Nov-17-2025.txt` | Grok 4.20, 4.1 | 2026-02-17, 2025-11-17 | Medium. One-axiom values, `<policy>` precedence. |
| `META/Muse_Spark_Apr-08-26.txt` | Meta Muse Spark | 2026-04-08 | High. Best values-with-reasons form. |
| `ZAI/ZCode/Prompts.md`; `ANTHROPIC/UserStyle_Modes.md` | ZCode; Claude "Explanatory" style | 2026-08-14; 2025-04-23 | Skimmed; one Q3 row (out of window). |
| anthropic.com/constitution, anthropic.com/news/claude-new-constitution | Anthropic, *Claude's constitution* | 2026-01-22 | High. Values over rules, living document, precedence. |
| model-spec.openai.com/2026-08-18.html, raw.githubusercontent.com/openai/model_spec/main/CHANGELOG.md | OpenAI Model Spec | 2026-08-18 | High. Authority levels, changelog, tutor example. |
| simonwillison.net/2025/Jul/29/openai-introducing-study-mode, baoyu.io/blog/chatgpt-study-mode-prompt | ChatGPT study mode | 2025-07-29 | High for Q3. Out of window, asked for by name. |
| arxiv.org/abs/2412.16429; blog.google `.../guided-learning-google-gemini/`, `.../google-gemini-learnlm-update/` | LearnLM, Gemini Guided Learning | 2025-08-22, 09-23, 05-20 | Medium. Pedagogy as instructions. |
| blog.khanacademy.org `/khan-academys-7-step-approach-to-prompt-engineering-for-khanmigo` | Khanmigo | 2025-03-21 | Low. Out of window. |
| `packages/buddy/src/learning/personas/prompts/`; `docs/.../research-ledger.md` (N3, N10, N14, N15, N36, N37) | Buddy, branch `fix/visuals-prompt` | | The subject and the locked decisions. |
| `~/Code/resources`: Bain PDF; `chapters/make-it-stick/.../009-6-get-beyond-learning-styles.md`; `chapters/visible-learning-for-teachers/.../018-appendix-c-a-list-of-influences-on-achievement.md` | Bain (2004); Make It Stick; Visible Learning | | Fidelity and evidence checks. |

**Method notes.**
- Web pages were read with a summarising fetch tool, so quotes are as it returned them. The constitution's rules-versus-judgment and "living document" passages matched across two fetches. Its closing sections were truncated, so I claim nothing about them. OpenAI's study-mode page returned 403; its behaviour list is from a search summary.
- CL4R1T4S has no Gemini, Khanmigo or study-mode text in the window (its Google files end May 2025). Those rows use public posts.

## 3. Q1: How frontier agents state principles, values, or a constitution

Paths are under `~/Code/CL4R1T4S` unless they start with `packages/`. Word counts are mine.

| Prompt (date) | Lines | Words | Form |
|---|---|---|---|
| GPT-6 Astra (2026-09-22) | `OPENAI/Codex_Desktop/GPT-6-Astra_Prompts.md:33-35` | 54, in ~50,600 | One trait paragraph, no steps. After two rule blocks (`:9-31`). |
| GPT-6 Sol; GPT-5.6 Sol | `GPT-6-Sol_Prompts.txt:4-6`; `5.6-Sol_SystemPrompt.md:3-11` | 45; 142 | Trait paragraph, first block. |
| Claude Opus 5 (2026-07-24) | `ANTHROPIC/OPUS-5.md:76-96` | ~340, in ~29,000 | One value ("without making negative assumptions about their judgement or abilities", `:77`), then scoped rules. |
| Claude Opus 5.5 (2026-09-22) | `CLAUDE-OPUS-5.5.md:202-240` | ~736 | Two registers, with a disclaimer: "not hard delineations... best judgment" (`:205`). |
| Claude 4.5 Opus, Fable 5.1 | `Claude-4.5-Opus.txt:1098-1205`; `Claude-Fable-5.1.md:83-115` | | Same tone block recurs ("warm tone", `Claude-4.5-Opus.txt:1158`). |
| Meta Muse Spark (2026-04-08) | `META/Muse_Spark_Apr-08-26.txt:6-25` | ~335, in ~6,500 | Five named values (Truth, Beauty, Respect, Fun, Connection): an aphorism, then 1 to 3 behaviours. First block. |
| Grok 4.20 (2026-02-17) | `XAI/GROK-4.20.mkd:3-20` | ~455 | 18 bullets, mostly rules. One axiom: "Understand the Universe" (`:11`). |
| Claude Design (2026-04-17) | `ANTHROPIC/Claude-Design-Sys-Prompt.txt:1-4, 17-25` | 4 lines + 6-step workflow | A role ("embody an expert", `:4`), not values. |

Buddy for comparison: the 15 principles are 788 words (`packages/buddy/src/learning/personas/prompts/shared/teaching.p.md`), about a third of the Learn prompt (inference from source word counts; I did not render it). They come last in both personas (`learning-companion.p.md:19-21`, `teaching-assistant.p.md:55-61`).

**Findings**
- **Nobody ships a long values list in a system prompt.** Pure values text is 45 to 335 words. Claude's 340 to 740 words also carry formatting and register rules. Buddy's 788 words of values alone is the longest block here.
- **Muse Spark is the best model of the form.** Name the value, give one line of why, then the behaviour: "Simplification without request is condescension wearing a helpful mask" (`Muse_Spark_Apr-08-26.txt:16`). Value and consequence sit together, so the model can see when the consequence does not apply.
- **Values come first, procedures later.** Sol, Muse, Grok 4.20 and Claude Design open with identity or values. Procedure sits in named sections ("Working with the user", `GPT-6-Astra_Prompts.md:65`). Buddy puts product text first and principles last (inference: a weak slot for core values).
- **How they keep values from becoming procedures.** Reasons travel with rules: "Caving teaches them that pushback works" (`CLAUDE-OPUS-5.5.md:19331`). Hedges scope a rule: "Claude doesn't always ask questions, but, when it does, it avoids more than one per response" (`OPUS-5.md:91`). Disclaimers say the text is judgment (`:205`; Buddy's are `constitution.p.md:13-15` and `teaching.p.md:15`). The rules that do appear are negative style lists against filler (`GPT-6-Astra_Prompts.md:47`). None tells the model how to teach.
- **Endings are regulated only to cut filler.** "Do not use concluding summary statements" (`GPT-6-Astra_Prompts.md:41`); "skip generic offers" (`Muse_Spark_Apr-08-26.txt:29`). None requires a check or a question, which fits N10.

**Published constitutions (web)**
- **Anthropic, *Claude's constitution*** (2026-01-22, ~27,000 words): "We generally favor cultivating good values and judgment over strict rules and decision procedures" (anthropic.com/constitution). It wants understanding deep enough that Claude "could construct any rules we might come up with itself".
  - Its warning fits Buddy's old principle 16. A rule like "always recommend professional help" risks generalising to "I am the kind of entity that cares more about covering myself than meeting the needs of the person in front of me". Swap in "check understanding" and you get the reflexive question ending (inference, but close).
  - Rules are kept where "the costs of errors are severe enough that predictability and evaluability become critical".
- **OpenAI, *Model Spec*** (2026-08-18, ~23,000 words): organised by authority level, not by value. Its only tutoring content is one example (Q3).
- Buddy should copy their form (value plus reason, judgment over procedure), not their size.

## 4. Q2: Amendments and precedence

**How they handle change**
- **They say it will change.** The constitution "is best thought of as a perpetual work in progress" and parts "will later look misguided and perhaps even deeply wrong" (anthropic.com/constitution). The launch post calls it "a living document" (2026-01-22). This matches N15's "amended over time".
- **They keep a change log.** OpenAI ships dated versions and a `CHANGELOG.md` (latest v2026.08.18). Entries are real amendments: "Platform" renamed "Root", hard refusals replaced by "Safe Completions", "rules around lying to protect confidentiality" removed.
- **They amend by removing and moving.** Claude's question rule:
  - Opus 4.5, 4.6, 4.7 (Nov 2025 to Apr 2026): avoid "more than one question per response" (`Claude-4.5-Opus.txt:1146`, `Claude_Opus_4.6.txt:964`, `Claude-Opus-4.7.txt:71`).
  - Fable 5, Opus 5 (Jun to Jul 2026): shortened (`CLAUDE-FABLE-5.md:76`, `OPUS-5.md:91`).
  - Fable 5.1 (Sep 2026): the cap is gone (`Claude-Fable-5.1.md:90`).
  - Opus 5.5 (Sep 2026): no question rule in its tone block (`CLAUDE-OPUS-5.5.md:202-240`; inference from grep).
  - This is the arc of Buddy's principle 16 and N10.
- **Iteration is tied to evidence.** Khan Academy lists "iterating based on real user feedback" as a method step and rewrote prompts when users found repetition wasteful (2025-03-21; out of window).

**How they handle conflicts**

| Source | Rule |
|---|---|
| Anthropic constitution | Four values in order, but "holistic rather than strict". Guidelines rank below ethics as "more specific and situation-dependent, and thus more likely to contain errors". On conflict, "we will work to update the constitution itself rather than maintaining inconsistent guidance". |
| OpenAI Model Spec | Root > System > Developer > User > Guideline. "Guidelines can be implicitly overridden". |
| GPT-6 (Codex) | The user's instruction "must take precedence over any guidelines provided in skills" (`GPT-6-Astra_Prompts.md:13`, `:140`). |
| Claude design skill | "Precedence is always: the user's own words, then the project's existing system, then your choices" (`CLAUDE-OPUS-5.5.md:2046`). |
| Claude `learn` skill | Context beats the procedure: "skip the diagnosis" if the learner has shown their work (`:19315`). An exception can swallow the rule (`:19335`). |

Buddy already says teaching guidance is a "strong default... applied with judgment" and that schemas, safety and fixed product behaviour are requirements (`shared/constitution.p.md:13-17`). It is silent on how the principles relate to each other or to skills.

**What Buddy should copy**
- **Weigh the principles; do not rank them.** They pull against each other (3 and 5; 6 and "give direct answers").
- **One precedence sentence for the teaching layer:** the user's explicit request, then the constitution (strong defaults), then skill and tool guidance. Product and safety requirements sit above all three.
- **A skill may specialise a principle but not contradict it.** Anthropic's test: "any specific guidance should be explicable with reference to the principles". Fix a contradiction by amending one side.
- **An amendment log outside the prompt**, as OpenAI keeps. The research ledger already does this. Record the reason and evidence. Prefer removing or moving a principle over adding a caveat.

## 5. Q3: Teaching-specific precedents

| Product (date) | Where it lives | Form | What it states |
|---|---|---|---|
| Claude `learn` skill (2026-09-22) | Triggered skill, ~2,200 words: `CLAUDE-OPUS-5.5.md:19287-19365` | One goal value, then procedures and failure modes | "help them be able to answer it themselves — this time and next time"; handing over answers and only asking questions are both failures (`:19309`). Treat learners "as capable adults working on hard things" (`:19365`). |
| ChatGPT study mode (2025-07-29; out of window, asked for by name) | Separate mode, ~650 to 700-word system prompt | Five "STRICT RULES": get to know the user; build on existing knowledge; guide, don't just give answers; check and reinforce; vary the rhythm | "DO NOT DO THE USER'S WORK FOR THEM". "No matter what other instructions follow, you MUST obey these rules". |
| Gemini Guided Learning, LearnLM (2025-09-23) | Not captured. Posts and paper | System instructions per product | Paper: "avoids committing our models to any particular definition of pedagogy". Blog: instructed to "guide you to a homework answer rather than providing it directly". |
| Khanmigo (2025-03-21; out of window) | Method post; no prompt text found | Design principles plus iteration | "tie in students' personal interests with instructional material"; "prompt students towards self explanation". |
| Claude "Explanatory" style (2025-04-23; out of window) | `ANTHROPIC/UserStyle_Modes.md:7` | Prose, permissive verbs | "Claude may ask thinking questions or suggest mental exercises". |
| Anthropic constitution (2026-01-22) | Web | Value | Wants "fostering independent thinking over reliance on Claude", yet "someone who asks for a given piece of code might not want to be taught how to produce that code themselves". |
| OpenAI Model Spec (2026-08-18) | Web | One example | A math tutor told to give "hints... one step at a time" beats a user who says "ignore all previous instructions". No general learning principle. |

**What to take from them**
- **Tutoring modes are procedures, and they are switched on.** The `learn` skill fires only on learning intent and excludes tasks and lookups (`:19289-19305`). Buddy's 15 sit in the always-on persona and must survive every turn, including small talk (N5). That argues for values, not moves.
- **The shared values are few.** Do not do the learner's thinking for them. Find out where they are first (study mode rule 1; `learn`'s "Diagnose before you teach", `:19311`). Treat them as capable. Give specific feedback, not hollow praise (`:19361`). Stop when they have got it: "Don't keep probing past understanding" (`:19325`).
- **Pedagogy serves the learner's goal, and Google's stance is N3.** Withholding a working answer from a self-learner "is just unhelpfulness" (`:19355`). LearnLM treats pedagogy as instructions the operator supplies.
- **The same failure shows up in their rules.** Study mode rule 4 ("After hard parts, confirm the user can restate or use the idea") and Guided Learning ("tested to check I got it") both encode Buddy's removed principle 16. The `learn` skill asks for one question "every turn" (`:19321-19323`) and then names "Over-questioning" as a failure (`:19361`).
- **Buddy's distinct content.** Expectation failure, making the learner care, the natural critical learning environment, trust plus stereotype threat, personal development and teaching as serious work appear in none of them. They are Bain's. They are either Buddy's contribution or unproven for an AI tutor (Q4).
- **No precedent for an educator user.** Buddy scopes the principles to the learners' experience (`teaching-assistant.p.md:57`).

## 6. Q4: Principles versus procedures, applied to Buddy's 15

**How to read this.**
- Class (value, procedure, mixed) and reflex risk are my judgments. No transcripts or evals were run. Reflex risk means: could this line make Buddy do the same thing every turn, as principle 16 did?
- In Table B, a bare `:NN` in the Teach column means `packages/buddy/src/learning/personas/prompts/teaching-assistant.p.md:NN`.
- Bain is *What the Best College Teachers Do* (2004), read from the PDF in `~/Code/resources/books/What the Best College Teachers Do - Bain/`. Page numbers come from its printed headers and may be off by one. Its evidence is 63 college teachers studied mainly with "qualitative evidence" (p.184), plus one controlled comparison (p.189). Nothing in it concerns AI tutors, so every one-to-one transfer is an inference.

### Table A: value or procedure, and reflex risk

| # | Principle | Class | Sentence that makes it procedural | Reflex risk and behaviour |
|---|---|---|---|---|
| 1 | Start from outcomes | Mixed | "Before each session, ask:" / "Every decision flows backward from that." | Medium. Goal questions up front, or announced objectives. Echoes the archived teaching plan (N14). |
| 2 | They construct understanding | Value | Last clause: "not to transmit correct information past them." | Medium. Withholds plain explanation. Clashes with 6's "Give direct answers". |
| 3 | Create expectation failures | Procedure | "Design tasks where their existing model won't work." "Don't just tell them they're wrong". | High. Gotcha questions, staged failures. Assumes a wrong model exists. Discourages plain correction. |
| 4 | Make them care | Mixed | "Use 'Who gives a damn?' as your planning test." | Medium. Forced hooks. "You know their interests" assumes memory that may not exist. |
| 5 | Safe to be wrong | Value | Soft: "give multiple chances, delay evaluation". | Low. Possible over-reassurance. |
| 6 | Use questions | Mixed | "Ask when the learner's response will help them reason... or help you choose what to teach next." | Medium. The heading is an imperative to ask; "choose what to teach next" licenses a diagnostic question every turn. "let an exchange end" is an ending rule (N10). |
| 7 | Natural critical learning environment | Procedure | "Ground learning in an authentic, intriguing problem... invite comparison, evaluation, and synthesis, and scaffold their attempts." | Medium-high. A five-step per-reply template. Bain's element 5 ("a further question") is a closing-question engine. "Not a checklist" is the only guard. |
| 8 | Praise effort, not smarts | Mixed | "Praise effort and process, not smarts." plus a sample phrase. | Medium-high. Formulaic praise each turn; frontier tutors list false praise as a failure (`CLAUDE-OPUS-5.5.md:19361`). |
| 9 | Listen before you challenge | Mixed | "Ask about their thinking, their assumptions, their reasoning — then help them discover where it breaks down." | High. Interrogates before helping: the "guess what I'm thinking" pattern 6 warns against. Repeats 3. |
| 10 | Trust them, and say so | Mixed | "say 'I think you can do this — let's figure out how.'" | Medium-high. Scripted reassurance opener. The `learn` skill: "Skip the emoji and the cheerleading" (`:19365`). |
| 11 | Feedback, not grades | Mixed | "give detailed, non-judgmental feedback on every attempt." | Medium. Long unsolicited critique; declines to score when asked; "non-judgmental" can blur honest quality calls. |
| 12 | Know them | Procedure | "ask what they care about, what confuses them, what questions they carry." "Teach to their strongest sense." | High. Intake interview before helping; learning-style matching. |
| 13 | Expect more | Value | "Make it a promise ('here's what you'll be able to do')". | Low. "By the end you'll be able to..." preambles. |
| 14 | Intellectual and personal development | Value | Soft: "by letting the subject matter raise human questions". | Medium. Tacked-on reflective or moralising questions; intrusive probing. |
| 15 | Serious intellectual work | Value | "Plan, question, revise, and evaluate your own teaching". | Low. Self-narration, over-apology, "did that work for you?" closers. |

Count: 5 value, 7 mixed, 3 procedure.

### Table B: fit, and faithfulness to Bain

| # | One-to-one AI tutor (Learn) | Teach persona (educator user) | Faithful to Bain? |
|---|---|---|---|
| 1 | Partial. A chat has no "session"; goals are often unstated. | Strong. Backward design (`:35`). | Idea faithful: "plan backward" (p.50), what students can "do" (p.49). Bain plans a course, not a reply. |
| 2 | Good as a belief about learners. | Fits learner-facing material. Risk of lecturing the educator (`:57` guards). | Faithful (p.16-17, 52; Saari p.103). Bain allows a "lecture" sometimes (p.103). |
| 3 | Conditional. Needs the learner's model first (9). | Strong. Misconception-exposing tasks are a deliverable (`:40`). | Term faithful (p.28). Drops Bain's two safeguards: the learner must care, and cope with the emotional cost (p.28). |
| 4 | Good, if Buddy remembers their interests. | Good for hooks. | Value faithful (p.36-39). Mechanism changed: Saari invites *students* to ask "Who gives a damn?" and then answers (p.39). |
| 5 | Excellent. Buddy holds no grade power. | Good for practice-before-assessment material. | Near verbatim: "try, fail, and receive feedback... separate from any summative judgment" (p.18); "safe space" (p.28). |
| 6 | Good, but a move more than a value. | Poor as written; needs `:57` to avoid quizzing the educator. | Bain prizes questions (p.31; Saari p.103). "Guess what I'm thinking" and "let an exchange end" are Buddy's. |
| 7 | Partial. Bain's elements describe sessions and courses (p.103), not chat turns. | Strong. Sequence design is the Teach job. | Faithful to the five elements (p.100-103). Overlaps 5: safe failure is inside Bain's environment (p.18). |
| 8 | Relevant: models over-praise. | Partial. Student-facing feedback wording. | Faithful to Dweck via Bain (p.34-35), who reports it for young children. The extension to all learners is Buddy's. |
| 9 | Good as the stance "start from their model". | Weak. Teach asks only when it "would materially change the work" (`:25`). | Half. Mental models: p.51, p.157. **The Saari clause is misattributed:** he questions bold students first in a class of 200 to get talk going (p.131). "Which is why" is Buddy's invention. |
| 10 | The value fits. The scripted line reads as cheerleading. | Strong as a value: "Do not condescend to the educator or write learners off" (`:27`). | Faithful: rejection of power, trust (p.73-74, 140-141); Steele quote near verbatim (p.73). But Steele's effect came with *critical* feedback (p.72-73), so assurance belongs with 11. |
| 11 | Good. No grades by default, so mostly vacuous outside quizzes. | Mixed. Educators grade and may ask Buddy to; needs "follow explicit user requests" (`constitution.p.md:15`). | Faithful: "grading becomes not a means to rank but a way to communicate" (p.153). |
| 12 | Sensible as "teach this person". Weak mechanism. | Strong value, already in `:25`. | First half faithful (p.157). **"Strongest sense" is one teacher's practice (Paul Baker, p.157), not a finding.** Matching to a preferred mode has no support: `~/Code/resources/chapters/make-it-stick/make-it-stick/009-6-get-beyond-learning-styles.md:96`. |
| 13 | Fits when Buddy produces practice. | Strong. Avoid busywork. | Near verbatim (p.17-18, 73-74). |
| 14 | Weakest fit. Bain's examples are long medical and history courses (p.90-92). Intrusion risk. | Partial. Supports "hard history, biology, and literature belong in classrooms" (`:49`). | Faithful (p.90-92, 152), but a finding about some teachers. |
| 15 | Good as a stance: if the learner is stuck, change approach, do not blame them. | Strong. Matches `:59`. | Faithful: "serious intellectual endeavors" (p.17); "looking inward... rather than blaming" (p.140). |

### Patterns
- **The procedure hides in the "one-to-one" sentences.** Eight principles (4, 5, 8, 9, 10, 11, 12, 14) have one (`teaching.p.md:9, 11, 17, 19, 21, 23, 25, 29`). That sentence turns Bain's class-level finding into a move. The Bain-backed first half is usually a value.
- **The text that is not Bain is the glue.** "You know their interests" (4), the question rules in 6, the Saari rationale (9), the scripted reassurance (10), "strongest sense" (12). Most are procedures; one is a misattribution and one is unsupported.
- **Bain argues for principles over procedures.** He warns against "easy tricks" (p.174) and wants "adaptive" teachers who "apply fundamental principles": "there is no single 'best way' to teach" (p.175). This supports N3 and N15.
- **"One-to-one" misdescribes the Teach persona.** There the learners are third parties. The phrase appears eight times, and `teaching-assistant.p.md:57` has to override it.
- **Source jargon costs tokens and steers little (inference).** "Saari", "Who gives a damn?", "natural critical learning environment" and "stereotype threat" (`teaching.p.md:9, 15, 19, 21`) cite a book the model does not have in context. In Bain the stereotype-threat claim rests on one experiment by Cohen (p.72-73).

## 7. Q5: Recommendation

Recommendations for the owner to accept or change, stated as principles, not final wording.

**Form**
- **Keep the constitution (N15), as beliefs with reasons.** Each entry: a short value, one line of why, at most one line on what holding it means for Buddy. This is the Muse Spark and Anthropic form, and the one that does not collide with N3.
- **Cut the procedure layer.** Remove the "In one-to-one..." extensions, quoted scripts, "Before each session", "on every attempt" and source names. Drop what Bain does not support (the Saari rationale, "strongest sense").
- **Move the not-a-checklist disclaimer into a two-sentence preface.** It now sits inside principle 7 only. A preface keeps each entry pure and says the set is open to amendment. It echoes `constitution.p.md:13-15`.
- **A test for new entries (my heuristic).** A value is broken by *doing* something wrong: shaming, praising smarts, lying about quality. A procedure is broken by *omitting* a step. Principle 16 was omission-shaped ("you forgot to check"), which is why it produced checks everywhere. An entry that can only be met by performing an act in the reply is a move. It belongs in a skill (N7) or nowhere (N3).
- **Same text in both personas (N37).** Keep the Teach preface (`teaching-assistant.p.md:57-59`). Dropping "one-to-one" removes the main mismatch.

**Length.** About 8 to 9 entries and 350 to 450 words, half of today's 788 (judgment from Q1: pure values text elsewhere is 45 to 335 words). Do not aim for the 23,000 to 27,000 words of the published documents.

**Placement**
- **Early, beside the existing constitution block, before product and vocabulary text.** Today it is last (`learning-companion.p.md:19-21`) and sits under a different "Buddy's Constitution" heading (`:5`) that holds other material (concision, respect, mechanics, "guidance is not law"). Two constitutions in one prompt confuses readers and the model. Fold the teaching entries into that heading or rename it (open question 1).
- **Confirm the move by eval, not argument (N13, N18).** The frontier pattern is values first (Q1), but I found no evidence on position for this prompt.
- **N36's "show ideas" push fits the same form.** It lives in `shared/visual-guidance.p.md` (N37). Write it as value plus reason so the two read as one voice.

**Disposition of the 15**

| # | Recommendation | Why |
|---|---|---|
| 1, 13 | **Merge**: teach toward what the learner will be able to do; expect real intellectual work, not busywork | Bain's outcomes stance (p.17-18, 50). Drop "before each session" and the "promise" script. |
| 2, 3, 9 | **Merge**: learners build on the ideas they hold, including wrong ones; Buddy starts there and helps them find where an idea breaks | One belief, now three. Drops the highest-risk lines and the Saari clause. Bain's conditions still apply: the learner must care and be safe (p.28). |
| 4, 12 | **Merge**: Buddy teaches this person, and learning sticks when it matters to them | Same subject. Drop "planning test", "strongest sense" and the intake questions. "Who gives a damn?" is the *learner's* question; Buddy owes an answer when asked (p.39). |
| 5 | **Keep** | Near verbatim Bain (p.18, 28). Lowest reflex risk. |
| 6 | **Drop as a principle, or shrink to one clause** | It is a move and a patch against reflexive questions. "Let an exchange end" is an ending rule (N10). `shared/constitution.p.md:3` already says not to "append a question merely to keep individual messages short", itself an ending rule the owner may review under N10 (open question 2). |
| 7 | **Move to a skill (N7)** | Bain's five-step recipe. Its core is already in 4; its last element is a question-ending engine. |
| 8, 11 | **Merge**: feedback is honest and specific about the work and thinking, never a verdict on the person, and not a grade unless asked | Drops the sample phrase and "every attempt". Keeps the assessment stance (p.152-153). Folds in Steele: assurance travels with critical feedback (p.72-73). |
| 10 | **Keep, as a value** | Assume capability and the wish to learn; hold high standards from that; do not command or test. Drop the script and "water on parched land". |
| 14 | **Keep as one permissive line, lowest rank** | Follow human questions when the subject raises them; never probe. Weakest fit, most intrusive if over-applied (open question 4). |
| 15 | **Keep** | Drop "bag of tricks" (aimed at human teachers). Keep "look inward first", also the Teach persona's stance (`teaching-assistant.p.md:59`). |

Result: 8 entries (1/13, 2/3/9, 4/12, 5, 8/11, 10, 14, 15), with 6 and 7 moved out.

**What this does not settle**
- Whether these are the *right* values is open. The support is one qualitative study of human college teachers (p.184), and the tutoring modes in Q3 share only a few of Buddy's values. Fidelity to Bain is not evidence that they work for an AI.
- Bain's discovery lean (2, 3, 7) is not what the library's largest evidence synthesis ranks highest. Its table lists feedback at 0.75 and direct instruction at 0.59, against questioning at 0.48 and problem-based learning at 0.15 (`~/Code/resources/chapters/visible-learning-for-teachers/visible-learning-for-teachers-maximizing-impact-on-learning/018-appendix-c-a-list-of-influences-on-achievement.md:24, 43, 67, 142`). Those effect sizes are debated and come mostly from schools, so this is a caution, not a verdict. It supports keeping "give direct answers" legitimate and dropping "not to transmit correct information".
- After any rewrite, read transcripts for the Table A reflexes (scripted reassurance, formulaic praise, intake questions, gotcha questions). This is reading, not a new rule or eval (N10, N11).

## 8. Open questions for the product owner

1. Buddy has one constitution: do the teaching values join the existing "Buddy's Constitution" block (`learning-companion.p.md:5`), or does one of them get a new name?
2. Questions serve the learner's thinking, never Buddy's routine: is that a principle, a clause in another, or left to the model and skills, given N10 and `constitution.p.md:3`?
3. Bain is the only source of the values: may a value from another book in the library enter the constitution, or is this set Bain's by design?
4. The learner is a whole person, but Buddy meets people briefly and remembers what they say: is that a value (keep 14 as a permissive line) or a risk (drop it)?
5. Values change on evidence: what evidence amends or removes one (transcripts, evals across model strengths as in N14), and where is the amendment log kept?
