# Find a production Buddy session by title

Use this runbook when a user gives a visible or renamed chat title and asks for a diagnosis of that
production session.

The goal is to resolve the title to an exact session ID, inspect only that session's durable
messages and parts, correlate the result with production logs, and avoid copying or mutating the
live database.

## Fast path

For a normal packaged Buddy installation, the production OpenCode database is:

```text
<home>/.local/share/buddy/opencode/opencode.db
```

On Windows, this normally resolves to:

```text
C:\Users\<user>\.local\share\buddy\opencode\opencode.db
```

On macOS and Linux, this normally resolves to:

```text
/Users/<user>/.local/share/buddy/opencode/opencode.db
```

or:

```text
/home/<user>/.local/share/buddy/opencode/opencode.db
```

Do not assume that Electron's `userData` directory contains the runtime database. Packaged Buddy
uses its Buddy-owned XDG data root for OpenCode state.

The effective path is:

```text
${BUDDY_DATA_DIR:-${XDG_DATA_HOME:-<home>/.local/share}/buddy}/opencode/opencode.db
```

`BUDDY_DATA_DIR` takes precedence over `XDG_DATA_HOME`.

## Reusable exporter

Use the repository script for the normal workflow:

```text
packages/buddy/script/export-session-trace.ts
```

Production title lookup and export:

```sh
bun packages/buddy/script/export-session-trace.ts \
  --channel prod \
  --title "120021" \
  --output docs/errors/session-120021.trace.json
```

The exporter:

- opens SQLite with `readonly: true` and `create: false`;
- resolves an exact title using a bound parameter;
- refuses to choose when multiple sessions share the title;
- accepts `--session-id` to disambiguate a known candidate;
- parses JSON-bearing SQLite fields into JSON objects;
- exports the settled session row;
- exports every table in the database that has a `session_id` column;
- exports the session's durable `event` rows and `event_sequence`; and
- writes no data to the live database.

Use an explicit session ID after disambiguation:

```sh
bun packages/buddy/script/export-session-trace.ts \
  --channel prod \
  --session-id "ses_..." \
  --output docs/errors/session.trace.json
```

An explicit database path overrides channel-based resolution:

```sh
bun packages/buddy/script/export-session-trace.ts \
  --database "/path/to/opencode.db" \
  --title "Session title" \
  --output "/path/to/session.trace.json"
```

## Development database

Non-packaged desktop development uses an isolated XDG root under Electron's development
`userData` directory. The default dev database paths are:

### Windows

```text
%APPDATA%\ai.buddy.desktop.dev\xdg\data\buddy\opencode\opencode.db
```

Normally:

```text
C:\Users\<user>\AppData\Roaming\ai.buddy.desktop.dev\xdg\data\buddy\opencode\opencode.db
```

### macOS

```text
~/Library/Application Support/ai.buddy.desktop.dev/xdg/data/buddy/opencode/opencode.db
```

### Linux

```text
${XDG_CONFIG_HOME:-~/.config}/ai.buddy.desktop.dev/xdg/data/buddy/opencode/opencode.db
```

Export a development session by title:

```sh
bun packages/buddy/script/export-session-trace.ts \
  --channel dev \
  --title "Session title" \
  --output docs/errors/dev-session.trace.json
```

If Electron uses a non-default development `userData` directory, pass it directly:

```sh
bun packages/buddy/script/export-session-trace.ts \
  --channel dev \
  --user-data "/custom/electron/user-data" \
  --title "Session title" \
  --output docs/errors/dev-session.trace.json
```

`--user-data` is the Electron development `userData` root itself. The exporter appends
`xdg/data/buddy/opencode/opencode.db`.

## Safety rules

- Treat the database as live production data.
- Open it read-only.
- Do not run migrations, checkpoints, vacuum, repair, or update statements.
- Do not copy only `opencode.db` while Buddy is running; recent rows may still be in
  `opencode.db-wal`.
