# Ox Alpha Nullable-String Tool-Call Failure - 2026-08-22

Date: 2026-08-22 UTC

Status: root cause boundary confirmed; Buddy-side portable contract mitigation implemented 2026-08-23; upstream route defect remains open

Upstream issue:
[anomalyco/opencode#44262](https://github.com/anomalyco/opencode/issues/44262)

Severity: medium — one advertised tool-capable model route cannot reliably call
tools with nullable-string parameters; no data loss or corruption was observed

## Issue

`x-preview-f-free` did not deliver a JSON `null` for the then-required nullable
`whiteboard_create_view.objectID` argument. It repeatedly delivered the string
`"null"` or omitted the required field:

```json
{"objectID":"null"}
```

At the time of the incident, Buddy required a real JSON null when creating a whiteboard:

```json
{"objectID":null}
```

The string failed Buddy's object-ID validation because it is not a valid
26-character Buddy object ID. Omitting the field failed because `objectID` was
required by the incident-time tool contract. The current portable contract uses
`objectAction: "create"` with an omitted `objectID`, or
`objectAction: "update"` with a concrete `objectID`.

This behavior was persistent for `x-preview-f-free` across two sessions. Other
models using the same Buddy tool and OpenCode runtime successfully emitted a
real JSON null.

Live conformance calls on 2026-08-23 isolated the fault further. A raw request
to the OpenCode Zen endpoint returned `"nullableValue":"null"` for Ox Alpha
with a `string | null` schema. The identical request to Nemotron returned
`"nullableValue":null`. Ox Alpha returned real null for `null | integer`,
`null | boolean`, `null | number`, `null | object`, `null | array`, and a
null-only schema. The confirmed defect is therefore the Ox Alpha route's
handling of nullable-string tool fields, not JSON null generally and not
Buddy's schema definition.

OpenCode also lacks an AI SDK-level semantic validator on its tool wrappers.
That is a contributing recovery gap: syntactically valid schema violations
bypass OpenCode's repair hook and reach each tool's execution validator. It did
not create the string value. The tested Buddy and built-in tools both rejected
invalid values before their mutation or read logic ran.

Full test matrix:
[`2026-08-23-tool-schema-conformance-results.md`](./2026-08-23-tool-schema-conformance-results.md)

## User-Visible Impact

- The requested Bhagavad Gita argument-map whiteboard was not created.
- A simple greeting whiteboard also could not be created with
  `x-preview-f-free`.
- The model repeated an argument it had already been told was invalid.
- The model then expanded the failed Gita turn into a 41-step investigation of
  downstream Buddy and OpenCode code.
- The model returned an incorrect incident analysis that blamed a global
  serving-harness limitation.

No evidence showed data loss, database corruption, credential exposure, or a
failure in an already-created whiteboard.

## Incident Identifiers

Primary affected session:

- Session ID: `ses_fd5226ea3ffeIXM1MzibaMopa0`
- Title: `Bhagavad Gita on action (karma)`
- Model: `opencode/x-preview-f-free`
- Failure: three rejected `whiteboard_create_view` calls

Minimal reproduction with the same model:

- Session ID: `ses_fd512baa1ffemThRUfcjnVBFcv`
- Title: `Greeting on whiteboard`
- Model: `opencode/x-preview-f-free`
- Failure: three rejected `whiteboard_create_view` calls

Successful recovery comparison:

- Session ID: `ses_fd511b69bffe6C9wX5NUASxN5u`
- Title: `Greeting on the whiteboard`
- Model: `opencode/nemotron-3-ultra-free`
- Outcome: two failed calls followed by a successful call with JSON `null`

Evidence was read from:

- `/Users/prashantbhudwal/.local/share/buddy/opencode/opencode.db`
- `/Users/prashantbhudwal/.local/share/buddy/opencode/log/opencode.log`

The production database and log were inspected read-only.

## Confirmed Call Sequences

### `x-preview-f-free`: Bhagavad Gita session

| Attempt | Stored `objectID` | Stored JSON type | Result |
| --- | --- | --- | --- |
| 1 | `"null"` | string | Rejected by Buddy object-ID regex |
| 2 | absent | absent | Rejected because `objectID` is required |
| 3 | `"null"` | string | Rejected by Buddy object-ID regex |

The model's reasoning recognized the required correction but its following tool
call did not implement it. For example, it reasoned that the value must be
JSON null and then produced another stored string value.

### `x-preview-f-free`: greeting reproduction

| Attempt | Stored `objectID` | Stored JSON type | Result |
| --- | --- | --- | --- |
| 1 | `"null"` | string | Rejected by Buddy object-ID regex |
| 2 | `"null"` | string | Rejected by Buddy object-ID regex |
| 3 | absent | absent | Rejected because `objectID` is required |

This smaller session reproduced the same behavior without the large Gita
whiteboard payload.

### `nemotron-3-ultra-free`: successful recovery comparison

| Attempt | Stored `objectID` | Result |
| --- | --- | --- |
| 1 | JSON `null` | Rejected because the drawing program contained no valid drawable elements |
| 2 | `"none"` | Rejected by Buddy object-ID regex |
| 3 | JSON `null` | Completed and created the whiteboard |

The first Nemotron failure was not a null-serialization failure. It sent a real
JSON null, but its initial drawing program was invalid. After a second,
model-generated sentinel mistake, it interpreted the validation feedback and
successfully emitted a real JSON null.

## Cross-Model Evidence

Historical `whiteboard_create_view` calls in the same local Buddy database show:

| Model | Provider | Real JSON null observed | Creation succeeded | Persistent `"null"` string failure |
| --- | --- | --- | --- | --- |
| `gpt-5.6-luna` | `openai` | Yes | Yes | No |
| `deepseek-v4-flash-free` | `opencode` | Yes | Yes | No |
| `nemotron-3-ultra-free` | `opencode` | Yes | Yes | No |
| `x-preview-f-free` | `opencode` | No | No | Yes |

The DeepSeek and Nemotron results are especially important because they use the
same `opencode` provider path as `x-preview-f-free`. The runtime log also
records the AI SDK runtime for these calls. A global Buddy, OpenCode, or
`opencode`-provider inability to represent null would have prevented these
successful calls as well.

The available evidence only covers models exercised by the recorded
whiteboard calls. It does not prove that every untested model is conformant.

## Root Cause

### Confirmed fault boundary: OpenCode Zen / Ox Alpha route

The raw Zen response contains the wrong JSON type before it reaches the AI SDK
or Buddy:

```text
valid schema containing type: ["string", "null"]
  -> OpenCode Zen / Ox Alpha returns the JSON string "null"
  -> the AI SDK parses and preserves that string
  -> Buddy receives a string and rejects it
```

The same direct request to `nemotron-3-ultra-free` returned an actual JSON
null. This rules out a provider-wide OpenCode Zen inability to transport null.

Further direct controls showed that Ox Alpha can emit real null for null-only
schemas and nullable unions with integer, number, boolean, object, or array.
It returns `"null"` for every tested spelling of a nullable-string schema:
`type: ["string", "null"]`, reversed type order, `anyOf`, `oneOf`, and
OpenAPI-style `nullable: true`. Setting `strict: true` produced the same wrong
type. The fault is specifically nullable-string tool arguments on this model
route.

The client-side evidence cannot separate two implementations behind the same
server boundary:

1. the Ox Alpha model generates the string; or
2. Zen's Ox Alpha-specific tool-call codec converts a null to a string.

Zen-side telemetry is required for that final attribution. It does not affect
the product decision: this model route does not conform to the tool capability
it advertises.

### Contributing recovery gap: late semantic validation

OpenCode converts registered tools into AI SDK tools in
`vendor/opencode/packages/opencode/src/session/tools.ts` using:

```ts
inputSchema: jsonSchema(schema)
```

It does not pass the raw JSON Schema helper a validation callback. Therefore a
syntactically valid argument object does not receive semantic validation at
the AI SDK boundary, and OpenCode's `experimental_repairToolCall` hook is not
invoked for values such as `"null"` or `offset: -1`.

This is not the source of the corruption and it is not evidence that all tools
execute unchecked. Live tests showed both validation layers working later:

- `createBuddyTool` rejected bad inputs with its authoritative Zod schema.
- OpenCode's built-in `read` tool rejected `offset: -1` with its Effect Schema.
- malformed JSON was caught during parsing and routed to OpenCode's `invalid`
  tool through the repair hook.

The gap makes recovery later and weaker: semantic failures appear as execution
errors rather than typed invalid-tool calls eligible for bounded repair. Buddy
tools also expose `Schema.Unknown` to the OpenCode registry and retain their
full Zod validation inside `runBuddyTool`, so a central solution must preserve
Zod refinements and cross-field rules rather than validating only the
provider-facing JSON Schema.

### Why only some models fail

The behavior depends on the selected model route. GPT, DeepSeek, and Nemotron
have produced real JSON nulls with the same runtime. The direct Nemotron control
passed the identical nullable-string schema that Ox Alpha failed. This is why
the incident occurs with only a few models even though all of them receive the
same Buddy tool definition.

## Contributing Recovery Failure

The primary incident was compounded by weak model reasoning after validation
failed.

`x-preview-f-free` correctly stated that the value needed to be JSON null, but
did not verify the type of its next emitted call. It then changed strategies by
omitting a required field, interpreted the resulting validation error as a
schema contradiction, and investigated downstream code instead of testing the
model-specific hypothesis.

The model ultimately claimed that the serving harness serializes every tool
parameter as a string. That conclusion was unsupported and is disproven by the
real JSON nulls stored for GPT, DeepSeek, and Nemotron calls.

This is separate from the initial data-plane conformance failure:

- conformance failure: the model route did not deliver the required JSON type;
- recovery failure: the model repeated the invalid value and generalized its
  own failure into an incorrect platform-wide diagnosis.

## Additional Observed Failure

Before the Gita whiteboard calls, one `x-preview-f-free` assistant step ended
with `finish=unknown`, zero recorded token usage, reasoning content, and no
tool call or final answer. The learner had to send `continue` before the model
attempted the whiteboard.

This incomplete step is another model-route symptom, but the available evidence
does not establish that it shares the nullable-argument root cause. It should be
tracked separately unless provider-boundary telemetry links the two.

## What Is Not the Root Cause

### JSON null or Buddy's tool schemas

At the time of the incident, `CreateWhiteboardViewInputSchema` declared:

```ts
objectID: BuddyObjectIDSchema.nullable()
```

The incident-time schema correctly accepted a valid Buddy object ID or JSON
null. The portable mitigation now uses omission plus an explicit action
discriminator, while the runtime still validates the complete action-specific
contract before execution.

JSON null is a standard JSON Schema type. Required nullable fields are also the
documented representation for optional values in strict OpenAI function
schemas. The incident mitigation intentionally targets the mixed-provider,
non-strict surface instead: model-facing inactive fields are omitted, then
normalized only after validation for downstream APIs. The same mitigation was
applied to `bench_present` and `present_html_widget`.

### AI SDK parsing

The OpenAI-compatible AI SDK provider forwards the raw
`tool_calls[].function.arguments` string, and AI SDK's JSON parser preserves
JSON types. It does not convert JSON null into `"null"`. AI SDK also documents
that raw JSON Schemas require a validation function when callers want local
validation. OpenCode's missing callback explains why semantic repair is
bypassed; it does not explain why the raw Zen response already contains the
wrong type.

### The whiteboard drawing payload size

The minimal greeting session reproduced the same `objectID` failure with a
small drawing program. The large Gita drawing payload was not required to
trigger the incident.

## Recommended Actions

1. Track [anomalyco/opencode#44262](https://github.com/anomalyco/opencode/issues/44262),
   which contains the raw keyless Zen reproduction and the identical passing
   Nemotron control. The wrong type is already present in Zen's response, so
   OpenCode owns the actionable server boundary even though only Zen-side
   telemetry can distinguish the model from its per-model codec.
2. Fix nullable-string serialization in the OpenCode Zen / Ox Alpha route.
   Disabling tools is emergency containment, not the systemic fix.
3. Until that lands, add a reversible provider-dialect codec in OpenCode's
   shared compatibility layer. For the affected capability, lower required
   nullable-string object properties to optional strings and decode omission
   back to null before authoritative validation. Live direct calls confirmed
   Ox Alpha returns `{}` for no value and preserves a real string with this
   representation.
4. Select the codec through a qualified model capability/quirk flag, not Buddy
   tool names. OpenCode already uses provider/model-specific schema transforms;
   this is the same class of compatibility work.
5. Add provider/model conformance qualification beyond the coarse
   `tool_call: true` catalog flag. Required nullable strings must be an explicit
   probe because null-only and other nullable unions pass on this route.
6. Add one central schema-aware compatibility repair, not per-tool patches.
   After authoritative validation fails, convert the exact string `"null"`
   only at nullable-string schema paths and accept the candidate only if the
   tool's complete validator passes it. Never globally replace all `"null"`
   strings. This cannot fix ambiguous fields where both values are valid, so
   it is a safety fallback rather than a substitute for route conformance.
7. Make Buddy's Zod validator and built-in tools' Effect Schema available at
   that shared boundary. The final decision must include refinements and
   cross-field constraints, not only the projected JSON Schema.
8. Also pass semantic validation into every AI SDK tool wrapper so invalid
   inputs become typed failures before execution and can enter bounded repair.
   Treat this as recovery hardening, not as the cause of the provider defect.
9. Treat `strict` as a tested provider capability. The direct Ox Alpha call
   still failed with `strict: true`, so setting it is not a sufficient fix.
10. Capture redacted raw `tool_calls[].function.arguments` and post-parse type
   telemetry at the provider boundary. This will separate model generation
   from model-specific server codec defects.
11. Add a recovery guard for identical consecutive invalid calls and track the
   unrelated `finish=unknown` symptom independently.

## Resolution Criteria

This incident can be considered resolved when:

- `x-preview-f-free`, or its replacement route, returns actual JSON null for a
  nullable-string tool field before it is advertised as tool-capable;
- every tool invocation is checked by its authoritative validator before
  mutation or external action;
- schema-invalid calls trigger bounded, validator-confirmed repair or a typed
  terminal failure;
- conformance tests cover nullable strings separately from null-only and other
  nullable unions, plus missing, scalar, enum, array, and nested failures;
- literal valid strings equal to `"null"` are never silently rewritten; and
- provider telemetry can identify whether malformed argument types originate
  in the model output or the serving adapter.

## References

- JSON Schema null type:
  <https://json-schema.org/understanding-json-schema/reference/null>
- OpenAI function-calling strict mode and nullable required fields:
  <https://developers.openai.com/api/docs/guides/function-calling>
- AI SDK raw JSON Schema validation API:
  <https://ai-sdk.dev/docs/reference/ai-sdk-core/json-schema>
- AI SDK tool validation, strict mode, errors, and repair:
  <https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling>
