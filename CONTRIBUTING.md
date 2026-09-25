# Contributing

Issues are open. Pull requests are open. Neither comes with a promise: this is one person's project, and a PR can sit for a while or get declined because it points somewhere the project isn't going. Ask in an issue before building anything large.

## Read this before you send code

Buddy is not open source. The [LICENSE](LICENSE) is the O'Saasy License, which grants everything MIT does except the right to run Buddy as a competing hosted service. That restriction is what keeps it out of the OSI definition.

By sending a pull request you agree your contribution ships under that license. If that is a problem for you, it is better to know now than after you have written the patch.

## Don't patch vendor

`vendor/opencode/` is [OpenCode](https://github.com/anomalyco/opencode), an MIT-licensed dependency. It is vendored only because it isn't published as a package, and it is synced from upstream, so edits there are overwritten on the next sync.

Fix OpenCode bugs upstream. If Buddy needs different behaviour, change `packages/opencode-adapter`, which is where Buddy integrates it. The `vendor-guard` check in `bun lint` and CI fails any change under `vendor/`.

## Setup

You need [Bun](https://bun.sh). The version is pinned in `package.json` under `packageManager`.

```bash
bun install
bun dev
```

That runs the backend. `bun run dev:web` runs the frontend, `bun run dev:desktop` runs the Electron shell, and `bun run dev:all` runs backend and frontend together.

## Before you open a PR

Both of these have to pass:

```bash
bun lint
bun typecheck
```

Run `bun typecheck` from the repository root only. It covers every package and takes a repository-wide lock, so running package-level typechecks alongside it will fail on purpose.

Run tests only for packages you touched. The full suite includes vendored tests that are not yours to fix.

Run `bun fmt` when you are finished, not while you are working.

## House style

The conventions are in [AGENTS.md](AGENTS.md), which is the same file the coding agents on this project read. The short version:

TypeScript is strict. No `any`, no type assertions. Prefer `unknown` and narrow it with zod or a type guard. Use `type`, not `interface`. Use `import type` for type-only imports. Annotate exports, infer locals.

No magic strings or magic numbers. Name them.

API calls go through the generated SDK client (`BuddyClient`), never a hand-rolled `fetch`.

Duplicated logic across files is treated as a defect. If you are about to add a third copy of something, extract it instead. Changing existing code to make room for new code is expected, not discouraged.

Skip tests that only prove TypeScript works. Write tests for runtime behaviour, contracts, and the type-level edges the compiler misses.

## Desktop changes need both platforms

Buddy ships on macOS and Windows. Unless an issue says otherwise, a desktop change should work on both, and saying which one you actually tested on saves a round trip.

## Commits

The history uses conventional commits: `fix(whiteboard):`, `refactor(config):`, `chore(deps):`. Write a body explaining why, not what. The diff already says what.

## Filing a good issue

For a bug, the useful thing is a reproduction. Include your OS, your Buddy version from Buddy > About, and what you expected instead. A stack trace beats a description of a stack trace.

For a feature, describe the problem before the solution. The most useful feature requests explain what you were trying to learn or teach when Buddy got in the way.

Security bugs do not go in the issue tracker. See [SECURITY.md](SECURITY.md).
