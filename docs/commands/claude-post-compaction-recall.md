# Claude post-compaction recall

Use this command when work started in a Claude Code or Claude desktop session and its complete local conversational context must be restored in another agent.

## Outcome

Produce a chronological, token-efficient transcript from Claude's raw local JSONL, then read the entire generated transcript before resuming work.

The transcript includes:

- ordinary user messages;
- ordinary assistant messages;
- assistant thinking, verbatim when Claude stored it in plaintext;
- compact markers for image attachments;
- every `AskUserQuestion` prompt, its options, and submitted answer.

It excludes ordinary tool calls and results, system and attachment metadata, thinking signatures, sidechains, and injected UI context. If Claude stored a thinking block as encrypted `redacted_thinking`, the transcript records `[redacted by Claude]`; plaintext that was never stored cannot be recovered.

## Procedure

1. Resolve the Claude session reference from the supplied local metadata. The raw rollout UUID is its `cliSessionId`. The command accepts either that UUID or the metadata's `local_<UUID>` session ID.
2. From the repository root, run:

   ```sh
   bun ./script/claude-post-compaction-recall.ts <session-id>
   ```

3. The script locates `~/.claude/projects/**/<cli-session-id>.jsonl` and writes:

   ```text
   docs/local/post-compaction-recall/claude/<cli-session-id>.md
   ```

   `docs/local/` is ignored by Git because transcripts can contain private conversation content.
4. Read the generated file completely. For a long transcript, use its line count and read consecutive, non-overlapping chunks through the final line.
5. Confirm the recovery counts printed by the script. Resume from the latest unresolved user request.

## Compact transcript key

The generated file deliberately avoids blockquotes, repeated headings, and extra blank lines:

- `U` — user message
- `A` — assistant message
- `T` — assistant thinking
- `I` — image marker
- `Q` — structured question
- `R` — submitted answer or dismissal

Consecutive entries of the same kind are coalesced after omitted tool traffic. Their original text remains in chronological order.

## Options

Use a Claude desktop `local_<UUID>` directly; the script resolves its `cliSessionId` below `~/Library/Application Support/Claude/claude-code-sessions`:

```sh
bun ./script/claude-post-compaction-recall.ts local_<UUID>
```

Write to a requested path:

```sh
bun ./script/claude-post-compaction-recall.ts <session-id> --output <path.md>
```

Use non-default Claude data directories:

```sh
bun ./script/claude-post-compaction-recall.ts <session-id> \
  --claude-home <path> \
  --claude-app-home <path>
```

Use an already-resolved rollout:

```sh
bun ./script/claude-post-compaction-recall.ts <session-id> --source <session.jsonl>
```

The deterministic output is regenerated on every run. Do not manually edit it and expect those edits to survive.

## Why raw JSONL is required

Claude desktop metadata records the title, repository, and `cliSessionId`, but not the conversation body. Full recall requires the matching raw JSONL below `~/.claude/projects`. If it cannot be found, stop and report that full recall is unavailable; do not silently substitute metadata or a compact cloud summary and call it complete.
