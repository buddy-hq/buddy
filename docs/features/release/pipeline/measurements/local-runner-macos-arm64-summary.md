# Local runner macOS ARM64 release measurements

Date: 2026-06-29

Runner: self-hosted macOS ARM64

Workflow run: `28363471815`

## What was measured

The harness measured the macOS ARM64 release units on the local self-hosted runner without using:

- `actions/cache`
- `actions/upload-artifact`
- release asset upload/download
- GitHub-hosted runners

The run used two local cache-key profiles:

- `current`: lock/patch hash for Bun cache and desktop `package.json` hash for Electron caches.
- `optimized`: stable Bun version/target key and locked Electron/electron-builder versions.

The harness removes `node_modules` and generated release outputs between profiles while preserving the local cache directories under test.

## Clean differential result

| Unit | Current | Optimized | Delta |
| --- | ---: | ---: | ---: |
| install dependencies | 55.27s | 52.33s | -2.94s |
| generate SDK | 3.79s | 3.27s | -0.52s |
| prepare release | 0.79s | 0.77s | -0.02s |
| build Electron app | 34.56s | 34.61s | +0.05s |
| smoke Electron backend utility | 49.38s | 49.29s | -0.09s |
| package Electron app | 65.77s | 67.12s | +1.35s |
| measured command total | 209.56s | 207.40s | -2.16s |

## Interpretation

Stable cache keys are still useful, but this local ARM run proves they are mainly a cache-storage/churn optimization, not a major per-run minute optimization.

The remaining large local ARM costs are:

- Electron packaging: about 66s.
- Bun install: about 52-55s.
- backend utility smoke: about 49s.
- Electron build: about 35s.

For GitHub-hosted minute reduction, the high-leverage work remains target selection, preflight gating, and avoiding unnecessary platform jobs. Cache-key cleanup should still be implemented to stop cache churn and reduce the chance of hitting the 10 GB cache wall.

## Notes

An earlier run, `28362694726`, completed successfully but ran the optimized profile after the current profile in the same installed workspace. That made the optimized install measurement unrealistically fast because `node_modules` carried over. Keep that run only as a harness smoke result, not as the clean differential.

Run `28363230569` failed during a cold Bun install while extracting `@excalidraw/excalidraw`. The harness was patched after that to move persistent local cache directories outside the checkout workspace.
