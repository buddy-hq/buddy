For a normal Buddy chat turn, the final prompt sent to the model is composed in two layers:

1. The selected agent’s own prompt.
2. A Buddy-generated per-turn system context string.

There is also a third thing that affects behavior but is not part of the system string:

3. A synthetic reminder inserted as the first user text part when the turn context changed.

**High-Level Flow**

1. Web sends a message with `persona`, optional `intent`, optional `teaching`, optional `reading`, message `parts`, and sometimes `system`.
   - [chat-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-actions.ts)
2. Buddy backend runs the message transform pipeline.
   - [message-transform-orchestration.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/agent-execution/transforms/message-transform-orchestration.ts#L13)
3. That pipeline resolves persona, intent, workspace state, learner snapshot, resources, and capabilities, then builds Buddy’s per-turn system context.
   - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L108)
4. Buddy writes the generated system string into `transformed.system`, selects the concrete agent, and hands the request to vendored OpenCode.
   - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L264)
5. OpenCode prepends the selected agent prompt and then appends Buddy’s `system` string before making the model call.
   - [llm.ts](/Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/opencode/src/session/llm.ts#L101)

**What Actually Goes Into The Final System Prompt**

For a normal learner turn, the final system prompt is effectively:

```text
[agent.prompt]
+
[Buddy-generated system context]
+
[any preexisting body.system, if present]
+
[possibly additional system text from OpenCode/user message plumbing]
```

The important part is that Buddy does not replace the agent prompt. It adds runtime context on top of it.

**Layer 1: Agent Prompt**
The selected agent contributes its static base prompt through `agent.prompt`.

For the built-in personas:

- `buddy` uses only the base prompt.
  - [agent.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/personas/buddy/agent.ts#L5)
  - [prompt.p.md](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/personas/buddy/prompt.p.md#L1)
- `code-buddy`, `math-buddy`, and `reading-buddy` use:
  - Buddy base prompt
  - plus the persona-specific overlay
  - joined with `"\n\n"`
  - Example: [code-buddy/agent.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/personas/code-buddy/agent.ts#L8)
  - Example: [math-buddy/agent.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/personas/math-buddy/agent.ts#L8)
  - Example: [reading-buddy/agent.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/personas/reading-buddy/agent.ts#L8)

So for `reading-buddy`, the agent prompt is:

```text
Buddy base prompt
+
reading-buddy overlay
```

That is static persona authoring. It does not depend on the current turn.

**Layer 2: Buddy Per-Turn System Context**
Buddy then builds a per-turn system string with `buildLearningSystemPrompt()`.

- [learning-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/learning-prompt.ts#L12)

That builder returns:

- `systemContext`: the real system text
- `turnReminder`: a reminder that is inserted into user parts, not the system string

The `systemContext` itself is built by `buildSystemPrompt()`.

- [system-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/system-prompt.ts#L340)

That function produces exactly two top-level sections:

1. `<student_intent> ... </student_intent>`
2. `<buddy_runtime_context> ... </buddy_runtime_context>`

It concatenates those with blank lines.

- [system-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/system-prompt.ts#L343)

So Buddy’s runtime segment looks like:

```text
<student_intent>
...
</student_intent>

<buddy_runtime_context>
...
</buddy_runtime_context>
```

**Section 1: `<student_intent>`**
This comes from `getIntentPrompt(intent)`.

- [get-intent-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/intents/get-intent-prompt.ts#L33)

Behavior:

- If intent is `learn`, `practice`, or `assess`, Buddy injects only that intent’s guidelines.
- If intent is `auto`, Buddy injects all three sets of guidelines and tells the model to choose based on learner progress.

So this section is the explicit “what kind of teaching turn is this?” control block.

**Section 2: `<buddy_runtime_context>`**
This is assembled by `buildRuntimeContext()`.

- [system-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/system-prompt.ts#L288)

Inside it, Buddy conditionally appends these blocks:

1. `<workspace_state>`
   - always present
   - includes whether the session is `chat` or `interactive`
   - includes guidance based on visible surfaces like `editor` or `figure`
   - [system-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/system-prompt.ts#L112)

2. `<model_limits>`
   - optional
   - present if Buddy can resolve the active model
   - includes provider/model id, context window, input window, output window
   - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L44)
   - [system-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/system-prompt.ts#L144)

3. `<calculator_runtime>`
   - optional
   - only present when `python_calculator` is allowed for the active capability envelope
   - currently important for `math-buddy`
   - explicitly says to call `python_calculator` before making mathematical claims
   - [system-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/system-prompt.ts#L130)

4. `<notebook_resources>`
   - always present
   - lists notebook-local resources, where processed text lives, and how to inspect them
   - includes a compact inventory, with truncation rules for prompt budget
   - [system-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/system-prompt.ts#L220)

5. `<active_reading_resource>`
   - optional
   - only present when the request includes a valid `reading` context
   - includes title, path, optional alias/id/status, toc/page/location labels
   - tells the model this is the default reading context for the turn
   - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L83)
   - [system-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/system-prompt.ts#L200)

6. `<learner_state>`
   - always present
   - workspace label
   - relevant goal IDs
   - up to six goals with `howToTest`
   - summarized constraints
   - [system-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/system-prompt.ts#L46)

7. `<learner_progress>`
   - always present
   - counts of goals, evidence, open feedback, misconceptions
   - [system-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/system-prompt.ts#L67)

8. `<learner_feedback>`
   - always present
   - open feedback actions
   - active misconceptions
   - [system-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/system-prompt.ts#L87)

9. `<teaching_workspace>`
   - optional
   - only present when:
     - `teaching.active === true`
     - and the active persona’s capability envelope exposes `editor`
   - includes:
     - session id
     - lesson file path
     - checkpoint file path
     - language
     - revision
     - checkpoint status
     - tracked files
     - selection range if available
   - [system-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/system-prompt.ts#L260)
   - [TeachingPromptContextSchema](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/capabilities/lesson-workspace/model/types.ts#L149)

So the runtime system block is not generic prose. It is a structured envelope with a fixed set of tagged sections.

**Where Those Inputs Come From**
Before prompt assembly, `runMessagePromptPipeline()` resolves the current turn context:

- Persona from request/config:
  - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L126)
- Persona profile:
  - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L141)
- Intent:
  - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L143)
- Focus goals:
  - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L147)
- Workspace state:
  - `interactive` if `teaching.active`, else `chat`
  - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L148)
- Learner snapshot:
  - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L149)
- Resource inventory:
  - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L158)
- Capability profile:
  - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L159)
- Model metadata:
  - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L167)
- Active reading resource:
  - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L194)
- Prior turn snapshot:
  - [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L228)

That last one matters for the turn reminder.

**What Is Not Part Of The System Prompt**
The “turn reminder” is deliberately not appended to `system`. It is inserted as a synthetic text part at the front of the user message.

- [learning-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/learning-prompt.ts#L22)
- [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L254)

It looks like:

```text
<system-reminder>
...
</system-reminder>
```

It appears only when one of these changed:

- execution-focused vs concept-first mode
- persona
- intent
- workspace state
- checkpoint changed since last acceptance

Source:

- [turn-prompt.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/turn-prompt.ts#L25)

This is important because if you inspect only `transformed.system`, you will miss one of the behavior-shaping inputs.

**How Buddy Merges Its System Text**
After building the Buddy system context, the message pipeline merges it with any existing `body.system` already present on the request:

```ts
const mergedSystem = [existingSystem, buddySystem]
  .filter(Boolean)
  .join('\n\n')
  .trim()
```

- [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L264)

So Buddy’s order is:

1. preexisting `body.system`
2. Buddy-generated runtime system context

Then it sets:

- `transformed.system = mergedSystem`
- `transformed.agent = target.agent`
- [message-prompt-pipeline.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/prompt/message-prompt-pipeline.ts#L265)

**How OpenCode Turns That Into The Real Final System Prompt**
OpenCode then constructs the actual system messages sent to the model like this:

```ts
;[
  ...(input.agent.prompt ? [input.agent.prompt] : providerDefaultPrompt),
  ...input.system,
  ...(input.user.system ? [input.user.system] : []),
].join('\n')
```

- [llm.ts](/Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/opencode/src/session/llm.ts#L101)

For Buddy, the key implication is:

- `agent.prompt` is the static persona prompt
- `input.system` contains Buddy’s per-turn runtime context
- the final system prompt is the concatenation of both

So for `code-buddy`, the final system prompt roughly becomes:

```text
[Buddy base prompt]
[Code Buddy overlay]

[existing body.system if any]

<student_intent>
...
</student_intent>

<buddy_runtime_context>
  <workspace_state>...</workspace_state>
  <model_limits>...</model_limits>           // optional
  <notebook_resources>...</notebook_resources>
  <learner_state>...</learner_state>
  <learner_progress>...</learner_progress>
  <learner_feedback>...</learner_feedback>
  <teaching_workspace>...</teaching_workspace> // if interactive editor-backed turn
</buddy_runtime_context>
```

For `math-buddy`, add `<calculator_runtime>` when allowed.
For `reading-buddy`, add `<active_reading_resource>` when reading mode data is present.

**Filtering And Capturing**
Before the model call, Buddy’s plugin can filter system segments and then captures the final joined prompt for debugging:

- [buddy-system-prompt-guard.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/opencode-runtime/plugins/buddy-system-prompt-guard.ts#L158)

It stores:

- the final filtered, joined system prompt
- keyed by directory + session
- [system-prompt-capture.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/opencode-runtime/system-prompt-capture.ts#L64)

That is what the debug UI shows as `fullSystemPrompt`.

- [state-actions.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/adapters/http/session/state-actions.ts#L18)

So the debug panel is close to the real final prompt, not just Buddy’s local `transformed.system`.

**Important Distinction: Message Turns vs Command Turns**
Normal learner messages go through the full learning prompt pipeline described above.

Command turns do not build the same per-turn Buddy system context. They mostly:

- resolve persona
- update teaching state
- sync runtime permissions
- select the agent/model

They do not call `buildLearningSystemPrompt()`.

- [command-transform.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/agent-execution/transforms/command-transform.ts#L17)

So if you are reasoning about the “final system prompt,” be careful:

- for chat/message turns: agent prompt + Buddy runtime system context
- for command turns: mostly just agent prompt unless some other caller supplied system text

**Concrete Mental Model**
The cleanest mental model is:

1. Persona authoring defines the static identity.
   - base prompt
   - persona overlay
2. Runtime resolution defines the current operating frame.
   - intent
   - workspace mode
   - learner snapshot
   - resources
   - active reading resource
   - model limits
   - capability-driven runtime instructions
3. Turn reminders handle transitions.
   - persona/intention/workspace/checkpoint shifts
4. OpenCode concatenates those into the final system payload.
