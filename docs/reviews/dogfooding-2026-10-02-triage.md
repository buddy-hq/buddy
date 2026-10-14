# Dogfooding triage

Status view · 2026-10-03. Each issue remains a separate work item.

Completed items: to-review-2026-10-03.md.


## Deferred

### Issue 18: Let users dismiss rate-limit and runtime-error banners

**Assigned:** GPT-6.1 Sol High. **Next:** Deferred by user on 2026-10-03 after rejecting the Easel design. Diagnosis and prototype retained; no production changes.

Recommendation: dismiss completed network, server, format, unknown, and blocked-response errors, retaining expandable details. Minimize account, quota, model-access, and context blockers while keeping recovery actions. Active retries must keep their status and Stop control visible. Dismissal changes presentation only and resets for a new failure. Production behavior has not changed.

**Deferred reason:** User rejected the Easel design implementation. The Error notices · dismiss and minimize prototype covers terminal network failure, quota, sign-in, context, active retries, and retries needing provider action. It remains a preview with fake data and local recovery/reset controls. Revisit design before any production implementation.

### Issue 09: Show the effective reasoning level behind Default

**Assigned:** GPT-6.1 Sol High. **Next:** Deferred by user on 2026-10-03. Full diagnosis retained below; no implementation.

**Conclusion:** Feasible with partial coverage. Show a known requested reasoning setting when Buddy resolves one; otherwise say the provider decides. Supported variant names do not establish a default. GPT-6.1 Sol has no forced default in the current provider transform, so its effort remains unknown without configuration.

**Default can inherit an agent variant.** The selector stores explicit Default as null. Frontend selection resolves that to undefined, so the controller omits variant. The backend then restores a matching agent's configured variant. A label based only on model defaults can be wrong. Reflect this fallback; changing its semantics would require a separate decision.

Evidence: `packages/web/src/lib/directory-chat/use-directory-chat-state.ts:203` and `:588`; `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts:1334`; `vendor/opencode/packages/opencode/src/session/prompt.ts:646–654`.

**Request precedence:** provider-transform defaults → model options → agent options → resolved variant → plugin chat.params adjustments. Buddy's built-in hook changes text verbosity, not reasoning; custom plugins can change options. Final settings pass through provider translation into streamText. The native Responses protocol emits reasoning effort only when present. Missing effort does not establish Medium.

Evidence: `vendor/opencode/packages/opencode/src/session/llm/request.ts:80`, `:91`, `:114`; `packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts:49`; `vendor/opencode/packages/opencode/src/session/llm.ts:316`; `vendor/opencode/packages/llm/src/protocols/openai-responses.ts:456`.

**Defaults selected by current code, before configuration overrides:**

| Route/model | Requested setting | Provider transform source line |
| --- | --- | --- |
| OpenRouter or LLMGateway, API ID containing gemini-3 | High | 1184 |
| Google or Vertex reasoning model containing gemini-3 | High | 1211 |
| Kimi reasoning model through Anthropic or Vertex Anthropic | Adaptive thinking with High effort | 1231 |
| Azure completion URL, GPT versions before 5.5 | Medium | 1273 |
| API ID containing gpt-5, excluding gpt-5-chat and gpt-5-pro, outside the earlier Azure branch | Medium | 1284 |

Source: `vendor/opencode/packages/opencode/src/provider/transform.ts`. The GPT-5 heuristic does not cover GPT-6.1 Sol. Other settings include budgets, toggles, and adaptive modes; those must not be guessed into an effort level.

**Metadata gaps:** frontend model normalization keeps variant names but discards model options, transport, and variant settings. Agent normalization omits options. Models.dev exposes supported efforts, budgets, and toggles without a default. Buddy's Codex account metadata parses supported levels without a typed default; its provider generates variants but does not apply an account default. Additional account metadata remains unverified because diagnosis did not query account state.

Evidence: `packages/web/src/state/chat-actions.ts:778` and `:191`; `vendor/opencode/packages/core/src/models-dev.ts:52`; `packages/buddy/src/opencode-runtime/plugins/openai-codex-account.ts:30`; `packages/buddy/src/opencode-runtime/plugins/openai-codex-provider.ts:72`.

**Proposed implementation:** add a Buddy-owned resolution projection through the OpenCode adapter. Reuse ProviderTransform rather than copying provider heuristics into React. Resolve the existing agent fallback and option precedence. Return a tagged known setting with provenance, or provider-unspecified, and render it in the existing Default option while preserving request behavior. Keep configured settings, runtime-selected settings, and documented provider defaults distinct.

