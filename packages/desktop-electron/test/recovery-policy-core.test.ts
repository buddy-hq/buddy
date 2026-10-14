import { describe, expect, test } from "bun:test"
import { findRecoveryTarget, parseRecoveryPolicy } from "../src/main/recovery-policy-core"

const payload = JSON.stringify({ schema: 1, badVersions: [{ version: "1.0.0", targetVersion: "1.0.1" }] })

describe("recovery distribution eligibility", () => {
  for (const policyDistribution of ["prod", "beta"] as const) {
    for (const channel of ["dev", "prod", "beta"] as const) {
      test(`${channel} evaluates only a ${policyDistribution} policy verified for its distribution`, () => {
        const policy = parseRecoveryPolicy(payload, policyDistribution)
        const target = findRecoveryTarget({ policy, channel, currentVersion: "1.0.0", platform: "darwin" })
        expect(target?.targetVersion).toBe(channel === policyDistribution ? "1.0.1" : undefined)
        expect(JSON.parse(payload)).toEqual({ schema: 1, badVersions: [{ version: "1.0.0", targetVersion: "1.0.1" }] })
      })
    }
  }
})
