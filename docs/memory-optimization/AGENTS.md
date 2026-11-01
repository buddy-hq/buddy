# AGENTS.md

- Current desktop process model: [Bun sidecar backend](../architecture/decisions/bun-sidecar-backend.md). The owner accepted the separate Bun runtime's memory cost for OpenCode v2 compatibility.
- `exit-branch.md`, `current-status.md`, and `history/` preserve the earlier Node utility investigation; they are historical evidence.
- Do not restore `memory-optimization-log.md` from git.
- Measure the compiled binary in temporary HOME, XDG, Buddy, and notebook roots, after 60 seconds of health-only idle activity. Record RSS units and host details; development import probes do not establish packaged memory use.
- Do not write measurements into real Buddy state or stop processes the task did not start.
