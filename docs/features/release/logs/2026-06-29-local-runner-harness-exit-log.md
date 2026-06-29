# Local runner release harness exit log

Date: 2026-06-29

Branch used for experiment: `codex/release-pipeline-refactor`

## Purpose

Measure the macOS ARM64 release units locally through a self-hosted GitHub Actions runner, without touching release artifacts or GitHub-hosted runner minutes, so the release pipeline refactor has a reusable local measurement baseline.

This was not a full release test. It intentionally avoided the parts that consume GitHub Actions artifact storage or publish release assets.

## Files kept for future measurement

- `.github/workflows/release-local-macos-arm64-harness.yml`
  - Safe self-hosted macOS ARM64 workflow.
  - Uses `workflow_dispatch`.
  - Its branch push trigger is limited to `codex/release-pipeline-refactor` so normal `main` pushes do not run it accidentally after merge.
- `script/release-local-runner-harness.ts`
  - Primary reusable harness.
  - Supports `init`, `reset`, `run`, `run-all`, `snapshot`, and `compare`.
  - Writes structured JSON metrics under `docs/features/release/pipeline/measurements/`.
  - Keeps persistent test caches outside the repository checkout under `~/.cache/buddy-release-local-runner` unless overridden.
- `script/benchmark-release-macos-arm64.ts`
  - Historical one-shot benchmark script from the first experiment.
  - Kept for traceability, but the primary measurement path is `script/release-local-runner-harness.ts`.
- `docs/features/release/pipeline/measurements/`
  - Raw JSON measurements and the measurement summary.
- `docs/features/release/pipeline/design.md`
  - Current locked design decisions and next planning/implementation direction.

## Safety boundaries used

The local runner harness did not use:

- `actions/cache`
- `actions/upload-artifact`
- GitHub-hosted runners
- release asset upload
- release asset download
- release publication

The measured packaging command used:

```text
bunx --bun electron-builder --mac --arm64 --publish never --config electron-builder.config.ts
```

That means it produced local package outputs only and did not publish them.

## Process run

1. Created a self-hosted macOS ARM64-only workflow for local release-unit measurement.
2. Created a harness script that initializes per-profile metrics, resets generated outputs, measures commands, snapshots cache/output sizes, and compares profiles.
3. Ran an initial successful smoke measurement.
4. Found that the initial differential was contaminated because the optimized profile reused `node_modules` from the current profile.
5. Patched the harness reset step to remove `node_modules` and generated outputs between profiles.
6. Hit a cold-install extraction failure for `@excalidraw/excalidraw` after isolation.
7. Patched the harness to keep cache directories outside the checkout workspace so `actions/checkout clean: true` and profile resets do not delete the persistent local caches under test.
8. Ran a clean current-versus-optimized measurement.
9. Copied the clean metrics into release docs.
10. Cancelled the queued follow-up run that was created only by pushing the committed metric files.

## Runs

| Run | Result | Use |
| --- | --- | --- |
| `28362694726` | Success | Harness smoke only. Do not use as a clean differential because `node_modules` carried over between profiles. |
| `28363230569` | Failure | Failed during cold Bun extraction of `@excalidraw/excalidraw`; used to identify that persistent cache state needed to live outside the checkout. |
| `28363471815` | Success | Clean differential result. Use this as the current local macOS ARM64 baseline. |
| `28364054411` | Cancelled | Queued by metrics push after the useful run had already completed; cancelled to avoid unnecessary local runner work. |

## Clean result from run `28363471815`

| Unit | Current | Optimized | Delta |
| --- | ---: | ---: | ---: |
| install dependencies | 55.27s | 52.33s | -2.94s |
| generate SDK | 3.79s | 3.27s | -0.52s |
| prepare release | 0.79s | 0.77s | -0.02s |
| build Electron app | 34.56s | 34.61s | +0.05s |
| smoke Electron backend utility | 49.38s | 49.29s | -0.09s |
| package Electron app | 65.77s | 67.12s | +1.35s |
| measured command total | 209.56s | 207.40s | -2.16s |

Cache/output sizes were effectively unchanged:

- Bun install cache: 2749.62 MiB
- Electron cache: 111.13 MiB
- Electron-builder cache: 80.23 MiB
- macOS ARM64 package output: 906.7 MiB

## Finding

Stable cache keys are not a meaningful per-run minute optimization on the local macOS ARM64 path. The clean run saved only about 2.16 seconds across the measured command set.

Stable keys are still worth doing because they address cache churn and the GitHub Actions 10 GB cache-storage wall. They should be treated as storage/churn hygiene, not as the main minutes lever.

The main local macOS ARM64 costs are:

- Electron packaging: about 66 seconds.
- Bun install: about 52-55 seconds.
- backend utility smoke: about 49 seconds.
- Electron build: about 35 seconds.

## Direction after this checkpoint

Based on `docs/features/release/pipeline/design.md`, the next implementation work should prioritize the high-leverage invariants before further cache tuning:

1. Add explicit selected-target booleans for macOS ARM64, macOS x64, and Windows x64.
2. Keep transport selection independent: `publish` versus `publish-cheap` must not imply platform selection.
3. Add preflight gating so expensive platform jobs do not run after prerequisite failures.
4. Merge version preparation and backend smoke into one Ubuntu preflight job.
5. Merge finalization and publication into one Ubuntu finalizer job.
6. Make direct-upload finalizer download selection-aware.
7. Move updater output to per-target manifests.
8. Copy omitted target manifests forward so partial releases are stable and users on omitted targets stay pinned to their last available version.
9. Make advanced-math runtime work follow selected macOS targets.
10. Keep standards bundled for now; do not make that product-behavior change as part of the pipeline refactor.

The local harness should be used again after workflow-script-level changes that can affect the macOS ARM64 release units. A real GitHub-hosted release run should come only after local proof for the testable macOS ARM64 path.
