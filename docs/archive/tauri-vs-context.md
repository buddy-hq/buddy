# Tauri vs Context Engineering: Which Path Next?

## How OpenCode's Tauri App Actually Works

I read the full `packages/desktop` implementation. Here's what's inside:

### Architecture

```
┌──────────────────────────────────────────────────┐
│           Tauri Shell (Rust + WebView)             │
│                                                    │
│  ┌─────────────┐    ┌──────────────────────────┐  │
│  │  Rust code   │    │     WebView (SolidJS)     │  │
│  │              │    │                          │  │
│  │ • Spawn      │    │  @opencode-ai/app        │  │
│  │   sidecar    │───▶│  (same frontend as web)  │  │
│  │ • Health     │    │                          │  │
│  │   check      │    │  Connects via HTTP to    │  │
│  │ • Platform   │    │  sidecar on localhost     │  │
│  │   APIs       │    │                          │  │
│  └─────────────┘    └──────────────────────────┘  │
│                                                    │
│          ┌─────────────────────────────┐          │
│          │  Sidecar (opencode-cli)     │          │
│          │  = the backend binary       │          │
│          │  Runs as separate process   │          │
│          │  Serves HTTP on localhost   │          │
│          └─────────────────────────────┘          │
└──────────────────────────────────────────────────┘
```

The key pattern: **the backend runs as a sidecar binary** (`externalBin: ["sidecars/opencode-cli"]` in `tauri.conf.json`). The Tauri app spawns it as a child process, waits for it to become healthy (polling `GET /global/health` every 100ms), then points the webview at `http://localhost:{port}`.

This is the **exact same architecture as Buddy's dev setup**: Hono server on one port, Vite frontend on another, connected via HTTP/SSE. The only difference is that Tauri replaces the browser window and manages the process lifecycle.

### What's in the Rust code (75KB, 11 files)

| File                   | What It Does                                           | Would Buddy Need It?  |
| ---------------------- | ------------------------------------------------------ | --------------------- |
| `server.rs`            | Spawn sidecar, health-check loop, server URL config    | **Yes** — core        |
| `cli.rs`               | Parse config, resolve sidecar binary path, WSL support | Partially             |
| `lib.rs`               | Plugin registration, window creation, initialization   | **Yes** — boilerplate |
| `main.rs`              | Entry point                                            | **Yes** — boilerplate |
| `logging.rs`           | File-based log rotation                                | Nice-to-have          |
| `markdown.rs`          | Comrak markdown parser (for server-side markdown)      | Probably not          |
| `window_customizer.rs` | Custom titlebar, vibrancy effects                      | Nice-to-have          |
| `linux_windowing.rs`   | Linux-specific window hacks                            | Not for v1            |
| `linux_display.rs`     | X11/Wayland detection                                  | Not for v1            |
| `windows.rs`           | Windows-specific APIs                                  | Not for v1            |
| `constants.rs`         | Store keys                                             | Trivial               |

**Of the 11 Rust files, Buddy would need ~3 for a minimal Tauri wrapper** (main.rs, lib.rs, server.rs).

### What's in the Tauri plugins (12 plugins)

| Plugin              | Why                                        | Buddy v1 Need? |
| ------------------- | ------------------------------------------ | -------------- |
| `shell`             | Spawn sidecar binary                       | **Yes**        |
| `dialog`            | File/folder picker for directory selection | **Yes**        |
| `process`           | Relaunch app                               | Nice-to-have   |
| `window-state`      | Remember window size/position              | Nice-to-have   |
| `store`             | Persist app settings                       | Nice-to-have   |
| `notification`      | Desktop notifications                      | Later          |
| `deep-link`         | `opencode://` protocol handler             | Later          |
| `updater`           | Auto-update                                | Later          |
| `clipboard-manager` | Paste images                               | Later          |
| `http`              | Fetch from webview (bypasses CORS)         | Maybe          |
| `os`                | Detect OS type                             | Trivial        |
| `single-instance`   | Prevent multiple app instances             | Nice-to-have   |

