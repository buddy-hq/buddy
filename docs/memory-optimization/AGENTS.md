# AGENTS.md

- This folder is the source of truth for Buddy backend memory optimization work.
- After context compaction, read `exit-branch.md` first. It is the current synthesis for this branch and distinguishes shipped architecture changes from historical investigation work.
- After reading `exit-branch.md`, read `current-status.md` before changing the Node utility backend foundation.
- Before continuing memory/provider work, read `history/memory-optimization-recovery-plan.md`, `history/memory-optimization-log.md`, `history/memory-startup-recovery-worktree-review.md`, and `history/memory-fix-invariants.md`.
- Durable Node backend measurement JSON files live in `log/`.
- The reusable measurement script stays at `packages/buddy/script/measure-node-memory.ts`.
- Keep using the built production Node backend artifact for proof. Dev import probes are useful attribution, not final memory proof.
- Keep referring to the vendored OpenCode Electron frontend before changing provider/model/auth UX or state patterns.
