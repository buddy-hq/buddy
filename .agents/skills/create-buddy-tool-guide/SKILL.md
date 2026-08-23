---
name: create-buddy-tool-guide
description: Use when creating a new Buddy tool from scratch or refactoring old Buddy tool's schemas, prompts and descriptions.
---
# Create Buddy Tool Guide

Models like you are very bad at tool authoring, so you must not create schemas and prompts without referring and reading the relevant documents inside this guide. Also, parameters usually have describe blocks. Make sure that you always add those describe blocks wherever they are relevant. The tools inside the current repository may or may not be the optimum tools for references in terms of schema design, prompts, and descriptions, so you must always refer and read the relevant links from this guide before writing a tool's schema, writing a tool's description, writing a tool's prompt. Everything else can be buddy managed, but these three things are very important to make ANY tool system work. 

You must think about who Buddy is for, what the tool name should be when facing the model, what tool parameters name should be when they are facing the model. If the tool parameters are complicated, how to enhance them with describe blocks. And if user is asking for something that you think you don't agree with in terms of these heuristics, then you must tell the user about what you learned from the documentation. 

Before writing any new tool, you must always read the internal wiring of CreateBuddyTool API and then start writing the tool. Even though the API is pretty obvious, you must take no risks while creating a new tool. 

This skill only has information about OpenAI and Anthropic tool use and function calling use, but the core principles remain same across all tools, and we are anyway not handling how tool calling happens internally, that is managed by the vendor. So all we need to care about is how we structure these tools, and that is why you should read the links. Also consider these links as starting points, not the end constraints. If you want more links or you need more information, you are free to research, but only through two official sources and nothing else. 

## Invariant

An invariant of after triggering this skill is if you are refactoring a tool or writing a schema or writing a tool prompt, you must do research from the links given below before moving on. The whole point of this skill is that. 

## Portable optional parameters

JSON `null` and nullable unions are valid schema constructs. Do not add a global ban on nullable parameters and do not assume every provider mishandles them. OpenAI strict function tools require every property to be listed in `required`; their documented way to express an optional value is a nullable type. If Buddy actually enables strict mode for a route, follow that provider contract and qualify the exact schema against every supported route.

Buddy also runs tools through mixed-provider routes where strict mode is not the active contract. On that portable, non-strict surface, do not make an inactive string field required only so the model can send `null`. Prefer these rules:

* Give multi-mode tools an explicit, well-named action discriminator.
* Make action-specific string, path, id, and enum fields optional but non-nullable in the model-facing schema.
* Tell the model to omit fields owned by other actions. Examples must omit inactive fields instead of filling them with `null`.
* Add cross-field validation that requires the active action's fields and rejects fields owned by inactive actions.
* Run this validation before permissions, reads, writes, metadata updates, background work, or UI dispatch.
* Do not use `normalizeInput` to turn omitted fields back into `null` before schema validation. Normalize to an internal representation only after the portable input contract has validated, and only when a downstream non-model API needs it.
* Never coerce the string `"null"` to JSON `null`. A literal string may be valid user data, and transport repair would hide an upstream conformance bug.

For create-versus-update tools, omission alone must not choose a destructive or identity-changing operation. Add an explicit create/update discriminator, require the stable id for update, forbid it for create, and test both invalid combinations. This prevents a missing update id from silently creating a second object.

When changing a nullable action-sentinel contract, add regression coverage for:

* each valid action with only its owned fields;
* omitted optional fields;
* explicit JSON `null` rejection on the portable schema;
* literal `"null"` rejection when the field has a stronger format such as a Buddy object id;
* missing active fields and supplied inactive fields;
* the serialized JSON Schema's `required`, `type`, `enum`, and `additionalProperties` shape;
* denial before side effects when the tool has a permission boundary.

This is a tool-contract design rule, not a provider adapter. If a route still corrupts a schema that genuinely needs nullable values, keep the schema semantically correct, capture raw-versus-normalized evidence, and fix or report that route rather than adding per-tool coercion.


## Side-Effects
When refactoring a tool—changing its name, schema, metadata, triggers, prompts, or return values—check for side effects before closing the issue.

Review every affected layer:

* **Prompt layer:** If the tool name or behavior is referenced in Markdown prompts, update those references.
* **Frontend:** If metadata, triggers, or other programmatic fields affect rendering, update the relevant renderers.
* **Backend:** Update all code that depends on the changed schema, name, triggers, metadata, or return format.
* **Describe blocks and prompts:** Avoid duplicating the same instructions across both.
* **Skills:** Search related skills for outdated or conflicting descriptions of how the tool works.

