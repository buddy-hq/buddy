# Ox Alpha Tool-Schema Conformance Results - 2026-08-23

Date: 2026-08-23

Status: live verification complete

Upstream issue:
[anomalyco/opencode#44262](https://github.com/anomalyco/opencode/issues/44262)

Related incident:
[`2026-08-22-x-preview-null-tool-argument.md`](./2026-08-22-x-preview-null-tool-argument.md)

## Purpose

This test run was designed to distinguish among four competing explanations
for the failed `whiteboard_create_view` calls:

1. Buddy defines nullable tool fields incorrectly or prohibits JSON null.
2. OpenCode or the AI SDK converts every JSON null into the string `"null"`.
3. The `opencode/x-preview-f-free` model route mishandles a narrower schema
   construct.
4. Missing central validation in OpenCode is the source of the corruption.

The calls falsified explanations 1, 2, and 4 as the direct cause. The confirmed
failure is narrower and model-route-specific:

> The OpenCode Zen `x-preview-f-free` route returns the string `"null"` when a
> tool field has a nullable-string schema. The same route can return a real
> null for nullable unions whose non-null branch is not a string. The
> `nemotron-3-ultra-free` route returns a real null for the identical
> nullable-string schema.

OpenCode's missing AI SDK-level semantic validator is a separate recovery gap:
it lets schema-invalid, syntactically valid calls reach each tool's execution
validator instead of invoking the existing repair hook. It did not create the
string value, and the tested Buddy and built-in tools still rejected invalid
values at execution.

## Test Method

- Buddy session creation, prompting, status checks, and aborts used the
  generated typed `BuddyClient` against the running local Buddy API.
- Every Buddy case used `opencode/x-preview-f-free`, a fresh session, and one
  requested tool call. Prompts asked the model to preserve the supplied JSON
  types and not retry or correct the arguments.
- Stored tool inputs and results were read from Buddy's local OpenCode session
  database after each call.
- Provider-boundary controls called OpenCode Zen's OpenAI-compatible
  `/chat/completions` endpoint directly with its public, keyless access path.
- The raw Zen response was inspected before Buddy, OpenCode's tool execution
  layer, or AI SDK validation could affect it.

The local fixture read by the `read` tests was:

`/Users/prashantbhudwal/Documents/Buddy/tool-schema-conformance-2026-08-23/probe.txt`

## Buddy API Test Matrix

| ID | Discriminator | Requested argument condition | Observed stored call/result | Conclusion |
| --- | --- | --- | --- | --- |
| TC01 | Nullable string, real null | `whiteboard_create_view.objectID: null` | Stored as `objectID: "null"`; Buddy Zod validation rejected it | Reproduces the incident |
| TC02 | Literal-string control | `objectID: "null"` | Remained a string; Buddy rejected it | Confirms TC01 is indistinguishable from an explicitly requested string by execution time |
| TC03 | Missing required field | Omit `objectID` | Field remained absent; Buddy rejected `undefined` | Syntactically valid semantic violations reach execution validation |
| TC04 | Invalid enum plus null | Invalid `boardAction`; `objectID: null` | Route corrected the enum but changed null to `"null"`; Buddy rejected `objectID` | Shows schema-directed normalization, not general pass-through |
| TC05 | Wrong scalar plus null | `elements: []`; `objectID: null` | Route changed the array to string `"[]"` but changed null to `"null"` | Again isolates nullable-string handling |
| TC06 | Extra-property stress | Valid base object plus an extra property | Route emitted an approximately 103 KB malformed repeated argument stream; JSON parsing failed and OpenCode routed it to `invalid` | Syntax failures do invoke OpenCode's repair path; this also exposes a separate streaming/argument corruption symptom |
| TC07 | Cross-tool nullable strings | `bench_present` close with four real nulls | `path`, `resourceKey`, `objectID`, and `tabKey` were all stored as `"null"`; Buddy rejected them | Proves the issue is not whiteboard-specific |
| TC08 | Mixed real/string null control | One `"null"` string and three real nulls in `bench_present` | All four became strings; Buddy rejected them | Confirms every nullable-string field on that call is affected |
| TC09 | Valid numeric control | `read` with `offset: 1`, `limit: 1` | Stored as numbers; tool completed | Normal scalar tool arguments work |
| TC10 | Numeric-string coercion probe | `offset: "1"`, `limit: "1"` | Route normalized both to numbers; tool completed | Route actively follows numeric schema guidance |
| TC11 | Missing string probe | Omit `read.filePath` | Route supplied `filePath: ""`; tool read the directory | Route synthesizes an empty string for a missing required string |
| TC12 | Numeric constraint probe | `read.offset: -1` | Stored as `-1`; built-in Effect Schema rejected it at execution | Built-in tools have authoritative execution validation even though AI SDK-level semantic repair was bypassed |

### Buddy session evidence

| ID | Session ID |
| --- | --- |
| TC01 | `ses_fd4864248ffeorWyxtIPbhB1vF` |
| TC02 | `ses_fd485fcedffeMW3pdEBUXbjaN8` |
| TC03 | `ses_fd485a5d2ffew7afqvinYZq1Mn` |
| TC04 | `ses_fd48552c7ffefF5firt1puQXxJ` |
| TC05 | `ses_fd4850791ffe4lbFidvq7Zm0br` |
| TC06 | `ses_fd484b3efffewZ8O950eBQ5fYY` |
| TC07 | `ses_fd48108f0ffe42hDjWmrW4XlqW` |
| TC08 | `ses_fd480b9bcffeXDWlA3BMm0cqiv` |
| TC09 | `ses_fd47e7544ffevZOSoAZMww5cKn` |
| TC10 | `ses_fd47e35d6ffeiX0wc7cUhaiQzZ` |
| TC11 | `ses_fd47d3541ffeGVwTL0MNl1Fw6l` |
| TC12 | `ses_fd47cfdb5ffeQdPVp04WRSHdoP` |

TC06 was aborted after the malformed call had been persisted because the next
model step hung. TC08 was also aborted after the conclusive tool failure when
its next model step hung. No test session was deleted.

## Direct OpenCode Zen API Matrix

The direct calls used a forced tool call containing a field named
`nullableValue`. These results are the decisive boundary evidence because the
returned `tool_calls[].function.arguments` string is the raw Zen response.

| Route/schema | Observed raw argument value | Result |
| --- | --- | --- |
| Ox Alpha, `type: ["string", "null"]` | `"nullableValue":"null"` | Fails schema conformance |
| Ox Alpha, same schema with `strict: true` | `"nullableValue":"null"` | `strict` does not fix or is not enforced by this route |
| Nemotron, identical nullable-string schema | `"nullableValue":null` | Cross-model control passes |
| Ox Alpha, `anyOf: [string, null]` | `"nullableValue":"null"` | Alternate JSON Schema spelling does not fix it |
| Ox Alpha, OpenAPI-style `type: string, nullable: true` | `"nullableValue":"null"` | Alternate dialect does not fix it |
| Ox Alpha, reversed `type: ["null", "string"]` | `"nullableValue":"null"` | Union order does not fix it |
| Ox Alpha, reversed `anyOf` or `oneOf` | `"nullableValue":"null"` | Union keyword/order does not fix it |
| Ox Alpha, null-only `type: "null"` | `"nullableValue":null` | Ox Alpha can emit real JSON null |
| Ox Alpha, `string \| null`, requested `"abc123"` | `"nullableValue":"abc123"` | A non-null string survives the same union |
| Ox Alpha, `null \| integer` | `"nullableValue":null` | Passes |
| Ox Alpha, `null \| boolean` | `"nullableValue":null` | Passes |
| Ox Alpha, `null \| number` | `"nullableValue":null` | Passes |
| Ox Alpha, `null \| object` | `"nullableValue":null` | Passes |
| Ox Alpha, `null \| array` | `"nullableValue":null` | Passes |

These controls prove that neither JSON null nor JSON Schema unions are globally
broken. The failure is specific to a union of null and string on the Ox Alpha
route.

### Compatibility-lowering probe

A follow-up probe tested a reversible provider-dialect representation:

```text
logical schema: required string | null
provider schema: optional string
provider output: omitted field -> decode omission back to null
```

With an optional-string schema, Ox Alpha returned `{}` for two independently
worded no-value prompts. With the same schema and a real value, it returned
`{"nullableValue":"abc123"}`. This establishes a viable client fallback for
nullable-string object properties without changing individual Buddy tools.

### SGLang MiniMax comparison

[SGLang issue #16057](https://github.com/sgl-project/sglang/issues/16057)
documents a real MiniMax M2/M2.1 nullable-union parser bug, but its behavior is
the inverse of this incident. In that issue, MiniMax generated the string
`"hi"` and SGLang changed it to JSON null because the schema allowed null. The
current SGLang MiniMax parser still returns null whenever `"null"` is present in
the normalized type list. [vLLM PR
#32342](https://github.com/vllm-project/vllm/pull/32342) removed the equivalent
condition from its parser.

Ox Alpha preserves `"abc123"` under `string | null`. When asked for null, it
returns the string `"null"`. The current SGLang MiniMax parser would instead
turn that text into JSON null. SGLang #16057 therefore does not explain the Zen
response. OpenCode's public model data also lists Ox Alpha's author as unknown,
separately from MiniMax models.

## Failure Boundary

The demonstrated flow is:

```text
valid Buddy Zod schema
  -> valid generated JSON Schema with string-or-null
  -> OpenCode Zen / Ox Alpha route returns the JSON string "null"
  -> AI SDK parses and preserves that string correctly
  -> OpenCode has no AI SDK-level semantic validator, so repair is not invoked
  -> Buddy's authoritative Zod validator rejects the string at execution
```

The raw call proves that the corruption occurs before AI SDK parsing and Buddy
execution. It does not distinguish whether the defect is inside the Ox Alpha
model or Zen's model-specific tool-call codec; that requires Zen-side
telemetry. It does distinguish the affected route from the rest of Buddy and
from the shared OpenCode provider path.

## Scope

The issue affects every required nullable-string parameter exposed to this
route, not just `whiteboard_create_view.objectID`. TC07 demonstrated four such
fields in `bench_present`. Other tools using nullable paths, object IDs,
resource keys, or tab keys have the same exposure.

The evidence does not support globally replacing every string `"null"` with
JSON null. `"null"` can be a legitimate string, and TC02 shows that the
execution layer cannot infer the model's intent from the value alone.

## Systemic Fix

1. Fix the Ox Alpha route's nullable-string tool-call codec in OpenCode Zen.
   That is the permanent source fix. Disabling tools is only emergency
   containment if a safe codec cannot be deployed immediately.
2. Track the raw keyless reproduction in
   [anomalyco/opencode#44262](https://github.com/anomalyco/opencode/issues/44262).
   Zen owns the failing endpoint and OpenCode advertises the route as
   tool-capable.
3. Until the server is fixed, add a bidirectional provider-dialect codec in the
   shared OpenCode compatibility layer: lower required nullable-string object
   properties to optional strings, record their schema paths, and decode
   omitted properties back to null before authoritative validation. The live
   compatibility probe verifies both the null and real-string paths.
4. Drive that codec from a qualified model capability/quirk flag rather than
   tool names. OpenCode already applies provider/model schema transforms for
   OpenAI, Gemini, and Moonshot/Kimi; this belongs at the same abstraction.
5. Add provider/model qualification probes for nullable strings, not merely a
   coarse `tool_call: true` catalog flag. Run the same probes whenever a model
   route or provider adapter changes.
6. Add one central, schema-aware repair boundary rather than per-tool adapters.
   After the authoritative validator rejects an input, construct one candidate
   that converts the exact string `"null"` only at schema paths permitting both
   string and null. Retry only when the original fails and the candidate passes
   the tool's full authoritative validator. This preserves a legitimate
   `"null"` string whenever it is already valid.
7. Expose Buddy's Zod validator and built-in tools' Effect Schema validator at
   that shared boundary. Validating only the provider-facing JSON Schema can
   miss Zod refinements and cross-field constraints.
8. Also attach semantic validation to OpenCode's AI SDK tool wrappers so bad
   calls fail earlier and enter bounded repair. This improves recovery, but it
   is not by itself a fix for the provider's corruption.
9. Record redacted raw argument types and the post-parse types at the provider
   boundary. This makes future route regressions attributable without logging
   sensitive tool payloads.

The central repair is only a safe fallback for rejected inputs. It cannot fully
mask the route defect: if a tool legitimately accepts any string, both
`"null"` and null satisfy the advertised union and no client-side layer can
infer which value the model intended. Upstream conformance or capability
lowering is therefore mandatory; post-validation repair must not become a
permanent model-name adapter.

## Acceptance Tests For A Fix

- Ox Alpha returns actual JSON null for all supported spellings of a
  nullable-string schema.
- Nemotron and other conformant routes continue to pass the same probes.
- A deliberately literal string `"null"` remains a string when it is valid.
- The central repair changes only rejected inputs and only when the repaired
  candidate passes the complete tool validator.
- `bench_present` cross-field refinements and Buddy object-ID refinements are
  enforced during repair.
- Missing required fields, invalid enums, negative constrained numbers,
  unexpected properties, and malformed JSON produce bounded typed failures;
  none reaches mutation code unvalidated.
- A route that fails qualification must use a verified compatibility codec;
  disabling tools remains a last-resort containment action.