- Prefer querying the live database in SQLite read-only mode, which reads the WAL consistently.
- Query only the session-related tables needed for the investigation.
- Do not commit raw transcripts, credentials, provider payloads, or tool outputs.
- Use bound parameters for user-supplied titles and session IDs.
- If multiple sessions have the same title, disambiguate by notebook directory and timestamps.

## Why this is the production path

`packages/desktop-electron/src/main/storage-paths.ts` resolves the packaged data directory using:

1. `BUDDY_DATA_DIR`, when configured;
2. `XDG_DATA_HOME`, when configured; or
3. `<home>/.local/share`;
4. then appends `buddy/opencode/opencode.db`.

Development builds are different. They use an isolated XDG root under Electron's development
`userData` directory. Never use a dev database when the user explicitly says the chat came from the
installed production app.

## Step 1: verify the database

### PowerShell

```powershell
$dbPath = Join-Path $HOME ".local\share\buddy\opencode\opencode.db"
Get-Item -LiteralPath $dbPath |
  Select-Object FullName, Length, LastWriteTime

Get-ChildItem -LiteralPath (Split-Path $dbPath) -Force |
  Where-Object Name -Like "opencode.db*"
```

Expected files while Buddy is running:

```text
opencode.db
opencode.db-shm
opencode.db-wal
```

### POSIX shell

```sh
DB="${BUDDY_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/buddy}/opencode/opencode.db"
ls -lh "$DB" "$DB-shm" "$DB-wal" 2>/dev/null
```

