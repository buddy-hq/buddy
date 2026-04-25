# Buddy Tool Prompt Writing Guide

Buddy is a learning companion. A Buddy tool prompt should help Buddy decide:

1. whether the tool should be used at all,
2. whether this tool is better than nearby alternatives,
3. what must happen before using it,
4. how to call it correctly,
5. how to interpret the result,
6. how to continue the learning interaction afterward.

The goal is **minimum sufficient guidance**.

A tool prompt should be only as long as needed to produce correct tool choice, safe execution, and useful learning behavior.

---

# 1. Core Principle

A tool prompt is not just an API description. It is a decision aid.

Every sentence should change at least one behavior:

- when Buddy chooses the tool
- when Buddy avoids the tool
- when Buddy chooses another tool instead
- what Buddy does before using it
- how Buddy calls it
- what Buddy does after it returns
- how Buddy handles state, permissions, output, or failure

If a sentence does not change behavior, remove it.

The right prompt is not the longest accurate prompt.

The right prompt is the shortest prompt that prevents likely misuse.

---

# 2. Core Algorithm

Use this process for every tool:

```text
learning goal
→ teaching/action move
→ choice boundary
→ related-tool map
→ constraints
→ output/failure/state handling
→ length tier
→ surface form
→ trim
```

Expanded:

1. Identify the learner-facing goal.
2. Identify the action or teaching move the tool enables.
3. Define when Buddy should choose the tool.
4. Define when Buddy should not choose the tool.
5. Identify only truly related tools and alternatives.
6. Add preconditions, execution rules, permission boundaries, failure handling, output handling, and state rules only when needed.
7. Choose length by ambiguity and risk.
8. Write the final prompt in natural tool-documentation style.
9. Trim anything that does not change behavior.

---

# 3. Use a Trace Workbook While Applying the Algorithm

When asking an agent to write or revise a tool prompt, require a trace workbook before the final prompt.

The workbook forces the agent to follow the algorithm instead of jumping directly to a generic template.

The workbook is not the final tool prompt. It is the reasoning scaffold used to produce the prompt.

## Required workbook format

```markdown
## Tool Prompt Trace Workbook

### 1. Learner-facing goal
What does this tool help Buddy make possible for the learner?

Answer:
...

### 2. Teaching/action move
What action or teaching move does this tool enable?

Answer:
...

### 3. Positive choice triggers
When should Buddy choose this tool?

Answer:
- ...

### 4. Negative choice triggers
When should Buddy avoid this tool?

Answer:
- ...

### 5. Related-tool candidates
List only tools or alternatives that could plausibly compete with this tool for the same user request.

Candidate table:

| Candidate | Include? | Relationship | Concrete boundary |
|---|---:|---|---|
| ... | yes/no | prerequisite / narrower substitute / broader fallback / escalation / downstream / alternative format / forbidden overlap / no-tool alternative | ... |

Rule:
Only include a related tool in the final prompt if:
1. the same user request could plausibly trigger both tools, and
2. there is a concrete boundary where one wins, and
3. naming it prevents a likely mistake.

### 6. Constraints to include
Add only constraints that change behavior.

| Constraint type | Include? | Why |
|---|---:|---|
| Preconditions | yes/no | ... |
| Execution rules | yes/no | ... |
| Permission boundaries | yes/no | ... |
| Failure handling | yes/no | ... |
| Output handling | yes/no | ... |
| State rules | yes/no | ... |
| Examples | yes/no | ... |

### 7. Length tier
Score the tool.

| Dimension | Score 0-2 | Reason |
|---|---:|---|
| Breadth |  |  |
| Mutation |  |  |
| External impact |  |  |
| Statefulness |  |  |
| Tool overlap |  |  |
| Failure cost |  |  |
| Workflow complexity |  |  |
| Overuse risk |  |  |

Total:
Tier:
Why this length is justified:

### 8. Draft prompt
Write the first prompt draft.

```text
...
```

### 9. Patch pass
Apply step-by-step patches. Each patch must have a reason.

Patch 1 — [name]
Reason:
Before:
```text
...
```
After:
```text
...
```

Patch 2 — [name]
Reason:
Before:
```text
...
```
After:
```text
...
```

### 10. Final prompt
```text
...
```

### 11. Final lint
- Does the prompt define when to choose the tool?
- Does it define when not to choose the tool?
- Does it mention only truly related tools?
- Does every related tool have a concrete boundary?
- Are constraints included only where needed?
- Is the length justified?
- Does the prompt read like documentation, not a worksheet?
- Can any sentence be removed without changing behavior?
```

## Why the workbook helps

Without a workbook, agents often skip the algorithm and output a generic prompt with sections like:

```text
Use this tool when:
Do not use this tool when:
Related tool routing:
When using this tool:
```

The workbook makes them show their work:

- why the tool exists,
- when it should be chosen,
- what related tools truly compete,
- why each constraint belongs,
- why the length is justified,
- how the final prompt was patched down.

Use the workbook during prompt design. Do not ship the workbook as the tool description.

---

# 4. Use Step-by-Step Patches Instead of One Big Rewrite

When revising an existing tool prompt, do not jump straight to a final rewrite.

Use patches.

Each patch should change one thing:

- add missing choice boundary
- remove unrelated tool routing
- tighten negative triggers
- add a missing precondition
- remove a vague sentence
- compress listy structure into natural prose
- add output handling
- reduce length
- promote a critical safety rule

## Patch format

```markdown
Patch N — [short name]

Reason:
[Why this patch changes behavior.]

Before:
```text
[old text]
```

After:
```text
[new text]
```
```

## Example patch types

### Patch: Add choice boundary

Reason:

```text
The original prompt describes capability but does not say when Buddy should choose the tool.
```

### Patch: Remove weak related-tool routing

Reason:

```text
The related tool is semantically similar but does not compete for the same user request, so mentioning it adds noise.
```

### Patch: Add precondition

Reason:

```text
The tool fails or becomes unsafe unless the model inspects the file first.
```

### Patch: Compress worksheet form

Reason:

```text
The prompt has the right rules but reads like a filled-out checklist. This patch keeps the behavior and makes it native documentation prose.
```

### Patch: Reduce length

Reason:

```text
The prompt is medium-risk but written like a long-risk tool. This patch removes rules that do not change choice, safety, output handling, or recovery.
```

---

# 5. Start With the Learner-Facing Goal

Before writing the tool prompt, ask:

```text
What does this tool help Buddy make possible for the learner?
```

Do not start with the implementation.

Start with the useful outcome.

A tool prompt may include a purpose statement when it changes tool choice.

## Complete source example: `todowrite` opening

```text
Use this tool to create and manage a structured task list for your current coding session. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.
It also helps the user understand the progress of the task and overall progress of their requests.
```

This is strong because it does not merely say “creates todos.” It explains why the tool exists:

- track progress
- organize complex tasks
- demonstrate thoroughness
- help the user understand progress

## Complete source example: `skill`

```text
Load a specialized skill when the task at hand matches one of the skills listed in the system prompt.

Use this tool to inject the skill's instructions and resources into current conversation. The output may contain detailed workflow guidance as well as references to scripts, files, etc in the same directory as the skill.

The skill name must match one of the skills listed in your system prompt.
```

This is strong because it connects the tool to its downstream effect: injecting specialized instructions and resources into the conversation.

---

# 6. Tool Choice Is the Center

The most important job of a tool prompt is to define the tool’s choice boundary.

A capability sentence answers:

```text
What can this tool do?
```

A choice boundary answers:

```text
When should Buddy use it?
When should Buddy avoid it?
When should Buddy use a different tool?
```

Most tool misuse happens when the model knows what a tool does but not when to choose it.

---

# 7. Positive Choice Triggers

Positive triggers say when the tool should be considered.

Use them when the tool’s use is not obvious.

## Complete source example: `glob`

```text
- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open-ended search that may require multiple rounds of globbing and grepping, use the Task tool instead
- You have the capability to call multiple tools in a single response. It is always better to speculatively perform multiple searches as a batch that are potentially useful.
```

This gives a positive trigger:

```text
Use this tool when you need to find files by name patterns
```

It also gives a boundary:

```text
When you are doing an open-ended search that may require multiple rounds of globbing and grepping, use the Task tool instead
```

## Complete source example: `grep`

```text
- Fast content search tool that works with any codebase size
- Searches file contents using regular expressions
- Supports full regex syntax (eg. "log.*Error", "function\s+\w+", etc.)
- Filter files by pattern with the include parameter (eg. "*.js", "*.{ts,tsx}")
- Returns file paths and line numbers with at least one match sorted by modification time
- Use this tool when you need to find files containing specific patterns
- If you need to identify/count the number of matches within files, use the Bash tool with `rg` (ripgrep) directly. Do NOT use `grep`.
- When you are doing an open-ended search that may require multiple rounds of globbing and grepping, use the Task tool instead
```

This gives a positive trigger:

```text
Use this tool when you need to find files containing specific patterns
```

It also routes away when counting matches or doing open-ended multi-round search.

## Complete source example: `plan-enter`

```text
Use this tool to suggest switching to plan agent when the user's request would benefit from planning before implementation.

If they explicitly mention wanting to create a plan ALWAYS call this tool first.

This tool will ask the user if they want to switch to plan agent.

Call this tool when:
- The user's request is complex and would benefit from planning first
- You want to research and design before making changes
- The task involves multiple files or significant architectural decisions

Do NOT call this tool:
- For simple, straightforward tasks
- When the user explicitly wants immediate implementation
```

This is strong because it defines both when planning helps and when it is the wrong move.

## Pattern

```text
Choose this tool when [user intent or task shape] makes this tool the best fit.
```

For Buddy, positive triggers should be tied to learner value, not just tool capability.

---

# 8. Negative Choice Triggers

Negative triggers say when the tool should not be used, even if it could technically work.

## Complete source example: `todowrite` “When NOT to Use”

```text
## When NOT to Use This Tool

Skip using this tool when:
1. There is only a single, straightforward task
2. The task is trivial and tracking it provides no organizational benefit
3. The task can be completed in less than 3 trivial steps
4. The task is purely conversational or informational

NOTE that you should not use this tool if there is only one trivial task to do. In this case you are better off just doing the task directly.
```

This is strong because it prevents process inflation.