Use grep or an equivalent repository-wide search to find dependencies. Some tools and skills work together—for example, full-text ingestion and reading skills—so changes to one may require changes to the other.

Always check the frontend, backend, prompt, and skill layers before considering the refactor complete.



## Handling Failures
Tool failures must never be silent. The tool return consumed by the agent should clearly and concisely state what failed and why, so the agent can recover or explain it to the user.

Do not put failure details only in metadata or logs. Metadata can contain verbose debugging information, but the agent-facing return must include the essential failure context.



## Permission boundaries

- `ctx.ask` evaluates only the named permission; it does not guarantee a user prompt.
- Tool visibility or an allowed tool permission does not authorize external filesystem access.
- For model-controlled paths, use the shared external-file authorizer and its canonical paths.
- Authorize before content reads, writes, persistence, background work, metadata, or UI dispatch.
- Add a rejection test proving denied authorization leaves no side effects.

## Provider terms



| Concept                         | OpenAI term                      | Anthropic term      |

| ------------------------------- | -------------------------------- | ------------------- |

| Model calls external capability | Function calling / tool calling  | Tool use            |

| User-defined callable unit      | Function tool / tool             | Client tool         |

| Provider-hosted capability      | Built-in tool                    | Server tool         |

| Tool definition list            | `tools`                          | `tools`             |

| Tool selection control          | `tool_choice`                    | `tool_choice`       |

| Tool argument schema            | JSON Schema parameters           | `input_schema`      |

| Tool call emitted by model      | Tool call                        | `tool_use` block    |

| Tool result returned to model   | Tool output / tool result        | `tool_result` block |

| Strict schema behavior          | Structured Outputs / strict mode | Strict tool use     |



## OpenAI source map



### Function calling guide — https://developers.openai.com/api/docs/guides/function-calling



Topics located here: function calling overview, tool calling overview, function tools, custom tools, tool calling flow, defining functions, JSON schema parameters, tool call outputs, `tools`, `tool_choice`, strict mode, parallel function calling, streaming function calls.



Search terms: `How it works`, `Tools`, `Function tool example`, `Defining functions`, `tool_choice`, `Strict mode`, `Parallel function calling`, `Streaming`.



### Using tools guide — https://developers.openai.com/api/docs/guides/tools



Topics located here: OpenAI tool ecosystem, built-in tools, function calling and platform tools, web search, file search, code interpreter, computer use, MCP, connectors.



Search terms: `built-in tools`, `function calling`, `web search`, `file search`, `code interpreter`, `computer use`, `MCP`.



### Structured Outputs guide — https://developers.openai.com/api/docs/guides/structured-outputs



Topics located here: JSON/schema-constrained output, Structured Outputs, schema adherence, strict schema behavior, supported JSON Schema subset, reliable structured responses, relationship between structured output and function calling.



Search terms: `Structured Outputs`, `JSON Schema`, `strict`, `supported schemas`, `additionalProperties`, `limitations`.



### Responses API reference — https://developers.openai.com/api/reference/resources/responses/methods/create



Topics located here: Responses API request fields, Responses API response fields, `tools`, `tool_choice`, `parallel_tool_calls`, `stream`, response object shape, output item shape.



Search terms: `tools`, `tool_choice`, `parallel_tool_calls`, `stream`, `response`, `output`.



### Chat Completions API reference — https://developers.openai.com/api/reference/resources/chat



Topics located here: Chat Completions request fields, Chat Completions response fields, Chat Completions tool calling, `tools`, `tool_choice`, `tool_calls`, function/tool compatibility in Chat Completions.



Search terms: `tools`, `tool_choice`, `function`, `tool_calls`.



## Anthropic source map



### Tool use overview — https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview



Topics located here: Claude tool-use overview, client tools, server tools, where tools execute, agentic loop, when Claude uses tools, tool-use examples, high-level token and pricing notes.



Search terms: `Tool use with Claude`, `How tool use works`, `client tools`, `server tools`, `When Claude uses tools`, `tool_choice`, `tool_use`, `tool_result`.



### How tool use works — https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works



Topics located here: tool-use lifecycle, agent loop, client tool execution, server tool execution, stop reasons, tool-use control flow, tool selection behavior.



Search terms: `tool_use`, `tool_result`, `stop_reason`, `client tools`, `server tools`, `agent loop`.



