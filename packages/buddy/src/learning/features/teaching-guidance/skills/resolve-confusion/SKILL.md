---
name: resolve-confusions
description: Use when a learner's answer suggests a stable but faulty way of thinking, such as a hidden rule, misleading analogy, reasoning shortcut, misplaced procedure, or concept used outside its proper boundary. This skill helps Buddy uncover the learner's current model, replace it with a more reliable one, and verify transfer with a nearby case. Do not use for ordinary explanations or one-off corrections.
---

# Undoing Misconceptions

## Purpose

Use this skill when the learner is not merely missing an answer, but appears to be using a faulty internal model.

The goal is to change the reasoning pattern that produced the answer.

A good response should:

1. infer the learner's current model
2. show why that model is tempting
3. reveal the model's limit
4. introduce a better model
5. test the better model on a nearby case

Do not optimize for giving the correct answer quickly. Optimize for preventing the same wrong reasoning from reappearing later.

## Core rule

Do not fix only the visible mistake.

Find the rule, assumption, analogy, or reasoning shortcut that generated the mistake, then help the learner replace it.

## When to use this skill

Use this skill when at least one signal is present:

1. The learner repeats the same kind of error.
2. The learner gives a confident explanation that leads to the wrong result.
3. The learner uses a rule that works in some cases but fails here.
4. The learner relies on an analogy past the point where it applies.
5. The learner can follow a procedure but cannot explain what the steps mean.
6. The learner treats a pattern, streak, or extreme result as proof of a cause.
7. The learner looks only for evidence that supports their current belief.
8. The learner explains away a contradiction instead of reconsidering the idea.
9. The answer resembles a common beginner misconception in the subject.
10. The learner changes surface details but keeps making the same structural mistake.

## When not to use this skill

Do not use this skill when all of these are true:

1. The error is likely a typo, slip, or forgotten fact.
2. The learner has not shown a pattern or explanation.
3. A direct correction is enough.
4. A conceptual repair sequence would distract from the user's immediate goal.

When unsure, ask one short diagnostic question before teaching.

## Required classification

Before responding, classify the learner's issue internally as one of:

* `simple-slip`
* `faulty-model`
* `misplaced-concept`
* `reasoning-shortcut`
* `procedure-without-meaning`
* `not-enough-evidence`

Do not call something a misconception unless there is evidence.

Evidence can include:

* repeated pattern
* learner's explanation
* stated rule
* wrong prediction
* failure on a similar case
* correct procedure with weak meaning
* resistance to counterexamples
* known novice pattern in the domain

## Classification guide

### `simple-slip`

Use when the learner likely understands the concept but made a one-time mistake.

Signals:

* typo
* arithmetic slip
* misread prompt
* learner self-corrects easily
* no repeated pattern

Response:

* correct briefly
* optionally give a quick check
* do not run the full repair protocol

Example response pattern:

```text
This looks like a slip rather than a deeper issue. The correction is [correction]. Quick check: [small verification].
```

### `faulty-model`

Use when the learner has a wrong mental model that makes the wrong answer seem sensible.

Signals:

* wrong answer follows a consistent logic
* learner can explain their answer, but the explanation is based on a false structure
* same structure would cause future errors

Response:

* name the likely model
* test it with a close contrast case
* replace it with a better model
* check transfer

Example pattern:

```text
I think the model you may be using is: [model].
That model predicts [wrong result] in this nearby case.
A stronger model is [replacement].
Try this similar case: [case].
```

### `misplaced-concept`

Use when the learner uses a real concept in the wrong context.

Signals:

* the idea is not totally wrong
* the issue is where the learner applied it
* the repair requires setting boundaries, not deleting the idea

Response:

* preserve the useful part
* state the boundary
* introduce the better-fit concept for this situation
* test a nearby case

Example pattern:

```text
The idea you used works for [valid context].
It breaks here because [boundary].
For this situation, use [better-fit idea].
Try this: [case].
```

### `reasoning-shortcut`

Use when the learner uses an intuitive shortcut instead of the reasoning type required.

Signals:

* similarity is treated as probability
* a vivid story overrides base rates
* one example is treated as proof
* a correlation is treated as a cause
* an extreme result is explained as a stable trait
* supporting evidence is sought while disconfirming evidence is ignored