## Complete source example: `task` “When NOT to use”

```text
When NOT to use the Task tool:
- If you want to read a specific file path, use the Read or Glob tool instead of the Task tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use the Glob tool instead, to find the match more quickly
- If you are searching for code within a specific file or set of 2-3 files, use the Read tool instead of the Task tool, to find the match more quickly
- Other tasks that are not related to the agent descriptions above
```

This is strong because it does not merely say “don’t overuse agents.” It gives concrete neighboring cases where simpler tools win.

## Pattern

```text
Do not choose this tool when it adds process, risk, delay, or ambiguity without improving the outcome.
```

For Buddy, avoid tools that add friction, noise, or complexity when a direct answer would serve the learner better.

---

# 9. Related-Tool Routing

Related-tool routing is powerful, but it should be used sparingly.

Do not add a tool to the related-tool section just because it feels semantically similar.

Only mention a related tool when it changes Buddy’s decision in a plausible user request.

A tool is related only if at least one of these is true:

1. Buddy might realistically choose either tool for the same user request.
2. One tool is a required prerequisite for the other.
3. One tool is the safer or narrower substitute for a common case.
4. One tool is the broader fallback when the current tool does not fit.
5. One tool is the downstream next step after the current tool succeeds.
6. One tool is commonly overused where the other should win.
7. The current tool’s output explicitly requires the other tool for interpretation or continuation.

If none of those are true, do not mention the tool.

## 9.1 The Related-Tool Test

Before adding a related tool, answer these questions:

```text
1. Could the same user request plausibly trigger both tools?
2. Is there a concrete boundary where one should win over the other?
3. Would naming this other tool prevent a likely mistake?
4. Is this relationship common enough to justify prompt tokens?
```

Include the related tool only if the answer is “yes” to at least questions 2 and 3.

If the only reason is “these tools are in the same broad category,” do not include it.

## 9.2 Good Related-Tool Routing

Good related-tool routing names a specific competing behavior.

Example from `bash`:

```text
IMPORTANT: This tool is for terminal operations like git, npm, docker, etc. DO NOT use it for file operations (reading, writing, editing, searching, finding files) - use the specialized tools for this instead.
```

```text
Avoid using Bash with the `find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo` commands, unless explicitly instructed or when these commands are truly necessary for the task. Instead, always prefer using the dedicated tools for these commands:
  - File search: Use Glob (NOT find or ls)
  - Content search: Use Grep (NOT grep or rg)
  - Read files: Use Read (NOT cat/head/tail)
  - Edit files: Use Edit (NOT sed/awk)
  - Write files: Use Write (NOT echo >/cat <<EOF)
  - Communication: Output text directly (NOT echo/printf)
```

This is good because it says exactly which tasks should route away from `bash`.

Example from `read`:

```text
Use the grep tool to find specific content in large files or files with long lines.
```

```text
If you are unsure of the correct file path, use the glob tool to look up filenames by glob pattern.
```

This is good because `grep` and `glob` solve concrete failure modes of `read`: finding content and finding unknown paths.

Example from `multiedit`:

```text
This is a tool for making multiple edits to a single file in one operation. It is built on top of the Edit tool and allows you to perform multiple find-and-replace operations efficiently. Prefer this tool over the Edit tool when you need to make multiple edits to the same file.
```

This is good because it defines a clear boundary: `Edit` for one replacement, `MultiEdit` for multiple edits in one file.

Example from `webfetch`:

```text
IMPORTANT: if another tool is present that offers better web fetching capabilities, is more targeted to the task, or has fewer restrictions, prefer using that tool instead of this one.
```

This is good because it avoids overusing a generic fetcher when a more targeted tool exists.

Example from MCP tools:

```text
Prefer resource templates over web search when possible.
```

```text
Prefer resources over web search when possible.
```

This is good because it says an internal/source-specific tool should win over a broader external search tool.

## 9.3 Bad Related-Tool Routing

Bad related-tool routing adds tools merely because they are nearby in a taxonomy.

Bad:

```text
This file-reading tool is related to shell, agents, search, planning, web fetch, and image viewing.
```

This is too broad. It does not define a useful decision boundary.

Better:

```text
If you are unsure of the correct file path, use the glob tool to look up filenames by glob pattern. Use the grep tool to find specific content in large files or files with long lines.
```

Bad:

```text
This planning tool is related to all agent and task tools.
```

Better:

```text
Do NOT call this tool for simple, straightforward tasks or when the user explicitly wants immediate implementation.
```

Bad:

```text
This web tool is related to all search and fetch tools.
```

Better:

```text
If another tool is present that offers better web fetching capabilities, is more targeted to the task, or has fewer restrictions, prefer using that tool instead of this one.
```

## 9.4 Related-Tool Relationship Map

Use this map only after a candidate related tool passes the related-tool test.

| Relationship | Meaning | Example pattern |
|---|---|---|
| Prerequisite | Use before this tool | Read before Edit |
| Narrower substitute | Prefer for safer/specific cases | Use Glob instead of Bash `find` |
| Broader fallback | Use when narrower tools do not fit | Use Bash only when dedicated tools are insufficient |
| Escalation | Use after simpler tools fail or scope expands | Use Task for open-ended multi-round search |
| Downstream | Use after this tool succeeds | Use summarized agent result after Task |
| Alternative format | Same goal, different representation | Not common in this source corpus; include only if real |
| Forbidden overlap | Do not use this tool for that task | Do not use Bash for file operations |
| No-tool alternative | A direct answer is better | Do not use TodoWrite for trivial informational answers |

