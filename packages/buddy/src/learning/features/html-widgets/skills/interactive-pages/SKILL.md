---
name: interactive-pages
description: "Design and build interactive teaching pages the user acts on: simulations, manipulatives, explorable explanations, prediction tests, sorting and building activities, and small games. Load before creating or substantially revising an HTML widget. Covers when interaction earns its place, how to design around one meaningful action, and how to build pages that run in Buddy's sandbox."
---

# Interactive Pages

An interactive page earns its place when the learner's own action does the teaching. Clicking is not learning; changing a cause and watching its effect is. Before building, name the action and what the learner should notice when they take it. If you can't, show a picture or explain in words instead.

## When interaction helps

Interaction teaches when the learner's action does a real learning job (evidence summarized in deep-research report 2, PhET's research, and Bret Victor's *Explorable Explanations*):

- **Controlling the pace** of a process that is too fast, too slow, or too tangled to follow as an animation, for example stepping through a sorting algorithm or a cell dividing.
- **Varying a cause and seeing its effect**, such as the launch angle and range of a projectile, the interest rate and a monthly payment, or temperature and reaction rate.
- **Committing to a prediction, then testing it**: guess where the ball lands, then run it.
- **Choosing experiments**: deciding which variable to change next and why.
- **Linking representations**: moving one thing updates the equation, the graph, and the picture together, such as a unit circle driving a sine wave.
- **Building or sorting with feedback**: assembling a fraction, ordering historical events, classifying examples and non-examples.

Interaction doesn't help when it only reveals the same content a picture would, when the controls change nothing that matters, or when the learner is too new to the idea to know what to look for. Give a frame first, then the page.

## Design around one meaningful action

1. **Name the action and the insight.** Write it down before building: "Drag the slider for the number of samples and notice the histogram narrowing toward a bell shape."
2. **Narrow the scope.** Include only the controls that teach this idea. Every extra slider is a distraction and a chance to get lost. Good simulations guide exploration without the learner feeling guided, through what they include, where things sit, and what responds.
3. **Make the consequence legible.** Show what changed, by how much, and compared with what. Keep a reference visible, such as a ghost of the previous run, a baseline line, a target, or the numbers alongside the picture.
4. **Start in an informative state.** Open with sensible values that already show something worth noticing, and include a reset. An empty page teaches nothing.
5. **Put the explanation on the page.** Place short labels and one or two sentences next to the controls saying what to try and what to watch. The page should guide the reader; it shouldn't be a bare toy.
6. **Ask for a prediction before the reveal** when the point is to confront an intuition. A single "What do you think happens?" choice before the run is enough.
7. **Give immediate, specific feedback** that says why, not just right or wrong.
8. **Keep motion purposeful.** Animate the thing that changes. Don't animate the whole mechanism as the answer; the learner should drive the part that teaches. Respect reduced-motion preferences.
9. **One idea per page.** A second idea gets its own page, or an extension of this one on a later turn.

## Build for Buddy's runtime

The page runs in a sandboxed frame with scripts allowed and an opaque origin.

- **Self-contained:** inline the CSS and JavaScript in a single HTML file, or keep a folder of local files referenced by relative paths. There are no CDNs, remote fonts, remote images, API calls, or third-party network access.
- **No stored state:** `localStorage`, cookies, and access to Buddy itself are unavailable. Keep state in variables and reset cleanly.
- **Light on the CPU:** use `requestAnimationFrame` for animation, cap loops and particle counts, and never run unbounded computation, which can freeze the app.
- **Sized to its preset:** design for the declared viewport.
  - `compact_4_3` (640×480): small controls or one quiz item.
  - `standard_16_10` (960×600): most lesson pages.
  - `wide_16_9` (1280×720): wide simulations and timelines.
  - `square` (720×720): centered manipulatives.
  - `tall_mobile` (390×844): phone-shaped pages only.

  Compact and square pages stay inline in the chat. Larger ones also open on the Bench.
- **Readable and operable:** use large hit targets, visible labels, keyboard support for controls, sufficient contrast, and text of at least 14px. Don't rely on color alone to carry meaning.
- **Correct:** compute the model faithfully. When the model is a simplification (no air resistance, ideal gas), say so on the page.

## Around the page, in chat

- Before presenting, give the learner just enough frame to know what to look for.
- After presenting, give one specific thing to try: "Set the angle to 30° and then 60°. What do you notice about the range?"
- Buddy does not see the learner's interactions. When their result matters for your next step, ask what they observed and build on it.
- Revise the same page for the next step instead of making a new one, using the widget's returned `source_root`, `edit_path`, and `object_id`.

## Common failures

- **Controls with no insight:** sliders that change colors or sizes nobody needs to understand.
- **The answer in motion:** an animation of the whole process with nothing for the learner to decide.
- **Too many parameters:** five sliders when one teaches the idea.
- **A blank start:** the learner has to configure everything before anything happens.
- **Silent pages:** no labels or prompts, so the learner doesn't know what to try.
- **Games whose mechanic doesn't carry the concept:** points and timers bolted onto content they don't illuminate.

## Relationship to other guidance

- Use `explanatory-drawing` to compose the visual part of the page.
- Use `teaching-resource-authoring` for worksheets, handouts, and document-form quizzes that need no runtime behavior.
- When an established simulation already does the job (for example on PhET, Desmos, or GeoGebra), opening it in the Browser can beat building a new one.
