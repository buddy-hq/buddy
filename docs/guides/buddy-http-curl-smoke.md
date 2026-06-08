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
- For project identity issues, use fresh fixed-date repos so collisions are
  deterministic.
