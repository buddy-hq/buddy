# Flashcard Subagent Backend Flow

This document provides a comprehensive overview of how the flashcard-author subagent works in Buddy, from initial trigger through tool execution to LLM feedback.

## Table of Contents

1. [Triggering the Flashcard Subagent](#triggering-the-flashcard-subagent)
2. [Delegation via Task Tool](#delegation-via-task-tool)
3. [Flashcard Creation Function](#flashcard-creation-function)
4. [Result Flow Back to LLM](#result-flow-back-to-llm)
5. [Complete Data Flow Diagram](#complete-data-flow-diagram)
6. [Key Architectural Patterns](#key-architectural-patterns)
7. [Critical Files Reference](#critical-files-reference)

---

## Triggering the Flashcard Subagent

### 1. Command Registration

**File:** `packages/buddy/src/config/opencode/overlay-builder.ts`

The `/flashcard` slash command is registered as a built-in command:

```typescript
const BUDDY_BUILTIN_COMMANDS = {
  flashcard: {
    description: "Generate flashcards from context in learn mode",
    template: [
      "Create flashcards about $ARGUMENTS",
      "",
      "Use the flashcard-author subagent if it is available...",
      "Before delegating to the flashcard-author subagent, use the task prompt...",
      // Instructions for delegation
    ].join("\n"),
  },
}
```

### 2. Subagent Definition

**File:** `packages/buddy/src/learning/flashcard-author/agent.ts`

```typescript
export const FLASHCARD_AUTHOR_AGENT = defineBuddySubagent({
  key: "flashcard-author",
  description: "Generates structured flashcard decks (basic and cloze)...",
  prompt: FLASHCARD_AUTHOR_PROMPT, // from prompt.p.md
  permission: {
    question: "allow",
    learner_snapshot_read: "allow",
    pedagogy_prepare_resource: "deny",
    pedagogy_resource_ingest_full_text: "allow",
    save_flashcard_deck: "allow", // ← KEY PERMISSION 
    task: "deny", // Cannot delegate further
  },
})
```

### 3. Persona Configuration

**File:** `packages/buddy/src/learning/personas/buddy.ts`

The default Buddy persona enables the flashcard-author subagent:

```typescript
export const BUDDY = defineBuddyPersona({
  id: "buddy",
  subagentDefaults: {
    "flashcard-author": "prefer", // ← Enabled by default
  },
})
```

### 4. Registration Flow

The subagent goes through several registration stages:

1. **Subagent Manifest** (`learning/subagent-manifest.ts`): Adds `FLASHCARD_AUTHOR_AGENT` to `BUDDY_SUBAGENTS` array
2. **Runtime Registration** (`learning/runtime-subagents.ts`): Converts to `RegisteredBuddyAgent`
3. **Agent Index** (`learning/register-agents.ts`): Includes in `BUDDY_AGENTS`
4. **Permission Resolution** (`learning/resolve-capability-profile.ts`): Builds effective subagent access map
5. **Session Permissions** (`learning/agent-execution/permissions/session-permissions.ts`): Converts to OpenCode task permission rules:

```typescript
// For flashcard-author with "prefer" access:
{
  permission: "task",
  pattern: "flashcard-author",
  action: "allow"
}
```

---

## Delegation via Task Tool

When Buddy receives `/flashcard [topic]`, it:

### 1. Expands the Command Template

The command template is expanded with user arguments to create a full prompt.

### 2. Calls the OpenCode `task` Tool

**File:** `vendor/opencode/packages/opencode/src/tool/task.ts`

```typescript
const parameters = {
  description: "flashcards about quantum mechanics", // Short description
  prompt: "Create flashcards about quantum mechanics [full context]", // Full prompt
  subagent_type: "flashcard-author", // Target subagent
}
```

### 3. Permission Check

The task tool validates access:

```typescript
yield* ctx.ask({
  permission: "task",
  patterns: [params.subagent_type], // "flashcard-author"
  always: ["*"],
})
```

### 4. Creates Child Session

Spawns a new session for the subagent with restricted permissions.

### 5. Delegates Execution

Runs the flashcard-author agent in the child session.

---

## Flashcard Creation Function

### Tool Registration

**File:** `packages/buddy/src/learning/features/flashcards/tools/save-flashcard-deck.ts`

```typescript
const saveFlashcardDeckTool = createBuddyTool("save_flashcard_deck", {
  description: "Persist a fully-authored flashcard deck...",
  parameters: SaveFlashcardDeckInputSchema, // Zod schema
  
  async execute(params: SaveFlashcardDeckInput, ctx: BuddyToolContext) {
    // 1. Permission check
    await ctx.ask({
      permission: "save_flashcard_deck",
      patterns: ["*"],
    })

    // 2. Generate managed object identity
    const objectID = generateObjectID()
    const createdAt = new Date().toISOString()

    // 3. Build notes and cards
    const { notes, cards } = buildFlashcardNotesAndCards(
      objectID,
      parsed.notes,
      DECK_CONFIG_DEFAULTS,
    )

    // 4. Save revision payload plus mutable review state
    const saved = await saveFlashcardDeckObject({
      directory: ctx.directory,
      deck: { objectID, title, notes, cards, ... }
    })

    // 5. Return result
    const buddyObjectResult = buildSaveFlashcardDeckObjectResult({
      objectID: saved.objectID,
      revisionID: saved.revisionID,
      title: saved.deck.title,
      noteCount: saved.deck.notes.length,
      cardCount: saved.deck.cards.length,
    })

    return {
      title: "Saved flashcard deck",
      output: [
        buddyObjectResult.message,
        `object_kind=flashcard-deck`,
        `object_id=${saved.objectID}`,
        `revision_id=${saved.revisionID}`,
      ].join("\n"),
      metadata: {
        buddyObjectResult,
      },
    }
  },
})
```

### Service Layer

**File:** `packages/buddy/src/learning/features/flashcards/storage/save-deck.ts`

#### Card Generation Logic

```typescript
function buildFlashcardNotesAndCards(objectID, inputs, config) {
  for (const input of inputs) {
    const noteID = ulid()
    const note = { noteID, objectID, type, fields, tags }
    notes.push(note)
    
    // Generate cards based on note type
    if (note.type === "basic") {
      // Basic notes → 1 card per note
      cards.push({ cardID: ulid(), noteID, state: "new", ... })
    } else {
      // Cloze notes → N cards per note
      const ordinals = listClozeOrdinals(text) // [1, 2, 3]
      for (const ordinal of ordinals) {
        cards.push({ 
          cardID: ulid(), 
          noteID, 
          templateIdx: ordinal - 1,
          state: "new",
          ...
        })
      }
    }
  }
  return { notes, cards }
}
```

#### Persistence

```typescript
async function save({ directory, deck }) {
  const revisionID = generateObjectID()
  await writeObjectRecord({
    directory,
    kind: "flashcard-deck",
    objectID: deck.objectID,
    manifest,
    files: [
      {
        relativePath: `revisions/${revisionID}/deck.json`,
        format: "json",
        content: deck,
      },
      {
        relativePath: "state/deck.json",
        format: "json",
        content: deck,
      },
    ],
  })
  return { objectID: deck.objectID, revisionID, deck, manifest }
}
```

---

## Result Flow Back to LLM

### Tool Execute Result Format

**File:** `vendor/opencode/packages/opencode/src/tool/tool.ts`

```typescript
interface ExecuteResult<M extends Metadata = Metadata> {
  title: string          // "Saved flashcard deck"
  metadata: M            // { buddyObjectResult: {...} }
  output: string         // concise model-visible result text
  attachments?: [...]    // Optional file attachments
}
```

### Exact Data Returned to LLM

From `save-flashcard-deck.ts`:

```typescript
const buddyObjectResult = {
  version: 1,
  status: "ok",
  message: "Saved flashcard deck Quantum Mechanics.",
  primaryRef: {
    kind: "flashcard-deck",
    objectID: "01HXYZ...",
    revisionID: "01JABC...",
    itemID: null,
  },
  presentations: [
    {
      viewID: "review",
      surface: "inline",
      data: { renderer: "flashcard-deck", title: "Quantum Mechanics", noteCount: 15, cardCount: 23 },
      autoOpen: null,
    },
  ],
}

return {
  title: "Saved flashcard deck",
  output: [
    "Saved flashcard deck Quantum Mechanics.",
    "object_kind=flashcard-deck",
    "object_id=01HXYZ...",
    "revision_id=01JABC...",
    "note_count=15",
    "card_count=23",
  ].join("\n"),
  metadata: {
    buddyObjectResult,
  },
}
```

### OpenCode Processing

1. **Tool Execution** (`tool/tool.ts`): Wraps result, applies output truncation if needed
2. **Tool Result Message** (`session/message.ts`): Converts to ToolResult schema:

```typescript
ToolResult = {
  state: "result",
  toolCallId: "call_abc123",
  toolName: "save_flashcard_deck",
  args: { title: "...", notes: [...] },
  result: "<stringified output>"  // ← The output string
}
```

3. **Message Conversion** (`session/message-v2.ts`): Converts to provider-specific format (OpenAI, Anthropic, etc.)
4. **Sent to LLM**: The tool result is appended to conversation history as a tool result message

### Task Tool Result Wrapping

When the subagent completes, the **task tool** wraps the final response:

```typescript
return {
  title: params.description, // "flashcards about quantum mechanics"
  metadata: {
    sessionId: nextSession.id,
    model: { modelID, providerID }
  },
  output: [
    `task_id: ${nextSession.id} (for resuming...)`,
    "",
    "<task_result>",
    result.parts.findLast((item) => item.type === "text")?.text ?? "",
    "</task_result>",
  ].join("\n"),
}
```

The **text response** from flashcard-author (which saw the `save_flashcard_deck` result) is nested inside `<task_result>` tags.

---

## Complete Data Flow Diagram

```
User: /flashcard quantum mechanics
  ↓
Buddy (primary agent)
  → Expands command template
  → Calls task tool with subagent_type="flashcard-author"
    ↓
OpenCode Task Tool
  → Permission check (task: flashcard-author → allow)
  → Creates child session
  → Delegates to flashcard-author subagent
    ↓
Flashcard-Author Subagent
  → Receives prompt with context
  → Generates flashcard payload
  → Calls save_flashcard_deck tool
    ↓
save_flashcard_deck Tool
  → Permission check (save_flashcard_deck → allow)
  → Generates ULIDs for deck/notes/cards
  → buildFlashcardNotesAndCards()
    - Creates FlashcardNote objects
    - Generates FlashcardCard objects (1 per basic, N per cloze)
  → saveFlashcardDeckObject()
    - Writes revisions/{revisionID}/deck.json and state/deck.json under the object directory
  → Returns buddyObjectResult metadata:
    {
      primaryRef: { kind: "flashcard-deck", objectID, revisionID },
      presentations: [{ viewID: "review", data: ... }]
    }
    ↓
Back to Flashcard-Author
  ← Receives: { title: "Saved flashcard deck", output: "{...}" }
  → Generates confirmation message
    ↓
Back to Task Tool
  ← Wraps in <task_result> tags
    ↓
Back to Buddy
  ← Receives task result
  → Synthesizes final response to user
    ↓
User sees: "I've created 15 flashcards covering quantum mechanics..."
```

---

## Key Architectural Patterns

1. **Permission Cascade**: Each level checks permissions (persona → session → tool)
2. **Metadata Duality**: Results have both `output` (string for LLM) and `metadata.buddyObjectResult` (structured object data)
3. **Session Hierarchy**: Parent session (Buddy) → Child session (flashcard-author)
4. **Tool Isolation**: Subagents have restricted tool access (can't delegate further)
5. **Managed Object Storage**: Deck payloads persist under `.buddy/objects/v1/flashcard-deck/<objectID>/`
6. **Context Wrapping**: Task results are wrapped in XML tags for clear demarcation

---

## Critical Files Reference

| Component | File |
|-----------|------|
| Command definition | `packages/buddy/src/config/opencode/overlay-builder.ts` |
| Subagent definition | `packages/buddy/src/learning/features/flashcards/subagents/flashcard-author.ts` |
| Subagent prompt | `packages/buddy/src/learning/features/flashcards/subagents/flashcard-author.md` |
| Tool definition | `packages/buddy/src/learning/features/flashcards/tools/save-flashcard-deck.ts` |
| Storage logic | `packages/buddy/src/learning/features/flashcards/storage/save-deck.ts` |
| Type definitions | `packages/buddy/src/learning/features/flashcards/types.ts` |
| Tool registration | `packages/buddy/src/learning/tools/tool-registry.ts` |
| Permission resolution | `packages/buddy/src/learning/resolve-capability-profile.ts` |
| Session permissions | `packages/buddy/src/learning/agent-execution/permissions/session-permissions.ts` |
| OpenCode task tool | `vendor/opencode/packages/opencode/src/tool/task.ts` |
| OpenCode tool wrapper | `vendor/opencode/packages/opencode/src/tool/tool.ts` |

---

## Notes

- **Card Count vs Note Count**: Cloze notes can generate multiple cards (one per cloze deletion), so `cardCount ≥ noteCount`
- **ULID Generation**: Object IDs, revision IDs, note IDs, and card IDs use ULIDs for sortable, unique identifiers
- **Filesystem Structure**: Decks are stored under `.buddy/objects/v1/flashcard-deck/<objectID>/`, with immutable payloads in `revisions/` and learner state in `state/`
- **Tool Result Visibility**: The LLM sees the stringified JSON output; structured metadata is available for UI/API consumption