## 9.5 Related-Tool Budget

Use a related-tool budget to prevent eager over-routing.

Default budgets:

| Tool prompt tier | Related tools to mention |
|---|---:|
| Micro | 0 |
| Short | 0–1 |
| Medium | 1–3 |
| Long | 3+ only when each has a concrete boundary |

If a prompt is short or medium, every related tool mentioned should earn its place.

For long tools, group related tools by task, not by name.

Good grouping from `bash`:

```text
File search: Use Glob (NOT find or ls)
Content search: Use Grep (NOT grep or rg)
Read files: Use Read (NOT cat/head/tail)
Edit files: Use Edit (NOT sed/awk)
Write files: Use Write (NOT echo >/cat <<EOF)
```

This works because it is organized by task, not by vague similarity.

## 9.6 Related-Tool Writing Pattern

Use this pattern:

```text
Use this tool for X. Use Tool A for Y. Use Tool B for Z. Do not use this tool for Q.
```

Avoid this pattern:

```text
Related tools include A, B, C, D, E.
```

A related-tool section should explain decisions, not list neighbors.

---

# 10. Preconditions

Preconditions say what must happen before using the tool.

Include them only when correctness depends on prior steps.

## Complete source example: `edit`

```text
Performs exact string replacements in files. 

Usage:
- You must use your `Read` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file. 
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: line number + colon + space (e.g., `1: `). Everything after that space is the actual file content to match. Never include any part of the line number prefix in the oldString or newString.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if `oldString` is not found in the file with an error "oldString not found in content".
- The edit will FAIL if `oldString` is found multiple times in the file with an error "Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match." Either provide a larger string with more surrounding context to make it unique or use `replaceAll` to change every instance of `oldString`. 
- Use `replaceAll` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.
```

This is a medium prompt with strong preconditions:

```text
You must use your `Read` tool at least once in the conversation before editing.
```

## Complete source example: `write`

```text
Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.
```

This is strong because it combines overwrite risk, precondition, and negative trigger.

## Pattern

```text
Before using this tool, do the minimum inspection or verification needed to make the call correct.
```

Do not add preconditions just to sound careful.

---

# 11. Execution Rules

Execution rules tell Buddy how to call the tool correctly.

Include them when formatting, ordering, parameters, or scope matter.

## Complete source example: `js_repl`

```text
Runs JavaScript in a persistent Node kernel with top-level await. This is a freeform tool: send raw JavaScript source text, optionally with a first-line pragma like `// codex-js-repl: timeout_ms=15000`; do not send JSON/quotes/markdown fences.
```

This is short but high-value: it prevents a common wrong call format.

## Complete source example: `shell`

```text
Runs a shell command and returns its output.
- The arguments to `shell` will be passed to execvp(). Most terminal commands should be prefixed with ["bash", "-lc"].
- Always set the `workdir` param when using the shell function. Do not use `cd` unless absolutely necessary.
```

This is a short execution-focused prompt. It does not need the full `bash` policy because it is a smaller tool.

## Complete source example: `apply_patch`

```text
Use the `apply_patch` tool to edit files. Your patch language is a stripped-down, file-oriented diff format designed to be easy to parse and safe to apply. You can think of it as a high-level envelope:

*** Begin Patch
[ one or more file sections ]
*** End Patch

Within that envelope, you get a sequence of file operations.
You MUST include a header to specify the action you are taking.
Each operation starts with one of three headers:

*** Add File: <path> - create a new file. Every following line is a + line (the initial contents).
*** Delete File: <path> - remove an existing file. Nothing follows.
*** Update File: <path> - patch an existing file in place (optionally with a rename).

Example patch:

```
*** Begin Patch
*** Add File: hello.txt
+Hello world
*** Update File: src/app.py
*** Move to: src/main.py
@@ def greet():
-print("Hi")
+print("Hello, world!")
*** Delete File: obsolete.txt
*** End Patch
```

It is important to remember:

- You must include a header with your intended action (Add/Delete/Update)
- You must prefix new lines with `+` even when creating a new file
```

This prompt is mostly execution format. The syntax is the hard part, so the prompt spends tokens on exact shape and examples.

---

# 12. Permission Boundaries

Some tools can do things the user may not have authorized.

Permission boundaries are mandatory when the tool can affect files, repository history, remote systems, persistent state, permissions, or delegated work.

## Complete source example: `bash` git permission block

```text
Only create commits when requested by the user. If unclear, ask first. When the user asks you to create a new git commit, follow these steps carefully:

Git Safety Protocol:
- NEVER update the git config
- NEVER run destructive/irreversible git commands (like push --force, hard reset, etc) unless the user explicitly requests them
- NEVER skip hooks (--no-verify, --no-gpg-sign, etc) unless the user explicitly requests it
- NEVER run force push to main/master, warn the user if they request it
- Avoid git commit --amend. ONLY use --amend when ALL conditions are met:
  (1) User explicitly requested amend, OR commit SUCCEEDED but pre-commit hook auto-modified files that need including
  (2) HEAD commit was created by you in this conversation (verify: git log -1 --format='%an %ae')
  (3) Commit has NOT been pushed to remote (verify: git status shows "Your branch is ahead")
