---
name: use-cursor
description: use cursor models as subagents via Cursor CLI. Use when the user asks to use cursor.
---


## Invariants [only break if user explicitly asks; warn user when asked, before execution]

- use cursor models through cursor cli
- only use cursor-grok-4.6
- select reasoning based on swe scores
- only use high/extra-high
- never use fast variants of the models
- run all prompts in yolo/skip permissions mode
- trust the workspace
- request json output — session id, duration, etc. so the session can be inspected later
- if possible; run commands in background terminal so you can continue working while the subagent runs.
  - if you are codex: exec_command tool rather than shell command
- first prompt always appends: never use subagents for this chat

## SWE Scores

- cursor-grok-4.6
  - xhigh: 66.7%
  - high: 65.2%
- context
  - sota
    - claude-opus-5 max: 73.6%
    - gpt-5.6-sol max: 72.7%
    - gpt-5.6-terra max: 69.6%
  - log scale: 73 vs 66 is a large gap

## Definitions

Complicated = many parts, but knowable. Cause and effect exist in advance. Experts can take it apart, analyze it, and put it back. A jet engine, a tax return, sending a rocket to the moon. Approach: sense → analyze → respond. You can have a recipe.

Complex (the noun is complexity) = many interacting parts, not predictable in advance. Cause and effect only show up in hindsight. The whole is more than the parts (emergence). A rainforest, a market, a team, raising a child.

## What it's good for (complicated)

65–66% DeepSWE: reliable when work is hard because it is large, not because the outcome is unknowable.

- many files, logic still straight-line
- refactors
- audits
- follow a given plan

## What not to depend on it for (complex)

- judgement calls
- system design
- high-risk work
- work that spans systems and has second-order effects

## high vs xhigh

- rank tasks on complexity scale: 1-10
- high: 1-4
- xhigh: 4-6
- greater than 6: Never use grok

## Prototype

`$CA create-chat` → `$SID`

```sh
$CA -p --output-format json --yolo --trust --model cursor-grok-4.6-high --resume $SID '<prompt> never use subagents for this chat'
```

xhigh: `cursor-grok-4.6-xhigh`

## Workflow

1. Find
  `which -a cursor-agent agent cursor`
   follow symlinks
   `$CA --help` / `about` must say Cursor Agent
   that binary = `$CA`
2. Help
  `$CA --help`
   learn create-chat, resume, print, json, yolo, trust
3. Create Chat
  `$CA create-chat` → `$SID`
4. Send Prompt
  run in background
   resume `$SID`, print + json, yolo, trust, model from Invariants
   do not use stream-json
5. Steer Subagent [if you need to update the subagent, stop it, change its direction]
  kill the process to stop the turn
   `$CA --resume $SID` + new prompt to continue the same thread

## Find chat from session id

`$SID` = uuid from `create-chat` or json `session_id`

Cursor home (do not assume a username):

- `$CURSOR_HOME` if set
- else `$XDG_CONFIG_HOME/cursor` if that dir exists
- else `$HOME/.cursor` (Windows: `%USERPROFILE%\.cursor`)

1. Find by id (works even if cwd/hash unknown)
  `find "$CURSOR_HOME" -type d -name "$SID"`
   confirm: `meta.json` present and/or `$SID.jsonl`
2. Transcript (readable jsonl)
  `$CURSOR_HOME/projects/*/agent-transcripts/$SID/$SID.jsonl`
3. Store (resume source)
  `$CURSOR_HOME/chats/<workspace-hash>/$SID/`
  - `meta.json` — cwd, timestamps
  - `store.db` — sqlite `blobs` + `meta`
   workspace-hash is md5 of that chat’s cwd; do not hardcode it — read `meta.json` or find `$SID`
