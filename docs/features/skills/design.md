# Skill Library Design

## Goal

Let users install useful skills in-product while keeping Buddy safe, learning-focused, and low-maintenance.

Buddy should reuse external skill ecosystems, but the in-product install surface should only expose skills Buddy has approved.

## Core Decision

Curation means approval, pinning, and policy. It does not mean Buddy must author or maintain the skill content.

Packaging and curation are separate:

- Packaged: shipped with Buddy.
- Curated: approved for in-product install.
- External: authored and hosted outside Buddy.

Source adapters are fetch mechanisms, not trust boundaries. Buddy can fetch from external ecosystems, but a source is never trusted wholesale. Trust is granted only to an individual catalog entry for an exact pinned artifact.

## Prior Art To Reuse

Buddy should borrow proven pieces from Hermes and OpenClaw without copying their full product model.

### From Hermes

- Use the idea of source adapters for curation tooling and future fetchers.
- Borrow the broad scanner shape: whole-directory scan, text-file coverage, structural checks, hidden Unicode, prompt injection, exfiltration, secrets, and dangerous command patterns.
- Borrow the provenance lock idea: record source, identifier/ref, installed hash, install path, scanner verdict/policy, and installed time.
- Do not copy Hermes' broad in-product federated search/install surface for MVP.
- Do not use Hermes' remote central index as the MVP trust boundary.

### From OpenClaw

- Borrow the staged install approach: copy to a staging directory, validate install boundaries, backup existing install on update, atomic rename into final location, and clean up on failure.
- Borrow install path safety checks and runtime refresh only after successful install.
- Do not copy OpenClaw's ClawHub-native registry assumption for Buddy.
- Do not rely on OpenClaw's scanner scope alone; it is narrower than Buddy needs for external skill curation.

## MVP Policy

### 1. Security Scan Policy

- MVP scan scope is the entire skill directory, not only `SKILL.md`.
- Buddy owns a small deterministic local scanner inspired by Hermes.
- Third-party scanners and LLM review may be used during curation, but are not the runtime trust boundary.
- Install-time scanning on the user machine is defense-in-depth, not the only gate.
- Block install for symlink escape, binaries, hardcoded secrets, credential access or exfiltration, hidden/deceptive prompt injection, destructive commands, and download-and-execute patterns.
- Warn for unpinned dependencies, normal network fetches, large files, executable scripts, and broad filesystem references.
- No user override inside Buddy. Maintainers can approve a known-safe warning by updating the curated catalog.
- The scanner must be versioned with a `scannerPolicyVersion` so installed skills can be audited against the policy that approved them.

### 2. Packaging Policy

- Package only a small Buddy-authored core by default, roughly 5-10 critical teaching skills.
- Do not package externally authored skills in MVP.
- Externally authored skills are installed on demand from approved pinned artifacts.

### 3. Curation Policy

- Trust is granted at the skill artifact/version level, not the author level.
- Author or repo reputation can help prioritize review, but does not grant automatic trust.
- A Buddy maintainer approves a skill by merging a catalog entry.
- Trust applies only to the exact pinned source ref and content hash.
- MVP supports GitHub source refs only. ClawHub-native skills, generic artifact URLs, and other registry-native artifacts are out of scope unless they can be resolved to a GitHub repo, path, and commit.

### 4. Update Policy

- MVP updates are manual only.
- No auto-update to upstream latest.
- Re-review is required when source ref changes, content hash changes, scanner findings change, new files appear, install/runtime behavior changes, dependencies change, or upstream ownership changes.
- A reviewed update is represented as a catalog entry change with a new source ref and hash.

### 5. Product Behavior

- The in-product install UI shows only Buddy-approved catalog entries.
- Approved entries may point to external skills.
- Non-curated external skills are not installable from Buddy.
- If external skill roots are enabled, already-installed external skills may appear as detected external skills, but not as Buddy-approved library items.
- External roots are outside the curated trust boundary. They must not be installed, updated, or labeled as trusted by the curated library flow.

### Runtime Scope Vs Permission Deny

`skill: deny` is not enough for withdrawn skills.

OpenCode filters denied skills out of the available-skill prompt metadata, but denied skills can still exist in skill discovery and filesystem scope if their files remain under configured skill roots. Skill slash commands are also built from all discovered skills in the current OpenCode implementation.

