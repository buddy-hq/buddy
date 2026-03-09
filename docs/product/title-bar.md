# Title Bar Parity Notes

## Scope Completed

This documents the desktop title bar and window-chrome parity work already brought over from the vendored OpenCode implementation, so the next session can continue from here without re-exploring the codebase.

The main issue fixed was that the custom desktop title bar was not draggable. That is now resolved with an explicit Tauri window drag implementation, following the vendor's approach rather than relying only on CSS drag regions.

## What Buddy Now Does

### 1. Explicit desktop drag behavior

Buddy now uses explicit window dragging and double-click maximize behavior in the shared React title bar.

Implemented in:

- `packages/web/src/components/layout/desktop-titlebar.tsx`
- `packages/web/src/components/layout/desktop-titlebar-helpers.ts`
- `packages/web/src/context/platform.tsx`
- `packages/desktop/src/platform.ts`

Behavior:

- On desktop, non-interactive mouse-down on the title bar calls `startDragging()`.
- Double-click on a non-interactive, non-system-control area calls `toggleMaximize()`.
- Interactive elements such as buttons are excluded from /drag/maximize handling.
- The system control mount (`data-tauri-decorum-tb`) is excluded from double-click maximize handling.

This mirrors the important part of the vendor behavior in:

- `vendor/opencode/packages/app/src/components/titlebar.tsx`

### 2. Windows custom title bar / decorum integration

Buddy now has the vendor-style Windows custom window chrome path using `tauri-plugin-decorum`.

Implemented in:

- `packages/desktop/src-tauri/Cargo.toml`
- `packages/desktop/src-tauri/Cargo.lock`
- `packages/desktop/src-tauri/src/lib.rs`
- `packages/desktop/src-tauri/capabilities/default.json`
- `packages/desktop/index.html`
- `packages/desktop/src/styles.css`
- `packages/desktop/src/index.tsx`
- `packages/web/src/components/layout/desktop-titlebar.tsx`

Behavior:

- On Windows, Tauri window decorations are disabled.
- The desktop shell initializes `tauri-plugin-decorum`.
- After the main window is created, Buddy calls `create_overlay_titlebar()`.
- The shell includes `data-tauri-decorum-tb` mount points so Windows caption buttons exist both:
  - before the web app is ready (loading screen),
  - and after the main app UI is mounted.
- Buddy grants the `decorum:allow-show-snap-overlay` capability.
- The desktop CSS enforces the title bar height for the decorum controls so they align with the custom title bar height.

This mirrors the relevant vendor Windows path in:

- `vendor/opencode/packages/desktop/src-tauri/Cargo.toml`
- `vendor/opencode/packages/desktop/src-tauri/src/lib.rs`
- `vendor/opencode/packages/desktop/src-tauri/src/windows.rs`
- `vendor/opencode/packages/desktop/src-tauri/capabilities/default.json`
- `vendor/opencode/packages/desktop/index.html`
- `vendor/opencode/packages/desktop/src/styles.css`
- `vendor/opencode/packages/desktop/src/index.tsx`
- `vendor/opencode/packages/app/src/components/titlebar.tsx`

### 3. macOS custom title bar remains overlay-based

Buddy already used the Tauri overlay title bar configuration for macOS and still does.

Relevant Buddy file:

- `packages/desktop/src-tauri/src/lib.rs`

Behavior:

- Uses `TitleBarStyle::Overlay`
- Uses `hidden_title(true)`
- Positions traffic lights with `traffic_light_position(...)`

This is structurally aligned with the vendor's macOS setup, even though Buddy's Rust code is simpler and not split into a dedicated `windows.rs` abstraction.

Vendor reference:

- `vendor/opencode/packages/desktop/src-tauri/src/windows.rs`

## What We Intentionally Did Not Bring Over

These were intentionally skipped because they add complexity without solving the current problem, or because Buddy does not yet need them.

### 1. Title bar history / back-forward stack

Not brought over.

Vendor files:

- `vendor/opencode/packages/app/src/components/titlebar.tsx`
- `vendor/opencode/packages/app/src/components/titlebar-history.ts`
- `vendor/opencode/packages/app/src/components/titlebar-history.test.ts`
- `vendor/opencode/packages/app/e2e/app/titlebar-history.spec.ts`

