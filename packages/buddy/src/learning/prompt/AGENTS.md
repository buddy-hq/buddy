# Agents.md

## Prompt Pipeline and Stacking
```txt
system ─ persona (agent prompt)
system ─ environment info
system ─ skills prompt
system ─ AGENTS.md instructions
system ─ <buddy_runtime_context>
msg    ─ chronological prior conversation turns (user/assistant alternating)
───────
msg    ─ <system-reminder> turn prelude (synthetic)
msg    ─ current user message content (text, file refs, etc.)
```

`<system-reminder>` may include any combination of:
- `<reading_turn_context>...</reading_turn_context>` when reading context is active and changed (bootstrap/delta)
- `<reading_ctx_ref same="..."/>` when reading context is active and unchanged
- `<teaching_turn_context>...</teaching_turn_context>` when teaching context is active and changed (bootstrap/delta)
- `<teaching_ctx_ref same="..."/>` when teaching context is active and unchanged
- Learner context blocks (`<learner_context ...>` / `<learner_context_delta ...>`) and instruction line
- Transition/checkpoint reminder lines

| Who controls | Part |
|---|---|
| **Buddy** | persona selection (agent ID, features, tools, skills) |
| OpenCode | environment info (model, date, cwd) |
| OpenCode | skills prompt |
| OpenCode | AGENTS.md instruction files |
| **Buddy** | `<buddy_runtime_context>` |
| — | conversation history (previous user/assistant turns) |
| **Buddy** | `<system-reminder>` turn-time context + reminders |
| — | current user message content |


## Respect Prompt Caching

- Persona, Runtime Context should not contain Frequently Changing Information.  
  - FCI: information that has high probability of changing frequently.
    - FCI-1: changes in less than 5 minutes.
    - FCI-2: changes in less than 10 mins.
    - FCI-3: changes in less than 20 mins.
  - Never put FCI-1 in the runtime context.
    - Two supported handling patterns:
      - Turn Prelude: all frequently changing state goes into prelude.
      - Hybrid:
        - Runtime Context: stable pointer/metadata only; optionally FCI-3 if explicitly accepted.
          - Eg: user has X resources in workspace.
        - Turn Prelude: real changing state.
          - Eg: user is at Y location within a specific resource, resource text, etc.
    - Preludes usually follow `change-only delivery`.
      - Current implementation: full block on bootstrap/change + concise unchanged refs.
  - For FCI 2/3, present the findings to the user and ask for a design decision.
   
### 1. What prompt caching is

Prompt caching is an API optimization that reuses previously processed **input prompt prefixes** so repeated long prompts can be served with lower latency and lower input-token cost.It does **not** cache or replay the model’s final answer. The output is still generated fresh for each request.

The system checks whether the beginning of a new prompt matches content it has already processed and still has available in cache. If it matches, it can reuse the cached computation for that shared prefix and only process the new or changed part of the request.

Prompt caching is especially useful when many requests share the same instructions, examples, tools, schemas, documents, or conversation history.

The result is lower repeated-input cost and often lower latency.

### 2. What prompt caching is not

Prompt caching is **not response caching**.It does not store and return a previous answer. The cached part is the prompt/input computation, not the generated output.It is also not semantic matching. A cache hit usually depends on the prompt prefix being identical or near-identical according to the provider’s caching rules. Similar meaning is not enough if the actual prompt text changes.


### 3. Typical flow:

1. A request is sent with a long prompt.
2. The system checks whether the beginning of that prompt matches a cached prefix.
3. If a match exists, the cached prefix is reused.
4. If no match exists, the full prompt is processed.
5. The reusable prefix may then be stored for future requests.

### 4. Basic mental model

A request usually has two practical regions:

```txt
Stable prefix:
- system instructions
- tool definitions
- examples
- reusable context
- documents
- schemas

Changing suffix:
- latest user message
- request-specific data
- fresh retrieval results
- temporary values
```


The shared rule:

```txt
Put stable content first.
Put changing content last.
Keep the stable prefix identical across requests.
```