For normal user disable, `skill: deny` is sufficient. For catalog withdrawal, Buddy must both deny permission and remove the skill from runtime discovery by moving it outside configured skill roots.

### 6. Operational Workflow

- The approved list lives in a versioned Buddy-controlled `catalog.json`.
- Each catalog entry stores source ref, content hash, review metadata, categories, and tags.
- The catalog is the trust boundary. Buddy maintains approval records, not hundreds of skill implementations.
- Approved curated skills are available to all personas in MVP.
- All-persona availability is an MVP simplification, not a long-term access model.
- MVP catalog delivery is local/Buddy-controlled: bundled with the app or stored in the Buddy repo. Do not fetch a live remote catalog until signing, caching, rollback protection, and trusted fallback behavior are designed.

## Minimal End-To-End Flow

### Curation Flow

1. Pick an external skill candidate.
2. Resolve it to an exact GitHub repo, path, and commit.
3. Fetch that exact skill root.
4. Compute the canonical tree hash.
5. Scan the full skill directory locally.
6. Optionally run third-party scanners and LLM-assisted review.
7. Human reviews fit, safety, and teaching value.
8. Add a catalog entry with source ref and content hash.

### Install Flow

1. User opens Buddy skill library.
2. Buddy shows approved catalog entries only.
3. User selects install.
4. Buddy fetches the pinned source into a temporary directory.
5. Buddy resolves the skill root and computes the canonical tree hash.
6. Buddy verifies the hash against the catalog.
7. Buddy runs the local deterministic scanner.
8. Buddy copies the skill into a managed staging directory.
9. Buddy atomically renames staging into the final managed skill location.
10. Buddy writes the install lock.
11. Buddy enables the skill and refreshes the runtime.
12. The skill is available to all personas on the next runtime turn/session refresh.

### Update Flow

1. Maintainer checks whether upstream changed.
2. New upstream artifact is scanned and reviewed.
3. Catalog entry is updated with the new source ref and hash.
4. Buddy can offer the reviewed update to users.

### Withdraw Flow

1. Maintainer marks the catalog entry as `withdrawn`.
2. Buddy hides it from the install UI.
3. If the skill is already installed, Buddy force-disables it by setting the managed skill permission to `deny`.
4. Buddy moves the installed skill directory from the managed runtime skill root into Buddy-managed withdrawn storage outside configured skill roots.
5. Buddy updates the install lock state to `withdrawn` and records the withdrawn storage path.
6. Buddy prevents re-enabling withdrawn catalog skills from the in-product UI/API.
7. Buddy refreshes the runtime so the withdrawn skill is no longer discovered, advertised, or invocable as a skill command.
8. Buddy shows that the skill is no longer approved and offers removal.
9. Buddy does not silently delete user files.

## Catalog Implementation

The approved catalog should be JSON data, validated by typed schemas at the app boundary.

JSON is the right storage format because it is reviewable, portable, CI-friendly, and can live outside the app release. Type safety should come from schema validation, not from making the catalog a TypeScript source file.

Use three separate shapes:

- Catalog document: trusted approval records.
- Backend domain types: parsed install data after validation.
- Frontend API view: display-only library cards and install state.

The frontend should never read the raw catalog, fetch external sources, verify hashes, or run scanners. The backend owns trust, fetching, verification, scanning, and install.

### MVP Catalog Schema

```ts
type SkillCatalogDocument = {
  schemaVersion: 1
  entries: SkillCatalogEntry[]
}

type SkillCatalogEntry = {
  id: string
  displayName: string
  summary: string
  categories: string[]
  tags: string[]
  source: SkillSourceRef
  integrity: SkillArtifactIntegrity
  review: SkillReview
  status: "approved" | "withdrawn"
}

type SkillSourceRef = {
  type: "github"
  repo: string
  path: string
  ref: string
}

type SkillArtifactIntegrity = {
  algorithm: "tree-sha256-v1"
  sha256: string
  sizeBytes?: number
  fileCount?: number
}

type SkillReview = {
  approvedAt: string
  approvedBy?: string
  policyVersion: number
  notes?: string
}
```

Do not include fields until the product needs them. MVP should not require example prompts, risk levels, compatibility, trusted authors, semver ranges, dependency declarations, auto-enable rules, persona targeting, or UI surface targeting.

