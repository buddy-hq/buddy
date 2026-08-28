import { describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import type { SkillSourceRef } from "../../src/learning/skill-management/service/catalog-schemas"
import {
  parseSkillCatalogDocument,
  type SkillCatalogEntry,
} from "../../src/learning/skill-management/service/library"
import type { CurationArgs } from "../../script/skill-curation"
import { buildCurationOutput, writeCatalogEntry } from "../../script/skill-curation"
import { temporaryDirectory, type TemporaryDirectory } from "../helpers/temporary-directory"

function sourceRef(): SkillSourceRef {
  return {
    type: "github",
    repo: "anthropics/skills",
    path: "skills/pptx",
    ref: "f458cee31a7577a47ba0c9a101976fa599385174",
  }
}

function baseArgs(overrides?: Partial<CurationArgs>): CurationArgs {
  return {
    repo: "anthropics/skills",
    sourcePath: "skills/pptx",
    ref: "f458cee31a7577a47ba0c9a101976fa599385174",
    categories: [],
    tags: [],
    policyVersion: 1,
    status: "approved",
    approvedWarningRuleIDs: [],
    approvedWarningRuleIDsProvided: false,
    approvedBlockRuleIDs: [],
    approvedBlockRuleIDsProvided: false,
    replaceExisting: false,
    write: false,
    ...overrides,
  }
}

function entryFixture(overrides?: Partial<SkillCatalogEntry>): SkillCatalogEntry {
  return {
    id: "anthropics-skills-pptx",
    displayName: "PowerPoint Presentation",
    summary: "Create PowerPoint presentations.",
    categories: ["documents"],
    tags: ["pptx"],
    source: sourceRef(),
    integrity: {
      algorithm: "tree-sha256-v1",
      sha256: "282238363dfc8f6d3bf72326976397182e87e93d10ade6e2f05bfbf931a5dc37",
      sizeBytes: 32,
      fileCount: 1,
    },
    review: {
      approvedAt: "2026-05-15T00:00:00.000Z",
      approvedBy: "Buddy maintainer",
      policyVersion: 1,
    },
    status: "approved",
    ...overrides,
  }
}

async function tempCatalogPath(prefix: string): Promise<TemporaryDirectory> {
  return temporaryDirectory({ prefix: `${prefix}-` })
}

describe("skill curation hardening", () => {
  test("refuses catalog writes for blocking scanner findings", () => {
    const output = buildCurationOutput({
      args: baseArgs({ write: true }),
      skill: {
        name: "pptx",
        description: "Create PowerPoint presentations.",
      },
      source: sourceRef(),
      stats: {
        fileCount: 1,
        totalBytes: 32,
      },
      scan: {
        scannerPolicyVersion: 1,
        decision: "block",
        findings: [
          {
            ruleId: "private-key",
            severity: "block",
            category: "secret",
            file: "SKILL.md",
            line: 1,
            message: "Private key material detected",
            evidence: "-----BEGIN PRIVATE KEY-----",
          },
        ],
        scannedFiles: 1,
        fileCount: 1,
        totalBytes: 32,
      },
      now: "2026-05-15T00:00:00.000Z",
    })

    expect(output.reviewGate.status).toBe("blocked_findings")
    expect(output.reviewGate.writeAllowed).toBe(false)
    expect(output.writePerformed).toBe(false)
  })

  test("requires explicit warning approval before a warned artifact can be written", () => {
    const output = buildCurationOutput({
      args: baseArgs({ write: true }),
      skill: {
        name: "pptx",
        description: "Create PowerPoint presentations.",
      },
      source: sourceRef(),
      stats: {
        fileCount: 1,
        totalBytes: 32,
      },
      scan: {
        scannerPolicyVersion: 1,
        decision: "warn",
        findings: [
          {
            ruleId: "network-fetch",
            severity: "warn",
            category: "network",
            file: "helper.sh",
            line: 1,
            message: "Network fetch detected",
            evidence: "curl https://example.com/data.json",
          },
        ],
        scannedFiles: 1,
        fileCount: 1,
        totalBytes: 32,
      },
      now: "2026-05-15T00:00:00.000Z",
    })

    expect(output.reviewGate.status).toBe("warnings_require_explicit_approval")
    expect(output.reviewGate.writeAllowed).toBe(false)
    expect(output.reviewGate.approvedWarningRuleIDs).toEqual([])
  })

  test("rejects stale or extra warning approvals", () => {
    const output = buildCurationOutput({
      args: baseArgs({
        write: true,
        approvedWarningRuleIDsProvided: true,
        approvedWarningRuleIDs: ["network-fetch", "executable-script"],
      }),
      skill: {
        name: "pptx",
        description: "Create PowerPoint presentations.",
      },
      source: sourceRef(),
      stats: {
        fileCount: 1,
        totalBytes: 32,
      },
      scan: {
        scannerPolicyVersion: 1,
        decision: "warn",
        findings: [
          {
            ruleId: "network-fetch",
            severity: "warn",
            category: "network",
            file: "helper.sh",
            line: 1,
            message: "Network fetch detected",
            evidence: "curl https://example.com/data.json",
          },
        ],
        scannedFiles: 1,
        fileCount: 1,
        totalBytes: 32,
      },
      now: "2026-05-15T00:00:00.000Z",
    })

    expect(output.reviewGate.status).toBe("warning_approval_mismatch")
    expect(output.reviewGate.writeAllowed).toBe(false)
    expect(output.reviewGate.unexpectedApprovedWarningRuleIDs).toEqual(["executable-script"])
  })

  test("accepts exact warning approvals and records only the approved set", () => {
    const output = buildCurationOutput({
      args: baseArgs({
        write: true,
        approvedBy: "Buddy maintainer",
        notes: "Expected helper script with reviewed network access.",
        approvedWarningRuleIDsProvided: true,
        approvedWarningRuleIDs: ["network-fetch", "executable-script"],
      }),
      skill: {
        name: "pptx",
        description: "Create PowerPoint presentations.",
      },
      source: sourceRef(),
      stats: {
        fileCount: 1,
        totalBytes: 32,
      },
      scan: {
        scannerPolicyVersion: 1,
        decision: "warn",
        findings: [
          {
            ruleId: "executable-script",
            severity: "warn",
            category: "structure",
            file: "helper.sh",
            line: 0,
            message: "Executable script present",
            evidence: "755",
          },
          {
            ruleId: "network-fetch",
            severity: "warn",
            category: "network",
            file: "helper.sh",
            line: 1,
            message: "Network fetch detected",
            evidence: "curl https://example.com/data.json",
          },
        ],
        scannedFiles: 1,
        fileCount: 1,
        totalBytes: 32,
      },
      now: "2026-05-15T00:00:00.000Z",
    })

    expect(output.reviewGate.status).toBe("approved")
    expect(output.reviewGate.writeAllowed).toBe(true)
    expect(output.entry.review.approvedWarningRuleIDs).toEqual([
      "executable-script",
      "network-fetch",
    ])
  })

  test("requires explicit replacement when overwriting an existing catalog entry", async () => {
    await using catalogRoot = await tempCatalogPath("buddy-skill-curation")
    const catalogPath = path.join(catalogRoot.path, "catalog.json")
    const iconSha256 = "c".repeat(64)
    await fsp.writeFile(
      catalogPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          revision: 1,
          entries: [
            entryFixture({
              icon: {
                filename: `buddy-skill-anthropics-skills-pptx-${iconSha256.slice(0, 16)}.webp`,
                sha256: iconSha256,
              },
            }),
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    )

    await expect(
      writeCatalogEntry({
        entry: entryFixture({
          summary: "Updated summary.",
        }),
        replaceExisting: false,
        catalogPath,
      }),
    ).rejects.toThrow("--replace-existing")

    await expect(
      writeCatalogEntry({
        entry: entryFixture({
          summary: "Updated summary.",
        }),
        replaceExisting: true,
        catalogPath,
      }),
    ).resolves.toBe("updated")

    const written = parseSkillCatalogDocument(JSON.parse(await fsp.readFile(catalogPath, "utf8")))
    expect(written.revision).toBe(2)
    expect(written.entries[0]?.summary).toBe("Updated summary.")
    expect(written.entries[0]?.icon?.sha256).toBe(iconSha256)
  })
})
