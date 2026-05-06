# Worktree

## Decisions

### 1. Worktree Location
All worktrees live under `~/code/buddies/<worktree-name>`. Never alongside the main repo.

### 2. Data & State
Single shared SQLite database and runtime root. No per-worktree data isolation. This is for app development convenience, not agent sandboxing.

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
If `~/code/buddies/<name>` already exists, error out. No overwrite, no reuse.

### 11. .env File
Symlink `.env` from the main repo (`~/code/buddy/.env`) into the worktree root. Most environment variables (API keys, URLs) are identical across worktrees.

### 12. Auto-Start Dev Server
Never auto-start the dev server after creation. End the command with a summary showing how to start (like `npm create` or `vite` do).

### 13. Editor Auto-Open
Never auto-open the editor. The user manages their own editor windows.

### 14. Process Visibility
Electron window title must include the branch name (e.g., "Buddy Dev — feature-x") so multiple worktrees are distinguishable in the dock/taskbar.

### 15. Cleanup / Removal
No automated removal command. Manual cleanup via `git worktree remove` and `rm -rf ~/code/buddies/<name>`.

### 16. Listing Active Worktrees
Provide `bun run worktree:list` that shows all worktrees under `~/code/buddies/*`, highlighting which ones have running dev servers.

### 17. Built Assets (advanced-math-runtime)
Worktrees reference built assets from the main repo instead of rebuilding them. The `ensure:advanced-math-runtime` step checks a `BUDDY_ADVANCED_MATH_RUNTIME_CACHE_DIR` environment variable that points to the main repo's `packages/buddy/dist/advanced-math-runtime`. The worktree creation script writes this override into a `.env.local` file in the worktree root. If the main repo lacks the built asset, the worktree falls back to building its own into its own `dist` directory.
