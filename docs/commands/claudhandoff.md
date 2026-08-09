# Claude conversation handoff

Use this command when the user wants to continue work from a Claude conversation in the current agent. When the user references this file, execute the procedure; do not merely summarize these instructions.

## Expected input

The user will provide:

- the Claude session title; and
- optionally, a screenshot of the session or other identifying context such as the repository, approximate time, or last message.

The user does not need to find the raw Claude CLI session ID. Resolving the correct session is part of this handoff.

## Outcome

Identify the exact Claude session from local metadata, generate a token-efficient transcript from its raw JSONL with `claude-post-compaction-recall.ts`, read the entire transcript, and continue from the latest unresolved user request.

## Procedure

1. Search local Claude desktop metadata below:

   ```text
   ~/Library/Application Support/Claude/claude-code-sessions/**/*.json
   ```

2. Match the supplied title against each metadata record's `title`. Use the screenshot and any supplied repository, time, model, error, or last-message context to disambiguate.
   - Prefer an exact title match.
   - Confirm that `cwd` or `originCwd` matches the repository when the repository is known.
   - Use `createdAt`, `lastActivityAt`, `completedTurns`, and `error` as additional evidence.
   - Ignore unrelated files such as `scheduled-tasks.json`.
   - Do not guess when multiple plausible sessions remain. Report the candidates and ask the user to identify the correct one.
3. Read the selected metadata record and obtain both:
   - `sessionId`, usually `local_<UUID>`; and
   - `cliSessionId`, the UUID of the raw Claude JSONL.
4. Confirm that the raw rollout exists below:

   ```text
   ~/.claude/projects/**/<cliSessionId>.jsonl
   ```

5. From the repository root, run either form:

   ```sh
   bun ./script/claude-post-compaction-recall.ts <cliSessionId>
   ```

   ```sh
   bun ./script/claude-post-compaction-recall.ts <local_sessionId>
   ```

6. The script writes:

   ```text
   docs/local/post-compaction-recall/claude/<cliSessionId>.md
   ```

7. Read the generated transcript completely. Get its line count, then read consecutive, non-overlapping chunks through the final line. Creating the transcript without reading all of it does not complete the handoff.
8. Confirm the script's recovery counts. The transcript retains user messages, assistant messages, plaintext assistant thinking, image markers, and structured questions and answers while omitting ordinary tool noise.
9. Briefly tell the user that the Claude handoff is complete, name the session that was ingested, and identify the latest unresolved request from which work will resume.

## Discovery rules

- Use the local metadata and raw JSONL paths above. Do not open or control the Claude app, Chrome, or another browser merely to locate a locally recorded session.
- A screenshot is supporting identification evidence, not authority to choose a weak title match.
- A containing directory UUID is not necessarily the conversation ID. Use the selected metadata file's `cliSessionId` for raw transcript lookup.
- A metadata file alone is not a complete transcript.
- Do not substitute a cloud summary, title record, compact history, repository diff, or remembered context and describe it as full ingestion.
- If the raw JSONL is missing, stop and state that complete local handoff is unavailable.

## Related command

The transcript format, options, inclusion rules, and failure behavior are documented in [Claude post-compaction recall](./claude-post-compaction-recall.md).
