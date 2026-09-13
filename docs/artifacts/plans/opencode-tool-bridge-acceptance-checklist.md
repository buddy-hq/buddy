# OpenCode Tool Bridge Acceptance Checklist

This document defines the expected end state for the OpenCode-to-Pi tool bridge in Buddy.

## Goal

1. Pi remains the primary agent runtime and session loop.
2. Buddy remains the product owner for auth, UI, branding, skills, personas, session state, and config surfaces.
3. OpenCode is used only as an internal tool execution runtime for tool behavior parity.
4. The final user-visible behavior should match prior OpenCode-backed tool behavior as closely as possible while running through Buddy's Pi runtime.

## Runtime Ownership

1. Pi owns session creation, prompt submission, transcript flow, subagent orchestration, and tool selection.
2. OpenCode does not run its own agent loop for normal Buddy sessions.
3. When Pi selects a bridged tool, Buddy executes the real OpenCode tool implementation in-process as a library/runtime call.
4. Tool execution must run against the current Buddy directory/worktree/session context.
5. Buddy must not surface OpenCode branding, auth wording, config directories, or built-in OpenCode product UI as part of this bridge.

## Tool Exposure

1. All targeted OpenCode built-in tools should be callable through Pi sessions from Buddy.
2. The bridge should override Pi built-in tools where the OpenCode implementation is the desired source of truth.
3. Tool names should remain stable and user-facing names should continue to be the canonical Buddy/OpenCode-compatible names such as `read`, `bash`, `edit`, `write`, `grep`, `glob`, `apply_patch`, `skill`, `task`, `webfetch`, `websearch`, `repo_clone`, `repo_overview`, `lsp`, `todowrite`, `question`, `plan`, and `task_status` where supported.
4. The bridge should preserve tool descriptions and prompt snippets so the model receives the same tool guidance that OpenCode provided.
5. Tool schema validation errors should surface with the same or equivalent behavior as the OpenCode implementation.

## Behavioral Parity

1. If a behavior is implemented in OpenCode tool code, the bridged tool must preserve it.
2. If a behavior depends on OpenCode runtime services such as config, LSP, filesystem helpers, formatting, truncation, plugin loading, session context, or reference tracking, the bridge must preserve those services for the tool call.
3. If a tool had Windows-specific or macOS-specific handling in OpenCode, that handling must still apply when called from Pi.
4. If a tool used OpenCode-specific path normalization, shell parsing, external-directory handling, diff generation, formatter behavior, or LSP diagnostics, the bridged version must preserve those behaviors.
5. Tool result payloads and metadata should remain rich enough for Buddy UI rendering and follow-up tool decisions.
6. Streaming tool metadata updates that mattered before should continue to be surfaced where Pi can represent them.

## Permission Behavior

1. OpenCode tool permission asks must block execution until Buddy resolves them through the Pi permission UI path.
2. A bridged tool call that is denied must fail in a way that matches prior user-visible Buddy/OpenCode behavior.
3. Permission request metadata, patterns, and always-allow targets must be preserved.
4. Buddy must expose pending permission requests for bridged OpenCode tools through the existing Pi-backed permission route and UI.
5. "Allow once", "allow always", and "reject" must all work for bridged OpenCode tools.
6. The bridge must preserve OpenCode permission semantics as closely as possible, including exact allow/deny evaluation where feasible.
7. If the existing Buddy Pi permission path is weaker than OpenCode's permission runtime, the gap must either be closed in Buddy code or documented as an explicit parity gap.

## Session Context and State

1. Bridged tool execution must receive the correct directory, worktree, message ID, session ID, agent identity, abort signal, and message history.
2. Tools that depend on OpenCode session context must see a faithful equivalent of the original OpenCode execution context.
3. Abort propagation must still work for bridged tools.
4. Tool calls must remain isolated to the active Buddy project directory and session.

## UI and Transcript Integration

1. Buddy should continue to show tool calls in its own transcript UI without leaking OpenCode product UI.
2. Permission prompts for bridged tools should appear in the current Buddy permission dock flow.
3. Tool output and error rendering should remain understandable and useful in Buddy chat.
4. Existing built-in Pi renderer inheritance should be used where useful, but execution behavior must follow the bridged OpenCode implementation.

## Cross-Platform Expectations

1. The bridge must work on both macOS and Windows.
2. OpenCode logic that existed specifically to make shell or filesystem behavior work on Windows must still be exercised.
3. Path normalization and permission pattern generation must not regress on Windows.

## Leakage Constraints

1. The bridge must not reintroduce OpenCode auth UX leakage into Buddy.
2. The bridge must not reintroduce OpenCode skills, agents, or product-level built-ins into Buddy unless explicitly selected as tool runtime dependencies.
3. Buddy should continue storing user-facing state in `.buddy`, not `.pi` or `.opencode`, except for isolated internal runtime needs that are intentionally hidden and controlled.
4. Vendor coupling should remain limited to the tool runtime surface and not expand back into full product ownership.

## Testing Expectations

1. We need targeted parity tests for bridged tool execution, not just smoke tests.
2. At minimum, tests should cover:
   1. bridged tool registration and selection in Pi sessions
   2. permission ask and reply flow
   3. deny/reject behavior
   4. Windows-sensitive tool logic where testable
   5. session-context-sensitive tools
   6. abort propagation
3. Existing Buddy package lint and typecheck must pass after the bridge changes.

## Success Definition

1. A Buddy Pi session can call OpenCode-backed tools through a simple adapter layer.
2. Tool behavior for the bridged tools matches prior OpenCode-backed behavior closely enough that the migration no longer blocks real usage.
3. Pi remains the main runtime and Buddy remains the product owner.
4. The bridge provides a usable transitional state while Buddy decides later which tools to keep bridged and which to port natively.
