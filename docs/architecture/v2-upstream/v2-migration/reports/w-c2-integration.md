# W-C2 integration seams

The W-C2 write path stores compiled Buddy system context and chip segments at `metadata.buddy.prompt = { system?: string, segments: [{ start, end, synthetic?, ignored?, metadata? }] }`. Offsets address `prompt.text`; model-only synthetic text stays in the native prompt, while transcript parts retain their original metadata and visibility. Commands still use the W-A `metadata.buddy.command` marker; the expanded template remains model-visible.

## Runtime plugin change required (outside W-C2 ownership)

Import `applyBuddyPromptContext` from `packages/buddy/src/learning/agent-execution/transforms/prompt-context.ts`. Signature:

```ts
applyBuddyPromptContext(event: SessionContext, messages: readonly UpstreamMessage[], client?: Pick<SessionClient,"message">): Promise<void>
```

In `createBuddyRuntimePlugin`'s `session.hook("context")`, invoke:

```ts
await applyBuddyPromptContext(event, await ctx.session.context({ sessionID: event.sessionID }))
await transformSessionContext(directory, event)
```

The order matters: the existing concise/filter/capture hook must see the compiled context. The helper reads the most recent Buddy system envelope from delivered context messages, avoiding queued prompts being applied to an earlier turn. When native compaction has removed the envelope from context, it recovers the last delivered envelope through the host's paginated user history. The optional client defaults to `getOpenCodeClient()`; pass `await options.getClient()` when the plugin is assembled with a custom host. It also removes `ignored` segments from the primary model's user text while keeping them visible in the transcript; synthetic segments remain model-visible. It is restart-safe because the envelope is persisted with the prompt. No runtime-plugin file was edited by W-C2. The real-host W-C2 fixture wires this hook before the runtime plugin and verifies system delivery, primary-request ignored-text exclusion and recovery after compaction.

## W-E subagent seam retained

`resolveSubagentToolForwarding(input)` remains the single function called by `command-transform.ts` and by `message-prompt-pipeline.ts`. The latter file is outside W-C2 ownership. Both callers retain returned state seeds; W-C2 converts any returned legacy-shaped `sessionPermission` to native rules with `toSessionPermissionRules`. W-E must remove the function's remaining v1 imports and move child tool/policy handling into public plugin hooks. W-C2 removed registry priming and direct v1 Session permission setters from its callers.

Full inventory, verified behavior, remaining facade importers and verification results are in `w-c2-report.md`.
