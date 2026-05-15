import { describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  parseGitleaksOutput,
  parseGrypeOutput,
  parseOsvScannerOutput,
  parseSemgrepOutput,
  runSkillAudit,
} from "../../script/skill-audit"

async function tempSkillRoot(prefix: string): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), `${prefix}-`))
  await writeFile(
    root,
    "SKILL.md",
    `---
name: audit-skill
description: A test skill for audit checks.
---

Use this skill for audit testing.
`,
  )
  return root
}

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  const filepath = path.join(root, ...relativePath.split("/"))
  await fsp.mkdir(path.dirname(filepath), { recursive: true })
  await fsp.writeFile(filepath, content, "utf8")
}

function createCommandRunner() {
  return (command: string, args: string[]) => {
    const fullCommand = [command, ...args].join(" ")

    if (fullCommand === "gitleaks version") {
      return { status: 0, stdout: "8.30.1\n", stderr: "" }
    }
    if (fullCommand.includes("gitleaks dir")) {
      return { status: 0, stdout: "[]", stderr: "" }
    }
    if (fullCommand === "osv-scanner --version") {
      return { status: 0, stdout: "2.2.0\n", stderr: "" }
    }
    if (fullCommand.includes("osv-scanner scan source --format json")) {
      return {
        status: 0,
        stdout: JSON.stringify({ results: [] }),
        stderr: "",
      }
    }
    if (fullCommand === "grype version") {
      return { status: 0, stdout: "0.112.0\n", stderr: "" }
    }
    if (fullCommand.includes(" -o json")) {
      return {
        status: 0,
        stdout: JSON.stringify({ matches: [] }),
        stderr: "",
      }
    }

    return {
      status: 1,
      stdout: "",
      stderr: `unexpected command: ${fullCommand}`,
      error: "unexpected command",
    }
  }
}

describe("skill audit parsers", () => {
  test("parses gitleaks JSON findings", () => {
    expect(parseGitleaksOutput("[]", "", 0)).toMatchObject({
      findingCount: 0,
      status: "pass",
    })
    expect(
      parseGitleaksOutput(
        JSON.stringify([
          {
            RuleID: "generic-api-key",
          },
        ]),
        "",
        1,
      ),
    ).toMatchObject({
      findingCount: 1,
      status: "warn",
    })
  })

  test("parses osv-scanner JSON findings", () => {
    expect(parseOsvScannerOutput(JSON.stringify({ results: [] }), "")).toMatchObject({
      findingCount: 0,
      status: "pass",
    })
    expect(
      parseOsvScannerOutput(
        JSON.stringify({
          results: [
            {
              packages: [
                {
                  vulnerabilities: [{ id: "OSV-1" }, { id: "OSV-2" }],
                },
              ],
            },
          ],
        }),
        "",
      ),
    ).toMatchObject({
      findingCount: 2,
      status: "warn",
    })
  })

  test("parses grype and semgrep JSON findings", () => {
    expect(parseGrypeOutput(JSON.stringify({ matches: [] }), "")).toMatchObject({
      findingCount: 0,
      status: "pass",
    })
    expect(
      parseSemgrepOutput(
        JSON.stringify({
          results: [{ check_id: "buddy.no-download-exec" }],
        }),
        "",
      ),
    ).toMatchObject({
      findingCount: 1,
      status: "warn",
    })
  })
})

describe("skill audit workflow", () => {
  test("audits a local skill root, normalizes tool evidence, and writes a review pack", async () => {
    const root = await tempSkillRoot("buddy-skill-audit")
    const outputRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "buddy-skill-audit-pack-"))
    await writeFile(
      root,
      "package.json",
      JSON.stringify({
        name: "audit-skill",
        version: "1.0.0",
      }),
    )

    const report = await runSkillAudit(
      {
        skillRoot: root,
        outputDir: outputRoot,
        skipTools: [],
        runtimeReviewStatus: "pass",
        runtimeReviewNote: "Ran in a temp workspace; only wrote expected outputs.",
        fitReviewStatus: "pass",
        fitReviewNote: "Low setup friction and useful output for learners.",
      },
      {
        runCommand: createCommandRunner(),
        now: () => "2026-05-15T00:00:00.000Z",
      },
    )

    expect(report.schemaVersion).toBe(1)
    expect(report.target.kind).toBe("local")
    expect(report.target.skillName).toBe("audit-skill")
    expect(report.target.dependencyManifests).toContain("package.json")
    expect(report.checks.find((check) => check.id === "gitleaks-secrets")?.status).toBe("pass")
    expect(report.checks.find((check) => check.id === "osv-known-vulnerabilities")?.status).toBe(
      "pass",
    )
    expect(report.checks.find((check) => check.id === "grype-vulnerabilities")?.status).toBe("pass")
    expect(report.checks.find((check) => check.id === "semgrep-policy")?.status).toBe("warn")
    expect(report.overallStatus).toBe("warn")
    expect(report.artifacts?.directory.startsWith(outputRoot)).toBe(true)
    expect(report.artifacts?.reviewMarkdownPath.endsWith("review.md")).toBe(true)
    expect(report.artifacts?.reportJsonPath.endsWith("audit.json")).toBe(true)
    expect(report.artifacts?.skillSnapshotPath.endsWith("/skill")).toBe(true)

    const [reviewMarkdown, persistedJson, snapshotSkill] = await Promise.all([
      fsp.readFile(report.artifacts?.reviewMarkdownPath ?? "", "utf8"),
      fsp.readFile(report.artifacts?.reportJsonPath ?? "", "utf8"),
      fsp.readFile(path.join(report.artifacts?.skillSnapshotPath ?? "", "SKILL.md"), "utf8"),
    ])

    expect(reviewMarkdown).toContain("# Skill Review Pack: audit-skill")
    expect(reviewMarkdown).toContain("## Reviewer Brief")
    expect(reviewMarkdown).toContain("Local skill snapshot:")
    expect(reviewMarkdown).toContain("## Full Audit JSON")
    expect(persistedJson).toContain('"artifacts"')
    expect(snapshotSkill).toContain("name: audit-skill")
  })
})
