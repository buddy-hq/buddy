# Post-compaction recall

Use this command when a task has compacted and the user wants the complete conversational context restored. When the user references this file, execute the procedure; do not merely summarize these instructions.

## Outcome

Produce a chronological Markdown transcript from the current Codex task's raw local rollout, then read the entire generated transcript before resuming work.

The transcript must include:

- ordinary user messages;
- ordinary assistant messages and commentary;
- every structured question shown to the user, including its header, options, and option descriptions;
- every submitted structured answer, verbatim.

It must exclude:

- model reasoning;
- compaction records;
- injected environment, plugin, and repository instructions;
- shell commands and command output;
- non-question tool calls and tool output.

The `request_user_input` storage mechanism is the sole exception to the tool exclusion: the script converts only its user-visible prompt into an assistant question and only its submitted answer payload into a user answer. It does not copy the underlying call envelope.

## Procedure

1. Resolve the current task's thread ID with the Codex task-listing tool.
   - Match the active task by working directory, title, preview, and active status.
   - Do not guess an ID or select another task merely because it shares the repository.
2. From the repository root, run:

   ```sh
   bun ./script/post-compaction-recall.ts <thread-id>
   ```

3. The script locates the matching rollout below `~/.codex/sessions` and writes:

   ```text
   docs/local/post-compaction-recall/<thread-id>.md
   ```

   `docs/local/` is ignored by Git because transcripts can contain private conversation content.
4. Read the generated file completely. For a long transcript, get its line count and read consecutive, non-overlapping chunks until the final line. Creating the file without reading all of it does not restore context.
5. Confirm the prompt and answer counts printed by the script. A prompt without a structured answer must remain visibly unanswered; never infer or manufacture an answer.
6. Resume from the latest unresolved user decision or request found in the transcript. Briefly tell the user that recall is complete and name that resumption point.

## Options

Write to a user-requested durable path:

```sh
bun ./script/post-compaction-recall.ts <thread-id> --output <path.md>
```

Use a non-default Codex data directory:

```sh
bun ./script/post-compaction-recall.ts <thread-id> --codex-home <path>
```

Use an already-resolved rollout file:

```sh
bun ./script/post-compaction-recall.ts <thread-id> --source <rollout.jsonl>
```

The deterministic output path is regenerated when the command is run again for the same thread. Do not manually edit a generated transcript and expect those edits to survive.

## Why the raw rollout is required

The compact task-history API can return ordinary assistant text while omitting structured question prompts and the user's submitted answers. A transcript produced only from that API is incomplete. Use the raw rollout script for post-compaction recall and use the compact API only to identify the correct thread.

If the raw rollout cannot be found, stop and report that full recall is unavailable. Do not silently substitute a compact-history summary or call it lossless.