MVP source support is GitHub only. Discovery systems like skills.sh, ClawHub, and marketplace indexes can be used during curation, but approved entries must resolve to a GitHub repo, path, and immutable commit before Buddy installs them. Add artifact URLs or registry-native ClawHub installs later only if their fetch, integrity, and trust rules are designed explicitly.

`withdrawn` means Buddy no longer approves installing or using the skill. Withdrawn entries are hidden from the install UI. If already installed, Buddy keeps the files for audit/removal but moves them outside runtime skill roots, forces the skill permission to `deny`, and rejects attempts to re-enable it. MVP does not need a separate incompatible state.

### Canonical Hash

The catalog hash is over the normalized extracted skill directory, not GitHub archive bytes.

`tree-sha256-v1`:

```txt
resolve skill root
reject symlinks
include regular files only
include dotfiles unless they are source-control or Buddy install metadata
normalize paths to POSIX separators
sort paths lexicographically
for each file: hash "file" + NUL + path byte length + NUL + path bytes + NUL + file byte length + NUL + file bytes + NUL
return full SHA-256 hex digest
```

This avoids depending on archive metadata and lets the same approved artifact be verified after fetch, cache, extraction, or future source-adapter changes.

### Frontend API View

Return a frontend-safe view instead of the raw catalog entry.

```ts
type SkillLibraryItemView = {
  id: string
  displayName: string
  summary: string
  categories: string[]
  tags: string[]
  sourceKind: "github"
  sourceLabel: string
  state: "available" | "installed" | "withdrawn_installed"
}
```

The UI renders this view and calls the install endpoint with only the catalog `id`.

### Install Lock Schema

Installed state is separate from the catalog.

```ts
type InstalledSkillLock = {
  schemaVersion: 1
  installed: Record<string, InstalledSkillLockEntry>
}

type InstalledSkillLockEntry = {
  catalogId: string
  displayName: string
  skillName: string
  source: SkillSourceRef
  integrity: SkillArtifactIntegrity
  installedAt: string
  scannerPolicyVersion: number
  catalogRevision?: string
} &
  (
    | {
        state: "active"
        installedPath: string
      }
    | {
        state: "withdrawn"
        withdrawnPath: string
        withdrawnAt: string
      }
  )
}
```

The catalog says what Buddy approves. The lock says what this machine installed.

### Backend Flow

```txt
read catalog.json
-> validate with schema
-> filter approved entries
-> join with install lock and withdrawn state
-> return frontend view
```

Install:

```txt
lookup catalog id
-> fetch pinned source
-> compute and verify tree-sha256-v1
-> run Buddy scanner
-> copy into staging directory
-> atomically publish staging directory
-> write install lock
-> refresh runtime
```

If any step fails before publish, Buddy removes staging and leaves the existing install unchanged. Runtime refresh happens only after publish and lock write succeed.

Withdraw:

```txt
catalog entry is withdrawn
-> find active lock entry
-> set skill permission deny
-> move installed directory to withdrawn storage outside skill roots
-> update lock state to withdrawn
-> refresh runtime
-> show withdrawn-installed state and removal action
```

## Expected End State

- Buddy's in-product skill library lists only Buddy-approved catalog entries.
- MVP catalog entries point only to immutable GitHub repo, path, and commit refs.
- Users install skills by catalog `id`; the frontend never submits raw source URLs or GitHub refs.
- The backend validates catalog data with typed schemas before use.
- The backend fetches the pinned GitHub source, computes `tree-sha256-v1`, verifies the catalog hash, scans the full skill directory, and publishes via staged atomic install.
- Installed curated skills are recorded in a Buddy lock with runtime `skillName`, source ref, integrity, state, path, install time, scanner policy version, and catalog revision when available.
- Approved installed skills are available to all personas in MVP.
- Withdrawn installed skills are denied and moved outside configured skill roots, so they are not advertised in model context, not discoverable by the skill tool, and not invocable as skill slash commands.
- External-root skills remain outside the curated trust boundary and are never labeled, installed, updated, or withdrawn by the curated library flow.
- The implementation remains a curated installer, not a general package manager.

## Implementation Phases

### Phase 1: Catalog Foundation

Define the catalog as JSON data validated by typed schemas.

Scope:

- Add the MVP catalog schema.
- Add parser/validation helpers.
- Add clear validation errors for invalid catalog entries.
- Add a local catalog fixture with at least one approved GitHub entry.
- Map internal catalog entries to `SkillLibraryItemView`.
- Do not install anything yet.
- Do not fetch GitHub yet.

