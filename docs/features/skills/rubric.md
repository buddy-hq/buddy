# Skill Audit Rubric

This is the maintainer rubric for turning a third-party skill candidate into a Buddy curation decision.

The important boundary is:

- Buddy's deterministic scanner is the trust boundary.
- Third-party tools are supporting evidence.
- Human review is still required before a catalog entry is approved.

## Audit Lanes

Every candidate should be reviewed across five lanes.

1. **Provenance**
   - Resolve the skill to an exact GitHub `repo`, `path`, and immutable commit SHA.
   - Compute Buddy's `tree-sha256-v1`.
   - Record file count and total bytes.

2. **Static Security**
   - Run Buddy's scanner on the entire skill directory.
   - Run at least one third-party secret scanner.
   - Optionally run a custom static policy scan.

3. **Dependency Risk**
   - If the skill includes dependency manifests or lockfiles, run vulnerability scans.
   - If it has no dependency manifests, explicitly record that the lane is not applicable.

4. **Runtime Behavior**
   - Run the skill in an isolated temp workspace.
   - Verify what it reads, writes, downloads, and executes.

5. **Teaching / Product Fit**
   - Check whether the skill is useful for Buddy's teaching and learning audience.
   - Check setup friction, auth friction, output quality, and failure behavior.

## Recommended Tools

Buddy-owned:

- `bun run --cwd packages/buddy skill:audit`

Open-source supporting evidence:

- [Gitleaks](https://github.com/gitleaks/gitleaks): secret scanning
- [OSV-Scanner](https://github.com/google/osv-scanner): known OSS vulnerability scanning
- [Grype](https://github.com/anchore/grype): filesystem and package vulnerability scanning
- [Semgrep CE](https://semgrep.dev/docs/deployment/oss-deployment): custom policy checks when you provide a local ruleset

Optional additional evidence:

- [Kingfisher](https://github.com/mongodb/kingfisher)
- [TruffleHog](https://github.com/trufflesecurity/trufflehog)

Commercial overlays like Socket, Snyk, or internal trust hubs are useful, but they do not replace Buddy's own trust boundary.

## What To Run

### Preferred flow

1. Fetch a pinned candidate:

```bash
bun run --cwd packages/buddy skill:audit \
  --repo owner/name \
  --path skills/my-skill \
  --ref 0123456789abcdef0123456789abcdef01234567
```

2. Or audit a local extracted skill directory:

```bash
bun run --cwd packages/buddy skill:audit \
  --skill-root /absolute/path/to/skill
```

3. Record manual review once you actually run the skill:

```bash
bun run --cwd packages/buddy skill:audit \
  --skill-root /absolute/path/to/skill \
  --runtime-review-status pass \
  --runtime-review-note "Ran in temp workspace; only wrote expected output files." \
  --fit-review-status pass \
  --fit-review-note "Low setup friction and useful output for tutoring workflow."
```

4. If you have a local Semgrep ruleset:

```bash
bun run --cwd packages/buddy skill:audit \
  --skill-root /absolute/path/to/skill \
  --semgrep-config /absolute/path/to/skill-audit-rules.yml
```

### What the script does

`skill-audit.ts` currently:

- Loads `SKILL.md`
- Computes `tree-sha256-v1`
- Runs Buddy's deterministic scanner
- Detects dependency manifests
- Runs `gitleaks` when installed
- Runs `osv-scanner` when installed and dependency manifests exist
- Runs `grype` when installed and dependency manifests exist
- Runs `semgrep` only if `--semgrep-config` is provided
- Emits normalized Buddy-style JSON with `pass`, `warn`, or `block`

## Decision Rules

### `BLOCK`

Use `block` when any of these are true:

- Buddy scanner returns a blocking finding
- `SKILL.md` is missing or invalid
- Provenance cannot be established for a skill that is being considered for curated install
- Manual runtime review finds destructive or exfiltrating behavior

### `WARN`

Use `warn` when any of these are true:

- Buddy scanner returns warnings that need explicit maintainer approval
- Gitleaks, OSV-Scanner, Grype, or Semgrep report findings that still need triage
- Required third-party tooling for the chosen audit lane was not run
- Manual runtime or fit review has not been completed
- The skill has meaningful auth/setup friction

### `PASS`

Use `pass` only when:

- Buddy scanner has no blocking findings
- Any Buddy scanner warnings are explicitly reviewed and documented
- Third-party tool findings have been triaged
- Runtime behavior was actually exercised in isolation
- Teaching / product-fit review has been completed

## Manual Runtime Tests

These are the checks a maintainer should actually perform:

- Run the skill in a temp workspace with representative prompts.
- Verify what files it creates or modifies.
- Verify whether it reads from broad home-directory paths like `~/.ssh`, `.aws`, `.gnupg`, `.kube`, or `.netrc`.
- Verify whether it requires network access and whether that access is expected.
- Verify failure mode when credentials or dependencies are missing.
- Verify whether it shells out to package managers, installers, or download-and-execute flows.

## Manual Product-Fit Tests

- Does the skill solve a real teaching or learning workflow?
- Is setup reasonable for Buddy users?
- Does it require copying raw API keys into local files or shell history?
- Are the outputs reliable enough for classroom, tutoring, or study use?
- If the skill fails, does it fail clearly and safely?

## Reading The Report

The JSON report should be interpreted as evidence, not as automatic approval.

- `pass`: this lane looks clean based on what was actually run
- `warn`: this lane needs human review, additional tooling, or explicit approval notes
- `block`: this lane should stop curation until fixed or rejected

If the overall report is `warn`, that is normal for early review. A candidate only becomes approvable after the remaining manual and triage work is done.