**Buddy v1 needs 2 plugins** (`shell` for sidecar, `dialog` for directory picker). The rest is polish.

---

## Risk Assessment

### Is there a risk that Buddy can't be packaged with Tauri?

**No. The risk is essentially zero.** Here's why:

1. **The architecture already matches.** Buddy runs as Hono server → Vite frontend → HTTP/SSE. This is exactly Tauri's sidecar pattern. The webview just replaces the browser.

2. **The sidecar pattern is officially supported.** Tauri v2 has first-class `externalBin` support. You point it at a binary, Tauri bundles it, spawns it on launch, and kills it on exit.

3. **Bun compiles to a single binary.** `bun build --compile` produces a standalone executable that includes the runtime. This becomes your sidecar. No Node.js installation required on the user's machine.

4. **The frontend is static files.** `vite build` produces a `dist/` folder. Tauri's `frontendDist` points at it. Done.

The only non-trivial part is:

- Compiling the Hono server to a standalone binary with `bun build --compile`
- Hooking up the sidecar spawn + health check in Rust (50-100 lines, port from OpenCode's `server.rs`)
- Wiring the directory picker dialog to replace Buddy's current `openDirectoryPicker` bridge

**None of these are risky.** They're all well-documented patterns.

### What COULD be risky?

The only edge cases I see:

1. **SQLite in a bundled binary.** If Buddy's storage uses better-sqlite3 (native addon), `bun build --compile` might need special handling. But since Buddy uses `bun:sqlite` (built into the Bun runtime), this is a non-issue.

2. **Cross-platform compilation.** Building for Windows/Linux from macOS requires Tauri's CI setup. But that's a distribution problem, not a "can it work" problem. For personal use (macOS-only), it's trivial.

---

## My Recommendation: Context Engineering First

Your counter-argument is right: **there's a 99.9% chance Tauri wrapping will just work.** The architecture is already aligned. The risk is near zero.

Here's why context engineering should go first:

### 1. Context engineering changes the agent's behavior — Tauri doesn't

If you do Tauri first, you'll have a desktop app that... does exactly what the browser version does. Same agent, same tools, same no-memory experience. You've proven packaging works, but you haven't proven the agent is worth packaging.

If you do context engineering first, you'll have an agent that remembers you across sessions. That's the thing worth testing. That's the thing where you might discover "oh, Kimi doesn't reliably call `memory_read` at session start" or "the memory file format doesn't work well" — problems that change the architecture.

### 2. Context engineering has higher design risk

Tauri packaging is a solved problem with clear documentation. Context engineering has open design questions:

- Does tool-driven memory loading work reliably?
- How do you format memories so they're useful to the LLM?
- Does the system prompt need to change dynamically based on the learner's state?
- How does compaction interact with memory context?

These are the questions you should answer before locking down a desktop app.

### 3. You can spike Tauri in 2 hours to kill the 0.1% risk

If you're worried about the 0.1% edge case:

```bash
# 1. Compile buddy server to a binary
cd packages/buddy && bun build --compile src/index.ts --outfile buddy-server

# 2. Init a minimal Tauri project
cd packages && npx -y @tauri-apps/cli@latest init --app-name buddy --window-title Buddy

# 3. Point it at your compiled binary as sidecar
# Edit tauri.conf.json: externalBin: ["sidecars/buddy-server"]

# 4. Build
cd packages/desktop && cargo tauri dev
```

If that spike works (it will), you've eliminated the risk in 2 hours without derailing from context engineering.

---

## Summary

| Path                | Risk                       | Value Added                               | Time         |
| ------------------- | -------------------------- | ----------------------------------------- | ------------ |
| Context Engineering | Medium (design unknowns)   | High (agent becomes a learning companion) | 2-4 sessions |
| Tauri Packaging     | Near-zero (solved pattern) | Low (same agent in a desktop window)      | 1-2 sessions |

**Do context engineering. Optionally spike Tauri for 2 hours to kill the last 0.1% doubt. Then come back and polish the desktop app once the agent is worth packaging.**
