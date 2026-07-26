# Buddy Desktop Electron

Electron desktop shell for Buddy.

## Development

From repo root:

```bash
bun install
bun run dev:desktop
```

`dev:desktop` watches the backend's bundled workspace dependencies, rebuilds the external backend
artifact, refreshes the generated SDK when its inputs change, and reloads only the embedded backend
utility. Electron and the renderer stay running. Rebuilds wait for the prior utility reload before
replacing the artifact again. For frontend-only work, use the lower-overhead build-once path:

```bash
bun run dev:desktop:fast
```

The fast path still starts the real Electron utility-process backend, but backend source edits do
not take effect until the command is restarted.

## Build

```bash
bun run build:desktop
```

## Package

```bash
bun run build:installable
```

## Reset the local macOS dev install

From the repository root:

```bash
bun run cleanup:dev:mac
```

This is a factory reset for the packaged Buddy Dev channel. It removes the application and all dev-only renderer and backend state, then builds, installs, and opens the current Buddy Dev installable.

Buddy Dev isolates the following beneath `~/Library/Application Support/ai.buddy.desktop.dev`, so the reset removes them together:

- onboarding completion and personalization UI state
- global Buddy Dev configuration, including the learn/teach choice and personalization fields
- provider credentials, including an OpenAI connection
- OpenCode/Buddy databases, notebook registry, runtime state, caches, and session storage

The command also removes dev-only macOS caches, cookies, HTTP storage, logs, preferences, saved application state, and WebKit state. Production Buddy paths such as `~/Library/Application Support/ai.buddy.desktop` and the production global configuration at `~/.buddy` are not removed.

User notebook files are documents rather than application state and are intentionally preserved, including notebooks under `~/Documents/Buddy`.

Before rebuilding, the command removes the gitignored `packages/desktop-electron/dist` directory so installers and unpacked applications from older builds cannot accumulate. After installation succeeds, it removes intermediate and duplicated packaging output and keeps only the current DMG at `packages/desktop-electron/dist/buddy-v<version>-macos-<architecture>.dmg`.

## Reset the local macOS production install

From the repository root:

```bash
bun run cleanup:mac:preview
bun run cleanup:mac:stable
```

Or with an explicit kind / tag:

```bash
bun run cleanup:mac -- preview
bun run cleanup:mac -- stable
bun run cleanup:mac -- preview v0.0.50
```

This is a factory reset for production Buddy (`ai.buddy.desktop` / `Buddy.app`). It validates and fully stages the chosen GitHub release before quitting the app or deleting production state, installs the staged app, and opens it.

- `preview` installs the latest published Preview prerelease
- `stable` installs the latest stable release
- Preview and stable reinstall the same production app identity and shared state; only the release channel differs

Removed production roots include:

- `/Applications/Buddy.app` (or `$BUDDY_INSTALL_DIR`)
- `~/Library/Application Support/ai.buddy.desktop` and related caches, logs, preferences, WebKit, and temp updater state
- `~/.buddy`
- `~/.local/share/buddy`, `~/.cache/buddy`, `~/.local/state/buddy`

Requires `gh` authenticated against the releases repo. Preserves Buddy Dev (`ai.buddy.desktop.dev`) and notebook documents under `~/Documents/Buddy`.