Why not:

- Buddy does not currently expose title bar navigation controls.
- Adding this would introduce UI and routing complexity unrelated to drag/window-chrome parity.

### 2. Slot-based left / center / right title bar mount architecture

Not brought over.

Vendor file:

- `vendor/opencode/packages/app/src/components/titlebar.tsx`

Specifically not copied:

- `#opencode-titlebar-left`
- `#opencode-titlebar-center`
- `#opencode-titlebar-right`

Why not:

- Buddy's title bar is still simple.
- No current feature needs dynamic route-owned injection into the title bar.
- This is worth revisiting only if multiple product surfaces start pushing content into the top chrome.

### 3. Native window theme sync

Not brought over.

Vendor file:

- `vendor/opencode/packages/app/src/components/titlebar.tsx`

Why not:

- Vendor updates the native window theme via Tauri when the app theme changes.
- Buddy is currently forced dark, so there is little value in wiring theme synchronization right now.
- This becomes more relevant only if Buddy later supports light/system themes.

### 4. Extra vendor desktop shell features unrelated to title bar parity

Not brought over.

Examples in vendor desktop shell:

- deep link handling
- single-instance behavior
- clipboard manager integration
- opener plugin integration
- additional platform methods beyond current Buddy needs

Relevant vendor file:

- `vendor/opencode/packages/desktop/src/index.tsx`
- `vendor/opencode/packages/desktop/src-tauri/src/lib.rs`

Why not:

- They are not required for title bar or window parity.
- Pulling them in as part of this work would have broadened scope and increased risk.

## Buddy Files To Start From Next Time

If doing the next parity pass, start here first. These are the files already touched for the current implementation.

- `packages/web/src/components/layout/desktop-titlebar.tsx`
- `packages/web/src/components/layout/desktop-titlebar-helpers.ts`
- `packages/web/test/desktop-titlebar-helpers.test.ts`
- `packages/web/src/context/platform.tsx`
- `packages/desktop/src/platform.ts`
- `packages/desktop/src/index.tsx`
- `packages/desktop/src/styles.css`
- `packages/desktop/index.html`
- `packages/desktop/src-tauri/src/lib.rs`
- `packages/desktop/src-tauri/Cargo.toml`
- `packages/desktop/src-tauri/Cargo.lock`
- `packages/desktop/src-tauri/capabilities/default.json`

## Vendor Files To Compare Against Next Time

If continuing parity work, compare Buddy against these vendor files first instead of searching broadly.

- `vendor/opencode/packages/app/src/components/titlebar.tsx`
- `vendor/opencode/packages/app/src/components/titlebar-history.ts`
- `vendor/opencode/packages/app/src/components/titlebar-history.test.ts`
- `vendor/opencode/packages/app/e2e/app/titlebar-history.spec.ts`
- `vendor/opencode/packages/desktop/src/index.tsx`
- `vendor/opencode/packages/desktop/index.html`
- `vendor/opencode/packages/desktop/src/styles.css`
- `vendor/opencode/packages/desktop/src-tauri/Cargo.toml`
- `vendor/opencode/packages/desktop/src-tauri/src/lib.rs`
- `vendor/opencode/packages/desktop/src-tauri/src/windows.rs`
- `vendor/opencode/packages/desktop/src-tauri/capabilities/default.json`

## Recommended Next Parity Targets

If we do another pass, the highest-value remaining items are:

1. Title bar slots (`left` / `center` / `right`) if Buddy starts needing route-owned top-chrome content.
2. Native window theme sync if Buddy supports light/system themes later.
3. Title bar navigation history only if Buddy decides to add back/forward controls to the desktop chrome.

## Validation Already Run

These checks already passed during this work:

- `bun test --preload ./happydom.ts test/desktop-titlebar-helpers.test.ts` in `packages/web`
- `bun run typecheck` in `packages/web`
- `bun run typecheck` in `packages/desktop`
- `cargo check` in `packages/desktop/src-tauri`

## Practical Summary

The current implementation is good enough to stop revisiting title bar basics for a while:

- macOS drag works through explicit window dragging.
- Windows now has a proper custom title bar path with decorum.
- The remaining vendor features are optional product enhancements, not missing core window behavior.
