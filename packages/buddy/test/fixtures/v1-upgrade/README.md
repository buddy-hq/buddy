# v1-upgrade fixture

State written by Buddy `main` (OpenCode v1) through its real runtime, for proving the v1 to v2 chat and credential import. Nothing here was hand-written except this README, `generate.sh` and `.gitignore`.

- Source: `main` at `b0efb20a934641da8f339d226cc7dffe4acc4cf8` (local `main`, 2026-10-09, vendored OpenCode `1.18.16`). `origin/main` was 5 commits ahead (`48dd1678aa`, release and Beta packaging only); none of those commits touch `vendor/`, `packages/opencode-adapter` or `packages/buddy/migration`.
- Generated: 2026-10-22 with Bun 1.3.13 on macOS.
- All tokens and keys are fake. No network was used: the model is a scripted OpenAI-compatible server on `127.0.0.1`, and main's own test network guard (`script/test-network.ts`) blocked every other host.

## How it was generated

`generate.sh` is the exact script. It embeds the TypeScript driver as a heredoc (so no `.ts` file sits in this package's typecheck scope), writes it into the temporary `main` worktree, runs it with `env -i` and every root under `/tmp/buddy-v1-fixture`, then copies the results here.

```sh
git -C <v2-upgrade checkout> worktree add --detach <tmp>/buddy-main main
(cd <tmp>/buddy-main && bun install --frozen-lockfile --ignore-scripts)
bash packages/buddy/test/fixtures/v1-upgrade/generate.sh <tmp>/buddy-main packages/buddy/test/fixtures/v1-upgrade
git worktree remove <tmp>/buddy-main
```

IDs and timestamps are time-based, so a rerun produces new ones; update the IDs below (or read them from `report.json`) after regenerating.

The driver:

1. Checks that `HOME`, `USERPROFILE`, `TMPDIR`/`TMP`/`TEMP`, all `XDG_*`, `BUDDY_TEST_HOME`, `BUDDY_TEST_XDG_ROOT`, `BUDDY_DATA_DIR`, `BUDDY_CACHE_DIR`, `BUDDY_STATE_DIR`, `BUDDY_GLOBAL_CONFIG_DIR`, `OPENCODE_CONFIG_DIR` and `BUDDY_ALLOWED_DIRECTORY_ROOTS` are inside the run root, and that no `BUDDY_RUNTIME_ROOT`, config-content, auth-content or provider-key variable is set. `NODE_ENV=test` also turns on main's own storage isolation assertion.
2. Writes a global `buddy.jsonc` with provider `test` / model `test-model` (`@ai-sdk/openai-compatible`, base URL = the local scripted server), learner memory off and auto-compaction off.
3. Imports main's backend (`packages/buddy/src/index.ts`) and drives it only through `app.request("/api/...")`:
   - `POST /api/open-projects/create` for the notebook,
   - `POST /api/session` and `POST /api/session/:id/message` with the same body shape main's web client sends (`content` plus non-text `parts`),
   - `POST /api/objects/mermaid/inline` (what the web client calls for a mermaid fence in assistant markdown),
   - `POST /api/notes/session/:id/message/:messageID/annotation`,
   - `POST /api/session/:id/summarize` for compaction,
   - `PUT /api/auth/openai` for the OpenAI OAuth entry.
4. Writes `mcp-auth.json` through main's vendored `McpAuth` service (`McpAuth.set`), because main's MCP auth routes (`/api/mcp/:name/auth*`) only store tokens after a live OAuth exchange.
5. Shuts down the way main's backend does (`POST /api/global/dispose`, `Instance.disposeAll()`, process exit), then copies `opencode.db` with `VACUUM INTO` from a read-only connection.

## Layout

| Path | What it is | Where main wrote it |
| --- | --- | --- |
| `opencode.db` | the runtime database (`VACUUM INTO` copy, 655 KB) | `$BUDDY_DATA_DIR/opencode/opencode.db` |
| `auth.json` | fake OpenAI OAuth entry | `$BUDDY_DATA_DIR/opencode/auth.json` |
| `mcp-auth.json` | fake remote MCP OAuth entry | `$BUDDY_DATA_DIR/opencode/mcp-auth.json` |
| `buddy-home/Fixture Notebook/` | the notebook: `.buddy/` folder plus `lesson.md` | `~/Documents/Buddy/Fixture Notebook` |
| `buddy-home/Notes/Chat notes/Photosynthesis basics.md` | chat note citing a session and message | `~/Documents/Buddy/Notes/Chat notes/` |
| `buddy-state/desktop-notebooks.json` | open-notebook registry | `$BUDDY_STATE_DIR/desktop-notebooks.json` |
| `buddy-state/notes-notebook-identities.json` | notebook identity used by the chat note | `$BUDDY_STATE_DIR/notes-notebook-identities.json` |
| `external/reading-list.txt` | the file attached from outside the notebook | `/tmp/buddy-v1-fixture/outside/reading-list.txt` |
| `report.json` | the driver's own record of every session, message and part ID | generator output |

`.gitignore` re-includes `.buddy/`, which `packages/buddy/.gitignore` ignores.

Absolute paths stored in the database and JSON files are the original run paths. Map them when restoring:

- Buddy Home: `/private/tmp/buddy-v1-fixture/home/Documents/Buddy` maps to `buddy-home/`
- Notebook: `/private/tmp/buddy-v1-fixture/home/Documents/Buddy/Fixture Notebook` maps to `buddy-home/Fixture Notebook/`
- External file: `/private/tmp/buddy-v1-fixture/outside/reading-list.txt` maps to `external/reading-list.txt`

## Chats

All three sessions have `project_id` = `global` (the notebook is not a git repository, so main's runtime files it under the global project, worktree `/`), `directory` = the notebook path, and `version` = `local` (main run from source). Every assistant message uses provider `test` and model `test-model`; the agent is `buddy` in both top-level chats, `general` in the child and `compaction` for the summary.

### Parent: `ses_e9bc348c6ffeVYp3hNj10v5E1K` "Photosynthesis basics"

| Message | Role | Content |
| --- | --- | --- |
| `msg_1643cb7a2001leIKcrGaUU9mMR` | user | Buddy's synthetic learner-context `system-reminder` text part, then "What is photosynthesis?" |
| `msg_1643cb7be001VNTXEe9rsxZkGN` | assistant | text reply (cited by the chat note) |
| `msg_1643cb8c2001oKaYdQyeh7XRgB` | user | asks to read `lesson.md` |
| `msg_1643cb8c7001LVtSrryDrLOmqC` | assistant | completed `read` tool call, part `prt_1643cb8e5001bLZBYzVsw0zHzv`, on `lesson.md` |
| `msg_1643cb8fd001s8q3lNULWNTGCg` | assistant | text after the tool result |
| `msg_1643cb958001k05skJjeP44Erb` | user | text plus inline image: file part `prt_1643cb958003fg0sm4gbIyBcqn`, `image/png`, `data:image/png;base64,...`, filename `leaf-diagram.png` |
| `msg_1643cb9770019P71uRZEkdckZV` | assistant | text reply |
| `msg_1643cb9d00015i2JpKo7mwonwj` | user | text, two synthetic text parts from main's read-on-attach ("Called the Read tool..." and the file content), then file part `prt_1643cb9d9004hkZvvavcu8UEn6`, `text/plain`, `file:///private/tmp/buddy-v1-fixture/outside/reading-list.txt`, with `source.type = file` |
| `msg_1643cb9e0001NsL2nET4T2K1CA` | assistant | text reply |
| `msg_1643cba440011fperf36WdO0vB` | user | asks for a helper |
| `msg_1643cba49001yGRbBu4qatYd5z` | assistant | completed `task` tool call, part `prt_1643cba6d001SXJkrRh1zfl1dE`, subagent `general`, `state.metadata.sessionId` = the child session |
| `msg_1643cbadd001icRd3iTZAkHV0M` | assistant | text after the task result |
| `msg_1643cbb44001qP4HJT29Dt1LHf` | user | asks for a diagram |
| `msg_1643cbb48001fDS5bS1RVBAACk` | assistant | text part `prt_1643cbb6c0018VHL6zs5xnhS0Z` containing a mermaid fence (origin of the notebook object) |
| `msg_1643cbbd6001KHPKDqhqTXU72h` | user | compaction part `prt_1643cbbd7001YQ0DTwO3l1tlE1` (`auto: false`) |
| `msg_1643cbbdb001BHrSSAhdDOPHQk` | assistant | compaction summary: `summary: true`, agent `compaction`, `parentID` = the compaction user message |
| `msg_1643cbc39001V7bzZuy0xPg18J` | user | turn after compaction |
| `msg_1643cbc3e001Cs9SBTTdxjDs5p` | assistant | text reply |

### Child: `ses_e9bc3458effeCghW9g8z1MN0VQ` "Summarise lesson (@general subagent)"

`parent_id` = `ses_e9bc348c6ffeVYp3hNj10v5E1K`. Created by the `task` tool. One user message (`msg_1643cba86001jCnZbRDVfWVlKo`, the task prompt) and one assistant text reply (`msg_1643cba9a001utgfb33tLBlMff`).

### Second top-level chat: `ses_e9bc34367ffeUhIRiVk04oUEhK` "Respiration follow-up"

One user message (`msg_1643cbccb001gaVRo7vqhm14zE`, with the learner-context reminder part) and one assistant text reply (`msg_1643cbcd1001lwyv8oVoYEm23s`).

## Notebook and notes files that cite chat IDs

- Mermaid object `01M5J3SEVYRETT9ZKXYQY7Z39Z` in `buddy-home/Fixture Notebook/.buddy/objects/v1/mermaid/`. Its `object.json` `origin` is `{ kind: "markdown", sessionID: "ses_e9bc348c6ffeVYp3hNj10v5E1K", messageID: "msg_1643cbb48001fDS5bS1RVBAACk", partID: "prt_1643cbb6c0018VHL6zs5xnhS0Z", segmentIndex: 0 }`. Indexed in `.buddy/objects/v1/_index/objects.json`.
- Chat note `buddy-home/Notes/Chat notes/Photosynthesis basics.md`: front matter `buddy-session-id: ses_e9bc348c6ffeVYp3hNj10v5E1K`, `buddy-notebook-id: 01M5J3SEWPMVS08BYP5QVTXK3H`, and the link `buddy://chat/ses_e9bc348c6ffeVYp3hNj10v5E1K?message=msg_1643cb7be001VNTXEe9rsxZkGN`.

## Credentials

- `auth.json`: `openai` = `{ type: "oauth", refresh, access, expires: 1893456000000, accountId: "fixture-account-0001" }`. `access` is an unsigned fake JWT whose payload carries `https://api.openai.com/auth.chatgpt_account_id = fixture-account-0001`, so main's account-ID extraction works on it.
- `mcp-auth.json`: `fixture-remote-mcp` = `{ tokens: { accessToken, refreshToken, expiresAt, scope }, clientInfo: { clientId, clientSecret, clientIdIssuedAt }, serverUrl: "https://mcp.example.invalid/mcp" }`.

## Database inspection

Read-only (`sqlite3 "file:opencode.db?mode=ro"`). `PRAGMA integrity_check` = `ok`, `PRAGMA foreign_key_check` = no rows.

| Table | Rows |
| --- | --- |
| `session` | 3 |
| `message` | 22 |
| `part` | 52 |
| `project` | 1 (`global`, worktree `/`) |
| `migration` (journal) | 38, from `20260127222353_familiar_lady_ursula` to `20260622202450_simplify_session_input` |
| `event` | 180 (`message.part.updated.1` 68, `message.updated.1` 67, `session.updated.1` 42, `session.created.1` 3) |
| `event_sequence` | 3 |
| `session_message` | 0 |
| `account`, `account_state`, `control_account`, `credential`, `data_migration`, `permission`, `project_directory`, `session_context_epoch`, `session_input`, `session_share`, `todo`, `workspace` | 0 |

- No `session_v2` table, and no table whose name contains `v2`.
- No `kv` table: main's schema does not have one.
- No `__drizzle_migrations` table: main's journal is the `migration` table.
- The copy is in rollback-journal mode (`journal_mode = delete`). `VACUUM INTO` does not keep WAL mode, and main's runtime switches the file back to WAL when it opens it. Main's shutdown left the live database's WAL unflushed; `VACUUM INTO` read it, so every committed row is in the copy.

## Not produced

- Shell (`bash`) tool call: not attempted. The completed `read` and `task` calls cover the tool-part shape.
- Rows in main's `session_message` (v2 projection) table: main's runtime does not write them for these chats, so the table is empty.
- Native-resource upload (`POST /api/notebook/uploads`): not used. The external attachment is a plain `file://` text file outside the notebook, which is what main's composer sends for a local-path attachment.
