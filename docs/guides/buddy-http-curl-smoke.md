# Buddy HTTP Curl Smoke Guide

This guide is for future upstream-fetch and runtime-smoke work.

It shows how to smoke Buddy's backend directly over HTTP with `curl`
instead of relying on old helper scripts or the desktop UI.

## When to use this

Use this when you need to verify any Buddy-owned runtime boundary:

- dynamic tool search/load/call
- session prompt flows
- project route behavior
- route error shapes
- live backend behavior after adapter or upstream runtime changes

## Start the backend

From the repo root:

```bash
PORT=3011 bun run --cwd packages/buddy start -- --port 3011
```

Buddy usually binds to `127.0.0.1`.

If auth is enabled, export:

```bash
export BUDDY_SERVER_USERNAME='...'
export BUDDY_SERVER_PASSWORD='...'
```

Then add:

```bash
-u "$BUDDY_SERVER_USERNAME:$BUDDY_SERVER_PASSWORD"
```

to every `curl` command.

### Smoking an already-running desktop sidecar

When the Electron dev app starts Buddy, the backend may already be listening on
a random localhost port with generated basic auth. In that case, do not start a
second backend. Find the listening process and read the auth values from its
environment without printing the password:

```bash
PORT=58960
SIDECAR_PID=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t | head -1)

ENVBLOB=$(ps eww -p "$SIDECAR_PID" -o command= 2>/dev/null || true)
BUDDY_SERVER_USERNAME=$(printf '%s\n' "$ENVBLOB" | tr ' ' '\n' | sed -n 's/^BUDDY_SERVER_USERNAME=//p' | head -1)
BUDDY_SERVER_PASSWORD=$(printf '%s\n' "$ENVBLOB" | tr ' ' '\n' | sed -n 's/^BUDDY_SERVER_PASSWORD=//p' | head -1)

AUTH_ARGS=(-u "$BUDDY_SERVER_USERNAME:$BUDDY_SERVER_PASSWORD")
curl -sS "${AUTH_ARGS[@]}" "http://127.0.0.1:$PORT/api/health"
```

Use `bash` for snippets that define `AUTH_ARGS` arrays. `/api/healthz` is
usually unauthenticated, but `/api/health` and session routes normally require
auth in desktop dev.

## Basic health checks

Buddy wrapper health:

```bash
curl -sS http://127.0.0.1:3011/api/healthz
```

Vendored compatibility health:

```bash
curl -sS http://127.0.0.1:3011/api/health
```

Expected body:

```json
{"healthy":true}
```

## Directory handling

Most Buddy routes are directory-scoped.

Use a real absolute directory and URL-encode it:

```bash
DIRECTORY='/Users/prashantbhudwal/Code/buddy'
DIRECTORY_Q=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$DIRECTORY")
```

Then append:

```text
?directory=$DIRECTORY_Q
```

to route URLs.

## Session create gotcha

There is an important payload mismatch to remember:

- `POST /api/session` create currently expects:
  - `model: { "providerID": "...", "id": "..." }`
- `POST /api/session/:id/prompt_async` prompt override expects:
  - `model: { "providerID": "...", "modelID": "..." }`

Do not assume both routes use the same key shape.

If you send `modelID` to session create, you can get:

```json
{"error":"model.id: Missing key"}
```

## Choose a smoke model

Prefer a free `opencode` model for smokes so the smoke does not depend on a
paid or temporarily unavailable default:

```text
opencode/deepseek-v4-flash-free
```

If that model is unavailable on the machine, fetch providers and choose another
free model from the `opencode` provider:

```bash
curl -sS "${AUTH_ARGS[@]}" "http://127.0.0.1:$PORT/api/provider?directory=$DIRECTORY_Q"
```

Avoid depending on `opencode-go/kimi-k2.6` for repeatable smoke tests. It may be
present in one environment and fail in another.

## Create a fresh session

