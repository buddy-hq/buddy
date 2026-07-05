# Session Debugging How-To

## Find the live OpenCode database

Buddy's runtime database is not necessarily under the Electron user-data directory. In dev builds, the renderer state may live under `~/Library/Application Support/ai.buddy.desktop.dev`, while OpenCode session data lives under the effective Buddy-owned XDG data root.

The most reliable way to find the active DB is to inspect the running Electron Node service:

```sh
ps -axo pid,ppid,stat,lstart,command | rg 'ai\\.buddy\\.desktop\\.dev|Buddy|Electron'
```

Find the `Electron Helper --type=utility --utility-sub-type=node.mojom.NodeService` process, then inspect its open files:

```sh
lsof -p <pid> | rg 'buddy/.*/opencode.*\\.db|buddy.*\\.db|opencode\\.db'
```

For a normal prod run, this should resolve to:

```text
/Users/<user>/.local/share/buddy/opencode/opencode.db
```

The same process environment shows why:

```sh
ps eww -p <pid> | tr ' ' '\n' | rg 'BUDDY_DATA_DIR|XDG_DATA_HOME|OPENCODE_DB'
```

## Inspect a session

Use `sqlite3` against the live DB path:

```sh
DB="${BUDDY_DATA_DIR:-$HOME/.local/share/buddy}/opencode/opencode.db"
SESSION_ID="ses_..."

sqlite3 -header -column "$DB" \
  "select id, title, directory, model, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, cost, datetime(time_created/1000,'unixepoch') as created, datetime(time_updated/1000,'unixepoch') as updated from session where id='$SESSION_ID';"
```

Count messages and parts:

```sh
sqlite3 -header -column "$DB" \
  "select count(*) as messages from message where session_id='$SESSION_ID';
   select json_extract(data,'$.role') as role, count(*) as count from message where session_id='$SESSION_ID' group by role;
   select json_extract(data,'$.type') as type, count(*) as count, sum(length(data)) as bytes from part where session_id='$SESSION_ID' group by type order by bytes desc;"
```

Find the largest persisted parts:

```sh
sqlite3 -header -column "$DB" \
  "select p.message_id, json_extract(m.data,'$.role') as role, json_extract(p.data,'$.type') as type, json_extract(p.data,'$.tool') as tool, length(p.data) as bytes, substr(p.data, 1, 240) as preview from part p join message m on m.id = p.message_id where p.session_id='$SESSION_ID' order by length(p.data) desc limit 20;"
```

Create a compact chronological artifact for one session before tracing code. This keeps raw tool outputs out of the debugging prompt while preserving the evidence needed to find context growth:

```sh
OUT="/tmp/buddy-session-context-audit-$SESSION_ID.json"
sqlite3 -json "$DB" "
with part_summary as (
  select
    p.message_id,
    json_group_array(json_object(
      'id', p.id,
      'type', json_extract(p.data,'$.type'),
      'tool', json_extract(p.data,'$.tool'),
      'text_bytes', length(json_extract(p.data,'$.text')),
      'text_prefix', substr(json_extract(p.data,'$.text'),1,160),
      'tool_input_bytes', length(json_extract(p.data,'$.state.input')),
      'tool_output_bytes', length(json_extract(p.data,'$.state.output')),
      'tool_path', json_extract(p.data,'$.state.input.filePath'),
      'tool_offset', json_extract(p.data,'$.state.input.offset'),
      'tool_limit', json_extract(p.data,'$.state.input.limit'),
      'tool_truncated', json_extract(p.data,'$.state.metadata.truncated'),
      'tool_line_start', json_extract(p.data,'$.state.metadata.display.lineStart'),
      'tool_line_end', json_extract(p.data,'$.state.metadata.display.lineEnd'),
      'tool_total_lines', json_extract(p.data,'$.state.metadata.display.totalLines'),
      'tool_compacted', json_extract(p.data,'$.state.time.compacted') is not null,
      'output_tail', substr(json_extract(p.data,'$.state.output'), max(1, length(json_extract(p.data,'$.state.output'))-220), 220)
    )) as parts
  from part p
  where p.session_id='$SESSION_ID'
  group by p.message_id
)
select
  m.id,
  json_extract(m.data,'$.role') as role,
  m.time_created,
  length(json_extract(m.data,'$.system')) as system_bytes,
  length(m.data) as message_row_bytes,
  json_extract(m.data,'$.tokens.input') as tokens_input,
  json_extract(m.data,'$.tokens.cache.read') as tokens_cache_read,
  json_extract(m.data,'$.tokens.output') as tokens_output,
  json_extract(m.data,'$.tokens.reasoning') as tokens_reasoning,
  json_extract(m.data,'$.tokens.total') as tokens_total,
  coalesce(ps.parts,'[]') as parts
from message m
left join part_summary ps on ps.message_id=m.id
where m.session_id='$SESSION_ID'
order by m.time_created;
" > "$OUT"
```

If the UI shows high context usage but the chat is short, compare `session.tokens_*` with `part` sizes and any tool results. Large `tokens_cache_read` values usually mean the provider reports previously cached input being reused, not necessarily that every turn has visible chat text.
