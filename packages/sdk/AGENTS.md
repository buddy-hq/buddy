# AGENTS.md

## SDK Learnings (non-obvious)
- Keep schema paths and runtime client base path composition aligned so request URLs are prefixed exactly once.
- Ensure factory-created clients apply the same default transport settings as generated/singleton clients.
- Preserve deterministic generation behavior across all schema sources to avoid drift between local and remote generation workflows.
- Directory-scoped clients must carry tenant-routing metadata so requests resolve against the intended project context.
- Treat the SDK surface as Buddy’s compatibility API over vendored OpenCode runtime behavior, not a direct OpenCode SDK mirror.
