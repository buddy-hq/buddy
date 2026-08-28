---
name: use-antigravity-gemini
description: use Gemini 3.7 Flash as subagents via agy CLI. Use when the user asks to use agy. gemini models are unreliable; never invoke without user's explicit direction.
---


## Invariants [only break if user explicitly asks; warn user when asked, before execution]

- use Gemini 3.7 Flash through agy cli
- only use gemini-3.7-flash
- select reasoning based on swe scores
- only use medium/high
- never use low
- run all prompts with --dangerously-skip-permissions
- always `--add-dir="$PWD"` — tools do not use process cwd; without this they run in `$AGY_HOME`
- request json output — conversation_id, duration, usage, so the session can be inspected later
- if possible; run commands in background terminal so you can continue working while the subagent runs
- attach the prompt with `-p='...'` — `-p` consumes the next argv token

## SWE Scores

- gemini-3.7-flash
  - medium: 65.5%
  - high: 65.3%
- context
  - sota
    - claude-opus-5 max: 73.6%
    - gpt-5.6-sol max: 72.7%
    - gpt-5.6-terra max: 69.6%
  - log scale: 73 vs 65 is a large gap

## Definitions

Complicated = many parts, but knowable. Cause and effect exist in advance. Experts can take it apart, analyze it, and put it back. A jet engine, a tax return, sending a rocket to the moon. Approach: sense → analyze → respond. You can have a recipe.

Complex (the noun is complexity) = many interacting parts, not predictable in advance. Cause and effect only show up in hindsight. The whole is more than the parts (emergence). A rainforest, a market, a team, raising a child.

## What it's good for (complicated)

~65% DeepSWE: reliable when work is hard because it is large, not because the outcome is unknowable.

- many files, logic still straight-line
- refactors
- audits
- follow a given plan

## What not to depend on it for (complex)

- judgement calls
- system design
- high-risk work
- work that spans systems and has second-order effects

## medium vs high

- rank tasks on complexity scale: 1-10
- medium/high: 1-4
- high: 4-5
- greater than 5: Never use flash

## Workflow

1. Find
  `which -a agy`
   follow symlinks
   `$AGY --help` must say `Usage of agy`
   that binary = `$AGY`
2. Help
  `$AGY --help`
   learn print, json, conversation, continue, add-dir, dangerously-skip-permissions, model, effort
3. Create Chat
   `$AGY --output-format json --dangerously-skip-permissions --add-dir="$PWD" --model gemini-3.7-flash-high -p='ready'`
   wait for json → `conversation_id` → `$SID`
   (agy has no create-chat; this is a cheap turn to get the id)
4. Send Prompt
   run in background
   `$AGY --conversation $SID --output-format json --dangerously-skip-permissions --add-dir="$PWD" --model gemini-3.7-flash-high -p='<prompt>'`
   do not use stream-json
5. Steer Subagent [if you need to update the subagent, stop it, change its direction]
   SIGINT / TTY Ctrl+C to stop the turn
   `--conversation $SID` + new prompt to continue the same thread

## Find chat from conversation id

`$SID` = `conversation_id` from json

agy home (do not assume a username):

- `$AGY_HOME` if set
- else `$HOME/.gemini/antigravity-cli` (Windows: `%USERPROFILE%\.gemini\antigravity-cli`)
- CLI store is `antigravity-cli`, not the IDE `antigravity` dir

1. Find by id
  `find "$AGY_HOME" -name "$SID.db"`
   confirm sqlite file exists
2. Store
  `$AGY_HOME/conversations/$SID.db`
   sqlite tables: `steps`, `trajectory_meta`, `gen_metadata` (payloads are blobs)