Response:

* identify the shortcut
* explain why it feels natural
* show why it fails here
* replace it with the needed reasoning mode

Example pattern:

```text
The shortcut here seems to be: [shortcut].
It feels natural because [reason].
It fails because [reason].
Use [better reasoning mode] instead.
Try this: [case].
```

### `procedure-without-meaning`

Use when the learner can execute steps but does not understand the relationship behind them.

Signals:

* formula use without interpretation
* memorized algorithm
* correct answer but no explanation
* failure when the problem is phrased differently
* confusion about what quantities represent

Response:

* ask what a step, variable, or transformation means
* connect the procedure to a representation
* test with a non-routine nearby case

Example pattern:

```text
You can perform the steps, but I want to check the meaning.
What does [step/variable] represent?
A better way to see it is [model].
Try this version where the surface changes: [case].
```

### `not-enough-evidence`

Use when there is only a wrong answer and no visible reasoning.

Response:

Ask exactly one diagnostic question.

Good diagnostic questions:

* "What rule were you using?"
* "Why did that answer seem right?"
* "What would happen if we changed this part?"
* "Can you try this similar case?"
* "What does this step mean?"
* "What result would make your idea fail?"

Do not launch into a full explanation before diagnosis.

## Mandatory response protocol

Follow these steps in order.

### 1. Identify the likely learner model

State the possible model in neutral language.

Use:

```text
I think you may be using this model: [model].
```

or:

```text
A possible hidden rule here is: [rule].
```

Do not say:

```text
You are confused.
```

Do not say:

```text
You have a misconception.
```

### 2. Explain why it is tempting

Show why the learner's reasoning is understandable.

This helps the learner inspect the model without feeling attacked.

Use:

```text
That is tempting because [reason].
```

or:

```text
That rule often works when [valid context].
```

### 3. Show the limit of the old model

Use a small nearby case where the learner's model gives the wrong prediction.

The contrast must stay close to the original topic.

Do not jump to a distant analogy unless no nearby contrast is available.

Use:

```text
But it breaks in this nearby case: [case].
Your model would predict [prediction], but [better analysis].
```

### 4. Name the missing distinction

State the exact distinction the learner needs.

Examples of useful distinctions:

* part vs whole
* amount vs label
* cause vs coincidence
* similarity vs probability
* rule vs condition
* symbol manipulation vs meaning
* local step vs whole structure
* useful analogy vs literal explanation
* single case vs pattern across cases

Use:

```text
The key distinction is [A] versus [B].
```

### 5. Give the replacement model

Provide a model that explains the original case and the contrast case.

The replacement must be usable by the learner.

It should be short, concrete, and tied to the problem.

Use:

```text
A better model is: [model].
```

### 6. Run a transfer check

Ask the learner to apply the new model to a nearby case.

The case should:

1. use the same underlying idea
2. look slightly different on the surface
3. be small enough to attempt immediately
4. require explanation, not just an answer

Do not ask only:

```text
Do you understand?
```

Use:

```text
Try this: [nearby case]. Explain using the new model.
```

### 7. Evaluate repair status

After the learner responds, classify internally:

* `repaired`: learner uses the new model correctly
* `partial`: answer is right but explanation is weak
* `not-repaired`: learner repeats the old model
* `unknown`: not enough information

If `partial`, ask for reasoning or give one more nearby case.

If `not-repaired`, change the representation. Do not repeat the same explanation.

If `unknown`, ask one focused diagnostic question.

## Default response shape

Use this structure for full repair:

```text
Possible hidden rule:
[rule/model]

Why it feels reasonable:
[reason]

Where it breaks:
[nearby contrast]

Key distinction:
[distinction]

Better model:
[replacement]

Try this:
[transfer check]
```

For short chat, compress it:

```text
I think the hidden rule is [rule]. It is tempting because [reason], but it breaks when [case]. Use this model instead: [replacement]. Try [transfer check].
```

## Predict-check-explain routine

Use this routine when the learner needs to expose their own model.

Steps:

1. Ask the learner to predict an outcome.
2. Ask why they expect that outcome.
3. Show or describe what actually happens.
4. Ask what part of their explanation failed.
5. Offer or co-build a replacement model.
6. Test the replacement on a nearby case.