- CRITICAL: If commit FAILED or was REJECTED by hook, NEVER amend - fix the issue and create a NEW commit
- CRITICAL: If you already pushed to remote, NEVER amend unless user explicitly requests it (requires force push)
- NEVER commit changes unless the user explicitly asks you to. It is VERY IMPORTANT to only commit when explicitly asked, otherwise the user will feel that you are being too proactive.
```

This is a model permission boundary. The tool can do the action, but the model must not infer permission.

## Complete source example: `spawn_agent` permission boundary

```text
Only use `spawn_agent` if and only if the user explicitly asks for sub-agents, delegation, or parallel agent work.
```

Core rule:

```text
Capability is not authorization.
```

Do not infer permission from a related action.

---

# 13. Failure Modes and Recovery

Good prompts tell Buddy how the tool fails and what to do next.

Include failure handling only when it is specific and actionable.

## Complete source example: `edit` failure handling

```text
- The edit will FAIL if `oldString` is not found in the file with an error "oldString not found in content".
- The edit will FAIL if `oldString` is found multiple times in the file with an error "Found multiple matches for oldString. Provide more surrounding lines in oldString to identify the correct match." Either provide a larger string with more surrounding context to make it unique or use `replaceAll` to change every instance of `oldString`. 
```

This is strong because it names exact failure modes and exact recovery.

## Complete source example: `multiedit` failure handling

```text
IMPORTANT:
- All edits are applied in sequence, in the order they are provided
- Each edit operates on the result of the previous edit
- All edits must be valid for the operation to succeed - if any edit fails, none will be applied
- This tool is ideal when you need to make several changes to different parts of the same file

CRITICAL REQUIREMENTS:
1. All edits follow the same requirements as the single Edit tool
2. The edits are atomic - either all succeed or none are applied
3. Plan your edits carefully to avoid conflicts between sequential operations

WARNING:
- The tool will fail if edits.oldString doesn't match the file contents exactly (including whitespace)
- The tool will fail if edits.oldString and edits.newString are the same
- Since edits are applied in sequence, ensure that earlier edits don't affect the text that later edits are trying to find
```

Pattern:

```text
This tool fails if X. Recover by doing Y. Do not recover by doing Z.
```

Avoid generic failure advice.

---

# 14. Output Handling

Some tool results require interpretation before Buddy continues.

Include output handling when the result can be misread, hidden from the user, truncated, or used incorrectly.

## Complete source example: `read`

```text
Read a file or directory from the local filesystem. If the path does not exist, an error is returned.

Usage:
- The filePath parameter should be an absolute path.
- By default, this tool returns up to 2000 lines from the start of the file.
- The offset parameter is the line number to start from (1-indexed).
- To read later sections, call this tool again with a larger offset.
- Use the grep tool to find specific content in large files or files with long lines.
- If you are unsure of the correct file path, use the glob tool to look up filenames by glob pattern.
- Contents are returned with each line prefixed by its line number as `<line>: <content>`. For example, if a file has contents "foo\n", you will receive "1: foo\n". For directories, entries are returned one per line (without line numbers) with a trailing `/` for subdirectories.
- Any line longer than 2000 characters is truncated.
- Call this tool in parallel when you know there are multiple files you want to read.
- Avoid tiny repeated slices (30 line chunks). If you need more context, read a larger window.
- This tool can read image files and PDFs and return them as file attachments.
```

This prompt explains:

- path behavior
- offset behavior
- related-tool routing
- line-number output
- truncation
- parallel reads
- image/PDF behavior

## Complete source example: `task` output handling

```text
When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result. The output includes a task_id you can reuse later to continue the same subagent session.
```

This is crucial because the raw tool output is not user-visible.

Pattern:

```text
This tool returns X. Interpret it as Y. Do not misuse it as Z.
```

For Buddy, the output is often not the final answer. The prompt should say how Buddy should continue after using the tool when that matters.

---

# 15. State Rules

Stateful tools need lifecycle rules.

Include state rules when the tool creates, depends on, or modifies persistent or session state.

## Complete source example: `todowrite` state rules

```text
## Task States and Management

1. **Task States**: Use these states to track progress:
   - pending: Task not yet started
   - in_progress: Currently working on (limit to ONE task at a time)
   - completed: Task finished successfully
   - cancelled: Task no longer needed