```bash
DIRECTORY='/Users/prashantbhudwal/Code/buddy'
DIRECTORY_Q=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$DIRECTORY")

CREATE_RESPONSE=$(curl -sS -X POST \
  -H 'content-type: application/json' \
  --data '{"title":"HTTP smoke","model":{"providerID":"opencode","id":"deepseek-v4-flash-free"}}' \
  "http://127.0.0.1:3011/api/session?directory=$DIRECTORY_Q")

SESSION_ID=$(printf '%s' "$CREATE_RESPONSE" | node -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const data = JSON.parse(s)
  process.stdout.write(data.id)
})')
```

## Always pin the model at prompt time

For smokes, do not rely on the session's inherited default model.

In this fetch, a real failure came from the prompt path resolving to the
current unavailable global default model even though the session record had
been created with a free `opencode` model.

For prompt smokes, always pass an explicit prompt-level model override:

```json
{
  "model": {
    "providerID": "opencode",
    "modelID": "deepseek-v4-flash-free"
  }
}
```

## Queue a prompt asynchronously

```bash
PROMPT_PAYLOAD='{
  "content":"Reply with exactly: SMOKE_OK",
  "model":{"providerID":"opencode","modelID":"deepseek-v4-flash-free"}
}'

curl -sS -o /tmp/buddy-prompt-body.json -w '%{http_code}' \
  -X POST \
  -H 'content-type: application/json' \
  --data "$PROMPT_PAYLOAD" \
  "http://127.0.0.1:3011/api/session/$SESSION_ID/prompt_async?directory=$DIRECTORY_Q"
```

Expected status:

```text
204
```

## Poll session status

The async runner can remove idle sessions from the status map instead of
leaving an explicit `"idle"` entry forever.

Use this rule:

- if you have seen a non-empty status and it later disappears for two polls,
  treat that as idle

Example poll:

```bash
STATUS_JSON=$(curl -sS "http://127.0.0.1:3011/api/session/status?directory=$DIRECTORY_Q")
printf '%s' "$STATUS_JSON" | node -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const data = JSON.parse(s)
  console.log(JSON.stringify(data, null, 2))
})'
```

## Read session messages

```bash
curl -sS "http://127.0.0.1:3011/api/session/$SESSION_ID/message?directory=$DIRECTORY_Q"
```

To extract assistant tool calls and final text without `jq`:

```bash
curl -sS "http://127.0.0.1:3011/api/session/$SESSION_ID/message?directory=$DIRECTORY_Q" | node -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const messages = JSON.parse(s)
  const toolNames = []
  let finalText = ""
  for (const message of messages) {
    if (message?.info?.role !== "assistant") continue
    for (const part of Array.isArray(message.parts) ? message.parts : []) {
      if (part?.type === "tool" && part?.state?.status === "completed" && typeof part.tool === "string") {
        toolNames.push(part.tool)
      }
      if (part?.type === "text" && typeof part.text === "string") {
        finalText += part.text
      }
    }
  }
  console.log(JSON.stringify({ toolNames, finalText }, null, 2))
})'
```

## Managed object smoke

For managed object storage changes, smoke both sides of the boundary:

1. prompt-driven tool execution creates or presents a managed object
2. `/api/objects` indexes it from disk
3. typed object routes can read the object payloads
4. at least one negative case returns a non-500 status with:

```json
{"error":"..."}
```

Start with an empty managed object index:

```bash
curl -sS "http://127.0.0.1:3011/api/objects?directory=$DIRECTORY_Q" | node -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const data = JSON.parse(s)
  if (!Array.isArray(data.objects) || !Array.isArray(data.loadErrors)) {
    throw new Error("Unexpected object index shape")
  }
  console.log(JSON.stringify({ objects: data.objects.length, loadErrors: data.loadErrors.length }))
})'
```

### Prompt-generated object checks

Do not only seed fixture files. For flows that are meant to be agent-facing,
also send prompts that exercise the same multi-step behavior the product uses:
the agent may write a file and then present it, delegate to a subagent that
saves the object, or call a rendering tool directly. Verify the completed flow
through assistant tool metadata when it is surfaced directly, and always verify
the stored object through `/api/objects`.

Mermaid known-good prompt:

```text
Smoke test only. Call render_mermaid exactly once with source `flowchart LR\nA[Smoke]-->B[OK]` and alt `HTTP smoke Mermaid diagram`. Then reply with exactly: MERMAID_OBJECT_SMOKE_OK
```