Outcome:

- Buddy can read a local Buddy-controlled `catalog.json`.
- Buddy can return frontend-safe library items from the catalog.
- The frontend receives display fields and install state, not raw source refs or hashes.

Key implementation files:

- New catalog schema/service under `packages/buddy/src/learning/skill-management/service/` or a new `skill-library/` domain folder.
- Existing response composition in `packages/buddy/src/learning/skill-management/service/catalog.ts`.
- Route schema surface in `packages/buddy/src/routes/skills.ts`.

### Phase 2: Install Lock Foundation

Add persistent installed-state tracking for curated catalog skills.

Scope:

- Add `InstalledSkillLock` schema.
- Add read/write helpers.
- Track active and withdrawn states.
- Store catalog id, display name, runtime skill name, source ref, integrity, install path, install time, scanner policy version, and optional catalog revision.
- Join catalog entries with lock state for `available`, `installed`, and `withdrawn_installed` frontend states.
- Do not move files yet.
- Do not implement GitHub install yet.

Outcome:

- Buddy can distinguish “approved in catalog” from “installed on this machine”.
- Buddy has enough local state to support audit, removal, withdrawal, and future reviewed updates.

Key implementation files:

- Existing managed skill paths in `packages/buddy/src/learning/skill-management/service/paths.ts`.
- Existing catalog composition in `packages/buddy/src/learning/skill-management/service/catalog.ts`.
- Existing mutation layer in `packages/buddy/src/learning/skill-management/service/mutations.ts`.

Reference implementations:

- Hermes lock provenance in `/Users/prashantbhudwal/Code/hermes-agent/tools/skills_hub.py`.
- OpenClaw ClawHub origin/lock tracking in `/Users/prashantbhudwal/Code/openclaw/src/agents/skills-clawhub.ts`.

### Phase 3: Canonical Hash

Implement `tree-sha256-v1` for deterministic artifact verification.

Scope:

- Walk a skill root recursively.
- Reject symlinks.
- Include regular files only.
- Include dotfiles unless they are source-control or Buddy install metadata.
- Normalize paths to POSIX separators.
- Sort paths lexicographically.
- Hash framed file records using path length and file byte length.
- Return a full SHA-256 hex digest.
- Add tests for ordering, path separators, dotfiles, symlink rejection, and content changes.

Outcome:

- Curation tooling and install-time verification can compute the same hash for the same skill tree.
- Buddy does not rely on GitHub archive bytes or archive metadata for integrity.

Reference implementations:

- Hermes deterministic bundle hash in `/Users/prashantbhudwal/Code/hermes-agent/tools/skills_hub.py`.
- OpenClaw skill fingerprinting in `/Users/prashantbhudwal/Code/openclaw/src/agents/skills-clawhub.ts`.

Note:

- Buddy should define its own stricter hash format instead of copying either implementation exactly.

### Phase 4: GitHub Fetcher

Implement the only MVP source fetcher: pinned GitHub repo/path/commit.

Scope:

- Accept only immutable commit SHAs as `source.ref`.
- Fetch the specified repo/path/ref into a temporary directory.
- Resolve the exact skill root that contains `SKILL.md`.
- Enforce size and file-count limits before install.
- Keep ClawHub-native, artifact URL, branch, tag, and semver sources out of MVP.
- Make failures explicit: repository not found, ref not found, path missing, missing `SKILL.md`, oversized artifact.

Outcome:

- Buddy can materialize an approved external GitHub skill locally for hashing and scanning.
- Discovery systems like skills.sh or ClawHub can still be used during curation, but catalog entries must resolve to GitHub commit refs before install.

Implementation choices to decide in this phase:

- Sparse checkout vs GitHub archive/API.
- Network timeout and retry behavior.
- Local temp/cache location.

Recommendation:

- Start with the simplest reliable fetch implementation, then optimize later.

### Phase 5: Scanner MVP

Implement Buddy's deterministic full-directory scanner.

Scope:

- Scan the full skill directory, not only `SKILL.md`.
- Cover markdown, text, scripts, JSON/YAML/TOML/config, JavaScript/TypeScript, Python, shell, and other common text files.
- Detect structural issues: symlink escape, suspicious binaries, excessive file count, oversized total tree, oversized individual files, unexpected executable bits.
- Detect hidden Unicode and invisible text tricks.
- Detect hardcoded secrets and private keys.
- Detect credential access/exfiltration patterns.
- Detect destructive commands and download-and-execute patterns.
- Detect suspicious prompt injection patterns.
- Return structured findings and a deterministic block/warn decision.
- Version the policy with `scannerPolicyVersion`.
- Do not use third-party scanners as the runtime trust boundary.

Outcome:

- Buddy can make a repeatable local install-time decision before copying an approved skill into managed storage.
- Scanner results can be recorded in the install lock or audit metadata later.

Reference implementations:

- Hermes broad scanner in `/Users/prashantbhudwal/Code/hermes-agent/tools/skills_guard.py`.
- OpenClaw lightweight scanner in `/Users/prashantbhudwal/Code/openclaw/src/security/skill-scanner.ts`.
- OpenClaw install-time block/warn wrapper in `/Users/prashantbhudwal/Code/openclaw/src/plugins/install-security-scan.runtime.ts`.

Non-goal:

- Do not build an LLM-based runtime scanner. LLM review can be curation-time assistance only.

## Implementation References

### Buddy Files

- `packages/buddy/src/learning/skill-management/service/library.ts`: current curated library sync/listing flow.
- `packages/buddy/src/learning/skill-management/service/mutations.ts`: current create/install/remove mutations and permission updates.
- `packages/buddy/src/learning/skill-management/service/catalog.ts`: current installed/library response composition.
- `packages/buddy/src/learning/skill-management/service/permissions.ts`: current skill permission helpers.
- `packages/buddy/src/learning/skill-management/service/discovery.ts`: current visible skill discovery and managed/external source classification.
- `packages/buddy/src/config/opencode/skills.ts`: current configured skill roots, managed roots, and external vendor root behavior.

### OpenCode Runtime Semantics

- `vendor/opencode/packages/opencode/src/skill/index.ts`: `available(agent)` filters denied skills, while `all()` still returns discovered skills.
- `vendor/opencode/packages/opencode/src/session/system.ts`: available skills are injected into model context from `skill.available(agent)`.
- `vendor/opencode/packages/opencode/src/tool/registry.ts`: skill tool description lists `skill.available(agent)`.
- `vendor/opencode/packages/opencode/src/tool/skill.ts`: skill tool loads skill content and asks `skill` permission before returning content.
- `vendor/opencode/packages/opencode/src/command/index.ts`: skill slash commands are currently created from `skill.all()`, so withdrawn skills must be moved out of discovery roots, not only denied.

### Hermes Prior Art

- `/Users/prashantbhudwal/Code/hermes-agent/tools/skills_guard.py`: broad whole-directory scanner and policy ideas.
- `/Users/prashantbhudwal/Code/hermes-agent/tools/skills_hub.py`: source adapters, quarantine, lockfile provenance, content hashing, update checks.
- `/Users/prashantbhudwal/Code/hermes-agent/hermes_cli/skills_hub.py`: fetch, quarantine, scan, confirm, install CLI flow.
- `/Users/prashantbhudwal/Code/hermes-agent/scripts/build_skills_index.py`: centralized index build prior art, useful for future curation tooling but not MVP trust delivery.

### OpenClaw Prior Art

- `/Users/prashantbhudwal/Code/openclaw/src/infra/install-package-dir.ts`: staged install, path boundary checks, update backup, atomic publish, cleanup.
- `/Users/prashantbhudwal/Code/openclaw/src/security/skill-scanner.ts`: lightweight scanner implementation, useful for structure/performance but too narrow for Buddy's full skill scan.
- `/Users/prashantbhudwal/Code/openclaw/src/plugins/install-security-scan.runtime.ts`: install-time block/warn wrapper pattern.
- `/Users/prashantbhudwal/Code/openclaw/src/agents/skills-clawhub.ts`: lock/origin tracking and registry install/update lifecycle prior art.

## Non-Goals For MVP

- No arbitrary marketplace search inside Buddy.
- No trusted-author auto-install policy.
- No persona-specific skill access.
- All curated MVP skills are available to all personas.
- No risk rating in the product schema.
- No compatibility state in MVP.
- No live remote catalog trust boundary.
- No generic artifact URL source in MVP.
- No semver range resolution.
- No auto-updates.
- No publishing flow.
- No full package manager.
