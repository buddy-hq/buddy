# Agent Tool Comparison

A comparison of tools available across three agent platforms.

---

## OpenCode

**Implementation:** TypeScript files under `opencode/packages/opencode/src/tool/`

| Tool                                  | Description                             |
| ------------------------------------- | --------------------------------------- |
| `read` / `write`                      | File I/O                                |
| `edit` / `multiedit` / `apply_patch`  | File modification                       |
| `ls` / `glob` / `grep` / `codesearch` | File system navigation & searching      |
| `bash` / `batch`                      | Command execution                       |
| `todo`                                | Task tracking (`todoread`, `todowrite`) |
| `plan` / `task`                       | Task orchestration                      |
| `webfetch` / `websearch`              | Web interaction                         |
| `lsp`                                 | Language server protocol                |
| `question`                            | User input                              |
| `skill`                               | Agent skills                            |
| `external-directory`                  | External directory access               |

---

## Codex

**Implementation:** Rust handlers under `codex/codex-rs/core/src/tools/handlers/`

| Tool                                    | Description                   |
| --------------------------------------- | ----------------------------- |
| `read_file` / `list_dir` / `grep_files` | File system operations        |
| `apply_patch`                           | File modifications            |
| `shell` / `unified_exec`                | Command execution             |
| `js_repl`                               | JavaScript REPL               |
| `plan`                                  | Task tracking (`update_plan`) |
| `request_user_input`                    | User questions                |
| `view_image`                            | Image viewing                 |
| `mcp` / `mcp_resource`                  | MCP tool execution            |
| `search_tool_bm25`                      | BM25 codebase search          |
| `test_sync`                             | Testing utilities             |
| `multi_agents`                          | Sub-agent delegation          |
| `dynamic`                               | Dynamic tool handling         |

---

## Gemini CLI

**Implementation:** TypeScript files under `gemini-cli/packages/core/src/tools/`

| Tool                                                    | Description                        |
| ------------------------------------------------------- | ---------------------------------- |
| `read-file` / `read-many-files` / `write-file` / `edit` | File I/O and modification          |
| `ls` / `glob` / `grep`                                  | File system navigation & searching |
| `shell`                                                 | Command execution                  |
| `enter-plan-mode` / `exit-plan-mode`                    | Execution context switching        |
| `write-todos`                                           | Task tracking                      |
| `web-fetch` / `web-search`                              | Web interaction                    |
| `ask-user`                                              | User questions                     |
| `memoryTool`                                            | Persistent preferences             |
| `get-internal-docs`                                     | CLI documentation                  |
| `activate-skill`                                        | Enable capabilities                |
| `mcp-tool`                                              | MCP tool execution                 |

---

## Cross-Platform Equivalents

| OpenCode                             | Codex                | Gemini CLI       |
| ------------------------------------ | -------------------- | ---------------- |
| `read`                               | `read_file`          | `read-file`      |
| `write`                              | —                    | `write-file`     |
| `edit` / `multiedit` / `apply_patch` | `apply_patch`        | `edit`           |
| `ls`                                 | `list_dir`           | `ls`             |
| `glob`                               | —                    | `glob`           |
| `grep`                               | `grep_files`         | `grep`           |
| `codesearch`                         | `search_tool_bm25`   | —                |
| `bash`                               | `shell`              | `shell`          |
| `websearch`                          | —                    | `web-search`     |
| `webfetch`                           | —                    | `web-fetch`      |
| `question`                           | `request_user_input` | `ask-user`       |
| `plan` / `todo`                      | `plan`               | `write-todos`    |
| `skill`                              | —                    | `activate-skill` |
| —                                    | `mcp`                | `mcp-tool`       |