Expected:

- completed assistant tool parts include `render_mermaid`
- final assistant text contains `MERMAID_OBJECT_SMOKE_OK`
- tool metadata contains `buddyObjectResult.primaryRef.objectID`
- `GET /api/objects?directory=$DIRECTORY_Q&kind=mermaid` includes that ID

Repeat the same product-level flow for other object-producing features when
their feature is in scope:

- `present_html_widget`: first create a real `.html` file in the temp
  workspace, then prompt Buddy to present that exact file path. In broader
  behavior smokes, let the agent write the HTML first and then present the file,
  because that is the normal file-first authoring path.
- `present_media`: first create a real local file, then prompt Buddy to
  present it with `present_media`; auto-ingestion should happen as part of the
  presentation flow. Media manifests retain file references, but typed reads
  and the unified index refresh availability from disk. For a multi-item
  presentation, delete one original file after presentation and verify the
  next index read reports that item as `missing` while leaving the other item
  `available`. Delete all originals and verify every item is unavailable; the
  Library Media tab should exclude that presentation.
- Question sets: `save_question_set` is owned by the `question-set-author`
  subagent, not by the primary Buddy agent. Prompt the primary agent to use the
  `task` tool with `subagent_type: "question-set-author"` and ask that subagent
  to save a one-question MCQ. The main chat renders the saved object from task
  metadata, so verify the `task` flow completes, the new `question-set` object
  appears in the managed object index, and public reads omit correct-answer
  fields.
- Flashcards: `save_flashcard_deck` is owned by the `flashcard-author`
  subagent, not by the primary Buddy agent. Prompt the primary agent to use the
  `task` tool with `subagent_type: "flashcard-author"` and ask that subagent to
  save a one-card deck. The main chat renders the saved object from task
  metadata, so verify the `task` flow completes, the new `flashcard-deck`
  object appears in the managed object index, then verify `queued-cards` and
  `reviews`. See [Flashcards](../learning/library/flashcards.md) for the
  scheduler contract.
- `render_figure`: prompt for a small geometry spec and verify the SVG raw
  route.
- `render_freeform_figure`: prompt for a simple SVG and verify the SVG raw
  route.

For subagent-owned objects, the primary session transcript may only show the
completed `task` tool part. Treat the managed object index as the source of
truth for the produced `objectID`: capture the current IDs before prompting,
poll until idle, then select the new or newest object of the expected kind from
`/api/objects?directory=$DIRECTORY_Q&kind=...`.

When a prompt smoke asks the agent to create or edit a local file first, the
generic OpenCode `write` tool may ask for `edit` permission. Raw HTTP smokes do
not have the desktop approval UI, so either pre-grant edit permission when
creating the smoke session:

```json
{
  "title": "HTTP file-first smoke",
  "model": { "providerID": "opencode", "id": "deepseek-v4-flash-free" },
  "permission": [
    { "permission": "edit", "pattern": "*", "action": "allow" }
  ]
}
```

or poll and answer pending permission requests:

```bash
curl -sS "http://127.0.0.1:3011/api/permission?directory=$DIRECTORY_Q"
curl -sS -X POST \
  -H 'content-type: application/json' \
  --data '{"reply":"once"}' \
  "http://127.0.0.1:3011/api/permission/$REQUEST_ID/reply?directory=$DIRECTORY_Q"
```

If a session remains busy with a running `write` tool and no object-producing
tool call, abort it with `POST /api/session/:sessionID/abort`. Treat that as a
file-edit permission smoke issue, not an object storage failure; rerun with
explicit edit permission before judging the product-level file-first flow.

If prompt generation is temporarily blocked by model availability, do not call
the managed object smoke complete. You can still run fixture-backed route
checks to localize whether the failure is in generation, storage, or HTTP
serving.

### Typed object route checks

After prompt generation or fixture seeding, exercise the typed routes. Keep a
few direct `curl` checks for independent HTTP-contract coverage, especially the
managed object index shape and one negative error body. For the longer
typed-route matrix, prefer the generated `@buddy/sdk` client when it is
available; that also verifies SDK generation and keeps path/query construction
out of ad hoc smoke scripts.

