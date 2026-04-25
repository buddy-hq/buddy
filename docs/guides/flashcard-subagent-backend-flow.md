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

**File:** `packages/buddy/src/learning/capabilities/flashcard/tools/save-flashcard-deck.ts`

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

    // 2. Generate IDs
    const deckID = ulid()
    const createdAt = new Date().toISOString()

    // 3. Build notes and cards
    const { notes, cards } = FlashcardService.buildNotesAndCards(
      deckID,
      parsed.notes,
      DECK_CONFIG_DEFAULTS,
    )

    // 4. Save to filesystem
    const saved = await FlashcardService.save({
      directory: ctx.directory,
      deck: { deckID, title, notes, cards, ... }
    })

    // 5. Return result
    return {
      title: "Saved flashcard deck",
      output: JSON.stringify(output, null, 2),
      metadata: {
        artifact: "SaveFlashcardDeckOutput",
        value: output, // ← Structured metadata
      },
    }
  },
})
```

### Service Layer

**File:** `packages/buddy/src/learning/capabilities/flashcard/service.ts`

#### Card Generation Logic

```typescript
function buildNotesAndCards(deckID, inputs, config) {
  for (const input of inputs) {
    const noteID = ulid()
    const note = { noteID, deckID, type, fields, tags }
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
  const deckPath = FlashcardPath.deckFile(directory, deck.deckID)
  // Saves to: {directory}/.buddy/flashcard-decks/{deckID}/deck.json
  await fs.writeFile(deckPath, JSON.stringify(deck, null, 2))
  return parsed
}
```

---

## Result Flow Back to LLM

### Tool Execute Result Format

**File:** `vendor/opencode/packages/opencode/src/tool/tool.ts`

```typescript
interface ExecuteResult<M extends Metadata = Metadata> {
  title: string          // "Saved flashcard deck"
  metadata: M            // { artifact: "SaveFlashcardDeckOutput", value: {...} }
  output: string         // JSON stringified output
  attachments?: [...]    // Optional file attachments
}
```

### Exact Data Returned to LLM

From `save-flashcard-deck.ts`:

```typescript
const output: SaveFlashcardDeckOutput = {
  deckID: "01HXYZ...",           // ULID
  kind: "flashcard-deck.v1",     // Deck type constant
  title: "Quantum Mechanics",    // User-provided title
  noteCount: 15,                 // Number of notes
  cardCount: 23,                 // Number of review cards (≥ noteCount for cloze)
  deckUrl: "/api/flashcard-decks/01HXYZ...?directory=..."
}

return {
  title: "Saved flashcard deck",
  output: JSON.stringify(output, null, 2), // ← Formatted JSON string
  metadata: {
    artifact: "SaveFlashcardDeckOutput",
    value: output,  // ← Structured object in metadata
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
  → FlashcardService.buildNotesAndCards()
    - Creates FlashcardNote objects
    - Generates FlashcardCard objects (1 per basic, N per cloze)
  → FlashcardService.save()
    - Writes to .buddy/flashcard-decks/{deckID}/deck.json
  → Returns SaveFlashcardDeckOutput:
    {
      deckID, kind, title, noteCount, cardCount, deckUrl
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
2. **Metadata Duality**: Results have both `output` (string for LLM) and `metadata.value` (structured data)
3. **Session Hierarchy**: Parent session (Buddy) → Child session (flashcard-author)
4. **Tool Isolation**: Subagents have restricted tool access (can't delegate further)
5. **Filesystem Artifacts**: Decks persist to `.buddy/flashcard-decks/{deckID}/` for UI consumption
6. **Context Wrapping**: Task results are wrapped in XML tags for clear demarcation

---

## Critical Files Reference

| Component | File |
|-----------|------|
| Command definition | `packages/buddy/src/config/opencode/overlay-builder.ts` |
| Subagent definition | `packages/buddy/src/learning/flashcard-author/agent.ts` |
| Subagent prompt | `packages/buddy/src/learning/flashcard-author/prompt.p.md` |
| Tool definition | `packages/buddy/src/learning/capabilities/flashcard/tools/save-flashcard-deck.ts` |
| Service logic | `packages/buddy/src/learning/capabilities/flashcard/service.ts` |
| Type definitions | `packages/buddy/src/learning/capabilities/flashcard/types.ts` |
| Tool registration | `packages/buddy/src/learning/tools/tool-registry.ts` |
| Permission resolution | `packages/buddy/src/learning/resolve-capability-profile.ts` |
| Session permissions | `packages/buddy/src/learning/agent-execution/permissions/session-permissions.ts` |
| OpenCode task tool | `vendor/opencode/packages/opencode/src/tool/task.ts` |
| OpenCode tool wrapper | `vendor/opencode/packages/opencode/src/tool/tool.ts` |

---

## Notes

- **Card Count vs Note Count**: Cloze notes can generate multiple cards (one per cloze deletion), so `cardCount ≥ noteCount`
- **ULID Generation**: All IDs (deckID, noteID, cardID) use ULIDs for sortable, unique identifiers
- **Filesystem Structure**: Decks are stored in `.buddy/flashcard-decks/{deckID}/deck.json`
- **Tool Result Visibility**: The LLM sees the stringified JSON output; structured metadata is available for UI/API consumption
