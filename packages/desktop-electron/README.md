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

This removes only Buddy Dev's application, user data, cache, logs, preferences, and saved state. It then builds, installs, and opens the current Buddy Dev installable. Production Buddy data is left intact.
