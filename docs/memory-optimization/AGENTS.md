# AGENTS.md

- This folder is the source of truth for Buddy backend memory optimization work.
- After context compaction, read `memory-optimization-recovery-plan.md`, `memory-optimization-log.md`, `memory-startup-recovery-worktree-review.md`, and `memory-fix-invariants.md` before continuing memory/provider work.
- Durable sidecar measurement JSON files live in `log/`.
- The reusable measurement script stays at `packages/buddy/script/measure-sidecar-memory.ts`.
- Keep using the rebuilt production sidecar for proof. Dev import probes are useful attribution, not final memory proof.
- Keep referring to the vendored OpenCode Electron frontend before changing provider/model/auth UX or state patterns.