### Define tools — https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools



Topics located here: tool definition shape, `name`, `description`, `input_schema`, `input_examples`, `tool_choice`, forced tool use, disabled tool use, tool definition best practices.



Search terms: `Specifying client tools`, `input_schema`, `input_examples`, `tool_choice`, `Forcing tool use`, `Best practices for tool definitions`.



### Handle tool calls — https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls



Topics located here: receiving tool calls from Claude, parsing `tool_use`, executing client tools in the application, returning `tool_result`, multi-turn tool-use loops, tool-result errors.



Search terms: `tool_use`, `tool_result`, `stop_reason`, `messages`, `handle tool calls`.



### Parallel tool use — https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use



Topics located here: multiple tool calls, parallel tool execution, parallel tool-use behavior, handling several `tool_use` blocks.



Search terms: `parallel`, `multiple tools`, `tool_use`.



### Strict tool use — https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use



Topics located here: strict tool schemas, schema-constrained tool calls, `strict`, requirements for strict tool use, limitations of strict tool use.



Search terms: `strict`, `schema`, `input_schema`, `limitations`.



### Fine-grained tool streaming — https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming



Topics located here: streaming tool inputs, partial tool-use streaming, streamed tool-call parsing, fine-grained tool input deltas.



Search terms: `streaming`, `fine-grained`, `tool_use`, `partial`.



### Tool reference — https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference



Topics located here: tool-definition fields, optional tool properties, Anthropic-provided tools, tool metadata, server tool reference details.



Search terms: `cache_control`, `strict`, `defer_loading`, `allowed_callers`, `tool reference`.



### Server tools — https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools



Topics located here: Anthropic-executed tools, server-side tools, web search, web fetch, code execution, tool search, server tool differences from client tools.



Search terms: `server tools`, `web_search`, `code_execution`, `web_fetch`, `tool_search`.



### Messages API reference — https://platform.claude.com/docs/en/api/messages



Topics located here: Messages API request fields, Messages API response fields, `tools`, `tool_choice`, message structure, stop reasons, tool-use response structure.



Search terms: `tools`, `tool_choice`, `messages`, `stop_reason`.



### OpenAI SDK compatibility — https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk



Topics located here: OpenAI SDK usage with Claude, OpenAI-compatible endpoint behavior, compatibility limits, function-calling differences through compatibility layer, unsupported OpenAI fields, ignored OpenAI fields, migration caveats.



Search terms: `OpenAI SDK compatibility`, `Important OpenAI compatibility limitations`, `function calling`, `strict`, `tools`, `unsupported fields`, `ignored`.



## Topic-to-source map



| Topic                         | OpenAI source                                                   | Anthropic source                                                                  |

| ----------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |

| Conceptual overview           | Function calling guide                                          | Tool use overview                                                                 |

| Provider tool system          | Using tools guide                                               | Tool use overview; Server tools                                                   |

| User-defined tool schema      | Function calling guide                                          | Define tools                                                                      |

| Exact request fields          | Responses API reference; Chat Completions API reference         | Messages API reference                                                            |

| Exact response shape          | Responses API reference; Chat Completions API reference         | Messages API reference                                                            |

| Tool execution loop           | Function calling guide; Responses API reference                 | How tool use works; Handle tool calls                                             |

| Returning tool results        | Function calling guide; API reference                           | Handle tool calls                                                                 |

| Forced tool use               | Function calling guide; Responses API reference                 | Define tools; Messages API reference                                              |

| Disabled tool use             | Function calling guide; Responses API reference                 | Define tools; Messages API reference                                              |

| Strict schema behavior        | Structured Outputs guide; Function calling guide                | Strict tool use                                                                   |

| Parallel tool calls           | Function calling guide; Responses API reference                 | Parallel tool use                                                                 |

| Streaming tool calls          | Function calling guide; Responses API reference                 | Fine-grained tool streaming                                                       |

| Built-in / server-side tools  | Using tools guide                                               | Server tools; Tool reference                                                      |

| SDK compatibility             | OpenAI SDK docs if OpenAI-specific                              | OpenAI SDK compatibility                                                          |

| OpenAI-to-Anthropic migration | Function calling guide; API reference                           | Define tools; Handle tool calls; Messages API reference; OpenAI SDK compatibility |

| Anthropic-to-OpenAI migration | Function calling guide; API reference; Structured Outputs guide | Tool use overview; Define tools; Handle tool calls                                |
