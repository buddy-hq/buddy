# Backend dev markdown loader uses package cwd

## Decision

Keep the desktop dev backend on `bun run --watch` and fix markdown loading by spawning Bun with `cwd` set to `packages/buddy`.

## Why

- `packages/buddy/bunfig.toml` sets `.md` imports to `text`.
- When Electron dev spawned Bun without `cwd`, Bun resolved the backend from outside `packages/buddy` and imported markdown as HTML instead of raw text.
- The old sidecar-binary path hid this because markdown had already been bundled as text at build time.

## Chosen fix

Set `cwd` to the resolved backend root in `packages/desktop-electron/src/main/cli.ts` when dev mode launches `bun run --watch`.

## Why not revert to the binary

- Development should execute the same source files engineers are editing.
- `bun --watch` keeps the edit-run-feedback loop short and makes backend changes observable immediately.
- It exercises the real development inputs, including source imports, loader config, and development `.env` handling.
- A prebuilt binary adds an extra build-and-copy layer between the code and the running app, which makes dev behavior less direct and can hide source-time problems until later.
- In this case the binary path hid the markdown loader misconfiguration because the `.md` files had already been transformed during build.
- Reverting to the binary would restore the symptom-free path, but it would do so by masking the actual configuration bug rather than fixing it.