If the default path does not exist, inspect the running Buddy backend process as described in
[Session Debugging How-To](./howto.md#find-the-live-opencode-database).

## Step 2: resolve an exact title to a session

### Preferred cross-platform script

Python's standard library includes SQLite and supports a read-only URI. This version uses a bound
parameter and prints every exact-title match newest first.

```python
import json
import sqlite3
import sys
from pathlib import Path

title = sys.argv[1]
database_path = Path.home() / ".local" / "share" / "buddy" / "opencode" / "opencode.db"
database_uri = f"{database_path.resolve().as_uri()}?mode=ro"

with sqlite3.connect(database_uri, uri=True) as database:
    database.row_factory = sqlite3.Row
    rows = database.execute(
        """
        select
          id,
          title,
          directory,
          agent,
          model,
          time_created,
          time_updated
        from session
        where title = ? collate nocase
        order by time_updated desc
        """,
        (title,),
    ).fetchall()

print(json.dumps([dict(row) for row in rows], indent=2))
```

Invoke it with the title as a separate argument:

```text
python find_session.py "120021"
```

When running this ad hoc, pipe the script through `python -` instead of writing it into the
repository.

### SQLite CLI

If `sqlite3` is installed:

```sql
.parameter init
.parameter set @title '120021'

select
  id,
  title,
  directory,
  agent,
  model,
  datetime(time_created / 1000, 'unixepoch', 'localtime') as created,
  datetime(time_updated / 1000, 'unixepoch', 'localtime') as updated
from session
where title = @title collate nocase
order by time_updated desc;
```

Do not build SQL by directly interpolating a title supplied by a user.

## Step 3: disambiguate duplicate titles

A title is not a primary key. Renames and repeated generated titles can produce multiple matches.

Use:

- `directory` to match the notebook;
- `time_created` to match when the conversation began;
- `time_updated` to identify recent activity or the rename;
- `agent` and `model` to corroborate the visible UI; and
- the first user text part to confirm the intended chat.

Do not silently choose the newest match when more than one plausible session exists. Report the
candidate session IDs or use the notebook and approximate time supplied by the user.

To preview only the first user-authored text:

```sql
select
  m.session_id,
  m.id as message_id,
  substr(json_extract(p.data, '$.text'), 1, 240) as text_preview
from message m
join part p on p.message_id = m.id
where m.session_id = @session_id
  and json_extract(m.data, '$.role') = 'user'
  and json_extract(p.data, '$.type') = 'text'
  and json_extract(p.data, '$.text') not like '<system-reminder>%'
order by m.time_created, p.time_created
limit 1;
```

## Step 4: collect a compact session summary

Bind the selected ID as `@session_id`, then inspect the session before reading transcript content:

```sql
select
  id,
  title,
  directory,
  agent,
  model,
  cost,
  tokens_input,
  tokens_output,
  tokens_reasoning,
  tokens_cache_read,
  tokens_cache_write,
  time_created,
  time_updated,
  time_compacting
from session
where id = @session_id;

select
  count(*) as messages,
  min(time_created) as first_message,
  max(time_updated) as last_message
from message
where session_id = @session_id;

select
  json_extract(data, '$.role') as role,
  count(*) as count
from message
where session_id = @session_id
group by role;

select
  json_extract(data, '$.type') as type,
  count(*) as count,
  sum(length(data)) as bytes
from part
where session_id = @session_id
group by type
order by bytes desc;
```

This quickly reveals whether the session is short, tool-heavy, compacted, or dominated by a large
persisted result.

## Step 5: reconstruct the chronological message chain

Read message metadata without dumping full system prompts or tool outputs:

```sql
select
  m.id,
  json_extract(m.data, '$.role') as role,
  json_extract(m.data, '$.parentID') as parent_id,
  json_extract(m.data, '$.providerID') as provider_id,
  json_extract(m.data, '$.modelID') as model_id,
  json_extract(m.data, '$.finish') as finish,
  json_extract(m.data, '$.error.name') as error_name,
  json_extract(m.data, '$.error.data.message') as error_message,
  json_extract(m.data, '$.tokens.input') as tokens_input,
  json_extract(m.data, '$.tokens.cache.read') as tokens_cache_read,
  json_extract(m.data, '$.tokens.output') as tokens_output,
  json_extract(m.data, '$.time.created') as model_created,
  json_extract(m.data, '$.time.completed') as model_completed,
  m.time_created,
  m.time_updated
from message m
where m.session_id = @session_id
order by m.time_created, m.id;
```

Then inspect parts in the same order:

```sql
select
  p.message_id,
  p.id as part_id,
  json_extract(p.data, '$.type') as type,
  json_extract(p.data, '$.tool') as tool,
  json_extract(p.data, '$.state.status') as tool_status,
  json_extract(p.data, '$.state.time.start') as tool_started,
  json_extract(p.data, '$.state.time.end') as tool_ended,
  length(json_extract(p.data, '$.text')) as text_chars,
  substr(json_extract(p.data, '$.text'), 1, 240) as text_prefix,
  length(json_extract(p.data, '$.state.input')) as tool_input_chars,
  length(json_extract(p.data, '$.state.output')) as tool_output_chars,
  substr(json_extract(p.data, '$.state.error'), 1, 500) as tool_error,
  p.time_created,
  p.time_updated
from part p
where p.session_id = @session_id
order by p.time_created, p.id;
```

Only expand a specific part after the summary establishes that it is relevant.

## Step 6: inspect finish reasons and incomplete streams

Finish reasons are stored on both the assistant message and `step-finish` parts.

```sql
select
  m.id as message_id,
  json_extract(m.data, '$.finish') as message_finish,
  json_extract(m.data, '$.error.name') as error_name,
  json_extract(p.data, '$.reason') as step_finish,
  json_extract(m.data, '$.tokens.output') as output_tokens,
  m.time_created,
  m.time_updated
from message m
left join part p
  on p.message_id = m.id
 and json_extract(p.data, '$.type') = 'step-finish'
where m.session_id = @session_id
  and json_extract(m.data, '$.role') = 'assistant'
order by m.time_created;
```

For `unknown`, `length`, `content-filter`, or missing finishes, inspect the last text/reasoning/tool
part of the message. Look for:

- text or reasoning ending mid-sentence;
- an unterminated JSON object or string;
- a tool part whose input began but never reached a complete payload;
- no final learner-visible text;
- a tool-validation error immediately after the finish; and
- repeated messages with the same finish reason.

Do not infer truncation from `unknown` alone. Corroborate it with the persisted part endings and
timeline.

## Step 7: inspect tool failures without dumping outputs

```sql
select
  p.message_id,
  p.id as part_id,
  json_extract(p.data, '$.tool') as tool,
  json_extract(p.data, '$.state.status') as status,
  length(json_extract(p.data, '$.state.input')) as input_chars,
  substr(json_extract(p.data, '$.state.error'), 1, 1000) as error,
  json_extract(p.data, '$.state.time.start') as started,
  json_extract(p.data, '$.state.time.end') as ended
from part p
where p.session_id = @session_id
  and json_extract(p.data, '$.type') = 'tool'
order by p.time_created;
```

If the same tool fails repeatedly and later succeeds, compare input lengths and the exact boundary
where each failed input ends. That pattern can distinguish tool misuse from a truncated streamed
argument.

## Step 8: inspect durable events when ordering is ambiguous

OpenCode's durable event log records database mutations for the session aggregate:

```sql
select
  seq,
  type,
  length(data) as bytes
from event
where aggregate_id = @session_id
order by seq;
```

Typical types include:

```text
session.created.1
session.updated.1
message.updated.1
message.part.updated.1
```

Use events to confirm mutation order or recover an earlier version of a message/part. The final
`message` and `part` rows remain the easiest source for the settled state.

## Step 9: correlate production logs

On Windows, the packaged Electron log is normally:

```text
C:\Users\<user>\AppData\Roaming\ai.buddy.desktop\logs\main.log
```

Search only the incident window and exact session ID:

```powershell
$sessionID = "ses_..."
$logPath = Join-Path $env:APPDATA "ai.buddy.desktop\logs\main.log"

Select-String -LiteralPath $logPath -Pattern $sessionID |
  ForEach-Object Line
```

Check specifically for:

- `POST .../prompt_async`;
- `/abort`;
- HTTP 4xx or 5xx responses;
- timeout, retry, provider, stream, or cancellation records;
- process restarts; and
- successful tool-related API routes.

Absence of a log line is supporting evidence, not proof by itself. Combine it with durable message
errors, finish reasons, and timestamps.

## Step 10: trace the relevant runtime code

Start from the persisted state and then inspect code. For finish/loop incidents, the primary files
are:

```text
vendor/opencode/packages/opencode/src/session/processor.ts
vendor/opencode/packages/opencode/src/session/prompt.ts
vendor/opencode/packages/opencode/src/session/message-v2.ts
vendor/opencode/packages/opencode/src/session/retry.ts
```

Buddy integrates this vendored runtime through `packages/opencode-adapter`. Do not assume a failure
belongs to `packages/buddy/src` merely because it is visible in Buddy.

Use `git blame` and the vendor-sync commits to determine whether behavior is inherited from
upstream OpenCode or introduced by a Buddy-owned patch.

## Minimum evidence for a diagnosis

Before stating an exact cause, record:

1. The database path and whether it was the packaged production database.
2. The exact session ID selected for the supplied title.
3. The notebook directory and timestamps used to disambiguate it.
4. Message and part counts.
5. The chronological assistant finish reasons and durable errors.
6. Relevant tool statuses and exact validation errors.
7. Evidence for or against abort, timeout, HTTP failure, retry, and compaction.
8. The runtime branch that consumed the persisted finish/error state.
9. Any attribution boundary caused by missing provider request IDs or raw stream metadata.

## Reporting language

Use precise ownership language:

- **Confirmed local cause:** directly supported by database rows, logs, and code.
- **Confirmed provider/gateway boundary:** Buddy received incomplete or invalid normalized provider
  output.
- **Remote component unknown:** retained evidence cannot distinguish the gateway from its upstream
  provider.
- **Downstream effect:** a later tool/UI error caused by the earlier stream or runtime failure.

Avoid saying "the provider did it" when the evidence only establishes the combined gateway/provider
boundary.

## Example: title 120021

The title `120021` resolved to:

```text
ses_071644b91ffeXLzHVfchEnW96H
```

The detailed analysis is recorded in:

- [Session 120021: unknown provider finishes caused repeated silent stops](../errors/session-120021-unknown-finish-silent-stop.md)