The adapter already imports ProviderTransform in `packages/opencode-adapter/src/llm.ts:5`. No vendored edit is needed for partial coverage. Universal accuracy across arbitrary plugins requires a projection from the actual prepared request; a catalog-only label cannot guarantee it.

**Diagnosis scope:** read-only source inspection. No files or request behavior changed, tests run, or user-account state accessed for this issue.

## Backlog

### Issue 01: Improve the quality of generated assessment questions

**Status:** Not started.

Generated quizzes can have obvious wrong answers, predictable correct-answer positions, or accidental clues. Give the agent question-writing guidance covering clear wording, plausible distractors, balanced answer placement, and question types beyond multiple choice.

### Issue 02: Choose the right surface for each assessment

**Status:** Not started.

The agent has no clear rules for choosing an in-chat question, a structured Bench quiz, or an interactive HTML exercise. Add guidance based on the learning objective, number of questions, and interaction needed.

### Issue 03: Let the agent find and read saved notes

**Status:** Not started.

Saved notes are not available to the agent as ongoing context. Add ways to list, search, and read them so decisions, preferences, and learning takeaways can carry across chats and notebooks.

### Issue 04: Recommend useful notes above the composer

**Status:** Not started.

Important learning takeaways currently require manual note creation. Let the agent suggest a note above the composer, where the user can review and save it. Consult existing notes to avoid repeating what is already saved.

### Issue 05: Generate an editable note with /smart-note

**Status:** Not started.

There is no quick way to turn the current discussion into a concise note draft. Add a slash command that generates a draft into the composer with Note Mode enabled, using existing notes for context and avoiding an extra persisted chat turn.

### Issue 07: Guide users through setting up voice dictation

**Status:** Not started.

Users want voice input but lack a setup guide. Extend buddy-help with a CLI workflow for installing Handy Voice, selecting a model suited to the machine, configuring and checking it, and explaining how to dictate into Buddy.

### Issue 10: Add an explicit mode to bypass permission prompts

**Status:** Not started.

Repeated permission requests interrupt trusted local workflows. Provide a global or per-session toggle that automatically approves runtime permission requests when the user enables it.

### Issue 13: Make relative Markdown file links open their files

**Status:** Not started.

A relative file link in an assistant message looks clickable but does nothing. Resolve it against the active workspace and open the file in Bench. Align assistant guidance with the link formats Buddy actually supports.

### Issue 14: Show two Bench tabs side by side in immersive mode

**Status:** Not started.

Comparing a document, browser page, or whiteboard requires repeatedly switching tabs. Add a two-tab split view with independent scrolling and interaction so both resources can stay visible.

### Issue 15: Rank recent files higher when using Cmd+P

**Status:** Not started.

Newly created or edited files can appear below unrelated chats, boards, and web pages in quick open. Revisit ranking and decide whether file quick open should use different priorities from general command search.

### Issue 17: Create a reusable path for temporary model requests

**Status:** Not started.

Smart-note drafts, suggested prompts, and recommended tasks need one-off generation without adding messages to the main session. Build a shared mechanism that reuses the current conversation prefix and keeps those requests and responses out of persisted chat history.

### Issue 19: Clear stale rate-limit banners after switching providers

**Status:** Not started.

A rate-limit error from the previous account can remain visible after switching to an account or provider with available quota. Re-evaluate the banner when the active model, account, or provider changes and clear or update it accordingly.

### Issue 20: Expose Fast mode in the ChatGPT model picker

**Status:** Not started.

The model selector does not offer a discoverable Fast mode control for supported ChatGPT models. Include it in the ongoing Easel picker design and carry the selected interaction into the production picker.

### Issue 21: Let wide Markdown tables use the available Bench width

**Status:** Not started.

Tables inherit the narrow prose column and break words across awkward lines even when more horizontal space is available. Allow tables to extend beyond the prose width while keeping ordinary paragraphs comfortably readable.

### Issue 25: Shrink the new-chat whiteboard empty-state card

**Status:** Not started.

The large whiteboard card, heading, and panda crowd the space above the composer in docked mode. Reduce their overall size while preserving the grain, date detail, and welcoming feel.

### Issue 26: Warn before subscription usage reaches its limit

**Status:** Not started.

Usage information exists in the model popover, but users can still be surprised by a hard rate-limit block. Add a subtle near-limit warning through the usage meter or model picker so they can pace work or switch providers beforehand.

### Issue 29: Use the same separator-matching rule across search

**Status:** Not started.

Queries such as snake case, snakecase, and snake_case behave differently across Notes, file search, Skills, and other pickers. Share one matching rule and preserve underscores in previews. Keep this separate from ranking changes, and sequence it after the Notes change merges.
