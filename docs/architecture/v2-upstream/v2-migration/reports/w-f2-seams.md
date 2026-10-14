# W-F2 integration seams

W-C2 must import `toBuddyQuestionEvent(event: OpenCodeEvent, directory: string): BuddyEvent | undefined` from `packages/opencode-adapter/src/gateway/form.ts` into `subscribeBuddyEvents`. Call it for `form.created`, `form.replied`, and `form.cancelled`, after validating the owning directory, then yield its returned event and continue. Created forms carry the session ID at `event.data.form.sessionID`; replies/cancellations use `event.data.sessionID`. MCP global elicitation forms are intentionally filtered out. The pure mapping emits the existing web `question.asked/replied/rejected` contract. List/reply/reject routes are migrated separately by W-F2.

When form events lack `event.location`, resolve the native owning session and enforce canonical directory containment; project-ID equality alone is not authorization. Do not translate a form from a different notebook into the subscriber's directory.

W-G1 output consumed: `putProjectMcpConfig({directory,name,payload})`, `refreshActiveNotebookConfigs()`. The former persists and synchronizes the MCP definition; the latter replaces `/global/dispose` with domain reloads that preserve pending forms/permissions.

W-G1 must finish forced reference refresh: the `registerNotebookConfig(ctx)` RPC sync handler in `packages/buddy/src/config/runtime/notebook-config-plugin.ts` currently reloads provider/model/agent/skill/command/MCP domains but never references. On `input.force`, call `await ctx.reference.reload()` even when the late transforms are being reinstalled. This completes the existing `syncOpenCodeProjectConfig(directory, true)` retry in `learning/prompt/workspace-file-references.ts`; there is no native HTTP reference refresh endpoint. No new config service signature is necessary. Regression: initialize references, add a configured reference, force sync, and observe the new reference without closing the location or losing a pending form.

The reference route now performs config synchronization through canonical-directory middleware before requesting `reference.list` and `location.get`. Native catalog envelopes only carry the public directory reference, so the latter supplies the project association required by Buddy's existing reference response.

Adapter cleanup: `packages/opencode-adapter/src/project.ts` cannot yet be deleted because `src/instance.ts:8` still imports its `Project` type. W-G1 owns that importer; once it is removed, delete the retained v1 module and its surgical index/package export lines. No W-F2 consumer imports it.
