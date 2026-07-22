// Directories that are conventionally VCS-ignored and effectively never worth
// `@`-mentioning (dependency trees, framework caches, VCS metadata). opencode's
// file finder only applies `.gitignore` when the workspace is a git repo, so in
// a non-git workspace these leak into the mention results — this is why
// `node_modules/**` shows up in the file menu. We filter them here so the menu
// matches the "these are ignored" behaviour users expect either way.
//
// Deliberately conservative: build-output names people sometimes want to
// reference (`dist`, `build`, `out`, `target`) and `vendor` (this repo vendors
// opencode under `vendor/`) are NOT ignored.
const IGNORED_MENTION_PATH_SEGMENTS = new Set<string>([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".vercel",
  ".cache",
  ".parcel-cache",
  "__pycache__",
  ".venv",
  "venv",
  ".mypy_cache",
  ".pytest_cache",
  "coverage",
])

export function isIgnoredMentionPath(filePath: string): boolean {
  return filePath
    .split("/")
    .some((segment) => segment.length > 0 && IGNORED_MENTION_PATH_SEGMENTS.has(segment))
}

export function filterIgnoredMentionFiles<T extends { path: string }>(files: T[]): T[] {
  return files.filter((file) => !isIgnoredMentionPath(file.path))
}
