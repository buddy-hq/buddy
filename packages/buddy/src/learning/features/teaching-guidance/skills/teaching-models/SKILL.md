---
name: teaching-models
description: Choose a concrete teaching model when helping a learner understand or practice a concept, recover from confusion, or approach it another way. Use for sustained learning of a concept or skill at session start or when that intent appears, and whenever the learner says "I don't get it", "explain another way", "I'm stuck", "too abstract", "show me an example", "quiz me", or "walk me through it"; gives a wrong or confused answer; repeats an error; cannot start; loses interest; or dislikes the current explanation. Route how to teach, not just what answer to give. Covers direct instruction, worked examples and fading, guided practice, concept attainment, Socratic diagnosis, inquiry, advance organizers, analogy and model bridging, mastery loops, and case-based or problem-based teaching. Skip quick facts and general help. Use learning-design-frameworks for curriculum design, standards, assessment rigor, access planning, classroom climate, or technology integration.
---
# Teaching Models

This skill helps Buddy choose an instructional model for the next teaching move. Use it when the problem is not "what is the answer?" but "how should I teach this now?" It is especially important after a failed explanation. Do not repeat the same explanation with more words unless the learner only asked for more detail. Read only the reference files needed for the current teaching decision, usually one and at most two. Read more only if the first one of two strategies have failed.


## Workflow
1. the skill is triggered, you read SKILL.MD <-- [YOU are here]
2. Diagnose Internally using `First Diagnosis`
3. Use `Model Router` to pick a teaching model.
4. READ the reference (`references/*`) for that teaching model. 
  1. If details inside the reference file is not enough, gather more information by using he `Sources` at the end of the reference.
5. Teach following `Output Default` without mentioning any of this to the student.

## Core Rule

When the learner says they do not understand, dislikes the approach, or stalls after an explanation, first change the teaching model.

Do not default to:

* a longer explanation;
* a second version of the same explanation;
* asking "Does that make sense?";
* moving ahead without evidence of understanding.

Instead:

1. Name the likely teaching failure internally.
2. Select a better-fit model.
3. Run a short teaching cycle.
4. Assess understanding from the learner's response or work in that cycle. If an important uncertainty remains and resolving it would change your next teaching move, request one small diagnostic action. Do not add a separate check when the activity already provides the evidence you need.
5. If the evidence shows the approach still isn't working, switch representation or model again. An unanswered check is missing evidence, not evidence of failure.

## First Diagnosis

Before choosing a model, classify the situation internally:

* `no-start`: the learner cannot begin.
* `lost-in-details`: the learner is overwhelmed by parts and needs a map.
* `missing-concept-boundary`: the learner cannot tell what counts as the idea.
* `procedure-without-meaning`: the learner can follow steps but not explain them.
* `faulty-model`: the learner has a tempting but wrong way of thinking.
* `low-engagement`: the learner understands words but does not care or is bored.
* `needs-fluency`: the learner understands but cannot perform reliably.
* `needs-transfer`: the learner can do familiar examples but fails changed cases.
* `not-enough-evidence`: Buddy does not yet know why the learner is stuck.

Use evidence already available about the learner's understanding. If an important uncertainty affects which teaching move to choose, ask one focused diagnostic question. Do not ask for information their work already provides.

Honor the learner's request when choosing the approach. Give a direct explanation when that serves the request. Use guided discovery when working through a problem together and the learner's contribution will help them reason or help you choose what comes next. Questions should have a teaching purpose; they are not a required ending for each response.

During guided practice, introduce manageable steps and pause where learner participation is useful. During a requested explanation or walkthrough, connect the ideas needed to make it understandable. Do not require a reply between ideas merely to keep turns short.

## Model Router

### Direct Instruction

Read `references/direct-instruction.md`.

Use when:

* the learner is new to the topic;
* confusion comes from missing prerequisite explanation;
* accuracy, sequence, or safety matters;
* the learner asks for a clear walkthrough.

Teaching move: explain the idea plainly, model one example, check a micro-step, then move quickly into guided practice.

Learner sees: Your explanation and one modeled example. When the idea has structure, a picture of it: built on the whiteboard as you explain when the structure is new to them, or one inline picture when a glance is enough.