2. **Task Management**:
   - Update task status in real-time as you work
   - Mark tasks complete IMMEDIATELY after finishing (don't batch completions)
   - Only have ONE task in_progress at any time
   - Complete current tasks before starting new ones
   - Cancel tasks that become irrelevant

3. **Task Breakdown**:
   - Create specific, actionable items
   - Break complex tasks into smaller, manageable steps
   - Use clear, descriptive task names

When in doubt, use this tool. Being proactive with task management demonstrates attentiveness and ensures you complete all requirements successfully.
```

## Complete source example: `update_plan`

```text
Updates the task plan.
Provide an optional explanation and a list of plan items, each with a step and status.
At most one step can be in_progress at a time.
```

## Complete source example: `js_repl_reset`

```text
Restarts the js_repl kernel for this run and clears persisted top-level bindings.
```

Pattern:

```text
If the tool creates or depends on state, define states, transitions, lifecycle, and concurrency limits.
```

---

# 16. Examples and Counterexamples

Use examples when the model needs judgment, not just syntax.

Examples are useful when:

- the tool is easy to overuse
- nearby tools are easy to confuse
- the task threshold is subtle
- the tool has a multi-step workflow
- the model commonly makes the wrong call

## Complete source example: `todowrite` positive example

```text
<example>
User: I want to add a dark mode toggle to the application settings. Make sure you run the tests and build when you're done!
Assistant: I'll help add a dark mode toggle to your application settings. Let me create a todo list to track this implementation.
*Creates todo list with the following items:*
1. Create dark mode toggle component in Settings page
2. Add dark mode state management (context/store)
3. Implement CSS-in-JS styles for dark theme
4. Update existing components to support theme switching
5. Run tests and build process, addressing any failures or errors that occur
*Begins working on the first task*

<reasoning>
The assistant used the todo list because:
1. Adding dark mode is a multi-step feature requiring UI, state management, and styling changes
2. The user explicitly requested tests and build be run afterward
3. The assistant inferred that tests and build need to pass by adding "Ensure tests and build succeed" as the final task
</reasoning>
</example>
```

## Complete source example: `todowrite` negative example

```text
<example>
User: How do I print 'Hello World' in Python?
Assistant: In Python, you can print "Hello World" with this simple code:

python
print("Hello World")

This will output the text "Hello World" to the console when executed.</assistant>

<reasoning>
The assistant did not use the todo list because this is a single, trivial task that can be completed in one step. There's no need to track multiple tasks or steps for such a straightforward request.
</reasoning>
</example>
```

## Complete source example: `bash` good/bad example

```text
<good-example>
Use workdir="/foo/bar" with command: pytest tests
</good-example>
<bad-example>
cd /foo/bar && pytest tests
</bad-example>
```

Pattern:

```text
Use examples when they clarify choice boundaries, overuse boundaries, or common mistakes.
```

Do not add examples just to make the prompt look complete.

---

# 17. Length Tiers

A healthy tool set has a long-tail distribution:

- many micro prompts
- many short prompts
- some medium prompts
- few long prompts

Prompt length should follow risk, ambiguity, overlap, state, and workflow depth.

---

## 17.1 Micro Prompts

Use micro prompts for internal, forbidden, obvious, or single-purpose tools.

## Complete source examples

### `invalid`

```text
Do not use
```

### `plan`

```text
Switch to build agent and start implementing the plan
```

### `test_sync_tool`

```text
Internal synchronization helper used by Codex integration tests.
```

### `js_repl_reset`

```text
Restarts the js_repl kernel for this run and clears persisted top-level bindings.
```

### `read_mcp_resource`

```text
Read a specific resource from an MCP server given the server name and resource URI.
```

Use this length when:

- the tool is internal
- the tool is self-evident
- the tool has almost no choice ambiguity
- the tool should rarely or never be used

---

## 17.2 Short Prompts

Use short prompts for narrow, low-risk tools.

## Complete source examples

### `list_dir`

```text
Lists entries in a local directory with 1-indexed entry numbers and simple type labels.
```

### `send_message`

```text
Send a string message to an existing agent without triggering a new turn.
```

### `list_agents`

```text
List live agents in the current root thread tree. Optionally filter by task-path prefix.
```

### `view_image`

```text
View a local image from the filesystem (only use if given a full filepath by the user, and the image isn't already attached to the thread context within <image ...> tags).
```

### `write_stdin`

```text
Writes characters to an existing unified exec session and returns recent output.
```

Use this length when:

- the tool is narrow
- failure is simple
- there are few related-tool confusions
- there is little or no persistent state
- the output is easy to interpret

---

## 17.3 Medium Prompts

Use medium prompts for tools with moderate overlap, input constraints, failure modes, or output interpretation.

## Complete source examples

### `shell`

```text
Runs a shell command and returns its output.
- The arguments to `shell` will be passed to execvp(). Most terminal commands should be prefixed with ["bash", "-lc"].
- Always set the `workdir` param when using the shell function. Do not use `cd` unless absolutely necessary.
```

### `request_user_input`

```text
Request user input for one to three short questions and wait for the response. This tool is only available in collaboration modes.
```

### `request_permissions`

```text
Request additional filesystem or network permissions from the user and wait for the client to grant a subset of the requested permission profile. Granted permissions apply automatically to later shell-like commands in the current turn, or for the rest of the session if the client approves them at session scope.
```

### `wait_agent`

```text
Wait for agents to reach a final status. Completed statuses may include the agent's final message. Returns empty status when timed out. Once the agent reaches a final status, a notification message will be received containing the same completed status.
```

### `list_mcp_resource_templates`

```text
Lists resource templates provided by MCP servers. Parameterized resource templates allow servers to share data that takes parameters and provides context to language models, such as files, database schemas, or application-specific information. Prefer resource templates over web search when possible.
```

Use this length when:

- a precondition matters
- another tool may be a better fit
- common failures are recoverable
- result shape affects later behavior
- input format matters

---

## 17.4 Long Prompts

Use long prompts for broad, risky, stateful, workflow-heavy, or high-overlap tools.

A true long-prompt example should show the **whole behavioral shape**, not a single quote.

## Complete source example: `multiedit`

```text
This is a tool for making multiple edits to a single file in one operation. It is built on top of the Edit tool and allows you to perform multiple find-and-replace operations efficiently. Prefer this tool over the Edit tool when you need to make multiple edits to the same file.

Before using this tool:

1. Use the Read tool to understand the file's contents and context
2. Verify the directory path is correct

To make multiple file edits, provide the following:
1. file_path: The absolute path to the file to modify (must be absolute, not relative)
2. edits: An array of edit operations to perform, where each edit contains:
   - oldString: The text to replace (must match the file contents exactly, including all whitespace and indentation)
   - newString: The edited text to replace the oldString
   - replaceAll: Replace all occurrences of oldString. This parameter is optional and defaults to false.

IMPORTANT:
- All edits are applied in sequence, in the order they are provided
- Each edit operates on the result of the previous edit
- All edits must be valid for the operation to succeed - if any edit fails, none will be applied
- This tool is ideal when you need to make several changes to different parts of the same file

CRITICAL REQUIREMENTS:
1. All edits follow the same requirements as the single Edit tool
2. The edits are atomic - either all succeed or none are applied
3. Plan your edits carefully to avoid conflicts between sequential operations

WARNING:
- The tool will fail if edits.oldString doesn't match the file contents exactly (including whitespace)
- The tool will fail if edits.oldString and edits.newString are the same
- Since edits are applied in sequence, ensure that earlier edits don't affect the text that later edits are trying to find

When making edits:
- Ensure all edits result in idiomatic, correct code
- Do not leave the code in a broken state
- Always use absolute file paths (starting with /)
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- Use replaceAll for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.

If you want to create a new file, use:
- A new file path, including dir name if needed
- First edit: empty oldString and the new file's contents as newString
- Subsequent edits: normal edit operations on the created content
```

This is long because it includes:

- capability
- related-tool routing
- preconditions
- input schema explanation
- atomicity
- ordering semantics
- exact-match failure modes
- code-quality constraints
- new-file behavior

## Complete source example: `spawn_agent`

```text
Spawn a sub-agent for a well-scoped task. Returns the spawned agent id plus the user-facing nickname when available.

This spawn_agent tool provides you access to smaller but more efficient sub-agents. A mini model can solve many tasks faster than the main model.

Only use `spawn_agent` if and only if the user explicitly asks for sub-agents, delegation, or parallel agent work.

**When to delegate vs. do the subtask yourself**
- First, quickly analyze the overall user task and form a succinct high-level plan. Identify which tasks are immediate blockers on the critical path, and which tasks are sidecar tasks that are needed but can run in parallel without blocking the next local step.
- Use the smaller subagent when a subtask is easy enough for it to handle and can run in parallel with your local work.
- Do not delegate urgent blocking work when your immediate next step depends on that result.
- Keep work local when the subtask is too difficult to delegate well and when it is tightly coupled, urgent, or likely to block your immediate next step.

**Designing delegated subtasks**
- Subtasks must be concrete, well-defined, and self-contained.
- Delegated subtasks must materially advance the main task.
- Do not duplicate work between the main rollout and delegated subtasks.
- Narrow the delegated ask to the concrete output you need next.

**After you delegate**
- Call wait_agent very sparingly. Only call wait_agent when you need the result immediately for the next critical-path step.
- Do not redo delegated subagent tasks yourself; focus on integrating results or tackling non-overlapping work.

**Parallel delegation patterns**
- Run multiple independent information-seeking subtasks in parallel when you have distinct questions that can be answered independently.
- Split implementation into disjoint codebase slices and spawn multiple agents for them in parallel when the write scopes do not overlap.
```

This is long because it defines:

- permission boundary
- when to delegate
- when not to delegate
- task design constraints
- after-delegation behavior
- parallel delegation patterns

## Complete source example: `task`

```text
Launch a new agent to handle complex, multistep tasks autonomously.

When using the Task tool, you must specify a subagent_type parameter to select which agent type to use.

When to use the Task tool:
- When you are instructed to execute custom slash commands. Use the Task tool with the slash command invocation as the entire prompt. The slash command can take arguments. For example: Task(description="Check the file", prompt="/check-file path/to/file.py")

When NOT to use the Task tool:
- If you want to read a specific file path, use the Read or Glob tool instead of the Task tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use the Glob tool instead, to find the match more quickly
- If you are searching for code within a specific file or set of 2-3 files, use the Read tool instead of the Task tool, to find the match more quickly
- Other tasks that are not related to the agent descriptions above


Usage notes:
1. Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses
2. When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result. The output includes a task_id you can reuse later to continue the same subagent session.
3. Each agent invocation starts with a fresh context unless you provide task_id to resume the same subagent session (which continues with its previous messages and tool outputs). When starting fresh, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
4. The agent's outputs should generally be trusted
5. Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent. Tell it how to verify its work if possible (e.g., relevant test commands).
6. If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first. Use your judgement.

Example usage (NOTE: The agents below are fictional examples for illustration only - use the actual agents listed above):

<example_agent_descriptions>
"code-reviewer": use this agent after you are done writing a significant piece of code
"greeting-responder": use this agent when to respond to user greetings with a friendly joke
</example_agent_description>

<example>
user: "Please write a function that checks if a number is prime"
assistant: Sure let me write a function that checks if a number is prime
assistant: First let me use the Write tool to write a function that checks if a number is prime
assistant: I'm going to use the Write tool to write the following code:
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<commentary>
Since a significant piece of code was written and the task was completed, now use the code-reviewer agent to review the code
</commentary>
assistant: Now let me use the code-reviewer agent to review the code
assistant: Uses the Task tool to launch the code-reviewer agent
</example>

<example>
user: "Hello"
<commentary>
Since the user is greeting, use the greeting-responder agent to respond with a friendly joke
</commentary>
assistant: "I'm going to use the Task tool to launch the with the greeting-responder agent"
</example>
```

This is long because it includes:

- delegation capability
- required parameter behavior
- when-to-use
- when-not-to-use
- concurrency behavior
- hidden output handling
- task continuation behavior
- prompt design rules for subagents
- examples

Use this length when:

- the tool is broad
- tool choice is ambiguous
- the tool is easy to overuse
- the tool mutates state
- permissions matter
- workflows must happen in order
- failures require specific recovery
- output must be summarized or interpreted
- examples prevent common misuse

---

# 18. Prompt Burden Scoring

Use this scoring system to decide the maximum reasonable prompt length.

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| Breadth | narrow | moderate | can do many things |
| Mutation | read-only | limited changes | edits/deletes/external changes |
| External impact | local/internal | limited external | user-visible or remote effects |
| Statefulness | stateless | uses prior context | creates/persists state |
| Tool overlap | unique | some overlap | many nearby tools |
| Failure cost | low | recoverable | costly/destructive |
| Workflow complexity | one-step | few steps | procedural workflow |
| Overuse risk | unlikely | possible | highly likely |

Prompt tier:

| Total score | Tier | Shape |
|---:|---|---|
| 0–2 | Micro | one sentence |
| 3–5 | Short | one compact paragraph |
| 6–9 | Medium | 1–3 compact paragraphs |
| 10+ | Long | structured prose, bullets, examples allowed |

The score is an upper bound, not a command to be verbose.

Still trim.

---

# 19. Surface Form

The workpad can use headings.

The final prompt does not always need them.

Avoid mechanically outputting this structure:

```text
Use this tool when:
Do not use this tool when:
Related tool routing:
When using this tool:
This tool returns:
```

Use that structure only when it improves compliance.

Short natural form:

```text
Runs a shell command and returns its output.
```

Structured long form:

```text
## When to Use This Tool
```

```text
## When NOT to Use This Tool
```

```text
## Task States and Management
```

Use structure when the tool has many rules, states, or examples.

Use compact prose when the tool is narrow.

---

# 20. Naturalize and Trim

After collecting rules, rewrite them into the shortest natural prompt that preserves behavior.

Keep a sentence only if it changes:

- tool choice
- safe use
- output handling
- failure recovery
- state management
- learner value

Remove vague guidance.

Weak:

```text
Use this carefully.
```

Better:

```text
NEVER run destructive/irreversible git commands (like push --force, hard reset, etc) unless the user explicitly requests them
```

Weak:

```text
Make sure the edit works.
```

Better:

```text
The edit will FAIL if `oldString` is not found in the file with an error "oldString not found in content".
```

Weak:

```text
Use the right tool.
```

Better:

```text
File search: Use Glob (NOT find or ls)
Content search: Use Grep (NOT grep or rg)
Read files: Use Read (NOT cat/head/tail)
Edit files: Use Edit (NOT sed/awk)
Write files: Use Write (NOT echo >/cat <<EOF)
```

---

# 21. Final Checklist

Before finalizing a Buddy tool prompt, ask:

1. Does the prompt explain what the tool enables?
2. Does it define when Buddy should choose the tool?
3. Does it define when Buddy should not choose the tool?
4. Does it mention only truly related tools?
5. For each related tool mentioned, is there a concrete boundary where that tool wins?
6. Would naming the related tool prevent a likely mistake?
7. Are preconditions included only when correctness depends on them?
8. Are execution rules specific enough to prevent real mistakes?
9. Are permission boundaries explicit for sensitive actions?
10. Are failure modes specific and actionable?
11. Does output handling say what Buddy should do next?
12. Are state rules included for stateful tools?
13. Are examples included only when they clarify judgment?
14. Is the length justified by risk, overlap, state, or workflow?
15. Could any sentence be removed without changing behavior?

---

# 22. Final Rule

This guide is not a template generator.

It is a decision process.

The final tool prompt should be the shortest natural instruction that makes Buddy choose the right tool, use it safely, and continue the learning interaction effectively.

Do not add related tools merely because they are similar.

Add a related tool only when it changes a real decision.

When using the guide, produce a trace workbook first, then patch your way to the final prompt.