For normalized learner objects, the current route families are:

```text
GET /api/objects?directory=$DIRECTORY_Q
GET /api/objects?directory=$DIRECTORY_Q&kind=figure

GET /api/objects/mermaid/:objectID/source
PUT /api/objects/mermaid/:objectID/render-record
GET /api/objects/mermaid/:objectID/render-record

GET /api/objects/question-set/:objectID/questions
POST /api/objects/question-set/:objectID/attempts

GET /api/objects/flashcard-deck/:objectID/deck
GET /api/objects/flashcard-deck/:objectID/queued-cards
POST /api/objects/flashcard-deck/:objectID/reviews

GET /api/objects/html-widget/:objectID/source
GET /api/objects/html-widget/:objectID/runtime

GET /api/objects/media-presentation/:objectID/raw/:itemID
GET /api/objects/media-presentation/:objectID/items/:itemID/availability

GET /api/objects/figure/:objectID/raw
GET /api/objects/freeform-figure/:objectID/raw
```

Mermaid render-record GET returns an envelope, not the record at the response
root:

```json
{
  "renderKey": "...",
  "render": {
    "status": "rendered"
  }
}
```

So assert `data.render.status`, not `data.status`.

For negative object route checks, use a syntactically valid missing ULID so
you test not-found mapping, not only ID validation:

```bash
curl -sS -o /tmp/buddy-object-negative.json -w '%{http_code}' \
  "http://127.0.0.1:3011/api/objects/figure/01ARZ3NDEKTSV4RRFFQ69G5FAV?directory=$DIRECTORY_Q"

cat /tmp/buddy-object-negative.json
```

Expected:

- status `404`
- body has `{"error":"..."}`
- no `Unhandled Buddy route error` appears in the backend log

If a typed object route returns `500` for a missing object while the raw route
returns `404`, check whether that route's feature-specific mapper delegates to
the shared object route error mapper. Metadata reads should map store
not-found errors through the Buddy-standard HTTP error body.

## Timing a prompt

To diagnose pre-LLM delay, capture only the log slice produced by the smoke:

```bash
LOG="$HOME/Library/Logs/Buddy Dev/main.log"
START_SIZE=$(wc -c < "$LOG")

# Run session create, prompt_async, and polling here.

tail -c +$((START_SIZE + 1)) "$LOG" > /tmp/buddy-smoke-log-slice.log
```

Read the timing lines in order:

- `service=session.tools status=started resolveTools` marks the start of
  tool-definition resolution for the prompt.
- `service=tool.registry` lines are OpenCode tool-definition resolution, not
  new Buddy tool registration.
- `service=session.tools status=completed duration=... resolveTools` is the
  total time spent resolving all available tools for the prompt.

If `session.tools` is slow but individual `tool.registry` lines are fast, check
the same slice for `service=mcp` lines between `session.tools started` and
`session.tools completed`. OpenCode starts configured MCP servers while
resolving tools:

```bash
rg 'service=(session\.tools|tool\.registry|mcp)|resolveTools' /tmp/buddy-smoke-log-slice.log
```

A repo or user OpenCode config can provide those MCP servers. In this repo,
`opencode.jsonc` configures `shadcn` and `tanstack` MCPs, and Buddy passes
configured MCP entries through its OpenCode config overlay. A slow or broken
MCP startup can therefore look like a tool-registration delay even when Buddy's
own plugin tools are already loaded.

## Dynamic tool smoke

Use one prompt that forces the whole chain:

1. `learning_tool_search`
2. `learning_tool_load`
3. dynamic tool execution
4. final assistant text marker

Known-good prompt shape:

```text
Smoke test only. Execute these steps in order and then stop:
1. Call learning_tool_search with query "stepwise solve".
2. Call learning_tool_load with the exact first tool id returned by step 1.
3. Call the loaded dynamic tool to solve 19 + 23.
4. Reply with exactly: STEPWISE_DYNAMIC_RESMOKE_OK
```

Success criteria:

- completed assistant tool parts include:
  - `learning_tool_search`
  - `learning_tool_load`
  - `stepwise_solve_dynamic`
- final assistant text contains:
  - `STEPWISE_DYNAMIC_RESMOKE_OK`

If load succeeds but the dynamic tool is still unavailable in the same run,
inspect:

- [packages/opencode-adapter/src/session-live.ts](/Users/prashantbhudwal/Code/buddy/packages/opencode-adapter/src/session-live.ts)
- [packages/opencode-adapter/docs/dynamic-tools.md](/Users/prashantbhudwal/Code/buddy/packages/opencode-adapter/docs/dynamic-tools.md)

## Project route smoke

The important regression in this fetch was project identity collapse across
fresh no-remote git repos with identical initial commits.

Use fixed commit timestamps to force the collision scenario:

```bash
TMPDIR=$(mktemp -d /tmp/buddy-project-smoke-XXXXXX)

make_repo() {
  name="$1"
  dir="$TMPDIR/$name"
  mkdir -p "$dir"
  git -C "$dir" init -q
  printf '# %s\n' "$name" > "$dir/README.md"
  git -C "$dir" add README.md
  GIT_AUTHOR_DATE='2026-01-01T00:00:00Z' \
  GIT_COMMITTER_DATE='2026-01-01T00:00:00Z' \
    git -C "$dir" \
      -c user.email=buddy@test.local \
      -c user.name='Buddy Test' \
      commit -qm init
  realpath "$dir"
}

FIRST_REPO=$(make_repo first)
SECOND_REPO=$(make_repo second)
TARGET_REPO=$(make_repo target)
mkdir -p "$TARGET_REPO/nested"
```

Smoke the routes:

```bash
curl -sS -G --data-urlencode "directory=$FIRST_REPO" \
  'http://127.0.0.1:3011/api/project/current'

curl -sS -G --data-urlencode "directory=$SECOND_REPO" \
  'http://127.0.0.1:3011/api/project/current'

curl -sS -G --data-urlencode "directory=$TARGET_REPO/nested" \
  'http://127.0.0.1:3011/api/project/current'

curl -sS 'http://127.0.0.1:3011/api/project'
```

Success criteria:

- each repo gets a distinct ID
- target nested directory resolves to the target repo worktree
- `/api/project` includes the target repo

To verify updates:

```bash
PROJECT_ID='...'
curl -sS -X PATCH \
  -H 'content-type: application/json' \
  --data '{"name":"HTTP smoke renamed"}' \
  "http://127.0.0.1:3011/api/project/$PROJECT_ID"
```

Expected:

- `200`
- returned project has the new `name`

## Negative cases worth checking

Malformed JSON:

```bash
curl -i -sS -X POST \
  -H 'content-type: application/json' \
  --data '{bad json' \
  "http://127.0.0.1:3011/api/session/$SESSION_ID/prompt_async?directory=$DIRECTORY_Q"
```

Missing session:

```bash
curl -i -sS -X POST \
  -H 'content-type: application/json' \
  --data '{"content":"missing session smoke","model":{"providerID":"opencode","modelID":"deepseek-v4-flash-free"}}' \
  "http://127.0.0.1:3011/api/session/ses_missing/prompt_async?directory=$DIRECTORY_Q"
```

For these route-level smokes, check both:

- HTTP status code
- Buddy-standard error body shape:

```json
{"error":"..."}
```

## Practical rules

- Smoke the live backend, not only tests.
- Prefer real `curl` calls for changed Buddy-owned routes.
- Use explicit prompt-level model overrides.
- Use absolute directory paths.
- Do not assume the async status map keeps idle entries forever.
- For dynamic tools, verify actual assistant tool parts, not only route `204`.
- For object-producing tools, verify prompt-created objects through both the
  managed object index and typed read/raw/action routes.
- For managed object negative cases, include one valid-but-missing ULID route check
  and require a non-500 `{"error":"..."}` response.
- If you change route error mapping, restart the backend before re-running curl
  checks. A still-running dev server will keep the old mapper.
- For project identity issues, use fresh fixed-date repos so collisions are
  deterministic.
