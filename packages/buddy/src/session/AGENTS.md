# AGENTS.md

## Session Learnings (non-obvious)
- Active runtime session loop lives in vendored OpenCode (`vendor/opencode-core/src/session/**`), not in Buddy-local session modules.
- Buddy-local session files in this directory should be treated as compatibility/legacy helpers unless explicitly wired from `packages/buddy/src/index.ts`.
- When debugging prompt/loop/tool-call behavior, inspect OpenCode session routes + prompt assembly first, then Buddy facade transformations.
- Buddy prompt customization should be injected through adapter seams (request body transform/config/instruction paths), not by reviving a full local loop.
- Keep multi-tenant scoping explicit via directory context headers; missing directory propagation can look like "stuck" sends while core processing completed elsewhere.
