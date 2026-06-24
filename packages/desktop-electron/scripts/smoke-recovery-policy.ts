#!/usr/bin/env bun

import {
  findRecoveryTarget,
  parseRecoveryPolicy,
  validateRecoveryTarget,
} from "../src/main/recovery-policy-core"

const BROKEN_VERSION = "0.0.38"
const RECOVERY_VERSION = "0.0.39"
const PREVIOUS_VERSION = "0.0.37"

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const policy = parseRecoveryPolicy(
  JSON.stringify({
    schema: 1,
    badVersions: [
      {
        version: BROKEN_VERSION,
        targetVersion: RECOVERY_VERSION,
        mode: "roll-forward",
        platforms: ["darwin", "win32"],
        blockVersion: true,
        reason: "backend utility startup failure",
      },
    ],
  }),
)

const target = findRecoveryTarget({
  channel: "prod",
  currentVersion: BROKEN_VERSION,
  platform: "darwin",
  policy,
})

if (!target) {
  throw new Error("Recovery policy did not select target version")
}
assert(target.targetVersion === RECOVERY_VERSION, "Recovery policy selected wrong target version")
assert(
  validateRecoveryTarget(target, BROKEN_VERSION) === undefined,
  "Recovery target should be valid",
)

const devTarget = findRecoveryTarget({
  channel: "dev",
  currentVersion: BROKEN_VERSION,
  platform: "darwin",
  policy,
})
assert(devTarget === undefined, "Recovery policy should not apply to dev channel")

const unsafeDowngrade = parseRecoveryPolicy(
  JSON.stringify({
    schema: 1,
    badVersions: [
      {
        version: BROKEN_VERSION,
        targetVersion: PREVIOUS_VERSION,
        mode: "downgrade",
        platforms: ["darwin"],
      },
    ],
  }),
)
const unsafeDowngradeTarget = findRecoveryTarget({
  channel: "prod",
  currentVersion: BROKEN_VERSION,
  platform: "darwin",
  policy: unsafeDowngrade,
})

if (!unsafeDowngradeTarget) {
  throw new Error("Unsafe downgrade target should be parsed")
}
assert(
  validateRecoveryTarget(unsafeDowngradeTarget, BROKEN_VERSION) ===
    "Recovery policy requested a downgrade without rollbackSafe=true",
  "Unsafe downgrade should be rejected",
)

console.log(
  `Recovery policy smoke passed: ${BROKEN_VERSION} selects ${RECOVERY_VERSION} and rejects unsafe downgrade`,
)
