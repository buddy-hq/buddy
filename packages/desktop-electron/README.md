# Buddy Desktop Electron

Electron desktop shell for Buddy.

## Development

From repo root:

```bash
bun install
bun run dev:desktop
```

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
