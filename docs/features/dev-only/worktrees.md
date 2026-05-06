# Worktree

## Decisions

### 1. Worktree Location
All worktrees live under a `buddies/<worktree-name>` directory next to the main `buddy` checkout. For example, if the repo is at `/Users/me/Code/buddy`, worktrees are created under `/Users/me/Code/buddies/<worktree-name>`. Never hard-code a home-relative path such as `~/code`; derive the location from the current checkout.

### 2. Data & State
Single shared SQLite database and runtime root. No per-worktree data isolation. This is for app development convenience, not agent sandboxing.

This means parallel worktree dev instances are safe for UI/backend smoke testing and for chatting in different workspace directories/sessions, but they are not designed for concurrent mutation of the same directory/session. Do not run two worktree instances against the same active chat session at the same time; they share runtime event/state surfaces and can race each other.

### 3. Dev Server Command
`bun run dev:desktop` must work identically inside any worktree as it does in the main repo. No extra flags, no environment variables to remember, no worktree name to type. The canonical command is `bun run dev:desktop`; `dev:desktop:electron` is a deprecated alias.

### 4. Port Allocation
Dynamic port allocation. Backend gets a random free port (already works). Renderer dev server also auto-finds a port. No fixed port mapping, no registry.

### 5. Node Modules
Leverage Bun's global store. `bun install` in each worktree should be fast and deduplicated via Bun's store, not by symlinking from the main repo.

### 6. Worktree Creation Flow
Support both patterns:
- `bun run worktree:create feature-x` — non-interactive, takes branch name as argument
- `bun run worktree:create` — interactive, prompts for branch name

### 7. Always-On, Parallel Usage
Design for 2-3 worktrees running their dev servers simultaneously. This is the primary use case — multiple agents in parallel, each in their own editor window, all visible at once. Not about switching, about coexistence.

### 8. Branch Base
New branches are always created from `main` (or the repository's default branch). Never from the current branch.

### 9. Existing Branch Behavior
If the branch already exists locally, error out. The user must explicitly decide to use an existing branch.

### 10. Existing Worktree Directory
If `../buddies/<name>` already exists next to the main checkout, error out. No overwrite, no reuse.

### 11. .env File
Do not symlink or copy `.env` files during worktree creation. Dev setup should work from the repo scripts and existing shell environment without hidden per-worktree config writes.

### 12. Auto-Start Dev Server
Never auto-start the dev server after creation. End the command with a summary showing how to start (like `npm create` or `vite` do).

### 13. Editor Auto-Open
Never auto-open the editor. The user manages their own editor windows.

### 14. Process Visibility
Electron window title must include the branch name (e.g., "Buddy Dev — feature-x") so multiple worktrees are distinguishable in the dock/taskbar.

### 15. Cleanup / Removal
No automated removal command. Manual cleanup via `git worktree remove` and removing the corresponding `../buddies/<name>` directory.

### 16. Listing Active Worktrees
Provide `bun run worktree:list` that shows all worktrees under the sibling `buddies/*` directory, highlighting which ones have running dev servers.

### 17. Built Assets (advanced-math-runtime)
Worktrees reference built assets from the main repo instead of rebuilding them. The desktop `predev` script detects when it is running inside a worktree, resolves the main repo root, and internally sets `BUDDY_ADVANCED_MATH_RUNTIME_CACHE_DIR` for the backend asset preparation step. No `.env.local` file is written. If the main repo lacks the built asset, the worktree falls back to building its own into its own `dist` directory.