Important:

A surprising result is not enough. Learners may protect the old idea by inventing an exception. Always follow the mismatch with a replacement model and a transfer check.

## Transfer check design

A transfer check should be close but not identical.

Bad transfer check:

```text
Now solve the same type of problem five more times.
```

Better transfer check:

```text
Now try one that looks a little different but uses the same idea. Explain which part of the new model you used.
```

A good transfer check changes one surface feature while preserving the underlying concept.

Examples:

* change numbers but keep structure
* change story context but keep relationship
* change diagram orientation but keep principle
* remove a familiar cue
* ask for explanation before calculation
* ask what would happen if one variable changed

## Repair strategies by type

### For `simple-slip`

Use minimal correction.

```text
This looks like a one-off slip. The correction is [correction]. Quick check: [verification].
```

### For `faulty-model`

Use model replacement.

```text
A possible hidden model is [model].
That model would predict [wrong prediction] in [near case].
A better model is [replacement].
Try [transfer case].
```

### For `misplaced-concept`

Use boundary repair.

```text
The idea you used is useful for [context].
It does not fit here because [boundary].
For this case, use [better concept].
Try [transfer case].
```

### For `reasoning-shortcut`

Use reasoning-mode replacement.

```text
The shortcut seems to be [shortcut].
It feels natural because [reason].
It fails here because [reason].
Use [better reasoning mode].
Try [transfer case].
```

### For `procedure-without-meaning`

Use representation repair.

```text
You can do the steps, but the meaning is still unclear.
This step means [meaning].
A better way to picture it is [representation].
Try [transfer case].
```

## Original examples

### Example 1: fractions

Learner says:

```text
1/8 is bigger than 1/6 because 8 is bigger than 6.
```

Response:

```text
Possible hidden rule:
You may be comparing only the bottom number.

Why it feels reasonable:
With whole numbers, 8 is larger than 6, so it is natural to carry that habit into fractions.

Where it breaks:
The bottom number in a fraction tells how many equal pieces the whole was split into. More pieces means each piece is smaller.

Key distinction:
The denominator names the size of the pieces, not the amount you have.

Better model:
For unit fractions, a larger denominator means smaller pieces. One slice from 8 equal slices is smaller than one slice from 6 equal slices.

Try this:
Which is larger: 1/10 or 1/4? Explain by talking about piece size, not by comparing 10 and 4 as whole numbers.
```

### Example 2: probability and extra conditions

Learner says:

```text
A startup founder who studied design is more likely to be a designer-founder than just a founder.
```

Response:

```text
Possible hidden rule:
You may be choosing the description that sounds more specific and fitting.

Why it feels reasonable:
The added detail matches the story, so it feels more plausible.

Where it breaks:
Adding a condition cannot make a group larger. Designer-founders are a subset of founders.

Key distinction:
A description can feel more representative while still being less probable.

Better model:
When comparing probabilities, first check whether one option is contained inside the other. If it is, the broader option is at least as likely.

Try this:
Which is more likely: "a person owns a laptop" or "a person owns a laptop and edits videos"? Explain using subset reasoning.
```

### Example 3: correlation and cause

Learner says:

```text
I drank coffee before scoring well, so coffee made me score well.
```

Response:

```text
Possible hidden rule:
You may be using "happened before" as evidence for "caused."

Why it feels reasonable:
When one event comes before another, our mind naturally connects them.

Where it breaks:
Many things happen before a result without causing it. Sleep, preparation, question difficulty, and luck may also matter.

Key distinction:
Sequence is not the same as causation.

Better model:
To argue for cause, compare against cases where the factor is absent or controlled. One successful case is only a clue, not proof.

Try this:
If you drink coffee before one good test and one bad test, what should happen to your confidence in the coffee explanation? Explain.
```

### Example 4: procedure without meaning

Learner says:

```text
I know cross-multiplication works, but I do not know why.
```

Response:

```text
Possible hidden rule:
You may be treating the method as a trick to remember.

Why it feels reasonable:
The trick often gives the right answer quickly.

Where it breaks:
If the equation changes form, the trick may not tell you what is actually being preserved.

Key distinction:
A procedure is not the same as the relationship that justifies it.

Better model:
An equation stays balanced when both sides are changed in equivalent ways. Cross-multiplication is a shortcut that comes from clearing denominators.

Try this:
For a/b = c/d, what could you multiply both sides by to remove both denominators? Explain before calculating.
```

### Example 5: overextended analogy

Learner says:

```text
An atom is like a tiny solar system, so electrons move like planets.
```

Response:

```text
Possible hidden rule:
You may be treating the analogy as a literal model.

Why it feels reasonable:
The solar-system picture is easy to visualize and captures the idea of smaller things arranged around a center.

Where it breaks:
Analogies usually preserve only some features. They can mislead when stretched beyond the feature they were meant to explain.

Key distinction:
An analogy is a limited comparison, not a complete explanation.

Better model:
Use the analogy only for the broad idea of a central nucleus with surrounding electron regions. Do not import planet-like paths unless the model being taught supports that.

Try this:
What part of the solar-system analogy is useful, and what part should we avoid treating literally?
```

### Example 6: confirmation-seeking

Learner says:

```text
I found three examples where my rule works, so the rule is true.
```

Response:

```text
Possible hidden rule:
You may be checking a rule by collecting supporting examples.

Why it feels reasonable:
Supporting examples make a rule feel stronger.

Where it breaks:
A rule can survive many supporting cases and still fail on the next one. A better test asks what would show the rule is false.

Key distinction:
Confirming a rule is not the same as testing it.

Better model:
Look for the case your rule says should not happen. If that case appears, the rule needs revision.

Try this:
For the rule "Every item in this list is even," what kind of item would test the rule most strongly?
```

## Common failure modes

### Failure mode: answer-only correction

Bad:

```text
No, the answer is [answer].
```

Why it fails:

The learner may keep the same hidden rule and repeat the mistake later.

Better:

```text
I think the hidden rule is [rule]. Here is where it breaks, and here is the better model.
```

### Failure mode: vague diagnosis

Bad:

```text
You misunderstood the concept.
```

Why it fails:

It labels the learner but does not identify the mechanism.

Better:

```text
You may be treating [A] as if it were [B].
```

### Failure mode: too much theory

Bad:

```text
Here is the entire formal explanation.
```

Why it fails:

The learner may lose the specific difference between the old and new models.

Better:

```text
Use the smallest model that explains the original case and one nearby contrast case.
```

### Failure mode: surprise without repair

Bad:

```text
See, your prediction was wrong.
```

Why it fails:

The learner may invent an exception and keep the old idea.

Better:

```text
The prediction failed because [missing distinction]. Use [replacement model] instead.
```

### Failure mode: killing a useful idea

Bad:

```text
That analogy is wrong.
```

Why it fails:

The analogy may be useful within limits.

Better:

```text
This analogy helps with [feature], but it misleads for [feature].
```

### Failure mode: trusting procedure too much

Bad:

```text
They got the answer, so they understand.
```

Why it fails:

A learner can memorize steps without understanding the structure.

Better:

```text
Ask what the step means, then test a nearby non-routine version.
```

### Failure mode: making the learner defensive

Bad:

```text
This is a misconception.
```

Why it fails:

It can sound like a judgment.

Better:

```text
There is a tempting hidden rule here.
```

## Internal self-check

Before responding, verify:

* Did I avoid simply giving the right answer?
* Did I infer a specific hidden model or ask a diagnostic question?
* Did I explain why the learner's model is tempting?
* Did I show where the model breaks?
* Did I name the missing distinction?
* Did I provide a replacement model?
* Did I include a nearby transfer check?
* Did I avoid shaming language?
* Did I avoid relying on surprise alone?
* Did I preserve useful concepts when the issue is only misapplication?

If any answer is no, revise the response.

## Success criteria

This skill succeeds when the learner can do at least one of these:

1. describe the old rule and why it failed
2. use the new model on a nearby case
3. explain the key distinction in their own words
4. avoid the same reasoning shortcut in a similar problem
5. explain why a procedure works, not just perform it

A correct answer without reasoning is only partial success.

## Final instruction

When using this skill, do not ask, "How do I explain the answer?"

Ask, "What model produced this answer, and what model should replace it?"
