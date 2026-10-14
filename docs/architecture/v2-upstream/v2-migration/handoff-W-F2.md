# W-F2 handoff

Implementation, inventory, design decisions, and exact verification commands/results are recorded in [reports/w-f2-report.md](reports/w-f2-report.md). Integration details are in [reports/w-f2-seams.md](reports/w-f2-seams.md).

| Area | Status |
| --- | --- |
| MCP/native OAuth/browser polling/persisted config | Implemented; focused tests pass |
| Question list/reply/reject over forms | Implemented; real-host tests pass |
| Form→question pure mapping | Implemented/tested; W-C2 stream integration pending |
| Reference list and Location→Project join | Implemented; focused tests pass |
| Forced reference refresh | W-G1 reload integration pending |
| Global scoped config invalidation | Implemented; pending-form survival test passes |
| Projects and review finding 7 | Implemented; native association and missing-project tests pass |
| Compatibility raw files/commands/health | Implemented; focused tests pass |
| Desktop legacy server imports | Already absent; unused adapter module deleted |
| Adapter project module removal | Blocked by W-G1-owned `instance.ts` type importer |

Remaining work, in order:

1. W-C2 wires `toBuddyQuestionEvent(event, directory)` into `subscribeBuddyEvents` after resolving and authorizing the owning directory. Verify web question delivery and reconnection recovery. MCP global forms must remain excluded.
2. W-G1 adds forced `ctx.reference.reload()` to notebook sync, including the late-transform reinstall path. Verify a newly added reference appears after initialization without losing pending forms.
3. W-G1 removes `instance.ts`'s `Project` type dependency, then removes the retained adapter `project.ts` and its exports.
4. Orchestrator regenerates SDK, resolves remaining v1 modules/import-contract failure, and reruns the blocked open-project/local-runtime/presented-media and web concurrency tests plus integration lint/typecheck.
5. Integration verifies native browser launching and desktop packaging on macOS and Windows.

Traps: native `reference.list`'s envelope has only the public location reference; Buddy's response needs a separate `location.get`. Native project/credential/session get outputs are unwrapped. Questions use actual form keys/option values, not a positional object. `ProjectNotFoundError` is the native missing-project name. Adapter's test script already includes the entire `test` directory, so adding a file path alone does not restrict execution; the final form verification used a name filter. Respect the shared typecheck lock.

No new user decisions or dependencies are required. No generated/vendor files or real local state were changed. The owned implementation is complete; pending integration edits belong to the named external owners.