Do not use when:

* the learner already heard the explanation and still does not understand;
* the issue is motivation or relevance;
* the learner needs to discover a faulty assumption.

### Worked Example With Fading

Read `references/worked-example-fading.md`.

Use when:

* the learner cannot start;
* the task has several steps;
* cognitive load is high;
* the learner needs to see expert thinking before trying.

Teaching move: show one fully worked example with reasoning, then give a near example with one missing step, then a similar one with more responsibility shifted to the learner.

Learner sees: A worked record that unfolds step by step with the reasoning beside each step; the next example leaves a step for them to complete in the same place.

Do not use when:

* the learner is ready for independent practice;
* the task is mainly conceptual boundary-setting;
* the learner is passively copying without explaining decisions.

### Guided Practice / Gradual Release

Read `references/guided-practice-gradual-release.md`.

Use when:

* the learner partly understands but lacks confidence;
* Buddy needs to move from explanation into action;
* the learner benefits from "we do one, you do one";
* errors are small enough to correct during practice.

Teaching move: solve one small step together, ask the learner for the next step, give hints before answers, then fade support.

Learner sees: A shared working space where they take the next step and you respond to what they did.

Do not use when:

* the learner lacks the basic model needed to attempt the task;
* repeated errors show a deeper misconception;
* the learner needs a motivating problem first.

### Concept Attainment

Read `references/concept-attainment.md`.

Use when:

* the learner cannot tell what belongs in a category;
* the concept is defined by features, boundaries, or contrasts;
* examples and non-examples would clarify better than definition-first teaching;
* the learner overgeneralizes or undergeneralizes a term.

Teaching move: present a few yes/no examples, ask the learner what feature separates them, test the rule on a new example, then name or refine the concept.

Learner sees: Examples and non-examples side by side, arranged so the deciding feature can be spotted.

Do not use when:

* the concept requires a long procedure rather than category judgment;
* the learner only needs fluency practice;
* examples would confuse because prerequisites are missing.

### Socratic / Diagnostic Questioning

Read `references/socratic-diagnostic-questioning.md`.

Use when:

* Buddy needs to uncover the learner's current thinking;
* the learner's answer is wrong but the cause is unclear;
* the learner may be relying on an unstated assumption;
* the goal is reasoning, not answer delivery.

Teaching move: ask one focused question that reveals the learner's rule, assumption, prediction, or evidence. Use the response to choose the next model.

Learner sees: Mostly words; a picture only when you want them to predict, point at, or sketch something.

Do not use when:

* the learner needs direct instruction first;
* questioning becomes a guessing game;
* Buddy already knows the misconception and should repair it.

### Inquiry / Predict-Check-Explain

Read `references/inquiry-predict-check-explain.md`.

Use when:

* the learner has a faulty model that needs to fail visibly;
* a small prediction can reveal the gap;
* discovery would be more durable than telling;
* the topic supports a quick contrast, simulation, example, or thought experiment.

Teaching move: ask for a prediction, ask why, show the result or counterexample, help the learner explain the mismatch, then build a better model.

Learner sees: A committed prediction first, then the result: a real observation, a counterexample, or something they run themselves.

Do not use when:

* the learner is too lost to make a meaningful prediction;
* the activity would become a puzzle without clear teaching purpose;
* direct explanation would be faster and sufficient.

### Advance Organizer

Read `references/advance-organizer.md`.

Use when:

* the learner feels overwhelmed;
* many details are coming before the structure is clear;
* the learner needs a mental map before explanation;
* Buddy is about to teach a dense topic.

Teaching move: give a simple map of the big idea, key parts, and relationships before going into details. Keep it short enough to hold in working memory.

Learner sees: A compact overview of the whole on the Bench, usually a whiteboard frame, kept within reach as the details arrive so each new piece can be placed on it.

Do not use when:

* the learner needs practice, not more overview;
* the map becomes a mini-lecture;
* the learner already has the structure and needs application.

### Analogy / Model Bridging

Read `references/analogy-model-bridging.md`.

Use when:

* the idea is abstract or invisible;
* the learner needs a familiar bridge;
* a representation can make the relationship concrete;
* Buddy can state the analogy's limits clearly.

Teaching move: map the familiar source to the target idea, say exactly what carries over, say what does not, then test the target idea without leaning on the analogy.

Learner sees: The familiar case and the target side by side, with what corresponds made visible and where the analogy breaks marked.

Do not use when:

* the analogy would introduce a worse misconception;
* the learner is already overextending an analogy;
* precision matters more than intuition at this moment.

### Mastery Learning Loop

Read `references/mastery-learning-loop.md`.

Use when:

* the learner needs reliable competence, not exposure;
* errors persist after teaching;
* the skill has clear success criteria;
* practice can be repeated with feedback and variation.

Teaching move: define a small target, teach or model, check performance, give corrective feedback, retry with a nearby task, and only advance after evidence.

Learner sees: Practice items with feedback, varied around the same target.

Do not use when:

* the target is too broad to assess quickly;
* the learner needs motivation or conceptual orientation first;
* repetition becomes mechanical without feedback.

### Case-Based / Problem-Based Teaching

Read `references/case-based-problem-based-teaching.md`.

Use when:

* the learner is bored by abstract explanation;
* relevance is unclear;
* the concept makes more sense inside a real scenario;
* the learner needs to reason from context before naming the principle.

Teaching move: start with a compact case or problem, ask what decision or explanation is needed, teach the concept as the tool for resolving it, then return to the case.

Learner sees: The case itself, such as a real source, dataset, scenario, or artifact, before the concept that resolves it.

Do not use when:

* the learner needs a quick procedural fix;
* the scenario adds unnecessary complexity;
* the learner lacks enough background to engage with the case.

## Recovery Patterns

### Learner says: "I do not understand"

Do this:

1. Ask one diagnostic question if the failure mode is unclear.
2. If they cannot start, use Worked Example With Fading.
3. If they are overwhelmed, use Advance Organizer.
4. If they have a wrong model, use Inquiry / Predict-Check-Explain or `resolve-confusions`.
5. If they understand parts but cannot perform, use Guided Practice.

Avoid saying the same thing again with more detail unless the learner specifically asks for elaboration.

### Learner says: "I do not like how you are teaching"

Do this:

1. Acknowledge briefly without defensiveness.
2. Ask what is not working only if needed: too abstract, too fast, too many questions, too much lecture, not enough examples, not relevant.
3. Change the teaching approach to address that problem. Explain the change only if it helps the learner follow.
4. Give the revised explanation or activity enough space to work. Use evidence from the learner's response or work; request a separate check only when an important uncertainty remains and resolving it would change your next teaching move.

Example:

```text
Fair. I was explaining too abstractly. Let me switch: we will start from a concrete case, then pull out the idea.
```

### Learner keeps getting answers wrong

Do this:

1. Check whether it is a slip, missing prerequisite, faulty model, or weak fluency.
2. Use `resolve-confusions` for stable faulty models.
3. Use Direct Instruction for missing prerequisite knowledge.
4. Use Mastery Learning Loop for fluency after the model is sound.

### Learner seems bored

Do this:

1. Stop adding explanation.
2. Use Case-Based / Problem-Based Teaching to create a reason to care.
3. Ask the learner to make a decision, prediction, diagnosis, or judgment.
4. Teach the concept as the tool for that task.

## Relationship To Other Skills

Use `learning-design-frameworks` for broad planning, alignment, rigor, access, assessment, SEL, or technology decisions.

Use `resolve-confusions` when there is evidence of a stable faulty learner model.

## Output Default

Deliver the teaching move that addresses the learner's need, with the representation your plan chose for it. Acknowledge their difficulty or explain a change of approach when that helps them follow.

Finish an explanation or example before checking it. Use evidence already available from their response or work. Include a separate check only when it will resolve an important uncertainty about what to teach next. Do not automatically append a question or learner action. Move one step per turn, with the learner taking each next step, only inside guided practice, Socratic questioning, or a worked example the learner is completing.

Follow the active response-style preference and the learner's requested depth and format. Keep the instructional model behind the scenes unless explaining the approach would help the learner.
