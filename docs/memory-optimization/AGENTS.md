# AGENTS.md

- Canonical desktop backend packaging and process model: `docs/architecture/decisions/utility-process-backend.md` (Failure Rule, target-native `out/main`, isolated smoke, next-map).
- Dated synthesis of what this memory branch shipped vs did not: `exit-branch.md`, then `current-status.md`.
- `history/` files are investigation evidence, not living host contracts. `history/memory-fix-invariants.md` is the June 22 sidecar-era contract (Zen vs Go still useful). `history/post-provider-analysis.md` is import-RSS research; the provider split did not merge.
- Do not restore `memory-optimization-log.md` from git; it is not in the tree.
- Durable Node backend measurement JSON files live in `log/` when present.
- The reusable measurement script stays at `packages/buddy/script/measure-node-memory.ts`.
- Dev import probes are useful attribution, not final memory proof. Measure the Electron utility-process host.
- Keep referring to the vendored OpenCode Electron frontend before changing provider/model/auth UX or state patterns.
