# Practice & Exercises — Intent

Sub-intent of [curriculum system](./curriculum.intent.md). Practice is where most learning actually happens — not during explanation, but during effortful work.

---

## What CWSEI says about practice

From the Course Transformation Guide:

> "Those cognitive processes that are explicitly and strenuously practiced are those that are learned. The learning of complex expertise is quite analogous to muscle development."

Practice must be **deliberate** (Ericsson's framework):

- **Challenging but doable** — demands full concentration. Easy repetitive tasks produce little learning.
- **Targets specific expert-thinking components** — not just routine procedures.
- **Includes feedback and reflection** — achievement compared against a standard.
- **Adjusted to current mastery level** — too easy = no growth, too hard = frustration.

### The 10 components of expert thinking (what practice should target)

From the CWSEI homework guide (Wieman), practice should exercise:

| #   | Component                                   | Typical homework?             |
| --- | ------------------------------------------- | ----------------------------- |
| a   | Identify which concepts are relevant        | ❌ (chapter tells you)        |
| b   | Separate surface from structural features   | ❌ (problems are clean)       |
| c   | Identify what info is needed vs. irrelevant | ❌ (all given, nothing extra) |
| d   | Look up / estimate / deduce unstated info   | ❌ (all given)                |
| e   | Make appropriate simplifying assumptions    | ❌ (stated for you)           |
| f   | Break down a complex problem into pieces    | ⚠️ (done but hidden)          |
| g   | Plan a solution                             | ⚠️ (done but hidden)          |
| h   | Use and switch between representations      | ❌ (one representation)       |
| i   | Carry out routine procedures                | ✅ (primary focus)            |
| j   | Evaluate whether results make sense         | ❌ (just a number)            |

> "Typical back-of-chapter problems result in the student primarily practicing (i) — carrying out routine procedures. That's 1 out of 10 components."

**Buddy's practice must target all 10.** This is the single biggest differentiator from "do this exercise."

---

## Types of practice (from CWSEI sources)

### Pre-work / pre-reading

- Front-load definitions and vocabulary so teaching time can be higher-level
- Short, focused, guided by explicit prompts ("look at figure 3 and explain…")
- Quiz for accountability (even low-stakes, ~2–5% weight drives 85% completion)
- **Don't** assign long unfocused reading — unrealistic for first exposure

### Problem sets / homework

- Where most learning hours happen
- Must be challenging enough to require intense thought
- Must exercise expert-thinking components beyond routine procedures
- Make solutions require showing reasoning (not just a number/answer)
- Must pass the "why should anyone care about the answer?" test

### In-class activities (→ interactive sessions in Buddy)

- Think/pair/share (5–15 min): pose question → individual think → discuss → share
- Worksheets (15–50 min): structured questions, challenging but doable in groups
- Case studies (15–50 min): real-world context, require decisions and justifications
- **Must** target specific learning goals
- **Must** produce a product (decision + justification, prediction, ranking, judgment)
- **Don't** run activities not clearly targeting specific goals
- **Don't** make them too easy — "challenging but doable" is the target

### Worked examples

- Reduce cognitive load during initial learning
- Show organizational structure, focus attention on key elements
- Fade support as proficiency grows (scaffolding → independence)

---

## How practice connects to goals

Every practice task should:

1. Map to a specific learning goal
2. Target one or more expert-thinking components (a–j)
3. Be calibrated to the learner's current mastery level
4. Require showing reasoning, not just producing an answer
5. Generate feedback that the learner must act on

---

## Adapting for Buddy's context

| CWSEI concept        | Buddy equivalent                                                               |
| -------------------- | ------------------------------------------------------------------------------ |
| Pre-reading quiz     | Pre-session prompt: "before we start, skim this doc section and tell me…"      |
| Homework problem set | Exercises in the code-teacher workspace: multi-step, requiring expert thinking |
| In-class activity    | Interactive problem-solving in chat: think → attempt → discuss → refine        |
| Worked example       | Buddy walks through a solution, showing reasoning and decision points          |
| Case study           | "Here's a real codebase. Find the bug / optimize this / add this feature."     |

### Key adaptation: make the learner _do_ the expert thinking

Don't give them all the info. Don't tell them which concept to apply. Don't state the assumptions. Make them:

- Identify what's relevant
- Look up what they need
- Plan before coding
- Check their own work
- Explain their reasoning

---

## Open questions

1. **How does the practice agent generate exercises?** From the goals + Bloom's level + expert-thinking components → exercise spec?
2. **What's the exercise format?** Free-form coding challenge? Structured multi-part? MCQ for concept checks?
3. **How does difficulty scale?** Start with scaffolded (worked example + guided steps) → independent (open-ended problem)?
4. **Where do exercises live?** In the curriculum file? Separate exercise bank? Generated on-the-fly?
5. **How does practice connect to the code-teacher?** Same workspace? Separate mode?
