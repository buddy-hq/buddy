# Skill Artifact Operations

Buddy publishes skill content independently from desktop releases through the `skill-artifacts` release in `prashantbhudwal/buddy-releases`.

## Artifacts

- `library-catalog.envelope.json`: the signed curated-library catalog.
- `system-skill-pack-<bundled-fingerprint>.envelope.json`: a complete signed system-skill pack compatible with exactly one bundled baseline.

The app periodically refreshes both artifacts. It verifies the dedicated minisign signature, validates the payload schema, enforces the accepted revision floor, and writes the cache atomically. Invalid or unavailable remote content never replaces the current trusted artifact.

## Signing key

Generate the dedicated key once:

```bash
bun run skills:artifacts:keygen
```

This writes the private key and password under `~/.config/buddy/`. Only the public key belongs in source control. Back up the private key and password securely; GitHub Actions secrets cannot be downloaded later.

The publishing workflow reads:

- `BUDDY_SKILL_SIGNING_PRIVATE_KEY`
- `BUDDY_SKILL_SIGNING_PRIVATE_KEY_PASSWORD`
- `BUDDY_RELEASE_TOKEN`
- `BUDDY_SKILLS_REPOSITORY_TOKEN`

The first two are intentionally separate from the desktop updater signing key.

## Build and publish

Build and locally verify the envelopes:

```bash
bun run skills:artifacts:build
```

Publish them:

```bash
bun run skills:artifacts:publish
```

The publish command also updates `buddy-hq/buddy-skills` from the final validated system pack. It
does not discover or copy the skill sources a second time. The public repository is advanced only
after the signed release artifacts have been uploaded and downloaded for verification. Its remote
files are then checked byte-for-byte against that same pack before publishing succeeds.

The same operation is available through the `publish-skill-artifacts` GitHub Actions workflow.

Catalog writes performed by `skill:curate` increment the catalog revision. The publisher refuses to replace an already-published catalog revision with different bytes.

System packs normally target the bundled fingerprint computed from the current checkout. To publish new content for an already-released app baseline, supply that app's fingerprint:

```bash
bun ./packages/buddy/script/publish-skill-artifacts.ts \
  --base-fingerprint <released-bundled-fingerprint> \
  --publish
```

When the requested fingerprint differs from the current checkout, the publisher requires an
existing signed pack for that baseline and verifies that registered skill names, runtime contract,
and presentation manifests still match. Unknown baselines and incompatible current checkouts are
rejected before signing or publishing.

The publisher automatically advances the system-pack revision when the content changed. An explicit higher revision can be supplied with `--system-revision`.

## Recovery

Revisions never move backward. To revert a bad system-skill update, restore the last good skill content and publish it as a new higher revision. Clients accept the higher revision even when its content intentionally matches an earlier release.

The bundled catalog and bundled system pack remain available offline. A cached remote revision newer than the bundled fallback is retained as the last-known-good artifact.
